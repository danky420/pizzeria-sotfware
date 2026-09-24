import { type FormEvent, type JSX, useCallback, useEffect, useRef, useState } from "react";
import { ApiError, fetchLocation, trackOrder } from "../api/client";
import { MAX_PHONE_LENGTH, type PublicLocation, type TrackOrderResponse } from "../api/types";
import { IcPizza } from "./icons";
import { applyColorScheme, cacheBranding, readCachedBranding } from "../lib/branding";
import { configureCurrency, mx } from "../lib/format";
import { FULFILLMENT_LABELS, ORDER_STATUS_LABELS, STATUS_HELP, TRACKING_STEPS } from "../lib/orderStatus";

const DEFAULT_NAME = "Pizza's Chesa're";

const POLL_MS = 8000;

const ERRORES: Record<string, string> = {
  NOT_FOUND: "No encontramos ese pedido. Revisa tu teléfono y número de pedido.",
  VALIDATION_ERROR: "Revisa tu teléfono y número de pedido.",
  RATE_LIMITED: "Estamos recibiendo muchas consultas. Espera un minuto y vuelve a intentar.",
  NETWORK_ERROR: "No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.",
  NO_API: "El rastreo de pedidos no está disponible por ahora."
};
const ERROR_GENERICO = "No pudimos buscar tu pedido. Inténtalo de nuevo.";

function parsePedidoParam(value: string | null): string {
  if (!value) return "";
  const digits = value.replace(/[^0-9]/g, "");
  return digits;
}

export function TrackingPage(): JSX.Element {
  const initial = useRef(new URLSearchParams(window.location.search));
  const [telefono, setTelefono] = useState(() => initial.current.get("telefono") ?? "");
  const [pedido, setPedido] = useState(() => parsePedidoParam(initial.current.get("pedido")));
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<TrackOrderResponse | null>(null);
  const [branding, setBranding] = useState<PublicLocation | null>(null);
  const cachedBranding = useRef(readCachedBranding()).current;

  // This page can be the very first one opened (a shared tracking link), so
  // unlike App.tsx there is no menu fetch already in flight to ride along
  // with -- a small standalone location fetch fills in the same branding.
  useEffect(() => {
    const control = new AbortController();
    fetchLocation(control.signal)
      .then(({ location }) => {
        applyColorScheme(location.colorScheme);
        cacheBranding({
          name: location.name,
          colorScheme: location.colorScheme,
          logoUrl: location.logoUrl,
          waNumber: location.waNumber,
          tagline: location.tagline
        });
        setBranding(location);
        // This page can be the very first one a browser tab ever opens (a
        // shared tracking link), so it needs the same tab title/icon patch
        // App.tsx does -- there's no shared <title> to inherit from.
        document.title = `Rastrea tu pedido · ${location.name}`;
        if (location.logoUrl) {
          document.querySelector('link[rel="icon"]')?.setAttribute("href", location.logoUrl);
          document.querySelector('link[rel="apple-touch-icon"]')?.setAttribute("href", location.logoUrl);
        }
        document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute("content", location.name);
      })
      .catch(() => {
        // No branding fetched is not fatal here -- the cache (or the seeded
        // default) already covers the header, and the actual order lookup
        // below still works independently.
      });
    return () => control.abort();
  }, []);

  const brandName = branding?.name ?? resultado?.location.name ?? cachedBranding?.name ?? DEFAULT_NAME;
  const logoUrl = branding?.logoUrl ?? resultado?.location.logoUrl ?? cachedBranding?.logoUrl ?? null;

  const buscar = useCallback(async (tel: string, numero: string, signal?: AbortSignal): Promise<void> => {
    const orderNumber = Number(numero);
    setCargando(true);
    setError(null);
    try {
      const response = await trackOrder(tel, orderNumber, signal);
      configureCurrency(response.location.currency);
      setResultado(response);
    } catch (failure) {
      if (signal?.aborted) return;
      const code = failure instanceof ApiError ? failure.code : "";
      setError(ERRORES[code] ?? ERROR_GENERICO);
      setResultado(null);
    } finally {
      if (!signal?.aborted) setCargando(false);
    }
  }, []);

  // Auto-lookup once if the page was opened from the confirmation-screen link.
  useEffect(() => {
    const tel = initial.current.get("telefono");
    const numero = parsePedidoParam(initial.current.get("pedido"));
    if (tel && numero) void buscar(tel, numero);
  }, [buscar]);

  // Poll while the order is still moving; stop once it's done either way, so
  // a tab left open doesn't keep polling forever.
  useEffect(() => {
    if (!resultado) return;
    const status = resultado.order.status;
    if (status === "COMPLETED" || status === "CANCELLED") return;

    const id = window.setInterval(() => {
      void buscar(telefono, String(resultado.order.orderNumber));
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [resultado, telefono, buscar]);

  function onSubmit(event: FormEvent): void {
    event.preventDefault();
    const tel = telefono.trim();
    const numero = pedido.trim();
    if (!tel || !numero) {
      setError("Escribe tu teléfono y el número de pedido.");
      return;
    }
    void buscar(tel, numero);
  }

  function otraBusqueda(): void {
    setResultado(null);
    setError(null);
  }

  const orden = resultado?.order ?? null;
  const stepIndex = orden ? TRACKING_STEPS.indexOf(orden.status) : -1;

  return (
    <>
      <header className="cab cab-rastreo">
        <div className="w">
          <a className="rastreo-marca" href="/">
            {logoUrl ? <img src={logoUrl} alt={brandName} width={44} height={44} /> : null}
            <span>{brandName}</span>
          </a>
        </div>
      </header>

      <nav className="nav" aria-label="Navegación principal">
        <div className="nav-top">
          <a className="nav-top-menu" href="/">
            Menú
          </a>
          <a className="nav-top-track on" href="/rastreo">
            Rastrear pedido
          </a>
        </div>
      </nav>

      <main className="w rastreo-main">
        <h1 className="rastreo-tit">Rastrea tu pedido</h1>

        {!orden ? (
          <form className="rastreo-form" onSubmit={onSubmit}>
            <p className="rastreo-ayuda">
              Escribe el teléfono y el número de pedido que te dimos al confirmarlo.
            </p>
            <div className="campo">
              <label htmlFor="r-tel">Teléfono</label>
              <input
                id="r-tel"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                maxLength={MAX_PHONE_LENGTH}
                placeholder="Con el que hiciste el pedido"
                value={telefono}
                onChange={(event) => setTelefono(event.target.value)}
              />
            </div>
            <div className="campo">
              <label htmlFor="r-num">Número de pedido</label>
              <input
                id="r-num"
                type="text"
                inputMode="numeric"
                placeholder="Ej. 1042"
                value={pedido}
                onChange={(event) => setPedido(event.target.value.replace(/[^0-9]/g, ""))}
              />
            </div>
            {error ? (
              <p className="error" role="alert">
                {error}
              </p>
            ) : null}
            <button className="btn btn-wa" type="submit" disabled={cargando} style={{ width: "100%", padding: 14 }}>
              {cargando ? "Buscando…" : "Buscar pedido"}
            </button>
          </form>
        ) : (
          <div className="rastreo-resultado">
            <div className="ok-num">
              <small>NÚMERO DE PEDIDO</small>
              <b>#{orden.orderNumber}</b>
            </div>

            {orden.status === "CANCELLED" ? (
              <div className="rastreo-cancelado">Este pedido fue cancelado.</div>
            ) : (
              <>
                <div className="rastreo-estado">
                  <span className="ic">
                    <IcPizza />
                  </span>
                  <div className="rastreo-estado-texto">
                    <b>{ORDER_STATUS_LABELS[orden.status]}</b>
                    {STATUS_HELP[orden.status] ? <small>{STATUS_HELP[orden.status]}</small> : null}
                  </div>
                </div>
                <ol className="rastreo-track" aria-label="Estado del pedido">
                  {TRACKING_STEPS.map((status, index) => (
                    <li
                      key={status}
                      className={index < stepIndex ? "hecho" : index === stepIndex ? "actual" : undefined}
                      aria-label={ORDER_STATUS_LABELS[status]}
                    >
                      <span className="rastreo-punto" aria-hidden="true">
                        {index < stepIndex ? "✓" : index + 1}
                      </span>
                      <span className="rastreo-etiqueta">{ORDER_STATUS_LABELS[status]}</span>
                    </li>
                  ))}
                </ol>
              </>
            )}

            <p className="ok-nota">
              {FULFILLMENT_LABELS[orden.fulfillmentType] ?? orden.fulfillmentType}
              {orden.customerName ? ` · ${orden.customerName}` : ""}
            </p>

            {orden.items.map((linea, index) => (
              <div className="cl" key={`${linea.name}-${index}`}>
                <div className="t">
                  <b>
                    {linea.quantity}× {linea.name}
                  </b>
                  {[linea.size, linea.style, linea.option].filter(Boolean).length > 0 ? (
                    <small>{[linea.size, linea.style, linea.option].filter(Boolean).join(" · ")}</small>
                  ) : null}
                </div>
              </div>
            ))}
            <div className="suma">
              <span>Total</span>
              <span>{mx(orden.total)}</span>
            </div>

            <button className="btn btn-outline rastreo-otro" type="button" onClick={otraBusqueda}>
              Buscar otro pedido
            </button>
          </div>
        )}
      </main>
    </>
  );
}
