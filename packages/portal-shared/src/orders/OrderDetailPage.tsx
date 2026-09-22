import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Badge, EmptyState, ErrorNotice, Field, Loading, PageHeader, Panel } from "../ui/index";
import { formatDateTime, formatMoney } from "../format";
import { type EditOrderChangeInput, ordersApi } from "../api/orders";
import { FULFILLMENT_LABELS, ORDER_STATUS_FLOW, ORDER_STATUS_LABELS, orderStatusTone } from "./status";
import type { Location, MenuCategoryTree, MenuItem, Order, OrderEditChange, OrderStatus } from "../types";

/**
 * Same detail screen in both apps. The one real difference between them —
 * `admin/` can link into a customer's order history, `employee/` has no such
 * page and the API would 403 a STAFF session on it anyway — is the one prop
 * here, not a fork of the component.
 */
export function OrderDetailPage({
  location,
  customerLinkTo
}: {
  location: Location;
  customerLinkTo?: (customerId: string) => string;
}) {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);

  const order = useQuery({
    queryKey: ["order", id],
    queryFn: () => ordersApi.get(id).then((response) => response.order),
    enabled: id !== ""
  });

  const setStatus = useMutation({
    mutationFn: (status: OrderStatus) => ordersApi.setStatus(id, status),
    onSuccess: (result) => {
      queryClient.setQueryData(["order", id], result.order);
      // The queue is a separate query and is what everyone looks at next, so
      // it must not show the old status for up to 10 seconds after the change.
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
    }
  });

  if (order.isPending) return <Loading label="Cargando pedido…" />;

  if (order.error) {
    return (
      <>
        <PageHeader title="Pedido" />
        <Panel>
          <ErrorNotice error={order.error} title="No se pudo cargar el pedido" />
          <div>
            <button type="button" className="btn" onClick={() => navigate("/orders")}>
              Volver a pedidos
            </button>
          </div>
        </Panel>
      </>
    );
  }

  const data = order.data;
  if (!data) return <EmptyState title="Pedido no encontrado" />;

  const { currency, timezone } = location;
  const nextStatuses = ORDER_STATUS_FLOW[data.status];
  const isClosed = nextStatuses.length === 0;

  return (
    <>
      <PageHeader
        title={`Pedido #${data.orderNumber}`}
        description={formatDateTime(data.createdAt, timezone)}
        actions={
          <div className="row">
            {!isClosed ? (
              <button type="button" className="btn" onClick={() => setEditing((open) => !open)}>
                {editing ? "Cancelar edición" : "Editar pedido"}
              </button>
            ) : null}
            <button type="button" className="btn" onClick={() => navigate("/orders")}>
              Volver
            </button>
          </div>
        }
      />

      <Panel
        title="Estado"
        actions={<Badge tone={orderStatusTone(data.status)}>{ORDER_STATUS_LABELS[data.status]}</Badge>}
      >
        <ErrorNotice error={setStatus.error} title="No se pudo cambiar el estado" />
        {isClosed ? (
          <p className="muted">Este pedido ya está cerrado; su estado no puede cambiar.</p>
        ) : (
          <div className="row">
            {nextStatuses.map((status) => (
              <button
                key={status}
                type="button"
                className={status === "CANCELLED" ? "btn btn-danger" : "btn btn-primary"}
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate(status)}
              >
                {ORDER_STATUS_LABELS[status]}
              </button>
            ))}
          </div>
        )}
      </Panel>

      <div className="grid-2">
        <Panel title="Cliente">
          <dl className="stack">
            <div>
              <span className="field-label">Nombre</span>
              <div>{data.customerName ?? "—"}</div>
            </div>
            <div>
              <span className="field-label">Teléfono</span>
              <div className="mono">
                <a href={`tel:${data.customerPhone}`}>{data.customerPhone}</a>
              </div>
            </div>
            <div>
              <span className="field-label">Entrega</span>
              <div>{FULFILLMENT_LABELS[data.fulfillmentType]}</div>
            </div>
            {data.customerAddress ? (
              <div>
                <span className="field-label">Dirección</span>
                <div>{data.customerAddress}</div>
              </div>
            ) : null}
            {data.customerNote ? (
              <div>
                <span className="field-label">Nota</span>
                <div>{data.customerNote}</div>
              </div>
            ) : null}
            {data.customerId && customerLinkTo ? (
              <div>
                <Link to={customerLinkTo(data.customerId)}>Ver historial del cliente</Link>
              </div>
            ) : null}
          </dl>
        </Panel>

        <Panel title="Totales">
          <table>
            <tbody>
              <tr>
                <td>Subtotal</td>
                <td className="right">{formatMoney(data.subtotal, currency)}</td>
              </tr>
              <tr>
                <td>Descuento</td>
                <td className="right">{formatMoney(data.discountTotal, currency)}</td>
              </tr>
              <tr>
                <td>
                  <strong>Total</strong>
                </td>
                <td className="right">
                  <strong>{formatMoney(data.total, currency)}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </Panel>
      </div>

      <Panel title="Artículos">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Detalle</th>
                <th className="right">Cant.</th>
                <th className="right">Precio</th>
                <th className="right">Importe</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td className="muted">
                    {[item.size, item.style, item.option, item.notes].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="right">{item.quantity}</td>
                  <td className="right nowrap">{formatMoney(item.unitPrice, currency)}</td>
                  <td className="right nowrap">{formatMoney(item.lineTotal, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {editing ? (
        <EditOrderPanel
          order={data}
          location={location}
          onDone={() => setEditing(false)}
        />
      ) : null}

      {data.edits.length > 0 ? (
        <Panel title="Historial de cambios">
          <div className="stack">
            {data.edits.map((edit, index) => (
              <div
                key={edit.id}
                style={index < data.edits.length - 1 ? { borderBottom: "1px solid var(--border)", paddingBottom: 12 } : undefined}
              >
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>{edit.editedBy?.name ?? "Cuenta eliminada"}</strong>
                  <span className="muted">{formatDateTime(edit.createdAt, timezone)}</span>
                </div>
                <p className="muted">{edit.reason}</p>
                <ul>
                  {edit.changes.map((change, changeIndex) => (
                    <li key={changeIndex}>{formatChangeLine(change, currency)}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}
    </>
  );
}

function formatChangeLine(change: OrderEditChange, currency: string): string {
  const detail = change.detail ? ` (${change.detail})` : "";
  switch (change.type) {
    case "quantity_changed":
      return `Cantidad cambiada: ${change.name}${detail} — ${change.from} → ${change.to}`;
    case "item_removed":
      return `Quitado: ${change.quantity}× ${change.name}${detail}`;
    case "item_added":
      return `Agregado: ${change.quantity}× ${change.name}${detail} — ${formatMoney(change.unitPrice, currency)} c/u`;
  }
}

interface AdditionDraft {
  key: string;
  menuItemId: string;
  name: string;
  detail: string | null;
  unitPrice: number;
  quantity: number;
  sizeOptionId?: string;
  styleOptionId?: string;
  optionChoiceId?: string;
}

function validCells(item: MenuItem, category: MenuCategoryTree) {
  const sizeById = new Map(category.sizeOptions.map((size) => [size.id, size]));
  const styleById = new Map(category.styleOptions.map((style) => [style.id, style]));
  return item.priceCells
    .filter((cell) => cell.price !== null)
    .map((cell) => ({ cell, size: sizeById.get(cell.sizeOptionId), style: styleById.get(cell.styleOptionId) }))
    .filter((row) => row.size?.active && row.style?.active) as {
    cell: { sizeOptionId: string; styleOptionId: string; price: number };
    size: { id: string; name: string };
    style: { id: string; name: string };
  }[];
}

/**
 * The item picker only offers menuItemId (never itemSlug) -- this is built
 * from the same menu data the picker just fetched, not a public API surface
 * that needs a slug fallback for an arbitrary caller.
 */
function ItemPicker({
  categories,
  onAdd
}: {
  categories: MenuCategoryTree[];
  onAdd: (draft: Omit<AdditionDraft, "key">) => void;
}) {
  const orderable = useMemo(
    () =>
      categories
        .map((category) => ({
          ...category,
          items: category.items.filter((item) => {
            if (!item.available) return false;
            return item.itemType === "FLAT" ? item.flatPrice !== null : validCells(item, category).length > 0;
          })
        }))
        .filter((category) => category.items.length > 0),
    [categories]
  );

  const [categoryId, setCategoryId] = useState(orderable[0]?.id ?? "");
  const category = orderable.find((candidate) => candidate.id === categoryId);
  const [itemId, setItemId] = useState(category?.items[0]?.id ?? "");
  const item = category?.items.find((candidate) => candidate.id === itemId);
  const [sizeOptionId, setSizeOptionId] = useState("");
  const [styleOptionId, setStyleOptionId] = useState("");
  const [optionChoiceId, setOptionChoiceId] = useState("");
  const [quantity, setQuantity] = useState(1);

  const cells = item && category ? validCells(item, category) : [];
  const sizes = [...new Map(cells.map((row) => [row.size.id, row.size])).values()];
  const stylesForSize = cells.filter((row) => row.size.id === sizeOptionId);
  const matchedCell = cells.find((row) => row.size.id === sizeOptionId && row.style.id === styleOptionId);
  const group = item?.optionGroups[0];
  const choice = group?.choices.find((candidate) => candidate.id === optionChoiceId);

  const base = item ? (item.itemType === "SIZE_STYLE_MATRIX" ? matchedCell?.cell.price ?? null : item.flatPrice) : null;
  const unitPrice = base === null || base === undefined ? null : choice ? (choice.priceOverride ?? base + choice.priceDelta) : base;

  const needsSizeStyle = item?.itemType === "SIZE_STYLE_MATRIX";
  const needsChoice = Boolean(group?.required);
  const canAdd =
    item !== undefined &&
    unitPrice !== null &&
    (!needsSizeStyle || matchedCell !== undefined) &&
    (!needsChoice || optionChoiceId !== "") &&
    quantity > 0;

  function selectCategory(nextId: string) {
    setCategoryId(nextId);
    const next = orderable.find((candidate) => candidate.id === nextId);
    setItemId(next?.items[0]?.id ?? "");
    setSizeOptionId("");
    setStyleOptionId("");
    setOptionChoiceId("");
  }

  function selectItem(nextId: string) {
    setItemId(nextId);
    setSizeOptionId("");
    setStyleOptionId("");
    setOptionChoiceId("");
  }

  function add() {
    if (!item || unitPrice === null) return;
    const detail = [
      needsSizeStyle ? matchedCell?.size.name : null,
      needsSizeStyle ? matchedCell?.style.name : null,
      choice?.name ?? null
    ]
      .filter(Boolean)
      .join(" · ");
    onAdd({
      menuItemId: item.id,
      name: item.name,
      detail: detail || null,
      unitPrice,
      quantity,
      sizeOptionId: needsSizeStyle ? sizeOptionId : undefined,
      styleOptionId: needsSizeStyle ? styleOptionId : undefined,
      optionChoiceId: optionChoiceId || undefined
    });
    setQuantity(1);
  }

  if (orderable.length === 0) {
    return <p className="muted">No hay artículos disponibles para agregar ahora mismo.</p>;
  }

  return (
    <div className="stack">
      <div className="toolbar">
        <Field label="Categoría">
          <select value={categoryId} onChange={(event) => selectCategory(event.target.value)}>
            {orderable.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Artículo">
          <select value={itemId} onChange={(event) => selectItem(event.target.value)}>
            {category?.items.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.name}
              </option>
            ))}
          </select>
        </Field>
        {needsSizeStyle ? (
          <>
            <Field label="Tamaño">
              <select
                value={sizeOptionId}
                onChange={(event) => {
                  setSizeOptionId(event.target.value);
                  setStyleOptionId("");
                }}
              >
                <option value="">Elige…</option>
                {sizes.map((size) => (
                  <option key={size.id} value={size.id}>
                    {size.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Estilo">
              <select value={styleOptionId} onChange={(event) => setStyleOptionId(event.target.value)} disabled={!sizeOptionId}>
                <option value="">Elige…</option>
                {stylesForSize.map((row) => (
                  <option key={row.style.id} value={row.style.id}>
                    {row.style.name}
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : null}
        {group ? (
          <Field label={group.name}>
            <select value={optionChoiceId} onChange={(event) => setOptionChoiceId(event.target.value)}>
              {!group.required ? <option value="">Ninguno</option> : null}
              {group.choices
                .filter((candidate) => candidate.available)
                .map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
            </select>
          </Field>
        ) : null}
        <Field label="Cantidad">
          <input
            type="number"
            min={1}
            max={50}
            value={quantity}
            onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
          />
        </Field>
        <button type="button" className="btn" disabled={!canAdd} onClick={add}>
          Agregar
        </button>
      </div>
    </div>
  );
}

function EditOrderPanel({
  order,
  location,
  onDone
}: {
  order: Order;
  location: Location;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(order.items.map((item) => [item.id, item.quantity]))
  );
  const [additions, setAdditions] = useState<AdditionDraft[]>([]);

  const menu = useQuery({
    queryKey: ["order-edit-menu", location.id],
    queryFn: () => ordersApi.menuForEditing(location.id).then((response) => response.categories)
  });

  const submit = useMutation({
    mutationFn: () => {
      const changes: EditOrderChangeInput[] = [];
      for (const item of order.items) {
        const next = quantities[item.id];
        if (next !== undefined && next !== item.quantity) {
          changes.push({ type: "set_quantity", orderItemId: item.id, quantity: next });
        }
      }
      for (const addition of additions) {
        changes.push({
          type: "add_item",
          menuItemId: addition.menuItemId,
          sizeOptionId: addition.sizeOptionId,
          styleOptionId: addition.styleOptionId,
          optionChoiceId: addition.optionChoiceId,
          quantity: addition.quantity
        });
      }
      return ordersApi.edit(order.id, reason, changes);
    },
    onSuccess: (result) => {
      queryClient.setQueryData(["order", order.id], result.order);
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      onDone();
    }
  });

  const hasQuantityChange = order.items.some((item) => quantities[item.id] !== item.quantity);
  const canSubmit = reason.trim() !== "" && (hasQuantityChange || additions.length > 0) && !submit.isPending;

  return (
    <Panel title="Editar pedido">
      <div className="stack">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Producto</th>
                <th>Detalle</th>
                <th className="right">Cantidad</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.name}</td>
                  <td className="muted">{[item.size, item.style, item.option].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="right">
                    <input
                      type="number"
                      min={0}
                      max={50}
                      style={{ width: 72 }}
                      value={quantities[item.id] ?? item.quantity}
                      onChange={(event) =>
                        setQuantities((current) => ({ ...current, [item.id]: Math.max(0, Number(event.target.value) || 0) }))
                      }
                    />
                  </td>
                  <td className="right">
                    <button
                      type="button"
                      className="btn btn-sm btn-quiet"
                      onClick={() => setQuantities((current) => ({ ...current, [item.id]: 0 }))}
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
              {additions.map((addition) => (
                <tr key={addition.key}>
                  <td>{addition.name}</td>
                  <td className="muted">{addition.detail ?? "—"}</td>
                  <td className="right">{addition.quantity}</td>
                  <td className="right">
                    <button
                      type="button"
                      className="btn btn-sm btn-quiet"
                      onClick={() => setAdditions((current) => current.filter((row) => row.key !== addition.key))}
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Panel title="Agregar un artículo">
          {menu.isPending ? <Loading label="Cargando menú…" /> : null}
          <ErrorNotice error={menu.error} title="No se pudo cargar el menú" />
          {menu.data ? (
            <ItemPicker
              categories={menu.data}
              onAdd={(draft) => setAdditions((current) => [...current, { ...draft, key: crypto.randomUUID() }])}
            />
          ) : null}
        </Panel>

        <Field label="Motivo del cambio" hint="Obligatorio: por qué se está editando este pedido.">
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Ej. El cliente llamó para quitar una pizza."
            required
          />
        </Field>

        <ErrorNotice error={submit.error} title="No se pudo guardar el cambio" />

        <div className="row">
          <button type="button" className="btn btn-primary" disabled={!canSubmit} onClick={() => submit.mutate()}>
            {submit.isPending ? "Guardando…" : "Guardar cambios"}
          </button>
          <button type="button" className="btn" onClick={onDone}>
            Cancelar
          </button>
        </div>
      </div>
    </Panel>
  );
}
