# Online payments (Mercado Pago)

## Context

Every other planning doc in this repo currently states, as a settled fact,
that there is no online payment: a customer places a real order through
`customer/` but pays cash or card in person, on delivery or pickup
(`readme.md`, `docs/backend-admin-plan.md`, `docs/order-abuse-prevention.md`).
This plan is what changes that invariant, deliberately and for the first
time — those three docs get updated once this ships (see "Rollout phasing"),
not before.

Decisions already made with the user (do not re-litigate):

- **Processor: Mercado Pago.** It's the dominant processor in Mexico, and
  unlike Stripe it supports OXXO cash vouchers alongside cards — relevant
  for a walk-up/phone-order customer base that isn't guaranteed to have a
  card. Conekta was the other Mexico-focused option considered but has a
  smaller/less mature SDK ecosystem.
- **Online payment is optional, not mandatory.** At checkout the customer
  picks "pay online now" or "pay on delivery/pickup" — the existing
  cash/card-on-delivery flow keeps working exactly as it does today for
  anyone who doesn't want to pay online. This is additive, not a checkout
  redesign.
- **The Mercado Pago business account does not exist yet.** Creating and
  verifying it (KYC, linking a payout bank account) is a prerequisite this
  plan does not do — it's the owner's action item, not code. Development and
  testing against Mercado Pago's sandbox (test credentials, test cards, test
  buyer accounts) needs no real business account, so implementation can
  start and be fully tested before that account exists; going live in
  production is what's blocked on it.

**Integration model: Checkout Pro, not Checkout Bricks or raw card fields.**
Checkout Pro is Mercado Pago's hosted, redirect-based checkout — the backend
creates a "preference" (what's being bought, for how much) and gets back a
URL; the customer is sent to Mercado Pago's own page to pay, then returns.
For a first payment integration this is the right tradeoff over an embedded
card form: no card data ever touches this codebase (Mercado Pago is the one
in PCI scope, not us), no client-side public key or payment SDK is needed
(only a server-side secret), and it's the fastest path to something real and
safe. Embedded checkout (Bricks) is a plausible later upgrade for a smoother
in-page UX; not the starting point.

## Data model changes

New `Payment` model, one-to-many off `Order` (a customer can retry a failed
or abandoned payment, so this is a log of attempts, not a single row):

```prisma
enum PaymentProvider {
  MERCADOPAGO
}

enum PaymentStatus {
  PENDING
  APPROVED
  REJECTED
  EXPIRED
  REFUNDED
}

model Payment {
  id            String          @id @default(cuid())
  orderId       String
  provider      PaymentProvider @default(MERCADOPAGO)
  externalId    String?         @unique   // Mercado Pago's payment id, once known
  preferenceId  String?                    // Mercado Pago's preference id, set at creation
  status        PaymentStatus   @default(PENDING)
  amount        Decimal         @db.Decimal(12, 2)
  rawPayload    Json?                      // last webhook/API payload, for audit + debugging
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt

  order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@index([orderId])
}
```

`Order` gets two new fields:

- `paymentMethod: PaymentMethod @default(ON_DELIVERY)` — enum
  `ON_DELIVERY | ONLINE`. Set once, at submit time, from what the customer
  picked.
- `paymentStatus: OrderPaymentStatus @default(NOT_APPLICABLE)` — enum
  `NOT_APPLICABLE | PENDING | PAID | FAILED | REFUNDED`. `NOT_APPLICABLE` for
  every `ON_DELIVERY` order (today's entire order history backfills to this).
  This is a cached rollup kept in sync from `Payment` rows by the webhook
  handler, the same pattern `Customer.totalSpent` already uses (an
  incremented/set cache, never re-derived by summing on every read) — cheap
  to filter and display on the orders list without a join.

## Backend

### Extending order submission

`POST /api/public/locations/:slug/orders` (`backend/src/routes/public/orders.ts`)
gains a required `paymentMethod` field on `submitOrderBody`. Behavior forks
only at the very end, after the existing transaction that creates the
`Order` + `Customer` upsert — nothing about pricing, promotions, or the
one-open-order-per-phone constraint changes:

- `ON_DELIVERY`: exactly today's response, unchanged.
- `ONLINE`: the order is created with `paymentStatus: PENDING`, then the
  backend calls Mercado Pago's Preferences API (server-side, using
  `MERCADOPAGO_ACCESS_TOKEN`) to create a preference for the order total,
  with an `expiration_date_to` (proposed: 30 minutes — open question below)
  and `back_urls` pointing at a customer-site return page. The response to
  the frontend includes the resulting `init_point` checkout URL so it can
  redirect immediately.

### Webhook

New route, `POST /api/public/payments/mercadopago/webhook` — Mercado Pago
calls this from their own servers, unauthenticated by session (there is no
admin/customer cookie involved), so it lives under `routes/public/` next to
order submission. What it must do, in order:

1. **Validate the notification's signature** against
   `MERCADOPAGO_WEBHOOK_SECRET`, per Mercado Pago's current webhook-signing
   scheme (`x-signature`/`x-request-id` headers) — reject anything that
   doesn't verify before touching the database. The exact header/HMAC
   details need to be confirmed against Mercado Pago's webhooks
   documentation at implementation time rather than assumed here.
2. **Never trust the webhook body's amount/status directly.** Use the
   payment id it carries to call Mercado Pago's "Get Payment" API and take
   the authoritative status from that response — this is Mercado Pago's own
   recommended pattern, not an extra precaution invented here.
3. **Upsert the local `Payment` row** by `externalId` (idempotent: Mercado
   Pago can and does redeliver the same notification more than once — a
   second delivery for an already-`APPROVED` payment is a no-op, not a
   double-processed order).
4. **On a first transition to `APPROVED`**: set `Order.paymentStatus = PAID`
   and advance `Order.status` from `PENDING` to `CONFIRMED` — this is the
   one behavioral change to the kitchen-facing flow: an `ONLINE` order
   doesn't reach the kitchen queue as something to act on until it's
   actually paid. `ON_DELIVERY` orders are entirely unaffected, they still
   start at `PENDING` and move on staff action exactly as today.
5. **On `REJECTED`/cancelled-by-buyer**: set `Order.paymentStatus = FAILED`,
   leave `Order.status` at `PENDING` so the customer can retry (see below)
   or the order can expire and auto-cancel.

Mercado Pago's redirect back to `back_urls` (success/pending/failure) is UX
only, not a source of truth — a customer can close the tab mid-payment and
the webhook is what actually confirms anything. The return page just shows
"confirming your payment" and polls order status, the same polling pattern
`docs/order-tracking-plan.md` already established for the tracker.

### Interaction with the one-open-order-per-phone constraint

`docs/order-abuse-prevention.md`'s partial unique index treats any
non-terminal order (`PENDING`, `CONFIRMED`, `PREPARING`, `READY`) as "open,"
occupying that customer's one slot. An `ONLINE` order sitting in `PENDING`
while unpaid — including one the customer simply abandons at Mercado Pago's
page — would otherwise lock them out of placing a new order indefinitely.
Fix: give the Mercado Pago preference a real `expiration_date_to`, and run a
small in-process sweep (same "no new infra" precedent as the SSE note in
`docs/order-tracking-plan.md` — one backend instance today, so a plain
`setInterval` is enough) that cancels any `ONLINE` order past its payment
window with no `APPROVED` payment, freeing the customer's slot the same way
a normal cancellation already does.

### Refunds

New admin-only action (`BACK_OFFICE_ROLES`, matching every other
money-affecting admin route) on an order with a `PAID` `Payment`: calls
Mercado Pago's refund API, marks the `Payment` row `REFUNDED` and
`Order.paymentStatus = REFUNDED`. Does not force `Order.status` backward —
consistent with `Order.status` already being a one-way kitchen workflow, not
a financial ledger; a refund is a financial event recorded on `Payment`, not
a kitchen-state change.

### Secrets

`MERCADOPAGO_ACCESS_TOKEN` and `MERCADOPAGO_WEBHOOK_SECRET`, server-side
only, same tier as `SESSION_COOKIE_SECRET` in `.env.example`. No `VITE_*`
variable is needed anywhere — Checkout Pro is a pure redirect, so no
frontend ever holds a Mercado Pago key. Today's deployment model is one
backend instance per client (`docs/backend-admin-plan.md`, Railway project
per client) with global env-var secrets, so one credential pair per
deployment matches how every other secret already works here. If this
project ever becomes one shared instance serving multiple independent
restaurants' own Mercado Pago accounts, credentials would need to move to
per-`Location` storage — flagged as a real follow-up, not solved here, the
same way `docs/multi-tenant-branding-plan.md` scoped itself to branding only.

## Frontend (`customer/`)

- `CartSheet.tsx` gains a payment-method choice ("Pagar en línea ahora" /
  "Pagar al recibir") before the final submit button.
- On submit with online payment selected, `submitOrder`'s response carries
  the Mercado Pago checkout URL; the app redirects (`window.location.href`)
  instead of showing the normal on-screen confirmation immediately.
- A new return landing (extends `TrackingPage.tsx` or a thin sibling page)
  handles Mercado Pago's redirect back, shows "confirming your payment," and
  polls order status until `paymentStatus` resolves — then shows the normal
  confirmation, or a retry option on failure/expiry that requests a fresh
  preference for the same order rather than making the customer rebuild
  their cart.

## Admin / employee

- Order detail (`packages/portal-shared/src/orders/OrderDetailPage.tsx`)
  shows payment method and payment status alongside the fields it already
  has.
- Refund action gated `BACK_OFFICE_ROLES`, same convention as every other
  money-affecting admin action in this codebase.

## Rollout phasing

1. Schema + backend (`Payment` model, preference creation, webhook, expiry
   sweep) built and tested entirely against Mercado Pago's sandbox — no
   production credentials needed yet.
2. Customer checkout UI (optional online payment, return/confirmation page).
3. Admin/employee visibility + refunds.
4. Update the three docs that currently assert "no online payment"
   (`readme.md`, `docs/backend-admin-plan.md`, `docs/order-abuse-prevention.md`)
   once this actually ships — they're a documented invariant this feature
   is intentionally retiring, not something to leave stale.
5. Production cutover only once (a) the owner has a verified Mercado Pago
   business account with a payout bank account linked, and (b) a full
   sandbox run of approved, rejected, and expired-abandoned payments has
   been exercised end to end.

## Open questions for the user

- **Analytics**: should an `ONLINE` order's revenue count in admin analytics
  while it's still `PENDING` (unpaid), or only once `PAID`? (Leaning toward
  only `PAID`, to avoid inflating revenue with abandoned checkouts, but this
  changes existing analytics queries and should be a deliberate choice.)
- **Payment window**: is 30 minutes the right expiry before an unpaid
  `ONLINE` order auto-cancels and frees the customer's order slot?
- **Employee visibility**: should `STAFF` (not just back-office roles) see
  payment status in the employee app's order queue, given they already see
  full order detail there today?

## What this plan does not cover

- In-store card-terminal payment — untouched; that's the shop's own
  physical terminal at delivery/pickup, nothing to do with this system.
- Saved cards or any repeat-customer stored payment method.
- Partial/line-item refunds — only full-order refunds are planned, matching
  how cancellation already treats an order as one financial unit.

This is a plan, not an implementation — no schema migration, route, or UI
change has been made yet. Next step is confirming the open questions above,
then implementing Phase 1 (schema + backend, against sandbox credentials) on
this branch.
