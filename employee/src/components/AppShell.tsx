import { Outlet } from "react-router-dom";
import { EmptyState, useAuth } from "@chesare/portal-shared";

/**
 * There is one section in this app, so there is no nav — just who is signed in,
 * which branch their orders belong to, and the way out. `admin/`'s AppShell
 * (nav, branch switcher, location provider) has nothing to offer a queue.
 *
 * The branch comes straight from the session: `GET /auth/me` returns the
 * location every non-SUPER_ADMIN account is pinned to, and the API scopes
 * orders to it regardless of what this app asks for.
 */
export function AppShell() {
  const { user, location, logout } = useAuth();

  return (
    <div className="shell">
      <header className="shell-top">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span>Chesa're</span>
          {location ? <span className="muted shell-location">· {location.name}</span> : null}
        </div>

        <div className="shell-user">
          <span className="shell-user-name">{user?.name}</span>
          <button type="button" className="btn btn-quiet" onClick={() => void logout()}>
            Salir
          </button>
        </div>
      </header>

      <main className="shell-main">
        {location ? (
          <Outlet />
        ) : (
          // Only a SUPER_ADMIN has no location of its own; there is no branch
          // picker here to resolve that, and inventing one would be the first
          // step towards rebuilding the back office in the staff app.
          <EmptyState title="Sin sucursal asignada">
            Tu cuenta no está ligada a ninguna sucursal, así que no hay una cola de pedidos que
            mostrar. Entra con una cuenta de la sucursal, o usa la administración.
          </EmptyState>
        )}
      </main>
    </div>
  );
}
