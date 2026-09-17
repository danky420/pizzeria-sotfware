import { z } from "zod";
import { idSchema, paginationQuery } from "./common.js";

export const fulfillmentTypeSchema = z.enum(["PICKUP", "DELIVERY", "DINE_IN"]);
export const orderStatusSchema = z.enum([
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "COMPLETED",
  "CANCELLED"
]);

// Caps below are the whole defence for an unauthenticated write endpoint: they
// bound how much work one request can ask the server (and Postgres) to do.
export const MAX_ORDER_LINES = 40;
export const MAX_LINE_QUANTITY = 50;

export const phoneSchema = z
  .string()
  .trim()
  .min(7)
  .max(25)
  .regex(/^[0-9+()\-\s]+$/, "Phone may only contain digits, spaces and + ( ) -");

const orderLine = z
  .object({
    menuItemId: idSchema.optional(),
    itemSlug: z.string().trim().min(1).max(64).optional(),
    categorySlug: z.string().trim().min(1).max(64).optional(),
    sizeOptionId: idSchema.optional(),
    sizeSlug: z.string().trim().min(1).max(64).optional(),
    styleOptionId: idSchema.optional(),
    styleSlug: z.string().trim().min(1).max(64).optional(),
    optionChoiceId: idSchema.optional(),
    optionChoiceName: z.string().trim().min(1).max(120).optional(),
    quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY),
    notes: z.string().trim().max(200).optional()
  })
  .refine(
    (line) => Boolean(line.menuItemId ?? line.itemSlug),
    "Each line needs either menuItemId or itemSlug"
  );

export const submitOrderBody = z.object({
  fulfillmentType: fulfillmentTypeSchema.default("PICKUP"),
  customer: z.object({
    name: z.string().trim().max(80).optional(),
    // Required, not optional: phone is the only channel staff have to reach a
    // customer about their order now that WhatsApp is off the order path.
    phone: phoneSchema,
    address: z.string().trim().max(200).optional(),
    note: z.string().trim().max(500).optional()
  }),
  items: z.array(orderLine).min(1).max(MAX_ORDER_LINES),
  promotionCode: z.string().trim().toUpperCase().min(2).max(32).optional()
});
export type SubmitOrderBody = z.infer<typeof submitOrderBody>;
export type SubmitOrderLine = SubmitOrderBody["items"][number];

export const patchOrderStatusBody = z.object({ status: orderStatusSchema });
export type PatchOrderStatusBody = z.infer<typeof patchOrderStatusBody>;

/**
 * Admin-side order listing. `from`/`to` bound `createdAt`; `to` is treated as
 * inclusive by the handler so a caller can pass a plain date without losing that
 * day's orders. Pagination is mandatory (defaulted) — an orders table grows
 * without limit and no admin screen ever wants the whole history in one response.
 */
export const orderListQuery = paginationQuery.extend({
  status: orderStatusSchema.optional(),
  customerId: idSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  // Free text: matches a customer name/phone substring or an exact order number.
  q: z.string().trim().min(1).max(100).optional()
});
export type OrderListQuery = z.infer<typeof orderListQuery>;
