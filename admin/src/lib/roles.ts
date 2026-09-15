import type { AdminRole, FulfillmentType, OrderStatus } from "../api/types";

export const BACK_OFFICE_ROLES: AdminRole[] = ["SUPER_ADMIN", "OWNER", "MANAGER"];

export function isBackOffice(role: AdminRole | undefined): boolean {
  return role !== undefined && BACK_OFFICE_ROLES.includes(role);
}

export function homePathFor(role: AdminRole | undefined): string {
  return isBackOffice(role) ? "/" : "/orders";
}

export const ROLE_LABELS: Record<AdminRole, string> = {
  SUPER_ADMIN: "Super admin",
  OWNER: "Dueño",
  MANAGER: "Gerente",
  STAFF: "Empleado"
};

export const ORDER_STATUSES: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY",
  "COMPLETED",
  "CANCELLED"
];

/**
 * Mirrors ORDER_STATUS_FLOW in the API's order service. The server rejects a bad
 * transition with a 409 either way — this only keeps the UI from offering a
 * button that is guaranteed to fail.
 */
export const ORDER_STATUS_FLOW: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CONFIRMED", "PREPARING", "CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY", "CANCELLED"],
  READY: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: []
};

export const OPEN_ORDER_STATUSES: OrderStatus[] = ["PENDING", "CONFIRMED", "PREPARING", "READY"];

export function orderStatusTone(status: OrderStatus): "ok" | "warn" | "muted" | "info" {
  if (status === "PENDING") return "warn";
  if (status === "COMPLETED") return "ok";
  if (status === "CANCELLED") return "muted";
  return "info";
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Pendiente",
  CONFIRMED: "Confirmado",
  PREPARING: "En preparación",
  READY: "Listo",
  COMPLETED: "Entregado",
  CANCELLED: "Cancelado"
};

export const FULFILLMENT_LABELS: Record<FulfillmentType, string> = {
  PICKUP: "Recoger",
  DELIVERY: "Domicilio",
  DINE_IN: "En el local"
};
