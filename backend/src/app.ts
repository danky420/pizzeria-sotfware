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

  // The admin SPA is a later phase: until admin/dist exists this service is an
  // API and nothing else, which must not be a startup failure.
  const hasAdminBuild = existsSync(join(env.adminDistDir, "index.html"));
  if (hasAdminBuild) {
    await app.register(fastifyStatic, { root: env.adminDistDir, prefix: "/", wildcard: false });
  }

  app.setNotFoundHandler((request, reply) => {
    if (hasAdminBuild && request.method === "GET" && !request.url.startsWith("/api/")) {
      return reply.sendFile("index.html");
    }
    return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Not found" } });
  });

  await app.ready();
  return app;
}
