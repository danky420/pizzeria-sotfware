import { useAuth, type Location } from "@chesare/portal-shared";

/**
 * The branch this session works in. `admin/` needs a whole provider for this
 * because a SUPER_ADMIN may switch branches there; here the session's own
 * location is the only answer, and `AppShell` has already refused to render the
 * queue without one — so this cannot throw in practice.
 */
export function useActiveLocation(): Location {
  const { location } = useAuth();
  if (!location) throw new Error("No hay sucursal activa");
  return location;
}
