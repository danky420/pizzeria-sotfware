import { Navigate, Outlet, useLocation } from "react-router-dom";
import { ErrorNotice, Loading, useAuth } from "@chesare/portal-shared";

/**
 * A session is all this app asks for. There is deliberately no role check:
 * `admin/` turns STAFF away at its door and points here, and here every role is
 * welcome (see `App`). The API still enforces the real boundary per route.
 *
 * `AuthProvider` already installs the 401 handler that clears the cached
 * session, so an expired cookie lands in the `!user` branch below and bounces
 * to /login on the next render — no second `setUnauthorizedHandler` here,
 * which would only overwrite that one.
 */
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
  // like a logout — bouncing to /login would hide the real problem, and during
  // service "the network is down" and "you were signed out" need different
  // reactions from whoever is holding the phone.
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
