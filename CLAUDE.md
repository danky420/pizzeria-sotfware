# CLAUDE.md

Guidance for Claude Code working in this repository.

## What this is

Ordering and back-office software for **Pizza's Chesa're**, a pizzería in
Maltrata, Veracruz, Mexico. Customers browse a live menu and place a real
order; the shop manages that order, its menu, prices, hours, promotions and
customer history from a back office.

It is four apps around a shared backend and database. WhatsApp is not part of
the customer site at all — the site itself is the ordering and contact
channel.

**The detailed architecture lives in `docs/`, not here.** Read those before
making structural changes; this file is a map, not a spec.

- `docs/backend-admin-plan.md` — the backend, admin and employee apps: schema,
  API surface, auth/authz, role matrix, deployment, build sequencing.
- `docs/customer-site-rework-plan.md` — the customer app: what carried over
  from the static site, the offline/PWA scope, verification.

## The pieces

```
customer/   React + Vite. The public ordering site. Unauthenticated.
            Live menu/hours from the API, real checkout, on-screen
            confirmation with an order number. No online payment —
            customer pays cash/card on delivery or pickup.

admin/      React + Vite. Owner/manager back office: analytics, orders,
            menu and pricing, promotions, customers, hours, users.
            OWNER / MANAGER / SUPER_ADMIN only. A STAFF login is refused
            at the auth boundary and pointed at the employee app.

employee/   React + Vite. Staff app: the orders queue and order detail,
            nothing else. Accepts any authenticated role (an owner
            covering the counter can use it); it is the only surface
            STAFF accounts get.

backend/    Fastify + TypeScript + Prisma + Postgres. The API all three
            frontends call, and in production the single service that
            also serves all three builds.

packages/portal-shared/
            Workspace package shared by admin/ and employee/ only:
            backend response types, the admin API client, auth context,
            order-status constants, UI primitives. Consumed as
            TypeScript source through Vite — no separate build step.
            customer/ does not use it (different API, no auth).
```

npm workspaces, root `package.json`. Node >= 20.

### Path prefixes (production)

One Fastify service serves everything from one origin, so the admin/employee
session cookie stays same-origin with `/api/*`:

| Path | Serves |
|---|---|
| `/` | `customer/dist` |
| `/admin` | `admin/dist` |
| `/staff` | `employee/dist` |
| `/api/*` | the API |

This is wired in `backend/src/app.ts` (static registration + SPA fallback per
prefix) and has to stay in step with each app's Vite `base`: `admin/` builds
with `base:"/admin/"`, `employee/` with `base:"/staff/"`, `customer/` at `"/"`.
`admin/` and `employee/` pass `import.meta.env.BASE_URL` as their React Router
`basename` so client-side routes match. **Changing one of these four things
means changing the others.**

Still live outside the apps:

- `src/corte.html` — standalone delivery-app margin calculator. A sales tool,
  not part of the customer site. No assets, no build step: open it directly
  from `src/`. Still uses market-range commission figures, not the shop's real
  numbers.
- `assets/source/*.jpg` — photographs of the shop's printed menu. **Still the
  price source of truth**, now for seeding and for checking admin-entered
  prices rather than for hand-edited arrays.

## Commands

All from the repo root unless noted.

```bash
npm install                     # once, installs every workspace

npm run dev:api                 # backend on :3000 (tsx watch)
npm run dev:customer            # customer site on :8000
npm run dev:admin               # admin on :5173
npm run dev:employee            # employee on :5174 (strictPort)

npm run build                   # build every workspace
npm run build:api               # prisma generate + tsc
npm run build:customer | :admin | :employee

npm test                        # every workspace's tests
npm run typecheck               # every workspace
npm start                       # run the built backend (serves the SPAs too)
```

Backend database work:

```bash
npm run migrate                 # prisma migrate dev
npm run migrate:deploy          # prisma migrate deploy (production)
npm run seed                    # seed chesare-maltrata + admin accounts
npm run prisma -- studio        # any raw prisma command
```

Per-app, from that directory: `npm run dev`, `npm run build`, `npm run
typecheck`; `cd backend && npm test` (vitest) is the only real test suite in
the repo.

The dev servers proxy `/api` to `http://localhost:3000`, so cookies stay
same-origin and you do not need to touch CORS for ordinary local work.

There is no linter or formatter configured.

### Before committing

```bash
npm run typecheck
npm test
npm run build
```

Then by hand, for whatever you touched: the customer site at phone width
(add an item, place an order, read the confirmation), dark mode, and — if you
changed anything under "Path prefixes" — `npm start` and check that `/`,
`/admin` and `/staff` each serve the right app with assets resolving.

## Configuration and secrets

**This project now has real secrets.** The old "there are none" position is
gone with the static site; do not reinstate it.

- `.env` at the repo root (and/or `backend/.env`, read first) holds
  `DATABASE_URL`, `SESSION_COOKIE_SECRET` (>= 32 chars, rotating it logs every
  admin out), `ADMIN_ORIGIN`, `PUBLIC_SITE_ORIGINS`, `PORT`, `NODE_ENV`,
  `LOG_LEVEL`. Shape documented in `.env.example`. Never commit a filled-in
  `.env`.
- Frontends read `VITE_*` vars from their own `.env.local` (`admin/`,
  `employee/`, `customer/`): `VITE_API_BASE_URL` (empty = same origin, which
  is what production wants), `VITE_API_PROXY_TARGET`, and `admin/`'s
  `VITE_EMPLOYEE_APP_URL`. **Anything named `VITE_*` is compiled into the
  bundle and is public.** Never put a secret there.
- Passwords are argon2id-hashed; sessions are opaque httpOnly cookies backed
  by the `AdminSession` table. Seed-generated passwords are printed once at
  seed time — they are credentials, not fixtures. Don't commit them.
- The shop's two phone numbers are publicly printed contact details and are
  fine in tracked files. **Customer names, phones, addresses and order history
  are not** — they now live in Postgres by design (see `readme.md`). Don't add
  logging, analytics or fixtures that copy them anywhere else, and don't paste
  real order data into the repo.
- If something sensitive is committed: rotate the credential first, then clean
  the history.

## Working on the menu

The menu is **database rows now, not code**. The owner edits it in `admin/`;
`customer/` reads it live from `GET /api/public/locations/:slug/menu`. Do not
hardcode menu data in any frontend — that was the bug the rework existed to
fix.

`backend/prisma/seed.ts` holds the initial menu, transcribed from
`assets/source/`. Change it only to fix the seed, not to reprice the live shop.

**`p: null` semantics are load-bearing and preserved end to end**:
`MenuItem.flatPrice` and `MenuItemPriceCell.price` are nullable, meaning "we
don't know this price" — the item renders as "Pregunta el precio", can't be
added to a cart, and is rejected server-side. **Never substitute a guess.**

## Git workflow

- `main` is always deployable.
- Branch per change: `feat/`, `fix/`, `menu/` (price or item changes),
  `docs/`, `chore/` — e.g. `menu/precios-enero`.
- Commits present tense, imperative, scoped:
  `menu: update pizza sizes to January prices`.
- Keep menu/seed-data commits separate from layout and logic commits.
- Never commit `dist/` (gitignored, at any depth) or `.env`.

## Language convention

Comments and UI strings are in **Spanish** — the product ships to Spanish
speakers. Documentation (`CLAUDE.md`, `readme.md`, `docs/`) is in **English**.
Don't translate UI strings to English "for clarity."

## Known risk areas

`readme.md` has the full list with context. The load-bearing ones:

- **WhatsApp is not part of `customer/` at all** — no button, no `wa.me` link.
  `Location.waNumber` (`522722603537`, unverified) stays seeded on the backend
  in case a WhatsApp surface is added later, but nothing reads it today.
- **Several seeded prices are unconfirmed reads of handwritten stickers**
  (wings tiers, `ESPECIALES` sizing, caguama). Some items are deliberately
  `p: null`. Don't "fix" either without a confirmed real price.
- **`customer/`'s PWA/offline layer is not built yet** (phase 2 of
  `docs/customer-site-rework-plan.md`). Maltrata has patchy data — this is the
  most product-relevant piece of unfinished work, not a nice-to-have.
- **The backend stores customer PII.** Order submit is the one unauthenticated
  write endpoint; treat its rate limiting and Zod caps as load-bearing.
- **Every admin handler must scope by `locationId`** (unless `SUPER_ADMIN`) and
  by role. Never trust a `:locationId` path param alone.
