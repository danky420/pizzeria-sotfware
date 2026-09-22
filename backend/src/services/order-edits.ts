import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { badRequest, conflict, notFound } from "../lib/http-error.js";
import { ZERO, money, sum } from "../lib/money.js";
import type { EditOrderBody, EditOrderChange } from "../schemas/orders.js";
import { priceableItemInclude, resolvePrice } from "./pricing.js";
import { applyDiscount, computeDiscount, type DiscountableLine } from "./promotions.js";
import { TERMINAL_ORDER_STATUSES } from "./orders.js";

/**
 * A human-readable line for the edit history panel -- what moved, not a full
 * before/after row dump. `unitPrice` on item_added is a plain number (this is
 * a read model, not a DB row) so the client never has to know Decimal exists,
 * matching every other money field this API returns.
 */
export type OrderEditChangeSummary =
  | {
      type: "quantity_changed";
      orderItemId: string;
      name: string;
      detail: string | null;
      from: number;
      to: number;
    }
  | { type: "item_removed"; orderItemId: string; name: string; detail: string | null; quantity: number }
  | { type: "item_added"; name: string; detail: string | null; quantity: number; unitPrice: number };

function lineDetail(size: string | null, style: string | null, option: string | null): string | null {
  return [size, style, option].filter(Boolean).join(" · ") || null;
}

const editOrderInclude = {
  items: { include: { menuItem: { select: { categoryId: true } } } },
  promotion: true
} satisfies Prisma.OrderInclude;

export async function editOrder(orderId: string, editedById: string, body: EditOrderBody) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: editOrderInclude });
    if (!order) throw notFound("Order not found");
    if (TERMINAL_ORDER_STATUSES.includes(order.status)) {
      throw conflict(`A ${order.status.toLowerCase()} order can't be edited`);
    }

    const itemsById = new Map(order.items.map((item) => [item.id, item]));
    const summary: OrderEditChangeSummary[] = [];
    const idsToDelete: string[] = [];
    const quantityUpdates = new Map<string, number>();
    const linesToCreate: Prisma.OrderItemCreateManyInput[] = [];

    const additions = body.changes.filter(
      (change): change is Extract<EditOrderChange, { type: "add_item" }> => change.type === "add_item"
    );
    const menuItems = additions.length
      ? await tx.menuItem.findMany({
          where: { id: { in: additions.map((change) => change.menuItemId) }, category: { locationId: order.locationId } },
          include: priceableItemInclude
        })
      : [];
    const menuItemById = new Map(menuItems.map((item) => [item.id, item]));

    for (const change of body.changes) {
      if (change.type === "set_quantity") {
        const existing = itemsById.get(change.orderItemId);
        if (!existing) throw badRequest("One of the items in this edit is not on this order");
        if (change.quantity === existing.quantity) continue;

        if (change.quantity === 0) {
          idsToDelete.push(existing.id);
          summary.push({
            type: "item_removed",
            orderItemId: existing.id,
            name: existing.nameSnapshot,
            detail: lineDetail(existing.sizeSnapshot, existing.styleSnapshot, existing.optionSnapshot),
            quantity: existing.quantity
          });
        } else {
          quantityUpdates.set(existing.id, change.quantity);
          summary.push({
            type: "quantity_changed",
            orderItemId: existing.id,
            name: existing.nameSnapshot,
            detail: lineDetail(existing.sizeSnapshot, existing.styleSnapshot, existing.optionSnapshot),
            from: existing.quantity,
            to: change.quantity
          });
        }
      } else {
        const item = menuItemById.get(change.menuItemId);
        if (!item) throw badRequest("One of the items you're adding is not on this menu");
        const resolved = resolvePrice(item, change);
        linesToCreate.push({
          orderId,
          menuItemId: item.id,
          nameSnapshot: item.name,
          sizeSnapshot: resolved.sizeSnapshot,
          styleSnapshot: resolved.styleSnapshot,
          optionSnapshot: resolved.optionSnapshot,
          notes: change.notes ?? null,
          unitPrice: resolved.unitPrice,
          quantity: change.quantity,
          lineTotal: money(resolved.unitPrice.times(change.quantity))
        });
        summary.push({
          type: "item_added",
          name: item.name,
          detail: lineDetail(resolved.sizeSnapshot, resolved.styleSnapshot, resolved.optionSnapshot),
          quantity: change.quantity,
          unitPrice: Number(resolved.unitPrice)
        });
      }
    }

    if (summary.length === 0) {
      throw badRequest("That edit doesn't change anything on the order");
    }

    if (idsToDelete.length > 0) {
      await tx.orderItem.deleteMany({ where: { id: { in: idsToDelete }, orderId } });
    }
    for (const [id, quantity] of quantityUpdates) {
      const existing = itemsById.get(id);
      if (!existing) continue;
      await tx.orderItem.update({
        where: { id },
        data: { quantity, lineTotal: money(existing.unitPrice.times(quantity)) }
      });
    }
    if (linesToCreate.length > 0) {
      await tx.orderItem.createMany({ data: linesToCreate });
    }

    const survivingItems = await tx.orderItem.findMany({
      where: { orderId },
      include: { menuItem: { select: { categoryId: true } } }
    });
    const subtotal = sum(survivingItems.map((item) => item.lineTotal));

    // Recompute the SAME promotion's discount against the new subtotal --
    // never re-select a different "best" promotion, which would apply a deal
    // the customer never actually agreed to at checkout.
    let discountTotal = ZERO;
    if (order.promotion) {
      const lines: DiscountableLine[] = survivingItems.map((item) => ({
        menuItemId: item.menuItemId,
        categoryId: item.menuItem?.categoryId ?? null,
        lineTotal: item.lineTotal
      }));
      discountTotal = computeDiscount(order.promotion, lines, subtotal);
    }
    const total = applyDiscount(subtotal, discountTotal);

    const updatedOrder = await tx.order.update({
      where: { id: orderId },
      data: { subtotal, discountTotal, total },
      include: { items: { orderBy: { createdAt: "asc" } } }
    });

    // Keep the customer's lifetime total honest -- it was incremented by the
    // original total at checkout, so only the delta belongs here.
    if (order.customerId) {
      const delta = total.minus(order.total);
      if (!delta.isZero()) {
        await tx.customer.update({ where: { id: order.customerId }, data: { totalSpent: { increment: delta } } });
      }
    }

    const edit = await tx.orderEdit.create({
      data: {
        orderId,
        editedById,
        reason: body.reason,
        changes: summary as unknown as Prisma.InputJsonValue,
        previousTotal: order.total,
        newTotal: total
      },
      include: { editedBy: { select: { id: true, name: true } } }
    });

    return { order: updatedOrder, edit };
  });
}

export function listOrderEdits(orderId: string) {
  return prisma.orderEdit.findMany({
    where: { orderId },
    orderBy: { createdAt: "desc" },
    include: { editedBy: { select: { id: true, name: true } } }
  });
}
