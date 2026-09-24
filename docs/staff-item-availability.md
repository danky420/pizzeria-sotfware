# Staff item availability

## Context

"We ran out of pepperoni today" is a daily-operations problem, not a
back-office one — but the only route that could flip `MenuItem.available`
lived in `admin/menu.ts`, guarded by `BACK_OFFICE_ROLES`, alongside prices,
categories, and image uploads. Giving STAFF that whole file would hand them
pricing control to fix a one-line stock problem; the actual ask was much
narrower: let an employee mark something out of stock (and back in) without
touching anything else about the menu.

`employee/` had exactly one section before this (the orders queue —
`AppShell`'s own comment said so explicitly). Adding a second screen was a
deliberate, small expansion of what that app is, not an accident.

## What's built

**The existing `PATCH /menu/items/:id/availability` route moved** out of
`admin/menu.ts` into a new `admin/item-availability.ts`, guarded by
`ORDER_ROLES` (STAFF included) instead of `BACK_OFFICE_ROLES`. Same path,
same behavior, same tests for OWNER/MANAGER — it's a file move for the role
boundary, not a behavior change for back-office roles.

**A new `GET /api/admin/locations/:id/menu/availability`**, also
`ORDER_ROLES`, purpose-built for this one screen: active categories only
(a category the owner has actually turned off is a catalog decision above
what this screen is for), but **every item within them regardless of
current availability** — the whole point is toggling a hidden item back on,
so filtering unavailable items out (like the order-editing item picker
deliberately does) would defeat the feature. This required a third
"which categories/items" filtering behavior, distinct from both the
BACK_OFFICE `GET .../menu` (`includeHidden: true`, everything) and the
order-editing picker's `GET .../orders/menu` (`includeHidden: false`,
hides both inactive categories and unavailable items).

**`employee/` gets a "Menú" nav link** next to "Pedidos" — the first time
this app has had more than one section — leading to a lean
`AvailabilityPage`: item name, a toggle, nothing else. No prices, no
descriptions, no images, no category management.

**`Toggle` moved from `admin/`'s local components into
`@chesare/portal-shared`**, since `employee/` now needs it too.
`admin/`'s own existing availability toggle (in the full menu editor) is
unaffected — it's the same component, imported from a different place.

## What this does not do

- No price editing, category editing, image upload, or option-group editing
  — still entirely `BACK_OFFICE_ROLES` only, in `admin/menu.ts`.
- No adding or removing items from the catalog — only flipping
  `available` on an item that already exists.
- Doesn't touch categories the owner has deliberately deactivated — those
  stay invisible to this screen, same as everywhere else.

## Verification

Backend: `backend/test/admin-menu.test.ts`,
`describe("STAFF item availability")` — STAFF can toggle an item off and
back on, the listing includes an item that's currently unavailable, and
cross-tenant access is refused. `backend/test/admin-access.test.ts`'s
STAFF-boundary test updated to reflect that this one menu write is now
allowed (while every other menu write still isn't). 163 backend tests
passing at the time this shipped.

End-to-end: verified as a real STAFF session — toggled an item off, reloaded
to confirm it persisted in the database (not just local UI state), checked
phone width, and confirmed `admin/`'s own toggle still works after the
`Toggle` move.
