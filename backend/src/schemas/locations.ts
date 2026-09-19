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

// The 3 preset storefront palettes a tenant can pick in admin/ -- see
// docs/multi-tenant-branding-plan.md. A validated string, same pattern as
// currency above: an enum column would need a migration every time a scheme
// is added or renamed.
export const SUPPORTED_COLOR_SCHEMES = ["rojo-clasico", "verde-oliva", "azul-marino"] as const;
export const colorSchemeSchema = z.enum(SUPPORTED_COLOR_SCHEMES);

export const createLocationBody = z.object({
  slug: slugSchema,
  name: nameSchema,
  waNumber: waNumberSchema,
  timezone: z.string().trim().min(1).max(64).default("America/Mexico_City"),
  currency: currencySchema.default("MXN"),
  addressText: z.string().trim().max(300).optional(),
  tagline: z.string().trim().max(160).optional(),
  legalNotice: z.string().trim().max(200).optional(),
  demoNotice: z.string().trim().max(400).optional(),
  colorScheme: colorSchemeSchema.default("rojo-clasico"),
  active: z.boolean().default(true)
});
export type CreateLocationBody = z.infer<typeof createLocationBody>;

export const updateLocationBody = createLocationBody.partial();
export type UpdateLocationBody = z.infer<typeof updateLocationBody>;
