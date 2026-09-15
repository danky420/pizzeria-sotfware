import type { JSX } from "react";
import type { MenuCategory, MenuItem } from "../api/types";
import { mx } from "../lib/format";
import {
  type Block,
  type Section,
  cheapestCell,
  cheapestChoice,
  itemIcon,
  singleChoiceGroup
} from "../lib/menu";

interface Props {
  sections: Section[];
  onOpen: (category: MenuCategory, item: MenuItem) => void;
  onQuickAdd: (category: MenuCategory, item: MenuItem) => void;
}

interface Etiqueta {
  price: number | null;
  nota: string;
}

function etiqueta(category: MenuCategory, item: MenuItem): Etiqueta {
  if (item.itemType === "SIZE_STYLE_MATRIX") {
    return { price: cheapestCell(item), nota: `${category.sizeOptions.length} tamaños` };
  }
  const group = singleChoiceGroup(item);
  if (group) {
    const nombre = group.name.toLowerCase();
    return {
      price: cheapestChoice(item),
      nota: `${group.choices.length} ${nombre}${nombre.endsWith("s") ? "" : "s"}`
    };
  }
  return { price: item.flatPrice, nota: "precio único" };
}

function Card({
  category,
  item,
  onOpen
}: {
  category: MenuCategory;
  item: MenuItem;
  onOpen: () => void;
}): JSX.Element {
  const { price, nota } = etiqueta(category, item);
  const desde = item.itemType === "SIZE_STYLE_MATRIX";
  return (
    <button className="card" type="button" disabled={price === null} onClick={onOpen}>
      <span className="ic">{itemIcon(category.slug, item)}</span>
      <span className="tx">
        <b>
          {item.name}
          {item.isFeatured ? <span className="tag">Favorita</span> : null}
        </b>
        {item.description ? <small>{item.description}</small> : null}
      </span>
      <span className="pr">
        <b className={price === null ? "na" : undefined}>
          {price === null ? "Pregunta el precio" : desde ? `desde ${mx(price)}` : mx(price)}
        </b>
        {price === null ? null : <small>{nota}</small>}
      </span>
    </button>
  );
}

function Row({
  category,
  item,
  onAdd
}: {
  category: MenuCategory;
  item: MenuItem;
  onAdd: () => void;
}): JSX.Element {
  const sin = item.flatPrice === null;
  return (
    <button className="li" type="button" disabled={sin} onClick={onAdd}>
      <span className="ic">{itemIcon(category.slug, item)}</span>
      <span className="n">
        {item.name}
        {item.description ? <small>{item.description}</small> : null}
      </span>
      <span className={sin ? "p na" : "p"}>
        {sin ? "Pregunta el precio" : mx(item.flatPrice ?? 0)}
      </span>
      <span className="mas" aria-hidden="true">
        +
      </span>
    </button>
  );
}

function BlockView({
  block,
  category,
  onOpen,
  onQuickAdd
}: {
  block: Block;
  category: MenuCategory;
  onOpen: (item: MenuItem) => void;
  onQuickAdd: (item: MenuItem) => void;
}): JSX.Element {
  return (
    <>
      {block.title ? (
        <div className="enc sec" style={{ marginTop: 22 }}>
          <h2>{block.title}</h2>
          {block.note ? <span>{block.note}</span> : null}
        </div>
      ) : null}
      {block.kind === "cards" ? (
        <div className="grid">
          {block.items.map((item) => (
            <Card key={item.id} category={category} item={item} onOpen={() => onOpen(item)} />
          ))}
        </div>
      ) : (
        <div className="lista">
          {block.items.map((item) => (
            <Row key={item.id} category={category} item={item} onAdd={() => onQuickAdd(item)} />
          ))}
        </div>
      )}
    </>
  );
}

export function MenuSections({ sections, onOpen, onQuickAdd }: Props): JSX.Element {
  return (
    <>
      {sections.map((section) => (
        <section key={section.id} id={section.id}>
          <div className="enc">
            <h2>{section.category.name}</h2>
            {section.category.description ? <span>{section.category.description}</span> : null}
          </div>
          {section.intro ? <p className="sub">{section.intro}</p> : null}
          {section.blocks.map((block) => (
            <BlockView
              key={block.key}
              block={block}
              category={section.category}
              onOpen={(item) => onOpen(section.category, item)}
              onQuickAdd={(item) => onQuickAdd(section.category, item)}
            />
          ))}
          {section.nota ? (
            <p className="sub" style={{ marginTop: 10 }}>
              {section.nota}
            </p>
          ) : null}
        </section>
      ))}
    </>
  );
}
