import { existsSync } from "node:fs";
import { join } from "node:path";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { env } from "./config/env.js";
import { registerErrorHandler } from "./lib/error-handler.js";
import { HttpError } from "./lib/http-error.js";
import adminAnalyticsRoutes from "./routes/admin/analytics.js";
import adminAuthRoutes from "./routes/admin/auth.js";
import adminCustomerRoutes from "./routes/admin/customers.js";
import adminHoursRoutes from "./routes/admin/hours.js";
import adminLocationRoutes from "./routes/admin/locations.js";
import adminMenuRoutes from "./routes/admin/menu.js";
import adminOrderRoutes from "./routes/admin/orders.js";
import adminPromotionRoutes from "./routes/admin/promotions.js";
import adminUserRoutes from "./routes/admin/users.js";
import publicHoursRoutes from "./routes/public/hours.js";
import publicMenuRoutes from "./routes/public/menu.js";
import publicOrderRoutes from "./routes/public/orders.js";

const PUBLIC_PREFIX = "/api/public";
const ADMIN_PREFIX = "/api/admin";

// A cart payload is small; anything above this is not a customer placing an order.
const BODY_LIMIT_BYTES = 128 * 1024;

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: env.isTest ? false : { level: env.LOG_LEVEL },
    // Railway terminates TLS in front of the service, so the client IP the rate
    // limiter keys on only exists in X-Forwarded-For.
    trustProxy: env.isProduction,
    bodyLimit: BODY_LIMIT_BYTES
  });

  registerErrorHandler(app);

  await app.register(fastifyCookie, { secret: env.SESSION_COOKIE_SECRET });

  await app.register(fastifyCors, {
    origin(origin, callback) {
      // No Origin header means a same-origin or non-browser caller (the SPA in
      // production, curl, health checks) — nothing for CORS to decide.
      if (!origin) return callback(null, true);
      callback(null, env.allowedOrigins.includes(origin.replace(/\/+$/, "")));
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"]
  });

  await app.register(fastifyRateLimit, {
    global: false,
    // The plugin throws whatever this returns, so it has to be a real Error with a
    // statusCode — a bare body object would reach the error handler as a 500.
    errorResponseBuilder: (_request, context) =>
      new HttpError(429, "RATE_LIMITED", "Too many requests. Try again in a moment.", {
        retryAfter: context.after
      })
  });

  app.get("/api/health", async () => ({ ok: true }));

  await app.register(publicMenuRoutes, { prefix: PUBLIC_PREFIX });
  await app.register(publicHoursRoutes, { prefix: PUBLIC_PREFIX });
  await app.register(publicOrderRoutes, { prefix: PUBLIC_PREFIX });

  await app.register(adminAuthRoutes, { prefix: ADMIN_PREFIX });
  await app.register(adminLocationRoutes, { prefix: ADMIN_PREFIX });
  await app.register(adminUserRoutes, { prefix: ADMIN_PREFIX });
  await app.register(adminHoursRoutes, { prefix: ADMIN_PREFIX });
  await app.register(adminMenuRoutes, { prefix: ADMIN_PREFIX });
  await app.register(adminPromotionRoutes, { prefix: ADMIN_PREFIX });
  await app.register(adminOrderRoutes, { prefix: ADMIN_PREFIX });
  await app.register(adminCustomerRoutes, { prefix: ADMIN_PREFIX });
  await app.register(adminAnalyticsRoutes, { prefix: ADMIN_PREFIX });

  // One service, three SPAs, distinct prefixes (docs/backend-admin-plan.md,
  // "Stack decisions"): / → customer, /admin → back office, /staff → employee.
  // Each is optional at boot — a frontend that has not been built yet must
  // leave the API running rather than crash the service.
  const spas = [
    { prefix: "/staff", root: env.employeeDistDir },
    { prefix: "/admin", root: env.adminDistDir },
    // The customer site is mounted last so its files resolve only after the
    // two prefixed apps have had their say, and it owns "/" itself.
    { prefix: "/", root: env.customerDistDir }
  ].filter((spa) => existsSync(join(spa.root, "index.html")));

  for (const [index, spa] of spas.entries()) {
    await app.register(fastifyStatic, {
      root: spa.root,
      prefix: spa.prefix,
      // wildcard:false registers a route per real file, so anything that is
      // *not* a built asset falls through to the not-found handler below and
      // becomes the SPA fallback instead of a 404. The trade-off: that route
      // table is built at boot, so rebuilding a frontend means restarting
      // this service or its hashed asset names 404.
      wildcard: false,
      // Only the first registration may add reply.sendFile; the rest reuse it
      // and pass their own root explicitly.
      decorateReply: index === 0
    });
  }

  // Longest prefix first, so "/admin/orders" matches /admin, not /.
  const spasByPrefix = [...spas].sort((a, b) => b.prefix.length - a.prefix.length);

  function spaFor(url: string) {
    const path = url.split("?")[0] ?? "";
    return spasByPrefix.find(
      (spa) => spa.prefix === "/" || path === spa.prefix || path.startsWith(`${spa.prefix}/`)
    );
  }

  app.setNotFoundHandler((request, reply) => {
    if (request.method === "GET" && !request.url.startsWith("/api/")) {
      const spa = spaFor(request.url);
      // A missing hashed asset is a genuine 404, not a client-side route —
      // serving index.html there would hand the browser HTML labelled as JS.
      if (spa && !/\.[a-z0-9]+$/i.test(request.url.split("?")[0] ?? "")) {
        return reply.sendFile("index.html", spa.root);
      }
    }
    return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Not found" } });
  });

  await app.ready();
  return app;
}
