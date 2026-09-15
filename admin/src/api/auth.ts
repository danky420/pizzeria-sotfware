import { api } from "./client";
import type { Location, SessionUser } from "./types";

export interface MeResponse {
  user: SessionUser;
  location: Location | null;
}

export const authApi = {
  me: () => api.get<MeResponse>("/auth/me"),
  login: (email: string, password: string) =>
    api.post<{ user: SessionUser }>("/auth/login", { email, password }),
  logout: () => api.post<{ ok: true }>("/auth/logout")
};
