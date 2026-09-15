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

  const submit = (payload: Record<string, unknown>, slug = "chesare-test") =>
    app.inject({ method: "POST", url: `/api/public/locations/${slug}/orders`, payload });

  const customer = { name: "Ana", phone: "272 260 3537", address: "Calle 5 #12" };

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
      const response = await submit({
        fulfillmentType: "DELIVERY",
        customer,
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
      expect(order.customerPhone).toBe("272 260 3537");
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
        customer,
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
        customer,
        items: [{ menuItemId: fixture.pizzaId, sizeSlug: "grande", styleSlug: "rellena", quantity: 1 }]
      });

      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe("PRICE_UNAVAILABLE");
      expect(await prisma.order.count()).toBe(before);
    });

    it("refuses an item whose flat price is null", async () => {
      const response = await submit({
        customer,
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
      const empty = await submit({ customer, items: [] });
      expect(empty.statusCode).toBe(400);

      const huge = await submit({
        customer,
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
        customer,
        items: [{ itemSlug: "refresco", categorySlug: "bebidas", quantity: 999 }]
      });
      expect(quantity.statusCode).toBe(400);

      const note = await submit({
        customer: { ...customer, note: "x".repeat(501) },
        items: [{ itemSlug: "refresco", categorySlug: "bebidas", quantity: 1 }]
      });
      expect(note.statusCode).toBe(400);
    });

    it("refuses an item from another location", async () => {
      const response = await submit(
        { customer, items: [{ menuItemId: fixture.refrescoId, quantity: 1 }] },
        "otra-test"
      );
      expect(response.statusCode).toBe(400);
    });

    it("applies a valid promotion code and rejects an unknown one", async () => {
      const discounted = await submit({
        customer,
        promotionCode: "DIEZ",
        items: [{ menuItemId: fixture.pizzaId, sizeSlug: "grande", styleSlug: "tradicional", quantity: 2 }]
      });

      expect(discounted.statusCode).toBe(201);
      expect(discounted.json().order.subtotal).toBe(360);
      expect(discounted.json().order.discountTotal).toBe(36);
      expect(discounted.json().order.total).toBe(324);
      expect(discounted.json().order.promotionId).toBe(fixture.promotionId);

      const unknown = await submit({
        customer,
        promotionCode: "NOPE",
        items: [{ itemSlug: "refresco", categorySlug: "bebidas", quantity: 1 }]
      });
      expect(unknown.statusCode).toBe(422);
    });

    it("reuses one customer record per phone number", async () => {
      const phone = "2721111111";
      await submit({
        customer: { name: "Beto", phone },
        items: [{ itemSlug: "refresco", categorySlug: "bebidas", quantity: 1 }]
      });
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
      const first = await submit({
        customer,
        items: [{ itemSlug: "refresco", categorySlug: "bebidas", quantity: 1 }]
      });
      const second = await submit({
        customer,
        items: [{ itemSlug: "refresco", categorySlug: "bebidas", quantity: 1 }]
      });

      expect(second.json().order.orderNumber).toBeGreaterThan(first.json().order.orderNumber);
    });

    it("refuses an item the shop has switched off", async () => {
      await prisma.menuItem.update({ where: { id: fixture.refrescoId }, data: { available: false } });
      const response = await submit({
        customer,
        items: [{ itemSlug: "refresco", categorySlug: "bebidas", quantity: 1 }]
      });
      await prisma.menuItem.update({ where: { id: fixture.refrescoId }, data: { available: true } });

      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe("ITEM_UNORDERABLE");
    });
  });
});
