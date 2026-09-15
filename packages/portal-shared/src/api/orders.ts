import { api, query } from "./client";
import type { Order, OrderStatus, Pagination } from "../types";

export interface OrderListFilters {
  status?: OrderStatus | "";
  customerId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface OrderListPage {
  orders: Order[];
  pagination: Pagination;
}

export interface OrderStatusResult {
  order: Order;
  allowedNext: OrderStatus[];
}

export const ordersApi = {
  list: (locationId: string, filters: OrderListFilters = {}) =>
    api.get<OrderListPage>(
      `/locations/${locationId}/orders${query({
        status: filters.status || undefined,
        customerId: filters.customerId,
        from: filters.from,
        to: filters.to,
        page: filters.page,
        pageSize: filters.pageSize
      })}`
    ),
  get: (id: string) => api.get<{ order: Order }>(`/orders/${id}`),
  setStatus: (id: string, status: OrderStatus) =>
    api.patch<OrderStatusResult>(`/orders/${id}/status`, { status })
};
