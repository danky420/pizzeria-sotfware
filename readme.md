# Pizza's Chesa're — ordering site and back office

Software for **Pizza's Chesa're**, a pizzería on Av. Ignacio Zaragoza,
Maltrata, Veracruz, Mexico. Customers browse a live menu and place an order on
the shop's own site; the shop manages those orders, its menu and prices, its
hours, promotions and customer history from its own back office. The shop pays
no commission on anything ordered through it. There is no online payment — the
customer pays cash or card on delivery or pickup.

`docs/backend-admin-plan.md` and `docs/customer-site-rework-plan.md` are the
detailed specs and the record of decisions already made with the owner. This
document is the orientation; `CLAUDE.md` is the short working map. Read the
plan docs before changing anything structural.

---

## Architecture

```
                    ┌──────────────┐
  customer/  ──────►│              │
  (public site)     │   backend/   │──►  Postgres
  admin/     ──────►│   Fastify    │     (Prisma)
  (back office)     │   + Prisma   │
  employee/  ──────►│              │
  (orders queue)    └──────────────┘

  admin/ + employee/  ──►  packages/portal-shared/
```

| Piece | What it is | Who uses it |
|---|---|---|
| `customer/` | React + Vite. Menu, cart, checkout, confirmation. Unauthenticated. | The public |
| `admin/` | React + Vite. Analytics, orders, menu/pricing, promotions, customers, hours, users. | `OWNER`, `MANAGER`, `SUPER_ADMIN` |
| `employee/` | React + Vite. Orders queue and detail. Nothing else. | `STAFF` (and any other role — permissive by design) |
| `backend/` | Fastify + TypeScript + Prisma + Postgres. The API, and in production the one service that serves all three builds. | Everything |
| `packages/portal-shared/` | Types, API client, auth context, order-status constants, the orders queue/detail screens, UI primitives. TypeScript source, no build step. | `admin/` and `employee/` only |

npm workspaces, root `package.json`. Node >= 20.

**Staff and owner are separate apps, not a role-gated section of one app.**
`admin/` refuses a `STAFF` login at the auth boundary and points it at
`employee/`. This is a UX decision layered on top of the real boundary, which
is enforced per-route in `backend/src/auth/middleware.ts`: `STAFF` can reach
the orders routes and nothing else, regardless of which app asks.

**The orders queue is one implementation, not two.** `packages/portal-shared`'s
`OrdersQueuePage`/`OrderDetailPage` render identically in both apps; the only
difference is that `admin/` passes a `customerLinkTo` prop for the
customer-history link, which `employee/` doesn't have. Fix or change the
queue once, in `packages/portal-shared/src/orders/`, and both apps get it.

### One origin, four path prefixes

In production a single Fastify service serves the API and all three built
SPAs. This is deliberate: it keeps the admin/employee session cookie
same-origin with `/api/*`, which sidesteps Railway's `*.up.railway.app`
public-suffix `SameSite` quirks, and leaves one service plus one database to
operate.

| Path | Serves |
|---|---|
| `/` | `customer/dist` |
| `/admin` | `admin/dist` (SPA fallback for client-side routes) |
| `/staff` | `employee/dist` (SPA fallback for client-side routes) |
| `/api/*` | the API |

Four things have to agree, and changing one means changing the others:
`backend/src/app.ts`'s static registration, each app's Vite `base`
(`"/admin/"`, `"/staff/"`, `"/"`), and `admin/`/`employee/` passing
`import.meta.env.BASE_URL` as their React Router `basename`. A missing asset
under a prefix 404s as JSON rather than falling back to `index.html` — serving
HTML labelled as JavaScript is a much more confusing failure than a 404.

Each SPA is served only if its `dist/` exists, so an unbuilt frontend leaves
the API running instead of crashing the service.

### Data model, in one paragraph

`Location` is the root of every relation (multi-location schema; only
`chesare-maltrata` is seeded and deployed). Under it: `BusinessHours`,
`AdminUser` + `AdminSession`, `MenuCategory` → `MenuItem` → either a flat
price or a `MenuItemPriceCell` matrix (size × style) plus
`MenuItemOptionGroup`/`Choice` for flavour picks, `Promotion`, `Customer`, and
`Order` → `OrderItem`. One `MenuItem` model with an `itemType` discriminator
covers all three price shapes in the real menu rather than one table per
shape. Full detail in `docs/backend-admin-plan.md`.

**`p: null` is load-bearing.** `MenuItem.flatPrice` and
`MenuItemPriceCell.price` are both nullable and mean "we don't know this
price." The item renders greyed out as "Pregunta el precio", can't be added to
the cart, and is rejected server-side. Never substitute a guess.

### Important files

| Path | What it is |
|---|---|
| `docs/backend-admin-plan.md` | **The spec** for backend/admin/employee: schema, API surface, auth, deployment, sequencing. |
| `docs/customer-site-rework-plan.md` | The spec for `customer/`. |
| `CLAUDE.md` | Short working map + conventions. |
| `backend/prisma/schema.prisma` | The data model. |
| `backend/prisma/seed.ts` | The initial menu, transcribed from `assets/source/`. |
| `backend/src/app.ts` | Route registration, CORS, rate limiting, static serving. |
| `packages/portal-shared/src/orders/` | The shared orders queue and detail screens. |
| `assets/source/` | Photographs of the shop's printed menu. **Still the price source of truth.** |
| `src/corte.html` | Standalone delivery-app margin calculator. Sales tool, not part of the site. No assets, no build — open it directly. |

---

## Prerequisites

- **Node.js >= 20** and npm.
- **PostgreSQL** (any recent version; 14+ is fine) reachable via
  `DATABASE_URL`.
- A text editor.

## Setting up a fresh environment

```bash
git clone <remote-url> chesare-pizzeria
cd chesare-pizzeria

npm install                     # installs every workspace

cp .env.example .env            # then fill in DATABASE_URL and
                                # SESSION_COOKIE_SECRET (>= 32 chars):
                                # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

npm run migrate                 # create the schema
npm run seed                    # seed chesare-maltrata + admin accounts
```

`npm run seed` prints the generated passwords for the `SUPER_ADMIN`, `OWNER`
and `STAFF` accounts **once**. Write them down; they are not recoverable.

Frontends read their own `.env.local` (see `employee/.env.example` for the
documented shape). For ordinary local dev you don't need one — the Vite dev
servers proxy `/api` to `http://localhost:3000`, which keeps cookies
same-origin and means you never touch CORS.

### Environment variables

Backend (`.env` at the repo root, or `backend/.env`, which is read first):
`DATABASE_URL`, `SESSION_COOKIE_SECRET`, `ADMIN_ORIGIN`,
`PUBLIC_SITE_ORIGINS`, `PORT`, `NODE_ENV`, `LOG_LEVEL`.

Frontends (`admin/.env.local`, `employee/.env.local`, `customer/.env.local`):
`VITE_API_BASE_URL` (empty means same origin — what production wants, and
what local dev should almost always leave it as; the Vite proxy handles
`/api` from there), `VITE_API_PROXY_TARGET`, and `admin/`'s
`VITE_EMPLOYEE_APP_URL`. See "Handling secrets" below and `.env.example` for
the full shape.

## Running locally

Four terminals, or as many as you need:

```bash
npm run dev:api        # backend      http://localhost:3000
npm run dev:customer   # customer     http://localhost:8000
npm run dev:admin      # admin        http://localhost:5173
npm run dev:employee   # employee     http://localhost:5174
```

The employee port is `strictPort` on purpose: `admin/` links to it by URL, so
a silent "next free port" bump would 404 that link.

To exercise the real production shape — one origin, all three apps behind
their path prefixes:

```bash
npm run build && npm start
# http://localhost:3000/        customer
# http://localhost:3000/admin   back office
# http://localhost:3000/staff   orders queue
```

That is the only way to catch a `base`/`basename`/static-prefix mismatch, so
run it after touching any of them.

`src/corte.html` has no build step — open the file directly.

## Common commands

| Command | Does |
|---|---|
| `npm install` | Install every workspace |
| `npm run dev:api` / `dev:customer` / `dev:admin` / `dev:employee` | Dev servers |
| `npm run build` | Build every workspace |
| `npm run build:api` / `build:customer` / `build:admin` / `build:employee` | Build one |
| `npm start` | Run the built backend (serves the SPAs too) |
| `npm test` | Every workspace's tests (`backend/` is the only one with any) |
| `npm run typecheck` | Typecheck every workspace |
| `npm run migrate` / `migrate:deploy` | Prisma migrations (dev / production) |
| `npm run seed` | Seed the location, menu and admin accounts |
| `npm run prisma -- studio` | Any raw Prisma command |

### Tests, linting, type-checking

`backend/` has a real vitest suite (unit plus DB-backed integration). The
three frontends have `typecheck` and a type-checked build (`tsc --noEmit &&
vite build`) and no test suite. There is no linter or formatter configured.

---

## How configuration is managed

The menu, the prices and the hours are **database rows, not literals in a
file.** The owner edits them in `admin/`; `customer/` reads them live. Do not
hardcode menu data in any frontend.

| Thing | Where |
|---|---|
| Menu, prices, sizes, styles, option groups | Postgres, edited in `admin/`. Initial values in `backend/prisma/seed.ts`. |
| Opening hours | `BusinessHours` rows, edited in `admin/`. Served by `GET /api/public/locations/:slug/hours`. |
| Timezone | `Location.timezone` (`America/Mexico_City`). Deliberate — never the visitor's timezone. |
| WhatsApp number | `Location.waNumber`. Not surfaced anywhere in `customer/` today — the site is the ordering and contact channel; the footer's phone numbers cover contact. Field stays seeded in case a WhatsApp surface is added later. |
| Location slug | `LOCATION_SLUG` in `customer/src/api/client.ts` (`chesare-maltrata`). |
| Backend config | `.env` — see above. |
| Colours | CSS custom properties on `:root`, per app, with dark-mode overrides. Brand red `#D22B27`, sign yellow `#FFD429`. |
| Path prefixes | `backend/src/app.ts` + each app's Vite `base`. |

## How to change the menu

Through `admin/`, as the owner. That is the feature.

If you're fixing the *seed* — the initial transcription of the printed menu —
edit `backend/prisma/seed.ts` and re-seed a development database. Don't use
the seed to reprice a live shop; that's what the portal is for.

Either way, prices must match `assets/source/`: those photographs remain the
source of truth. When the owner reprices, take a new photo, replace the file,
and update the seed in the same commit. Keep that commit separate from layout
and logic changes — when prices move you want to read the history and see
exactly when and by how much.

---

## Git workflow

- **`main` is always deployable.**
- **Branch per change**, named `<type>/<short-slug>`:
  - `feat/` new capability — `feat/half-and-half-pizzas`
  - `fix/` bug — `fix/order-status-transition`
  - `menu/` price or item changes — `menu/precios-enero`
  - `docs/` documentation only
  - `chore/` tooling, build, housekeeping
- Merge into `main` via PR once more than one person is on it; fast-forward is
  fine while it's solo.

### Commits

Present tense, imperative, scoped. What changed and why:

```
menu: update pizza sizes to January prices
fix: scope the orders query by locationId for non-super-admins
feat: add half-and-half pizza option to the product sheet
```

Never commit `dist/` (gitignored at any depth) or a filled-in `.env`.

---

## Handling secrets

- **Database credentials** (`DATABASE_URL`) and the **session cookie secret**
  (`SESSION_COOKIE_SECRET`, >= 32 chars). Both in `.env`, gitignored, shape
  documented in `.env.example`. Rotating the cookie secret invalidates every
  signed cookie and logs all admins out — that is the intended emergency
  lever.
- **Admin passwords**, argon2id-hashed, never stored or logged in plaintext.
  Sessions are opaque httpOnly cookies backed by the `AdminSession` table, so
  a compromised account can be revoked instantly. Seed-generated passwords are
  printed once at seed time — treat them as credentials, not fixtures.
- **`VITE_*` variables are compiled into the frontend bundles and are public.**
  Anyone can read them. Never put a secret in one.

### Customer data

The backend stores, by design:

- customer **name, phone and address**, and a `Customer` record keyed on phone
  per location;
- **full order history** — line items, options, prices, fulfilment type,
  status;
- and `admin/` surfaces all of it, including a per-customer history view.

This is the feature the owner asked for, and it means the project holds
personal data about real people in a small town. Obligations that come with
that:

- Don't copy customer data anywhere it doesn't need to go — no logging of
  request bodies on the order endpoint, no analytics capturing it, no real
  order data pasted into the repo, issues or fixtures.
- `POST /api/public/.../orders` is the one unauthenticated write endpoint.
  Its rate limiting and Zod payload caps are load-bearing, not decoration.
- Every admin handler must scope by `locationId` (unless `SUPER_ADMIN`) and by
  role. Never trust a `:locationId` path param alone.
- No third-party analytics, no cookie beyond the admin session. Adding
  tracking means a privacy notice and a real think, not a banner.
- The shop's two phone numbers are publicly printed contact details (on the
  storefront sign and the menu cover) and are fine to commit.

If something sensitive does get committed, rewriting history is not enough —
rotate the credential first, then clean the history.

---

## Validating before you commit

```bash
npm run typecheck
npm test
npm run build
git status                      # nothing unexpected staged
git diff --cached               # read what you're actually committing
```

Then, by hand, because nothing above catches these:

- Open the customer site at phone width. Add a matrix pizza and a wings item
  with a sauce choice; confirm a `p: null` item can't be added. Place the
  order and read the confirmation end to end — an order number, an itemised
  summary, a total, and a plain statement of how they pay.
- Stop the backend and try again. The failure has to be visible and
  retryable, with the cart and form preserved — a silent failure here is a
  lost order.
- Toggle dark mode. Every app has a full dark variant and it's easy to break.
- If you touched path prefixes or Vite `base`: `npm start` and load `/`,
  `/admin` and `/staff`.

---

## Deployment

**Railway**: one Postgres plugin and one Node service (`backend/`) serving
`/api/*` plus the three built frontends at their path prefixes.

Deployment shape, env vars and the provisioning steps are in
`docs/backend-admin-plan.md` ("Deployment"); the `use-railway` skill does the
provisioning, deploying, migrating and seeding. Not repeated here so there is
one place to keep correct.

The build in outline: `npm run build` builds all four workspaces, `npm run
migrate:deploy` applies migrations, `npm start` runs the compiled backend,
which serves the three `dist/` directories it finds alongside it.

*TODO: no CI. A GitHub Action running `typecheck`, `test` and `build` on every
PR would be about thirty lines.*

*TODO: no custom domain yet.*

---

## Debugging

**`/admin` or `/staff` loads a blank page with 404s on its assets** — either a
`base`/static-prefix mismatch, or a stale backend. Check that the app's Vite
`base` matches the prefix `backend/src/app.ts` serves it at, and that it was
rebuilt after the change. `curl -s localhost:3000/admin | grep assets` shows
what the HTML actually asks for.

If the HTML looks right but its assets 404, **restart the backend**: static
files are registered with `wildcard:false`, which builds the route table at
boot, so a frontend rebuilt underneath a running service still has the
previous build's hashed filenames routed. Rebuild then restart, in that order.

**A client-side route under `/admin` or `/staff` 404s on reload** — the SPA
fallback in `app.ts`'s `setNotFoundHandler`. Note it deliberately does *not*
fall back for paths that look like files (anything with an extension), so a
genuinely missing asset stays a 404.

**Admin login succeeds then immediately bounces back to login** — a cookie
problem, almost always cross-origin. In production everything is same-origin;
in dev the Vite `/api` proxy recreates that. If you pointed
`VITE_API_BASE_URL` at the API's own origin, you went cross-origin and need
that origin in `PUBLIC_SITE_ORIGINS`/`ADMIN_ORIGIN` too.

**A `STAFF` login is refused in `admin/`** — working as designed. It should
show the employee-app pointer. Use `employee/`.

**`customer/` can't load the menu** — almost always `VITE_API_BASE_URL` in
`customer/.env.local`. Leave it empty for the Vite dev proxy to handle `/api`
same-origin; an absolute URL there only works if the browser can actually
reach that host directly (it won't, over a tunnel/forwarded dev environment),
and it also has to be in the backend's `PUBLIC_SITE_ORIGINS` or the request
gets blocked by CORS instead of just failing to connect. Check the browser's
network tab for the actual failure before guessing.

**Menu changes in `admin/` don't show on the customer site** — check the
customer app is actually hitting `GET /api/public/locations/:slug/menu` and
that `LOCATION_SLUG` matches the seeded location. This failure mode is the
exact bug the current architecture exists to prevent, so treat it as serious.

**403 on an admin route that should work** — role or location scoping.
`STAFF` reaches orders routes only; everything else is location-scoped against
the session.

**A menu item won't add to the cart** — it probably has a null price, which is
intentional.

**Fonts look wrong** — Google Fonts is the only external request the customer
page makes. Offline or behind a blocker you get the fallback stacks.

---

## Project-specific gotchas

1. **The shop's name is spelled two ways by the shop itself.** The logo reads
   *Chesa've*; the printed menu header, the storefront sign and the Google
   listing all say *Chesa're*. Everything here uses *Chesa're* (3 of 4
   sources). *TODO: get the owner to pick one — the split is costing them
   search traffic.*

2. **WhatsApp is not part of the customer site.** No "ask a question" button,
   no `wa.me` link. `customer/` is the one ordering and contact channel; the
   footer's phone numbers (`272 260 3537`, `272 100 5211`) are how a customer
   reaches the shop outside the site. `Location.waNumber` (`522722603537`)
   stays seeded on the backend in case a WhatsApp surface is added later, but
   nothing reads it today.

3. **`customer/` has no offline support.** Maltrata is a rural mountain town
   with patchy data, so this matters. Phase 2 of
   `docs/customer-site-rework-plan.md` (service worker, app-shell precache,
   stale-while-revalidate menu cache with a "mostrando el menú guardado"
   notice, checkout disabled rather than queued offline) is **specified but
   not built** — there is no `vite-plugin-pwa` and no service worker in the
   tree. This is the most product-relevant piece of unfinished work.

4. **Several seeded prices are unconfirmed reads of handwritten stickers.**
   Three items have no price at all because the printed menu has blank
   stickers where the price should be (refresco 400 ml, botella de agua,
   michelada) — they render as "Pregunta el precio". *TODO: get real prices.*

5. **The four `ESPECIALES` have no size.** Carnes frías $195, Boloñesa $200,
   Suprema $195, Vegetariana $195 — those sit between Grande ($165) and
   Familiar ($240) on the size table, so presumably they're one specific size,
   but the menu doesn't say. *TODO: ask.*

6. **The wings price tiers are a guess.** The printed menu has a $65 sticker
   beside the first 8 sauces and an $80 sticker below the next 7. Read here as
   two flavour tiers. It could just as easily mean wings $65 / boneless $80.
   *TODO: confirm.*

7. **Caguama price is ambiguous handwriting** — entered as $90, could be $70.
   *TODO: verify.*

8. **Every price on the printed menu is a handwritten sticker over the printed
   one.** The paper menu can't keep up with repricing, which is why the menu
   lives in a database that the owner can edit directly.

9. **Comments and UI strings are in Spanish, documentation is in English.**
   The product ships to Spanish speakers; the docs are for the developer. Keep
   it that way — don't translate UI strings to English "for clarity".

10. **Null prices are load-bearing**, end to end: nullable `flatPrice` and
    nullable `MenuItemPriceCell.price` mean "we don't know this price," and
    the server rejects an order containing one. Never substitute a guess.

11. **Beer is on the menu**, flagged `ageRestricted`. The footer carries an
    18+ notice; keep it. *TODO: check whether Veracruz has delivery rules for
    alcohol that need more than a notice.*

12. **The backend stores customer PII** — names, phones, addresses, order
    history. See "Handling secrets" above. This is the single biggest
    non-technical obligation the project carries.

13. **Four things must agree about path prefixes**: `backend/src/app.ts`, each
    app's Vite `base`, and `admin`/`employee`'s router `basename`. Change one,
    change all, and verify with `npm start` — a dev server will happily hide
    the mismatch.

14. **Prices in the code must match `assets/source/`.** Those photographs are
    the source of truth for the seed.

---

## Open questions

- *TODO: no written agreement with the shop about who owns this code, what
  happens if the relationship ends, or whether the menu photographs can be
  redistributed. Now that the system holds customer personal data this
  matters considerably more — settle it before launch.*
- *TODO: no delivery fee or minimum order in the model — unknown whether the
  shop charges either.*
- *TODO: `src/corte.html` uses market-range commission figures, not Chesa're's
  actual numbers. It's a demo until real figures replace them.*
- *TODO: no data-retention policy for customer records. "Keep everything
  forever" is the current behaviour by default, not by decision.*
