import type { JSX } from "react";
import type { MenuCategory, MenuItem, OptionChoice, OptionGroup, SizeOption, StyleOption } from "../api/types";
import {
  IcBotella,
  IcBurger,
  IcCafe,
  IcDulce,
  IcFrappe,
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

export function itemIcon(categorySlug: string, item: MenuItem): JSX.Element {
  switch (categorySlug) {
    case "hamburguesas":
      return <IcBurger />;
    case "alitas":
      return <IcWing />;
    case "pastas":
      return <IcPasta />;
    case "postres":
      return <IcDulce />;
    case "frappes":
      return item.subgroupLabel === "Cafés y tés" ? <IcCafe /> : <IcFrappe />;
    case "bebidas":
      return item.ageRestricted ? <IcLata /> : <IcBotella />;
    default:
      return <IcPizza tops={item.toppingColors} />;
  }
}

/** One representative icon per top-level category, for the section heading —
 * distinct from `itemIcon`, which varies per row/card within a section. */
export function sectionIcon(categorySlug: string): JSX.Element {
  switch (categorySlug) {
    case "hamburguesas":
      return <IcBurger />;
    case "alitas":
      return <IcWing />;
    case "pastas":
      return <IcPasta />;
    case "postres":
      return <IcDulce />;
    case "frappes":
      return <IcFrappe />;
    case "bebidas":
      return <IcBotella />;
    default:
      return <IcPizza tops={["#C7342A", "#F2C93B", "#6E9B3C"]} />;
  }
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
