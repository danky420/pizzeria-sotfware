import { z } from "zod";

const MINUTES_IN_DAY = 24 * 60;

// Minutes from midnight. closesAt may equal 1440 ("12:00 am"), which is how the
// static page already writes midnight closings (`c: 24`).
const minuteSchema = z.number().int().min(0).max(MINUTES_IN_DAY);

export const businessHoursDay = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    opensAt: minuteSchema.nullable(),
    closesAt: minuteSchema.nullable()
  })
  .refine(
    (day) => (day.opensAt === null) === (day.closesAt === null),
    "Set both opensAt and closesAt, or null for a closed day"
  )
  .refine(
    (day) => day.opensAt === null || day.closesAt === null || day.closesAt > day.opensAt,
    "closesAt must be after opensAt"
  );

export const putHoursBody = z
  .object({
    days: z.array(businessHoursDay).min(1).max(7)
  })
  .refine(
    (body) => new Set(body.days.map((day) => day.dayOfWeek)).size === body.days.length,
    "Each dayOfWeek may appear only once"
  );
export type PutHoursBody = z.infer<typeof putHoursBody>;
