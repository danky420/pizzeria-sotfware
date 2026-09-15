import { Prisma } from "@prisma/client";
import { HttpError, badRequest } from "../lib/http-error.js";
import { money } from "../lib/money.js";

export const priceableItemInclude = {
  category: true,
  priceCells: { include: { sizeOption: true, styleOption: true } },
  optionGroups: { include: { choices: true }, orderBy: { sortOrder: "asc" } }
} satisfies Prisma.MenuItemInclude;

export type PriceableItem = Prisma.MenuItemGetPayload<{ include: typeof priceableItemInclude }>;

export interface PriceSelection {
  sizeOptionId?: string | undefined;
  sizeSlug?: string | undefined;
  styleOptionId?: string | undefined;
  styleSlug?: string | undefined;
  optionChoiceId?: string | undefined;
  optionChoiceName?: string | undefined;
}

export interface ResolvedPrice {
  unitPrice: Prisma.Decimal;
  sizeSnapshot: string | null;
  styleSnapshot: string | null;
  optionSnapshot: string | null;
}

/**
 * A price of null is the server-side half of the menu's "Pregunta el precio"
 * rule: the item is listed but not orderable. It is a 422, never a silent 0.
 */
export function priceUnavailable(itemName: string): HttpError {
  return new HttpError(
    422,
    "PRICE_UNAVAILABLE",
    `"${itemName}" has no published price and cannot be ordered online`
  );
}

function unorderable(message: string): HttpError {
  return new HttpError(422, "ITEM_UNORDERABLE", message);
}

/**
 * Resolves the current server-side price for one order line. The client never
 * supplies a price — whatever it sends is ignored and recomputed here.
 */
export function resolvePrice(item: PriceableItem, selection: PriceSelection): ResolvedPrice {
  if (!item.available) {
    throw unorderable(`"${item.name}" is not available right now`);
  }
  if (!item.category.active) {
    throw unorderable(`"${item.name}" is not available right now`);
  }

  let base: Prisma.Decimal | null;
  let sizeSnapshot: string | null = null;
  let styleSnapshot: string | null = null;

  if (item.itemType === "SIZE_STYLE_MATRIX") {
    const wantsSize = selection.sizeOptionId ?? selection.sizeSlug;
    const wantsStyle = selection.styleOptionId ?? selection.styleSlug;
    if (!wantsSize || !wantsStyle) {
      throw badRequest(`"${item.name}" needs both a size and a style`);
    }

    const cell = item.priceCells.find((candidate) => {
      const sizeMatches = selection.sizeOptionId
        ? candidate.sizeOptionId === selection.sizeOptionId
        : candidate.sizeOption.slug === selection.sizeSlug;
      const styleMatches = selection.styleOptionId
        ? candidate.styleOptionId === selection.styleOptionId
        : candidate.styleOption.slug === selection.styleSlug;
      return sizeMatches && styleMatches;
    });

    if (!cell) {
      throw unorderable(`"${item.name}" is not offered in that size and style`);
    }
    if (!cell.sizeOption.active || !cell.styleOption.active) {
      throw unorderable(`"${item.name}" is not offered in that size and style`);
    }
    if (cell.price === null) {
      throw priceUnavailable(item.name);
    }

    base = cell.price;
    sizeSnapshot = cell.sizeOption.name;
    styleSnapshot = cell.styleOption.name;
  } else {
    base = item.flatPrice;
  }

  const wantsChoice = selection.optionChoiceId ?? selection.optionChoiceName;
  let optionSnapshot: string | null = null;
  let unitPrice: Prisma.Decimal | null = base;

  if (wantsChoice) {
    const choices = item.optionGroups.flatMap((group) => group.choices);
    const choice = choices.find((candidate) =>
      selection.optionChoiceId
        ? candidate.id === selection.optionChoiceId
        : candidate.name.toLowerCase() === selection.optionChoiceName?.toLowerCase()
    );

    if (!choice) {
      throw unorderable(`"${item.name}" does not offer that option`);
    }
    if (!choice.available) {
      throw unorderable(`"${choice.name}" is not available right now`);
    }

    optionSnapshot = choice.name;
    if (choice.priceOverride !== null) {
      unitPrice = choice.priceOverride;
    } else {
      if (base === null) {
        throw priceUnavailable(item.name);
      }
      unitPrice = base.plus(choice.priceDelta);
    }
  } else {
    const missing = item.optionGroups.find((group) => group.required && group.minSelections > 0);
    if (missing) {
      throw badRequest(`"${item.name}" needs a ${missing.name.toLowerCase()} selection`);
    }
  }

  if (unitPrice === null) {
    throw priceUnavailable(item.name);
  }

  return { unitPrice: money(unitPrice), sizeSnapshot, styleSnapshot, optionSnapshot };
}
