import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ordersApi } from "../../api/orders";
import type { OrderStatus } from "../../api/types";
import { Badge, EmptyState, ErrorNotice, Field, Loading, PageHeader, Panel } from "../../components/ui";
import { formatDateTime, formatMoney } from "../../lib/format";
import {
  FULFILLMENT_LABELS,
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  orderStatusTone
} from "../../lib/roles";
import { useActiveLocation, useLocationId } from "../../state/location";

const PAGE_SIZE = 25;

export function OrdersQueuePage() {
  const locationId = useLocationId();
  const { location } = useActiveLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [page, setPage] = useState(1);

  const orders = useQuery({
    queryKey: ["orders", locationId, status, page],
    queryFn: () => ordersApi.list(locationId, { status, page, pageSize: PAGE_SIZE }),
    // The queue is the one screen that must not need a manual refresh: a staff
    // account watches it during service and new orders have to surface on their
    // own. 12s sits inside the plan's 10-15s window.
    refetchInterval: 12_000,
    placeholderData: keepPreviousData
  });

  const rows = orders.data?.orders ?? [];
  const pagination = orders.data?.pagination;

  return (
    <>
      <PageHeader
        title="Pedidos"
        description="Se actualiza solo cada 12 segundos."
        actions={
          <button type="button" className="btn btn-sm" onClick={() => void orders.refetch()}>
            Actualizar ahora
          </button>
        }
      />

      <Panel>
        <div className="toolbar">
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
          {pagination ? (
            <span className="muted">
              {pagination.total} pedido{pagination.total === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>

        <ErrorNotice error={orders.error} title="No se pudieron cargar los pedidos" />

        {orders.isPending ? <Loading label="Cargando pedidos…" /> : null}

        {!orders.isPending && rows.length === 0 && !orders.error ? (
          <EmptyState title="Sin pedidos">
            Cuando entre un pedido nuevo aparecerá aquí automáticamente.
          </EmptyState>
        ) : null}

        {rows.length > 0 ? (
          <div className={orders.isFetching ? "table-wrap busy" : "table-wrap"}>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Cliente</th>
                  <th>Teléfono</th>
                  <th>Entrega</th>
                  <th className="right">Total</th>
                  <th>Estado</th>
                  <th>Hora</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((order) => (
                  <tr
                    key={order.id}
                    className="row-link"
                    onClick={() => navigate(`/orders/${order.id}`)}
                  >
                    <td className="mono">{order.orderNumber}</td>
                    <td>{order.customerName ?? "—"}</td>
                    <td className="mono nowrap">{order.customerPhone}</td>
                    <td>{FULFILLMENT_LABELS[order.fulfillmentType]}</td>
                    <td className="right nowrap">{formatMoney(order.total, location?.currency)}</td>
                    <td>
                      <Badge tone={orderStatusTone(order.status)}>
                        {ORDER_STATUS_LABELS[order.status]}
                      </Badge>
                    </td>
                    <td className="nowrap">{formatDateTime(order.createdAt, location?.timezone)}</td>
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
