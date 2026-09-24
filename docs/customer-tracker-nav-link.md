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

- **"Menú"** — a `<button>`, not a link (nothing to navigate to), that
  smooth-scrolls to the top of the page.
- **"Rastrear pedido"** — a plain `<a href="/rastreo">`. `main.tsx` already
  routes that path to `TrackingPage` via a plain pathname check (no
  react-router in this app), so this needed no routing changes at all —
  it's a link to a page that was already fully built.

Styled as a pill button matching the category buttons' look
(`box-shadow` inset border, `border-radius: 999px`) — deliberately written
as its own rule (`.nav-top-track`) rather than left to inherit that
appearance by coincidence of both being an `<a>` somewhere inside `.nav`.

## What this does not do

- No backend or API changes — `/rastreo` and its lookup endpoint
  (`GET /locations/:slug/orders/track`) are untouched.
- Doesn't remember a customer's last order (see Context above).
- No dropdown/expand behavior for "Menú" — see Context above for why.

## Verification

No backend involved, so nothing in `backend/test`. Typechecked and built
clean. Verified in a real browser: no horizontal overflow at 1200px or
390px, "Menú" scrolls smoothly back to the top from partway down the page,
"Rastrear pedido" navigates to `/rastreo`, and both render correctly in
dark mode.
