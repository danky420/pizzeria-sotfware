import { type OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { ZERO, decimalToNumber, money } from "../lib/money.js";
import { orderRangeFilter, orderWhere } from "./orders.js";

// Revenue/AOV summary and top-items aggregation. Every figure here is computed by
// Postgres — an aggregate that loads the orders table into Node works fine on the
// seed data and falls over on a year of real service.

/**
 * Which orders count as money taken. A pizzería's dashboard is read *during*
 * service, so restricting revenue to COMPLETED would show a near-empty day until
 * the last delivery lands. Everything that is not CANCELLED counts instead, and
 * the response says so explicitly (`countedStatuses`) so nobody has to reverse
 * engineer the number. Cancelled orders are reported separately rather than
 * silently dropped.
 */
export const REVENUE_STATUSES: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "COMPLETED"
];

export interface AnalyticsRange {
  from?: Date | undefined;
  to?: Date | undefined;
}

export interface StatusBreakdownRow {
  status: OrderStatus;
  orderCount: number;
  revenue: number | null;
}

export interface AnalyticsSummary {
  from: Date | null;
  to: Date | null;
  countedStatuses: OrderStatus[];
  orderCount: number;
  revenue: number | null;
  subtotal: number | null;
  discountTotal: number | null;
  averageOrderValue: number | null;
  cancelledCount: number;
  byStatus: StatusBreakdownRow[];
}

export async function summary(locationId: string, range: AnalyticsRange): Promise<AnalyticsSummary> {
  const where = orderWhere(locationId, range);

  // One grouped scan covers the whole panel: the counted-revenue figures, the
  // cancelled count, and the per-status breakdown the dashboard draws.
  const rows = await prisma.order.groupBy({
    by: ["status"],
    where,
    _count: { _all: true },
    _sum: { total: true, subtotal: true, discountTotal: true }
  });

  const counted = rows.filter((row) => REVENUE_STATUSES.includes(row.status));

  const orderCount = counted.reduce((acc, row) => acc + row._count._all, 0);
  const add = (pick: (row: (typeof rows)[number]) => Prisma.Decimal | null) =>
    money(counted.reduce<Prisma.Decimal>((acc, row) => acc.plus(pick(row) ?? ZERO), ZERO));

  const revenue = add((row) => row._sum.total);
  const subtotal = add((row) => row._sum.subtotal);
  const discountTotal = add((row) => row._sum.discountTotal);

  // Decimal division, not float: an average of 199.995 has to round the same way
  // the money columns do or it will not reconcile with revenue / orderCount.
  const averageOrderValue = orderCount > 0 ? money(revenue.dividedBy(orderCount)) : null;

  const cancelled = rows.find((row) => row.status === "CANCELLED");

  return {
    from: range.from ?? null,
    to: range.to ?? null,
    countedStatuses: REVENUE_STATUSES,
    orderCount,
    revenue: decimalToNumber(revenue),
    subtotal: decimalToNumber(subtotal),
    discountTotal: decimalToNumber(discountTotal),
    averageOrderValue: decimalToNumber(averageOrderValue),
    cancelledCount: cancelled?._count._all ?? 0,
    byStatus: rows
      .map((row) => ({
        status: row.status,
        orderCount: row._count._all,
        revenue: decimalToNumber(money(row._sum.total ?? ZERO))
      }))
      .sort((a, b) => b.orderCount - a.orderCount)
  };
}

export interface TopItemRow {
  menuItemId: string | null;
  name: string;
  quantity: number;
  revenue: number | null;
}

export async function topItems(
  locationId: string,
  range: AnalyticsRange,
  limit: number
): Promise<TopItemRow[]> {
  // Grouping on both keys is what survives a menu edit: an item that was renamed
  // still aggregates under one menuItemId, and an item that was later deleted
  // (menuItemId set to NULL by the FK) still aggregates under its snapshot name
  // instead of collapsing every deleted item into one "unknown" row.
  const createdAt = orderRangeFilter(range.from, range.to);
  const rows = await prisma.orderItem.groupBy({
    by: ["menuItemId", "nameSnapshot"],
    where: {
      order: {
        locationId,
        // The same revenue rule the summary uses, so the two dashboard panels can
        // never disagree about what counts as a sale.
        status: { in: REVENUE_STATUSES },
        ...(createdAt ? { createdAt } : {})
      }
    },
    _sum: { quantity: true, lineTotal: true }
  });

  // The group set is bounded by the size of the menu, not by order volume, so the
  // merge and sort below stay cheap however much history is in the range.
  const merged = new Map<string, { menuItemId: string | null; name: string; quantity: number; revenue: Prisma.Decimal }>();

  for (const row of rows) {
    const key = row.menuItemId ?? `name:${row.nameSnapshot.toLowerCase()}`;
    const existing = merged.get(key);
    const quantity = row._sum.quantity ?? 0;
    const revenue = row._sum.lineTotal ?? ZERO;

    if (existing) {
      existing.quantity += quantity;
      existing.revenue = existing.revenue.plus(revenue);
    } else {
      merged.set(key, {
        menuItemId: row.menuItemId,
        name: row.nameSnapshot,
        quantity,
        revenue: new Prisma.Decimal(revenue)
      });
    }
  }

  return [...merged.values()]
    .sort((a, b) => b.quantity - a.quantity || b.revenue.comparedTo(a.revenue))
    .slice(0, limit)
    .map((row) => ({
      menuItemId: row.menuItemId,
      name: row.name,
      quantity: row.quantity,
      revenue: decimalToNumber(money(row.revenue))
    }));
}
