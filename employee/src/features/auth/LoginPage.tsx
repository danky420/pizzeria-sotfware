import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ApiError, authApi, Field, Loading, useAuth } from "@chesare/portal-shared";

function lockMinutes(error: ApiError): number | null {
  const details = error.details as { retryAfterSeconds?: number } | undefined;
  if (!details?.retryAfterSeconds) return null;
  return Math.max(1, Math.ceil(details.retryAfterSeconds / 60));
}

function LoginError({ error }: { error: unknown }) {
  if (!(error instanceof ApiError)) {
    return error ? (
      <div className="notice notice-error" role="alert">
        <p>No se pudo iniciar sesión. Intenta de nuevo.</p>
      </div>
    ) : null;
  }

  if (error.code === "ACCOUNT_LOCKED") {
    const minutes = lockMinutes(error);
    return (
      <div className="notice notice-error" role="alert">
        <strong>Cuenta bloqueada</strong>
        <p>
          Demasiados intentos fallidos.{" "}
          {minutes
            ? `Vuelve a intentar en ${minutes} minuto${minutes === 1 ? "" : "s"}.`
            : error.message}
        </p>
      </div>
    );
  }

  if (error.code === "RATE_LIMITED") {
    return (
      <div className="notice notice-error" role="alert">
        <strong>Demasiados intentos</strong>
        <p>{error.message}</p>
      </div>
    );
  }

  return (
    <div className="notice notice-error" role="alert">
      <p>{error.message}</p>
    </div>
  );
}

/**
 * The same form as `admin/`'s, minus the role verdict: whatever role comes back
 * goes straight to the queue. This is where a STAFF account that tried the back
 * office is sent, and where an owner covering the counter signs in too.
 */
export function LoginPage() {
  const { user, isLoading, refresh } = useAuth();
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const login = useMutation({
    mutationFn: () => authApi.login(email.trim(), password),
    onSuccess: async () => {
      await refresh();
      const from = (routerLocation.state as { from?: string } | null)?.from;
      navigate(from && from !== "/login" ? from : "/orders", { replace: true });
    }
  });

  if (isLoading) {
    return (
      <div className="centered-screen">
        <Loading label="Verificando sesión…" />
      </div>
    );
  }

  if (user) return <Navigate to="/orders" replace />;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate();
  };

  return (
    <div className="centered-screen">
      <form className="card login-card" onSubmit={onSubmit}>
        {/* No session yet, so no tenant to name here -- AppShell shows the
            signed-in tenant's own name and logo once authenticated
            (docs/multi-tenant-branding-plan.md). */}
        <h1>Pedidos</h1>
        <p className="muted">Entra con tu cuenta del equipo.</p>

        <LoginError error={login.error} />

        <Field label="Correo">
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        <Field label="Contraseña">
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>

        <button type="submit" className="btn btn-primary" disabled={login.isPending}>
          {login.isPending ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
