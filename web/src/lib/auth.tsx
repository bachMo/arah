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

  // Les autres requêtes dépendent de la personne connectée (scores, favoris…) : on les recharge à chaque changement.
  // On ne vide jamais le cache entier : la requête ["me"] doit rester celle qu'observe ce composant.
  const setUser = useCallback(
    (user: User | null) => {
      queryClient.setQueryData(["me"], user);
      void queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== "me" });
    },
    [queryClient],
  );

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const logout = useCallback(async () => {
    await api.post("/auth/logout").catch(() => undefined);
    queryClient.setQueryData(["me"], null);
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "me" });
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

/** Page d'accueil d'un utilisateur connecté, selon son profil. */
export function homePath(user: Pick<User, "has_profile" | "profile_kind"> | null): string {
  if (!user || !user.has_profile) return "/bienvenue";
  return user.profile_kind === "recruiter" ? "/mes-offres" : "/radar";
}
