import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { MAX_FAILED_LOGIN_ATTEMPTS } from "../src/auth/rateLimit.js";
import { disconnectPrisma, prisma } from "../src/db/prisma.js";
import { TEST_PASSWORD, databaseReady, resetDatabase, seedFixture } from "./helpers/db.js";

describe.skipIf(!databaseReady)("admin login", () => {
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

  const attempt = (email: string, password: string) =>
    app.inject({ method: "POST", url: "/api/admin/auth/login", payload: { email, password } });

  it("signs a valid user in and answers auth/me", async () => {
    const response = await attempt("owner@a.test", TEST_PASSWORD);
    expect(response.statusCode).toBe(200);
    expect(response.json().user.role).toBe("OWNER");

    const cookie = response.cookies.find((candidate) => candidate.name === "chesare_admin_session");
    expect(cookie?.httpOnly).toBe(true);

    const me = await app.inject({
      method: "GET",
      url: "/api/admin/auth/me",
      headers: { cookie: `${cookie?.name}=${cookie?.value}` }
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe("owner@a.test");
  });

  it("rejects an unknown email with the same message as a wrong password", async () => {
    const unknown = await attempt("nobody@a.test", TEST_PASSWORD);
    const wrong = await attempt("staff@a.test", "not-the-password");
    expect(unknown.statusCode).toBe(401);
    expect(wrong.statusCode).toBe(401);
    expect(unknown.json().error.message).toBe(wrong.json().error.message);
  });

  it("locks the account after repeated failures and keeps it locked for the right password", async () => {
    let last = await attempt("owner@b.test", "wrong-password");
    for (let i = 1; i < MAX_FAILED_LOGIN_ATTEMPTS; i += 1) {
      expect(last.statusCode).toBe(401);
      last = await attempt("owner@b.test", "wrong-password");
    }

    expect(last.statusCode).toBe(423);
    expect(last.json().error.code).toBe("ACCOUNT_LOCKED");

    const locked = await attempt("owner@b.test", TEST_PASSWORD);
    expect(locked.statusCode).toBe(423);

    const user = await prisma.adminUser.findUnique({ where: { email: "owner@b.test" } });
    expect(user?.lockedUntil).not.toBeNull();
  });

  it("rate limits repeated login attempts from one IP and email", async () => {
    // The throttle allows 10 per window; an unknown email is used so the account
    // lockout does not take over before the 11th request.
    let last = await attempt("bruteforce@a.test", "wrong-password");
    for (let i = 1; i < 10; i += 1) {
      expect(last.statusCode).toBe(401);
      last = await attempt("bruteforce@a.test", "wrong-password");
    }

    const limited = await attempt("bruteforce@a.test", "wrong-password");
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.code).toBe("RATE_LIMITED");
  });

  it("clears the session on logout", async () => {
    const login = await attempt("staff@a.test", TEST_PASSWORD);
    const cookie = login.cookies.find((candidate) => candidate.name === "chesare_admin_session");
    const header = { cookie: `${cookie?.name}=${cookie?.value}` };

    const logout = await app.inject({ method: "POST", url: "/api/admin/auth/logout", headers: header });
    expect(logout.statusCode).toBe(200);

    const after = await app.inject({ method: "GET", url: "/api/admin/auth/me", headers: header });
    expect(after.statusCode).toBe(401);
  });
});
