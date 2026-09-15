import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { disconnectPrisma } from "../src/db/prisma.js";
import { databaseReady, resetDatabase, seedFixture } from "./helpers/db.js";

/**
 * Its own file so the per-IP counter starts fresh: every app instance carries its
 * own rate-limit store, and the other suites spend part of the same budget.
 */
describe.skipIf(!databaseReady)("public order submit throttling", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    await resetDatabase();
    await seedFixture();
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    await disconnectPrisma();
  });

  it("cuts off a flood of order submissions from one IP", async () => {
    // Payloads are deliberately invalid: the throttle runs before the handler, so
    // this measures the limiter without writing 20 junk orders.
    const flood = () =>
      app.inject({
        method: "POST",
        url: "/api/public/locations/chesare-test/orders",
        payload: { items: [] }
      });

    for (let i = 0; i < 20; i += 1) {
      const response = await flood();
      expect.soft(response.statusCode, `request ${i + 1}`).toBe(400);
    }

    const limited = await flood();
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.code).toBe("RATE_LIMITED");
  });
});
