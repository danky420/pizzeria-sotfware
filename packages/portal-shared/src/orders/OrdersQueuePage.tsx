import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "../ui/index";
import { EmptyState, ErrorNotice, Field, Loading, PageHeader, Panel, ToolbarDebug } from "../ui/index";
import { formatDateTime, formatMoney } from "../format";
import { ordersApi } from "../api/orders";
import { FULFILLMENT_LABELS, ORDER_STATUSES, ORDER_STATUS_LABELS, orderStatusTone } from "./status";
import { zonedDayRange, zonedToday } from "../timezone";
import type { Location, OrderStatus } from "../types";

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 350;

/**
 * The one orders queue, rendered identically in `admin/` and `employee/` —
 * an owner and a counter employee talk to each other about the same screen,
 * so it needs to actually be the same screen, not two components that started
 * identical and drifted the first time one app got a fix the other didn't.
 * Each app supplies its own `location` (however it tracks the active branch)
 * and otherwise gets no say in how this renders.
 */
export function OrdersQueuePage({ location }: { location: Location }) {
  const navigate = useNavigate();
  const today = zonedToday(location.timezone).dateKey;

  const [status, setStatus] = useState<OrderStatus | "">("");
  // Defaults to today only — an unscoped queue on a shop that's been taking
  // orders for months is a scroll, not a queue. "Todas las fechas" is one
  // click away for when someone actually needs the history.
  const [desde, setDesde] = useState(today);
  const [hasta, setHasta] = useState(today);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  const from = desde ? zonedDayRange(desde, location.timezone).from : undefined;
  const to = hasta ? zonedDayRange(hasta, location.timezone).to : undefined;
  const isToday = desde === today && hasta === today;
  const isAllDates = desde === "" && hasta === "";

  const orders = useQuery({
    queryKey: ["orders", location.id, status, from, to, search, page],
    queryFn: () => ordersApi.list(location.id, { status, from, to, q: search, page, pageSize: PAGE_SIZE }),
    // Nobody behind the counter, or watching the back office, should have to
    // remember to refresh.
    refetchInterval: 10_000,
    placeholderData: keepPreviousData
  });

  const rows = orders.data?.orders ?? [];
  const pagination = orders.data?.pagination;

  return (
    <>
      <PageHeader
        title="Pedidos"
        description="Se actualiza solo cada 10 segundos."
        actions={
          <button type="button" className="btn btn-sm" onClick={() => void orders.refetch()}>
            Actualizar ahora
          </button>
        }
      />

      <Panel>
        <div className="toolbar">
          <Field label="Buscar">
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Cliente, teléfono o folio"
            />
          </Field>
          <Field label="Estado">
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as OrderStatus | "");
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              {ORDER_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {ORDER_STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Desde">
            <input
              type="date"
              value={desde}
              onChange={(event) => {
                setDesde(event.target.value);
                setPage(1);
              }}
            />
          </Field>
          <Field label="Hasta">
            <input
              type="date"
              value={hasta}
              onChange={(event) => {
                setHasta(event.target.value);
                setPage(1);
              }}
            />
          </Field>
          <button
            type="button"
            className={isToday ? "btn btn-sm btn-primary" : "btn btn-sm"}
            onClick={() => {
              setDesde(today);
              setHasta(today);
              setPage(1);
            }}
          >
            Hoy
          </button>
          <button
            type="button"
            className={isAllDates ? "btn btn-sm btn-primary" : "btn btn-sm"}
            onClick={() => {
              setDesde("");
              setHasta("");
              setPage(1);
            }}
          >
            Todas las fechas
          </button>
          {pagination ? (
            <span className="muted">
              {pagination.total} pedido{pagination.total === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>

        <ToolbarDebug />

        <ErrorNotice error={orders.error} title="No se pudieron cargar los pedidos" />

        {orders.isPending ? <Loading label="Cargando pedidos…" /> : null}

        {!orders.isPending && rows.length === 0 && !orders.error ? (
          <EmptyState title="Sin pedidos">
            {isToday && !search && !status
              ? "Todavía no entra ningún pedido hoy — aparecerá aquí en cuanto llegue."
              : "Ningún pedido coincide con lo que buscas."}
          </EmptyState>
        ) : null}

        {rows.length > 0 ? (
          <div className={orders.isFetching ? "table-wrap orders-table busy" : "table-wrap orders-table"}>
            <table>
              <thead>
                {/* Status and time sit where they're readable without
                    scrolling sideways on a phone; phone number — a tappable
                    link on the detail screen, not something scanned from the
                    queue — goes last. Below 640px this collapses into stacked
                    cards instead (see .orders-table in each app's
                    styles.css); data-label supplies the caption the (now
                    hidden) header row would have given it. */}
                <tr>
                  <th>#</th>
                  <th>Cliente</th>
                  <th>Estado</th>
                  <th>Hora</th>
                  <th>Entrega</th>
                  <th className="right">Total</th>
                  <th>Teléfono</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((order) => (
                  <tr
                    key={order.id}
                    className="row-link"
                    onClick={() => navigate(`/orders/${order.id}`)}
                  >
                    <td className="mono orders-primary" data-label="#">
                      {order.orderNumber}
                    </td>
                    <td data-label="Cliente">{order.customerName ?? "—"}</td>
                    <td data-label="Estado">
                      <Badge tone={orderStatusTone(order.status)}>
                        {ORDER_STATUS_LABELS[order.status]}
                      </Badge>
                    </td>
                    <td className="nowrap" data-label="Hora">
                      {formatDateTime(order.createdAt, location.timezone)}
                    </td>
                    <td data-label="Entrega">{FULFILLMENT_LABELS[order.fulfillmentType]}</td>
                    <td className="right nowrap" data-label="Total">
                      {formatMoney(order.total, location.currency)}
                    </td>
                    <td className="mono nowrap" data-label="Teléfono">
                      {order.customerPhone}
                    </td>
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
