import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type AdminRole, PrismaClient } from "@prisma/client";
import { config as loadDotenv } from "dotenv";
import { hashPassword } from "../src/auth/hash.js";

/**
 * Seeds the one real shop: Pizza's Chesa're in Maltrata, Veracruz.
 *
 * The menu below is a hand-translated copy of the arrays in src/archive/chesare-v2-vanilla-js.html
 * (TALLAS, ESTILOS, PIZZAS, ESPECIALES, BURGERS, ALITAS_65/80, PASTAS, POSTRES,
 * FRAPPES, CAFES, REFRESCOS, CERVEZAS, HORAS), which are themselves transcribed
 * from photographs of the shop's handwritten printed menu. Two rules carried over
 * verbatim and must stay that way:
 *
 *   - `p: null` means "Pregunta el precio" — listed but not orderable. It is
 *     seeded as a NULL price, never as a guess and never as zero.
 *   - beer is ageRestricted.
 *
 * Re-running is safe: every row is upserted on its natural key, price grids and
 * option groups are rebuilt, and existing admin accounts are left alone so a
 * re-seed never rotates a password somebody is already using.
 *
 * Run with:  npm run seed --workspace backend
 */

const here = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(here, "..");
loadDotenv({ path: resolve(backendRoot, ".env"), quiet: true });
loadDotenv({ path: resolve(backendRoot, "..", ".env"), quiet: true });

const prisma = new PrismaClient();

const LOCATION = {
  slug: "chesare-maltrata",
  name: "Pizza's Chesa're",
  waNumber: "522722603537",
  timezone: "America/Mexico_City",
  currency: "MXN"
};

/* ============ menu data, translated from src/archive/chesare-v2-vanilla-js.html ============ */

interface FlatSource {
  id: string;
  n: string;
  d?: string;
  p: number | null;
  top?: string[];
  fav?: boolean;
}

const TALLAS = [
  { id: "ind", n: "Individual", cm: "1 persona", p: [70, 80, 90] },
  { id: "med", n: "Mediana", cm: "2 personas", p: [135, 150, 160] },
  { id: "gra", n: "Grande", cm: "3 personas", p: [165, 190, 200] },
  { id: "fam", n: "Familiar", cm: "4–5 personas", p: [240, 280, 305] },
  { id: "jum", n: "Jumbo", cm: "6 personas", p: [280, 320, 335] },
  { id: "cha", n: "Charola", cm: "para fiesta", p: [490, 560, 590] }
];

// `i` is the index into each TALLAS.p triple — the column of the price grid.
const ESTILOS = [
  { id: "nor", n: "Normal", d: "Como siempre", i: 0 },
  { id: "exq", n: "Extra queso", d: "Doble mozzarella", i: 1 },
  { id: "ori", n: "Orilla rellena", d: "Orilla rellena de queso", i: 2 }
];

const PIZZAS = [
  { id: "pepperoni", n: "Pepperoni", d: "Pepperoni y mozzarella.", top: ["#C7342A"] },
  { id: "hawaiana", n: "Hawaiana", d: "Jamón y piña.", top: ["#F2C93B", "#EFA9A2"], fav: true },
  { id: "chorizo", n: "Chorizo", d: "Chorizo mexicano.", top: ["#9A3018"] },
  { id: "4est", n: "4 Estaciones", d: "Cuatro cuartos, cuatro sabores.", top: ["#C7342A", "#6E9B3C", "#9A7A4E", "#EFE0C4"] },
  { id: "atun", n: "Atún", d: "Atún y cebolla.", top: ["#D8C7A8", "#6E9B3C"] },
  { id: "champ", n: "Champiñón", d: "Champiñón salteado.", top: ["#9A7A4E", "#EFE0C4"] },
  { id: "capri", n: "Caprichosa", d: "La mezcla de la casa.", top: ["#C7342A", "#9A7A4E", "#6E9B3C"] }
] satisfies { id: string; n: string; d: string; top: string[]; fav?: boolean }[];

const ESPECIALES: FlatSource[] = [
  { id: "carnes", n: "Carnes frías", d: "Jamón, salchicha y chorizo.", p: 195, top: ["#EFA9A2", "#D98A6E", "#9A3018"] },
  { id: "bolo", n: "Boloñesa", d: "Carne molida.", p: 200, top: ["#8E4A22"] },
  { id: "suprema", n: "Suprema", d: "Pepperoni, champiñón, cebolla y pimientos.", p: 195, top: ["#C7342A", "#9A7A4E", "#EFE0C4", "#6E9B3C"], fav: true },
  { id: "vege", n: "Vegetariana", d: "Champiñón, elote, pimiento y aceitunas.", p: 195, top: ["#6E9B3C", "#F2C93B", "#2A1A12"] }
];

const BURGERS: FlatSource[] = [
  { id: "b-sen", n: "Sencilla", p: 70 },
  { id: "b-haw", n: "Hawaiana", p: 80 },
  { id: "b-esp", n: "Especial", p: 90 },
  { id: "b-toc", n: "Tocino", p: 85 },
  { id: "b-pol", n: "Pollo", p: 85 },
  { id: "b-sir", n: "Sirloin", p: 100 }
];

const ALITAS_65 = [
  "BBQ",
  "BBQ · Habanero",
  "Búfalo",
  "Búfalo · Habanero",
  "Tamarindo · Habanero",
  "Tamarindo · Chipotle",
  "Parmesano",
  "Fresa · Habanero"
];
const ALITAS_80 = [
  "Durazno · Habanero",
  "Habanero · Tropical",
  "Chipotle · Mango",
  "Chipotle · Limón",
  "Ranch · Habanero",
  "Ajo · Parmesano",
  "Cheddar · Habanero"
];

const PASTAS = ["Fettuccini Alfredo", "Fusilli boloñesa", "Linguini al aceite y ajo", "Penne a la vodka"];
const PASTA_PRICE = 170; // src/archive/chesare-v2-vanilla-js.html abrirLista("Pasta", ... , 170, ...)
const ALITAS_65_PRICE = 65;
const ALITAS_80_PRICE = 80;

const POSTRES: FlatSource[] = [
  { id: "waffles", n: "Waffles", p: 65 },
  { id: "banana", n: "Banana split", p: 60 },
  { id: "cr-fre", n: "Crepa de fresa", p: 70 },
  { id: "cr-nut", n: "Crepa de Nutella", p: 70 },
  { id: "cr-haw", n: "Crepa hawaiana", p: 80 },
  { id: "cr-zar", n: "Crepa de queso con zarzamora", p: 80 }
];

const FRAPPES: FlatSource[] = [
  { id: "f-ore", n: "Oreo", p: 60 },
  { id: "f-caj", n: "Cajeta", p: 60 },
  { id: "f-fre", n: "Fresa", p: 60 },
  { id: "f-nut", n: "Nutella", p: 60 },
  { id: "f-rom", n: "Rompope", p: 60 },
  { id: "f-vai", n: "Vainilla", p: 60 },
  { id: "f-moc", n: "Mocachino", p: 70 },
  { id: "f-maz", n: "Mazapán", p: 70 },
  { id: "f-gan", n: "Gansito", p: 70 }
];

const CAFES: FlatSource[] = [
  { id: "c-caf", n: "Café", p: 30 },
  { id: "c-cap", n: "Capuchino", p: 40 },
  { id: "c-mok", n: "Moka", p: 40 },
  { id: "c-exp", n: "Expreso", p: 30 },
  { id: "c-ari", n: "Arizona en lata", p: 35 },
  { id: "c-agu", n: "Botella de agua", p: null }
];

const REFRESCOS: FlatSource[] = [
  { id: "r-c2", n: "Coca-Cola 2 L", p: 50 },
  { id: "r-c6", n: "Coca-Cola 600 ml", p: 35 },
  { id: "r-c1", n: "Coca-Cola 1.25 L", p: 40 },
  { id: "r-p2", n: "Pepsi 2 L", p: 45 },
  { id: "r-m2", n: "Manzanita 2 L", p: 45 },
  { id: "r-mi", n: "Mirinda 2 L", p: 45 },
  { id: "r-40", n: "Refresco 400 ml", p: null }
];

const CERVEZAS: FlatSource[] = [
  { id: "ce-tec", n: "Tecate en lata", p: 40 },
  { id: "ce-lag", n: "Lager en lata", p: 40 },
  { id: "ce-cag", n: "Caguama", p: 90 },
  { id: "ce-azu", n: "Azulito", p: 30 },
  { id: "ce-mic", n: "Michelada", p: null }
];

// Index 0 is Sunday, matching both HORAS in src/archive/chesare-v2-vanilla-js.html and
// BusinessHours.dayOfWeek. Decimal hours; Thursday is closed.
const HORAS: { d: string; a: number | null; c: number | null }[] = [
  { d: "Domingo", a: 17.5, c: 24 },
  { d: "Lunes", a: 18, c: 24 },
  { d: "Martes", a: 18, c: 24 },
  { d: "Miércoles", a: 18, c: 24 },
  { d: "Jueves", a: null, c: null },
  { d: "Viernes", a: 18, c: 24 },
  { d: "Sábado", a: 17.5, c: 24 }
];

// Section list and slugs from SECS in src/archive/chesare-v2-vanilla-js.html.
const CATEGORIES = [
  { slug: "pizzas", name: "Pizzas", description: "Seis tamaños · orilla rellena o extra queso" },
  { slug: "hamburguesas", name: "Hamburguesas", description: null },
  { slug: "alitas", name: "Alitas y boneless", description: "15 salsas" },
  { slug: "pastas", name: "Pastas", description: "Incluye pan de ajo" },
  { slug: "postres", name: "Postres y crepas", description: null },
  { slug: "frappes", name: "Frappés y café", description: null },
  { slug: "bebidas", name: "Bebidas", description: null }
];

/* ============ helpers ============ */

function toMinutes(decimalHour: number | null): number | null {
  return decimalHour === null ? null : Math.round(decimalHour * 60);
}

function priceOf(value: number | null): string | null {
  return value === null ? null : value.toFixed(2);
}

/**
 * A temp password nobody chose and nobody can guess: 18 bytes of CSPRNG output,
 * base64url, printed once here and never written to source or to the database in
 * plaintext.
 */
function generatePassword(): string {
  return randomBytes(18).toString("base64url");
}

async function upsertFlatItem(
  categoryId: string,
  source: FlatSource,
  sortOrder: number,
  extra: { ageRestricted?: boolean; subgroupLabel?: string } = {}
): Promise<string> {
  const data = {
    name: source.n,
    description: source.d ?? null,
    itemType: "FLAT" as const,
    flatPrice: priceOf(source.p),
    toppingColors: source.top ?? undefined,
    isFeatured: source.fav === true,
    ageRestricted: extra.ageRestricted ?? false,
    subgroupLabel: extra.subgroupLabel ?? null,
    sortOrder
  };

  const item = await prisma.menuItem.upsert({
    where: { categoryId_slug: { categoryId, slug: source.id } },
    update: data,
    create: { categoryId, slug: source.id, ...data }
  });
  return item.id;
}

/**
 * Flavour-choice items (wing sauces, pastas): one FLAT price plus a required
 * single-select group. The group is rebuilt rather than merged so a sauce the
 * shop drops actually disappears on the next seed.
 */
async function upsertChoiceItem(
  categoryId: string,
  spec: {
    slug: string;
    name: string;
    description: string;
    price: number;
    groupName: string;
    choices: string[];
    sortOrder: number;
  }
): Promise<void> {
  const data = {
    name: spec.name,
    description: spec.description,
    itemType: "FLAT" as const,
    flatPrice: priceOf(spec.price),
    sortOrder: spec.sortOrder
  };

  const item = await prisma.menuItem.upsert({
    where: { categoryId_slug: { categoryId, slug: spec.slug } },
    update: data,
    create: { categoryId, slug: spec.slug, ...data }
  });

  await prisma.menuItemOptionGroup.deleteMany({ where: { menuItemId: item.id } });
  await prisma.menuItemOptionGroup.create({
    data: {
      menuItemId: item.id,
      name: spec.groupName,
      selectionType: "SINGLE",
      required: true,
      minSelections: 1,
      maxSelections: 1,
      sortOrder: 0,
      choices: {
        create: spec.choices.map((name, index) => ({ name, sortOrder: index }))
      }
    }
  });
}

async function upsertAdminUser(spec: {
  email: string;
  name: string;
  role: AdminRole;
  locationId: string | null;
}): Promise<{ email: string; role: AdminRole; password: string | null }> {
  const existing = await prisma.adminUser.findUnique({ where: { email: spec.email } });
  if (existing) {
    // Deliberately not re-hashing: a re-seed in dev must not lock out an account
    // whose password somebody already saved.
    return { email: spec.email, role: spec.role, password: null };
  }

  const password = generatePassword();
  await prisma.adminUser.create({
    data: {
      email: spec.email,
      name: spec.name,
      role: spec.role,
      locationId: spec.locationId,
      passwordHash: await hashPassword(password)
    }
  });
  return { email: spec.email, role: spec.role, password };
}

/* ============ seed ============ */

async function main(): Promise<void> {
  const location = await prisma.location.upsert({
    where: { slug: LOCATION.slug },
    update: { name: LOCATION.name, waNumber: LOCATION.waNumber, timezone: LOCATION.timezone, currency: LOCATION.currency },
    create: { ...LOCATION, active: true }
  });

  for (const [dayOfWeek, day] of HORAS.entries()) {
    const hours = { opensAt: toMinutes(day.a), closesAt: toMinutes(day.c) };
    await prisma.businessHours.upsert({
      where: { locationId_dayOfWeek: { locationId: location.id, dayOfWeek } },
      update: hours,
      create: { locationId: location.id, dayOfWeek, ...hours }
    });
  }

  const categoryIds = new Map<string, string>();
  for (const [sortOrder, category] of CATEGORIES.entries()) {
    const row = await prisma.menuCategory.upsert({
      where: { locationId_slug: { locationId: location.id, slug: category.slug } },
      update: { name: category.name, description: category.description, sortOrder },
      create: { locationId: location.id, slug: category.slug, name: category.name, description: category.description, sortOrder }
    });
    categoryIds.set(category.slug, row.id);
  }

  const pizzasId = categoryIds.get("pizzas") as string;

  // Sizes and styles hang off the pizzas category — they are the two axes of the
  // price grid and mean nothing anywhere else on the menu.
  const sizeIds = new Map<string, string>();
  for (const [sortOrder, talla] of TALLAS.entries()) {
    const row = await prisma.menuCategorySizeOption.upsert({
      where: { categoryId_slug: { categoryId: pizzasId, slug: talla.id } },
      update: { name: talla.n, comment: talla.cm, sortOrder },
      create: { categoryId: pizzasId, slug: talla.id, name: talla.n, comment: talla.cm, sortOrder }
    });
    sizeIds.set(talla.id, row.id);
  }

  const styleIds = new Map<string, string>();
  for (const [sortOrder, estilo] of ESTILOS.entries()) {
    const row = await prisma.menuCategoryStyleOption.upsert({
      where: { categoryId_slug: { categoryId: pizzasId, slug: estilo.id } },
      update: { name: estilo.n, description: estilo.d, sortOrder },
      create: { categoryId: pizzasId, slug: estilo.id, name: estilo.n, description: estilo.d, sortOrder }
    });
    styleIds.set(estilo.id, row.id);
  }

  // Every pizza shares one 6 × 3 grid: the price depends on size and style, not
  // on which pizza it is. Specialities (below) are the fixed-price exceptions.
  let pizzaCells = 0;
  for (const [sortOrder, pizza] of PIZZAS.entries()) {
    const item = await prisma.menuItem.upsert({
      where: { categoryId_slug: { categoryId: pizzasId, slug: pizza.id } },
      update: {
        name: pizza.n,
        description: pizza.d,
        itemType: "SIZE_STYLE_MATRIX",
        flatPrice: null,
        toppingColors: pizza.top,
        isFeatured: "fav" in pizza && pizza.fav === true,
        sortOrder
      },
      create: {
        categoryId: pizzasId,
        slug: pizza.id,
        name: pizza.n,
        description: pizza.d,
        itemType: "SIZE_STYLE_MATRIX",
        toppingColors: pizza.top,
        isFeatured: "fav" in pizza && pizza.fav === true,
        sortOrder
      }
    });

    await prisma.menuItemPriceCell.deleteMany({ where: { menuItemId: item.id } });
    const cells = TALLAS.flatMap((talla) =>
      ESTILOS.map((estilo) => ({
        menuItemId: item.id,
        sizeOptionId: sizeIds.get(talla.id) as string,
        styleOptionId: styleIds.get(estilo.id) as string,
        price: priceOf(talla.p[estilo.i])
      }))
    );
    await prisma.menuItemPriceCell.createMany({ data: cells });
    pizzaCells += cells.length;
  }

  for (const [index, special] of ESPECIALES.entries()) {
    await upsertFlatItem(pizzasId, special, PIZZAS.length + index);
  }

  for (const [index, burger] of BURGERS.entries()) {
    await upsertFlatItem(categoryIds.get("hamburguesas") as string, burger, index);
  }

  await upsertChoiceItem(categoryIds.get("alitas") as string, {
    slug: "alitas-65",
    name: "Alitas o boneless",
    description: "BBQ, búfalo, parmesano, tamarindo y más.",
    price: ALITAS_65_PRICE,
    groupName: "Salsa",
    choices: ALITAS_65,
    sortOrder: 0
  });
  await upsertChoiceItem(categoryIds.get("alitas") as string, {
    slug: "alitas-80",
    name: "Salsas especiales",
    description: "Chipotle-mango, cheddar-habanero, ajo-parmesano y más.",
    price: ALITAS_80_PRICE,
    groupName: "Salsa",
    choices: ALITAS_80,
    sortOrder: 1
  });

  await upsertChoiceItem(categoryIds.get("pastas") as string, {
    slug: "pasta",
    name: "Pasta a elegir",
    description: "Con pollo o camarones. Incluye pan de ajo.",
    price: PASTA_PRICE,
    groupName: "Pasta",
    choices: PASTAS,
    sortOrder: 0
  });

  for (const [index, postre] of POSTRES.entries()) {
    await upsertFlatItem(categoryIds.get("postres") as string, postre, index);
  }

  // Frappés and cafés share one section on the page and one category here;
  // subgroupLabel is what actually keeps them visually separate (sort order
  // alone only controls list position, not heading grouping).
  for (const [index, frappe] of FRAPPES.entries()) {
    await upsertFlatItem(categoryIds.get("frappes") as string, frappe, index, { subgroupLabel: "Frappés" });
  }
  for (const [index, cafe] of CAFES.entries()) {
    await upsertFlatItem(categoryIds.get("frappes") as string, cafe, FRAPPES.length + index, {
      subgroupLabel: "Cafés y tés"
    });
  }

  for (const [index, refresco] of REFRESCOS.entries()) {
    await upsertFlatItem(categoryIds.get("bebidas") as string, refresco, index);
  }
  for (const [index, cerveza] of CERVEZAS.entries()) {
    await upsertFlatItem(categoryIds.get("bebidas") as string, cerveza, REFRESCOS.length + index, {
      ageRestricted: true
    });
  }

  const accounts = [
    await upsertAdminUser({
      email: "kevinngiraldo@gmail.com",
      name: "Kevin Giraldo",
      role: "SUPER_ADMIN",
      locationId: null
    }),
    await upsertAdminUser({
      email: "owner@chesare.mx",
      name: "Dueño Chesa're",
      role: "OWNER",
      locationId: location.id
    }),
    await upsertAdminUser({
      email: "staff@chesare.mx",
      name: "Empleado Chesa're",
      role: "STAFF",
      locationId: location.id
    })
  ];

  const [itemCount, unpriced] = await Promise.all([
    prisma.menuItem.count({ where: { category: { locationId: location.id } } }),
    prisma.menuItem.count({ where: { category: { locationId: location.id }, flatPrice: null, itemType: "FLAT" } })
  ]);

  console.log(`\nSeeded ${LOCATION.name} (${LOCATION.slug})`);
  console.log(`  categories: ${CATEGORIES.length}`);
  console.log(`  menu items: ${itemCount} (${unpriced} flat items deliberately unpriced — "Pregunta el precio")`);
  console.log(`  pizza price cells: ${pizzaCells} (${TALLAS.length} sizes × ${ESTILOS.length} styles × ${PIZZAS.length} pizzas)`);
  console.log(`  business hours: 7 days (Thursday closed)`);

  console.log("\nAdmin accounts — copy these now, they are not stored anywhere and are not shown again:");
  for (const account of accounts) {
    if (account.password) {
      console.log(`  ${account.role.padEnd(11)} ${account.email.padEnd(26)} ${account.password}`);
    } else {
      console.log(`  ${account.role.padEnd(11)} ${account.email.padEnd(26)} (already existed — password unchanged)`);
    }
  }
  console.log("");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
