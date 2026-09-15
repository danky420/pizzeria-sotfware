import { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import type { MenuTree } from "../lib/present.js";

export const menuTreeInclude = {
  sizeOptions: { orderBy: { sortOrder: "asc" } },
  styleOptions: { orderBy: { sortOrder: "asc" } },
  items: {
    orderBy: { sortOrder: "asc" },
    include: {
      priceCells: true,
      optionGroups: {
        orderBy: { sortOrder: "asc" },
        include: { choices: { orderBy: { sortOrder: "asc" } } }
      }
    }
  }
} satisfies Prisma.MenuCategoryInclude;

export function loadMenuTree(locationId: string): Promise<MenuTree[]> {
  return prisma.menuCategory.findMany({
    where: { locationId },
    orderBy: { sortOrder: "asc" },
    include: menuTreeInclude
  });
}
