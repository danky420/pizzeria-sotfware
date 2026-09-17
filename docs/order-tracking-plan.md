# Customer order tracking

## Context

The owner wants customers to be able to check an order's status themselves —
a Domino's-style horizontal tracker — instead of calling the shop. The order
already carries everything needed (`Order.status`, `orderNumber`,
`Customer.phone`); this is a new read-only public surface plus a small
frontend view, not a data model change.

Decisions already made with the user (do not re-litigate):

- **Lookup key is phone number + order number, together, not phone alone.**
  Phone-only lookup would be an unauthenticated endpoint that hands back
  someone's order (items, total) to anyone who enters or guesses a number —
  a real privacy hole given this project's own stance on customer PII
  (`readme.md`, "Handling secrets"). The order number is already shown on the
  confirmation screen right after checkout, so requiring both costs a
  legitimate customer nothing and makes the lookup practically unguessable
  (phone + one specific sequential order number, not phone alone).
- **Live updates via polling, not pub/sub.** There is no message broker in
  this stack (no Redis, nothing) and `admin/`/`employee/`'s "live" orders
  queue already works via 10s polling (`refetchInterval`), not push. A real
  distributed pub/sub system would be new infrastructure to provision and
  operate for a single-location shop's order volume — not worth it at this
  stage. The tracking page polls the same way the staff queue does. If
  "instant" updates ever matter enough, the documented upgrade path is
  Server-Sent Events off an in-process `EventEmitter` (no new infra, since
  there's exactly one backend instance today) — not now, and not real
  pub/sub unless this ever needs more than one backend instance.
- **No new order statuses.** The tracker's steps are exactly the real
  `OrderStatus` enum (`PENDING → CONFIRMED → PREPARING → READY → COMPLETED`),
  using the same Spanish labels `admin/`/`employee/` already show. No
  decorative stages like "Bake" or "Quality Check" that don't correspond to
  anything staff actually set.

## Backend

### New route

`GET /api/public/locations/:slug/orders/track?phone=...&orderNumber=...`

- Public (no auth), added to `backend/src/routes/public/orders.ts` alongside
  the existing `POST .../orders`.
- Rate-limited like order-submit: a new `publicTrackRateLimit` in
  `backend/src/auth/rateLimit.ts`, keyed on IP (`track:${request.ip}`), a
  tighter cap than order-submit since this is a read a customer might
  legitimately hit every 5–10s while a page is open — something like 60
  requests / 10 minutes per IP, generous enough for one open tracking tab
  polling for 10 minutes straight, tight enough to make scripted guessing
  slow.
- Zod schema (`backend/src/schemas/orders.ts`): `trackOrderQuery = z.object({
  phone: z.string().min(7).max(25), orderNumber: z.coerce.number().int().positive()
  })`.

### Lookup logic

Go through `Customer`, not a raw string match on `Order.customerPhone` —
`Customer.phone` is already digit-normalized (`phoneKey`, the same
normalization `POST .../orders` already applies), while `Order.customerPhone`
keeps whatever the customer actually typed, which can vary in formatting
between orders from the same person. Normalize the query param the same way,
then:

```
customer = Customer.findUnique({ locationId_phone: { locationId, phone: phoneKey } })
order = customer && Order.findFirst({
  where: { locationId, customerId: customer.id, orderNumber }
})
```

Not found (wrong phone, wrong order number, or a phone/order-number pair
that don't belong to the same customer) → a single generic 404
(`ORDER_NOT_FOUND`), never a different error for "phone not found" vs "order
number not found" — distinguishing them would let someone confirm a phone
number is a real customer of this shop without knowing their order number.

### Response shape — deliberately narrower than `presentOrder`

A new `presentOrderTracking(order)` in `backend/src/lib/present.ts`, used
only by this route, plus the same `location` object `POST .../orders`
already returns publicly (the tracking page needs the shop's `currency` to
format the total):

```
{
  order: {
    orderNumber, status, fulfillmentType, createdAt,
    customerName,               // fine to echo back — confirms "yes, this is my order"
    total,
    items: [{ nameSnapshot, sizeSnapshot, styleSnapshot, optionSnapshot, quantity }]
  },
  location: { id, slug, name, waNumber, timezone, currency, active }
}
```

Explicitly **not** included: `customerAddress`, `customerPhone`,
`customerNote`, `subtotal`/`discountTotal`/`promotionId`, `id`. The requester
already knows the phone and order number, but there's no reason to hand back
delivery-address or note text (which can contain gate codes, apartment
details) on a second unauthenticated surface just because the first one
needed it internally. Defense in depth, not defense in place of the
phone+order# requirement.

## Frontend (`customer/`)

### A new view, not a new router dependency

`customer/` has no client-side router today (`App.tsx` is one component with
local state). Adding `react-router-dom` for one extra screen isn't worth the
dependency — a minimal path check in `main.tsx` is enough:

```
window.location.pathname.startsWith("/rastreo") ? <TrackingPage/> : <App/>
```

`/rastreo` is a real, bookmarkable, shareable URL (matters for something a
customer might revisit or send to whoever else is picking up the order),
without pulling in a router for a single additional screen.

### `TrackingPage` component

- A small form (phone, order number) shown when neither is known yet.
- Reads `?telefono=&pedido=` query params on load, so the confirmation
  screen can link straight in pre-filled — the main door into this feature
  for most people, not the bare form.
- Once looked up: the horizontal tracker (steps = `ORDER_STATUSES.filter(s =>
  s !== "CANCELLED")`, current step = order's status), order number, items,
  total, fulfillment type — reusing `mx()` and the existing icon set, no new
  visual system. `CANCELLED` renders as a plain banner instead of a
  tracker position, same reasoning as the backend: it doesn't fit a
  forward-progress bar.
- Polls the new endpoint every 8s while `status` is one of `PENDING`,
  `CONFIRMED`, `PREPARING`, `READY`; stops (no more requests) once
  `COMPLETED` or `CANCELLED` — an order that's done doesn't need to keep
  polling forever if the tab is left open.
- Not-found / wrong phone-or-order combo: one plain message ("No encontramos
  ese pedido. Revisa tu teléfono y número de pedido."), matching the
  backend's single generic 404 — never implies which field was wrong.

### Confirmation screen

`ProductSheet`/checkout confirmation gains a "Rastrea tu pedido" link to
`/rastreo?telefono=<digits>&pedido=<orderNumber>`, using the phone the
customer just typed and the order number the server just returned.

## What does not change

- `admin/`/`employee/`'s status-change flow (`PATCH .../orders/:id/status`)
  is untouched — staff keep updating status exactly as today; this feature
  only reads.
- No schema migration — `Order.orderNumber`/`status` and `Customer.phone`
  already carry everything needed.
- No changes to the order-submit flow itself.

## Verification

- Backend: unit test the lookup (right phone+order# → 200 with the narrow
  shape; wrong phone, wrong order#, and a real phone paired with someone
  else's order# → the same generic 404; rate limit trips after the cap).
- Manual: place a real order, follow the confirmation link into `/rastreo`,
  change its status from `employee/`, confirm the tracker advances within
  one poll interval; try a wrong order number against a real phone and
  confirm the generic not-found message; leave a tab open past `COMPLETED`
  and confirm polling actually stops (check the network tab).
