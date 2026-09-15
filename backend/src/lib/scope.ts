import type { FastifyRequest } from "fastify";
import { assertLocationAccess } from "../auth/middleware.js";
import { prisma } from "../db/prisma.js";
import { notFound } from "./http-error.js";

/**
 * Every admin handler loads its target row through one of these. They all walk
 * the row back up to its owning Location and run it through assertLocationAccess,
 * because a `:id` in the path proves only that the caller can type an id.
 */

/**
 * Public counterpart: no session to scope against, so an inactive location is
 * simply invisible rather than forbidden.
 */
export async function loadPublicLocation(slug: string) {
  const location = await prisma.location.findUnique({ where: { slug } });
  if (!location || !location.active) throw notFound("Location not found");
  return location;
}

export async function loadLocation(request: FastifyRequest, locationId: string) {
  const location = await prisma.location.findUnique({ where: { id: locationId } });
  if (!location) throw notFound("Location not found");
  assertLocationAccess(request, location.id);
  return location;
}

export async function loadCategory(request: FastifyRequest, categoryId: string) {
  const category = await prisma.menuCategory.findUnique({ where: { id: categoryId } });
  if (!category) throw notFound("Category not found");
  assertLocationAccess(request, category.locationId);
  return category;
}

export async function loadSizeOption(request: FastifyRequest, optionId: string) {
  const option = await prisma.menuCategorySizeOption.findUnique({
    where: { id: optionId },
    include: { category: true }
  });
  if (!option) throw notFound("Size option not found");
  assertLocationAccess(request, option.category.locationId);
  return option;
}

export async function loadStyleOption(request: FastifyRequest, optionId: string) {
  const option = await prisma.menuCategoryStyleOption.findUnique({
    where: { id: optionId },
    include: { category: true }
  });
  if (!option) throw notFound("Style option not found");
  assertLocationAccess(request, option.category.locationId);
  return option;
}

export async function loadItem(request: FastifyRequest, itemId: string) {
  const item = await prisma.menuItem.findUnique({
    where: { id: itemId },
    include: { category: true }
  });
  if (!item) throw notFound("Menu item not found");
  assertLocationAccess(request, item.category.locationId);
  return item;
}

export async function loadOptionGroup(request: FastifyRequest, groupId: string) {
  const group = await prisma.menuItemOptionGroup.findUnique({
    where: { id: groupId },
    include: { menuItem: { include: { category: true } } }
  });
  if (!group) throw notFound("Option group not found");
  assertLocationAccess(request, group.menuItem.category.locationId);
  return group;
}

export async function loadChoice(request: FastifyRequest, choiceId: string) {
  const choice = await prisma.menuItemOptionChoice.findUnique({
    where: { id: choiceId },
    include: { optionGroup: { include: { menuItem: { include: { category: true } } } } }
  });
  if (!choice) throw notFound("Option choice not found");
  assertLocationAccess(request, choice.optionGroup.menuItem.category.locationId);
  return choice;
}

export async function loadPromotion(request: FastifyRequest, promotionId: string) {
  const promotion = await prisma.promotion.findUnique({ where: { id: promotionId } });
  if (!promotion) throw notFound("Promotion not found");
  assertLocationAccess(request, promotion.locationId);
  return promotion;
}

export async function loadOrder(request: FastifyRequest, orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true }
  });
  if (!order) throw notFound("Order not found");
  assertLocationAccess(request, order.locationId);
  return order;
}

export async function loadCustomer(request: FastifyRequest, customerId: string) {
  const customer = await prisma.customer.findUnique({ where: { id: customerId } });
  if (!customer) throw notFound("Customer not found");
  assertLocationAccess(request, customer.locationId);
  return customer;
}

export async function loadAdminUser(request: FastifyRequest, userId: string) {
  const user = await prisma.adminUser.findUnique({ where: { id: userId } });
  if (!user) throw notFound("User not found");
  assertLocationAccess(request, user.locationId);
  return user;
}
