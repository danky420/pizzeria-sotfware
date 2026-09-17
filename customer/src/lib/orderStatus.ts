import type { OrderStatus } from "../api/types";

// Mirrors packages/portal-shared/src/orders/status.ts's Spanish labels --
// customer/ doesn't depend on that package (different API, no auth), so this
// one small shared bit stays duplicated rather than pulling the package in.
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmado",
  PREPARING: "En preparación",
  READY: "Listo",
  COMPLETED: "Entregado",
  CANCELLED: "Cancelado"
};

/** The forward-progress steps a tracker can show. CANCELLED is a dead end,
 *  not a step, and is rendered separately. */
export const TRACKING_STEPS: OrderStatus[] = ["PENDING", "CONFIRMED", "PREPARING", "READY", "COMPLETED"];

/** One extra reassurance line per real status, shown above the tracker. */
export const STATUS_HELP: Partial<Record<OrderStatus, string>> = {
  PENDING: "Ya la recibimos, en un momento la confirmamos.",
  CONFIRMED: "Confirmamos tu pedido, la cocina está por empezar.",
  PREPARING: "La estamos preparando en el horno ahora mismo.",
  READY: "Está lista — de camino o esperando a que pases por ella.",
  COMPLETED: "Pedido entregado. ¡Buen provecho!"
};

export const FULFILLMENT_LABELS: Record<string, string> = {
  PICKUP: "Recoger",
  DELIVERY: "Domicilio",
  DINE_IN: "En el local"
};
