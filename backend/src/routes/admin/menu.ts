import { Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { BACK_OFFICE_ROLES, requireAuth, requireRole } from "../../auth/middleware.js";
import { prisma } from "../../db/prisma.js";
import { badRequest } from "../../lib/http-error.js";
import { money } from "../../lib/money.js";
import {
  presentCategory,
  presentChoice,
  presentItem,
  presentMenuTree,
  presentOptionGroup,
  presentPriceCell,
  presentSizeOption,
  presentStyleOption
} from "../../lib/present.js";
import {
  loadCategory,
  loadChoice,
  loadItem,
  loadLocation,
  loadOptionGroup,
  loadSizeOption,
  loadStyleOption
} from "../../lib/scope.js";
import {
  createCategoryBody,
  createChoiceBody,
  createItemBody,
  createOptionGroupBody,
  createSizeOptionBody,
  createStyleOptionBody,
  idParams,
  patchItemAvailabilityBody,
  patchItemPriceBody,
  putPriceMatrixBody,
  updateCategoryBody,
  updateChoiceBody,
  updateItemBody,
  updateOptionGroupBody,
  updateSizeOptionBody,
  updateStyleOptionBody
} from "../../schemas/index.js";
import { loadMenuTree } from "../../services/menu.js";

function toMoney(value: number | null | undefined) {
  if (value === undefined) return undefined;
  return value === null ? null : money(value);
}

// A nullable Json column needs Prisma.DbNull to be set back to SQL NULL; a plain
// null would be rejected as ambiguous with JSON's own null.
function toJson(value: string[] | null | undefined) {
  if (value === undefined) return undefined;
  return value === null ? Prisma.DbNull : value;
}

const itemInclude = {
  priceCells: true,
  optionGroups: { orderBy: { sortOrder: "asc" }, include: { choices: { orderBy: { sortOrder: "asc" } } } }
} satisfies Prisma.MenuItemInclude;

export default async function adminMenuRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);
  app.addHook("preHandler", requireRole(...BACK_OFFICE_ROLES));

  app.get("/locations/:id/menu", async (request) => {
    const { id } = idParams.parse(request.params);
    await loadLocation(request, id);
    const categories = await loadMenuTree(id);
    return { categories: presentMenuTree(categories, { includeHidden: true }) };
  });

  app.get("/locations/:id/menu/categories", async (request) => {
    const { id } = idParams.parse(request.params);
    await loadLocation(request, id);
    const categories = await prisma.menuCategory.findMany({
      where: { locationId: id },
      orderBy: { sortOrder: "asc" }
    });
    return { categories: categories.map(presentCategory) };
  });

  app.post("/locations/:id/menu/categories", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const body = createCategoryBody.parse(request.body);
    await loadLocation(request, id);
    const category = await prisma.menuCategory.create({ data: { ...body, locationId: id } });
    return reply.status(201).send({ category: presentCategory(category) });
  });

  app.get("/menu/categories/:id", async (request) => {
    const { id } = idParams.parse(request.params);
    await loadCategory(request, id);
    const category = await prisma.menuCategory.findUniqueOrThrow({
      where: { id },
      include: { sizeOptions: true, styleOptions: true }
    });
    return {
      category: presentCategory(category),
      sizeOptions: category.sizeOptions.map(presentSizeOption),
      styleOptions: category.styleOptions.map(presentStyleOption)
    };
  });

  app.patch("/menu/categories/:id", async (request) => {
    const { id } = idParams.parse(request.params);
    const body = updateCategoryBody.parse(request.body);
    await loadCategory(request, id);
    const category = await prisma.menuCategory.update({ where: { id }, data: body });
    return { category: presentCategory(category) };
  });

  app.delete("/menu/categories/:id", async (request) => {
    const { id } = idParams.parse(request.params);
    await loadCategory(request, id);
    await prisma.menuCategory.delete({ where: { id } });
    return { ok: true };
  });

  app.get("/menu/categories/:id/size-options", async (request) => {
    const { id } = idParams.parse(request.params);
    await loadCategory(request, id);
    const options = await prisma.menuCategorySizeOption.findMany({
      where: { categoryId: id },
      orderBy: { sortOrder: "asc" }
    });
    return { sizeOptions: options.map(presentSizeOption) };
  });

  app.post("/menu/categories/:id/size-options", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const body = createSizeOptionBody.parse(request.body);
    await loadCategory(request, id);
    const option = await prisma.menuCategorySizeOption.create({ data: { ...body, categoryId: id } });
    return reply.status(201).send({ sizeOption: presentSizeOption(option) });
  });

  app.patch("/menu/size-options/:id", async (request) => {
    const { id } = idParams.parse(request.params);
    const body = updateSizeOptionBody.parse(request.body);
    await loadSizeOption(request, id);
    const option = await prisma.menuCategorySizeOption.update({ where: { id }, data: body });
    return { sizeOption: presentSizeOption(option) };
  });

  app.delete("/menu/size-options/:id", async (request) => {
    const { id } = idParams.parse(request.params);
    await loadSizeOption(request, id);
    await prisma.menuCategorySizeOption.delete({ where: { id } });
    return { ok: true };
  });

  app.get("/menu/categories/:id/style-options", async (request) => {
    const { id } = idParams.parse(request.params);
    await loadCategory(request, id);
    const options = await prisma.menuCategoryStyleOption.findMany({
      where: { categoryId: id },
      orderBy: { sortOrder: "asc" }
    });
    return { styleOptions: options.map(presentStyleOption) };
  });

  app.post("/menu/categories/:id/style-options", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const body = createStyleOptionBody.parse(request.body);
    await loadCategory(request, id);
    const option = await prisma.menuCategoryStyleOption.create({ data: { ...body, categoryId: id } });
    return reply.status(201).send({ styleOption: presentStyleOption(option) });
  });

  app.patch("/menu/style-options/:id", async (request) => {
    const { id } = idParams.parse(request.params);
    const body = updateStyleOptionBody.parse(request.body);
    await loadStyleOption(request, id);
    const option = await prisma.menuCategoryStyleOption.update({ where: { id }, data: body });
    return { styleOption: presentStyleOption(option) };
  });

  app.delete("/menu/style-options/:id", async (request) => {
    const { id } = idParams.parse(request.params);
    await loadStyleOption(request, id);
    await prisma.menuCategoryStyleOption.delete({ where: { id } });
    return { ok: true };
  });

  app.get("/menu/categories/:id/items", async (request) => {
    const { id } = idParams.parse(request.params);
    await loadCategory(request, id);
    const items = await prisma.menuItem.findMany({
      where: { categoryId: id },
      orderBy: { sortOrder: "asc" },
      include: itemInclude
    });
    return { items: items.map(presentItem) };
  });

  app.post("/menu/categories/:id/items", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const body = createItemBody.parse(request.body);
    await loadCategory(request, id);

    const item = await prisma.menuItem.create({
      data: {
        categoryId: id,
        slug: body.slug,
        name: body.name,
        description: body.description ?? null,
        itemType: body.itemType,
        flatPrice: toMoney(body.flatPrice),
        subgroupLabel: body.subgroupLabel ?? null,
        toppingColors: toJson(body.toppingColors),
        isFeatured: body.isFeatured,
        ageRestricted: body.ageRestricted,
        available: body.available,
        sortOrder: body.sortOrder
      },
      include: itemInclude
    });

    return reply.status(201).send({ item: presentItem(item) });
  });

  app.get("/menu/items/:id", async (request) => {
    const { id } = idParams.parse(request.params);
    await loadItem(request, id);
    const item = await prisma.menuItem.findUniqueOrThrow({ where: { id }, include: itemInclude });
    return { item: presentItem(item) };
  });

  app.patch("/menu/items/:id", async (request) => {
    const { id } = idParams.parse(request.params);
    const body = updateItemBody.parse(request.body);
    await loadItem(request, id);

    const item = await prisma.menuItem.update({
      where: { id },
      data: {
        slug: body.slug,
        name: body.name,
        description: body.description,
        itemType: body.itemType,
        flatPrice: toMoney(body.flatPrice),
        subgroupLabel: body.subgroupLabel,
        toppingColors: toJson(body.toppingColors),
        isFeatured: body.isFeatured,
        ageRestricted: body.ageRestricted,
        available: body.available,
        sortOrder: body.sortOrder
      },
      include: itemInclude
    });

    return { item: presentItem(item) };
  });

  app.delete("/menu/items/:id", async (request) => {
    const { id } = idParams.parse(request.params);
    await loadItem(request, id);
    await prisma.menuItem.delete({ where: { id } });
    return { ok: true };
  });

  app.patch("/menu/items/:id/price", async (request) => {
    const { id } = idParams.parse(request.params);
    const body = patchItemPriceBody.parse(request.body);
    const existing = await loadItem(request, id);
    if (existing.itemType === "SIZE_STYLE_MATRIX") {
      throw badRequest("This item is priced by size and style — use its price matrix");
    }

    const item = await prisma.menuItem.update({
      where: { id },
      data: { flatPrice: toMoney(body.flatPrice) },
      include: itemInclude
    });
    return { item: presentItem(item) };
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

  app.put("/menu/items/:id/price-matrix", async (request) => {
    const { id } = idParams.parse(request.params);
    const body = putPriceMatrixBody.parse(request.body);
    const item = await loadItem(request, id);
    if (item.itemType !== "SIZE_STYLE_MATRIX") {
      throw badRequest("Only a size × style item has a price matrix");
    }

    const [sizeOptions, styleOptions] = await Promise.all([
      prisma.menuCategorySizeOption.findMany({ where: { categoryId: item.categoryId } }),
      prisma.menuCategoryStyleOption.findMany({ where: { categoryId: item.categoryId } })
    ]);
    const sizeIds = new Set(sizeOptions.map((option) => option.id));
    const styleIds = new Set(styleOptions.map((option) => option.id));

    for (const cell of body.cells) {
      // Without this an operator could paste a cell from another category and
      // create a price that no size/style on this item can ever reach.
      if (!sizeIds.has(cell.sizeOptionId) || !styleIds.has(cell.styleOptionId)) {
        throw badRequest("A matrix cell references a size or style from another category");
      }
    }

    await prisma.$transaction([
      prisma.menuItemPriceCell.deleteMany({ where: { menuItemId: id } }),
      prisma.menuItemPriceCell.createMany({
        data: body.cells.map((cell) => ({
          menuItemId: id,
          sizeOptionId: cell.sizeOptionId,
          styleOptionId: cell.styleOptionId,
          price: toMoney(cell.price) ?? null
        }))
      })
    ]);

    const cells = await prisma.menuItemPriceCell.findMany({ where: { menuItemId: id } });
    return { priceCells: cells.map(presentPriceCell) };
  });

  app.get("/menu/items/:id/option-groups", async (request) => {
    const { id } = idParams.parse(request.params);
    await loadItem(request, id);
    const groups = await prisma.menuItemOptionGroup.findMany({
      where: { menuItemId: id },
      orderBy: { sortOrder: "asc" },
      include: { choices: { orderBy: { sortOrder: "asc" } } }
    });
    return { optionGroups: groups.map(presentOptionGroup) };
  });

  app.post("/menu/items/:id/option-groups", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const body = createOptionGroupBody.parse(request.body);
    await loadItem(request, id);
    const group = await prisma.menuItemOptionGroup.create({
      data: { ...body, menuItemId: id },
      include: { choices: true }
    });
    return reply.status(201).send({ optionGroup: presentOptionGroup(group) });
  });

  app.patch("/menu/option-groups/:id", async (request) => {
    const { id } = idParams.parse(request.params);
    const body = updateOptionGroupBody.parse(request.body);
    await loadOptionGroup(request, id);
    const group = await prisma.menuItemOptionGroup.update({
      where: { id },
      data: body,
      include: { choices: { orderBy: { sortOrder: "asc" } } }
    });
    return { optionGroup: presentOptionGroup(group) };
  });

  app.delete("/menu/option-groups/:id", async (request) => {
    const { id } = idParams.parse(request.params);
    await loadOptionGroup(request, id);
    await prisma.menuItemOptionGroup.delete({ where: { id } });
    return { ok: true };
  });

  app.get("/menu/option-groups/:id/choices", async (request) => {
    const { id } = idParams.parse(request.params);
    await loadOptionGroup(request, id);
    const choices = await prisma.menuItemOptionChoice.findMany({
      where: { optionGroupId: id },
      orderBy: { sortOrder: "asc" }
    });
    return { choices: choices.map(presentChoice) };
  });

  app.post("/menu/option-groups/:id/choices", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const body = createChoiceBody.parse(request.body);
    await loadOptionGroup(request, id);
    const choice = await prisma.menuItemOptionChoice.create({
      data: {
        optionGroupId: id,
        name: body.name,
        priceDelta: money(body.priceDelta),
        priceOverride: toMoney(body.priceOverride) ?? null,
        available: body.available,
        sortOrder: body.sortOrder
      }
    });
    return reply.status(201).send({ choice: presentChoice(choice) });
  });

  app.patch("/menu/choices/:id", async (request) => {
    const { id } = idParams.parse(request.params);
    const body = updateChoiceBody.parse(request.body);
    await loadChoice(request, id);
    const choice = await prisma.menuItemOptionChoice.update({
      where: { id },
      data: {
        name: body.name,
        priceDelta: body.priceDelta === undefined ? undefined : money(body.priceDelta),
        priceOverride: toMoney(body.priceOverride),
        available: body.available,
        sortOrder: body.sortOrder
      }
    });
    return { choice: presentChoice(choice) };
  });

  app.delete("/menu/choices/:id", async (request) => {
    const { id } = idParams.parse(request.params);
    await loadChoice(request, id);
    await prisma.menuItemOptionChoice.delete({ where: { id } });
    return { ok: true };
  });
}
