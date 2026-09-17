# Order abuse prevention

## Context

There is no online payment (`readme.md`, `docs/customer-site-rework-plan.md`)
— a customer pays cash or card on delivery or pickup. That means nothing
technical stops someone from submitting many orders the kitchen has no way
to bill for if they never show up or answer the phone. Two options were
considered for cutting that off:

1. **Phone verification** (SMS OTP via a third-party provider like Twilio
   Verify) before an order can be submitted.
2. **At most one open order per phone number at a time**, combined with the
   confirmation call staff already make to every order.

Phone verification was the more airtight option but was set aside: it needs
a paid third-party account and new secrets, costs roughly $0.07–$0.12 per
verification attempt once Mexico carrier fees are included (on top of the
~$0.05 Twilio Verify platform fee), and adds a step to checkout (wait for a
text, type in a code) for a walk-up/phone-order crowd that's used to a fast
checkout. The decision was to skip it and lean on what the system already
does for free: `Order.customerPhone` is required specifically so staff can
call back about an order (`CLAUDE.md`, "Known risk areas"), and a fake or
dead number gets caught there at the cost of a little staff time instead of
an ongoing per-order fee. If real-time OTP is ever revisited, the reasoning
and rough cost above is the starting point.

## What's enforced

**At most one non-terminal (`PENDING`, `CONFIRMED`, `PREPARING`, `READY`)
order per customer at a time.** `COMPLETED` and `CANCELLED` don't count —
finishing or cancelling an order frees the customer to place another one
immediately.

This is a **database-level constraint**, not an app-level check-then-insert:
a partial unique index on `Order.customerId` (migration
`20260917021215_one_open_order_per_customer`), scoped to non-terminal
statuses. Prisma's schema can't express a partial unique index (no `WHERE`
clause on `@@unique`), so this constraint exists only in the migration SQL,
not in `schema.prisma`.

```sql
CREATE UNIQUE INDEX "Order_one_open_per_customer"
  ON "Order" ("customerId")
  WHERE "customerId" IS NOT NULL AND "status" NOT IN ('COMPLETED', 'CANCELLED');
```

A DB constraint rather than a `SELECT` then `INSERT` in the route handler:
two concurrent submits for the same customer could both pass an app-level
check before either commits (classic TOCTOU race) — the unique index can't
be raced, since Postgres itself rejects the second insert. The order-submit
handler (`backend/src/routes/public/orders.ts`) catches the resulting
`Prisma.PrismaClientKnownRequestError` (`code === "P2002"`) and turns it into
a `409 CONFLICT` with a plain-language message; `customer/`'s `CartSheet`
maps that code to a Spanish message telling the customer to wait for their
order or call in.

The constraint is on `customerId`, and `Customer` is already scoped by
`(locationId, phone)` — so the same phone digits at two different locations
are two different customers, each with their own open-order slot. That
already matches how customer records work everywhere else in this codebase.

## What this does not do

- It does not stop someone from typing a different made-up phone number for
  every order — that's exactly the gap real phone verification would have
  closed, and exactly why it's still on the table if this ever isn't enough.
  The staff confirmation call is what catches a fake/dead number in practice.
- It does not add any new staff-facing UI. Staff still change status through
  the same `PATCH .../orders/:id/status` endpoint (`admin/`, `employee/`)
  they already use; completing or cancelling an order is what frees that
  customer's slot, with no separate "unlock" step.
- It applies to every path that creates an `Order` row, including a
  hypothetical future staff-side "place an order for a customer" feature —
  there's only one order-creation path today (the public submit endpoint),
  and this constraint is at the database level, so nothing can bypass it
  without deliberately removing the index.

## Verification

Backend: `backend/test/public-orders.test.ts`, `describe("one open order per
phone")` — a second submit while the first is still open gets a 409
regardless of phone formatting; completing or cancelling the first order
allows a new one; the same phone at two different locations is unaffected.
`backend/test/admin-orders.test.ts` and `admin-customers-analytics.test.ts`
were adjusted where their fixtures previously relied on one customer holding
several simultaneously-open orders, which is now the exact thing this
feature prevents.
