import type { FastifyInstance } from "fastify";
import { BACK_OFFICE_ROLES, requireAuth, requireRole } from "../../auth/middleware.js";
import { loadLocation } from "../../lib/scope.js";
import { analyticsRangeQuery, idParams, topItemsQuery } from "../../schemas/index.js";
import { summary, topItems } from "../../services/analytics.js";

/**
 * Revenue figures are back-office data, so STAFF is kept out: an employee can see
 * the orders they are cooking without also seeing what the shop takes in a month.
 */
export default async function adminAnalyticsRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);
  app.addHook("preHandler", requireRole(...BACK_OFFICE_ROLES));

  app.get("/locations/:id/analytics/summary", async (request) => {
    const { id } = idParams.parse(request.params);
    const range = analyticsRangeQuery.parse(request.query);
    await loadLocation(request, id);
    return { summary: await summary(id, range) };
  });

  app.get("/locations/:id/analytics/top-items", async (request) => {
    const { id } = idParams.parse(request.params);
    const query = topItemsQuery.parse(request.query);
    await loadLocation(request, id);
    const items = await topItems(id, { from: query.from, to: query.to }, query.limit);
    return { items, limit: query.limit };
  });
}
