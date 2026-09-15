import { api, query, type Customer, type Order, type Pagination } from "@chesare/portal-shared";

export interface CustomerListFilters {
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface CustomerListPage {
  customers: Customer[];
  pagination: Pagination;
}

export interface CustomerDetail {
  customer: Customer;
  orders: Order[];
}

export const customersApi = {
  list: (locationId: string, filters: CustomerListFilters = {}) =>
    api.get<CustomerListPage>(
      `/locations/${locationId}/customers${query({
        search: filters.search,
        page: filters.page,
        pageSize: filters.pageSize
      })}`
    ),
  get: (id: string, orderLimit = 25) =>
    api.get<CustomerDetail>(`/customers/${id}${query({ orderLimit })}`)
};
