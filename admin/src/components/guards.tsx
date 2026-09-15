import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../state/auth";
import { isBackOffice } from "../lib/roles";
import { ErrorNotice, Loading } from "./ui";

export function RequireAuth() {
  const { user, isLoading, error, refresh } = useAuth();
  const routerLocation = useLocation();

  if (isLoading) {
    return (
      <div className="centered-screen">
        <Loading label="Verificando sesión…" />
      </div>
    );
  }

  // A failed session check that is not a 401 (server down, 500) must not look
  // like a logout — bouncing to /login would hide the real problem.
  if (!user && error) {
    return (
      <div className="centered-screen">
        <div className="card">
          <ErrorNotice error={error} title="No se pudo verificar la sesión" />
          <button type="button" className="btn" onClick={() => void refresh()}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: routerLocation.pathname }} />;
  }

  return <Outlet />;
}

/**
 * UX only. STAFF is blocked from these routes by the API too (a real 403), so a
 * direct URL never becomes access — it just lands somewhere useful instead.
 */
export function RequireBackOffice() {
  const { user } = useAuth();
  if (!isBackOffice(user?.role)) {
    return <Navigate to="/orders" replace />;
  }
  return <Outlet />;
}
