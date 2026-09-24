import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { usersApi, type CreateUserInput } from "../../api/users";
import {
  ApiError,
  Badge,
  EmptyState,
  ErrorNotice,
  Field,
  Loading,
  PageHeader,
  Panel,
  Toggle,
  useSessionUser,
  type AdminRole,
  type AdminUser
} from "@chesare/portal-shared";
import { SuccessNotice } from "../../components/ui";
import { formatDate } from "../../lib/format";
import { ROLE_LABELS } from "../../lib/roles";
import { useLocationId } from "../../state/location";

const ASSIGNABLE_ROLES: AdminRole[] = ["STAFF", "MANAGER", "OWNER"];

const EMPTY_FORM: CreateUserInput = { email: "", name: "", password: "", role: "STAFF" };

export function UsersPage() {
  const locationId = useLocationId();
  const sessionUser = useSessionUser();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateUserInput>(EMPTY_FORM);
  const [notice, setNotice] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: ["users", locationId],
    queryFn: () => usersApi.list(locationId).then((response) => response.users)
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["users", locationId] });

  const createMutation = useMutation({
    mutationFn: (input: CreateUserInput) => usersApi.create(locationId, input),
    onSuccess: () => {
      setForm(EMPTY_FORM);
      setNotice("Cuenta creada.");
      void invalidate();
    }
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => usersApi.update(id, { active }),
    onSuccess: () => void invalidate()
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: AdminRole }) => usersApi.update(id, { role }),
    onSuccess: () => void invalidate()
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => usersApi.remove(id),
    onSuccess: () => void invalidate()
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    createMutation.mutate(form);
  }

  const roleOptions = sessionUser.role === "SUPER_ADMIN" ? [...ASSIGNABLE_ROLES, "SUPER_ADMIN" as AdminRole] : ASSIGNABLE_ROLES;

  return (
    <div className="page">
      <PageHeader title="Usuarios" description="Cuentas del portal de administración para esta sucursal." />

      <Panel title="Nueva cuenta">
        <form className="stack" onSubmit={submit}>
          <Field label="Nombre">
            <input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
          </Field>
          <Field label="Correo">
            <input
              type="email"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              required
            />
          </Field>
          <Field label="Contraseña" hint="Mínimo 8 caracteres. El empleado puede cambiarla después.">
            <input
              type="text"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              minLength={8}
              required
            />
          </Field>
          <Field label="Rol">
            <select
              value={form.role}
              onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value as AdminRole }))}
            >
              {roleOptions.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </Field>
          <div className="row">
            <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creando…" : "Crear cuenta"}
            </button>
          </div>
        </form>
        {notice ? <SuccessNotice>{notice}</SuccessNotice> : null}
        {createMutation.error ? <ErrorNotice error={createMutation.error} /> : null}
      </Panel>

      <Panel title="Cuentas de esta sucursal">
        {usersQuery.isPending ? <Loading /> : null}
        {usersQuery.error ? <ErrorNotice error={usersQuery.error} /> : null}
        {usersQuery.data && usersQuery.data.length === 0 ? (
          <EmptyState title="Todavía no hay cuentas adicionales" />
        ) : null}
        {usersQuery.data && usersQuery.data.length > 0 ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Correo</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Último ingreso</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {usersQuery.data.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    isSelf={user.id === sessionUser.id}
                    roleOptions={roleOptions}
                    onToggleActive={(active) => toggleActiveMutation.mutate({ id: user.id, active })}
                    onChangeRole={(role) => roleMutation.mutate({ id: user.id, role })}
                    onRemove={() => {
                      if (window.confirm(`¿Eliminar la cuenta de ${user.name}? Esto no se puede deshacer.`)) {
                        removeMutation.mutate(user.id);
                      }
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {toggleActiveMutation.error ? <ErrorNotice error={toggleActiveMutation.error} /> : null}
        {roleMutation.error ? <ErrorNotice error={roleMutation.error} /> : null}
        {removeMutation.error instanceof ApiError ? <ErrorNotice error={removeMutation.error} /> : null}
      </Panel>
    </div>
  );
}

function UserRow({
  user,
  isSelf,
  roleOptions,
  onToggleActive,
  onChangeRole,
  onRemove
}: {
  user: AdminUser;
  isSelf: boolean;
  roleOptions: AdminRole[];
  onToggleActive: (active: boolean) => void;
  onChangeRole: (role: AdminRole) => void;
  onRemove: () => void;
}) {
  return (
    <tr>
      <td>
        {user.name}
        {isSelf ? <Badge tone="info">Tú</Badge> : null}
        {user.lockedUntil && new Date(user.lockedUntil) > new Date() ? <Badge tone="warn">Bloqueada</Badge> : null}
      </td>
      <td>{user.email}</td>
      <td>
        <select value={user.role} disabled={isSelf} onChange={(event) => onChangeRole(event.target.value as AdminRole)}>
          {roleOptions.includes(user.role) ? null : <option value={user.role}>{user.role}</option>}
          {roleOptions.map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
      </td>
      <td>
        <Toggle checked={user.active} disabled={isSelf} onChange={onToggleActive} label={user.active ? "Activa" : "Inactiva"} />
      </td>
      <td>{formatDate(user.lastLoginAt)}</td>
      <td>
        <button type="button" className="btn btn-danger" disabled={isSelf} onClick={onRemove}>
          Eliminar
        </button>
      </td>
    </tr>
  );
}
