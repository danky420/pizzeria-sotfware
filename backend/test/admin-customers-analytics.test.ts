import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { disconnectPrisma, prisma } from "../src/db/prisma.js";
import { type Fixture, databaseReady, login, resetDatabase, seedFixture } from "./helpers/db.js";

/**
 * Customer history and revenue are back-office data. Every test here that a STAFF
 * session touches must come back 403 — the counterpart to admin-orders.test.ts,
 * where the same session gets a 200.
 */
describe.skipIf(!databaseReady)("admin customers and analytics", () => {
  let app: FastifyInstance;
  let fixture: Fixture;
  let ownerA: string;
  let ownerB: string;
  let staffA: string;

  const ana = { name: "Ana Robles", phone: "272 260 3537", address: "Calle 5 #12" };
  const beto = { name: "Beto Cruz", phone: "(272) 111-2233", address: "Av. Juárez 8" };

  async function submitOrder(
    who: typeof ana,
    items: Record<string, unknown>[]
  ): Promise<{ id: string; total: number }> {
    const response = await app.inject({
      method: "POST",
      url: `/api/public/locations/${fixture.locationA.slug}/orders`,
      payload: { fulfillmentType: "DELIVERY", customer: who, items }
    });
    expect(response.statusCode).toBe(201);
    return { id: response.json().order.id, total: response.json().order.total };
  }

  const pizzaLine = (quantity: number) => ({
    menuItemId: fixture.pizzaId,
    sizeOptionId: fixture.sizeGrandeId,
    styleOptionId: fixture.styleTradicionalId,
    quantity
  });
  const refrescoLine = (quantity: number) => ({ menuItemId: fixture.refrescoId, quantity });

  beforeAll(async () => {
    await resetDatabase();
    fixture = await seedFixture();
    app = await buildApp();
    ownerA = await login(app, "owner@a.test");
    ownerB = await login(app, "owner@b.test");
    staffA = await login(app, "staff@a.test");

    // Ana: 2 × 180 + 1 × 30 = 390, and 1 × 180 = 180.
    await submitOrder(ana, [pizzaLine(2), refrescoLine(1)]);
    await submitOrder(ana, [pizzaLine(1)]);
    // Beto: 3 × 30 = 90, then cancelled — must not count towards revenue.
    const cancelled = await submitOrder(beto, [refrescoLine(3)]);
    await prisma.order.update({ where: { id: cancelled.id }, data: { status: "CANCELLED" } });
  });

  afterAll(async () => {
    await app.close();
    await disconnectPrisma();
  });

  const get = (url: string, cookie: string) => app.inject({ method: "GET", url, headers: { cookie } });

  describe("the STAFF boundary", () => {
    it("keeps STAFF out of customer history and revenue", async () => {
      const urls = [
        `/api/admin/locations/${fixture.locationA.id}/customers`,
        `/api/admin/locations/${fixture.locationA.id}/analytics/summary`,
        `/api/admin/locations/${fixture.locationA.id}/analytics/top-items`
      ];
      for (const url of urls) {
        const response = await get(url, staffA);
        expect.soft(response.statusCode, url).toBe(403);
        expect.soft(response.json().error.code, url).toBe("FORBIDDEN");
      }
    });

    it("keeps STAFF out of a customer record reached by id", async () => {
      const customer = await prisma.customer.findFirstOrThrow({ where: { locationId: fixture.locationA.id } });
      const response = await get(`/api/admin/customers/${customer.id}`, staffA);
      expect(response.statusCode).toBe(403);
    });
  });

  describe("customers", () => {
    it("lists the location's customers with their running totals", async () => {
      const response = await get(`/api/admin/locations/${fixture.locationA.id}/customers`, ownerA);
      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.customers).toHaveLength(2);
      expect(body.pagination).toMatchObject({ page: 1, total: 2 });

      const anaRow = body.customers.find((row: { name: string }) => row.name === "Ana Robles");
      expect(anaRow.orderCount).toBe(2);
      expect(typeof anaRow.totalSpent).toBe("number");
      expect(anaRow.totalSpent).toBe(570);
      // Deduped on digits only, so "272 260 3537" is stored as one regular.
      expect(anaRow.phone).toBe("2722603537");
    });

    it("searches by name", async () => {
      const response = await get(
        `/api/admin/locations/${fixture.locationA.id}/customers?search=beto`,
        ownerA
      );
      expect(response.json().customers).toHaveLength(1);
      expect(response.json().customers[0].name).toBe("Beto Cruz");
    });

    it("searches by a phone the operator typed with separators", async () => {
      const response = await get(
        `/api/admin/locations/${fixture.locationA.id}/customers?search=272 111`,
        ownerA
      );
      expect(response.json().customers).toHaveLength(1);
      expect(response.json().customers[0].phone).toBe("2721112233");
    });

    it("returns a customer with their order history, most recent first", async () => {
      const customer = await prisma.customer.findFirstOrThrow({
        where: { locationId: fixture.locationA.id, name: "Ana Robles" }
      });
      const response = await get(`/api/admin/customers/${customer.id}`, ownerA);
      expect(response.statusCode).toBe(200);

      const body = response.json();
      expect(body.customer.id).toBe(customer.id);
      expect(body.orders).toHaveLength(2);
      expect(body.orders[0].total).toBe(180);
      expect(body.orders[1].total).toBe(390);
      expect(body.orders[0].items.length).toBeGreaterThan(0);
    });

    it("refuses another location's customers", async () => {
      const customer = await prisma.customer.findFirstOrThrow({ where: { locationId: fixture.locationA.id } });
      const list = await get(`/api/admin/locations/${fixture.locationA.id}/customers`, ownerB);
      const detail = await get(`/api/admin/customers/${customer.id}`, ownerB);
      expect(list.statusCode).toBe(403);
      expect(detail.statusCode).toBe(403);
    });
  });

  describe("analytics summary", () => {
    it("sums revenue over the counted statuses and leaves cancelled out", async () => {
      const response = await get(`/api/admin/locations/${fixture.locationA.id}/analytics/summary`, ownerA);
      expect(response.statusCode).toBe(200);

      const summary = response.json().summary;
      expect(summary.orderCount).toBe(2);
      expect(summary.revenue).toBe(570);
      expect(summary.averageOrderValue).toBe(285);
      expect(summary.cancelledCount).toBe(1);
      expect(summary.countedStatuses).not.toContain("CANCELLED");
      expect(typeof summary.revenue).toBe("number");
    });

    it("reports zero rather than failing on an empty range", async () => {
      const response = await get(
        `/api/admin/locations/${fixture.locationA.id}/analytics/summary?from=2099-01-01&to=2099-12-31`,
        ownerA
      );
      expect(response.statusCode).toBe(200);
      expect(response.json().summary.orderCount).toBe(0);
      expect(response.json().summary.revenue).toBe(0);
      expect(response.json().summary.averageOrderValue).toBeNull();
    });

    it("counts today's orders when both ends are today", async () => {
      const today = new Date().toISOString().slice(0, 10);
      const response = await get(
        `/api/admin/locations/${fixture.locationA.id}/analytics/summary?from=${today}&to=${today}`,
        ownerA
      );
      expect(response.json().summary.orderCount).toBe(2);
    });

    it("rejects a reversed date range instead of silently reporting zero", async () => {
      const response = await get(
        `/api/admin/locations/${fixture.locationA.id}/analytics/summary?from=2026-09-30&to=2026-09-01`,
        ownerA
      );
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("refuses another location's revenue", async () => {
      const response = await get(`/api/admin/locations/${fixture.locationA.id}/analytics/summary`, ownerB);
      expect(response.statusCode).toBe(403);
    });
  });

  describe("analytics top items", () => {
    it("ranks items by quantity sold, ignoring cancelled orders", async () => {
      const response = await get(
        `/api/admin/locations/${fixture.locationA.id}/analytics/top-items`,
        ownerA
      );
      expect(response.statusCode).toBe(200);

      const items = response.json().items;
      expect(items[0]).toMatchObject({ name: "Al pastor", quantity: 3, revenue: 540 });

      // Beto's three refrescos were cancelled; only Ana's single one counts.
      const refresco = items.find((row: { name: string }) => row.name === "Refresco");
      expect(refresco.quantity).toBe(1);
      expect(refresco.revenue).toBe(30);
    });

    it("honours the limit", async () => {
      const response = await get(
        `/api/admin/locations/${fixture.locationA.id}/analytics/top-items?limit=1`,
        ownerA
      );
      expect(response.json().items).toHaveLength(1);
      expect(response.json().limit).toBe(1);
    });

    it("still reports an item that has since been deleted from the menu", async () => {
      // menuItemId goes NULL on delete, so the row survives only if the grouping
      // falls back to the snapshot name.
      await prisma.menuItem.delete({ where: { id: fixture.refrescoId } });

      const response = await get(
        `/api/admin/locations/${fixture.locationA.id}/analytics/top-items`,
        ownerA
      );
      const refresco = response.json().items.find((row: { name: string }) => row.name === "Refresco");
      expect(refresco).toBeDefined();
      expect(refresco.menuItemId).toBeNull();
      expect(refresco.quantity).toBe(1);
    });

    it("refuses another location's best sellers", async () => {
      const response = await get(
        `/api/admin/locations/${fixture.locationA.id}/analytics/top-items`,
        ownerB
      );
      expect(response.statusCode).toBe(403);
    });
  });
});
