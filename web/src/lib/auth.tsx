import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { api, ApiError } from "./api";
import type { User } from "./types";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchMe(): Promise<User | null> {
  try {
    return await api.get<User | null>("/auth/session");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useQuery({ queryKey: ["me"], queryFn: fetchMe, staleTime: 60_000, retry: 1 });

  const setUser = useCallback(
    (user: User | null) => {
      queryClient.setQueryData(["me"], user);
    },
    [queryClient],
  );

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const logout = useCallback(async () => {
    await api.post("/auth/logout").catch(() => undefined);
    queryClient.clear();
    queryClient.setQueryData(["me"], null);
  }, [queryClient]);

  const value = useMemo(
    () => ({ user: data ?? null, loading: isLoading, setUser, refresh, logout }),
    [data, isLoading, setUser, refresh, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans AuthProvider");
  return ctx;
}
