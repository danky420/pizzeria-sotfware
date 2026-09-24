import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { locationsApi, type LocationInput } from "../../api/locations";
import { ErrorNotice, Field, Loading, PageHeader, Panel, Toggle } from "@chesare/portal-shared";
import { SuccessNotice } from "../../components/ui";
import { useLocationId } from "../../state/location";

// Mirrors backend/src/schemas/locations.ts's SUPPORTED_CURRENCIES. Switching
// this relabels the location's existing prices -- it never converts them.
const CURRENCY_OPTIONS: { value: string; label: string }[] = [
  { value: "MXN", label: "Peso mexicano (MXN)" },
  { value: "USD", label: "Dólar estadounidense (USD)" }
];

// Mirrors backend/src/schemas/locations.ts's SUPPORTED_COLOR_SCHEMES. Only the
// storefront (customer/) wears these -- admin/ and employee/ stay on their own
// neutral palette for every tenant, by design (docs/multi-tenant-branding-plan.md).
const COLOR_SCHEME_OPTIONS: { value: string; label: string; swatch: string }[] = [
  { value: "rojo-clasico", label: "Rojo clásico", swatch: "#D22B27" },
  { value: "verde-oliva", label: "Verde oliva", swatch: "#3F7D42" },
  { value: "azul-marino", label: "Azul marino", swatch: "#1F5C8B" }
];

const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const ALLOWED_LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const EMPTY_FORM: LocationInput = {
  slug: "",
  name: "",
  waNumber: "",
  timezone: "America/Mexico_City",
  currency: "MXN",
  addressText: "",
  tagline: "",
  legalNotice: "",
  demoNotice: "",
  colorScheme: "rojo-clasico",
  active: true
};

export function LocationPage() {
  const locationId = useLocationId();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<LocationInput>(EMPTY_FORM);
  const [notice, setNotice] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const locationQuery = useQuery({
    queryKey: ["location", locationId],
    queryFn: () => locationsApi.get(locationId).then((response) => response.location)
  });

  useEffect(() => {
    if (!locationQuery.data) return;
    const { slug, name, waNumber, timezone, currency, addressText, tagline, legalNotice, demoNotice, colorScheme, active } =
      locationQuery.data;
    setForm({
      slug,
      name,
      waNumber,
      timezone,
      currency,
      addressText: addressText ?? "",
      tagline: tagline ?? "",
      legalNotice: legalNotice ?? "",
      demoNotice: demoNotice ?? "",
      colorScheme,
      active
    });
  }, [locationQuery.data]);

  const updateMutation = useMutation({
    mutationFn: (input: LocationInput) => locationsApi.update(locationId, input),
    onSuccess: (response) => {
      setNotice("Guardado.");
      queryClient.setQueryData(["location", locationId], response.location);
      void queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    }
  });

  const logoMutation = useMutation({
    mutationFn: (file: File) => locationsApi.uploadLogo(locationId, file),
    onSuccess: (response) => {
      setLogoError(null);
      queryClient.setQueryData(["location", locationId], response.location);
      void queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    }
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    updateMutation.mutate(form);
  }

  function onLogoSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!ALLOWED_LOGO_TYPES.has(file.type)) {
      setLogoError("Formato no permitido. Usa PNG, JPEG o WEBP.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError("La imagen pesa más de 2 MB.");
      return;
    }
    setLogoError(null);
    logoMutation.mutate(file);
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
            <Field label="Dirección" hint="Como debe aparecer en el pie de página del sitio público.">
              <input
                value={form.addressText}
                onChange={(event) => setForm((prev) => ({ ...prev, addressText: event.target.value }))}
              />
            </Field>
            <Field label="Eslogan" hint="Línea corta bajo el nombre en el sitio público. Vacío = no se muestra.">
              <input
                value={form.tagline}
                onChange={(event) => setForm((prev) => ({ ...prev, tagline: event.target.value }))}
              />
            </Field>
            <Field
              label="Aviso legal"
              hint='Nota corta en el pie del sitio público, ej. "Venta de cerveza únicamente a mayores de 18 años." Vacío = no se muestra.'
            >
              <input
                value={form.legalNotice}
                onChange={(event) => setForm((prev) => ({ ...prev, legalNotice: event.target.value }))}
              />
            </Field>
            <Field
              label="Nota adicional"
              hint="Texto libre en el pie del sitio público, ej. para avisar que algunos precios se están confirmando. Vacío = no se muestra."
            >
              <textarea
                rows={3}
                value={form.demoNotice}
                onChange={(event) => setForm((prev) => ({ ...prev, demoNotice: event.target.value }))}
              />
            </Field>
            <Field label="Zona horaria">
              <input
                value={form.timezone}
                onChange={(event) => setForm((prev) => ({ ...prev, timezone: event.target.value }))}
                required
              />
            </Field>
            <Field label="Moneda" hint="Cambia cómo se muestran los precios que ya existen; no los convierte.">
              <select
                value={form.currency}
                onChange={(event) => setForm((prev) => ({ ...prev, currency: event.target.value }))}
                required
              >
                {CURRENCY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Colores del sitio público"
              hint="Solo cambia el sitio de clientes; esta administración se ve igual con cualquier opción."
            >
              <div className="row color-scheme-picker" role="radiogroup" aria-label="Colores del sitio público">
                {COLOR_SCHEME_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={
                      form.colorScheme === option.value ? "color-scheme-option on" : "color-scheme-option"
                    }
                  >
                    <input
                      type="radio"
                      name="colorScheme"
                      value={option.value}
                      checked={form.colorScheme === option.value}
                      onChange={() => setForm((prev) => ({ ...prev, colorScheme: option.value }))}
                    />
                    <span className="color-scheme-swatch" style={{ background: option.swatch }} aria-hidden="true" />
                    {option.label}
                  </label>
                ))}
              </div>
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

      {locationQuery.data ? (
        <Panel>
          <Field label="Logo" hint="PNG, JPEG o WEBP, hasta 2 MB. Se usa en el sitio público y en esta administración.">
            <div className="row logo-uploader">
              {locationQuery.data.logoUrl ? (
                <img className="logo-preview" src={locationQuery.data.logoUrl} alt="Logo actual" />
              ) : (
                <span className="muted">Sin logo todavía.</span>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={onLogoSelected}
                disabled={logoMutation.isPending}
              />
            </div>
          </Field>
          {logoMutation.isPending ? <Loading label="Subiendo logo…" /> : null}
          {logoError ? <ErrorNotice error={new Error(logoError)} /> : null}
          {logoMutation.error ? <ErrorNotice error={logoMutation.error} /> : null}
          {logoMutation.isSuccess && !logoMutation.isPending ? <SuccessNotice>Logo actualizado.</SuccessNotice> : null}
        </Panel>
      ) : null}
    </div>
  );
}
