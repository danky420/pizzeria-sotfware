import { z } from "zod";
import { nameSchema, slugSchema } from "./common.js";

export const waNumberSchema = z
  .string()
  .trim()
  .regex(/^[0-9]{10,15}$/, "Digits only, country code included, no + or spaces");

// Display currency only — see docs/backend-admin-plan.md. Switching this for a
// location relabels its existing prices, it never converts them. Widening
// this list later is a one-line change; it's an enum rather than a free
// 3-letter string specifically so an admin can't fat-finger a currency Intl
// won't recognize.
export const SUPPORTED_CURRENCIES = ["MXN", "USD"] as const;
export const currencySchema = z.enum(SUPPORTED_CURRENCIES);

export const createLocationBody = z.object({
  slug: slugSchema,
  name: nameSchema,
  waNumber: waNumberSchema,
  timezone: z.string().trim().min(1).max(64).default("America/Mexico_City"),
  currency: currencySchema.default("MXN"),
  active: z.boolean().default(true)
});
export type CreateLocationBody = z.infer<typeof createLocationBody>;

export const updateLocationBody = createLocationBody.partial();
export type UpdateLocationBody = z.infer<typeof updateLocationBody>;
