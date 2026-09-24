/**
 * Back-office-only primitives. The ones the orders queue also needs (Loading,
 * PageHeader, Panel, EmptyState, ErrorNotice, Field, Badge, Toggle) moved to
 * `@chesare/portal-shared` so the employee app can use them too; this one is
 * only ever used by the settings forms, which live here.
 */
import type { ReactNode } from "react";

export function SuccessNotice({ children }: { children: ReactNode }) {
  return (
    <div className="notice notice-ok" role="status">
      {children}
    </div>
  );
}
