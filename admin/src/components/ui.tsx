/**
 * Back-office-only primitives. The ones the orders queue also needs (Loading,
 * PageHeader, Panel, EmptyState, ErrorNotice, Field, Badge) moved to
 * `@chesare/portal-shared` so the employee app can use them too; these two are
 * only ever used by the settings and menu forms, which live here.
 */
import type { ReactNode } from "react";

export function SuccessNotice({ children }: { children: ReactNode }) {
  return (
    <div className="notice notice-ok" role="status">
      {children}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
