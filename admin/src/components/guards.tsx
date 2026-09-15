import { useEffect, useState, type ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { ErrorNotice, Loading, useAuth } from "@chesare/portal-shared";
import { StaffAccountNotice } from "../features/auth/StaffAccountNotice";
import { isBackOffice } from "../lib/roles";

/**
 * Wraps the whole app, above the router: a STAFF account must not reach any
 * screen in here, whether it just signed in or arrived with a session already
 * in the cookie jar. It is turned away and signed back out, so no half-usable
 * admin session is left sitting in the browser.
 *
 * The API refuses STAFF on every non-orders route anyway (`requireRole`); this
 * only decides what the wrong audience sees instead of a broken back office.
 */
export function StaffAccountGate({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [rejected, setRejected] = useState(false);

  const isStaff = user !== null && !isBackOffice(user.role);

  useEffect(() => {
    if (!isStaff) return;
    // Local state, not derived from `user`: the logout below clears the user,
    // and the message has to outlive it.
    setRejected(true);
    void logout();
  }, [isStaff, logout]);

  if (rejected) {
    return <StaffAccountNotice onBack={() => setRejected(false)} />;
  }

  // Render nothing for the frame between spotting the staff session and the
  // effect running — otherwise the back office flashes on screen first.
  if (isStaff) return null;

  return <>{children}</>;
}

/**
 * Everything past here is back office. Reaching any route in this app already
 * implies an OWNER/MANAGER/SUPER_ADMIN session, since `StaffAccountGate` turns
 * STAFF away at the door — the role check below is the belt to that braces.
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

  if (!user || !isBackOffice(user.role)) {
    return <Navigate to="/login" replace state={{ from: routerLocation.pathname }} />;
  }

  return <Outlet />;
}
