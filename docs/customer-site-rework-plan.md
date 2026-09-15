# Customer site rework: `src/index.html` → React app

## Context

`src/index.html` was described by the owner as "a mere mockup... simulating the web app" — it's a single static file with the entire menu hardcoded in JS arrays. Now that a real backend exists (see `docs/backend-admin-plan.md`) with an admin portal for editing menu/prices, that hardcoding is a real bug: an admin edits a price in the portal and the public site keeps showing the old one until someone hand-edits `src/index.html`'s arrays and rebuilds. The checkout flow itself was already ported to hit the real backend in the previous phase (order placement, confirmation screen, error handling) — that logic carries over into the rework rather than being redone.

Decisions made with the user (do not re-litigate):
- **Framework**: React + Vite — same stack as `admin/`, so the two apps can share conventions (and later, if useful, types/components).
- **Offline support kept, scoped deliberately**: a service worker (via `vite-plugin-pwa`/Workbox) precaches the app shell so it loads and is installable with no signal, same property `src/index.html` had. The menu/hours API response is cached with a stale-while-revalidate strategy — offline, the last-fetched menu is shown with a visible "mostrando el menú guardado, los precios podrían haber cambiado" notice. **Placing an order still requires connectivity** — offline is treated the same as the existing "no backend configured" disabled state (reuse that UI), not queued via Background Sync. An order queued blind, with no confirmation the kitchen actually got it, is worse than telling the customer plainly it's offline.
- **Hosting**: its own Railway static service, alongside the backend and admin, in the same Railway project. Calls the backend's public API cross-origin (already CORS-allowlisted via `PUBLIC_SITE_ORIGINS` — add this service's origin there). Replaces the manual Netlify-drop process.

## Scope

New top-level directory `customer/` (sibling to `backend/` and `admin/`), a React + TypeScript + Vite app. `src/index.html`, `build.py`, `scripts/check_mobile.py`, `assets/` stay in place and untouched until the new app reaches feature parity and is confirmed working — then they get retired (moved to an archive path, not deleted outright, matching how `src/archive/chesare-v1.html` was handled for the previous rewrite). Do not delete the old site as part of this work.

## What has to carry over (read `src/index.html` in full — it's the UX/logic spec)

- **Menu rendering**: pizza cards (size × style matrix via `TALLAS`/`ESTILOS`), fixed-price specialties, flavor-choice items (wings, pasta), burgers/desserts/frappés/coffees/drinks/beer sections, the "Pregunta el precio" greyed-out state for a null price, the "Favorita" badge, the inline SVG topping icons (`icPizza`, `icBurger`, `icWing`, etc — port these as-is, no food photography).
- **Product configurator sheet**: size/style picker for pizzas, single-choice list picker for wings/pasta, quantity, add-to-cart.
- **Cart**: line items, quantity, running total, suggested add-ons.
- **Checkout**: already ported to the real API in the previous phase — same request/response contract (`POST /api/public/locations/:slug/orders`, required phone, server-computed prices, on-screen confirmation with order number, visible/retryable errors, disabled state with explanation when the backend is unreachable). Port the logic, don't redesign the flow.
- **Open/closed status**: computed from the shop's wall clock in `America/Mexico_City` (never the visitor's timezone) — but now fetch hours from `GET /api/public/locations/:slug/hours` instead of a hardcoded `HORAS` array, so admin-edited hours actually take effect.
- **Menu data source**: `GET /api/public/locations/:slug/menu` replaces every hardcoded array (`PIZZAS`, `ESPECIALES`, `BURGERS`, `ALITAS_65/80`, `PASTAS`, `POSTRES`, `FRAPPES`, `CAFES`, `REFRESCOS`, `CERVEZAS`, `TALLAS`, `ESTILOS`). The exact response shape is already implemented and live in `backend/src/routes/public/menu.ts` — read it, don't guess.
- **Dark mode**, brand colors (`#D22B27` red, `#FFD429` yellow), the 18+ beer notice, installable home-screen icon/manifest. (The general WhatsApp contact link, `wa-directo`, was later removed entirely — the site is the one ordering *and* contact channel now; footer phone numbers cover contact.)

## Build sequencing

1. **Core app** (first): menu fetched live and rendered, product configurator, cart, checkout (porting the already-working logic), hours/open-closed from the API, dark mode, visual parity with the current site. No PWA/offline yet — plain SPA first, verified working against the live backend.
2. **PWA/offline layer** (after core app is verified): `vite-plugin-pwa`, app-shell precaching, menu stale-while-revalidate caching with the "showing saved menu" notice, update-available prompt, manifest/install behavior, offline-disables-checkout state.
3. **Hosting**: Railway static service for `customer/`, add its origin to `PUBLIC_SITE_ORIGINS`, retire the Netlify-drop instructions in `READER.md`.
4. **Retire the old site**: once the new app has feature parity and passes its own smoke checks, move `src/index.html` to an archive path and update `CLAUDE.md`/`READER.md` to point at `customer/` as the real site.

## Verification

- Visual/functional parity check against the current live `dist/index.html` for every menu section, the pizza size×style matrix, wing/pasta flavor choices, cart math, dark mode.
- A full checkout round trip against the live backend (same test as the previous phase: place an order, confirm the order-number confirmation screen, confirm it shows up via the admin orders queue).
- Offline test: load once online, go offline (devtools network throttling or Playwright's offline mode), confirm the app shell still loads, the last-fetched menu still renders with the "saved menu" notice, and the checkout button shows the disabled/unavailable state rather than hanging or crashing.
- `npx tsc --noEmit` and a production build (`npm run build`) clean.
