import { api, type AdminRole, type AdminUser } from "@chesare/portal-shared";

export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
  role: AdminRole;
}

export interface UpdateUserInput {
  name?: string;
  password?: string;
  role?: AdminRole;
  active?: boolean;
}

export const usersApi = {
  list: (locationId: string) => api.get<{ users: AdminUser[] }>(`/locations/${locationId}/users`),
  create: (locationId: string, input: CreateUserInput) =>
    api.post<{ user: AdminUser }>(`/locations/${locationId}/users`, input),
  update: (id: string, input: UpdateUserInput) => api.patch<{ user: AdminUser }>(`/users/${id}`, input),
  remove: (id: string) => api.del<{ ok: true }>(`/users/${id}`)
};
