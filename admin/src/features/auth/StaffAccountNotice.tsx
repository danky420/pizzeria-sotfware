/**
 * Where a STAFF account lands if it signs in here. Staff work the orders queue
 * in the employee app; this back office has nothing for them, so rather than
 * show half an app we say so and point at the right door. The session is closed
 * on the way in (see `StaffAccountGate`) so nothing of theirs stays signed in.
 */

// Production serves the employee app from /staff on the same origin as the API
// and this app. Local dev overrides it (employee/ runs its own Vite server).
const EMPLOYEE_APP_URL = (import.meta.env.VITE_EMPLOYEE_APP_URL ?? "").trim() || "/staff";

export function StaffAccountNotice({ onBack }: { onBack: () => void }) {
  return (
    <div className="centered-screen">
      <div className="card login-card">
        <h1>Chesa're · Administración</h1>

        <div className="notice notice-error" role="alert">
          <strong>Tu cuenta es de tipo empleado</strong>
          <p>
            Esta es la vista de administración. Para ver y actualizar los pedidos, usa la vista de
            empleados.
          </p>
        </div>

        <a className="btn btn-primary" href={EMPLOYEE_APP_URL}>
          Ir a la vista de empleados
        </a>

        <button type="button" className="btn btn-quiet" onClick={onBack}>
          Entrar con otra cuenta
        </button>

        <p className="muted">
          Si crees que tu cuenta debería tener acceso a la administración, pídele al dueño que
          cambie tu rol.
        </p>
      </div>
    </div>
  );
}
