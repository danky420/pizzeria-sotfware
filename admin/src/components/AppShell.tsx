import { NavLink, Outlet } from "react-router-dom";
import { EmptyState, ErrorNotice, Loading, useAuth } from "@chesare/portal-shared";
import { ActiveLocationProvider, useActiveLocation } from "../state/location";
import { ROLE_LABELS } from "../lib/roles";

// Only back-office roles reach this shell, so there is one nav. Staff get the
// orders queue in the employee app instead.
const NAV = [
  { to: "/", label: "Resumen", end: true },
  { to: "/orders", label: "Pedidos", end: false },
  { to: "/menu", label: "Menú", end: false },
  { to: "/promotions", label: "Promociones", end: false },
  { to: "/customers", label: "Clientes", end: false },
  { to: "/settings/hours", label: "Horarios", end: false },
  { to: "/settings/users", label: "Usuarios", end: false },
  { to: "/settings/location", label: "Sucursal", end: false }
];

function Shell() {
  const { user, logout } = useAuth();
  const { location, locations, canSwitch, setLocationId, isLoading, error } = useActiveLocation();

  return (
    <div className="shell">
      <header className="shell-top">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span>Chesa're</span>
        </div>

        <nav className="shell-nav">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => (isActive ? "nav-link nav-link-active" : "nav-link")}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="shell-user">
          {canSwitch ? (
            <select
              aria-label="Sucursal"
              value={location?.id ?? ""}
              onChange={(event) => setLocationId(event.target.value)}
            >
              {locations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          ) : null}
          <span className="shell-user-name">
            {user?.name}
            <span className="muted"> · {user ? ROLE_LABELS[user.role] : ""}</span>
          </span>
          <button type="button" className="btn btn-quiet" onClick={() => void logout()}>
            Salir
          </button>
        </div>
      </header>

      <main className="shell-main">
        {isLoading ? <Loading /> : null}
        {error ? <ErrorNotice error={error} /> : null}
        {!isLoading && !error && !location ? (
          <EmptyState title="Sin sucursal asignada">
            Tu cuenta no está ligada a ninguna sucursal. Pide a un administrador que te asigne una.
          </EmptyState>
        ) : null}
        {location ? <Outlet /> : null}
      </main>
    </div>
  );
}

export function AppShell() {
  return (
    <ActiveLocationProvider>
      <Shell />
    </ActiveLocationProvider>
  );
}
