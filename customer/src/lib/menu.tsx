import type { JSX } from "react";
import type { MenuCategory, MenuItem, OptionChoice, OptionGroup, SizeOption, StyleOption } from "../api/types";
import {
  IcBotella,
  IcBurger,
  IcCafe,
  IcDulce,
  IcFrappe,
  IcGenerico,
  IcLata,
  IcPasta,
  IcPizza,
  IcWing
} from "../components/icons";

/**
 * Copy the API does not carry: the lead-in paragraphs the printed menu page had.
 * Keyed by category slug, all optional — a category the shop adds later simply
 * renders without them.
 */
const SECTION_COPY: Record<string, { intro?: string; nota?: string }> = {
  pastas: { nota: "Lasaña por pedido especial. Pregunta al ordenar." }
};

/**
 * The built-in, cuisine-agnostic icons a category can pick without uploading
 * its own image (CATEGORY_ICON_KEYS in backend/src/schemas/menu.ts). Icon
 * choice is data (`category.iconKey`/`iconUrl`), not code keyed by *this*
 * pizzeria's category slugs -- see docs/multi-tenant-branding-plan.md. A key
 * this map doesn't recognise (unset, or one the API added later) falls back
 * to IcGenerico, never to IcPizza: a future non-pizzeria tenant's own
 * categories must never render as a pizza by accident.
 */
const ICON_BY_KEY: Record<string, (item?: MenuItem) => JSX.Element> = {
  pizza: (item) => <IcPizza tops={item?.toppingColors} />,
  burger: () => <IcBurger />,
  wings: () => <IcWing />,
  pasta: () => <IcPasta />,
  dessert: () => <IcDulce />,
  frappe: () => <IcFrappe />,
  coffee: () => <IcCafe />,
  bottle: () => <IcBotella />,
  can: () => <IcLata />,
  generic: () => <IcGenerico />
};

function builtinIcon(iconKey: string | null, item?: MenuItem): JSX.Element {
  const render = ICON_BY_KEY[iconKey ?? "generic"];
  return render ? render(item) : <IcGenerico />;
}

const NAV_LABEL: Record<string, string> = {
  hamburguesas: "Burgers",
  alitas: "Alitas",
  postres: "Postres",
  frappes: "Frappés"
};

/** Line names in the cart read like the counter says them, not like the menu row. */
const CART_PREFIX: Record<string, string> = {
  pizzas: "Pizza ",
  hamburguesas: "Hamburguesa "
};

/** A subgroup can carry its own prefix even when its category doesn't (frappés vs. cafés share one category). */
const SUBGROUP_PREFIX: Record<string, string> = {
  Frappés: "Frappé de "
};

export function cartName(categorySlug: string, item: MenuItem, size?: SizeOption): string {
  const prefix = (item.subgroupLabel && SUBGROUP_PREFIX[item.subgroupLabel]) ?? CART_PREFIX[categorySlug] ?? "";
  const tail = size ? ` ${size.name.toLowerCase()}` : "";
  return `${prefix}${item.name}${tail}`;
}

/** A tenant's own uploaded image always wins over the built-in icon set --
 *  see docs/multi-tenant-branding-plan.md. Decorative: the item/category name
 *  is shown as text right next to it, so alt is empty rather than repeating it. */
function uploadedIcon(iconUrl: string): JSX.Element {
  return <img src={iconUrl} alt="" style={{ objectFit: "contain" }} />;
}

export function itemIcon(category: MenuCategory, item: MenuItem): JSX.Element {
  // A real photo of this specific dish beats a category-wide uploaded image,
  // which beats every symbolic icon below -- most specific real thing wins.
  if (item.imageUrl) return uploadedIcon(item.imageUrl);
  if (category.iconUrl) return uploadedIcon(category.iconUrl);
  // Generalizes regardless of category: an age-restricted item (beer alongside
  // soft drinks in one "bebidas" category, here, but the rule isn't specific
  // to that category) always gets the "can" icon over the category's own
  // default, same visual cue any tenant marking items 18+ would want.
  if (item.ageRestricted) return builtinIcon("can");
  // The item's own iconKey overrides the category default when set -- e.g. a
  // coffee item inside an otherwise frappé-iconed category.
  return builtinIcon(item.iconKey ?? category.iconKey, item);
}

/** One representative icon per top-level category, for the section heading —
 * distinct from `itemIcon`, which varies per row/card within a section. */
export function sectionIcon(category: MenuCategory): JSX.Element {
  if (category.iconUrl) return uploadedIcon(category.iconUrl);
  return builtinIcon(category.iconKey);
}

export function isMatrixCategory(category: MenuCategory): boolean {
  return category.sizeOptions.length > 0 && category.styleOptions.length > 0;
}

export function priceCell(item: MenuItem, size: SizeOption, style: StyleOption): number | null {
  const cell = item.priceCells.find(
    (candidate) => candidate.sizeOptionId === size.id && candidate.styleOptionId === style.id
  );
  return cell ? cell.price : null;
}

export function cheapestCell(item: MenuItem): number | null {
  const prices = item.priceCells
    .map((cell) => cell.price)
    .filter((price): price is number => price !== null);
  return prices.length > 0 ? Math.min(...prices) : null;
}

/** Mirrors the server's rule: an override wins outright, otherwise base + delta. */
export function choicePrice(item: MenuItem, choice: OptionChoice): number | null {
  if (choice.priceOverride !== null) return choice.priceOverride;
  if (item.flatPrice === null) return null;
  return item.flatPrice + (choice.priceDelta ?? 0);
}

export function singleChoiceGroup(item: MenuItem): OptionGroup | undefined {
  return item.optionGroups.find(
    (group) => group.selectionType === "SINGLE" && group.choices.length > 0
  );
}

/** The lowest price any choice can produce — what the card advertises. */
export function cheapestChoice(item: MenuItem): number | null {
  const group = singleChoiceGroup(item);
  if (!group) return item.flatPrice;
  const prices = group.choices
    .map((choice) => choicePrice(item, choice))
    .filter((price): price is number => price !== null);
  return prices.length > 0 ? Math.min(...prices) : null;
}

export interface CardsBlock {
  kind: "cards";
  key: string;
  title?: string;
  note?: string;
  items: MenuItem[];
}

export interface ListBlock {
  kind: "list";
  key: string;
  title?: string;
  note?: string;
  items: MenuItem[];
}

export type Block = CardsBlock | ListBlock;

export interface Section {
  id: string;
  category: MenuCategory;
  navLabel: string;
  intro?: string;
  nota?: string;
  blocks: Block[];
}

export function buildSections(categories: MenuCategory[]): Section[] {
  return categories
    .map((category) => {
      const copy = SECTION_COPY[category.slug] ?? {};
      const section: Section = {
        id: category.slug,
        category,
        navLabel: NAV_LABEL[category.slug] ?? category.name,
        blocks: []
      };
      if (copy.intro) section.intro = copy.intro;
      if (copy.nota) section.nota = copy.nota;

      if (isMatrixCategory(category)) {
        const matrix = category.items.filter((item) => item.itemType === "SIZE_STYLE_MATRIX");
        const flat = category.items.filter((item) => item.itemType !== "SIZE_STYLE_MATRIX");
        if (matrix.length > 0) {
          section.blocks.push({ kind: "cards", key: "matriz", items: matrix });
        }
        if (flat.length > 0) {
          section.blocks.push({
            kind: "cards",
            key: "especialidades",
            title: "Especialidades",
            note: "precio único",
            items: flat
          });
        }
        return section;
      }

      const configurable = category.items.filter((item) => item.optionGroups.length > 0);
      const plain = category.items.filter((item) => item.optionGroups.length === 0);

      if (configurable.length > 0) {
        section.blocks.push({ kind: "cards", key: "elegir", items: configurable });
      }

      // The shop keeps beer in the same category as soft drinks; the 18+ notice
      // has to stand on its own, so age-restricted rows get their own list.
      const abiertos = plain.filter((item) => !item.ageRestricted);
      const restringidos = plain.filter((item) => item.ageRestricted);

      // A category can bundle more than one printed-menu section (frappés and
      // cafés share one page section); subgroupLabel is what keeps their
      // headings apart. Items with no label share one untitled block, in
      // first-seen order alongside the labelled ones.
      const subgroups: { label: string | null; items: MenuItem[] }[] = [];
      for (const item of abiertos) {
        const bucket = subgroups.find((entry) => entry.label === item.subgroupLabel);
        if (bucket) bucket.items.push(item);
        else subgroups.push({ label: item.subgroupLabel, items: [item] });
      }
      subgroups.forEach((group, index) => {
        section.blocks.push({
          kind: "list",
          key: `abiertos-${index}`,
          title: group.label ?? undefined,
          items: group.items
        });
      });
      if (restringidos.length > 0) {
        section.blocks.push({
          kind: "list",
          key: "restringidos",
          title: "Cerveza",
          note: "solo mayores de 18",
          items: restringidos
        });
      }

      return section;
    })
    .filter((section) => section.blocks.length > 0);
}
