import type { FastifyInstance } from "fastify";
import { ORDER_ROLES, requireAuth, requireRole } from "../../auth/middleware.js";
import { prisma } from "../../db/prisma.js";
import { presentMenuTree, presentItem } from "../../lib/present.js";
import { loadItem, loadLocation } from "../../lib/scope.js";
import { idParams, patchItemAvailabilityBody } from "../../schemas/index.js";
import { loadMenuTree } from "../../services/menu.js";
import { itemInclude } from "./menu.js";

/**
 * The one menu write a STAFF session gets: marking an item out of stock, or
 * back in stock, without the rest of admin/menu.ts's BACK_OFFICE_ROLES-only
 * surface (prices, categories, images). A separate file rather than relaxing
 * that file's blanket role guard for one route.
 */
export default async function itemAvailabilityRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);
  app.addHook("preHandler", requireRole(...ORDER_ROLES));

  // includeHidden: true so a currently-unavailable item still shows up here --
  // the whole point is toggling it back on -- but categories the owner has
  // actually turned off (not just "sold out today") are filtered first, since
  // that's a catalog decision above what this screen is for.
  app.get("/locations/:id/menu/availability", async (request) => {
    const { id } = idParams.parse(request.params);
    await loadLocation(request, id);
    const categories = await loadMenuTree(id);
    const active = categories.filter((category) => category.active);
    return { categories: presentMenuTree(active, { includeHidden: true }) };
  });

  app.patch("/menu/items/:id/availability", async (request) => {
    const { id } = idParams.parse(request.params);
    const body = patchItemAvailabilityBody.parse(request.body);
    await loadItem(request, id);
    const item = await prisma.menuItem.update({
      where: { id },
      data: { available: body.available },
      include: itemInclude
    });
    return { item: presentItem(item) };
  });
}
