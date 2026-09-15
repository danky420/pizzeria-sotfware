import { z } from "zod";

export const idSchema = z.string().min(1).max(64);

export const idParams = z.object({ id: idSchema });
export type IdParams = z.infer<typeof idParams>;

export const slugParams = z.object({ slug: z.string().min(1).max(64) });
export type SlugParams = z.infer<typeof slugParams>;

export const slugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes");

export const nameSchema = z.string().trim().min(1).max(120);
export const descriptionSchema = z.string().trim().max(500);

// Money arrives as a plain number and is converted to Prisma.Decimal before it
// touches the database — never used for arithmetic while it is still a float.
export const moneySchema = z.number().min(0).max(999999.99);
export const nullableMoneySchema = moneySchema.nullable();

export const sortOrderSchema = z.number().int().min(0).max(10000);

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});
export type PaginationQuery = z.infer<typeof paginationQuery>;

export const locationFilterQuery = z.object({
  locationId: idSchema.optional()
});

export function paginate(query: PaginationQuery) {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}
