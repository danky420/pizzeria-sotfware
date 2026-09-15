import { z } from "zod";
import { nameSchema, slugSchema } from "./common.js";

export const waNumberSchema = z
  .string()
  .trim()
  .regex(/^[0-9]{10,15}$/, "Digits only, country code included, no + or spaces");

export const createLocationBody = z.object({
  slug: slugSchema,
  name: nameSchema,
  waNumber: waNumberSchema,
  timezone: z.string().trim().min(1).max(64).default("America/Mexico_City"),
  currency: z.string().trim().length(3).toUpperCase().default("MXN"),
  active: z.boolean().default(true)
});
export type CreateLocationBody = z.infer<typeof createLocationBody>;

export const updateLocationBody = createLocationBody.partial();
export type UpdateLocationBody = z.infer<typeof updateLocationBody>;
