import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { disconnectPrisma, prisma } from "../src/db/prisma.js";
import { type Fixture, databaseReady, login, resetDatabase, seedFixture } from "./helpers/db.js";

describe.skipIf(!databaseReady)("admin menu management", () => {
  let app: FastifyInstance;
  let fixture: Fixture;
  let ownerA: string;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await seedFixture();
    app = await buildApp();
    ownerA = await login(app, "owner@a.test");
  });

  afterAll(async () => {
    await app.close();
    await disconnectPrisma();
  });

  const call = (method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE", url: string, payload?: Record<string, unknown>) =>
    app.inject({ method, url, headers: { cookie: ownerA }, ...(payload ? { payload } : {}) });

  it("creates a category, its options and a matrix item, then prices the matrix", async () => {
    const category = await call("POST", `/api/admin/locations/${fixture.locationA.id}/menu/categories`, {
      slug: "especiales",
      name: "Especiales"
    });
    expect(category.statusCode).toBe(201);
    const categoryId = category.json().category.id;

    const size = await call("POST", `/api/admin/menu/categories/${categoryId}/size-options`, {
      slug: "familiar",
      name: "Familiar"
    });
    const style = await call("POST", `/api/admin/menu/categories/${categoryId}/style-options`, {
      slug: "clasica",
      name: "Clásica"
    });
    expect(size.statusCode).toBe(201);
    expect(style.statusCode).toBe(201);

    const item = await call("POST", `/api/admin/menu/categories/${categoryId}/items`, {
      slug: "hawaiana",
      name: "Hawaiana",
      itemType: "SIZE_STYLE_MATRIX",
      toppingColors: ["#B3441F", "#F2C93B"]
    });
    expect(item.statusCode).toBe(201);
    const itemId = item.json().item.id;

    const matrix = await call("PUT", `/api/admin/menu/items/${itemId}/price-matrix`, {
      cells: [
        {
          sizeOptionId: size.json().sizeOption.id,
          styleOptionId: style.json().styleOption.id,
          price: 199.5
        }
      ]
    });
    expect(matrix.statusCode).toBe(200);
    expect(matrix.json().priceCells[0].price).toBe(199.5);

    const order = await app.inject({
      method: "POST",
      url: "/api/public/locations/chesare-test/orders",
      payload: {
        customer: { phone: "2722603537" },
        items: [{ menuItemId: itemId, sizeSlug: "familiar", styleSlug: "clasica", quantity: 2 }]
      }
    });
    expect(order.statusCode).toBe(201);
    expect(order.json().order.total).toBe(399);
  });

  it("refuses a matrix cell borrowed from another category", async () => {
    const response = await call("PUT", `/api/admin/menu/items/${fixture.pizzaId}/price-matrix`, {
      cells: [{ sizeOptionId: fixture.sizeGrandeId, styleOptionId: "not-a-real-style", price: 10 }]
    });
    expect(response.statusCode).toBe(400);
  });

  it("refuses a flat price change on a matrix item", async () => {
    const response = await call("PATCH", `/api/admin/menu/items/${fixture.pizzaId}/price`, { flatPrice: 10 });
    expect(response.statusCode).toBe(400);
  });

  it("clears a matrix cell's price and the public API stops accepting it", async () => {
    const cleared = await call("PUT", `/api/admin/menu/items/${fixture.pizzaId}/price-matrix`, {
      cells: [
        {
          sizeOptionId: fixture.sizeGrandeId,
          styleOptionId: fixture.styleTradicionalId,
          price: null
        }
      ]
    });
    expect(cleared.statusCode).toBe(200);

    const order = await app.inject({
      method: "POST",
      url: "/api/public/locations/chesare-test/orders",
      payload: {
        customer: { phone: "2722603537" },
        items: [{ menuItemId: fixture.pizzaId, sizeSlug: "grande", styleSlug: "tradicional", quantity: 1 }]
      }
    });
    expect(order.statusCode).toBe(422);
    expect(order.json().error.code).toBe("PRICE_UNAVAILABLE");
  });

  it("hides an unavailable item from the public menu but keeps it in the back office", async () => {
    await call("PATCH", `/api/admin/menu/items/${fixture.refrescoId}/availability`, { available: false });

    const publicMenu = await app.inject({ method: "GET", url: "/api/public/locations/chesare-test/menu" });
    const bebidas = publicMenu
      .json()
      .categories.find((category: { slug: string }) => category.slug === "bebidas");
    expect(bebidas.items.some((item: { slug: string }) => item.slug === "refresco")).toBe(false);

    const adminMenu = await call("GET", `/api/admin/locations/${fixture.locationA.id}/menu`);
    const adminBebidas = adminMenu
      .json()
      .categories.find((category: { slug: string }) => category.slug === "bebidas");
    expect(adminBebidas.items.some((item: { slug: string }) => item.slug === "refresco")).toBe(true);
  });

  it("stores and replays the week's hours", async () => {
    const put = await call("PUT", `/api/admin/locations/${fixture.locationA.id}/hours`, {
      days: [{ dayOfWeek: 1, opensAt: 1050, closesAt: 1380 }]
    });
    expect(put.statusCode).toBe(200);

    const monday = put.json().days.find((day: { dayOfWeek: number }) => day.dayOfWeek === 1);
    expect(monday.opensAt).toBe(1050);

    const invalid = await call("PUT", `/api/admin/locations/${fixture.locationA.id}/hours`, {
      days: [{ dayOfWeek: 2, opensAt: 1380, closesAt: 1050 }]
    });
    expect(invalid.statusCode).toBe(400);
  });

  describe("reordering categories", () => {
    it("reverses the category order in one call and the public menu reflects it", async () => {
      // Whatever categories exist by this point in the file (pizzas, bebidas,
      // and any created by earlier tests above) -- reversing them is a change
      // regardless of the exact starting set, so this doesn't need to assume one.
      const before = await prisma.menuCategory.findMany({
        where: { locationId: fixture.locationA.id },
        orderBy: { sortOrder: "asc" }
      });
      const reversed = [...before].reverse().map((category) => category.id);

      const response = await call(
        "PUT",
        `/api/admin/locations/${fixture.locationA.id}/menu/categories/reorder`,
        { categoryIds: reversed }
      );
      expect(response.statusCode).toBe(200);
      expect(response.json().categories.map((category: { id: string }) => category.id)).toEqual(reversed);

      const publicMenu = await app.inject({
        method: "GET",
        url: `/api/public/locations/${fixture.locationA.slug}/menu`
      });
      expect(publicMenu.json().categories.map((category: { id: string }) => category.id)).toEqual(reversed);

      // Restore the original order so later tests in this file (and their
      // assumptions about which category comes first) aren't affected.
      await call("PUT", `/api/admin/locations/${fixture.locationA.id}/menu/categories/reorder`, {
        categoryIds: before.map((category) => category.id)
      });
    });

    it("rejects a list missing one of the location's categories", async () => {
      const categories = await prisma.menuCategory.findMany({ where: { locationId: fixture.locationA.id } });
      const response = await call(
        "PUT",
        `/api/admin/locations/${fixture.locationA.id}/menu/categories/reorder`,
        { categoryIds: [categories[0].id] }
      );
      expect(response.statusCode).toBe(400);
    });

    it("rejects a list with a wrong id swapped in for a real one", async () => {
      // Same length as the real set, so the earlier "missing one" check alone
      // wouldn't catch this -- one of the ids just isn't a real category here.
      const categories = await prisma.menuCategory.findMany({ where: { locationId: fixture.locationA.id } });
      const attempted = categories.map((category) => category.id);
      attempted[0] = "not-a-real-category-id";

      const response = await call(
        "PUT",
        `/api/admin/locations/${fixture.locationA.id}/menu/categories/reorder`,
        { categoryIds: attempted }
      );
      expect(response.statusCode).toBe(400);
    });

    it("refuses to reorder another location's categories", async () => {
      const ownerB = await login(app, "owner@b.test");
      const categories = await prisma.menuCategory.findMany({ where: { locationId: fixture.locationA.id } });
      const response = await app.inject({
        method: "PUT",
        url: `/api/admin/locations/${fixture.locationA.id}/menu/categories/reorder`,
        headers: { cookie: ownerB },
        payload: { categoryIds: categories.map((category) => category.id) }
      });
      expect(response.statusCode).toBe(403);
    });
  });
});
