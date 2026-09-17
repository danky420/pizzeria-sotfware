import type { FastifyInstance } from "fastify";
import { hashPassword } from "../../src/auth/hash.js";
import { SESSION_COOKIE_NAME } from "../../src/auth/session.js";
import { prisma } from "../../src/db/prisma.js";

export const TEST_PASSWORD = "test-password-1234";

/**
 * The integration suites need a migrated Postgres. There is not always one (a
 * laptop without the container up, a CI job that only typechecks), so every suite
 * that needs rows is gated on this instead of failing with a connection error.
 */
async function probe(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1 FROM "Location" LIMIT 1`;
    return true;
  } catch {
    return false;
  }
}

export const databaseReady = await probe();

const TABLES = [
  "OrderItem",
  "Order",
  "Customer",
  "Promotion",
  "MenuItemOptionChoice",
  "MenuItemOptionGroup",
  "MenuItemPriceCell",
  "MenuItem",
  "MenuCategoryStyleOption",
  "MenuCategorySizeOption",
  "MenuCategory",
  "AdminSession",
  "AdminUser",
  "BusinessHours",
  "LocationAsset",
  "Location"
];

export async function resetDatabase(): Promise<void> {
  const list = TABLES.map((table) => `"${table}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

export interface Fixture {
  locationA: { id: string; slug: string };
  locationB: { id: string; slug: string };
  categoryId: string;
  sizeGrandeId: string;
  sizeChicaId: string;
  styleTradicionalId: string;
  styleRellenaId: string;
  pizzaId: string;
  refrescoId: string;
  aguaId: string;
  promotionId: string;
}

/**
 * Two locations so cross-tenant access has something to fail against, and a menu
 * that contains both shapes plus the two ways a price can be missing: a null
 * matrix cell and a null flat price.
 */
export async function seedFixture(): Promise<Fixture> {
  const passwordHash = await hashPassword(TEST_PASSWORD);

  const locationA = await prisma.location.create({
    data: { slug: "chesare-test", name: "Chesa're Test", waNumber: "522722603537" }
  });
  const locationB = await prisma.location.create({
    data: { slug: "otra-test", name: "Otra Sucursal", waNumber: "522722600000" }
  });

  await prisma.adminUser.createMany({
    data: [
      { locationId: locationA.id, email: "owner@a.test", name: "Owner A", role: "OWNER", passwordHash },
      { locationId: locationA.id, email: "staff@a.test", name: "Staff A", role: "STAFF", passwordHash },
      { locationId: locationB.id, email: "owner@b.test", name: "Owner B", role: "OWNER", passwordHash },
      { locationId: null, email: "super@test.test", name: "Super", role: "SUPER_ADMIN", passwordHash }
    ]
  });

  await prisma.businessHours.createMany({
    data: Array.from({ length: 7 }, (_unused, dayOfWeek) => ({
      locationId: locationA.id,
      dayOfWeek,
      opensAt: dayOfWeek === 1 ? null : 17 * 60,
      closesAt: dayOfWeek === 1 ? null : 23 * 60
    }))
  });

  const pizzas = await prisma.menuCategory.create({
    data: { locationId: locationA.id, slug: "pizzas", name: "Pizzas", sortOrder: 0 }
  });
  const bebidas = await prisma.menuCategory.create({
    data: { locationId: locationA.id, slug: "bebidas", name: "Bebidas", sortOrder: 1 }
  });

  const grande = await prisma.menuCategorySizeOption.create({
    data: { categoryId: pizzas.id, slug: "grande", name: "Grande", sortOrder: 0 }
  });
  const chica = await prisma.menuCategorySizeOption.create({
    data: { categoryId: pizzas.id, slug: "chica", name: "Chica", sortOrder: 1 }
  });
  const tradicional = await prisma.menuCategoryStyleOption.create({
    data: { categoryId: pizzas.id, slug: "tradicional", name: "Tradicional", sortOrder: 0 }
  });
  const rellena = await prisma.menuCategoryStyleOption.create({
    data: { categoryId: pizzas.id, slug: "rellena", name: "Orilla rellena", sortOrder: 1 }
  });

  const pizza = await prisma.menuItem.create({
    data: {
      categoryId: pizzas.id,
      slug: "pastor",
      name: "Al pastor",
      itemType: "SIZE_STYLE_MATRIX",
      sortOrder: 0,
      priceCells: {
        create: [
          { sizeOptionId: grande.id, styleOptionId: tradicional.id, price: "180.00" },
          { sizeOptionId: chica.id, styleOptionId: tradicional.id, price: "120.00" },
          // Deliberately unpriced: the "Pregunta el precio" case, which must be
          // rejected server-side and not silently treated as free.
          { sizeOptionId: grande.id, styleOptionId: rellena.id, price: null },
          { sizeOptionId: chica.id, styleOptionId: rellena.id, price: null }
        ]
      }
    }
  });

  const refresco = await prisma.menuItem.create({
    data: { categoryId: bebidas.id, slug: "refresco", name: "Refresco", flatPrice: "30.00", sortOrder: 0 }
  });
  const agua = await prisma.menuItem.create({
    data: { categoryId: bebidas.id, slug: "agua", name: "Agua", flatPrice: null, sortOrder: 1 }
  });

  const promotion = await prisma.promotion.create({
    data: {
      locationId: locationA.id,
      name: "Diez por ciento",
      code: "DIEZ",
      discountType: "PERCENT",
      discountValue: "10",
      scope: "ORDER",
      active: true
    }
  });

  return {
    locationA: { id: locationA.id, slug: locationA.slug },
    locationB: { id: locationB.id, slug: locationB.slug },
    categoryId: pizzas.id,
    sizeGrandeId: grande.id,
    sizeChicaId: chica.id,
    styleTradicionalId: tradicional.id,
    styleRellenaId: rellena.id,
    pizzaId: pizza.id,
    refrescoId: refresco.id,
    aguaId: agua.id,
    promotionId: promotion.id
  };
}

export async function login(
  app: FastifyInstance,
  email: string,
  password: string = TEST_PASSWORD
): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/admin/auth/login",
    payload: { email, password }
  });

  if (response.statusCode !== 200) {
    throw new Error(`login failed for ${email}: ${response.statusCode} ${response.body}`);
  }

  const cookie = response.cookies.find((candidate) => candidate.name === SESSION_COOKIE_NAME);
  if (!cookie) throw new Error(`login for ${email} returned no session cookie`);
  return `${cookie.name}=${cookie.value}`;
}
