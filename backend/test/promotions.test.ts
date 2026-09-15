import { Prisma, type Promotion } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  applyDiscount,
  computeDiscount,
  isPromotionActive,
  selectBestPromotion
} from "../src/services/promotions.js";

const dec = (value: string) => new Prisma.Decimal(value);

function promotion(overrides: Partial<Promotion> = {}): Promotion {
  return {
    id: "promo",
    locationId: "loc",
    name: "Promo",
    description: null,
    code: null,
    discountType: "PERCENT",
    discountValue: dec("10"),
    scope: "ORDER",
    categoryId: null,
    menuItemId: null,
    minSubtotal: null,
    startsAt: null,
    endsAt: null,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  } as unknown as Promotion;
}

const lines = [
  { menuItemId: "pizza", categoryId: "pizzas", lineTotal: dec("180.00") },
  { menuItemId: "refresco", categoryId: "bebidas", lineTotal: dec("60.00") }
];
const subtotal = dec("240.00");

describe("promotion discount math", () => {
  it("takes a percentage of the whole subtotal for an ORDER promotion", () => {
    const discount = computeDiscount(promotion(), lines, subtotal);
    expect(discount.toFixed(2)).toBe("24.00");
    expect(applyDiscount(subtotal, discount).toFixed(2)).toBe("216.00");
  });

  it("takes a fixed amount off", () => {
    const discount = computeDiscount(
      promotion({ discountType: "FIXED", discountValue: dec("50") }),
      lines,
      subtotal
    );
    expect(discount.toFixed(2)).toBe("50.00");
  });

  it("only discounts the lines of a CATEGORY promotion's category", () => {
    const discount = computeDiscount(
      promotion({ scope: "CATEGORY", categoryId: "bebidas", discountValue: dec("50") }),
      lines,
      subtotal
    );
    expect(discount.toFixed(2)).toBe("30.00");
  });

  it("only discounts the lines of an ITEM promotion's item", () => {
    const discount = computeDiscount(
      promotion({ scope: "ITEM", menuItemId: "pizza", discountValue: dec("25") }),
      lines,
      subtotal
    );
    expect(discount.toFixed(2)).toBe("45.00");
  });

  it("never discounts more than the slice it applies to", () => {
    const discount = computeDiscount(
      promotion({ scope: "ITEM", menuItemId: "refresco", discountType: "FIXED", discountValue: dec("500") }),
      lines,
      subtotal
    );
    expect(discount.toFixed(2)).toBe("60.00");
    expect(applyDiscount(subtotal, discount).toFixed(2)).toBe("180.00");
  });

  it("does not apply below the minimum subtotal", () => {
    const discount = computeDiscount(promotion({ minSubtotal: dec("300") }), lines, subtotal);
    expect(discount.toFixed(2)).toBe("0.00");
  });

  it("rounds a fractional percentage to centavos", () => {
    const discount = computeDiscount(
      promotion({ discountValue: dec("15") }),
      [{ menuItemId: "x", categoryId: "c", lineTotal: dec("33.33") }],
      dec("33.33")
    );
    expect(discount.toFixed(2)).toBe("5.00");
  });
});

describe("promotion windows", () => {
  const at = new Date("2026-06-15T12:00:00Z");

  it("ignores an inactive promotion", () => {
    expect(isPromotionActive(promotion({ active: false }), at)).toBe(false);
  });

  it("ignores a promotion that has not started", () => {
    expect(isPromotionActive(promotion({ startsAt: new Date("2026-07-01T00:00:00Z") }), at)).toBe(false);
  });

  it("ignores a promotion that has ended", () => {
    expect(isPromotionActive(promotion({ endsAt: new Date("2026-06-01T00:00:00Z") }), at)).toBe(false);
  });

  it("accepts a promotion inside its window", () => {
    expect(
      isPromotionActive(
        promotion({ startsAt: new Date("2026-06-01T00:00:00Z"), endsAt: new Date("2026-07-01T00:00:00Z") }),
        at
      )
    ).toBe(true);
  });
});

describe("choosing between promotions", () => {
  it("picks the one worth most to the customer", () => {
    const best = selectBestPromotion(
      [
        promotion({ id: "ten-percent", discountValue: dec("10") }),
        promotion({ id: "fifty-pesos", discountType: "FIXED", discountValue: dec("50") })
      ],
      lines,
      subtotal
    );

    expect(best?.promotion.id).toBe("fifty-pesos");
    expect(best?.discountTotal.toFixed(2)).toBe("50.00");
  });

  it("returns nothing when none of them apply", () => {
    expect(selectBestPromotion([promotion({ active: false })], lines, subtotal)).toBeNull();
  });
});
