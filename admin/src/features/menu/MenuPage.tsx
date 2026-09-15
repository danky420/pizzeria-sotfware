import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { menuApi } from "../../api/menu";
import { Badge, EmptyState, ErrorNotice, Field, Loading, PageHeader, Panel } from "../../components/ui";
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

  const createCategory = useMutation({
    mutationFn: () =>
      menuApi.createCategory(locationId, {
        slug: slugify(name),
        name: name.trim(),
        description: null,
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
            <Field label="Nombre" hint={name ? `Clave: ${slugify(name)}` : undefined}>
              <input value={name} onChange={(event) => setName(event.target.value)} required />
            </Field>
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
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Categoría</th>
                  <th>Clave</th>
                  <th className="right">Productos</th>
                  <th className="right">Sin precio</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {menu.data.map((category) => {
                  const unpriced = category.items.filter((item) =>
                    item.itemType === "FLAT"
                      ? item.flatPrice === null
                      : item.priceCells.some((cell) => cell.price === null)
                  ).length;

                  return (
                    <tr key={category.id}>
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
