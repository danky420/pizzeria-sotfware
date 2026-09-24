import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Badge,
  EmptyState,
  ErrorNotice,
  Loading,
  menuAvailabilityApi,
  PageHeader,
  Panel,
  Toggle,
  type MenuCategoryTree
} from "@chesare/portal-shared";
import { useActiveLocation } from "../../lib/session";

/**
 * The one menu screen STAFF gets: mark something out of stock (or back in),
 * nothing else -- no prices, no categories, no images. Backed by
 * item-availability.ts, not admin/'s menuApi (BACK_OFFICE_ROLES only).
 */
export function AvailabilityPage() {
  const location = useActiveLocation();
  const queryClient = useQueryClient();

  const menu = useQuery({
    queryKey: ["menu-availability", location.id],
    queryFn: () => menuAvailabilityApi.list(location.id).then((response) => response.categories)
  });

  const toggle = useMutation({
    mutationFn: ({ itemId, available }: { itemId: string; available: boolean }) =>
      menuAvailabilityApi.setAvailability(itemId, available),
    onSuccess: (result) => {
      queryClient.setQueryData(
        ["menu-availability", location.id],
        (current: MenuCategoryTree[] | undefined) =>
          current?.map((category) => ({
            ...category,
            items: category.items.map((item) => (item.id === result.item.id ? result.item : item))
          }))
      );
    }
  });

  return (
    <>
      <PageHeader title="Disponibilidad" description="Marca lo que se agotó por hoy -- vuelve a activarlo cuando haya." />

      <ErrorNotice error={menu.error} title="No se pudo cargar el menú" />
      {menu.isPending ? <Loading label="Cargando menú…" /> : null}

      {menu.data && menu.data.length === 0 ? (
        <EmptyState title="Sin categorías">Todavía no hay nada en el menú.</EmptyState>
      ) : null}

      {menu.data?.map((category) => (
        <Panel key={category.id} title={category.name}>
          <div className="stack">
            {category.items.map((item) => (
              <div key={item.id} className="row" style={{ justifyContent: "space-between" }}>
                <span>
                  {item.name}
                  {!item.available ? (
                    <>
                      {" "}
                      <Badge tone="muted">Agotado</Badge>
                    </>
                  ) : null}
                </span>
                <Toggle
                  label={item.available ? "Disponible" : "Agotado"}
                  checked={item.available}
                  disabled={toggle.isPending}
                  onChange={(next) => toggle.mutate({ itemId: item.id, available: next })}
                />
              </div>
            ))}
          </div>
        </Panel>
      ))}

      <ErrorNotice error={toggle.error} title="No se pudo actualizar el artículo" />
    </>
  );
}
