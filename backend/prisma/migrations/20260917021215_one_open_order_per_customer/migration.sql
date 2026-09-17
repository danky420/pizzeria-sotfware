-- Anti-abuse: at most one non-terminal order per customer at a time. There is
-- no online payment, so nothing stops a customer (or a bad actor with a real
-- phone) from stacking up orders the kitchen has no way to bill for; this and
-- the confirming phone call staff already make are the two lines of defense
-- (see docs/order-abuse-prevention.md).
--
-- A DB-level partial unique index rather than an app-level check-then-insert:
-- two concurrent submits for the same customer could both pass an app-level
-- check before either commits. Prisma's schema can't express a partial unique
-- index, so this constraint exists only here, not in schema.prisma; the route
-- handler catches the resulting unique-violation (Prisma error P2002) and
-- turns it into a 409 with a customer-facing message.
CREATE UNIQUE INDEX "Order_one_open_per_customer"
  ON "Order" ("customerId")
  WHERE "customerId" IS NOT NULL AND "status" NOT IN ('COMPLETED', 'CANCELLED');
