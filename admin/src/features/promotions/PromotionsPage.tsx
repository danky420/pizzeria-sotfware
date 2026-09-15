import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { menuApi } from "../../api/menu";
import { promotionsApi, type PromotionInput } from "../../api/promotions";
import type { DiscountType, Promotion, PromotionScope } from "../../api/types";
import { Badge, EmptyState, ErrorNotice, Field, Loading, PageHeader, Panel } from "../../components/ui";
import { formatDate, formatMoney, isoToLocalInput, localInputToIso } from "../../lib/format";
import { useActiveLocation, useLocationId } from "../../state/location";

const SCOPE_LABELS: Record<PromotionScope, string> = {
  ORDER: "Todo el pedido",
  CATEGORY: "Una categoría",
  ITEM: "Un producto"
};

const DISCOUNT_LABELS: Record<DiscountType, string> = {
  PERCENT: "Porcentaje",
  FIXED: "Monto fijo"
};

interface FormState {
  name: string;
  description: string;
  code: string;
  discountType: DiscountType;
  discountValue: string;
  scope: PromotionScope;
  categoryId: string;
  menuItemId: string;
  minSubtotal: string;
  startsAt: string;
  endsAt: string;
  active: boolean;
}

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  code: "",
  discountType: "PERCENT",
  discountValue: "10",
  scope: "ORDER",
  categoryId: "",
  menuItemId: "",
  minSubtotal: "",
  startsAt: "",
  endsAt: "",
  active: true
};

function toForm(promotion: Promotion): FormState {
  return {
    name: promotion.name,
    description: promotion.description ?? "",
    code: promotion.code ?? "",
    discountType: promotion.discountType,
    discountValue: String(promotion.discountValue),
    scope: promotion.scope,
    categoryId: promotion.categoryId ?? "",
    menuItemId: promotion.menuItemId ?? "",
    minSubtotal: promotion.minSubtotal === null ? "" : String(promotion.minSubtotal),
    startsAt: isoToLocalInput(promotion.startsAt),
    endsAt: isoToLocalInput(promotion.endsAt),
    active: promotion.active
  };
}

function toInput(form: FormState): PromotionInput {
  return {
    name: form.name.trim(),
    description: form.description.trim() === "" ? null : form.description.trim(),
    code: form.code.trim() === "" ? null : form.code.trim().toUpperCase(),
    discountType: form.discountType,
    discountValue: Number(form.discountValue),
    scope: form.scope,
    categoryId: form.scope === "CATEGORY" ? form.categoryId || null : null,
    menuItemId: form.scope === "ITEM" ? form.menuItemId || null : null,
    minSubtotal: form.minSubtotal.trim() === "" ? null : Number(form.minSubtotal),
    startsAt: localInputToIso(form.startsAt),
    endsAt: localInputToIso(form.endsAt),
    active: form.active
  };
}

export function PromotionsPage() {
  const locationId = useLocationId();
  const { location } = useActiveLocation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [open, setOpen] = useState(false);

  const promotions = useQuery({
    queryKey: ["promotions", locationId],
    queryFn: () => promotionsApi.list(locationId).then((response) => response.promotions)
  });

  const menu = useQuery({
    queryKey: ["menu", "tree", locationId],
    queryFn: () => menuApi.tree(locationId).then((response) => response.categories)
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["promotions", locationId] });

  const save = useMutation({
    mutationFn: () =>
      editing ? promotionsApi.update(editing, toInput(form)) : promotionsApi.create(locationId, toInput(form)),
    onSuccess: () => {
      setOpen(false);
      setEditing(null);
      setForm(EMPTY_FORM);
      void invalidate();
    }
  });

  const toggleActive = useMutation({
    mutationFn: (promotion: Promotion) => promotionsApi.update(promotion.id, { active: !promotion.active }),
    onSuccess: () => void invalidate()
  });

  const remove = useMutation({
    mutationFn: (id: string) => promotionsApi.remove(id),
    onSuccess: () => void invalidate()
  });

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  const startNew = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setOpen(true);
  };

  const startEdit = (promotion: Promotion) => {
    setEditing(promotion.id);
    setForm(toForm(promotion));
    setOpen(true);
  };

  const categories = menu.data ?? [];
  const allItems = categories.flatMap((category) =>
    category.items.map((item) => ({ id: item.id, label: `${category.name} · ${item.name}` }))
  );

  const describeValue = (promotion: Promotion) =>
    promotion.discountType === "PERCENT"
      ? `${promotion.discountValue}%`
      : formatMoney(promotion.discountValue, location?.currency);

  return (
    <>
      <PageHeader
        title="Promociones"
        actions={
          <button type="button" className="btn btn-primary" onClick={startNew}>
            Nueva promoción
          </button>
        }
      />

      {open ? (
        <Panel title={editing ? "Editar promoción" : "Nueva promoción"}>
          <form className="stack" onSubmit={onSubmit}>
            <div className="grid-2">
              <Field label="Nombre">
                <input value={form.name} onChange={(event) => update("name", event.target.value)} required />
              </Field>
              <Field label="Código" hint="Opcional. Se guarda en mayúsculas.">
                <input value={form.code} onChange={(event) => update("code", event.target.value)} />
              </Field>
              <Field label="Tipo de descuento">
                <select
                  value={form.discountType}
                  onChange={(event) => update("discountType", event.target.value as DiscountType)}
                >
                  {Object.entries(DISCOUNT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label={form.discountType === "PERCENT" ? "Porcentaje" : "Monto"}
                hint={form.discountType === "PERCENT" ? "Máximo 100" : undefined}
              >
                <input
                  inputMode="decimal"
                  value={form.discountValue}
                  onChange={(event) => update("discountValue", event.target.value)}
                  required
                />
              </Field>
              <Field label="Aplica a">
                <select
                  value={form.scope}
                  onChange={(event) => update("scope", event.target.value as PromotionScope)}
                >
                  {Object.entries(SCOPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              {form.scope === "CATEGORY" ? (
                <Field label="Categoría">
                  <select
                    value={form.categoryId}
                    onChange={(event) => update("categoryId", event.target.value)}
                    required
                  >
                    <option value="">Elige una…</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
              {form.scope === "ITEM" ? (
                <Field label="Producto">
                  <select
                    value={form.menuItemId}
                    onChange={(event) => update("menuItemId", event.target.value)}
                    required
                  >
                    <option value="">Elige uno…</option>
                    {allItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
              <Field label="Subtotal mínimo" hint="Opcional">
                <input
                  inputMode="decimal"
                  value={form.minSubtotal}
                  onChange={(event) => update("minSubtotal", event.target.value)}
                />
              </Field>
              <Field label="Empieza" hint="Opcional">
                <input
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(event) => update("startsAt", event.target.value)}
                />
              </Field>
              <Field label="Termina" hint="Opcional">
                <input
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(event) => update("endsAt", event.target.value)}
                />
              </Field>
            </div>

            <Field label="Descripción">
              <textarea
                value={form.description}
                onChange={(event) => update("description", event.target.value)}
              />
            </Field>

            <label className="toggle">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => update("active", event.target.checked)}
              />
              <span>Activa</span>
            </label>

            <ErrorNotice error={save.error} title="No se pudo guardar la promoción" />

            <div className="row">
              <button type="submit" className="btn btn-primary" disabled={save.isPending}>
                {save.isPending ? "Guardando…" : "Guardar"}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setOpen(false);
                  setEditing(null);
                }}
              >
                Cancelar
              </button>
            </div>
          </form>
        </Panel>
      ) : null}

      <ErrorNotice error={promotions.error} title="No se pudieron cargar las promociones" />
      {promotions.isPending ? <Loading /> : null}

      {promotions.data && promotions.data.length === 0 ? (
        <EmptyState title="Sin promociones">Crea una para aplicar descuentos en el checkout.</EmptyState>
      ) : null}

      {promotions.data && promotions.data.length > 0 ? (
        <Panel>
          <ErrorNotice error={toggleActive.error ?? remove.error} />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Código</th>
                  <th>Descuento</th>
                  <th>Aplica a</th>
                  <th>Vigencia</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {promotions.data.map((promotion) => (
                  <tr key={promotion.id}>
                    <td>
                      {promotion.name}
                      {promotion.description ? <div className="muted">{promotion.description}</div> : null}
                    </td>
                    <td className="mono">{promotion.code ?? "—"}</td>
                    <td className="nowrap">{describeValue(promotion)}</td>
                    <td>{SCOPE_LABELS[promotion.scope]}</td>
                    <td className="nowrap muted">
                      {promotion.startsAt || promotion.endsAt
                        ? `${formatDate(promotion.startsAt) } → ${formatDate(promotion.endsAt)}`
                        : "Siempre"}
                    </td>
                    <td>
                      {promotion.active ? <Badge tone="ok">Activa</Badge> : <Badge tone="muted">Inactiva</Badge>}
                    </td>
                    <td className="right nowrap">
                      <button type="button" className="btn btn-sm" onClick={() => startEdit(promotion)}>
                        Editar
                      </button>{" "}
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={toggleActive.isPending}
                        onClick={() => toggleActive.mutate(promotion)}
                      >
                        {promotion.active ? "Desactivar" : "Activar"}
                      </button>{" "}
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        disabled={remove.isPending}
                        onClick={() => {
                          if (window.confirm(`¿Eliminar «${promotion.name}»?`)) remove.mutate(promotion.id);
                        }}
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}
    </>
  );
}
