# Hide Promociones from the admin nav

## Context

The promotions feature isn't in use right now — no active promotion codes,
no plan to run one imminently. Having it in the primary nav is a
distraction for a screen nobody needs today.

## What's built

Removed the `Promociones` entry from `admin/src/components/AppShell.tsx`'s
`NAV` array. Nothing else changed: the route (`/promotions`), the page
(`PromotionsPage`), and the backend (`routes/admin/promotions.ts`,
`services/promotions.ts`) are all untouched — this is a nav-visibility
decision, not a feature removal. Order editing still reuses
`services/promotions.ts`'s discount-recomputation logic
(`docs/order-editing.md`), which keeps working regardless of whether the
nav link exists.

## What this does not do

- Doesn't disable or gate the `/promotions` route — it's just not linked
  from anywhere in the nav anymore. Someone who already has the URL (or
  types it) still reaches the page.
- Doesn't touch any existing `Promotion` rows in the database, or the
  order-editing discount-recomputation path that depends on them.

## Verification

Typechecked and built clean. Verified in a real browser: `Promociones` is
gone from the nav, the remaining items are unaffected, and navigating
directly to `/promotions` still renders the page correctly.
