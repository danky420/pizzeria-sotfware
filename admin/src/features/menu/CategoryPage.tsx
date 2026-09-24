import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { menuApi, type PriceMatrixCellInput } from "../../api/menu";
import {
  Badge,
  EmptyState,
  ErrorNotice,
  Field,
  Loading,
  type MenuCategory,
  PageHeader,
  Panel,
  Toggle,
  type ItemType,
  type MenuItem,
  type OptionGroup,
  type SizeOption,
  type StyleOption
} from "@chesare/portal-shared";
import { SuccessNotice } from "../../components/ui";
import { formatMoney, slugify } from "../../lib/format";
import { useActiveLocation } from "../../state/location";

// Mirrors backend/src/schemas/menu.ts's CATEGORY_ICON_KEYS -- the built-in
// icons a category can pick before (or instead of) uploading its own image.
const ICON_KEY_OPTIONS: { value: string; label: string }[] = [
  { value: "pizza", label: "Pizza" },
  { value: "burger", label: "Hamburguesa" },
  { value: "wings", label: "Alitas" },
  { value: "pasta", label: "Pasta" },
  { value: "dessert", label: "Postre" },
  { value: "frappe", label: "Frappé" },
  { value: "coffee", label: "Café" },
  { value: "bottle", label: "Botella" },
  { value: "can", label: "Lata" },
  { value: "generic", label: "Genérico" }
];

const MAX_ICON_BYTES = 1 * 1024 * 1024;
const ALLOWED_ICON_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

// Mirrors backend/src/schemas/menu.ts's CATEGORY_DISPLAY_STYLES. null defers
// to the seed-time default (rows, except "pizzas") rather than forcing every
// existing category to pick one explicitly.
const DISPLAY_STYLE_OPTIONS: { value: string | null; label: string }[] = [
  { value: null, label: "Automático" },
  { value: "gallery", label: "Galería" },
  { value: "rows", label: "Filas" }
];

function CategoryIconPanel({ category }: { category: MenuCategory }) {
  const queryClient = useQueryClient();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["menu", "category", category.id] });
    void queryClient.invalidateQueries({ queryKey: ["menu", "tree"] });
  };

  const setIconKey = useMutation({
    mutationFn: (iconKey: string) => menuApi.updateCategory(category.id, { iconKey }),
    onSuccess: invalidate
  });

  const setDisplayStyle = useMutation({
    mutationFn: (displayStyle: string | null) => menuApi.updateCategory(category.id, { displayStyle }),
    onSuccess: invalidate
  });

  const uploadIcon = useMutation({
    mutationFn: (file: File) => menuApi.uploadIcon(category.id, file),
    onSuccess: () => {
      setUploadError(null);
      invalidate();
    }
  });

  function onIconSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!ALLOWED_ICON_TYPES.has(file.type)) {
      setUploadError("Formato no permitido. Usa PNG, JPEG o WEBP.");
      return;
    }
    if (file.size > MAX_ICON_BYTES) {
      setUploadError("La imagen pesa más de 1 MB.");
      return;
    }
    setUploadError(null);
    uploadIcon.mutate(file);
  }

  return (
    <Panel title="Presentación e icono">
      <Field
        label="Estilo de tarjetas"
        hint='"Automático" usa filas compactas (como Bebidas), salvo para Pizzas. "Galería" muestra tarjetas grandes con imagen, como Pizzas hoy.'
      >
        <div className="row color-scheme-picker" role="radiogroup" aria-label="Estilo de tarjetas">
          {DISPLAY_STYLE_OPTIONS.map((option) => (
            <label
              key={option.value ?? "auto"}
              className={
                (category.displayStyle ?? null) === option.value ? "color-scheme-option on" : "color-scheme-option"
              }
            >
              <input
                type="radio"
                name="displayStyle"
                checked={(category.displayStyle ?? null) === option.value}
                disabled={setDisplayStyle.isPending}
                onChange={() => setDisplayStyle.mutate(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
      </Field>
      <ErrorNotice error={setDisplayStyle.error} title="No se pudo cambiar el estilo" />

      <Field
        label="Icono integrado"
        hint="Se usa mientras la categoría no tenga una imagen propia (abajo)."
      >
        <div className="row color-scheme-picker" role="radiogroup" aria-label="Icono integrado">
          {ICON_KEY_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={category.iconKey === option.value ? "color-scheme-option on" : "color-scheme-option"}
            >
              <input
                type="radio"
                name="iconKey"
                value={option.value}
                checked={category.iconKey === option.value}
                disabled={setIconKey.isPending}
                onChange={() => setIconKey.mutate(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
      </Field>
      <ErrorNotice error={setIconKey.error} title="No se pudo cambiar el icono" />

      <Field label="Imagen propia" hint="PNG, JPEG o WEBP, hasta 1 MB. Si la subes, reemplaza al icono integrado.">
        <div className="row logo-uploader">
          {category.iconUrl ? (
            <img className="logo-preview" src={category.iconUrl} alt="Icono actual" />
          ) : (
            <span className="muted">Sin imagen propia todavía.</span>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={onIconSelected}
            disabled={uploadIcon.isPending}
          />
        </div>
      </Field>
      {uploadIcon.isPending ? <Loading label="Subiendo imagen…" /> : null}
      {uploadError ? <ErrorNotice error={new Error(uploadError)} /> : null}
      {uploadIcon.error ? <ErrorNotice error={uploadIcon.error} /> : null}
      {uploadIcon.isSuccess && !uploadIcon.isPending ? <SuccessNotice>Imagen actualizada.</SuccessNotice> : null}
    </Panel>
  );
}

/**
 * "" means the price is genuinely unknown (`p: null` on the static site — the item
 * shows but cannot be ordered), which is a different thing from 0. `undefined` is
 * returned only for text that is not a number at all, so a typo never silently
 * becomes "sin precio".
 */
function parsePrice(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(value) || value < 0) return undefined;
  return Math.round(value * 100) / 100;
}

function priceToInput(price: number | null): string {
  return price === null ? "" : String(price);
}

function cellKey(sizeOptionId: string, styleOptionId: string): string {
  return `${sizeOptionId}:${styleOptionId}`;
}

function itemsKey(categoryId: string) {
  return ["menu", "items", categoryId] as const;
}

function FlatPriceEditor({ item, categoryId }: { item: MenuItem; categoryId: string }) {
  const queryClient = useQueryClient();
  const { location } = useActiveLocation();
  const [text, setText] = useState(() => priceToInput(item.flatPrice));
  const [invalid, setInvalid] = useState(false);

  const save = useMutation({
    mutationFn: (price: number | null) => menuApi.setFlatPrice(item.id, price),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: itemsKey(categoryId) });
      void queryClient.invalidateQueries({ queryKey: ["menu", "tree"] });
    }
  });

  const commit = (raw: string) => {
    const parsed = parsePrice(raw);
    if (parsed === undefined) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    save.mutate(parsed);
  };

  return (
    <div className="stack">
      <div className="price-input-group">
        <Field label="Precio">
          <input
            inputMode="decimal"
            placeholder="Sin precio"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </Field>
        <button
          type="button"
          className="btn btn-sm"
          disabled={save.isPending}
          onClick={() => commit(text)}
        >
          Guardar
        </button>
        <button
          type="button"
          className="btn btn-sm"
          disabled={save.isPending || item.flatPrice === null}
          onClick={() => {
            setText("");
            commit("");
          }}
        >
          Quitar precio
        </button>
      </div>

      {item.flatPrice === null ? (
        <span className="no-price">Sin precio · se muestra como «Pregunta el precio»</span>
      ) : (
        <span className="muted">Actual: {formatMoney(item.flatPrice, location?.currency)}</span>
      )}

      {invalid ? <p className="notice notice-error">Escribe un número, o deja vacío para «sin precio».</p> : null}
      <ErrorNotice error={save.error} title="No se pudo guardar el precio" />
    </div>
  );
}

function MatrixEditor({
  item,
  categoryId,
  sizeOptions,
  styleOptions
}: {
  item: MenuItem;
  categoryId: string;
  sizeOptions: SizeOption[];
  styleOptions: StyleOption[];
}) {
  const queryClient = useQueryClient();
  const [cells, setCells] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const cell of item.priceCells) {
      initial[cellKey(cell.sizeOptionId, cell.styleOptionId)] = priceToInput(cell.price);
    }
    return initial;
  });
  const [invalid, setInvalid] = useState(false);

  const save = useMutation({
    mutationFn: (payload: PriceMatrixCellInput[]) => menuApi.replacePriceMatrix(item.id, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: itemsKey(categoryId) });
      void queryClient.invalidateQueries({ queryKey: ["menu", "tree"] });
    }
  });

  if (sizeOptions.length === 0 || styleOptions.length === 0) {
    return (
      <p className="muted">
        Esta categoría todavía no tiene tamaños o estilos, así que no hay matriz que editar.
      </p>
    );
  }

  const onSave = () => {
    const payload: PriceMatrixCellInput[] = [];
    for (const size of sizeOptions) {
      for (const style of styleOptions) {
        const parsed = parsePrice(cells[cellKey(size.id, style.id)] ?? "");
        if (parsed === undefined) {
          setInvalid(true);
          return;
        }
        payload.push({ sizeOptionId: size.id, styleOptionId: style.id, price: parsed });
      }
    }
    setInvalid(false);
    save.mutate(payload);
  };

  const nullCount = sizeOptions.length * styleOptions.length -
    sizeOptions.reduce(
      (acc, size) =>
        acc +
        styleOptions.filter((style) => (cells[cellKey(size.id, style.id)] ?? "").trim() !== "").length,
      0
    );

  return (
    <div className="stack">
      <div className="matrix-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th>Tamaño</th>
              {styleOptions.map((style) => (
                <th key={style.id}>{style.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sizeOptions.map((size) => (
              <tr key={size.id}>
                <td>{size.name}</td>
                {styleOptions.map((style) => {
                  const key = cellKey(size.id, style.id);
                  const value = cells[key] ?? "";
                  return (
                    <td key={style.id} className={value.trim() === "" ? "cell-null" : undefined}>
                      <input
                        inputMode="decimal"
                        placeholder="—"
                        aria-label={`${size.name} · ${style.name}`}
                        value={value}
                        onChange={(event) =>
                          setCells((current) => ({ ...current, [key]: event.target.value }))
                        }
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="row">
        <button type="button" className="btn btn-primary btn-sm" disabled={save.isPending} onClick={onSave}>
          {save.isPending ? "Guardando…" : "Guardar matriz"}
        </button>
        <span className="muted">
          Una celda vacía queda «sin precio» y no se puede pedir.
          {nullCount > 0 ? ` (${nullCount} sin precio)` : ""}
        </span>
      </div>

      {invalid ? <p className="notice notice-error">Alguna celda no es un número válido.</p> : null}
      {save.isSuccess && !save.isPending ? <SuccessNotice>Matriz guardada.</SuccessNotice> : null}
      <ErrorNotice error={save.error} title="No se pudo guardar la matriz" />
    </div>
  );
}

function ChoiceRow({ groupId, choice, categoryId }: {
  groupId: string;
  choice: OptionGroup["choices"][number];
  categoryId: string;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(choice.name);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: itemsKey(categoryId) });

  const update = useMutation({
    mutationFn: (input: { name?: string; available?: boolean }) => menuApi.updateChoice(choice.id, input),
    onSuccess: () => void invalidate()
  });

  const remove = useMutation({
    mutationFn: () => menuApi.removeChoice(choice.id),
    onSuccess: () => void invalidate()
  });

  return (
    <div className="choice-row" data-group={groupId}>
      <input
        aria-label="Nombre de la opción"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => {
          if (name.trim() !== "" && name !== choice.name) update.mutate({ name: name.trim() });
        }}
        style={{ maxWidth: "240px" }}
      />
      <Toggle
        label="Disponible"
        checked={choice.available}
        disabled={update.isPending}
        onChange={(next) => update.mutate({ available: next })}
      />
      <button
        type="button"
        className="btn btn-sm btn-danger"
        disabled={remove.isPending}
        onClick={() => {
          if (window.confirm(`¿Eliminar «${choice.name}»?`)) remove.mutate();
        }}
      >
        Eliminar
      </button>
      <ErrorNotice error={update.error ?? remove.error} />
    </div>
  );
}

function OptionGroupBlock({ group, categoryId }: { group: OptionGroup; categoryId: string }) {
  const queryClient = useQueryClient();
  const [choiceName, setChoiceName] = useState("");
  const invalidate = () => queryClient.invalidateQueries({ queryKey: itemsKey(categoryId) });

  const addChoice = useMutation({
    mutationFn: () =>
      menuApi.createChoice(group.id, {
        name: choiceName.trim(),
        priceDelta: 0,
        priceOverride: null,
        available: true,
        sortOrder: group.choices.length
      }),
    onSuccess: () => {
      setChoiceName("");
      void invalidate();
    }
  });

  const removeGroup = useMutation({
    mutationFn: () => menuApi.removeOptionGroup(group.id),
    onSuccess: () => void invalidate()
  });

  return (
    <div className="item-card">
      <div className="item-card-head">
        <div>
          <h3>{group.name}</h3>
          <span className="muted">
            {group.selectionType === "SINGLE" ? "Elige una" : "Elige varias"} ·{" "}
            {group.required ? "obligatorio" : "opcional"} · {group.choices.length} opciones
          </span>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-danger"
          disabled={removeGroup.isPending}
          onClick={() => {
            if (window.confirm(`¿Eliminar el grupo «${group.name}» y todas sus opciones?`)) {
              removeGroup.mutate();
            }
          }}
        >
          Eliminar grupo
        </button>
      </div>

      {group.choices.map((choice) => (
        <ChoiceRow key={choice.id} groupId={group.id} choice={choice} categoryId={categoryId} />
      ))}

      <form
        className="row"
        onSubmit={(event) => {
          event.preventDefault();
          if (choiceName.trim() !== "") addChoice.mutate();
        }}
      >
        <input
          placeholder="Nueva opción (p. ej. BBQ)"
          value={choiceName}
          onChange={(event) => setChoiceName(event.target.value)}
          style={{ maxWidth: "240px" }}
        />
        <button type="submit" className="btn btn-sm" disabled={addChoice.isPending}>
          Agregar
        </button>
      </form>

      <ErrorNotice error={addChoice.error ?? removeGroup.error} />
    </div>
  );
}

function ItemCard({
  item,
  categoryId,
  sizeOptions,
  styleOptions
}: {
  item: MenuItem;
  categoryId: string;
  sizeOptions: SizeOption[];
  styleOptions: StyleOption[];
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description ?? "");
  const [subgroupLabel, setSubgroupLabel] = useState(item.subgroupLabel ?? "");
  const [groupName, setGroupName] = useState("");
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: itemsKey(categoryId) });
    void queryClient.invalidateQueries({ queryKey: ["menu", "tree"] });
  };

  const saveDetails = useMutation({
    mutationFn: () =>
      menuApi.updateItem(item.id, {
        name: name.trim(),
        description: description.trim() === "" ? null : description.trim(),
        subgroupLabel: subgroupLabel.trim() === "" ? null : subgroupLabel.trim()
      }),
    onSuccess: invalidate
  });

  const setAvailability = useMutation({
    mutationFn: (available: boolean) => menuApi.setAvailability(item.id, available),
    onSuccess: invalidate
  });

  const removeItem = useMutation({
    mutationFn: () => menuApi.removeItem(item.id),
    onSuccess: invalidate
  });

  const [imageError, setImageError] = useState<string | null>(null);
  const uploadImage = useMutation({
    mutationFn: (file: File) => menuApi.uploadItemImage(item.id, file),
    onSuccess: () => {
      setImageError(null);
      invalidate();
    }
  });

  function onImageSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!ALLOWED_ICON_TYPES.has(file.type)) {
      setImageError("Formato no permitido. Usa PNG, JPEG o WEBP.");
      return;
    }
    if (file.size > MAX_ICON_BYTES) {
      setImageError("La imagen pesa más de 1 MB.");
      return;
    }
    setImageError(null);
    uploadImage.mutate(file);
  }

  const addGroup = useMutation({
    mutationFn: () =>
      menuApi.createOptionGroup(item.id, {
        name: groupName.trim(),
        selectionType: "SINGLE",
        required: true,
        minSelections: 1,
        maxSelections: 1,
        sortOrder: item.optionGroups.length
      }),
    onSuccess: () => {
      setGroupName("");
      invalidate();
    }
  });

  const unpriced =
    item.itemType === "FLAT"
      ? item.flatPrice === null
      : item.priceCells.length === 0 || item.priceCells.some((cell) => cell.price === null);

  return (
    <div className="item-card">
      <div className="item-card-head">
        <div>
          <h3>{item.name}</h3>
          <span className="muted mono">{item.slug}</span>
          <div className="row" style={{ marginTop: "4px" }}>
            <Badge tone="info">
              {item.itemType === "FLAT" ? "Precio fijo" : "Tamaño × estilo"}
            </Badge>
            {item.available ? <Badge tone="ok">Disponible</Badge> : <Badge tone="muted">Agotado</Badge>}
            {unpriced ? <Badge tone="warn">Sin precio</Badge> : null}
            {item.isFeatured ? <Badge tone="warn">Favorita</Badge> : null}
            {item.ageRestricted ? <Badge tone="muted">+18</Badge> : null}
          </div>
        </div>
        <div className="row">
          <Toggle
            label="Disponible"
            checked={item.available}
            disabled={setAvailability.isPending}
            onChange={(next) => setAvailability.mutate(next)}
          />
          <button type="button" className="btn btn-sm" onClick={() => setOpen((value) => !value)}>
            {open ? "Cerrar" : "Editar"}
          </button>
        </div>
      </div>

      <ErrorNotice error={setAvailability.error} title="No se pudo cambiar la disponibilidad" />

      {open ? (
        <>
          <div className="grid-2">
            <Field label="Nombre">
              <input value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="Descripción">
              <input value={description} onChange={(event) => setDescription(event.target.value)} />
            </Field>
            <Field
              label="Subgrupo"
              hint='Encabezado dentro de la lista, ej. "Cafés y tés" en una categoría de frappés y cafés. Vacío = sin encabezado propio.'
            >
              <input value={subgroupLabel} onChange={(event) => setSubgroupLabel(event.target.value)} />
            </Field>
          </div>
          <div className="row">
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={saveDetails.isPending || name.trim() === ""}
              onClick={() => saveDetails.mutate()}
            >
              {saveDetails.isPending ? "Guardando…" : "Guardar datos"}
            </button>
          </div>
          <ErrorNotice error={saveDetails.error} title="No se pudieron guardar los datos" />

          <Field label="Foto del producto" hint="PNG, JPEG o WEBP, hasta 1 MB. Reemplaza al icono en el sitio público.">
            <div className="row logo-uploader">
              {item.imageUrl ? (
                <img className="logo-preview" src={item.imageUrl} alt="Foto actual" />
              ) : (
                <span className="muted">Sin foto todavía.</span>
              )}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={onImageSelected}
                disabled={uploadImage.isPending}
              />
            </div>
          </Field>
          {uploadImage.isPending ? <Loading label="Subiendo foto…" /> : null}
          {imageError ? <ErrorNotice error={new Error(imageError)} /> : null}
          {uploadImage.error ? <ErrorNotice error={uploadImage.error} /> : null}
          {uploadImage.isSuccess && !uploadImage.isPending ? <SuccessNotice>Foto actualizada.</SuccessNotice> : null}

          {item.itemType === "FLAT" ? (
            <FlatPriceEditor item={item} categoryId={categoryId} />
          ) : (
            <MatrixEditor
              item={item}
              categoryId={categoryId}
              sizeOptions={sizeOptions}
              styleOptions={styleOptions}
            />
          )}

          <div className="stack">
            <h3>Grupos de opciones</h3>
            {item.optionGroups.length === 0 ? (
              <p className="muted">Sin grupos. Úsalos para sabores de alitas, tipos de pasta, etc.</p>
            ) : (
              item.optionGroups.map((group) => (
                <OptionGroupBlock key={group.id} group={group} categoryId={categoryId} />
              ))
            )}
            <form
              className="row"
              onSubmit={(event) => {
                event.preventDefault();
                if (groupName.trim() !== "") addGroup.mutate();
              }}
            >
              <input
                placeholder="Nuevo grupo (p. ej. Salsa)"
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
                style={{ maxWidth: "240px" }}
              />
              <button type="submit" className="btn btn-sm" disabled={addGroup.isPending}>
                Agregar grupo
              </button>
            </form>
            <ErrorNotice error={addGroup.error} />
          </div>

          <div className="row">
            <button
              type="button"
              className="btn btn-sm btn-danger"
              disabled={removeItem.isPending}
              onClick={() => {
                if (window.confirm(`¿Eliminar «${item.name}» del menú?`)) removeItem.mutate();
              }}
            >
              Eliminar producto
            </button>
          </div>
          <ErrorNotice error={removeItem.error} title="No se pudo eliminar el producto" />
        </>
      ) : null}
    </div>
  );
}

function NewItemForm({ categoryId, nextSortOrder }: { categoryId: string; nextSortOrder: number }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [itemType, setItemType] = useState<ItemType>("FLAT");
  const [price, setPrice] = useState("");
  const [priceError, setPriceError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (flatPrice: number | null) =>
      menuApi.createItem(categoryId, {
        slug: slugify(name),
        name: name.trim(),
        description: null,
        subgroupLabel: null,
        itemType,
        flatPrice: itemType === "FLAT" ? flatPrice : null,
        toppingColors: null,
        isFeatured: false,
        ageRestricted: false,
        available: true,
        sortOrder: nextSortOrder
      }),
    onSuccess: () => {
      setName("");
      setPrice("");
      void queryClient.invalidateQueries({ queryKey: itemsKey(categoryId) });
      void queryClient.invalidateQueries({ queryKey: ["menu", "tree"] });
    }
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === "") return;

    // Unlike editing an existing item (where clearing the price back to "sin
    // precio" is the documented, load-bearing way to mark a price genuinely
    // unknown), a brand-new product has no printed-menu blank sticker excuse —
    // whoever is adding it here knows the price, so this form requires one.
    if (itemType !== "FLAT") {
      setPriceError(null);
      create.mutate(null);
      return;
    }
    if (price.trim() === "") {
      setPriceError("El precio es obligatorio.");
      return;
    }
    const parsed = parsePrice(price);
    if (parsed === undefined || parsed === null) {
      setPriceError("El precio no es un número válido.");
      return;
    }
    setPriceError(null);
    create.mutate(parsed);
  };

  return (
    <Panel title="Nuevo producto">
      <form className="toolbar" onSubmit={onSubmit}>
        <div className="field-grow">
          <Field label="Nombre" hint={name ? `Clave: ${slugify(name)}` : undefined}>
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </Field>
        </div>
        <Field label="Tipo">
          <select value={itemType} onChange={(event) => setItemType(event.target.value as ItemType)}>
            <option value="FLAT">Precio fijo</option>
            <option value="SIZE_STYLE_MATRIX">Tamaño × estilo</option>
          </select>
        </Field>
        {itemType === "FLAT" ? (
          <Field label="Precio">
            <input
              inputMode="decimal"
              placeholder="0.00"
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              required
            />
          </Field>
        ) : null}
        <button type="submit" className="btn btn-primary" disabled={create.isPending}>
          {create.isPending ? "Creando…" : "Crear"}
        </button>
      </form>
      {priceError ? <p className="notice notice-error">{priceError}</p> : null}
      <ErrorNotice error={create.error} title="No se pudo crear el producto" />
    </Panel>
  );
}

export function CategoryPage() {
  const { categoryId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const removeCategory = useMutation({
    mutationFn: () => menuApi.removeCategory(categoryId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["menu", "tree"] });
      navigate("/menu");
    }
  });

  const category = useQuery({
    queryKey: ["menu", "category", categoryId],
    queryFn: () => menuApi.getCategory(categoryId),
    enabled: categoryId !== ""
  });

  const items = useQuery({
    queryKey: itemsKey(categoryId),
    queryFn: () => menuApi.listItems(categoryId).then((response) => response.items),
    enabled: categoryId !== ""
  });

  if (category.isPending) return <Loading label="Cargando categoría…" />;

  if (category.error || !category.data) {
    return (
      <>
        <PageHeader title="Categoría" />
        <Panel>
          <ErrorNotice error={category.error} title="No se pudo cargar la categoría" />
          <Link className="btn" to="/menu">
            Volver al menú
          </Link>
        </Panel>
      </>
    );
  }

  const sizeOptions = [...category.data.sizeOptions].sort((a, b) => a.sortOrder - b.sortOrder);
  const styleOptions = [...category.data.styleOptions].sort((a, b) => a.sortOrder - b.sortOrder);
  const rows = items.data ?? [];

  return (
    <>
      <PageHeader
        title={category.data.category.name}
        description={category.data.category.description ?? undefined}
        actions={
          <div className="row">
            <Link className="btn" to="/menu">
              Volver al menú
            </Link>
            <button
              type="button"
              className="btn btn-sm btn-danger"
              disabled={removeCategory.isPending}
              onClick={() => {
                const count = rows.length;
                const warning =
                  count > 0
                    ? `¿Eliminar «${category.data.category.name}»? Esto también elimina sus ${count} producto${count === 1 ? "" : "s"}. No se puede deshacer.`
                    : `¿Eliminar «${category.data.category.name}»? No se puede deshacer.`;
                if (window.confirm(warning)) removeCategory.mutate();
              }}
            >
              {removeCategory.isPending ? "Eliminando…" : "Eliminar categoría"}
            </button>
          </div>
        }
      />
      <ErrorNotice error={removeCategory.error} title="No se pudo eliminar la categoría" />

      <CategoryIconPanel category={category.data.category} />

      <NewItemForm categoryId={categoryId} nextSortOrder={rows.length} />

      <ErrorNotice error={items.error} title="No se pudieron cargar los productos" />
      {items.isPending ? <Loading /> : null}

      {!items.isPending && rows.length === 0 ? (
        <EmptyState title="Sin productos">Agrega el primer producto de esta categoría.</EmptyState>
      ) : null}

      <div className="stack">
        {rows.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            categoryId={categoryId}
            sizeOptions={sizeOptions}
            styleOptions={styleOptions}
          />
        ))}
      </div>
    </>
  );
}
