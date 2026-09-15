import { Prisma, type Promotion } from "@prisma/client";
import { ZERO, money, sum } from "../lib/money.js";

export interface DiscountableLine {
  menuItemId: string | null;
  categoryId: string | null;
  lineTotal: Prisma.Decimal;
}

export interface AppliedPromotion {
  promotion: Promotion;
  discountTotal: Prisma.Decimal;
}

export function isPromotionActive(promotion: Promotion, at: Date = new Date()): boolean {
  if (!promotion.active) return false;
  if (promotion.startsAt && promotion.startsAt.getTime() > at.getTime()) return false;
  if (promotion.endsAt && promotion.endsAt.getTime() <= at.getTime()) return false;
  return true;
}

/**
 * The slice of the order a promotion is allowed to discount: the whole subtotal
 * for ORDER scope, otherwise only the lines matching the scoped category or item.
 */
export function promotionBase(
  promotion: Promotion,
  lines: DiscountableLine[],
  subtotal: Prisma.Decimal
): Prisma.Decimal {
  switch (promotion.scope) {
    case "ORDER":
      return money(subtotal);
    case "CATEGORY":
      return sum(
        lines.filter((line) => line.categoryId === promotion.categoryId).map((line) => line.lineTotal)
      );
    case "ITEM":
      return sum(
        lines.filter((line) => line.menuItemId === promotion.menuItemId).map((line) => line.lineTotal)
      );
    default:
      return ZERO;
  }
}

export function computeDiscount(
  promotion: Promotion,
  lines: DiscountableLine[],
  subtotal: Prisma.Decimal,
  at: Date = new Date()
): Prisma.Decimal {
  if (!isPromotionActive(promotion, at)) return ZERO;
  if (promotion.minSubtotal && subtotal.lessThan(promotion.minSubtotal)) return ZERO;

  const base = promotionBase(promotion, lines, subtotal);
  if (base.lessThanOrEqualTo(0)) return ZERO;

  const raw =
    promotion.discountType === "PERCENT"
      ? base.times(promotion.discountValue).dividedBy(100)
      : promotion.discountValue;

  // A discount can never exceed the slice it applies to, so an order can never
  // end up negative or refund the difference against unrelated lines.
  const capped = Prisma.Decimal.min(money(raw), base);
  return capped.lessThan(0) ? ZERO : money(capped);
}

/**
 * Only one promotion is applied per order — the one worth most to the customer.
 * Stacking is deliberately out of scope until the owner asks for it.
 */
export function selectBestPromotion(
  promotions: Promotion[],
  lines: DiscountableLine[],
  subtotal: Prisma.Decimal,
  at: Date = new Date()
): AppliedPromotion | null {
  let best: AppliedPromotion | null = null;

  for (const promotion of promotions) {
    const discountTotal = computeDiscount(promotion, lines, subtotal, at);
    if (discountTotal.lessThanOrEqualTo(0)) continue;
    if (!best || discountTotal.greaterThan(best.discountTotal)) {
      best = { promotion, discountTotal };
    }
  }

  return best;
}

export function applyDiscount(subtotal: Prisma.Decimal, discountTotal: Prisma.Decimal): Prisma.Decimal {
  const total = money(subtotal).minus(money(discountTotal));
  return total.lessThan(0) ? ZERO : money(total);
}
