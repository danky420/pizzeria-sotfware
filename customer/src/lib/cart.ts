import { useCallback, useState } from "react";
import { MAX_LINE_QUANTITY, type OrderLinePayload } from "../api/types";

export interface CartRef {
  itemSlug: string;
  categorySlug: string;
  sizeSlug?: string;
  styleSlug?: string;
  optionChoiceName?: string;
}

export interface CartLine {
  key: string;
  nom: string;
  det: string;
  /** Display only — the server recomputes every price when the order is placed. */
  price: number;
  qty: number;
  ref: CartRef;
}

function lineKey(nom: string, price: number, det: string): string {
  return `${nom}|${price}|${det}`;
}

/**
 * The server rejects a line over MAX_LINE_QUANTITY with a VALIDATION_ERROR naming
 * `items.N.quantity` — a field the customer never typed into. Clamping here keeps
 * that error off the order path instead of translating it after the fact.
 */
function clampQty(quantity: number): number {
  return Math.min(MAX_LINE_QUANTITY, Math.max(1, quantity));
}

export function toOrderLine(line: CartLine): OrderLinePayload {
  const payload: OrderLinePayload = {
    itemSlug: line.ref.itemSlug,
    categorySlug: line.ref.categorySlug,
    quantity: line.qty
  };
  if (line.ref.sizeSlug) payload.sizeSlug = line.ref.sizeSlug;
  if (line.ref.styleSlug) payload.styleSlug = line.ref.styleSlug;
  if (line.ref.optionChoiceName) payload.optionChoiceName = line.ref.optionChoiceName;
  return payload;
}

export interface Cart {
  lines: CartLine[];
  total: number;
  pieces: number;
  add: (nom: string, price: number, qty: number, det: string, ref: CartRef) => void;
  increment: (key: string) => void;
  decrement: (key: string) => void;
  clear: () => void;
}

export function useCart(): Cart {
  const [lines, setLines] = useState<CartLine[]>([]);

  const add = useCallback(
    (nom: string, price: number, qty: number, det: string, ref: CartRef) => {
      const key = lineKey(nom, price, det);
      setLines((current) => {
        const existing = current.find((line) => line.key === key);
        if (existing) {
          return current.map((line) =>
            line.key === key ? { ...line, qty: clampQty(line.qty + qty) } : line
          );
        }
        return [...current, { key, nom, det, price, qty: clampQty(qty), ref }];
      });
    },
    []
  );

  const increment = useCallback((key: string) => {
    setLines((current) =>
      current.map((line) => (line.key === key ? { ...line, qty: clampQty(line.qty + 1) } : line))
    );
  }, []);

  const decrement = useCallback((key: string) => {
    setLines((current) =>
      current.flatMap((line) => {
        if (line.key !== key) return [line];
        return line.qty > 1 ? [{ ...line, qty: line.qty - 1 }] : [];
      })
    );
  }, []);

  const clear = useCallback(() => setLines([]), []);

  return {
    lines,
    total: lines.reduce((acc, line) => acc + line.price * line.qty, 0),
    pieces: lines.reduce((acc, line) => acc + line.qty, 0),
    add,
    increment,
    decrement,
    clear
  };
}
