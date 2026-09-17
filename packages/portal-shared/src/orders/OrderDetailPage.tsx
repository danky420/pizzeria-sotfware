import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Badge, EmptyState, ErrorNotice, Loading, PageHeader, Panel } from "../ui/index";
import { formatDateTime, formatMoney } from "../format";
import { ordersApi } from "../api/orders";
import { FULFILLMENT_LABELS, ORDER_STATUS_FLOW, ORDER_STATUS_LABELS, orderStatusTone } from "./status";
import type { Location, OrderStatus } from "../types";

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

  return (
    <>
      <PageHeader
        title={`Pedido #${data.orderNumber}`}
        description={formatDateTime(data.createdAt, timezone)}
        actions={
          <button type="button" className="btn" onClick={() => navigate("/orders")}>
            Volver
          </button>
        }
      />

      <Panel
        title="Estado"
        actions={<Badge tone={orderStatusTone(data.status)}>{ORDER_STATUS_LABELS[data.status]}</Badge>}
      >
        <ErrorNotice error={setStatus.error} title="No se pudo cambiar el estado" />
        {nextStatuses.length === 0 ? (
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
    </>
  );
}
