import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { customersApi } from "../../api/customers";
import {
  Badge,
  EmptyState,
  ErrorNotice,
  FULFILLMENT_LABELS,
  Loading,
  ORDER_STATUS_LABELS,
  orderStatusTone,
  PageHeader,
  Panel
} from "@chesare/portal-shared";
import { StatTile } from "../../components/charts";
import { formatDateTime, formatMoney, formatNumber } from "../../lib/format";
import { useActiveLocation } from "../../state/location";

export function CustomerDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { location } = useActiveLocation();

  const detail = useQuery({
    queryKey: ["customer", id],
    queryFn: () => customersApi.get(id),
    enabled: id !== ""
  });

  if (detail.isPending) return <Loading label="Cargando cliente…" />;

  if (detail.error || !detail.data) {
    return (
      <>
        <PageHeader title="Cliente" />
        <Panel>
          <ErrorNotice error={detail.error} title="No se pudo cargar el cliente" />
          <Link className="btn" to="/customers">
            Volver a clientes
          </Link>
        </Panel>
      </>
    );
  }

  const { customer, orders } = detail.data;
  const currency = location?.currency;
  const timezone = location?.timezone;

  return (
    <>
      <PageHeader
        title={customer.name ?? customer.phone}
        description={customer.name ? customer.phone : undefined}
        actions={
          <Link className="btn" to="/customers">
            Volver
          </Link>
        }
      />

      <div className="stat-row">
        <StatTile label="Pedidos" value={formatNumber(customer.orderCount)} />
        <StatTile label="Total gastado" value={formatMoney(customer.totalSpent, currency)} />
        <StatTile label="Último pedido" value={formatDateTime(customer.lastOrderAt, timezone)} />
      </div>

      {customer.addressText ? (
        <Panel title="Dirección guardada">
          <p>{customer.addressText}</p>
        </Panel>
      ) : null}

      <Panel title="Historial de pedidos" description={`Últimos ${orders.length} pedidos.`}>
        {orders.length === 0 ? (
          <EmptyState title="Sin pedidos" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Fecha</th>
                  <th>Entrega</th>
                  <th>Artículos</th>
                  <th className="right">Total</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className="row-link"
                    onClick={() => navigate(`/orders/${order.id}`)}
                  >
                    <td className="mono">{order.orderNumber}</td>
                    <td className="nowrap">{formatDateTime(order.createdAt, timezone)}</td>
                    <td>{FULFILLMENT_LABELS[order.fulfillmentType]}</td>
                    <td className="muted">
                      {order.items.map((item) => `${item.quantity}× ${item.name}`).join(", ") || "—"}
                    </td>
                    <td className="right nowrap">{formatMoney(order.total, currency)}</td>
                    <td>
                      <Badge tone={orderStatusTone(order.status)}>
                        {ORDER_STATUS_LABELS[order.status]}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
