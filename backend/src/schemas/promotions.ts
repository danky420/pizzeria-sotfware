import { z } from "zod";
import { descriptionSchema, idSchema, moneySchema, nameSchema } from "./common.js";

export const discountTypeSchema = z.enum(["PERCENT", "FIXED"]);
export const promotionScopeSchema = z.enum(["ORDER", "CATEGORY", "ITEM"]);

const basePromotion = z.object({
  name: nameSchema,
  description: descriptionSchema.nullish(),
  code: z.string().trim().toUpperCase().min(2).max(32).nullish(),
  discountType: discountTypeSchema,
  discountValue: moneySchema,
  scope: promotionScopeSchema.default("ORDER"),
  categoryId: idSchema.nullish(),
  menuItemId: idSchema.nullish(),
  minSubtotal: moneySchema.nullish(),
  startsAt: z.coerce.date().nullish(),
  endsAt: z.coerce.date().nullish(),
  active: z.boolean().default(true)
});

function checkScopeTarget(
  value: {
    scope?: "ORDER" | "CATEGORY" | "ITEM";
    categoryId?: string | null | undefined;
    menuItemId?: string | null | undefined;
  },
  ctx: z.RefinementCtx
): void {
  if (value.scope === "CATEGORY" && !value.categoryId) {
    ctx.addIssue({ code: "custom", path: ["categoryId"], message: "categoryId is required for a CATEGORY promotion" });
  }
  if (value.scope === "ITEM" && !value.menuItemId) {
    ctx.addIssue({ code: "custom", path: ["menuItemId"], message: "menuItemId is required for an ITEM promotion" });
  }
}

function checkPercentRange(
  value: { discountType?: "PERCENT" | "FIXED"; discountValue?: number },
  ctx: z.RefinementCtx
): void {
  if (value.discountType === "PERCENT" && value.discountValue !== undefined && value.discountValue > 100) {
    ctx.addIssue({ code: "custom", path: ["discountValue"], message: "A percent discount cannot exceed 100" });
  }
}

function checkWindow(
  value: { startsAt?: Date | null | undefined; endsAt?: Date | null | undefined },
  ctx: z.RefinementCtx
): void {
  if (value.startsAt && value.endsAt && value.endsAt <= value.startsAt) {
    ctx.addIssue({ code: "custom", path: ["endsAt"], message: "endsAt must be after startsAt" });
  }
}

export const createPromotionBody = basePromotion.superRefine((value, ctx) => {
  checkScopeTarget(value, ctx);
  checkPercentRange(value, ctx);
  checkWindow(value, ctx);
});
export type CreatePromotionBody = z.infer<typeof createPromotionBody>;

export const updatePromotionBody = basePromotion.partial().superRefine((value, ctx) => {
  checkScopeTarget(value, ctx);
  checkPercentRange(value, ctx);
  checkWindow(value, ctx);
});
export type UpdatePromotionBody = z.infer<typeof updatePromotionBody>;

export const promotionListQuery = z.object({
  activeOnly: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true")
});
