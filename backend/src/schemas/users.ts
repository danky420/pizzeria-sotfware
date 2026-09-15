import { z } from "zod";
import { nameSchema } from "./common.js";

export const adminRoleSchema = z.enum(["SUPER_ADMIN", "OWNER", "MANAGER", "STAFF"]);

export const passwordSchema = z
  .string()
  .min(12, "Use at least 12 characters")
  .max(200);

export const createUserBody = z.object({
  email: z.string().trim().toLowerCase().email().max(180),
  name: nameSchema,
  password: passwordSchema,
  role: adminRoleSchema.default("STAFF")
});
export type CreateUserBody = z.infer<typeof createUserBody>;

export const updateUserBody = z
  .object({
    name: nameSchema,
    password: passwordSchema,
    role: adminRoleSchema,
    active: z.boolean()
  })
  .partial();
export type UpdateUserBody = z.infer<typeof updateUserBody>;
