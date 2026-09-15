import { type JSX, useEffect, useRef, useState } from "react";
import { ApiError, submitOrder } from "../api/client";
import {
  type FulfillmentType,
  MAX_ADDRESS_LENGTH,
  MAX_LINE_QUANTITY,
  MAX_NAME_LENGTH,
  MAX_NOTE_LENGTH,
  MAX_PHONE_LENGTH,
  type PlacedOrder
} from "../api/types";
import { type Cart, type CartRef, toOrderLine } from "../lib/cart";
import { mx } from "../lib/format";

export interface Sugerencia {
  key: string;
  nom: string;
  det: string;
  price: number;
  ref: CartRef;
}

interface Props {
  cart: Cart;
  open: boolean;
  apiReady: boolean;
  sugerencias: Sugerencia[];
  onClose: () => void;
}

const SIN_API =
  "Los pedidos en línea no están disponibles por ahora. Llámanos o escríbenos por WhatsApp.";
const ERROR_GENERICO = "No pudimos enviar tu pedido, inténtalo de nuevo. Tu pedido sigue aquí.";

/**
 * Every code the order endpoint can return, in Spanish. The server's own messages
 * are English, so they are never shown; an unmapped code falls back to
 * ERROR_GENERICO, which still says the cart was kept and the button can be pressed
 * again — there is no WhatsApp fallback on the order path any more, so a failure
 * must never be silent or a dead end.
 */
const ERRORES: Record<string, string> = {
  VALIDATION_ERROR: "Revisa tus datos: algo quedó incompleto o mal escrito.",
  // `badRequest()` in the pricing/matching code: an item, size or style in the cart
  // no longer matches the live menu.
  BAD_REQUEST:
    "Algo de tu pedido ya no coincide con el menú. Vuelve a cargar la página e inténtalo de nuevo.",
  PRICE_UNAVAILABLE:
    "Uno de los productos no tiene precio publicado. Quítalo del pedido o pregúntanos por WhatsApp.",
  ITEM_UNORDERABLE:
    "Uno de los productos ya no está disponible. Quítalo del pedido e inténtalo de nuevo.",
  RATE_LIMITED: "Estamos recibiendo muchos pedidos. Espera un minuto y vuelve a intentar.",
  NOT_FOUND: "No pudimos encontrar la pizzería en el sistema. Llámanos para tomar tu pedido.",
  NETWORK_ERROR:
    "No pudimos conectar con el servidor. Revisa tu conexión y vuelve a intentar: tu pedido sigue aquí.",
  NO_API: SIN_API
};

type Campo = "nombre" | "telefono" | "direccion";

export function CartSheet({ cart, open, apiReady, sugerencias, onClose }: Props): JSX.Element {
  const [modo, setModo] = useState<"domicilio" | "recoger">("domicilio");
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [direccion, setDireccion] = useState("");
  const [nota, setNota] = useState("");
  const [mal, setMal] = useState<Campo | null>(null);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pedido, setPedido] = useState<PlacedOrder | null>(null);

  const refs = {
    nombre: useRef<HTMLInputElement>(null),
    telefono: useRef<HTMLInputElement>(null),
    direccion: useRef<HTMLInputElement>(null)
  };

  // Reopening the sheet always lands on the form, never on the previous
  // confirmation — same reset the old page did in mostrarFormulario().
  useEffect(() => {
    if (!open) return;
    setPedido(null);
    setMal(null);
    setError(apiReady ? "" : SIN_API);
  }, [open, apiReady]);

  function validar(): { falla: string; campo: Campo | null } {
    if (cart.lines.length === 0) {
      return { falla: "Tu pedido está vacío. Agrega algo del menú.", campo: null };
    }
    if (!nombre.trim()) {
      return { falla: "Escribe tu nombre para el pedido.", campo: "nombre" };
    }
    const tel = telefono.trim();
    if (!tel) {
      return { falla: "Escribe un teléfono para confirmarte el pedido.", campo: "telefono" };
    }
    if (!/^[0-9+()\-\s]+$/.test(tel)) {
      return { falla: "El teléfono solo puede llevar números.", campo: "telefono" };
    }
    if (tel.replace(/[^0-9]/g, "").length < 7) {
      return { falla: "El teléfono está incompleto.", campo: "telefono" };
    }
    if (modo === "domicilio" && !direccion.trim()) {
      return { falla: "Escribe la dirección para la entrega.", campo: "direccion" };
    }
    return { falla: "", campo: null };
  }

  function cuerpoPedido() {
    const fulfillmentType: FulfillmentType = modo === "domicilio" ? "DELIVERY" : "PICKUP";
    const customer: { name?: string; phone: string; address?: string; note?: string } = {
      name: nombre.trim(),
      phone: telefono.trim()
    };
    if (modo === "domicilio" && direccion.trim()) customer.address = direccion.trim();
    if (nota.trim()) customer.note = nota.trim();

    return { fulfillmentType, customer, items: cart.lines.map(toOrderLine) };
  }

  async function enviarPedido(): Promise<void> {
    if (enviando) return;
    if (!apiReady) {
      setError(SIN_API);
      return;
    }

    const { falla, campo } = validar();
    if (falla) {
      setError(falla);
      setMal(campo);
      if (campo) refs[campo].current?.focus();
      return;
    }

    setError("");
    setMal(null);
    setEnviando(true);

    try {
      const response = await submitOrder(cuerpoPedido());
      cart.clear();
      setNota("");
      setPedido(response.order);
      setError("");
    } catch (failure) {
      const code = failure instanceof ApiError ? failure.code : "";
      setError(ERRORES[code] ?? ERROR_GENERICO);
    } finally {
      setEnviando(false);
    }
  }

  const botonTexto = enviando ? "Enviando…" : apiReady ? "Enviar pedido" : "Pedidos en línea no disponibles";

  return (
    <>
      <div className="hoja-top">
        <div>
          <h3 id="c-tit">{pedido ? "Pedido confirmado" : "Tu pedido"}</h3>
          <p>
            {pedido
              ? `Pedido #${pedido.orderNumber}`
              : `${cart.pieces} producto${cart.pieces === 1 ? "" : "s"}`}
          </p>
        </div>
        <button className="cerrar" type="button" aria-label="Cerrar" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="hoja-cuerpo">
        {pedido ? (
          <div>
            <div className="ok-tit">
              <span className="marca-ok" aria-hidden="true">
                ✓
              </span>
              <b>¡Recibimos tu pedido!</b>
            </div>
            <div className="ok-num">
              <small>NÚMERO DE PEDIDO</small>
              <b>#{pedido.orderNumber}</b>
            </div>
            {pedido.items.map((linea) => {
              const detalle = [linea.size, linea.style, linea.option].filter(Boolean).join(" · ");
              return (
                <div className="cl" key={linea.id}>
                  <div className="t">
                    <b>
                      {linea.quantity}× {linea.name}
                    </b>
                    {detalle ? <small>{detalle}</small> : null}
                  </div>
                  <div className="p">{mx(linea.lineTotal)}</div>
                </div>
              );
            })}
            {pedido.discountTotal > 0 ? (
              <div className="cl">
                <div className="t">
                  <b>Descuento</b>
                </div>
                <div className="p">−{mx(pedido.discountTotal)}</div>
              </div>
            ) : null}
            <div className="suma">
              <span>Total</span>
              <span>{mx(pedido.total)}</span>
            </div>
            <p className="ok-nota">
              {pedido.fulfillmentType === "DELIVERY"
                ? "Te lo llevamos a domicilio. Paga en efectivo o con tarjeta al recibir tu pedido."
                : "Pasas por él al local. Paga en efectivo o con tarjeta al recoger tu pedido."}
            </p>
            {pedido.customerPhone ? (
              <p className="ok-nota">Si hace falta algo te marcamos al {pedido.customerPhone}.</p>
            ) : null}
          </div>
        ) : (
          <div>
            <div>
              {cart.lines.length === 0 ? (
                <p className="vacio">Todavía no agregas nada del menú.</p>
              ) : (
                cart.lines.map((linea) => (
                  <div className="cl" key={linea.key}>
                    <div className="t">
                      <b>{linea.nom}</b>
                      <small>
                        {linea.det ? `${linea.det} · ` : ""}
                        {mx(linea.price)} c/u
                      </small>
                    </div>
                    <div className="cant sm">
                      <button
                        type="button"
                        aria-label="Quitar uno"
                        onClick={() => cart.decrement(linea.key)}
                      >
                        −
                      </button>
                      <span>{linea.qty}</span>
                      <button
                        type="button"
                        aria-label="Agregar uno"
                        disabled={linea.qty >= MAX_LINE_QUANTITY}
                        onClick={() => cart.increment(linea.key)}
                      >
                        +
                      </button>
                    </div>
                    <div className="p">{mx(linea.price * linea.qty)}</div>
                  </div>
                ))
              )}
            </div>

            <div className="suma">
              <span>Total</span>
              <span>{mx(cart.total)}</span>
            </div>

            {cart.lines.length > 0 && sugerencias.length > 0 ? (
              <div className="sugiere">
                <h4>¿Le agregas algo?</h4>
                <div className="sug-fila">
                  {sugerencias.map((sug) => (
                    <button
                      className="sug"
                      type="button"
                      key={sug.key}
                      onClick={() => cart.add(sug.nom, sug.price, 1, sug.det, sug.ref)}
                    >
                      {sug.nom} <b>{mx(sug.price)}</b>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="modo" role="group" aria-label="Forma de entrega">
              <button
                type="button"
                aria-pressed={modo === "domicilio"}
                onClick={() => setModo("domicilio")}
              >
                A domicilio
              </button>
              <button
                type="button"
                aria-pressed={modo === "recoger"}
                onClick={() => setModo("recoger")}
              >
                Paso por él
              </button>
            </div>

            <div className="campo">
              <label htmlFor="f-nom">Tu nombre</label>
              <input
                id="f-nom"
                ref={refs.nombre}
                type="text"
                autoComplete="name"
                maxLength={MAX_NAME_LENGTH}
                placeholder="¿A nombre de quién?"
                className={mal === "nombre" ? "mal" : undefined}
                value={nombre}
                onChange={(event) => {
                  setNombre(event.target.value);
                  setMal((current) => (current === "nombre" ? null : current));
                }}
              />
            </div>
            <div className="campo">
              <label htmlFor="f-tel">Teléfono</label>
              <input
                id="f-tel"
                ref={refs.telefono}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                maxLength={MAX_PHONE_LENGTH}
                placeholder="Para confirmarte el pedido"
                className={mal === "telefono" ? "mal" : undefined}
                value={telefono}
                onChange={(event) => {
                  setTelefono(event.target.value);
                  setMal((current) => (current === "telefono" ? null : current));
                }}
              />
            </div>
            {modo === "domicilio" ? (
              <div className="campo">
                <label htmlFor="f-dir">Dirección</label>
                <input
                  id="f-dir"
                  ref={refs.direccion}
                  type="text"
                  autoComplete="street-address"
                  maxLength={MAX_ADDRESS_LENGTH}
                  placeholder="Calle, número y una referencia"
                  className={mal === "direccion" ? "mal" : undefined}
                  value={direccion}
                  onChange={(event) => {
                    setDireccion(event.target.value);
                    setMal((current) => (current === "direccion" ? null : current));
                  }}
                />
              </div>
            ) : null}
            <div className="campo">
              <label htmlFor="f-nota">Notas para la cocina</label>
              <textarea
                id="f-nota"
                rows={2}
                maxLength={MAX_NOTE_LENGTH}
                placeholder="Sin cebolla, mitad y mitad, bien dorada…"
                value={nota}
                onChange={(event) => setNota(event.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      <div className="hoja-pie">
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        {pedido ? (
          <button
            className="btn btn-wa"
            type="button"
            style={{ width: "100%", padding: 15, fontSize: "1.05rem" }}
            onClick={onClose}
          >
            Listo
          </button>
        ) : (
          <button
            className="btn btn-wa"
            type="button"
            style={{ width: "100%", padding: 15, fontSize: "1.05rem" }}
            disabled={!apiReady || enviando}
            onClick={() => {
              void enviarPedido();
            }}
          >
            {botonTexto}
          </button>
        )}
      </div>
    </>
  );
}
