/**
 * The presentational primitives an orders queue needs — exactly the set
 * `features/orders/*` uses in `admin/`, nothing more. Admin-only pieces
 * (`SuccessNotice`, `Toggle`, `AppShell`, charts) stay in `admin/`.
 *
 * These are unstyled on their own: each consuming app supplies the CSS for the
 * class names used here — `loading`, `page-header`, `page-header-actions`,
 * `panel`, `panel-head`, `panel-actions`, `empty-state`, `empty-title`,
 * `notice` + `notice-pending` / `notice-error`, `field`, `field-label`,
 * `field-hint`, `badge` + `badge-{ok,warn,muted,info}` and `muted`.
 * `admin/src/styles.css` already defines all of them.
 */
import { useEffect, useState, type ReactNode } from "react";
import { ApiError } from "../api/client";

export function Loading({ label = "Cargando…" }: { label?: string }) {
  return (
    <div className="loading" role="status">
      {label}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {description ? <p className="muted">{description}</p> : null}
      </div>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  description,
  actions,
  children
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      {title || actions ? (
        <div className="panel-head">
          <div>
            {title ? <h2>{title}</h2> : null}
            {description ? <p className="muted">{description}</p> : null}
          </div>
          {actions ? <div className="panel-actions">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <p className="empty-title">{title}</p>
      {children ? <p className="muted">{children}</p> : null}
    </div>
  );
}

/**
 * A 501 is a phase that has not landed yet, not a failure the operator caused —
 * it reads as an empty state so nobody mistakes it for lost data.
 */
export function ErrorNotice({ error, title }: { error: unknown; title?: string }) {
  if (!error) return null;

  if (error instanceof ApiError && error.isNotImplemented) {
    return (
      <div className="notice notice-pending">
        <strong>Aún no disponible</strong>
        <p>{error.message}</p>
      </div>
    );
  }

  const message = error instanceof Error ? error.message : "Ocurrió un error";
  const fields = error instanceof ApiError ? error.fieldErrors : [];

  return (
    <div className="notice notice-error" role="alert">
      <strong>{title ?? "No se pudo completar la acción"}</strong>
      <p>{message}</p>
      {fields.length > 0 ? (
        <ul>
          {fields.map((detail, index) => (
            <li key={`${detail.path ?? index}`}>
              {detail.path ? <code>{detail.path}</code> : null} {detail.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function Field({
  label,
  hint,
  children
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function Badge({ tone, children }: { tone?: "ok" | "warn" | "muted" | "info"; children: ReactNode }) {
  return <span className={`badge badge-${tone ?? "muted"}`}>{children}</span>;
}

// TEMPORARY diagnostic, not for permanent use: four CSS fixes for the
// Desde/Hasta date-input overflow have shipped and all four failed on the
// reporter's real device, none of it reproducible in this environment
// (Chromium, real and emulated, never shows the bug). Rather than ship a
// fifth guess, this prints the actual on-screen measurements as visible
// text so a screenshot carries real numbers instead of a photo to infer
// from. Delete this function and its one call site in each page once the
// real culprit is found.
export function ToolbarDebug() {
  const [report, setReport] = useState<string>("measuring…");
  const enabled = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug");

  useEffect(() => {
    if (!enabled) return;
    function measure() {
      const lines: string[] = [];
      lines.push(`window.innerWidth=${window.innerWidth} devicePixelRatio=${window.devicePixelRatio}`);
      lines.push(`document.body.scrollWidth=${document.body.scrollWidth}`);
      const inputs = document.querySelectorAll<HTMLInputElement>('input[type="date"]');
      inputs.forEach((input, index) => {
        const field = input.closest<HTMLElement>(".field");
        const toolbar = input.closest<HTMLElement>(".toolbar");
        const panel = input.closest<HTMLElement>(".panel");
        const chain: [string, HTMLElement | null][] = [
          ["input", input],
          ["field", field],
          ["toolbar", toolbar],
          ["panel", panel]
        ];
        lines.push(`--- date input #${index} ---`);
        for (const [label, el] of chain) {
          if (!el) {
            lines.push(`${label}: (not found)`);
            continue;
          }
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          lines.push(
            `${label}: left=${r.left.toFixed(1)} right=${r.right.toFixed(1)} width=${r.width.toFixed(1)} ` +
              `| css width=${cs.width} display=${cs.display} overflow=${cs.overflow} boxSizing=${cs.boxSizing}`
          );
        }
      });
      setReport(lines.join("\n"));
    }
    measure();
    window.addEventListener("resize", measure);
    const timer = window.setInterval(measure, 1000);
    return () => {
      window.removeEventListener("resize", measure);
      window.clearInterval(timer);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <pre
      style={{
        background: "#000",
        color: "#0f0",
        fontSize: "10px",
        lineHeight: 1.4,
        padding: "8px",
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
        maxWidth: "100%",
        overflow: "hidden",
        border: "2px solid red"
      }}
    >
      {report}
    </pre>
  );
}
