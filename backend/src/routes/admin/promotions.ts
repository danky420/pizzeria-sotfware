import type { FastifyInstance } from "fastify";
import { BACK_OFFICE_ROLES, requireAuth, requireRole } from "../../auth/middleware.js";
import { prisma } from "../../db/prisma.js";
import { badRequest } from "../../lib/http-error.js";
import { money } from "../../lib/money.js";
import { presentPromotion } from "../../lib/present.js";
import { loadLocation, loadPromotion } from "../../lib/scope.js";
import {
  createPromotionBody,
  idParams,
  promotionListQuery,
  updatePromotionBody
} from "../../schemas/index.js";
import { isPromotionActive } from "../../services/promotions.js";

/**
 * A promotion may only point at a category or item of its own location —
 * otherwise a scoped discount could be aimed at another tenant's menu.
 */
async function assertTargetsBelongToLocation(
  locationId: string,
  categoryId: string | null | undefined,
  menuItemId: string | null | undefined
): Promise<void> {
  if (categoryId) {
    const category = await prisma.menuCategory.findUnique({ where: { id: categoryId } });
    if (!category || category.locationId !== locationId) {
      throw badRequest("That category does not belong to this location");
    }
  }
  if (menuItemId) {
    const item = await prisma.menuItem.findUnique({
      where: { id: menuItemId },
      include: { category: true }
    });
    if (!item || item.category.locationId !== locationId) {
      throw badRequest("That menu item does not belong to this location");
    }
  }
}

export default async function adminPromotionRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);
  app.addHook("preHandler", requireRole(...BACK_OFFICE_ROLES));

  app.get("/locations/:id/promotions", async (request) => {
    const { id } = idParams.parse(request.params);
    const query = promotionListQuery.parse(request.query);
    await loadLocation(request, id);

    const promotions = await prisma.promotion.findMany({
      where: { locationId: id },
      orderBy: { createdAt: "desc" }
    });

    const visible = query.activeOnly
      ? promotions.filter((promotion) => isPromotionActive(promotion))
      : promotions;

    return { promotions: visible.map(presentPromotion) };
  });

  app.post("/locations/:id/promotions", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const body = createPromotionBody.parse(request.body);
    await loadLocation(request, id);
    await assertTargetsBelongToLocation(id, body.categoryId, body.menuItemId);

    const promotion = await prisma.promotion.create({
      data: {
        locationId: id,
        name: body.name,
        description: body.description ?? null,
        code: body.code ?? null,
        discountType: body.discountType,
        discountValue: money(body.discountValue),
        scope: body.scope,
        categoryId: body.categoryId ?? null,
        menuItemId: body.menuItemId ?? null,
        minSubtotal: body.minSubtotal === undefined || body.minSubtotal === null ? null : money(body.minSubtotal),
        startsAt: body.startsAt ?? null,
        endsAt: body.endsAt ?? null,
        active: body.active
      }
    });

    return reply.status(201).send({ promotion: presentPromotion(promotion) });
  });

  app.get("/promotions/:id", async (request) => {
    const { id } = idParams.parse(request.params);
    return { promotion: presentPromotion(await loadPromotion(request, id)) };
  });

  app.patch("/promotions/:id", async (request) => {
    const { id } = idParams.parse(request.params);
    const body = updatePromotionBody.parse(request.body);
    const existing = await loadPromotion(request, id);
    await assertTargetsBelongToLocation(existing.locationId, body.categoryId, body.menuItemId);

    const promotion = await prisma.promotion.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
        code: body.code,
        discountType: body.discountType,
        discountValue: body.discountValue === undefined ? undefined : money(body.discountValue),
        scope: body.scope,
        categoryId: body.categoryId,
        menuItemId: body.menuItemId,
        minSubtotal:
          body.minSubtotal === undefined || body.minSubtotal === null ? body.minSubtotal : money(body.minSubtotal),
        startsAt: body.startsAt,
        endsAt: body.endsAt,
        active: body.active
      }
    });

    return { promotion: presentPromotion(promotion) };
  });

  app.delete("/promotions/:id", async (request) => {
    const { id } = idParams.parse(request.params);
    await loadPromotion(request, id);
    await prisma.promotion.delete({ where: { id } });
    return { ok: true };
  });
}
