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

export const createCategoryBody = z.object({
  slug: slugSchema,
  name: nameSchema,
  description: descriptionSchema.nullish(),
  sortOrder: sortOrderSchema.default(0),
  active: z.boolean().default(true)
});
export type CreateCategoryBody = z.infer<typeof createCategoryBody>;

export const updateCategoryBody = createCategoryBody.partial();
export type UpdateCategoryBody = z.infer<typeof updateCategoryBody>;

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
