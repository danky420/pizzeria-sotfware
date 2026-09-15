import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { customersApi } from "../../api/customers";
import { EmptyState, ErrorNotice, Field, Loading, PageHeader, Panel } from "../../components/ui";
import { formatDateTime, formatMoney, formatNumber } from "../../lib/format";
import { useActiveLocation, useLocationId } from "../../state/location";

const PAGE_SIZE = 25;

export function CustomersPage() {
  const locationId = useLocationId();
  const { location } = useActiveLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const customers = useQuery({
    queryKey: ["customers", locationId, debounced, page],
    queryFn: () =>
      customersApi.list(locationId, {
        search: debounced === "" ? undefined : debounced,
        page,
        pageSize: PAGE_SIZE
      }),
    placeholderData: keepPreviousData
  });

  const rows = customers.data?.customers ?? [];
  const pagination = customers.data?.pagination;

  return (
    <>
      <PageHeader title="Clientes" description="Historial por teléfono; el más reciente primero." />

      <Panel>
        <div className="toolbar">
          <Field label="Buscar" hint="Por nombre o teléfono">
            <input
              value={search}
              placeholder="Nombre o 272…"
              onChange={(event) => setSearch(event.target.value)}
            />
          </Field>
          {pagination ? (
            <span className="muted">
              {pagination.total} cliente{pagination.total === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>

        <ErrorNotice error={customers.error} title="No se pudieron cargar los clientes" />
        {customers.isPending ? <Loading /> : null}

        {!customers.isPending && rows.length === 0 && !customers.error ? (
          <EmptyState title="Sin clientes">
            {debounced === "" ? "Todavía no hay pedidos registrados." : "Nada coincide con esa búsqueda."}
          </EmptyState>
        ) : null}

        {rows.length > 0 ? (
          <div className={customers.isFetching ? "table-wrap busy" : "table-wrap"}>
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Teléfono</th>
                  <th className="right">Pedidos</th>
                  <th className="right">Gastado</th>
                  <th>Último pedido</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((customer) => (
                  <tr
                    key={customer.id}
                    className="row-link"
                    onClick={() => navigate(`/customers/${customer.id}`)}
                  >
                    <td>{customer.name ?? "—"}</td>
                    <td className="mono nowrap">{customer.phone}</td>
                    <td className="right">{formatNumber(customer.orderCount)}</td>
                    <td className="right nowrap">{formatMoney(customer.totalSpent, location?.currency)}</td>
                    <td className="nowrap">{formatDateTime(customer.lastOrderAt, location?.timezone)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {pagination && pagination.pageCount > 1 ? (
          <div className="pagination">
            <button
              type="button"
              className="btn btn-sm"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              Anterior
            </button>
            <span className="muted">
              {pagination.page} / {pagination.pageCount}
            </span>
            <button
              type="button"
              className="btn btn-sm"
              disabled={page >= pagination.pageCount}
              onClick={() => setPage((current) => current + 1)}
            >
              Siguiente
            </button>
          </div>
        ) : null}
      </Panel>
    </>
  );
}
