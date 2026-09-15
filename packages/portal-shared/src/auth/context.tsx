import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";
import { authApi, type MeResponse } from "../api/auth";
import { ApiError, setUnauthorizedHandler } from "../api/client";
import type { Location, SessionUser } from "../types";

export const ME_QUERY_KEY = ["auth", "me"] as const;

interface AuthValue {
  user: SessionUser | null;
  location: Location | null;
  isLoading: boolean;
  error: unknown;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

async function fetchMe(): Promise<MeResponse | null> {
  try {
    return await authApi.me();
  } catch (error) {
    // No session is a normal state for this one call, not a failure to report.
    if (error instanceof ApiError && error.isUnauthorized) return null;
    throw error;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const me = useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: fetchMe,
    retry: false,
    staleTime: 60_000
  });

  useEffect(() => {
    setUnauthorizedHandler(() => {
      queryClient.setQueryData(ME_QUERY_KEY, null);
    });
    return () => setUnauthorizedHandler(null);
  }, [queryClient]);

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
  }, [queryClient]);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } finally {
      queryClient.setQueryData(ME_QUERY_KEY, null);
      queryClient.removeQueries({ predicate: (item) => item.queryKey[0] !== "auth" });
    }
  }, [queryClient]);

  const value = useMemo<AuthValue>(
    () => ({
      user: me.data?.user ?? null,
      location: me.data?.location ?? null,
      isLoading: me.isPending,
      error: me.error,
      refresh,
      logout
    }),
    [me.data, me.isPending, me.error, refresh, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

export function useSessionUser(): SessionUser {
  const { user } = useAuth();
  if (!user) throw new Error("No hay sesión activa");
  return user;
}
