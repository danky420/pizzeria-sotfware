import { z } from "zod";

/**
 * Both analytics endpoints take the same open-ended window. Either end may be
 * omitted ("everything so far", "everything since"); when both are given they
 * must be the right way round, because a reversed range silently returns zero
 * revenue and reads as a business problem rather than a typo.
 */
const dateRange = {
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional()
};

function checkRange(
  value: { from?: Date | undefined; to?: Date | undefined },
  ctx: z.RefinementCtx
): void {
  if (value.from && value.to && value.to < value.from) {
    ctx.addIssue({ code: "custom", path: ["to"], message: "to must be on or after from" });
  }
}

export const analyticsRangeQuery = z.object(dateRange).superRefine(checkRange);
export type AnalyticsRangeQuery = z.infer<typeof analyticsRangeQuery>;

export const topItemsQuery = z
  .object({
    ...dateRange,
    limit: z.coerce.number().int().min(1).max(50).default(10)
  })
  .superRefine(checkRange);
export type TopItemsQuery = z.infer<typeof topItemsQuery>;
