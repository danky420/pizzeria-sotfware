import type { JSX } from "react";
import type { MenuCategory, MenuItem } from "../api/types";
import { IcChevron } from "./icons";
import { mx } from "../lib/format";
import {
  type Block,
  type Section,
  cheapestCell,
  cheapestChoice,
  itemIcon,
  sectionIcon,
  singleChoiceGroup
} from "../lib/menu";

interface Props {
  sections: Section[];
  onOpen: (category: MenuCategory, item: MenuItem) => void;
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

/** The flagship treatment: image-forward, vertical, consistent height
 * regardless of description length. Pizzas only — everywhere else uses
 * `CardRow`, which reads better at the smaller, denser sizes those sections
 * actually need. */
function Card({
  category,
  item,
  onOpen
}: {
  category: MenuCategory;
  item: MenuItem;
  onOpen: () => void;
}): JSX.Element {
  const { price } = etiqueta(category, item);
  const desde = item.itemType === "SIZE_STYLE_MATRIX";
  return (
    <button className="card" type="button" disabled={price === null} onClick={onOpen}>
      <span className="media">
        <span className="ic">{itemIcon(category, item)}</span>
      </span>
      <span className="cuerpo">
        <span className="fila-tit">
          <b>
            {item.name}
            {item.isFeatured ? <span className="tag">Favorita</span> : null}
          </b>
          {price === null || desde ? null : <span className="precio">{mx(price)}</span>}
        </span>
        {item.description ? <small>{item.description}</small> : null}
        {price === null ? (
          <span className="pie">
            <span className="precio na">Pregunta el precio</span>
          </span>
        ) : desde ? (
          // The price only appears once you pick a size — showing "desde $70"
          // on every pizza made six very similar numbers the whole point of
          // the card, when the actual choice is size, not price.
          <span className="pie">
            <span className="ver">
              Ver tamaños <IcChevron size={13} />
            </span>
          </span>
        ) : null}
      </span>
    </button>
  );
}

/** Everything that isn't a pizza: a compact horizontal card, same silhouette
 * for a burger, a wing-sauce picker or a soft drink. */
function CardRow({
  category,
  item,
  onOpen
}: {
  category: MenuCategory;
  item: MenuItem;
  onOpen: () => void;
}): JSX.Element {
  const { price, nota } = etiqueta(category, item);
  const showNota = price !== null && (item.itemType === "SIZE_STYLE_MATRIX" || singleChoiceGroup(item));
  return (
    <button className="card-row" type="button" disabled={price === null} onClick={onOpen}>
      <span className="media">
        <span className="ic">{itemIcon(category, item)}</span>
      </span>
      <span className="cuerpo">
        <span className="fila-tit">
          <b>
            {item.name}
            {item.isFeatured ? <span className="tag">Favorita</span> : null}
          </b>
          <span className={price === null ? "precio na" : "precio"}>
            {price === null ? "Pregunta el precio" : mx(price)}
          </span>
        </span>
        {item.description ? <small>{item.description}</small> : showNota ? <small>{nota}</small> : null}
      </span>
      <span className="cheq" aria-hidden="true">
        <IcChevron size={18} />
      </span>
    </button>
  );
}

function BlockView({
  block,
  category,
  onOpen
}: {
  block: Block;
  category: MenuCategory;
  onOpen: (item: MenuItem) => void;
}): JSX.Element {
  // Category data, not a hardcoded slug: any category can opt into the big
  // image-forward card, not just "pizzas" (docs/multi-tenant-branding-plan.md).
  const galeria = category.displayStyle === "gallery";
  return (
    <>
      {block.title ? (
        <div className="enc sec" style={{ marginTop: 22 }}>
          <h2>{block.title}</h2>
          {block.note ? <p className="sub">{block.note}</p> : null}
        </div>
      ) : null}
      <div className="grid">
        {block.items.map((item) =>
          galeria ? (
            <Card key={item.id} category={category} item={item} onOpen={() => onOpen(item)} />
          ) : (
            <CardRow key={item.id} category={category} item={item} onOpen={() => onOpen(item)} />
          )
        )}
      </div>
    </>
  );
}

export function MenuSections({ sections, onOpen }: Props): JSX.Element {
  return (
    <>
      {sections.map((section) => (
        <section key={section.id} id={section.id}>
          <div className={section.category.displayStyle === "gallery" ? "enc anchor" : "enc"}>
            <div className="enc-fila">
              <span className="enc-ic" aria-hidden="true">
                {sectionIcon(section.category)}
              </span>
              <h2>{section.category.name}</h2>
              {section.category.description ? (
                <span className="etiqueta">{section.category.description}</span>
              ) : null}
            </div>
          </div>
          {section.intro ? <p className="sub">{section.intro}</p> : null}
          {section.blocks.map((block) => (
            <BlockView
              key={block.key}
              block={block}
              category={section.category}
              onOpen={(item) => onOpen(section.category, item)}
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
