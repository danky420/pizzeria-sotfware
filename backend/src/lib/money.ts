import { Prisma } from "@prisma/client";

export const ZERO = new Prisma.Decimal(0);

export function toDecimal(value: Prisma.Decimal | number | string): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);
}

// Money is stored as Decimal(10,2)/Decimal(12,2); every total is rounded the same
// way so a sum of line totals can never drift from what the DB column holds.
export function money(value: Prisma.Decimal | number | string): Prisma.Decimal {
  return toDecimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

export function sum(values: Prisma.Decimal[]): Prisma.Decimal {
  return money(values.reduce<Prisma.Decimal>((acc, value) => acc.plus(value), ZERO));
}

export function decimalToNumber(value: Prisma.Decimal | null | undefined): number | null {
  return value === null || value === undefined ? null : Number(value.toFixed(2));
}
