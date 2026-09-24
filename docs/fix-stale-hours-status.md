# Fix: customer site showing stale open/closed status

## Context

Reported bug: after the admin updates a day's opening time, the customer
site keeps saying "Cerrado" instead of reflecting that the shop is now open.

Reproducing this through the admin form and a fresh customer page load
(new tab, cold fetch) worked correctly both times — the public
`GET /api/public/locations/:slug/hours` endpoint and `shopStatus()` in
`customer/src/lib/hours.ts` compute the right answer as soon as they're
given current data. The bug only showed up with a customer tab that was
**already open** before the admin made the change: `customer/src/App.tsx`
fetched `/hours` exactly once, in the mount effect (`Promise.all([fetchMenu,
fetchHours])`, gated on `intento` which only changes on a manual retry after
a failed load). A `useTick(60000)` interval already existed and drove a
`useMemo` that recomputes `shopStatus(hours)` every 60 seconds — but it
recomputed from the same stale `hours` object every time, never refetching
it. So a shop's real hours could change and a customer's already-open tab
would show the wrong status indefinitely, until they manually reloaded the
page.

This matters here specifically: a phone browser tab left open across a
shift change (kitchen opens, promo window ends, etc.) is exactly the
realistic case, and the tab has no reason to reload itself.

Confirmed with a scripted repro before writing the fix: loaded the customer
site, changed Thursday's hours via the real admin UI, and left the customer
tab untouched for 65 seconds (past one tick) — it still read "Cerrado.
Abrimos mañana a las 6:00 pm." A manual reload afterwards showed the
correct "Abierto ahora." confirming the data path itself was fine and the
gap was specifically the missing refetch.

## What's built

`customer/src/App.tsx`'s existing 60-second tick now also refetches
`/hours` in the background (skipping the very first tick, since the mount
effect already fetched once) and updates `hours` state with whatever comes
back. `estado`'s `useMemo` already depended on `hours`, so once the fresh
data lands the displayed status updates on the next render — no other
change needed to the recompute logic itself. A failed background refetch is
swallowed silently: a missed tick shouldn't blank out a status that was
already showing correctly.

## What this does not do

- Doesn't touch the menu's own staleness (`fetchMenu` is still mount-only).
  The bug report was about hours specifically; menu changes weren't in
  scope here.
- Doesn't add a shorter refresh interval or push-based updates (e.g.
  WebSocket/SSE) — piggybacking on the tick that already existed for the
  display recompute was enough to fix the reported bug without adding new
  infrastructure.
- Doesn't change `backend/src/routes/public/hours.ts` or
  `customer/src/lib/hours.ts` — both already computed the right answer
  once given current data; the bug was purely about the client never
  asking again.

## Verification

Typechecked, tested (`163 passed`), and built clean across all workspaces.
Reproduced the bug against the pre-fix code with a Playwright script:
customer tab opened while Thursday was closed, admin opened Thursday via
the real admin UI form, customer tab left untouched for 65s — still showed
"Cerrado" until a manual reload. Re-ran the identical script against the
fixed code: the same still-open tab flipped to "Abierto ahora. Cerramos a
las 8:00 pm." on its own within the 60s tick, no reload needed.
