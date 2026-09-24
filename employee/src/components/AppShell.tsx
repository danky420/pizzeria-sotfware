import { useEffect } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { EmptyState, useAuth } from "@chesare/portal-shared";

/**
 * Two sections now (queue, availability), so a small nav earns its place --
 * still nothing like admin/'s, since there's only ever these two links.
 *
 * The branch itself still comes straight from the session: `GET /auth/me`
 * returns the location every non-SUPER_ADMIN account is pinned to, and the API
 * scopes orders to it regardless of what this app asks for — it's just not
 * displayed, the same as `admin/` doesn't display it for a single-location
 * OWNER/MANAGER.
 */
export function AppShell() {
  const { user, location, logout } = useAuth();

  // Tenant name/logo only -- same neutral-palette rule as admin/'s AppShell
  // (docs/multi-tenant-branding-plan.md).
  useEffect(() => {
    if (location) document.title = `${location.name} · Pedidos`;
  }, [location]);

  return (
    <div className="shell">
      <header className="shell-top">
        <div className="brand">
          {location?.logoUrl ? (
            <img className="brand-mark" src={location.logoUrl} alt="" width={32} height={32} />
          ) : null}
          <span className="brand-word">{location?.name ?? ""}</span>
        </div>

        <nav className="shell-nav">
          <NavLink to="/orders" className={({ isActive }) => (isActive ? "nav-link nav-link-active" : "nav-link")}>
            Pedidos
          </NavLink>
          <NavLink to="/menu" className={({ isActive }) => (isActive ? "nav-link nav-link-active" : "nav-link")}>
            Menú
          </NavLink>
        </nav>

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
