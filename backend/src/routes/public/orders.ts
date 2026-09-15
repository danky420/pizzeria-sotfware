import type { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { publicOrderRateLimit } from "../../auth/rateLimit.js";
import { prisma } from "../../db/prisma.js";
import { badRequest, unprocessable } from "../../lib/http-error.js";
import { ZERO, money, sum } from "../../lib/money.js";
import { presentLocation, presentOrder } from "../../lib/present.js";
import { loadPublicLocation } from "../../lib/scope.js";
import { type SubmitOrderLine, slugParams, submitOrderBody } from "../../schemas/index.js";
import { type PriceableItem, priceableItemInclude, resolvePrice } from "../../services/pricing.js";
import { applyDiscount, selectBestPromotion } from "../../services/promotions.js";

interface BuiltLine {
  menuItemId: string;
  categoryId: string;
  nameSnapshot: string;
  sizeSnapshot: string | null;
  styleSnapshot: string | null;
  optionSnapshot: string | null;
  notes: string | null;
  unitPrice: Prisma.Decimal;
  quantity: number;
  lineTotal: Prisma.Decimal;
}

function matchItem(items: PriceableItem[], line: SubmitOrderLine): PriceableItem {
  if (line.menuItemId) {
    const byId = items.find((item) => item.id === line.menuItemId);
    if (!byId) throw badRequest("One of the items in your cart is no longer on the menu");
    return byId;
  }

  const matches = items.filter(
    (item) =>
      item.slug === line.itemSlug &&
      (!line.categorySlug || item.category.slug === line.categorySlug)
  );
  if (matches.length === 0) {
    throw badRequest("One of the items in your cart is no longer on the menu");
  }
  // Slugs are unique per category, not per location, so an ambiguous slug is the
  // caller's to disambiguate rather than ours to guess.
  if (matches.length > 1) {
    throw badRequest(`"${line.itemSlug}" matches more than one item — send categorySlug or menuItemId`);
  }
  return matches[0];
}

export default async function publicOrderRoutes(app: FastifyInstance): Promise<void> {
  app.post("/locations/:slug/orders", { config: publicOrderRateLimit }, async (request, reply) => {
    const { slug } = slugParams.parse(request.params);
    const body = submitOrderBody.parse(request.body);
    const location = await loadPublicLocation(slug);

    const menuItemIds = body.items.flatMap((line) => (line.menuItemId ? [line.menuItemId] : []));
    const itemSlugs = body.items.flatMap((line) => (line.itemSlug ? [line.itemSlug] : []));

    const candidates: Prisma.MenuItemWhereInput[] = [];
    if (menuItemIds.length > 0) candidates.push({ id: { in: menuItemIds } });
    if (itemSlugs.length > 0) candidates.push({ slug: { in: itemSlugs } });

    const items = await prisma.menuItem.findMany({
      where: { category: { locationId: location.id }, OR: candidates },
      include: priceableItemInclude
    });

    // Prices come from these rows, never from the request: a client that posts its
    // own price, or a stale price from a menu it cached, gets the current one.
    const lines: BuiltLine[] = body.items.map((line) => {
      const item = matchItem(items, line);
      const resolved = resolvePrice(item, line);
      return {
        menuItemId: item.id,
        categoryId: item.categoryId,
        nameSnapshot: item.name,
        sizeSnapshot: resolved.sizeSnapshot,
        styleSnapshot: resolved.styleSnapshot,
        optionSnapshot: resolved.optionSnapshot,
        notes: line.notes ?? null,
        unitPrice: resolved.unitPrice,
        quantity: line.quantity,
        lineTotal: money(resolved.unitPrice.times(line.quantity))
      };
    });

    const subtotal = sum(lines.map((line) => line.lineTotal));

    const promotions = await prisma.promotion.findMany({
      where: {
        locationId: location.id,
        active: true,
        ...(body.promotionCode ? { code: body.promotionCode } : { code: null })
      }
    });

    if (body.promotionCode && promotions.length === 0) {
      throw unprocessable("That promotion code is not valid");
    }

    const best = selectBestPromotion(promotions, lines, subtotal);
    if (body.promotionCode && !best) {
      throw unprocessable("That promotion code does not apply to this order");
    }

    const discountTotal = best?.discountTotal ?? ZERO;
    const total = applyDiscount(subtotal, discountTotal);

    // The customer record is keyed on digits only so "272 260 3537" and
    // "2722603537" are the same regular; the order keeps what was actually typed.
    const phoneKey = body.customer.phone.replace(/[^0-9]/g, "");
    if (phoneKey.length < 7) {
      throw badRequest("Enter a phone number staff can call you back on");
    }

    const order = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const customer = await tx.customer.upsert({
        where: { locationId_phone: { locationId: location.id, phone: phoneKey } },
        create: {
          locationId: location.id,
          phone: phoneKey,
          name: body.customer.name ?? null,
          addressText: body.customer.address ?? null
        },
        update: {
          ...(body.customer.name ? { name: body.customer.name } : {}),
          ...(body.customer.address ? { addressText: body.customer.address } : {})
        }
      });

      const created = await tx.order.create({
        data: {
          locationId: location.id,
          customerId: customer.id,
          fulfillmentType: body.fulfillmentType,
          customerName: body.customer.name ?? null,
          customerPhone: body.customer.phone,
          customerAddress: body.customer.address ?? null,
          customerNote: body.customer.note ?? null,
          subtotal,
          discountTotal,
          total,
          promotionId: best?.promotion.id ?? null,
          items: {
            create: lines.map((line) => ({
              menuItemId: line.menuItemId,
              nameSnapshot: line.nameSnapshot,
              sizeSnapshot: line.sizeSnapshot,
              styleSnapshot: line.styleSnapshot,
              optionSnapshot: line.optionSnapshot,
              notes: line.notes,
              unitPrice: line.unitPrice,
              quantity: line.quantity,
              lineTotal: line.lineTotal
            }))
          }
        },
        include: { items: true }
      });

      await tx.customer.update({
        where: { id: customer.id },
        data: {
          orderCount: { increment: 1 },
          totalSpent: { increment: total },
          lastOrderAt: created.createdAt
        }
      });

      return created;
    });

    return reply.status(201).send({
      order: presentOrder(order),
      location: presentLocation(location)
    });
  });
}
