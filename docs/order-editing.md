# Order editing

## Context

Two recurring real-world cases had no path in the system at all: a customer
calls to change what they ordered after it's already placed, or the shop
realizes an item didn't go out and needs to remove it from the order. Before
this, the only lever staff had was the order's status (`PENDING` →
`CONFIRMED` → ... → `COMPLETED`/`CANCELLED`) — nothing let anyone touch the
line items or totals of an order that already existed.

The requirement driving the design: any such change must carry a mandatory
reason, and the system must know who made it and when. This is money — a
customer's bill changing after the fact — so "just let staff edit the rows"
without an audit trail was never on the table.

A closely related question came up during review: **add support for adding
a brand-new item to an existing order**, not just adjusting/removing what's
already there. That was deliberately taken on rather than deferred, using
the same size/style/option resolution the customer checkout already uses, so
there's exactly one place in the codebase that decides what an item costs.

## What's built

**`POST /api/admin/orders/:id/edits`** (`ORDER_ROLES` — STAFF included).
Body: `{ reason: string, changes: EditOrderChange[] }`, where each change is
either:

- `{ type: "set_quantity", orderItemId, quantity }` — `quantity: 0` removes
  the line entirely.
- `{ type: "add_item", menuItemId, sizeOptionId?, styleOptionId?,
  optionChoiceId?, quantity, notes? }` — priced via the same `resolvePrice`
  function `POST /api/public/locations/:slug/orders` uses. The client never
  supplies a price; it's always resolved server-side from the live menu.

`reason` is required (min length 1) — there's no way to submit an edit
without one. The whole edit (all changes, the recalculation, the audit
record) happens in one Prisma transaction (`services/order-edits.ts`).

**Totals are always derived, never typed.** `subtotal` is the sum of the
resulting line items' totals. If the order has a promotion applied, its
discount is **recomputed against the new subtotal using the same promotion**
— never re-selected from scratch, which could apply a different deal than
the one the customer actually agreed to at checkout. `Customer.totalSpent`
(an increment-only counter maintained since checkout) is adjusted by the
`total` delta rather than re-derived from scratch, since nothing else in the
codebase treats it as a value safe to recompute wholesale.

**A `COMPLETED` or `CANCELLED` order can't be edited** — same terminal-state
rule `services/orders.ts` already enforces for status transitions.

**Full audit trail**: every edit creates an `OrderEdit` row — `reason`, a
structured human-readable `changes` summary (item added/removed/quantity
changed, with a name/detail/quantity so it reads on its own), `editedById`,
and before/after totals. `OrderEdit.editedById` is `onDelete: Restrict` —
deleting an admin account that has ever edited an order is refused (409,
"deactivate it instead") rather than silently going anonymous.

**Edit history is a back-office concern.** STAFF can make an edit, but the
`edits` array is stripped from every response a STAFF session receives
(`presentOrder(order, { includeEdits })`), including the response to their
own edit — not just hidden in the UI. Only `BACK_OFFICE_ROLES` see who
changed what and why.

**Frontend**: `OrderDetailPage` (shared by `admin/` and `employee/`) gets an
"Editar pedido" panel — per-line quantity inputs, a "Quitar" button, an item
picker (category → item → size/style → option choice → quantity) backed by
a new `GET /api/admin/locations/:id/orders/menu` endpoint
(`ORDER_ROLES`, unlike the `BACK_OFFICE_ROLES`-only `GET .../menu`), and a
mandatory reason field. A "Historial de cambios" panel renders the edit
history for roles that can see it; it simply doesn't render when the array
comes back empty.

## What this does not do

- No arbitrary price override. Every price on an edit comes from the current
  menu, exactly like checkout.
- No editing customer info (name/phone/address/note) — only line items and
  the totals they drive.
- Only one option-group choice per added line, matching the existing
  limitation on the public order-submission schema (`orderLine` in
  `schemas/orders.ts`) — this isn't a new restriction, just an inherited one.
- Doesn't re-evaluate which promotion applies, or apply a promotion code
  that wasn't already on the order.

## Verification

Backend: `backend/test/admin-orders.test.ts`, `describe("editing")` — quantity
change, removal, addition, promotion recomputation against the new subtotal,
missing-reason rejection, unknown-line rejection, terminal-order rejection,
cross-tenant rejection, and edit-history visibility gated by role (both on
`GET` and on the edit response itself). 159 backend tests passing at the time
this shipped.

End-to-end: verified in a real browser as both an OWNER and a STAFF session
(quantity change, item removal, item addition, history visibility difference
between the two roles), including at phone width.
