import { z } from "zod";
import {
  descriptionSchema,
  idSchema,
  moneySchema,
  nameSchema,
  nullableMoneySchema,
  slugSchema,
  sortOrderSchema
} from "./common.js";

export const itemTypeSchema = z.enum(["FLAT", "SIZE_STYLE_MATRIX"]);
export const selectionTypeSchema = z.enum(["SINGLE", "MULTIPLE"]);

const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Use a #RRGGBB hex colour");

// The built-in, cuisine-agnostic icon choices a category can pick before (or
// instead of) uploading its own image -- see docs/multi-tenant-branding-plan.md.
// A validated string, not a DB enum, so adding one later never needs a migration
// (same reasoning as SUPPORTED_COLOR_SCHEMES in schemas/locations.ts). Each key
// maps to an existing hand-drawn icon component in customer/src/lib/menu.tsx;
// "generic" is the plate-and-cutlery fallback for a category that fits none of
// these.
export const CATEGORY_ICON_KEYS = [
  "pizza",
  "burger",
  "wings",
  "pasta",
  "dessert",
  "frappe",
  "coffee",
  "bottle",
  "can",
  "generic"
] as const;
export const categoryIconKeySchema = z.enum(CATEGORY_ICON_KEYS);

// Which card component the storefront uses for this category's items --
// "gallery" is the big, image-forward vertical card (previously hardcoded to
// only the "pizzas" slug), "rows" the compact horizontal one used everywhere
// else. Null defers to the seed-time default (rows, except pizzas).
export const CATEGORY_DISPLAY_STYLES = ["gallery", "rows"] as const;
export const categoryDisplayStyleSchema = z.enum(CATEGORY_DISPLAY_STYLES);

export const createCategoryBody = z.object({
  slug: slugSchema,
  name: nameSchema,
  description: descriptionSchema.nullish(),
  iconKey: categoryIconKeySchema.nullish(),
  displayStyle: categoryDisplayStyleSchema.nullish(),
  sortOrder: sortOrderSchema.default(0),
  active: z.boolean().default(true)
});
export type CreateCategoryBody = z.infer<typeof createCategoryBody>;

export const updateCategoryBody = createCategoryBody.partial();
export type UpdateCategoryBody = z.infer<typeof updateCategoryBody>;

// Every category id for one location, in the new display order -- sortOrder
// becomes each id's index. Capped generously above any real menu's category
// count, just to bound the transaction size.
export const reorderCategoriesBody = z.object({
  categoryIds: z.array(idSchema).min(1).max(200)
});
export type ReorderCategoriesBody = z.infer<typeof reorderCategoriesBody>;

export const createSizeOptionBody = z.object({
  slug: slugSchema,
  name: nameSchema,
  comment: descriptionSchema.nullish(),
  sortOrder: sortOrderSchema.default(0),
  active: z.boolean().default(true)
});
export type CreateSizeOptionBody = z.infer<typeof createSizeOptionBody>;
export const updateSizeOptionBody = createSizeOptionBody.partial();
export type UpdateSizeOptionBody = z.infer<typeof updateSizeOptionBody>;

export const createStyleOptionBody = z.object({
  slug: slugSchema,
  name: nameSchema,
  description: descriptionSchema.nullish(),
  sortOrder: sortOrderSchema.default(0),
  active: z.boolean().default(true)
});
export type CreateStyleOptionBody = z.infer<typeof createStyleOptionBody>;
export const updateStyleOptionBody = createStyleOptionBody.partial();
export type UpdateStyleOptionBody = z.infer<typeof updateStyleOptionBody>;

export const createItemBody = z.object({
  slug: slugSchema,
  name: nameSchema,
  description: descriptionSchema.nullish(),
  itemType: itemTypeSchema.default("FLAT"),
  // null is meaningful: "Pregunta el precio" — the item shows but cannot be ordered.
  flatPrice: nullableMoneySchema.default(null),
  // Cosmetic sub-heading within the category's list, e.g. "Cafés y tés"
  // inside a "Frappés y café" category. Null renders with no sub-heading.
  subgroupLabel: nameSchema.nullish(),
  // Overrides the category's own iconKey for this one item -- see MenuItem in
  // schema.prisma.
  iconKey: categoryIconKeySchema.nullish(),
  toppingColors: z.array(hexColorSchema).max(12).nullish(),
  isFeatured: z.boolean().default(false),
  ageRestricted: z.boolean().default(false),
  available: z.boolean().default(true),
  sortOrder: sortOrderSchema.default(0)
});
export type CreateItemBody = z.infer<typeof createItemBody>;

export const updateItemBody = createItemBody.partial();
export type UpdateItemBody = z.infer<typeof updateItemBody>;

export const patchItemPriceBody = z.object({ flatPrice: nullableMoneySchema });
export type PatchItemPriceBody = z.infer<typeof patchItemPriceBody>;

export const patchItemAvailabilityBody = z.object({ available: z.boolean() });
export type PatchItemAvailabilityBody = z.infer<typeof patchItemAvailabilityBody>;

export const putPriceMatrixBody = z.object({
  cells: z
    .array(
      z.object({
        sizeOptionId: idSchema,
        styleOptionId: idSchema,
        price: nullableMoneySchema
      })
    )
    .max(200)
});
export type PutPriceMatrixBody = z.infer<typeof putPriceMatrixBody>;

export const createOptionGroupBody = z
  .object({
    name: nameSchema,
    selectionType: selectionTypeSchema.default("SINGLE"),
    required: z.boolean().default(true),
    minSelections: z.number().int().min(0).max(20).default(1),
    maxSelections: z.number().int().min(1).max(20).default(1),
    sortOrder: sortOrderSchema.default(0)
  })
  .refine((group) => group.maxSelections >= group.minSelections, "maxSelections must be >= minSelections");
export type CreateOptionGroupBody = z.infer<typeof createOptionGroupBody>;

export const updateOptionGroupBody = z
  .object({
    name: nameSchema,
    selectionType: selectionTypeSchema,
    required: z.boolean(),
    minSelections: z.number().int().min(0).max(20),
    maxSelections: z.number().int().min(1).max(20),
    sortOrder: sortOrderSchema
  })
  .partial();
export type UpdateOptionGroupBody = z.infer<typeof updateOptionGroupBody>;

export const createChoiceBody = z.object({
  name: nameSchema,
  priceDelta: moneySchema.default(0),
  priceOverride: nullableMoneySchema.default(null),
  available: z.boolean().default(true),
  sortOrder: sortOrderSchema.default(0)
});
export type CreateChoiceBody = z.infer<typeof createChoiceBody>;

export const updateChoiceBody = createChoiceBody.partial();
export type UpdateChoiceBody = z.infer<typeof updateChoiceBody>;
