import type { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { BACK_OFFICE_ROLES, requireAuth, requireRole } from "../../auth/middleware.js";
import { prisma } from "../../db/prisma.js";
import { presentCustomer, presentOrder } from "../../lib/present.js";
import { loadCustomer, loadLocation } from "../../lib/scope.js";
import { customerListQuery, customerOrdersQuery, idParams, phoneSearchKey } from "../../schemas/index.js";

/**
 * Customer history is back-office data — names, addresses and phone numbers of
 * every regular — so STAFF is kept out even though STAFF can see the same details
 * on a single live order they are working.
 */
export default async function adminCustomerRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);
  app.addHook("preHandler", requireRole(...BACK_OFFICE_ROLES));

  app.get("/locations/:id/customers", async (request) => {
    const { id } = idParams.parse(request.params);
    const query = customerListQuery.parse(request.query);
    await loadLocation(request, id);

    const where: Prisma.CustomerWhereInput = { locationId: id };
    if (query.search) {
      // Phones are stored digits-only, so "272 260" has to be stripped the same
      // way the public order route strips it or it could never match a row.
      const digits = phoneSearchKey(query.search);
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        ...(digits ? [{ phone: { contains: digits } }] : [])
      ];
    }

    const [total, customers] = await prisma.$transaction([
      prisma.customer.count({ where }),
      prisma.customer.findMany({
        where,
        // Most recent first: the back office almost always wants the regular who
        // just called, not the alphabetically first one.
        orderBy: [{ lastOrderAt: "desc" }, { createdAt: "desc" }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize
      })
    ]);

    return {
      customers: customers.map(presentCustomer),
      pagination: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        pageCount: Math.max(1, Math.ceil(total / query.pageSize))
      }
    };
  });

  app.get("/customers/:id", async (request) => {
    const { id } = idParams.parse(request.params);
    const query = customerOrdersQuery.parse(request.query);
    const customer = await loadCustomer(request, id);

    const orders = await prisma.order.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: "desc" },
      take: query.orderLimit,
      include: { items: { orderBy: { createdAt: "asc" } } }
    });

    return { customer: presentCustomer(customer), orders: orders.map((order) => presentOrder(order)) };
  });
}
