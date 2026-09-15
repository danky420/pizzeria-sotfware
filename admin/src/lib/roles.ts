import type { AdminRole } from "@chesare/portal-shared";

/**
 * Who this app is for. STAFF is deliberately absent: staff accounts use the
 * separate employee app and are turned away at `admin/`'s login (see
 * `components/guards.tsx`), not given a reduced view in here.
 *
 * The API enforces the same split per-route — this is the UX half of it.
 */
export const BACK_OFFICE_ROLES: AdminRole[] = ["SUPER_ADMIN", "OWNER", "MANAGER"];

export function isBackOffice(role: AdminRole | undefined): boolean {
  return role !== undefined && BACK_OFFICE_ROLES.includes(role);
}

/**
 * Where a signed-in user lands. Every role that can be in here at all gets the
 * dashboard; anything else has no home in this app and is sent back to the
 * login screen, which is what shows the "use the employee app" message.
 */
export function homePathFor(role: AdminRole | undefined): string {
  return isBackOffice(role) ? "/" : "/login";
}

export const ROLE_LABELS: Record<AdminRole, string> = {
  SUPER_ADMIN: "Super admin",
  OWNER: "Dueño",
  MANAGER: "Gerente",
  STAFF: "Empleado"
};
