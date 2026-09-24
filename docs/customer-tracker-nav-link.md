# Persistent "Rastrear pedido" nav link

## Context

The order-tracking page (`/rastreo`, `docs/order-tracking-plan.md`) already
existed, but the only way a customer ever reached it was a link handed to
them once, right after placing an order. Close that tab or lose that link —
in a browser, on a shared family phone, whatever — and there was no way
back in short of retyping `/rastreo` from memory. The customer still has
everything needed to look their order up (their own phone number and the
order number read back to them on the phone), just no path to the page that
asks for it.

The fix discussed was modeled on a large chain's site (a reference
screenshot of Domino's: a flat top nav — `ORDER NOW · MENU · DEALS · MY
REWARDS · TRACKER` — with `MENU` implied to expand into a submenu). This
site is a single page, not a multi-page site, so most of that pattern
doesn't map over: there's no separate "menu page" to link to, since the
whole page already is the menu. Two decisions were made to adapt it rather
than copy it wholesale:

- **"Menú" doesn't get a dropdown.** The category pills (Pizzas,
  Hamburguesas, ...) already sit in an always-visible sticky bar today —
  hiding them behind a menu that has to be tapped open would be a strictly
  worse version of what's already there. "Menú" instead becomes a small
  label above that same pill row and, since a static label with no
  affordance reads as a dead click target, a "scroll to the top" action.
- **"Rastrear pedido" always opens a blank lookup form**, exactly like
  `/rastreo` already behaves when opened cold (e.g. a shared link opened on
  a new device). No local storage, no remembering the last order placed on
  this browser — that was considered and set aside as a later enhancement
  if it turns out to matter, since the customer always has their phone
  number and order number regardless of device.

## What's built

A new row, `.nav-top`, inside the existing sticky `<nav>` (`App.tsx`), above
the category-pill row it already contained:

- **"Menú"** — on the main site, a `<button>` (nothing to navigate to)
  that smooth-scrolls to the top of the page. On `TrackingPage` (see
  below), it's a real `<a href="/">` back to the ordering site, since
  there's no scroll target on that standalone page.
- **"Rastrear pedido"** — a plain `<a href="/rastreo">`. `main.tsx` already
  routes that path to `TrackingPage` via a plain pathname check (no
  react-router in this app), so this needed no routing changes at all —
  it's a link to a page that was already fully built.

**The bar itself is a solid color** — the site's own red (`--rojo`), not
Domino's blue — spanning the full viewport width, sitting above the
still-cream category-pill row. The color change is the separator between
the two; no border needed between them. "Rastrear pedido" renders as an
**outline** pill against that red bar by default — a solid fill was tried
first and reported back as looking "always selected", since a filled pill
is exactly what an active category pill below it means. The solid fill is
reserved for the `.on` modifier, used only on `TrackingPage` itself, where
it genuinely is the page you're on — the same idea as an active category
pill, just not implied everywhere this link appears.

**`TrackingPage` renders the same `.nav-top` row**, right below its own
simplified header, so the primary nav persists across both pages exactly
like Domino's own tracker page keeps its top nav — matching the second
reference screenshot the request was built against.

## A real bug found and fixed along the way

`.nav-in`'s category-pill styling was written as `.nav a` / `.nav a.on` —
"any anchor inside `.nav`", not "any anchor inside `.nav-in`". That was a
latent trap from the moment `.nav-top` was added (an earlier version of
this same change already had to route around it once, for `.nav-top-track`
alone), and it triggered for real once "Menú" became an actual `<a>` on
`TrackingPage`: both it and the category pills are `<a>` tags somewhere
inside the same `<nav>`, and `.nav a.on`'s higher specificity than the
purpose-built `.nav-top-track.on` won the cascade, making "Rastrear
pedido" render with the wrong red shade and no ring, and "Menú" pick up
a cream pill it was never meant to have. Fixed at the root this time:
rescoped both selectors to `.nav-in a` / `.nav-in a.on`, which is what
they always should have been.

## What this does not do

- No backend or API changes — `/rastreo` and its lookup endpoint
  (`GET /locations/:slug/orders/track`) are untouched.
- Doesn't remember a customer's last order (see Context above).
- No dropdown/expand behavior for "Menú" — see Context above for why.

## Verification

No backend involved, so nothing in `backend/test`. Typechecked and built
clean. Verified in a real browser: no horizontal overflow at 390px, 1200px,
or 2000px; "Menú" scrolls smoothly back to the top from partway down the
page on the main site and navigates to `/` on `TrackingPage`; "Rastrear
pedido" navigates to `/rastreo` and renders in its active state once
there; both pages render correctly in dark mode; and the computed styles
for both nav-top links were checked directly (not just eyeballed from a
screenshot) to confirm the specificity bug above was actually fixed, not
just visually similar.
