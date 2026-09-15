import type { OrderStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { HttpError } from "../src/lib/http-error.js";
import {
  ORDER_STATUS_FLOW,
  TERMINAL_ORDER_STATUSES,
  assertTransition,
  canTransition,
  endOfDay,
  orderRangeFilter
} from "../src/services/orders.js";

// Pure functions — no database, so these run everywhere.

const ALL_STATUSES: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "COMPLETED",
  "CANCELLED"
];

function expectConflict(from: OrderStatus, to: OrderStatus): HttpError {
  try {
    assertTransition(from, to);
  } catch (error) {
    expect(error).toBeInstanceOf(HttpError);
    return error as HttpError;
  }
  throw new Error(`expected ${from} -> ${to} to be rejected`);
}

describe("order status transitions", () => {
  it("walks the kitchen's happy path end to end", () => {
    const path: OrderStatus[] = ["PENDING", "CONFIRMED", "PREPARING", "READY", "COMPLETED"];
    for (let i = 0; i < path.length - 1; i += 1) {
      expect.soft(canTransition(path[i], path[i + 1]), `${path[i]} -> ${path[i + 1]}`).toBe(true);
    }
  });

  it("lets a shop skip the confirm step and start cooking", () => {
    expect(canTransition("PENDING", "PREPARING")).toBe(true);
  });

  it("allows cancelling from every state that is not terminal", () => {
    for (const status of ALL_STATUSES) {
      const terminal = TERMINAL_ORDER_STATUSES.includes(status);
      expect.soft(canTransition(status, "CANCELLED"), status).toBe(!terminal);
    }
  });

  it("refuses to walk a finished order backwards", () => {
    const error = expectConflict("COMPLETED", "PENDING");
    expect(error.statusCode).toBe(409);
    expect(error.code).toBe("CONFLICT");
  });

  it("leaves both terminal states with nowhere to go", () => {
    for (const status of TERMINAL_ORDER_STATUSES) {
      expect.soft(ORDER_STATUS_FLOW[status], status).toEqual([]);
    }
  });

  it("refuses a no-op transition and reports the current status", () => {
    const error = expectConflict("PREPARING", "PREPARING");
    expect(error.statusCode).toBe(409);
    expect(error.details).toMatchObject({ currentStatus: "PREPARING" });
  });

  it("refuses every skip that jumps past a step", () => {
    const illegal: [OrderStatus, OrderStatus][] = [
      ["PENDING", "READY"],
      ["PENDING", "COMPLETED"],
      ["CONFIRMED", "COMPLETED"],
      ["PREPARING", "COMPLETED"],
      ["READY", "PREPARING"],
      ["CANCELLED", "CONFIRMED"]
    ];
    for (const [from, to] of illegal) {
      expect.soft(canTransition(from, to), `${from} -> ${to}`).toBe(false);
    }
  });
});

describe("date range filtering", () => {
  it("stretches a bare date to the end of that day", () => {
    const to = new Date("2026-09-07T00:00:00.000Z");
    expect(endOfDay(to).toISOString()).toBe("2026-09-07T23:59:59.999Z");
  });

  it("leaves a timestamp that already carries a time alone", () => {
    const to = new Date("2026-09-07T13:45:00.000Z");
    expect(endOfDay(to)).toEqual(to);
  });

  it("builds no filter at all when neither end is given", () => {
    expect(orderRangeFilter(undefined, undefined)).toBeUndefined();
  });

  it("builds a one-sided filter from one end", () => {
    const from = new Date("2026-09-01T00:00:00.000Z");
    expect(orderRangeFilter(from, undefined)).toEqual({ gte: from });
  });
});
