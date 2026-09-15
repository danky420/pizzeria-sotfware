import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { disconnectPrisma } from "../src/db/prisma.js";
import { type Fixture, databaseReady, login, resetDatabase, seedFixture } from "./helpers/db.js";

describe.skipIf(!databaseReady)("admin route permissions", () => {
  let app: FastifyInstance;
  let fixture: Fixture;
  let ownerA: string;
  let ownerB: string;
  let staffA: string;
  let superAdmin: string;

  beforeAll(async () => {
    await resetDatabase();
    fixture = await seedFixture();
    app = await buildApp();
    ownerA = await login(app, "owner@a.test");
    ownerB = await login(app, "owner@b.test");
    staffA = await login(app, "staff@a.test");
    superAdmin = await login(app, "super@test.test");
  });

  afterAll(async () => {
    await app.close();
    await disconnectPrisma();
  });

  const get = (url: string, cookie?: string) =>
    app.inject({ method: "GET", url, ...(cookie ? { headers: { cookie } } : {}) });

  describe("authentication", () => {
    it("refuses an admin route with no session", async () => {
      const response = await get(`/api/admin/locations/${fixture.locationA.id}/menu`);
      expect(response.statusCode).toBe(401);
    });

    it("refuses a forged session cookie", async () => {
      const response = await get(`/api/admin/locations/${fixture.locationA.id}/menu`, "chesare_admin_session=made-up");
      expect(response.statusCode).toBe(401);
    });
  });

  describe("the STAFF boundary", () => {
    it("lets STAFF reach the orders routes", async () => {
      const response = await get(`/api/admin/locations/${fixture.locationA.id}/orders`, staffA);
      expect(response.statusCode).toBe(200);
    });

    it("keeps STAFF out of the menu", async () => {
      const response = await get(`/api/admin/locations/${fixture.locationA.id}/menu`, staffA);
      expect(response.statusCode).toBe(403);
    });

    it("keeps STAFF out of every other back-office area", async () => {
      const urls = [
        `/api/admin/locations/${fixture.locationA.id}/promotions`,
        `/api/admin/locations/${fixture.locationA.id}/hours`,
        `/api/admin/locations/${fixture.locationA.id}/users`,
        `/api/admin/locations/${fixture.locationA.id}/customers`,
        `/api/admin/locations/${fixture.locationA.id}/analytics/summary`,
        "/api/admin/locations"
      ];

      for (const url of urls) {
        const response = await get(url, staffA);
        expect.soft(response.statusCode, url).toBe(403);
      }
    });

    it("keeps STAFF out of menu writes", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: `/api/admin/menu/items/${fixture.refrescoId}/availability`,
        headers: { cookie: staffA },
        payload: { available: false }
      });
      expect(response.statusCode).toBe(403);
    });

    it("still allows STAFF to read their own account and log out", async () => {
      const me = await get("/api/admin/auth/me", staffA);
      expect(me.statusCode).toBe(200);
      expect(me.json().user.role).toBe("STAFF");
    });
  });

  describe("location scoping", () => {
    it("lets an owner read their own location's menu", async () => {
      const response = await get(`/api/admin/locations/${fixture.locationA.id}/menu`, ownerA);
      expect(response.statusCode).toBe(200);
      expect(response.json().categories).toHaveLength(2);
    });

    it("refuses another location's menu", async () => {
      const response = await get(`/api/admin/locations/${fixture.locationB.id}/menu`, ownerA);
      expect(response.statusCode).toBe(403);
    });

    it("refuses a row reached by id rather than by location path", async () => {
      const response = await app.inject({
        method: "PATCH",
        url: `/api/admin/menu/items/${fixture.refrescoId}/price`,
        headers: { cookie: ownerB },
        payload: { flatPrice: 1 }
      });
      expect(response.statusCode).toBe(403);
    });

    it("refuses another location's promotions and users", async () => {
      const promotions = await get(`/api/admin/locations/${fixture.locationA.id}/promotions`, ownerB);
      const users = await get(`/api/admin/locations/${fixture.locationA.id}/users`, ownerB);
      expect(promotions.statusCode).toBe(403);
      expect(users.statusCode).toBe(403);
    });

    it("only lists the caller's own location", async () => {
      const response = await get("/api/admin/locations", ownerA);
      expect(response.json().locations).toHaveLength(1);
      expect(response.json().locations[0].id).toBe(fixture.locationA.id);
    });

    it("lets a super admin cross locations", async () => {
      const response = await get(`/api/admin/locations/${fixture.locationB.id}/menu`, superAdmin);
      expect(response.statusCode).toBe(200);

      const all = await get("/api/admin/locations", superAdmin);
      expect(all.json().locations).toHaveLength(2);
    });

    it("refuses to let a location-scoped owner create a location", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/api/admin/locations",
        headers: { cookie: ownerA },
        payload: { slug: "nueva", name: "Nueva", waNumber: "522722600001" }
      });
      expect(response.statusCode).toBe(403);
    });

    it("refuses to let an owner mint a super admin", async () => {
      const response = await app.inject({
        method: "POST",
        url: `/api/admin/locations/${fixture.locationA.id}/users`,
        headers: { cookie: ownerA },
        payload: {
          email: "escalate@a.test",
          name: "Escalate",
          password: "a-long-enough-password",
          role: "SUPER_ADMIN"
        }
      });
      expect(response.statusCode).toBe(403);
    });
  });
});
