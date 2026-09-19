# Multi-tenant branding

## Context

The goal is to turn this from "Pizza's Chesa're's software" into a reusable
product other restaurants — not necessarily pizzerias — can run. Layout,
fonts, spacing and the overall page structure stay exactly as they are; only
**content** becomes tenant-configurable through `admin/`: the restaurant's
name, its logo, and one of 3 preset color schemes. This is not a redesign
and not free-form theming — it's promoting things that are hardcoded strings
and files today into `Location` data.

**Nothing about the pizzeria's current look may change.** Every value this
plan makes configurable gets seeded with Chesa're's current content as its
default, so shipping this is a zero-visual-diff change for the existing
client. The pizzeria becomes tenant #1 with today's exact branding, not a
special case in the code.

## What's hardcoded today (the inventory this plan replaces)

- **Name**: `<title>Pizza's Chesa're — Maltrata, Veracruz</title>` and an
  `apple-mobile-web-app-title` meta in `customer/index.html`; `<h1>Pizza's
  Chesa're</h1>` in `customer/src/App.tsx`; the same string again in
  `customer/src/components/TrackingPage.tsx`'s header; `Chesa're` wordmarks
  in `admin/`'s and `employee/`'s `AppShell.tsx`, `LoginPage.tsx`, and
  `admin/`'s `StaffAccountNotice.tsx`; `admin/index.html` and
  `employee/index.html` titles.
- **Logo**: one file, `public/marca.webp`, duplicated into all three app
  directories (`customer/`, `admin/`, `employee/`), referenced by path in
  `App.tsx`, `TrackingPage.tsx`, and both `AppShell.tsx`s, plus as the
  favicon/apple-touch-icon in all three `index.html`s.
- **Address and phone numbers**: the Maltrata street address and both shop
  phone numbers are typed directly into `customer/src/App.tsx`'s header and
  footer (`Av. Ignacio Zaragoza…`, `272 260 3537`, `272 100 5211`) — `.tel`
  links included. `Location.waNumber` already exists in the schema for the
  phone, but there is no address field anywhere.
- **Color scheme**: `customer/src/styles.css`'s `:root` hardcodes the red/
  cream palette (`--rojo`, `--amarillo`, `--crema`, etc.) with a dark-mode
  override block. `admin/` and `employee/` have their own, already
  deliberately different, muted near-grayscale palette (`--bg: #f4f3f0`,
  `--text: #16150f`) with a single small `--brand: #d22b27` accent used in a
  handful of places (active nav link, primary buttons) — the back office was
  already designed to not wear the storefront's loud theme.
- **Menu-category icons**: `customer/src/components/icons.tsx`'s hand-drawn
  `IcPizza`/`IcBurger`/`IcWing`/`IcPasta`/`IcDulce`/`IcFrappe`/etc. are food
  illustrations with their own fixed multi-color palettes (pizza cheese
  `#F4D77E`, pepperoni `#C7342A`, burger bun `#E9A94F`…) — these colors have
  nothing to do with the site's brand accent (`--rojo`) and must **not**
  shift with the color scheme; a pizza doesn't turn blue because the scheme
  is "azul." Out of scope for this plan, but worth naming explicitly: these
  icons are also tied to *this* pizzeria's specific menu categories. A
  future non-pizzeria tenant (a taco stand, a burger joint with no pastas)
  will eventually need either a generic icon per category or new icons —
  that's real follow-up work this plan does not attempt to solve.

## Schema changes

```prisma
model Location {
  // ...existing fields...
  addressText  String?
  colorScheme  String   @default("rojo-clasico")
  logoAssetId  String?  @unique

  logoAsset    LocationAsset? @relation(fields: [logoAssetId], references: [id])
}

model LocationAsset {
  id         String   @id @default(cuid())
  locationId String
  mimeType   String
  data       Bytes
  size       Int
  createdAt  DateTime @default(now())

  location   Location @relation("LocationAssetOwner", fields: [locationId], references: [id], onDelete: Cascade)

  @@index([locationId])
}
```

- `colorScheme` is a free string validated by a Zod enum server-side
  (`SUPPORTED_COLOR_SCHEMES`), the same pattern `currency`/
  `SUPPORTED_CURRENCIES` already uses in `backend/src/schemas/locations.ts`
  — an enum column would need a migration every time a scheme is added or
  renamed; a validated string doesn't.
- **A new upload creates a new `LocationAsset` row and repoints
  `Location.logoAssetId`**, rather than overwriting bytes in place. That
  makes the asset content-addressed by its own id: a given id's bytes never
  change, so the serving endpoint can set `Cache-Control: public,
  max-age=31536000, immutable` with zero invalidation logic — a browser or
  CDN can hold onto an old logo forever without ever needing to be told it
  changed, because a changed logo is a *different id*, not a mutated one.
  Old rows becoming orphaned (no `Location` pointing at them) is fine to
  leave for now — one row per upload, for a handful of tenants who change
  their logo rarely, is not a cleanup problem worth solving yet.
- **Postgres `bytea` over object storage (S3, a Railway volume)**: this
  deployment has no object storage today, and the volume here — a handful
  of tenants, one logo image each, changed rarely — doesn't justify
  provisioning it. `bytea` means one less service, one less set of
  credentials, and the existing DB backup already covers logos. Revisit if
  this ever needs to serve hundreds of tenants' assets at real traffic;
  that's a real future migration, not a reason to hold off now.
- **Size cap and mime whitelist**: 2 MB, `image/png` / `image/jpeg` /
  `image/webp` only. **SVG is deliberately excluded.** An `<img src="...">`
  reference doesn't execute embedded `<script>`s the way inlining or
  `<object>`/`<iframe>` would, so the XSS risk is smaller than it first
  looks — but a restaurant logo is a raster photo or a simple mark in
  practice, so there's no real use case being given up, and it removes an
  entire category of "did we get the serving headers exactly right"
  reasoning from the launch. Can be revisited if a tenant genuinely needs
  vector art.
- Migration also backfills the pizzeria's current branding (see
  "Migration path" below) so this ships as a no-op for Chesa're.

## Blob storage and serving

`GET /api/public/locations/:slug/logo` — public, no auth (the logo is
already publicly visible on the storefront), streams `LocationAsset.data`
with `Content-Type: <mimeType>` and the immutable cache header above. A
location with no `logoAssetId` yet returns 404; `customer/`'s header/footer
fall back to a plain text wordmark (no image) rather than a broken `<img>`,
same principle as `p: null` meaning "we don't have this, don't guess."

Admin-side upload: `POST /api/admin/locations/:id/logo`, multipart, via a
new `@fastify/multipart` dependency (nothing in this codebase parses
multipart today). Registered with its own `limits.fileSize` (2 MB) —
independent of `backend/src/app.ts`'s existing global `bodyLimit` (128 KB,
deliberately tight for the public order-submit endpoint), since
`@fastify/multipart` streams the body itself rather than going through the
JSON body parser that limit guards.

## Backend endpoints and schema surface

- `backend/src/schemas/locations.ts`: add `addressText: z.string().trim().max(300).optional()`
  and `colorScheme: colorSchemeSchema.default("rojo-clasico")` (new
  `SUPPORTED_COLOR_SCHEMES = ["rojo-clasico", "verde-oliva", "azul-marino"] as const`,
  same shape as `SUPPORTED_CURRENCIES`) to `createLocationBody`/
  `updateLocationBody`.
- `backend/src/lib/present.ts`'s `presentLocation()`: add `addressText`,
  `colorScheme`, and a computed `logoUrl` (`` `/api/public/locations/${slug}/logo` ``
  if `logoAssetId` is set, else `null`).
- `admin/`'s existing `PATCH /api/admin/locations/:id` already handles
  partial updates — `addressText`/`colorScheme` ride on it for free once
  they're in the schema. Only the logo needs a new route, because it's a
  file, not JSON.

## Color scheme mechanism

Three named palettes, applied the same way dark mode already is —
`customer/src/styles.css` already has a `:root[data-theme="dark"]` block
overriding CSS custom properties without touching layout; this adds
`:root[data-scheme="..."]` blocks doing the same for the **brand accent**
tokens only (`--rojo`, `--rojo-osc`, `--rojo-hondo`, `--amarillo`). Every
other token (`--crema`, `--papel`, `--tinta*`, `--linea`, `--verde*`, all
spacing/sizing/`--ancho`) is unaffected — that's what keeps this "content,
not redesign." The variable names stay `--rojo` etc.; renaming every one of
their ~120 call sites across the stylesheet to something scheme-neutral like
`--accent` would be a large, purely cosmetic diff for no behavior change, so
this plan doesn't do it — a one-line comment on the token block is enough to
record that `--rojo` means "primary brand accent," not literally red.

Three concrete proposals (final say is the open question below, these are
starting points pitched at the same warmth/contrast level as the current
palette, not just relabeled reds):

| Scheme key | Name | `--rojo` | `--rojo-osc` | `--rojo-hondo` | `--amarillo` |
|---|---|---|---|---|---|
| `rojo-clasico` (current, default) | Rojo clásico | `#D22B27` | `#9C1C19` | `#6E110F` | `#FFD429` |
| `verde-oliva` | Verde oliva | `#3F7D42` | `#2C5930` | `#1D3D20` | `#E8B33D` |
| `azul-marino` | Azul marino | `#1F5C8B` | `#163F60` | `#0E2A42` | `#F2A65A` |

Each needs its own dark-mode variant too, following the same
lightness/saturation shift the current dark-mode block already applies to
`rojo-clasico`.

**Avoiding a flash of the wrong scheme**: `App.tsx` fetches the menu (which
carries `location`) in a `useEffect` that runs *after* first paint, so the
scheme genuinely isn't known yet at initial render. Fix: cache
`{ name, colorScheme, logoUrl }` in `localStorage` after every successful
fetch, and add a small inline, blocking `<script>` in `customer/index.html`
(before `#root`) that reads that cache and sets `data-scheme` on `<html>`
immediately — a returning visitor never sees a flash. A first-ever visit in
a fresh browser still briefly renders the default scheme until the fetch
resolves; that's an acceptable, one-time cost, not a regression from
today's zero-flash behavior. This is one more instance of the "configure
once" pattern `configureApiBaseUrl`/`configureCurrency` already use, not a
new idea.

## `customer/` changes

- `App.tsx`'s hardcoded `<h1>`, `<img className="marca">`, footer address,
  and both phone numbers become reads from the fetched `location` object
  (`location.name`, `location.logoUrl` with a text-only fallback,
  `location.addressText`, `location.waNumber` — already fetched, just not
  displayed as a `tel:` link today). Same for `TrackingPage.tsx`'s header.
  This is the same principle `CLAUDE.md` already states for the menu — "not
  hardcoded in any frontend" — extended to branding.
- `index.html`'s `<title>` and meta description can't be templated at
  request time without adding server-side rendering, which is out of scope
  here. Set `document.title = location.name` (and update the description
  `<meta>` via `document.querySelector`) in a `useEffect` once the fetch
  resolves. This is a real, acknowledged limitation: the *very first*
  paint's `<title>` and the description search engines index are still the
  seeded default until JS runs — acceptable for a small ordering site, not
  a general answer for an SEO-critical storefront. `theme-color` and
  `apple-mobile-web-app-title` meta tags stay static (first-install PWA
  metadata; patching them dynamically has low value for the complexity).

## `admin/` and `employee/` changes

**Recommendation: their chrome stays neutral, not tenant-branded** — the
`Chesa're` *wordmark text* becomes `location.name` (cheap, and otherwise a
taco-shop owner would see "Chesa're" in their own back office, which is
just wrong), and the small `marca.webp` mark next to it becomes the
tenant's uploaded logo if they have one (same fetch, near-zero cost) — but
the surrounding palette (`--bg`, `--text`, the muted `--brand` accent used
in ~10 places) stays exactly as it is for every tenant. Reasoning: `admin/`
and `employee/` already use a deliberately different, near-grayscale
palette from the storefront — that was a conscious choice before this
plan, not an oversight — and a back-office tool benefiting from looking
consistent regardless of which restaurant is using it (the way a Shopify
merchant's admin looks like Shopify, not like their storefront theme) is a
reasonable default. **This is a product call, not a technical one — flagged
below for confirmation, not decided unilaterally.**

## Deployment model

**Recommendation: one deployment per restaurant**, not one shared
multi-tenant deployment resolving tenant by hostname. `customer/src/api/
client.ts`'s `LOCATION_SLUG` is a hardcoded TS constant today (not even a
`VITE_*` env var yet) — promoting it to `VITE_LOCATION_SLUG` is a small,
precedented change (matches the existing `VITE_API_BASE_URL` pattern in the
same file) and requires no new infrastructure. `backend/src/app.ts` already
serves exactly one customer SPA at `/` per running instance — that's the
existing architecture, not something this plan has to build. Real
hostname-based tenant resolution (wildcard DNS/certs, a per-request tenant
lookup middleware, per-tenant cache keys) is real infrastructure work that
only pays off at a self-serve scale (hundreds of tenants signing themselves
up) this product isn't at. Nothing here blocks adding that path later —
`Location` rows and this plan's fields work the same either way; only how a
given request picks *which* `Location` changes.

## Migration path for the existing pizzeria

`backend/prisma/seed.ts` already seeds `name`, `waNumber`, etc. on
`chesare-maltrata`'s `Location` row — this plan extends that same seed,
not a separate mechanism:

- `addressText`: `"Av. Ignacio Zaragoza S/N, Manzana 1, 94700 Maltrata, Veracruz"`
  (today's exact footer text).
- `colorScheme`: `"rojo-clasico"` — the default, so this is a no-op for the
  existing palette.
- Logo: seed reads `customer/public/marca.webp`'s bytes directly into a
  `LocationAsset` row and sets `logoAssetId` — the same crop that's shipped
  as a static file today becomes the seeded blob, so `GET .../logo` serves
  pixel-identical output to what `/marca.webp` serves now.

A fresh `npm run seed` after this ships reproduces today's site exactly;
nothing about Chesa're's live look changes.

## Decisions (confirmed by the user)

1. **The 3 color schemes above are approved as proposed** — Rojo clásico
   (current/default), Verde oliva, Azul marino, with the hex values in the
   table above. Not open for further debate unless something looks wrong
   once built.
2. **`admin`/`employee` chrome adopts the tenant's name and logo only.**
   The color scheme stays neutral (today's muted gray palette) for every
   tenant, confirmed as the intended product behavior, not just a
   recommendation.
3. **One deployment per restaurant, confirmed.** `LOCATION_SLUG` is promoted
   to `VITE_LOCATION_SLUG`, no hostname-based tenant resolution is built.
