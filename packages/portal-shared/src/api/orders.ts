import { api, query } from "./client";
import type { MenuCategoryTree, Order, OrderStatus, Pagination } from "../types";

export type EditOrderChangeInput =
  | { type: "set_quantity"; orderItemId: string; quantity: number }
  | {
      type: "add_item";
      menuItemId: string;
      sizeOptionId?: string;
      styleOptionId?: string;
      optionChoiceId?: string;
      quantity: number;
      notes?: string;
    };

export interface OrderListFilters {
  status?: OrderStatus | "";
  customerId?: string;
  from?: string;
  to?: string;
  q?: string;
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
        q: filters.q || undefined,
        page: filters.page,
        pageSize: filters.pageSize
      })}`
    ),
  get: (id: string) => api.get<{ order: Order }>(`/orders/${id}`),
  setStatus: (id: string, status: OrderStatus) =>
    api.patch<OrderStatusResult>(`/orders/${id}/status`, { status }),
  edit: (id: string, reason: string, changes: EditOrderChangeInput[]) =>
    api.post<{ order: Order }>(`/orders/${id}/edits`, { reason, changes }),
  // The menu data for the "add an item" picker -- ORDER_ROLES (STAFF
  // included), a different route than menuApi.tree, which is
  // BACK_OFFICE_ROLES only.
  menuForEditing: (locationId: string) =>
    api.get<{ categories: MenuCategoryTree[] }>(`/locations/${locationId}/orders/menu`)
};
