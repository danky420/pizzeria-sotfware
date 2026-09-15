import type { FastifyInstance } from "fastify";
import { ORDER_ROLES, requireAuth, requireRole } from "../../auth/middleware.js";
import { notFound } from "../../lib/http-error.js";
import { presentOrder } from "../../lib/present.js";
import { loadLocation, loadOrder } from "../../lib/scope.js";
import { idParams, orderListQuery, patchOrderStatusBody } from "../../schemas/index.js";
import { ORDER_STATUS_FLOW, getOrder, listOrders, updateOrderStatus } from "../../services/orders.js";

/**
 * The one admin area STAFF is allowed into: an employee works the orders queue
 * and nothing else. The guard is ORDER_ROLES rather than BACK_OFFICE_ROLES, and
 * location scoping still applies to STAFF exactly as it does to an owner — a
 * staff account sees its own shop's orders and no other shop's.
 */
export default async function adminOrderRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);
  app.addHook("preHandler", requireRole(...ORDER_ROLES));

  app.get("/locations/:id/orders", async (request) => {
    const { id } = idParams.parse(request.params);
    const query = orderListQuery.parse(request.query);
    await loadLocation(request, id);

    const page = await listOrders(id, query);
    return {
      orders: page.orders.map(presentOrder),
      pagination: {
        page: page.page,
        pageSize: page.pageSize,
        total: page.total,
        pageCount: Math.max(1, Math.ceil(page.total / page.pageSize))
      }
    };
  });

  app.get("/orders/:id", async (request) => {
    const { id } = idParams.parse(request.params);
    // Scoped by the row's own locationId, not by a path param: an order id from
    // another shop is a 403 here, never a readable customer phone number.
    await loadOrder(request, id);
    const order = await getOrder(id);
    if (!order) throw notFound("Order not found");
    return { order: presentOrder(order) };
  });

  app.patch("/orders/:id/status", async (request) => {
    const { id } = idParams.parse(request.params);
    const body = patchOrderStatusBody.parse(request.body);
    const existing = await loadOrder(request, id);

    const order = await updateOrderStatus(id, existing.status, body.status);
    return { order: presentOrder(order), allowedNext: ORDER_STATUS_FLOW[order.status] };
  });
}
