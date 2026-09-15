import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { HttpError } from "../src/lib/http-error.js";
import { type PriceableItem, resolvePrice } from "../src/services/pricing.js";

const dec = (value: string) => new Prisma.Decimal(value);

function sizeOption(id: string, slug: string, name: string, active = true) {
  return { id, categoryId: "cat", slug, name, comment: null, sortOrder: 0, active };
}

function styleOption(id: string, slug: string, name: string, active = true) {
  return { id, categoryId: "cat", slug, name, description: null, sortOrder: 0, active };
}

function matrixItem(cells: { size: string; style: string; price: string | null }[]): PriceableItem {
  const sizes = {
    grande: sizeOption("size-grande", "grande", "Grande"),
    chica: sizeOption("size-chica", "chica", "Chica")
  } as const;
  const styles = {
    tradicional: styleOption("style-trad", "tradicional", "Tradicional"),
    rellena: styleOption("style-rellena", "rellena", "Orilla rellena")
  } as const;

  return {
    id: "item-pastor",
    categoryId: "cat",
    slug: "pastor",
    name: "Al pastor",
    itemType: "SIZE_STYLE_MATRIX",
    flatPrice: null,
    available: true,
    category: { id: "cat", slug: "pizzas", name: "Pizzas", active: true },
    priceCells: cells.map((cell, index) => ({
      id: `cell-${index}`,
      menuItemId: "item-pastor",
      sizeOptionId: sizes[cell.size as keyof typeof sizes].id,
      styleOptionId: styles[cell.style as keyof typeof styles].id,
      price: cell.price === null ? null : dec(cell.price),
      sizeOption: sizes[cell.size as keyof typeof sizes],
      styleOption: styles[cell.style as keyof typeof styles]
    })),
    optionGroups: []
  } as unknown as PriceableItem;
}

function flatItem(overrides: Partial<Record<string, unknown>> = {}): PriceableItem {
  return {
    id: "item-agua",
    categoryId: "cat-bebidas",
    slug: "agua",
    name: "Agua",
    itemType: "FLAT",
    flatPrice: null,
    available: true,
    category: { id: "cat-bebidas", slug: "bebidas", name: "Bebidas", active: true },
    priceCells: [],
    optionGroups: [],
    ...overrides
  } as unknown as PriceableItem;
}

const FULL_MATRIX = [
  { size: "grande", style: "tradicional", price: "180.00" },
  { size: "chica", style: "tradicional", price: "120.00" },
  { size: "grande", style: "rellena", price: null },
  { size: "chica", style: "rellena", price: null }
];

describe("matrix price lookup", () => {
  it("resolves a cell by size and style slug", () => {
    const resolved = resolvePrice(matrixItem(FULL_MATRIX), {
      sizeSlug: "grande",
      styleSlug: "tradicional"
    });

    expect(resolved.unitPrice.toFixed(2)).toBe("180.00");
    expect(resolved.sizeSnapshot).toBe("Grande");
    expect(resolved.styleSnapshot).toBe("Tradicional");
  });

  it("resolves a cell by option id", () => {
    const resolved = resolvePrice(matrixItem(FULL_MATRIX), {
      sizeOptionId: "size-chica",
      styleOptionId: "style-trad"
    });

    expect(resolved.unitPrice.toFixed(2)).toBe("120.00");
  });

  it("rejects a cell with no published price instead of charging zero", () => {
    try {
      resolvePrice(matrixItem(FULL_MATRIX), { sizeSlug: "grande", styleSlug: "rellena" });
      throw new Error("expected resolvePrice to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).statusCode).toBe(422);
      expect((error as HttpError).code).toBe("PRICE_UNAVAILABLE");
    }
  });

  it("rejects a size and style combination that is not on the matrix", () => {
    const partial = matrixItem([{ size: "grande", style: "tradicional", price: "180.00" }]);
    try {
      resolvePrice(partial, { sizeSlug: "chica", styleSlug: "rellena" });
      throw new Error("expected resolvePrice to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).statusCode).toBe(422);
    }
  });

  it("requires both a size and a style", () => {
    try {
      resolvePrice(matrixItem(FULL_MATRIX), { sizeSlug: "grande" });
      throw new Error("expected resolvePrice to throw");
    } catch (error) {
      expect((error as HttpError).statusCode).toBe(400);
    }
  });
});

describe("flat price lookup", () => {
  it("returns the published flat price", () => {
    const resolved = resolvePrice(flatItem({ flatPrice: dec("30.00"), name: "Refresco" }), {});
    expect(resolved.unitPrice.toFixed(2)).toBe("30.00");
    expect(resolved.sizeSnapshot).toBeNull();
  });

  it("rejects an item whose price is null", () => {
    try {
      resolvePrice(flatItem(), {});
      throw new Error("expected resolvePrice to throw");
    } catch (error) {
      expect((error as HttpError).code).toBe("PRICE_UNAVAILABLE");
    }
  });

  it("rejects an item the shop switched off", () => {
    try {
      resolvePrice(flatItem({ flatPrice: dec("30.00"), available: false }), {});
      throw new Error("expected resolvePrice to throw");
    } catch (error) {
      expect((error as HttpError).code).toBe("ITEM_UNORDERABLE");
    }
  });
});

describe("option choices", () => {
  const wings = (choicePatch: Record<string, unknown>) =>
    flatItem({
      id: "item-alitas",
      slug: "alitas",
      name: "Alitas",
      flatPrice: dec("65.00"),
      optionGroups: [
        {
          id: "group-salsa",
          menuItemId: "item-alitas",
          name: "Salsa",
          selectionType: "SINGLE",
          required: true,
          minSelections: 1,
          maxSelections: 1,
          sortOrder: 0,
          choices: [
            {
              id: "choice-bbq",
              optionGroupId: "group-salsa",
              name: "BBQ",
              priceDelta: dec("0"),
              priceOverride: null,
              available: true,
              sortOrder: 0,
              ...choicePatch
            }
          ]
        }
      ]
    });

  it("adds the choice's price delta to the base price", () => {
    const resolved = resolvePrice(wings({ priceDelta: dec("15.00") }), { optionChoiceName: "BBQ" });
    expect(resolved.unitPrice.toFixed(2)).toBe("80.00");
    expect(resolved.optionSnapshot).toBe("BBQ");
  });

  it("lets a choice override the base price outright", () => {
    const resolved = resolvePrice(wings({ priceOverride: dec("95.00") }), { optionChoiceId: "choice-bbq" });
    expect(resolved.unitPrice.toFixed(2)).toBe("95.00");
  });

  it("requires a selection when the group is required", () => {
    try {
      resolvePrice(wings({}), {});
      throw new Error("expected resolvePrice to throw");
    } catch (error) {
      expect((error as HttpError).statusCode).toBe(400);
    }
  });
});
