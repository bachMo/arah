import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { homePath, useAuth } from "../lib/auth";

export function RequireAuth({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="page container" aria-busy>
        <div className="skeleton" style={{ height: 48, width: 280, marginBottom: 24 }} />
        <div className="skeleton" style={{ height: 320 }} />
      </div>
    );
  }
  if (!user) return <Navigate to={`/connexion?suite=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (admin && !user.is_admin) return <Navigate to={homePath(user)} replace />;
  return <>{children}</>;
}

export function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to={homePath(user)} replace />;
  return <>{children}</>;
}

/** Le radar n'a pas de sens pour un recruteur : il est renvoyé vers ses offres. */
export function NotForRecruiters({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user?.profile_kind === "recruiter") return <Navigate to="/mes-offres" replace />;
  return <>{children}</>;
}
