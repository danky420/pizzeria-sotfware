import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { menuApi } from "../../api/menu";
import {
  Badge,
  EmptyState,
  ErrorNotice,
  Field,
  Loading,
  PageHeader,
  Panel,
  type MenuCategoryTree
} from "@chesare/portal-shared";
import { slugify } from "../../lib/format";
import { useLocationId } from "../../state/location";

export function MenuPage() {
  const locationId = useLocationId();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");

  const menu = useQuery({
    queryKey: ["menu", "tree", locationId],
    queryFn: () => menuApi.tree(locationId).then((response) => response.categories)
  });

  // Local, reorderable copy of the list: dragging needs to move rows live,
  // well before the reorder call round-trips, and the server's reorder
  // response is deliberately the thin presentCategory() shape (no items),
  // not this page's richer tree data -- so on success this re-syncs from a
  // refetch instead of overwriting the query cache with a shape that would
  // break the "productos"/"sin precio" columns below.
  const [categories, setCategories] = useState<MenuCategoryTree[]>([]);
  const draggingId = useRef<string | null>(null);
  const [draggingOverId, setDraggingOverId] = useState<string | null>(null);

  useEffect(() => {
    if (menu.data && draggingId.current === null) setCategories(menu.data);
  }, [menu.data]);

  const reorder = useMutation({
    mutationFn: (categoryIds: string[]) => menuApi.reorderCategories(locationId, categoryIds),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["menu", "tree", locationId] }),
    onError: () => {
      if (menu.data) setCategories(menu.data);
    }
  });

  function moveCategory(id: string, direction: -1 | 1) {
    setCategories((current) => {
      const index = current.findIndex((category) => category.id === id);
      const target = index + direction;
      if (index === -1 || target < 0 || target >= current.length) return current;
      const next = [...current];
      // Bounds already checked above, so both indices are real entries.
      [next[index], next[target]] = [next[target]!, next[index]!];
      reorder.mutate(next.map((category) => category.id));
      return next;
    });
  }

  function onRowDragStart(id: string) {
    draggingId.current = id;
  }

  function onRowDragOver(event: DragEvent, overId: string) {
    event.preventDefault();
    setDraggingOverId(overId);
    const fromId = draggingId.current;
    if (!fromId || fromId === overId) return;
    setCategories((current) => {
      const fromIndex = current.findIndex((category) => category.id === fromId);
      const toIndex = current.findIndex((category) => category.id === overId);
      if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return current;
      const next = [...current];
      // fromIndex was already confirmed a real entry above.
      const [moved] = next.splice(fromIndex, 1) as [MenuCategoryTree];
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  function onRowDragEnd() {
    if (draggingId.current) reorder.mutate(categories.map((category) => category.id));
    draggingId.current = null;
    setDraggingOverId(null);
  }

  const createCategory = useMutation({
    mutationFn: () =>
      menuApi.createCategory(locationId, {
        slug: slugify(name),
        name: name.trim(),
        description: null,
        iconKey: null,
        displayStyle: null,
        sortOrder: menu.data?.length ?? 0,
        active: true
      }),
    onSuccess: () => {
      setName("");
      setShowForm(false);
      void queryClient.invalidateQueries({ queryKey: ["menu"] });
    }
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() === "") return;
    createCategory.mutate();
  };

  return (
    <>
      <PageHeader
        title="Menú"
        description="Los precios aquí son los que ve el cliente."
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setShowForm((open) => !open)}>
            {showForm ? "Cancelar" : "Nueva categoría"}
          </button>
        }
      />

      {showForm ? (
        <Panel title="Nueva categoría">
          <form className="toolbar" onSubmit={onSubmit}>
            <div className="field-grow">
              <Field label="Nombre" hint={name ? `Clave: ${slugify(name)}` : undefined}>
                <input value={name} onChange={(event) => setName(event.target.value)} required />
              </Field>
            </div>
            <button type="submit" className="btn btn-primary" disabled={createCategory.isPending}>
              {createCategory.isPending ? "Creando…" : "Crear"}
            </button>
          </form>
          <ErrorNotice error={createCategory.error} title="No se pudo crear la categoría" />
        </Panel>
      ) : null}

      <ErrorNotice error={menu.error} title="No se pudo cargar el menú" />
      {menu.isPending ? <Loading label="Cargando menú…" /> : null}

      {menu.data && menu.data.length === 0 ? (
        <EmptyState title="Sin categorías">Crea la primera categoría para empezar el menú.</EmptyState>
      ) : null}

      {menu.data && menu.data.length > 0 ? (
        <Panel>
          <p className="field-hint">
            Arrastra una fila (o usa las flechas) para cambiar el orden en que aparecen en el sitio del cliente.
          </p>
          <ErrorNotice error={reorder.error} title="No se pudo guardar el nuevo orden" />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th />
                  <th>Categoría</th>
                  <th>Clave</th>
                  <th className="right">Productos</th>
                  <th className="right">Sin precio</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {categories.map((category, index) => {
                  const unpriced = category.items.filter((item) =>
                    item.itemType === "FLAT"
                      ? item.flatPrice === null
                      : item.priceCells.some((cell) => cell.price === null)
                  ).length;

                  return (
                    <tr
                      key={category.id}
                      draggable
                      onDragStart={() => onRowDragStart(category.id)}
                      onDragOver={(event) => onRowDragOver(event, category.id)}
                      onDrop={(event) => event.preventDefault()}
                      onDragEnd={onRowDragEnd}
                      className={draggingOverId === category.id ? "row-drag-over" : undefined}
                    >
                      <td className="drag-handle-cell">
                        <span className="drag-handle" aria-hidden="true" title="Arrastra para reordenar">
                          ⠿
                        </span>
                        <div className="reorder-buttons">
                          <button
                            type="button"
                            className="btn btn-sm btn-quiet"
                            aria-label={`Mover «${category.name}» arriba`}
                            disabled={index === 0 || reorder.isPending}
                            onClick={() => moveCategory(category.id, -1)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-quiet"
                            aria-label={`Mover «${category.name}» abajo`}
                            disabled={index === categories.length - 1 || reorder.isPending}
                            onClick={() => moveCategory(category.id, 1)}
                          >
                            ↓
                          </button>
                        </div>
                      </td>
                      <td>
                        <Link to={`/menu/${category.id}`}>{category.name}</Link>
                        {category.description ? (
                          <div className="muted">{category.description}</div>
                        ) : null}
                      </td>
                      <td className="mono">{category.slug}</td>
                      <td className="right">{category.items.length}</td>
                      <td className="right">
                        {unpriced > 0 ? <span className="no-price">{unpriced}</span> : "—"}
                      </td>
                      <td>
                        {category.active ? (
                          <Badge tone="ok">Visible</Badge>
                        ) : (
                          <Badge tone="muted">Oculta</Badge>
                        )}
                      </td>
                      <td className="right">
                        <Link className="btn btn-sm" to={`/menu/${category.id}`}>
                          Editar
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}
    </>
  );
}
