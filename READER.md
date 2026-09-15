# Pizza's Chesa're — ordering site and back office

Software for **Pizza's Chesa're**, a pizzería on Av. Ignacio Zaragoza,
Maltrata, Veracruz, Mexico. Customers browse a live menu and place an order on
the shop's own site; the shop manages those orders, its menu and prices, its
hours, promotions and customer history from its own back office. The shop pays
no commission on anything ordered through it.

This is the first build of a custom-software-for-small-business line of work.

It did not start here. It started as **one static HTML file** with the menu
hardcoded in JavaScript arrays and orders handed off to WhatsApp. That was the
right call at the time and the reasoning below is worth reading before you
judge it. It is no longer the right call, and the section after it explains
what changed.

---

## Part one: why the original single-file site was built that way

*(Historical. This describes the site now archived at
`src/archive/chesare-v2-vanilla-js.html`. The constraints are still real; the
conclusions have moved.)*

The constraints came from the business, not from preference:

- **The owner takes orders by phone and WhatsApp today.** The page produced a
  WhatsApp message, because that was the workflow that already existed.
  Nothing new to learn.
- **There was no POS, no inventory system and no staff to run one.** Anything
  requiring daily data entry would be abandoned in a week.
- **Delivery apps charge 15–30% nominal, and IVA lands on top of the
  commission.** Every order that comes through this software instead of Rappi
  or DiDi keeps that margin in the shop. *This is still the whole point.*
- **Rural mountain town, patchy data.** The site was one self-contained file
  with every asset inlined. It loaded on a bad connection and worked offline
  once installed to the home screen. *This constraint is still real and the
  current customer app does not yet meet it — see the gotchas.*
- **Evening-only business** (opens 5:30–6 pm, closed Thursdays). People browse
  in the afternoon for a 7 pm dinner, so the page stays orderable while closed
  and says when it opens. *Still true, still implemented.*

The build was a small Python script that turned three tokens in the template
into base64 `data:` URIs — the header logo, the iOS home-screen icon and the
web manifest — all cropped out of **one photograph**,
`assets/source/menu-00-portada.jpg`, the cover of the shop's printed menu. The
logo was used as a *crop of the printed cover*, red patterned background and
all, not a transparent cutout: masking the red out left a halo, and eroding
hard enough to kill the halo ate the black outlines off the lettering. The
crop looked better and was a third of the size. That recipe still lives in
`scripts/archive/build.py` if the brand assets are ever needed again.

---

## Part two: why that got replaced

The owner's actual ask grew past what a static file can do: real order
management, real menu and price management, customer history. All of that
needs a server and a database — there is nowhere else for the state to live.

Two things forced the rewrite specifically:

1. **Hardcoded menu data became a bug, not a simplification.** Once an admin
   portal existed where the owner could edit a price, the public site kept
   showing the old one until a developer hand-edited the JS arrays and
   rebuilt. `docs/customer-site-rework-plan.md` calls this out as the reason
   the rework happened: a repricing that silently doesn't reach customers is
   worse than no portal at all. Every price on the shop's printed menu is
   already a handwritten sticker over the printed one — the paper menu can't
   keep up with repricing either. Closing that gap is the product.

2. **WhatsApp hand-off can't be managed.** An order that exists only as a
   message in a chat thread can't be queued, assigned, status-tracked,
   counted, or looked up next week. The kitchen needed a queue and the owner
   needed numbers.

So the project is now four cooperating pieces. WhatsApp is no longer part of
ordering at all — it survives as a general "ask us a question" contact link
that carries no cart contents. There is still **no online payment**: the
customer pays cash or card on delivery or pickup, same as before.

`docs/backend-admin-plan.md` and `docs/customer-site-rework-plan.md` are the
detailed specs and the record of decisions already made with the owner. This
document is the orientation and the rationale; `CLAUDE.md` is the short
working map. Read the plan docs before changing anything structural.

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
| `packages/portal-shared/` | Types, admin API client, auth context, order-status constants, UI primitives. TypeScript source, no build step. | `admin/` and `employee/` only |

npm workspaces, root `package.json`. Node >= 20.

**Staff and owner are separate apps, not a role-gated section of one app.**
`admin/` refuses a `STAFF` login at the auth boundary and points it at
`employee/`. This is a UX decision layered on top of the real boundary, which
is enforced per-route in `backend/src/auth/middleware.ts`: `STAFF` can reach
the orders routes and nothing else, regardless of which app asks.

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

**`p: null` survived the migration intact.** `MenuItem.flatPrice` and
`MenuItemPriceCell.price` are both nullable and mean exactly what the old
array did: "we don't know this price." The item renders greyed out as
"Pregunta el precio", can't be added to the cart, and is rejected server-side.
Never substitute a guess.

### Important files

| Path | What it is |
|---|---|
| `docs/backend-admin-plan.md` | **The spec** for backend/admin/employee: schema, API surface, auth, deployment, sequencing. |
| `docs/customer-site-rework-plan.md` | The spec for `customer/`. |
| `CLAUDE.md` | Short working map + conventions. |
| `backend/prisma/schema.prisma` | The data model. |
| `backend/prisma/seed.ts` | The initial menu, transcribed from `assets/source/`. |
| `backend/src/app.ts` | Route registration, CORS, rate limiting, static serving. |
| `assets/source/` | Photographs of the shop's printed menu. **Still the price source of truth.** |
| `src/corte.html` | Standalone delivery-app margin calculator. Sales tool, not part of the site. No assets, no build — open it directly. |
| `src/archive/chesare-v1.html` | First pass. Dark "oven at night" palette, placeholder prices. Reference only. |
| `src/archive/chesare-v2-vanilla-js.html` | The single-file WhatsApp site `customer/` replaced. Reference only — it is still the best written record of the UX the React app ports. |
| `scripts/archive/build.py` | Retired. The brand-asset crop recipe (`RECORTE_MARCA`, `RECORTE_ICONO`) lives here. |
| `scripts/archive/check_mobile.py` | Retired. The phone-width checks it encodes are still the right ones if `customer/` ever gets a smoke test. |

---

## Prerequisites

- **Node.js >= 20** and npm.
- **PostgreSQL** (any recent version; 14+ is fine) reachable via
  `DATABASE_URL`.
- A text editor.

Python is no longer needed for anything. `requirements.txt` exists only for
the retired scripts in `scripts/archive/`.

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

There used to be none. There are now real ones. See "Handling secrets" below
and `.env.example` for the full shape.

Backend (`.env` at the repo root, or `backend/.env`, which is read first):
`DATABASE_URL`, `SESSION_COOKIE_SECRET`, `ADMIN_ORIGIN`,
`PUBLIC_SITE_ORIGINS`, `PORT`, `NODE_ENV`, `LOG_LEVEL`.

Frontends (`admin/.env.local`, `employee/.env.local`, `customer/.env.local`):
`VITE_API_BASE_URL` (empty means same origin — what production wants),
`VITE_API_PROXY_TARGET`, and `admin/`'s `VITE_EMPLOYEE_APP_URL`.

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
vite build`) and no test suite.

There is no linter or formatter configured.

`scripts/archive/check_mobile.py`, the old Playwright smoke test, is retired
with the static site it drove. `customer/` has no equivalent. Adding one is
reasonable, separate work — the checks worth keeping are in that file.

---

## How configuration is managed

The big change: **the menu, the prices and the hours are database rows now,
not literals in a file.** The owner edits them in `admin/`; `customer/` reads
them live. That was the entire point of the rework — do not reintroduce
hardcoded menu data in any frontend.

| Thing | Where |
|---|---|
| Menu, prices, sizes, styles, option groups | Postgres, edited in `admin/`. Initial values in `backend/prisma/seed.ts`. |
| Opening hours | `BusinessHours` rows, edited in `admin/`. Served by `GET /api/public/locations/:slug/hours`. |
| Timezone | `Location.timezone` (`America/Mexico_City`). Deliberate — never the visitor's timezone. |
| WhatsApp number | `Location.waNumber`. No longer surfaced as a contact link in `customer/` — the site is the ordering channel, and the footer's phone numbers are the contact path instead. Field stays seeded for now in case that changes. |
| Location slug | `LOCATION_SLUG` in `customer/src/api/client.ts` (`chesare-maltrata`). |
| Backend config | `.env` — see above. |
| Colours | CSS custom properties on `:root`, per app, with dark-mode overrides. Brand red `#D22B27`, sign yellow `#FFD429`. |
| Path prefixes | `backend/src/app.ts` + each app's Vite `base`. |
| Brand image crops | `RECORTE_MARCA` / `RECORTE_ICONO` in `scripts/archive/build.py`. Pixel coords against the original 1080×1920 photo. |

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

**The old position — "there are no secrets in this project and it should stay
that way" — is obsolete.** It was true of a static file with no backend. It is
not true now, and leaving it standing would be actively misleading.

What exists now:

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

### The privacy position has genuinely changed

The old site could claim customer data "never touches disk" — an order lived
in the URL of a WhatsApp link the customer tapped and nowhere else. **That is
no longer true and must not be repeated.** The backend now stores, by design:

- customer **name, phone and address**, and a `Customer` record keyed on phone
  per location;
- **full order history** — line items, options, prices, fulfilment type,
  status;
- and `admin/` surfaces all of it, including a per-customer history view.

This is the feature the owner asked for. It also means the project now holds
personal data about real people in a small town, which brings obligations the
old design dodged entirely:

- Don't copy customer data anywhere it doesn't need to go — no logging of
  request bodies on the order endpoint, no analytics capturing it, no real
  order data pasted into the repo, issues or fixtures.
- `POST /api/public/.../orders` is the one unauthenticated write endpoint.
  Its rate limiting and Zod payload caps are load-bearing, not decoration.
- Every admin handler must scope by `locationId` (unless `SUPER_ADMIN`) and by
  role. Never trust a `:locationId` path param alone.
- There is still no third-party analytics and no cookie beyond the admin
  session — but "nothing to consent to" is no longer the reason. Adding
  tracking now means a privacy notice and a real think, not just a banner.
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
  retryable, with the cart and form preserved. There is no WhatsApp fallback
  any more, so a silent failure is a lost order.
- Toggle dark mode. Every app has a full dark variant and it's easy to break.
- If you touched path prefixes or Vite `base`: `npm start` and load `/`,
  `/admin` and `/staff`.

---

## Deployment

**Railway**: one Postgres plugin and one Node service (`backend/`) serving
`/api/*` plus the three built frontends at their path prefixes. The old
process — `python build.py`, drag `dist/` onto Netlify Drop — is gone with the
static site.

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

**Menu changes in `admin/` don't show on the customer site** — check the
customer app is actually hitting `GET /api/public/locations/:slug/menu` and
that `LOCATION_SLUG` matches the seeded location. This failure mode is the
exact bug the rework existed to kill, so treat it as serious.

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

2. **WhatsApp is no longer part of the customer site at all** — no "ask a
   question" button, no `wa.me` link. `customer/` is meant to be the one
   ordering and contact channel; the footer's phone numbers (`272 260 3537`,
   `272 100 5211`) are how a customer reaches the shop outside the site.
   `Location.waNumber` (`522722603537`) stays seeded on the backend in case a
   WhatsApp surface comes back later, but nothing reads it today. The old
   unverified-number risk (Mexican mobiles sometimes need `521` + 10 digits
   rather than `52` + 10) is moot while it's unused; re-verify before wiring
   it back up.

3. **`customer/` has no offline support yet.** The old static site loaded on a
   bad connection and worked offline once installed to the home screen. The
   React app does not: phase 2 of `docs/customer-site-rework-plan.md`
   (service worker, app-shell precache, stale-while-revalidate menu cache with
   a "mostrando el menú guardado" notice, checkout disabled rather than queued
   offline) is **specified but not built** — there is no `vite-plugin-pwa` and
   no service worker in the tree. Maltrata is a rural mountain town with
   patchy data. This is a real regression against the original design, and it
   is the most product-relevant piece of unfinished work.

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
   one.** The paper menu can't keep up with repricing. That gap is the reason
   this project exists — and the reason the menu had to move into a database.

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
    history. See "Handling secrets" above. This is a deliberate, owner-
    requested change from the original design's absolute "never touches disk"
    position, and it is the single biggest non-technical obligation the
    project has acquired.

13. **Four things must agree about path prefixes**: `backend/src/app.ts`, each
    app's Vite `base`, and `admin`/`employee`'s router `basename`. Change one,
    change all, and verify with `npm start` — a dev server will happily hide
    the mismatch.

14. **Prices in the code must match `assets/source/`.** Those photographs are
    still the source of truth, now for the seed rather than for hand-edited
    arrays.

---

## Open questions

- *TODO: no written agreement with the shop about who owns this code, what
  happens if the relationship ends, or whether the menu photographs can be
  redistributed. This mattered before; now that the system holds customer
  personal data it matters considerably more — settle it before launch.*
- *TODO: no delivery fee or minimum order in the model — unknown whether the
  shop charges either.*
- *TODO: `src/corte.html` uses market-range commission figures, not Chesa're's
  actual numbers. It's a demo until real figures replace them.*
- *TODO: no data-retention policy for customer records. "Keep everything
  forever" is the current behaviour by default, not by decision.*
