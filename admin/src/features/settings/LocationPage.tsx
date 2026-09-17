import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { locationsApi, type LocationInput } from "../../api/locations";
import { ErrorNotice, Field, Loading, PageHeader, Panel } from "@chesare/portal-shared";
import { SuccessNotice, Toggle } from "../../components/ui";
import { useLocationId } from "../../state/location";

const EMPTY_FORM: LocationInput = {
  slug: "",
  name: "",
  waNumber: "",
  timezone: "America/Mexico_City",
  currency: "MXN",
  active: true
};

export function LocationPage() {
  const locationId = useLocationId();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<LocationInput>(EMPTY_FORM);
  const [notice, setNotice] = useState<string | null>(null);

  const locationQuery = useQuery({
    queryKey: ["location", locationId],
    queryFn: () => locationsApi.get(locationId).then((response) => response.location)
  });

  useEffect(() => {
    if (!locationQuery.data) return;
    const { slug, name, waNumber, timezone, currency, active } = locationQuery.data;
    setForm({ slug, name, waNumber, timezone, currency, active });
  }, [locationQuery.data]);

  const updateMutation = useMutation({
    mutationFn: (input: LocationInput) => locationsApi.update(locationId, input),
    onSuccess: (response) => {
      setNotice("Guardado.");
      queryClient.setQueryData(["location", locationId], response.location);
      void queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    }
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    updateMutation.mutate(form);
  }

  return (
    <div className="page">
      <PageHeader title="Sucursal" description="Datos básicos de esta pizzería." />

      <Panel>
        {locationQuery.isPending ? <Loading /> : null}
        {locationQuery.error ? <ErrorNotice error={locationQuery.error} /> : null}
        {locationQuery.data ? (
          <form className="stack" onSubmit={submit}>
            <Field label="Nombre">
              <input value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} required />
            </Field>
            <Field label="Identificador (slug)" hint="Usado en la URL pública del menú. Cambiarlo rompe enlaces existentes.">
              <input value={form.slug} onChange={(event) => setForm((prev) => ({ ...prev, slug: event.target.value }))} required />
            </Field>
            <Field label="WhatsApp" hint="Código de país + número, sin espacios ni signos. Ej. 522722603537.">
              <input
                value={form.waNumber}
                onChange={(event) => setForm((prev) => ({ ...prev, waNumber: event.target.value }))}
                required
              />
            </Field>
            <Field label="Zona horaria">
              <input
                value={form.timezone}
                onChange={(event) => setForm((prev) => ({ ...prev, timezone: event.target.value }))}
                required
              />
            </Field>
            <Field label="Moneda">
              <input
                value={form.currency}
                onChange={(event) => setForm((prev) => ({ ...prev, currency: event.target.value.toUpperCase() }))}
                maxLength={3}
                required
              />
            </Field>
            <Toggle
              checked={form.active}
              onChange={(active) => setForm((prev) => ({ ...prev, active }))}
              label="Sucursal activa"
            />
            <div className="row">
              <button type="submit" className="btn btn-primary" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? "Guardando…" : "Guardar cambios"}
              </button>
            </div>
          </form>
        ) : null}
        {notice ? <SuccessNotice>{notice}</SuccessNotice> : null}
        {updateMutation.error ? <ErrorNotice error={updateMutation.error} /> : null}
      </Panel>
    </div>
  );
}
