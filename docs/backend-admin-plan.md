# Backend + customer/admin/employee apps for Pizza's Chesa're

## Context

The site started deliberately backend-less: `src/index.html` (built by `build.py`) was a single static file with hardcoded menu arrays, no accounts, no database, and orders that never touched a server — the page built a `wa.me` link and the customer tapped it.

The project is now growing into four cooperating pieces built around a shared backend and database:

1. **`customer/`** — the real ordering site (React). Replaces `src/index.html`'s role entirely: browse menu, build a cart, submit a real checkout to the backend (no online payment — customer still pays cash/card on delivery or pickup), see an on-screen confirmation. WhatsApp is no longer part of ordering; a general "message us a question" link is the only WhatsApp surface left, and it carries no cart contents.
2. **`admin/`** — the owner/manager back office (React): analytics, order management, menu/pricing management, promotions, customer history, store-hours config, user management. `OWNER`/`MANAGER`/`SUPER_ADMIN` only.
3. **`employee/`** — a lightweight staff app (React, new): see incoming orders, update their status. This is the primary surface for `STAFF` accounts, who are not granted access to `admin/`.
4. **`backend/`** — the Fastify + Postgres API all three frontends call, plus multi-location data modeling (only Chesa're is actually seeded/deployed for now).

`admin/` and `employee/` share a common slice of code (types, API client, auth state, order-status constants, UI primitives) via a new workspace package, `packages/portal-shared/`, rather than duplicating it.

Decisions already made with the user (do not re-litigate):
- Customer flow is a real checkout against the backend, not a WhatsApp deep link; on-screen confirmation with an order number; no online payment.
- Staff and owner/manager are **separate apps** (not a role-gated section of one app): `employee/` for `STAFF`, `admin/` for `OWNER`/`MANAGER`/`SUPER_ADMIN`. `admin/` rejects `STAFF` logins with a message pointing at the employee app rather than granting any in-app access; `employee/` accepts any authenticated role (an owner covering the counter can use it too) but only ever shows the orders queue.
- `admin/`/`employee/` share code via `packages/portal-shared/` (an npm workspace package), not via duplication.
- `src/index.html` is retired now that `customer/` is the real site — archived, not deleted outright (matching the existing `src/archive/` convention for superseded versions).
- Multi-location: schema is properly relational for N locations; only Chesa're is seeded/deployed now.
- Stack: Node.js + TypeScript backend, Postgres, React + TypeScript for all three frontends, hosted on Railway.

## Current build state (read this before touching anything)

This plan has already been partially executed, out of order, across several agent sessions — some of it before this three-app split was decided. Concretely, as of writing:

- **`backend/` — done and verified.** Schema, auth/session/RBAC, all public routes, and the `locations`/`users`/`hours`/`menu`/`promotions` admin routes are implemented and tested (unit tests passing; DB-dependent integration tests written but unrun in this environment — no local Postgres). Treat this as a stable contract.
- **`backend/src/routes/admin/{orders,customers,analytics}.ts`, `services/{orders,analytics}.ts`, `prisma/seed.ts` — written, but unverified.** A later pass implemented these for real (no longer 501 stubs) and wrote a seed script, but the agent hit an account rate limit before it could confirm compilation/tests end-to-end, and it touched `backend/src/routes/admin/menu.ts` despite being told not to — **that file needs a diff review against Phase 1's version before being trusted.**
- **`admin/` — built once already, against the *old* single-app design** (role-gated `STAFF` access to `/orders` inside the same app). It has a working structure (`routes.tsx`, `state/auth.tsx`, `lib/roles.ts`, `components/guards.tsx`, `features/{auth,dashboard,orders,menu,promotions,customers,settings}/`) that is a good extraction source, but per the new decision above it needs rework: drop `STAFF` handling from its own routing (block at the auth boundary instead, pointing at `employee/`), and move onto `packages/portal-shared/` once that exists rather than owning that code itself. Also unverified end-to-end (same rate-limit interruption).
- **`customer/` — a deliberately-scoped rework, not ad hoc.** Built per its own plan doc, `docs/customer-site-rework-plan.md` (agreed separately from this doc): React + Vite, live `GET /api/public/locations/:slug/menu` and `/hours` instead of hardcoded arrays, checkout ported to the real order-submit contract, a PWA/offline layer (app-shell precache + stale-while-revalidate menu caching with a "showing saved menu" notice, checkout disabled offline rather than queued), Railway static hosting, `src/index.html` retired to an archive path once parity is confirmed. A React/Vite app already exists (`App.tsx`, `components/{CartSheet,ProductSheet,MenuSections}.tsx`, `lib/{cart,menu,hours,format}.ts`, `api/{client,types}.ts`) and a built `dist/`. **Still needs verification, not because it was unplanned, but because no one has yet confirmed the implementation matches both plan docs**: diff its order-submit handling against `backend/src/schemas/orders.ts`/`routes/public/orders.ts` line by line, confirm menu/hours are actually fetched live (not hardcoded), and check how much of the PWA/offline layer (phase 2 of the rework plan) actually landed versus is still pending.
- **`packages/portal-shared/`, `employee/` — do not exist yet.**
- **`src/index.html`/`build.py`/`scripts/check_mobile.py`/`CLAUDE.md`/`READER.md` — were rewritten once for a vanilla-JS checkout flow, before the decision to retire `src/index.html` in favor of `customer/`.** That vanilla-JS checkout work is now moot. These files need to move to their *final* state: `src/index.html` archived, `build.py`/`scripts/check_mobile.py` trimmed or retired (see "Retiring the static site" below), and `CLAUDE.md`/`READER.md` rewritten to describe the four-piece architecture, not the vanilla-JS one they currently describe.

## Repo layout (target end state)

```
pizzeria-sotfware/
├── src/corte.html, src/archive/   # src/index.html moves into archive/; corte.html (margin calc) is unrelated, stays
├── build.py, scripts/check_mobile.py   # trimmed to corte.html only, or retired — see below
├── assets/source/*.jpg             # shop menu photos, still the price source of truth for seeding
├── package.json                    # npm workspaces: backend, admin, employee, customer, packages/portal-shared
├── backend/                        # Fastify + TypeScript + Prisma API (done)
│   └── ...(as built — see "Current build state")
├── packages/portal-shared/         # NEW — shared by admin/ and employee/
│   └── src/{types,api-client,auth,order-constants,ui}/...
├── admin/                          # React + Vite SPA, OWNER/MANAGER/SUPER_ADMIN only
│   └── src/{main,App,routes}.tsx, state/, features/{dashboard,menu,promotions,customers,settings}/
├── employee/                       # NEW — React + Vite SPA, orders queue only
│   └── src/{main,App,routes}.tsx, features/orders/
└── customer/                       # React + Vite SPA, the real ordering site
    └── src/{main,App}.tsx, components/, lib/, api/
```

## Stack decisions

- **Fastify** over Express — native TS types, Zod-based request validation, built-in plugin model for per-route rate limiting (needed on the unauthenticated order endpoint).
- **Prisma** + **Postgres** (Railway-managed).
- **Cookie-based server sessions** (httpOnly, `AdminSession` table as source of truth), not JWT — instant revocation for staff accounts, no XSS token theft surface in either SPA.
- **argon2id** for password hashing.
- **One Fastify service serves the API and all three built frontends**, at distinct path prefixes (`/` → `customer/dist`, `/admin` → `admin/dist`, `/staff` → `employee/dist`, `/api/*` → the API), so admin/employee session cookies stay same-origin (sidesteps Railway's `*.up.railway.app` public-suffix `SameSite` quirks) and there's a single Railway service + Postgres to operate. Vite dev servers are still used for local frontend dev (cross-origin, CORS enabled there only).
- **`packages/portal-shared/`** is a plain TypeScript workspace package (no separate build step needed if `admin/`/`employee/` consume its source directly via their bundler, which is the simpler option for two consumers — only add a compiled `dist` step if that turns out not to work cleanly with Vite).

## Database schema (Prisma) — key entities

Unchanged by the three-app split; this is `backend/`'s existing, already-implemented schema. One `MenuItem` model with an `itemType` discriminator (`FLAT` | `SIZE_STYLE_MATRIX`) covers all three price shapes actually present in the menu (flat-price items; the pizza size×style matrix; flavor-choice items like wing sauces/pastas via an option-group side table), instead of one table per shape.

- `Location` (slug, name, waNumber, timezone, currency, active) — root of every relation.
- `BusinessHours` (locationId, dayOfWeek 0–6, opensAt/closesAt in minutes, null = closed).
- `AdminUser` (locationId nullable — null only for `SUPER_ADMIN`, email, passwordHash, role, failedLoginAttempts, lockedUntil) + `AdminSession` (opaque id, adminUserId, expiresAt).
- `MenuCategory` (locationId, slug, name) → `MenuCategorySizeOption` + `MenuCategoryStyleOption`, both scoped to the pizzas category.
- `MenuItem` (categoryId, slug, itemType, flatPrice nullable, toppingColors json, isFeatured, ageRestricted, available) → `MenuItemPriceCell` (sizeOptionId × styleOptionId × price-nullable) and `MenuItemOptionGroup` → `MenuItemOptionChoice`.
- `Promotion` (locationId, discountType percent/fixed, scope order/category/item, startsAt/endsAt, active).
- `Customer` (locationId, phone unique-per-location, name, addressText, lastOrderAt).
- `Order` (locationId, customerId nullable, orderNumber, fulfillmentType, customer* snapshot fields incl. **required** customerPhone, status enum, subtotal/discountTotal/total) → `OrderItem` (menuItemId nullable + name/size/style/option snapshots, unitPrice, quantity, lineTotal).

**`p: null` semantics preserved exactly**: `MenuItem.flatPrice` nullable for flat items, `MenuItemPriceCell.price` nullable per size/style cell — "unorderable, ask for price," enforced server-side.

## API surface

Unchanged by the three-app split — all three frontends call the same `backend/` API.

**Public** (`/api/public/locations/:slug/...`, no auth): `GET /` (basic info), `GET /menu`, `GET /hours`, `POST /orders` (order submit) — this is what `customer/` calls.

**Admin** (`/api/admin/...`, session required): `POST auth/login`, `POST auth/logout`, `GET auth/me`; `GET/POST locations`, `GET/PATCH locations/:id`; `GET/POST locations/:id/users`, `PATCH/DELETE users/:id`; `GET/PUT locations/:id/hours`; `GET locations/:id/menu`; CRUD under `menu/categories[/:id]`, `.../size-options[/:id]`, `.../style-options[/:id]`, `.../items[/:id]`, `PATCH items/:id/price`, `PUT items/:id/price-matrix`, `PATCH items/:id/availability`, CRUD `items/:id/option-groups[/:id]`, `option-groups/:id/choices[/:id]`; CRUD `locations/:id/promotions[/:id]`; `GET locations/:id/orders`, `GET orders/:id`, `PATCH orders/:id/status`; `GET locations/:id/customers`, `GET customers/:id`; `GET locations/:id/analytics/summary?from&to`, `GET .../analytics/top-items?from&to&limit`. `admin/` calls all of it; `employee/` calls only the `auth/*` and `orders` routes.

## Auth/authz

- Sessions: opaque token cookie, httpOnly, `Secure`, `SameSite=Lax` prod / `SameSite=None;Secure` local cross-origin dev, 8h sliding expiry, lazy + daily-sweep cleanup.
- Roles: `SUPER_ADMIN` (locationId null, cross-tenant) / `OWNER` / `MANAGER` / `STAFF` (all location-scoped).
- **Role permission matrix** (enforced server-side in `backend/src/auth/middleware.ts`, not just hidden in either SPA): `STAFF` may only reach orders routes (`GET .../orders`, `GET orders/:id`, `PATCH orders/:id/status`) plus `GET auth/me`/`POST auth/logout` — every other admin route requires `OWNER`/`MANAGER`/`SUPER_ADMIN`.
- **App-level split is a UX convenience on top of that, not a new security boundary**: `admin/`'s login flow checks the returned role and refuses to proceed past login for `STAFF` (shows "usa la vista de empleados" with a link to `employee/`'s URL, logs the session back out) rather than granting any in-app screen; `employee/` accepts any role and always shows the orders queue. Since the backend already enforces the real boundary per-route, this is about not shipping a confusing "half an app" to the wrong audience, not a new mechanism to get right.
- Every admin handler enforces `resource.locationId === session.locationId` (unless `SUPER_ADMIN`) — never trust a `:locationId` path param alone.
- Rate limiting (`@fastify/rate-limit`): login 10/15min per IP+email + account lockout after 5 failures (15min lock); public order-submit ~20/10min per IP plus Zod-enforced payload caps since it's the one unauthenticated write endpoint.

## Customer site (`customer/`)

Governed day-to-day by `docs/customer-site-rework-plan.md`; this doc just tracks how it fits the other three pieces. Already substantially built (see "Current build state") — the remaining work is an audit and finish pass, not a rewrite:
- Diff its order-submit payload/response handling against the real `backend/src/schemas/orders.ts` and `routes/public/orders.ts` — field names, required phone, response shape (`{order:{orderNumber, items, subtotal, discountTotal, total, ...}, location}`), and the error envelope (`{error:{code,message,details?}}`).
- Confirm the confirmation view (order number, itemized summary, total, fulfillment type, pay-on-delivery/pickup note) and the failure path (visible, retryable error; cart and form state preserved; no silent failure, since there's no WhatsApp fallback anymore) are both actually implemented, not just scaffolded.
- Confirm required-field validation matches the backend (name, phone required; address required only for delivery).
- Confirm menu/hours actually come from `GET /api/public/locations/:slug/menu` and `/hours` live, not a leftover hardcoded array.
- Confirm how much of the PWA/offline layer (rework plan's phase 2) is actually implemented versus still pending, and report that clearly rather than assuming either way.
- Wire `customer/`'s build output into whatever becomes the deploy story (see "Retiring the static site" and "Deployment" below).
- The general WhatsApp contact link (equivalent to the old `wa-directo`) should exist somewhere reasonable (e.g. a footer/contact section) and must not carry cart contents — it's a separate "ask us a question" channel only.

## Admin app (`admin/`)

Already built once (see "Current build state"); rework needed:
- Remove `STAFF` from `admin/`'s own routing/guards (`lib/roles.ts`, `components/guards.tsx`, `routes.tsx` currently model `STAFF` as a role that's allowed in but confined to `/orders` — per the new decision, `STAFF` shouldn't get an in-app view here at all, just the post-login redirect message described in "Auth/authz").
- Move the pieces that belong in `packages/portal-shared/` there (see below) rather than keeping local copies.
- Otherwise keep what's built: dashboard (use the `dataviz` skill for the revenue/top-items charts if not already following its guidance), menu/promotions/customers/settings pages, orders pages (owners/managers still see and manage orders from here too — only `STAFF`'s access route changes, orders functionality itself isn't removed from `admin/`).

## Employee app (`employee/`) — new

Small, focused app: `/login` (shared backend, same as `admin/`), `/orders` (queue: status filter/columns, `refetchInterval` 10–15s for near-real-time updates without added infrastructure), `/orders/:id` (detail + status update). No menu/pricing/promotions/analytics/customers/settings access — those routes 403 for `STAFF` at the API regardless, so there's no reason to build UI for them here. Built from `packages/portal-shared/` (auth state, API client, order-status constants/labels, UI primitives) plus its own thin routing/pages — largely an extraction of what already exists in `admin/`'s `features/orders/` and `state/auth.tsx`, not new logic.

## Shared package (`packages/portal-shared/`)

New npm workspace package, added to the root `package.json` workspaces array. Houses what `admin/` and `employee/` both need:
- **Types** mirroring backend response shapes (`AdminRole`, `Order`, `OrderStatus`, `FulfillmentType`, etc. — extract from `admin/src/api/types.ts`, which already has these).
- **API client**: the fetch wrapper (`credentials:'include'`, JSON in/out, typed error from the `{error:{...}}` envelope) plus at minimum the `auth` and `orders` endpoint modules (both apps need them); menu/promotions/customers/analytics API modules can stay in `admin/` since `employee/` never calls them — no need to move code that only one consumer uses.
- **Auth state**: the `useAuth` context/hook (`admin/src/state/auth.tsx` today).
- **Order-status constants**: `ORDER_STATUS_FLOW`, `ORDER_STATUS_LABELS`, `FULFILLMENT_LABELS`, `orderStatusTone` (`admin/src/lib/roles.ts` today — split the order-status pieces out; role-gating logic like `isBackOffice`/`homePathFor` can stay `admin/`-only since `employee/` doesn't need it).
- **UI primitives**: whatever's reusable from `admin/src/components/ui.tsx` (buttons, loading state, error notice, card) — pull only what `employee/`'s small surface actually needs, don't force the whole admin component library into the shared package speculatively.

`admin/` and `employee/` depend on it as `"@chesare/portal-shared": "workspace:*"` (or npm workspaces' equivalent `"*"` protocol) and import its TypeScript source directly through Vite, no separate compile step, unless that proves not to work.

## Retiring the static site

`src/index.html` moves to `src/archive/` (matching the existing convention for `chesare-v1.html` — "reference only, never deploy"), not deleted, so its history and any still-useful copy stays available. `build.py`'s only remaining real job is `src/corte.html` (the margin calculator — no assets, no tokens, unrelated to ordering); trim it down to just that (drop `TOKENS_REQUERIDOS`, the asset-inlining pipeline, and the `{{API_BASE_URL}}` token added in the now-superseded vanilla-JS pass) or retire it entirely if copying `corte.html` by hand is simpler than keeping a one-file build script alive for it — implementer's call, note the reasoning either way. `scripts/check_mobile.py` (written for `src/index.html`) retires alongside it; if `customer/` wants an equivalent smoke test later, that's a new, separate script, not an extension of this one — not required for this phase.

## Seed strategy

`backend/prisma/seed.ts` (already written per "Current build state," needs verification) hardcodes a translated copy of the real menu arrays into one seeded `Location` (`chesare-maltrata`), preserving every `p: null` and `ageRestricted` beer flag, and creates one `SUPER_ADMIN` (`kevinngiraldo@gmail.com`), one location-scoped `OWNER`, and one location-scoped `STAFF` account (for testing `employee/`), each with a randomly generated temp password printed once at seed time.

## Deployment (Railway)

One Postgres plugin + one Node service (`backend/`) serving `/api/*` plus the three built frontends at distinct path prefixes (`/`, `/admin`, `/staff` — see "Stack decisions"). Env vars: `DATABASE_URL` (Railway-provided), `SESSION_COOKIE_SECRET`, `ADMIN_ORIGIN`/equivalent for local dev CORS, `PUBLIC_SITE_ORIGINS`. Use the `use-railway` skill to provision, deploy, migrate, and seed.

## Build sequencing from here

Phase 1 (backend foundation) is done. Remaining work, in order, with earlier "Phase 2/2b/3" work folded in as noted:

1. **Verify + finish the backend's second half** — confirm `orders/customers/analytics` routes and `prisma/seed.ts` actually compile and pass tests (rate-limit interruption left this unconfirmed); diff `routes/admin/menu.ts` against Phase 1's version to check for unintended changes and revert/fix anything that strayed.
2. **Extract `packages/portal-shared/`** from `admin/`'s existing code, then rework `admin/` to consume it and to drop `STAFF` in-app handling per "Auth/authz" above.
3. **Build `employee/`** from the shared package — this should be fast, since it's mostly extraction of what `admin/` already has.
4. **Audit + finish `customer/`** against the real backend contract, per "Customer site" above.
5. **Retire the static site** per "Retiring the static site" above, and rewrite `CLAUDE.md`/`READER.md` to describe the four-piece architecture (this repo doc is the detailed reference; the root docs should point here rather than duplicate it, same convention as today).
6. **Integration, deploy, security review** — Railway provisioning, migrate+seed, end-to-end verification below, then the `security-review` skill over the full diff (focus: cookie flags, password hashing, rate limiting, location-scoping and role-scoping on every admin route, and that `employee/` truly can't reach anything beyond orders even if it tried).

Steps 2–4 have little file overlap (`packages/portal-shared/` + `admin/` rework; `employee/`; `customer/`) and can run in parallel once step 1 confirms the backend contract is solid; step 5 should wait until `customer/` is actually finished so the docs describe what's real.

## Verification

- Backend: unit tests plus, once a Postgres is reachable, the full integration suite (matrix price lookup incl. null cells, promotion math, cross-location 403s, `STAFF`-role 403s on non-order admin routes, login lockout, rate-limit 429s, order-submit happy path with generated order number).
- `admin/`: log in as `OWNER`, confirm dashboard/menu/promotions/customers/settings/orders all work against the live API; confirm a `STAFF` login is rejected with the employee-app pointer, not granted any screen.
- `employee/`: log in as `STAFF`, confirm only the orders queue is reachable, an order's status can be updated, and the list refreshes within ~15s of a new order landing; confirm an `OWNER`/`MANAGER` login also works here (permissive by design).
- `customer/`: add a matrix pizza + a wings item with a sauce choice, confirm a `p:null` item can't be added, fill required fields (name, phone, address for delivery), submit, confirm the confirmation view shows a real order number and the order appears in both `admin/`'s and `employee/`'s orders views within ~15s; repeat with the backend stopped and confirm a visible, retryable error (never silent, never a WhatsApp fallback).
- `build.py --check`/`build.py` still work for `corte.html` after trimming (or are confirmed retired, whichever was chosen).

### Critical files
- `backend/prisma/schema.prisma`, `backend/prisma/seed.ts`, `backend/src/routes/public/orders.ts`, `backend/src/routes/admin/menu.ts` (diff-review target)
- `packages/portal-shared/src/**` (new), `admin/src/{routes.tsx,components/guards.tsx,lib/roles.ts}`, `employee/src/**` (new)
- `customer/src/api/{client,types}.ts`, `customer/src/components/CartSheet.tsx`
- `src/archive/index.html` (post-move), `CLAUDE.md`, `READER.md`
