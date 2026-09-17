import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { disconnectPrisma, prisma } from "../src/db/prisma.js";
import { type Fixture, databaseReady, login, resetDatabase, seedFixture } from "./helpers/db.js";

/**
 * Orders are the one admin area a STAFF session may reach, so this suite checks
 * both halves of that: that STAFF really can work the queue, and that location
 * scoping still applies to them exactly as it does to an owner.
 */
describe.skipIf(!databaseReady)("admin orders", () => {
  let app: FastifyInstance;
  let fixture: Fixture;
  let ownerA: string;
  let ownerB: string;
  let staffA: string;
  let orderIds: string[] = [];

  const customer = { name: "Ana Robles", phone: "272 260 3537", address: "Calle 5 #12" };

  async function submitOrder(
    who: { name: string; phone: string; address: string },
    overrides: Record<string, unknown> = {}
  ): Promise<string> {
    const response = await app.inject({
      method: "POST",
      url: `/api/public/locations/${fixture.locationA.slug}/orders`,
      payload: {
        fulfillmentType: "DELIVERY",
        customer: who,
        items: [
          {
            menuItemId: fixture.pizzaId,
            sizeOptionId: fixture.sizeGrandeId,
            styleOptionId: fixture.styleTradicionalId,
            quantity: 2
          },
          { menuItemId: fixture.refrescoId, quantity: 1 }
        ],
        ...overrides
      }
    });
    expect(response.statusCode).toBe(201);
    return response.json().order.id;
  }

  beforeAll(async () => {
    await resetDatabase();
    fixture = await seedFixture();
    app = await buildApp();
    ownerA = await login(app, "owner@a.test");
    ownerB = await login(app, "owner@b.test");
    staffA = await login(app, "staff@a.test");

    // Three different customers, not three orders on one: the one-open-order-
    // per-customer constraint (docs/order-abuse-prevention.md) means a single
    // customer can't hold 3 concurrently-open orders any more. The listing
    // tests below only need 3 orders to exist at this location; "filters by
    // customer" is the one that cares which customer each belongs to.
    orderIds = [
      await submitOrder(customer),
      await submitOrder({ name: "Beto Ruiz", phone: "2722603538", address: "Calle 6 #1" }),
      await submitOrder({ name: "Cami Soto", phone: "2722603539", address: "Calle 7 #2" })
    ];
  });

  afterAll(async () => {
    await app.close();
    await disconnectPrisma();
  });

  const get = (url: string, cookie: string) => app.inject({ method: "GET", url, headers: { cookie } });
  const patchStatus = (id: string, status: string, cookie: string) =>
    app.inject({
      method: "PATCH",
      url: `/api/admin/orders/${id}/status`,
      headers: { cookie },
      payload: { status }
    });

  describe("listing", () => {
    it("returns the location's orders, newest first, with items and JSON-number money", async () => {
      const response = await get(`/api/admin/locations/${fixture.locationA.id}/orders`, ownerA);
      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.orders).toHaveLength(3);
      expect(body.pagination).toMatchObject({ page: 1, total: 3, pageCount: 1 });

      const [newest] = body.orders;
      expect(typeof newest.total).toBe("number");
      expect(newest.total).toBe(390);
      expect(newest.items).toHaveLength(2);
      expect(newest.items[0].unitPrice).toBe(180);
      expect(typeof newest.orderNumber).toBe("number");

      const numbers = body.orders.map((order: { orderNumber: number }) => order.orderNumber);
      expect(numbers).toEqual([...numbers].sort((a: number, b: number) => b - a));
    });

    it("lets a STAFF session read the same queue", async () => {
      const response = await get(`/api/admin/locations/${fixture.locationA.id}/orders`, staffA);
      expect(response.statusCode).toBe(200);
      expect(response.json().orders).toHaveLength(3);
    });

    it("filters by status", async () => {
      const all = await get(`/api/admin/locations/${fixture.locationA.id}/orders?status=PENDING`, ownerA);
      expect(all.json().orders).toHaveLength(3);

      const none = await get(`/api/admin/locations/${fixture.locationA.id}/orders?status=COMPLETED`, ownerA);
      expect(none.json().orders).toHaveLength(0);
    });

    it("filters by customer", async () => {
      const customerRow = await prisma.customer.findFirstOrThrow({
        where: { locationId: fixture.locationA.id, phone: "2722603537" }
      });
      const mine = await get(
        `/api/admin/locations/${fixture.locationA.id}/orders?customerId=${customerRow.id}`,
        ownerA
      );
      expect(mine.json().orders).toHaveLength(1);

      const other = await get(
        `/api/admin/locations/${fixture.locationA.id}/orders?customerId=no-such-customer`,
        ownerA
      );
      expect(other.json().orders).toHaveLength(0);
    });

    it("excludes orders placed outside the date range", async () => {
      const future = await get(
        `/api/admin/locations/${fixture.locationA.id}/orders?from=2099-01-01`,
        ownerA
      );
      expect(future.json().orders).toHaveLength(0);

      // A bare `to` of today must still include orders placed today — the
      // inclusive end-of-day rule, which is easy to get wrong by one day.
      const today = new Date().toISOString().slice(0, 10);
      const included = await get(
        `/api/admin/locations/${fixture.locationA.id}/orders?from=${today}&to=${today}`,
        ownerA
      );
      expect(included.json().orders).toHaveLength(3);
    });

    it("paginates", async () => {
      const first = await get(`/api/admin/locations/${fixture.locationA.id}/orders?pageSize=2`, ownerA);
      expect(first.json().orders).toHaveLength(2);
      expect(first.json().pagination).toMatchObject({ page: 1, pageSize: 2, total: 3, pageCount: 2 });

      const second = await get(
        `/api/admin/locations/${fixture.locationA.id}/orders?pageSize=2&page=2`,
        ownerA
      );
      expect(second.json().orders).toHaveLength(1);
    });

    it("refuses another location's orders", async () => {
      const response = await get(`/api/admin/locations/${fixture.locationA.id}/orders`, ownerB);
      expect(response.statusCode).toBe(403);
    });
  });

  describe("detail", () => {
    it("returns one order with its line items", async () => {
      const response = await get(`/api/admin/orders/${orderIds[0]}`, ownerA);
      expect(response.statusCode).toBe(200);
      expect(response.json().order.id).toBe(orderIds[0]);
      expect(response.json().order.items).toHaveLength(2);
      expect(response.json().order.customerPhone).toBe(customer.phone);
    });

    it("lets STAFF open an order they have to cook", async () => {
      const response = await get(`/api/admin/orders/${orderIds[0]}`, staffA);
      expect(response.statusCode).toBe(200);
    });

    it("refuses an order id belonging to another location", async () => {
      const response = await get(`/api/admin/orders/${orderIds[0]}`, ownerB);
      expect(response.statusCode).toBe(403);
    });

    it("404s an id that does not exist at all", async () => {
      const response = await get("/api/admin/orders/no-such-order", ownerA);
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("NOT_FOUND");
    });
  });

  describe("status changes", () => {
    it("walks an order through the kitchen", async () => {
      const id = orderIds[0];
      for (const status of ["CONFIRMED", "PREPARING", "READY", "COMPLETED"]) {
        const response = await patchStatus(id, status, staffA);
        expect.soft(response.statusCode, status).toBe(200);
        expect.soft(response.json().order.status, status).toBe(status);
      }

      const finished = await get(`/api/admin/orders/${id}`, ownerA);
      expect(finished.json().order.status).toBe("COMPLETED");
    });

    it("refuses to walk a completed order backwards", async () => {
      const response = await patchStatus(orderIds[0], "PENDING", ownerA);
      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe("CONFLICT");
      expect(response.json().error.details.currentStatus).toBe("COMPLETED");
    });

    it("refuses to re-cancel or revive a cancelled order", async () => {
      const cancelled = await patchStatus(orderIds[1], "CANCELLED", ownerA);
      expect(cancelled.statusCode).toBe(200);

      const again = await patchStatus(orderIds[1], "CANCELLED", ownerA);
      expect(again.statusCode).toBe(409);

      const revived = await patchStatus(orderIds[1], "PREPARING", ownerA);
      expect(revived.statusCode).toBe(409);
    });

    it("rejects a status that is not in the enum", async () => {
      const response = await patchStatus(orderIds[2], "ENTREGADO", ownerA);
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("refuses a status change from another location's owner", async () => {
      const response = await patchStatus(orderIds[2], "CONFIRMED", ownerB);
      expect(response.statusCode).toBe(403);

      const untouched = await prisma.order.findUniqueOrThrow({ where: { id: orderIds[2] } });
      expect(untouched.status).toBe("PENDING");
    });
  });
});
