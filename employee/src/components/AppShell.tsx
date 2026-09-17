import { Outlet } from "react-router-dom";
import { EmptyState, useAuth } from "@chesare/portal-shared";

/**
 * There is one section in this app, so there is no nav — just who is signed in
 * and the way out, matching `admin/`'s header for the same account (no branch
 * name printed there either; a single-location account naming its own branch
 * next to "Chesa're" is just the brand name twice).
 *
 * The branch itself still comes straight from the session: `GET /auth/me`
 * returns the location every non-SUPER_ADMIN account is pinned to, and the API
 * scopes orders to it regardless of what this app asks for — it's just not
 * displayed, the same as `admin/` doesn't display it for a single-location
 * OWNER/MANAGER.
 */
export function AppShell() {
  const { user, location, logout } = useAuth();

  return (
    <div className="shell">
      <header className="shell-top">
        <div className="brand">
          <img className="brand-mark" src="/marca.webp" alt="" width={32} height={32} />
          <span className="brand-word">Chesa're</span>
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
