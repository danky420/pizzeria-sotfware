import { type JSX, useState } from "react";
import type { MenuCategory, MenuItem } from "../api/types";
import type { CartRef } from "../lib/cart";
import { mx } from "../lib/format";
import {
  cartName,
  choicePrice,
  isMatrixCategory,
  itemIcon,
  priceCell,
  singleChoiceGroup
} from "../lib/menu";

export interface ProductSelection {
  category: MenuCategory;
  item: MenuItem;
}

interface Props {
  selection: ProductSelection;
  onClose: () => void;
  onAdd: (nom: string, price: number, qty: number, det: string, ref: CartRef) => void;
}

interface Resolved {
  price: number | null;
  nom: string;
  det: string;
  ref: CartRef;
}

export function ProductSheet({ selection, onClose, onAdd }: Props): JSX.Element {
  const { category, item } = selection;
  const sizes = category.sizeOptions;
  const styles = category.styleOptions;
  const matrix = isMatrixCategory(category) && item.itemType === "SIZE_STYLE_MATRIX";
  const group = singleChoiceGroup(item);

  const [qty, setQty] = useState(1);
  const [sizeIndex, setSizeIndex] = useState(() => Math.min(2, Math.max(0, sizes.length - 1)));
  const [styleIndex, setStyleIndex] = useState(0);
  const [choiceIndex, setChoiceIndex] = useState(0);

  const size = sizes[sizeIndex];
  const style = styles[styleIndex];
  const choice = group?.choices[choiceIndex];

  let resolved: Resolved;
  if (matrix && size && style) {
    resolved = {
      price: priceCell(item, size, style),
      nom: cartName(category.slug, item, size),
      det: styleIndex === 0 ? "" : style.name,
      ref: {
        itemSlug: item.slug,
        categorySlug: category.slug,
        sizeSlug: size.slug,
        styleSlug: style.slug
      }
    };
  } else if (group && choice) {
    resolved = {
      price: choicePrice(item, choice),
      nom: cartName(category.slug, item),
      det: choice.name,
      ref: { itemSlug: item.slug, categorySlug: category.slug, optionChoiceName: choice.name }
    };
  } else {
    resolved = {
      price: item.flatPrice,
      nom: cartName(category.slug, item),
      det: "",
      ref: { itemSlug: item.slug, categorySlug: category.slug }
    };
  }

  const orderable = resolved.price !== null;

  return (
    <>
      <div className="hoja-top">
        <div className="ic">{itemIcon(category.slug, item)}</div>
        <div>
          <h3 id="h-nom">{item.name}</h3>
          <p>{item.description ?? ""}</p>
        </div>
        <button className="cerrar" type="button" aria-label="Cerrar" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="hoja-cuerpo">
        {matrix && size ? (
          <>
            <div className="grupo">
              <h4>Tamaño</h4>
              <div className="tallas">
                {sizes.map((option, index) => (
                  <button
                    key={option.id}
                    className="talla"
                    type="button"
                    aria-pressed={index === sizeIndex}
                    onClick={() => setSizeIndex(index)}
                  >
                    {option.name}
                    <small>{option.comment ?? ""}</small>
                  </button>
                ))}
              </div>
            </div>
            <div className="grupo">
              <h4>¿Cómo la quieres?</h4>
              {styles.map((option, index) => {
                const cell = priceCell(item, size, option);
                return (
                  <button
                    key={option.id}
                    className="opc"
                    type="button"
                    aria-pressed={index === styleIndex}
                    onClick={() => setStyleIndex(index)}
                  >
                    <span className="r" />
                    <span className="t">
                      {option.name}
                      <small>{option.description ?? ""}</small>
                    </span>
                    <span className={cell === null ? "v na" : "v"}>
                      {cell === null ? "Pregunta el precio" : mx(cell)}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        ) : null}

        {!matrix && group ? (
          <div className="grupo">
            <h4>{group.name}</h4>
            {group.choices.map((option, index) => {
              const price = choicePrice(item, option);
              return (
                <button
                  key={option.id}
                  className="opc"
                  type="button"
                  aria-pressed={index === choiceIndex}
                  onClick={() => setChoiceIndex(index)}
                >
                  <span className="r" />
                  <span className="t">{option.name}</span>
                  {price !== null && price !== item.flatPrice ? (
                    <span className="v">{mx(price)}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}

        {!matrix && !group ? (
          <p style={{ color: "var(--tinta2)", fontSize: ".9rem", margin: "2px 0 10px" }}>
            {item.description ??
              (item.flatPrice === null
                ? "Pregunta el precio en el local."
                : `Precio único: ${mx(item.flatPrice)}`)}
          </p>
        ) : null}
      </div>

      <div className="hoja-pie">
        <div className="pie-fila">
          <div className="cant">
            <button type="button" aria-label="Quitar uno" onClick={() => setQty((n) => Math.max(1, n - 1))}>
              −
            </button>
            <span>{qty}</span>
            <button type="button" aria-label="Agregar uno" onClick={() => setQty((n) => n + 1)}>
              +
            </button>
          </div>
          <button
            className="btn btn-add"
            type="button"
            disabled={!orderable}
            onClick={() => {
              if (resolved.price === null) return;
              onAdd(resolved.nom, resolved.price, qty, resolved.det, resolved.ref);
            }}
          >
            {orderable ? `Agregar · ${mx((resolved.price ?? 0) * qty)}` : "Pregunta el precio"}
          </button>
        </div>
      </div>
    </>
  );
}
