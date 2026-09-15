import { z } from "zod";
import { paginationQuery } from "./common.js";

/**
 * `search` matches a customer's name or their phone. Phone numbers are stored
 * digits-only (the public order route strips separators before the upsert), so a
 * search for "272 260" has to be stripped the same way or it could never match.
 */
export const customerListQuery = paginationQuery.extend({
  search: z.string().trim().min(1).max(80).optional()
});
export type CustomerListQuery = z.infer<typeof customerListQuery>;

export const customerOrdersQuery = z.object({
  orderLimit: z.coerce.number().int().min(1).max(100).default(25)
});
export type CustomerOrdersQuery = z.infer<typeof customerOrdersQuery>;

export function phoneSearchKey(search: string): string | null {
  const digits = search.replace(/[^0-9]/g, "");
  return digits.length > 0 ? digits : null;
}
