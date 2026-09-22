import { type OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { HttpError } from "../lib/http-error.js";
import type { OrderListQuery } from "../schemas/orders.js";

// Admin order listing, detail and status transitions. Public order creation does
// not go through here — it lives in src/routes/public/orders.ts so Phase 1 could
// ship the customer path complete.

/**
 * The kitchen's real sequence, as a graph rather than a ladder, so the rule is
 * stated once and both the API and (later) the SPA can read it:
 *
 *   PENDING → CONFIRMED → PREPARING → READY → COMPLETED
 *
 * CANCELLED is reachable from any state that is not already terminal. COMPLETED
 * and CANCELLED are terminal: an order that is paid for and gone cannot be walked
 * backwards into the queue, which is what keeps the analytics figures honest.
 *
 * (The design note calls the first state RECEIVED and the fourth
 * OUT_FOR_DELIVERY; the schema Phase 1 shipped names them PENDING and READY. The
 * schema wins — this phase does not own it.)
 */
export const ORDER_STATUS_FLOW: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CONFIRMED", "PREPARING", "CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: []
};

export const TERMINAL_ORDER_STATUSES: OrderStatus[] = ["COMPLETED", "CANCELLED"];

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_FLOW[from].includes(to);
}

/**
 * A rejected transition is a 409, not a 400: the request itself is well-formed,
 * it just lost a race with whoever moved the order last. The current status goes
 * back in `details` so the SPA can re-render instead of guessing.
 */
export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (from === to) {
    throw new HttpError(409, "CONFLICT", `This order is already ${from.toLowerCase()}`, {
      currentStatus: from,
      allowed: ORDER_STATUS_FLOW[from]
    });
  }
  if (!canTransition(from, to)) {
    throw new HttpError(
      409,
      "CONFLICT",
      `An order that is ${from.toLowerCase()} cannot become ${to.toLowerCase()}`,
      { currentStatus: from, allowed: ORDER_STATUS_FLOW[from] }
    );
  }
}

const orderInclude = { items: { orderBy: { createdAt: "asc" } } } satisfies Prisma.OrderInclude;

// Edit history only for the single-order detail view -- the queue lists many
// rows at once and has no use for it, so leave it off that query entirely.
const orderDetailInclude = {
  items: { orderBy: { createdAt: "asc" } },
  edits: { orderBy: { createdAt: "desc" }, include: { editedBy: { select: { id: true, name: true } } } }
} satisfies Prisma.OrderInclude;

export type OrderWithItems = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
export type OrderWithDetail = Prisma.OrderGetPayload<{ include: typeof orderDetailInclude }>;

export interface OrderPage {
  orders: OrderWithItems[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * `to` arrives as a date the operator typed, so it is treated as inclusive of
 * that whole day: a range of 1–7 September that quietly dropped every order
 * placed on the 7th would be read as a slow day, not as an off-by-one.
 */
export function endOfDay(to: Date): Date {
  const isMidnight =
    to.getUTCHours() === 0 &&
    to.getUTCMinutes() === 0 &&
    to.getUTCSeconds() === 0 &&
    to.getUTCMilliseconds() === 0;
  if (!isMidnight) return to;
  return new Date(to.getTime() + 24 * 60 * 60 * 1000 - 1);
}

export function orderRangeFilter(from?: Date, to?: Date): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  return {
    ...(from ? { gte: from } : {}),
    ...(to ? { lte: endOfDay(to) } : {})
  };
}

/**
 * `q` matches a customer name/phone substring, or an exact order number when it
 * parses as one — a staff member searching "165" almost always means order
 * #165, not a coincidental phone-number substring, so the number match is
 * offered alongside the text match rather than instead of it.
 */
export function orderSearchFilter(q?: string): Prisma.OrderWhereInput | undefined {
  const trimmed = q?.trim();
  if (!trimmed) return undefined;
  const asOrderNumber = /^\d+$/.test(trimmed) ? Number(trimmed) : undefined;
  return {
    OR: [
      { customerName: { contains: trimmed, mode: "insensitive" } },
      { customerPhone: { contains: trimmed } },
      ...(asOrderNumber !== undefined ? [{ orderNumber: asOrderNumber }] : [])
    ]
  };
}

export function orderWhere(
  locationId: string | undefined,
  filters: { status?: OrderStatus; customerId?: string; from?: Date; to?: Date; q?: string }
): Prisma.OrderWhereInput {
  const createdAt = orderRangeFilter(filters.from, filters.to);
  return {
    ...(locationId ? { locationId } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.customerId ? { customerId: filters.customerId } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(orderSearchFilter(filters.q) ?? {})
  };
}

export async function listOrders(locationId: string, query: OrderListQuery): Promise<OrderPage> {
  const where = orderWhere(locationId, query);

  // Count and page in one round trip; the count is what lets the SPA show "page 2
  // of 9" without walking the table.
  const [total, orders] = await prisma.$transaction([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: orderInclude
    })
  ]);

  return { orders, total, page: query.page, pageSize: query.pageSize };
}

export function getOrder(orderId: string): Promise<OrderWithDetail | null> {
  return prisma.order.findUnique({ where: { id: orderId }, include: orderDetailInclude });
}

/**
 * The status change is conditional in SQL (`where: { id, status: current }`), so
 * two staff phones tapping "Preparando" and "Cancelar" at the same moment cannot
 * both win: the second one finds zero rows updated and gets the 409 it deserves.
 */
export async function updateOrderStatus(
  orderId: string,
  current: OrderStatus,
  next: OrderStatus
): Promise<OrderWithItems> {
  assertTransition(current, next);

  const changed = await prisma.order.updateMany({
    where: { id: orderId, status: current },
    data: { status: next }
  });

  if (changed.count === 0) {
    const fresh = await prisma.order.findUnique({ where: { id: orderId } });
    throw new HttpError(409, "CONFLICT", "Someone else changed this order first", {
      currentStatus: fresh?.status ?? null
    });
  }

  return prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
}
