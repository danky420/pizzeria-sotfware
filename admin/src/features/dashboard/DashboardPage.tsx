import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { analyticsApi } from "../../api/analytics";
import { ordersApi } from "../../api/orders";
import type { Order, OrderStatus } from "../../api/types";
import { ColumnChart, HorizontalBarChart, StatTile, type ChartPoint } from "../../components/charts";
import { ErrorNotice, Field, Loading, PageHeader, Panel } from "../../components/ui";
import {
  dayKeyInZone,
  eachDayKey,
  formatMoney,
  formatNumber,
  shortDayLabel,
  todayIsoDate
} from "../../lib/format";
import { ORDER_STATUS_LABELS } from "../../lib/roles";
import { useActiveLocation, useLocationId } from "../../state/location";

const ORDERS_PAGE_SIZE = 100;
const MAX_ORDER_PAGES = 5;

/**
 * The API has no revenue-by-day endpoint — `analytics/summary` returns totals and
 * a per-status breakdown, nothing time-bucketed. The daily series is therefore
 * folded here from the orders the same range returns, using the same status rule
 * the server counts revenue by, so the chart and the tiles can never disagree.
 */
async function loadOrdersInRange(
  locationId: string,
  from: string,
  to: string
): Promise<{ orders: Order[]; truncated: boolean }> {
  const collected: Order[] = [];
  let page = 1;
  let pageCount = 1;

  while (page <= pageCount && page <= MAX_ORDER_PAGES) {
    const result = await ordersApi.list(locationId, { from, to, page, pageSize: ORDERS_PAGE_SIZE });
    collected.push(...result.orders);
    pageCount = result.pagination.pageCount;
    page += 1;
  }

  return { orders: collected, truncated: pageCount > MAX_ORDER_PAGES };
}

export function DashboardPage() {
  const locationId = useLocationId();
  const { location } = useActiveLocation();
  const [from, setFrom] = useState(() => todayIsoDate(-29));
  const [to, setTo] = useState(() => todayIsoDate());

  const rangeIsValid = from !== "" && to !== "" && from <= to;
  const range = { from, to };

  const summary = useQuery({
    queryKey: ["analytics", "summary", locationId, from, to],
    queryFn: () => analyticsApi.summary(locationId, range),
    enabled: rangeIsValid,
    placeholderData: keepPreviousData
  });

  const topItems = useQuery({
    queryKey: ["analytics", "top-items", locationId, from, to],
    queryFn: () => analyticsApi.topItems(locationId, range, 8),
    enabled: rangeIsValid,
    placeholderData: keepPreviousData
  });

  const orders = useQuery({
    queryKey: ["analytics", "orders-series", locationId, from, to],
    queryFn: () => loadOrdersInRange(locationId, from, to),
    enabled: rangeIsValid,
    placeholderData: keepPreviousData
  });

  const currency = location?.currency;
  const timezone = location?.timezone;
  const counted: OrderStatus[] = summary.data?.countedStatuses ?? [];

  const revenueByDay = useMemo<ChartPoint[]>(() => {
    if (!orders.data) return [];
    const buckets = new Map<string, number>();
    for (const key of eachDayKey(from, to)) buckets.set(key, 0);

    for (const order of orders.data.orders) {
      if (counted.length > 0 && !counted.includes(order.status)) continue;
      const key = dayKeyInZone(order.createdAt, timezone);
      if (!buckets.has(key)) continue;
      buckets.set(key, (buckets.get(key) ?? 0) + order.total);
    }

    return [...buckets.entries()].map(([key, value]) => ({
      key,
      label: shortDayLabel(key),
      tooltipLabel: key,
      value: Math.round(value * 100) / 100
    }));
  }, [orders.data, from, to, timezone, counted]);

  const topItemPoints = useMemo<ChartPoint[]>(
    () =>
      (topItems.data ?? []).map((item) => ({
        key: item.menuItemId ?? item.name,
        label: item.name,
        value: item.quantity
      })),
    [topItems.data]
  );

  const setPreset = (days: number) => {
    setFrom(todayIsoDate(-(days - 1)));
    setTo(todayIsoDate());
  };

  return (
    <>
      <PageHeader title="Resumen" description={location?.name} />

      <Panel>
        <div className="toolbar">
          <Field label="Desde">
            <input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} />
          </Field>
          <Field label="Hasta">
            <input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} />
          </Field>
          <div className="row">
            <button type="button" className="btn btn-sm" onClick={() => setPreset(7)}>
              7 días
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setPreset(30)}>
              30 días
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setPreset(90)}>
              90 días
            </button>
          </div>
        </div>
        {!rangeIsValid ? (
          <p className="notice notice-error">La fecha «desde» debe ser anterior o igual a «hasta».</p>
        ) : null}
      </Panel>

      <ErrorNotice error={summary.error} title="No se pudo cargar el resumen" />

      {summary.isPending && rangeIsValid ? <Loading label="Calculando…" /> : null}

      {summary.data ? (
        <div className={summary.isFetching ? "stat-row busy" : "stat-row"}>
          <StatTile
            hero
            label="Ingresos"
            value={formatMoney(summary.data.revenue, currency)}
            hint={`${counted.length} estados contados`}
          />
          <StatTile label="Pedidos" value={formatNumber(summary.data.orderCount)} />
          <StatTile label="Ticket promedio" value={formatMoney(summary.data.averageOrderValue, currency)} />
          <StatTile label="Descuentos" value={formatMoney(summary.data.discountTotal, currency)} />
          <StatTile
            label="Cancelados"
            value={formatNumber(summary.data.cancelledCount)}
            hint="No cuentan como ingreso"
          />
        </div>
      ) : null}

      <Panel
        title="Ingresos por día"
        description="Suma de los pedidos no cancelados de cada día, en la zona horaria de la sucursal."
      >
        <ErrorNotice error={orders.error} title="No se pudo construir la serie diaria" />
        {orders.isPending ? (
          <Loading />
        ) : (
          <div className={orders.isFetching ? "busy" : undefined}>
            <ColumnChart points={revenueByDay} format={(value) => formatMoney(value, currency)} />
          </div>
        )}
        {orders.data?.truncated ? (
          <p className="muted">
            El rango tiene más de {ORDERS_PAGE_SIZE * MAX_ORDER_PAGES} pedidos; la gráfica diaria muestra
            solo los más recientes. Las cifras de arriba sí cubren el rango completo.
          </p>
        ) : null}
      </Panel>

      <Panel title="Más vendidos" description="Por unidades vendidas en el rango.">
        <ErrorNotice error={topItems.error} title="No se pudieron cargar los productos" />
        {topItems.isPending ? (
          <Loading />
        ) : (
          <div className={topItems.isFetching ? "busy" : undefined}>
            <HorizontalBarChart points={topItemPoints} format={(value) => formatNumber(value)} />
          </div>
        )}

        {topItems.data && topItems.data.length > 0 ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="right">Unidades</th>
                  <th className="right">Ingresos</th>
                </tr>
              </thead>
              <tbody>
                {topItems.data.map((item) => (
                  <tr key={item.menuItemId ?? item.name}>
                    <td>{item.name}</td>
                    <td className="right">{formatNumber(item.quantity)}</td>
                    <td className="right nowrap">{formatMoney(item.revenue, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Panel>

      {summary.data && summary.data.byStatus.length > 0 ? (
        <Panel title="Pedidos por estado">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Estado</th>
                  <th className="right">Pedidos</th>
                  <th className="right">Importe</th>
                </tr>
              </thead>
              <tbody>
                {summary.data.byStatus.map((row) => (
                  <tr key={row.status}>
                    <td>{ORDER_STATUS_LABELS[row.status]}</td>
                    <td className="right">{formatNumber(row.orderCount)}</td>
                    <td className="right nowrap">{formatMoney(row.revenue, currency)}</td>
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
