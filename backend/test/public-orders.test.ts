import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { disconnectPrisma, prisma } from "../src/db/prisma.js";
import { type Fixture, databaseReady, resetDatabase, seedFixture } from "./helpers/db.js";

describe.skipIf(!databaseReady)("public API", () => {
  let app: FastifyInstance;
  let fixture: Fixture;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await seedFixture();
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await disconnectPrisma();
  });

  const submit = (payload: Record<string, unknown>, slug = "chesare-test", remoteAddress?: string) =>
    app.inject({ method: "POST", url: `/api/public/locations/${slug}/orders`, payload, remoteAddress });

  // Every test below gets its own phone number: the new one-open-order-per-
  // customer constraint (see docs/order-abuse-prevention.md) means two
  // successful submits for the *same* phone would otherwise collide across
  // unrelated tests. Tests that specifically exercise same-phone reuse build
  // their own customer object and complete the prior order first.
  let phoneSeq = 0;
  function freshCustomer(overrides: Partial<{ name: string; phone: string; address: string }> = {}) {
    phoneSeq += 1;
    return { name: "Ana", phone: `27210${String(phoneSeq).padStart(5, "0")}`, address: "Calle 5 #12", ...overrides };
  }

  describe("menu and hours", () => {
    it("serves the menu with matrix cells and null prices intact", async () => {
      const response = await app.inject({ method: "GET", url: "/api/public/locations/chesare-test/menu" });
      expect(response.statusCode).toBe(200);

      const pizzas = response.json().categories.find((category: { slug: string }) => category.slug === "pizzas");
      const pizza = pizzas.items[0];
      expect(pizza.itemType).toBe("SIZE_STYLE_MATRIX");
      expect(pizza.priceCells).toHaveLength(4);
      expect(pizza.priceCells.filter((cell: { price: number | null }) => cell.price === null)).toHaveLength(2);

      const bebidas = response.json().categories.find((category: { slug: string }) => category.slug === "bebidas");
      const agua = bebidas.items.find((item: { slug: string }) => item.slug === "agua");
      expect(agua.flatPrice).toBeNull();
    });

    it("serves the week's hours in the shop's own timezone", async () => {
      const response = await app.inject({ method: "GET", url: "/api/public/locations/chesare-test/hours" });
      expect(response.statusCode).toBe(200);
      expect(response.json().timezone).toBe("America/Mexico_City");
      expect(response.json().days).toHaveLength(7);
      expect(response.json().days[1].opensAt).toBeNull();
    });

    it("hides a location that does not exist", async () => {
      const response = await app.inject({ method: "GET", url: "/api/public/locations/no-such-shop/menu" });
      expect(response.statusCode).toBe(404);
    });
  });

  describe("order submit", () => {
    it("prices the order from the database and returns a confirmation", async () => {
      const cust = freshCustomer();
      const response = await submit({
        fulfillmentType: "DELIVERY",
        customer: cust,
        items: [
          { menuItemId: fixture.pizzaId, sizeSlug: "grande", styleSlug: "tradicional", quantity: 2 },
          { itemSlug: "refresco", categorySlug: "bebidas", quantity: 1 }
        ]
      });

      expect(response.statusCode).toBe(201);
      const order = response.json().order;

      expect(typeof order.orderNumber).toBe("number");
      expect(order.orderNumber).toBeGreaterThan(0);
      expect(order.subtotal).toBe(390);
      expect(order.discountTotal).toBe(0);
      expect(order.total).toBe(390);
      expect(order.fulfillmentType).toBe("DELIVERY");
      expect(order.status).toBe("PENDING");
      expect(order.customerPhone).toBe(cust.phone);
      expect(order.items).toHaveLength(2);

      const pizzaLine = order.items.find((line: { name: string }) => line.name === "Al pastor");
      expect(pizzaLine.unitPrice).toBe(180);
      expect(pizzaLine.quantity).toBe(2);
      expect(pizzaLine.lineTotal).toBe(360);
      expect(pizzaLine.size).toBe("Grande");
      expect(pizzaLine.style).toBe("Tradicional");

      const stored = await prisma.order.findUnique({ where: { id: order.id }, include: { items: true } });
      expect(stored?.items).toHaveLength(2);
      expect(stored?.total.toFixed(2)).toBe("390.00");
    });

    it("ignores any price the client tries to send", async () => {
      const response = await submit({
        customer: freshCustomer(),
        items: [
          {
            itemSlug: "refresco",
            categorySlug: "bebidas",
            quantity: 1,
            unitPrice: 1,
            price: 1,
            lineTotal: 1
          }
        ]
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().order.total).toBe(30);
    });

    it("refuses a line whose matrix cell has no price", async () => {
      const before = await prisma.order.count();
      const response = await submit({
        customer: freshCustomer(),
        items: [{ menuItemId: fixture.pizzaId, sizeSlug: "grande", styleSlug: "rellena", quantity: 1 }]
      });

      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe("PRICE_UNAVAILABLE");
      expect(await prisma.order.count()).toBe(before);
    });

    it("refuses an item whose flat price is null", async () => {
      const response = await submit({
        customer: freshCustomer(),
        items: [{ menuItemId: fixture.aguaId, quantity: 1 }]
      });

      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe("PRICE_UNAVAILABLE");
    });

    it("requires a phone number", async () => {
      const response = await submit({
        customer: { name: "Ana", address: "Calle 5 #12" },
        items: [{ itemSlug: "refresco", categorySlug: "bebidas", quantity: 1 }]
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("rejects an empty cart and an oversized one", async () => {
      const empty = await submit({ customer: freshCustomer(), items: [] });
      expect(empty.statusCode).toBe(400);

      const huge = await submit({
        customer: freshCustomer(),
        items: Array.from({ length: 41 }, () => ({
          itemSlug: "refresco",
          categorySlug: "bebidas",
          quantity: 1
        }))
      });
      expect(huge.statusCode).toBe(400);
    });

    it("rejects an absurd quantity and an overlong note", async () => {
      const quantity = await submit({
        customer: freshCustomer(),
        items: [{ itemSlug: "refresco", categorySlug: "bebidas", quantity: 999 }]
      });
      expect(quantity.statusCode).toBe(400);

      const note = await submit({
        customer: { ...freshCustomer(), note: "x".repeat(501) },
        items: [{ itemSlug: "refresco", categorySlug: "bebidas", quantity: 1 }]
      });
      expect(note.statusCode).toBe(400);
    });

    it("refuses an item from another location", async () => {
      const response = await submit(
        { customer: freshCustomer(), items: [{ menuItemId: fixture.refrescoId, quantity: 1 }] },
        "otra-test"
      );
      expect(response.statusCode).toBe(400);
    });

    it("applies a valid promotion code and rejects an unknown one", async () => {
      const discounted = await submit({
        customer: freshCustomer(),
        promotionCode: "DIEZ",
        items: [{ menuItemId: fixture.pizzaId, sizeSlug: "grande", styleSlug: "tradicional", quantity: 2 }]
      });

      expect(discounted.statusCode).toBe(201);
      expect(discounted.json().order.subtotal).toBe(360);
      expect(discounted.json().order.discountTotal).toBe(36);
      expect(discounted.json().order.total).toBe(324);
      expect(discounted.json().order.promotionId).toBe(fixture.promotionId);

      const unknown = await submit({
        customer: freshCustomer(),
        promotionCode: "NOPE",
        items: [{ itemSlug: "refresco", categorySlug: "bebidas", quantity: 1 }]
      });
      expect(unknown.statusCode).toBe(422);
    });

    it("reuses one customer record per phone number", async () => {
      const phone = "2721111111";
      const first = await submit({
        customer: { name: "Beto", phone },
        items: [{ itemSlug: "refresco", categorySlug: "bebidas", quantity: 1 }]
      });
      // The one-open-order-per-customer constraint would otherwise refuse this
      // second submit outright -- completing the first is what frees the slot.
      await prisma.order.update({ where: { id: first.json().order.id }, data: { status: "COMPLETED" } });
      await submit({
        customer: { name: "Beto", phone: `(272) 111-1111` },
        items: [{ itemSlug: "refresco", categorySlug: "bebidas", quantity: 1 }]
      });

      const customers = await prisma.customer.findMany({
        where: { locationId: fixture.locationA.id, phone }
      });
      expect(customers).toHaveLength(1);
      expect(customers[0].orderCount).toBe(2);
      expect(customers[0].totalSpent.toFixed(2)).toBe("60.00");
    });

    it("gives consecutive orders different numbers", async () => {
      const cust = freshCustomer();
      const first = await submit({
        customer: cust,
        items: [{ itemSlug: "refresco", categorySlug: "bebidas", quantity: 1 }]
      });
      await prisma.order.update({ where: { id: first.json().order.id }, data: { status: "COMPLETED" } });
      const second = await submit({
        customer: cust,
        items: [{ itemSlug: "refresco", categorySlug: "bebidas", quantity: 1 }]
      });

      expect(second.json().order.orderNumber).toBeGreaterThan(first.json().order.orderNumber);
    });

    it("refuses an item the shop has switched off", async () => {
      await prisma.menuItem.update({ where: { id: fixture.refrescoId }, data: { available: false } });
      const response = await submit({
        customer: freshCustomer(),
        items: [{ itemSlug: "refresco", categorySlug: "bebidas", quantity: 1 }]
      });
      await prisma.menuItem.update({ where: { id: fixture.refrescoId }, data: { available: true } });

      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe("ITEM_UNORDERABLE");
    });
  });

  describe("one open order per phone", () => {
    // Its own fake source IP: publicOrderRateLimit's 20-per-10-minutes cap is
    // shared per IP across every submit() call in this file, and this block's
    // handful of legitimate repeat submits would otherwise eat into the
    // "order submit" describe's budget above (and vice versa).
    const submitAsNewIp = (() => {
      let n = 0;
      return (payload: Record<string, unknown>) => {
        n += 1;
        return submit(payload, "chesare-test", `10.10.${Math.floor(n / 255)}.${n % 255}`);
      };
    })();

    it("refuses a second order while the first is still open", async () => {
      const cust = freshCustomer();
      const first = await submitAsNewIp({
        customer: cust,
        items: [{ itemSlug: "refresco", categorySlug: "bebidas", quantity: 1 }]
      });
      expect(first.statusCode).toBe(201);

      const second = await submitAsNewIp({
        customer: cust,
        items: [{ itemSlug: "refresco", categorySlug: "bebidas", quantity: 1 }]
      });
      expect(second.statusCode).toBe(409);
      expect(second.json().error.code).toBe("CONFLICT");

      expect(await prisma.order.count({ where: { customerId: first.json().order.customerId } })).toBe(1);
    });

    it("blocks a repeat order regardless of how the phone is formatted", async () => {
      const cust = freshCustomer();
      await submitAsNewIp({ customer: cust, items: [{ itemSlug: "refresco", categorySlug: "bebidas", quantity: 1 }] });

      const differentlyFormatted = await submitAsNewIp({
        customer: { ...cust, phone: `(${cust.phone.slice(0, 3)}) ${cust.phone.slice(3)}` },
        items: [{ itemSlug: "refresco", categorySlug: "bebidas", quantity: 1 }]
      });
      expect(differentlyFormatted.statusCode).toBe(409);
    });

    it("allows a new order once the previous one is completed", async () => {
      const cust = freshCustomer();
      const first = await submitAsNewIp({
        customer: cust,
        items: [{ itemSlug: "refresco", categorySlug: "bebidas", quantity: 1 }]
      });
      await prisma.order.update({ where: { id: first.json().order.id }, data: { status: "COMPLETED" } });

      const second = await submitAsNewIp({
        customer: cust,
        items: [{ itemSlug: "refresco", categorySlug: "bebidas", quantity: 1 }]
      });
      expect(second.statusCode).toBe(201);
    });

    it("allows a new order once the previous one is cancelled", async () => {
      const cust = freshCustomer();
      const first = await submitAsNewIp({
        customer: cust,
        items: [{ itemSlug: "refresco", categorySlug: "bebidas", quantity: 1 }]
      });
      await prisma.order.update({ where: { id: first.json().order.id }, data: { status: "CANCELLED" } });

      const second = await submitAsNewIp({
        customer: cust,
        items: [{ itemSlug: "refresco", categorySlug: "bebidas", quantity: 1 }]
      });
      expect(second.statusCode).toBe(201);
    });

    // Exercises the DB constraint directly rather than through submit(): the
    // fixture's second location has no menu of its own, so this can't go
    // through a real order-submit call. The constraint is on Order.customerId,
    // and Customer is already scoped by (locationId, phone), so the same
    // phone digits at two locations are two different customers -- each gets
    // its own open-order slot.
    it("scopes the open-order limit per customer, so the same phone at another location is unaffected", async () => {
      const phone = "2721119999";
      const customerA = await prisma.customer.create({ data: { locationId: fixture.locationA.id, phone } });
      const customerB = await prisma.customer.create({ data: { locationId: fixture.locationB.id, phone } });

      await prisma.order.create({
        data: {
          locationId: fixture.locationA.id,
          customerId: customerA.id,
          customerPhone: phone,
          subtotal: 30,
          total: 30
        }
      });
      await expect(
        prisma.order.create({
          data: {
            locationId: fixture.locationB.id,
            customerId: customerB.id,
            customerPhone: phone,
            subtotal: 30,
            total: 30
          }
        })
      ).resolves.toBeTruthy();
    });
  });

  describe("order tracking", () => {
    // Seeded straight through Prisma rather than via submit(): submit is behind
    // its own 20-per-10-minutes rate limit, shared across this whole test file,
    // and tracking should be exercised independently of that budget.
    let orderNumber: number;
    let otherLocationOrderNumber: number;

    beforeAll(async () => {
      const cami = await prisma.customer.create({
        data: { locationId: fixture.locationA.id, phone: "2725550100", name: "Cami" }
      });
      const order = await prisma.order.create({
        data: {
          locationId: fixture.locationA.id,
          customerId: cami.id,
          customerName: "Cami",
          customerPhone: "272 555 0100",
          subtotal: 30,
          total: 30,
          items: { create: [{ nameSnapshot: "Refresco", unitPrice: 30, quantity: 1, lineTotal: 30 }] }
        }
      });
      orderNumber = order.orderNumber;

      const feInOtherLocation = await prisma.customer.create({
        data: { locationId: fixture.locationB.id, phone: "2725550103", name: "Fer" }
      });
      const otherOrder = await prisma.order.create({
        data: {
          locationId: fixture.locationB.id,
          customerId: feInOtherLocation.id,
          customerName: "Fer",
          customerPhone: "272 555 0103",
          subtotal: 30,
          total: 30
        }
      });
      otherLocationOrderNumber = otherOrder.orderNumber;
    });

    const track = (phone: string, orderNum: number | string, slug = "chesare-test") =>
      app.inject({
        method: "GET",
        url: `/api/public/locations/${slug}/orders/track?phone=${encodeURIComponent(String(phone))}&orderNumber=${orderNum}`
      });

    it("finds an order by its phone number and order number", async () => {
      const response = await track("272 555 0100", orderNumber);
      expect(response.statusCode).toBe(200);
      const order = response.json().order;
      expect(order.orderNumber).toBe(orderNumber);
      expect(order.status).toBe("PENDING");
      expect(order.customerName).toBe("Cami");
      expect(order.total).toBe(30);
      expect(order.items).toEqual([
        { name: "Refresco", size: null, style: null, option: null, quantity: 1 }
      ]);
      // Narrower than the authenticated order shape: no address, phone, note, ids.
      expect(order).not.toHaveProperty("customerAddress");
      expect(order).not.toHaveProperty("customerPhone");
      expect(order).not.toHaveProperty("id");
      expect(response.json().location.slug).toBe("chesare-test");
    });

    it("matches on a differently formatted phone number, same as submit", async () => {
      const response = await track("(272) 555-0100", orderNumber);
      expect(response.statusCode).toBe(200);
    });

    it("returns one generic not-found for a wrong phone, wrong order number, or mismatched pair", async () => {
      const wrongPhone = await track("272 555 9999", orderNumber);
      const wrongNumber = await track("272 555 0100", orderNumber + 999999);
      const mismatched = await track("272 555 0103", orderNumber);

      for (const response of [wrongPhone, wrongNumber, mismatched]) {
        expect(response.statusCode).toBe(404);
        expect(response.json().error.code).toBe("NOT_FOUND");
      }
    });

    it("does not find another location's order", async () => {
      const response = await track("272 555 0103", otherLocationOrderNumber, "otra-test");
      expect(response.statusCode).toBe(200);

      const wrongLocation = await track("272 555 0103", otherLocationOrderNumber, "chesare-test");
      expect(wrongLocation.statusCode).toBe(404);
    });

    it("rejects a malformed phone or order number before hitting the database", async () => {
      const badPhone = await track("abc", 1);
      expect(badPhone.statusCode).toBe(400);

      const badNumber = await track("272 555 0100", "not-a-number");
      expect(badNumber.statusCode).toBe(400);
    });
  });
});
