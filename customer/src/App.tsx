import { Fragment, type JSX, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_READY, fetchHours, fetchMenu } from "./api/client";
import type { HoursResponse, MenuCategory, MenuItem, MenuResponse } from "./api/types";
import { CartSheet, type Sugerencia } from "./components/CartSheet";
import { MenuSections } from "./components/MenuSections";
import { ProductSheet, type ProductSelection } from "./components/ProductSheet";
import { useCart } from "./lib/cart";
import { configureCurrency, hhmm, mx, nombreDia } from "./lib/format";
import { shopStatus } from "./lib/hours";
import { buildSections, cartName, choicePrice, singleChoiceGroup } from "./lib/menu";

/** Add-ons offered in the cart, resolved against the live menu; a slug the shop
 *  retires simply stops being offered instead of breaking the row. */
const SUGERENCIAS = [
  { itemSlug: "r-c2" },
  { itemSlug: "alitas-65", choiceName: "BBQ" },
  { itemSlug: "f-ore" },
  { itemSlug: "cr-nut" }
];

function useTick(ms: number): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return tick;
}

export function App(): JSX.Element {
  const [menu, setMenu] = useState<MenuResponse | null>(null);
  const [hours, setHours] = useState<HoursResponse | null>(null);
  const [fallo, setFallo] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [intento, setIntento] = useState(0);

  const cart = useCart();
  const [seleccion, setSeleccion] = useState<ProductSelection | null>(null);
  const [hojaAbierta, setHojaAbierta] = useState(false);
  const [carroAbierto, setCarroAbierto] = useState(false);
  const [activa, setActiva] = useState("");

  const hojaRef = useRef<HTMLDivElement>(null);
  const carroRef = useRef<HTMLDivElement>(null);
  const focoPrevio = useRef<HTMLElement | null>(null);

  const tick = useTick(60000);

  useEffect(() => {
    const control = new AbortController();
    setCargando(true);
    setFallo(false);

    Promise.all([fetchMenu(control.signal), fetchHours(control.signal)])
      .then(([menuResponse, hoursResponse]) => {
        configureCurrency(menuResponse.location.currency);
        setMenu(menuResponse);
        setHours(hoursResponse);
        setCargando(false);
      })
      .catch(() => {
        if (control.signal.aborted) return;
        setFallo(true);
        setCargando(false);
      });

    return () => control.abort();
  }, [intento]);

  const sections = useMemo(() => (menu ? buildSections(menu.categories) : []), [menu]);
  const estado = useMemo(() => (hours ? shopStatus(hours) : null), [hours, tick]);

  const abrirHoja = useCallback((category: MenuCategory, item: MenuItem) => {
    focoPrevio.current = document.activeElement as HTMLElement | null;
    setSeleccion({ category, item });
    setHojaAbierta(true);
  }, []);

  const cerrarTodo = useCallback(() => {
    setHojaAbierta(false);
    setCarroAbierto(false);
    focoPrevio.current?.focus();
  }, []);

  const sugerencias = useMemo<Sugerencia[]>(() => {
    if (!menu) return [];
    return SUGERENCIAS.flatMap((wanted) => {
      for (const category of menu.categories) {
        const item = category.items.find((candidate) => candidate.slug === wanted.itemSlug);
        if (!item) continue;

        if (wanted.choiceName) {
          const group = singleChoiceGroup(item);
          const choice = group?.choices.find((candidate) => candidate.name === wanted.choiceName);
          if (!choice) return [];
          const price = choicePrice(item, choice);
          if (price === null) return [];
          return [
            {
              key: `${item.slug}-${choice.id}`,
              nom: cartName(category.slug, item),
              det: choice.name,
              price,
              ref: {
                itemSlug: item.slug,
                categorySlug: category.slug,
                optionChoiceName: choice.name
              }
            }
          ];
        }

        if (item.flatPrice === null) return [];
        return [
          {
            key: item.slug,
            nom: cartName(category.slug, item),
            det: "",
            price: item.flatPrice,
            ref: { itemSlug: item.slug, categorySlug: category.slug }
          }
        ];
      }
      return [];
    });
  }, [menu]);

  const abierta = hojaAbierta || carroAbierto;

  useEffect(() => {
    document.body.style.overflow = abierta ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [abierta]);

  useEffect(() => {
    if (!abierta) return;
    const contenedor = hojaAbierta ? hojaRef.current : carroRef.current;
    contenedor?.querySelector<HTMLElement>("button, a, input")?.focus();
  }, [abierta, hojaAbierta, seleccion]);

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key === "Escape") cerrarTodo();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [cerrarTodo]);

  useEffect(() => {
    if (sections.length === 0 || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiva(entry.target.id);
        }
      },
      { rootMargin: "-60px 0px -70% 0px" }
    );
    for (const section of sections) {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [sections]);

  return (
    <>
      <header className="cab">
        <div className="w hero-fila">
          <img className="marca" src="/marca.webp" alt="Pizza's Chesa're" width={520} height={499} />
          <div className="hero-texto">
            <h1>Pizza's Chesa're</h1>
            <p className="hero-tag">Pizza de horno, hecha en Maltrata.</p>
          </div>
        </div>
        <div className="w cab-sub">
          <span className={estado?.open === false ? "estado off" : "estado"}>
            <i className="punto" />
            <span>
              {estado
                ? estado.open
                  ? `Abierto ahora. Cerramos ${estado.detalle.replace(/^cierra /, "a las ")}.`
                  : estado.detalle
                    ? `Cerrado. ${estado.detalle.replace(/^abre /, "Abrimos ")}.`
                    : "Cerrado por ahora."
                : "Consultando horario…"}
            </span>
          </span>
          <p className="dir">Av. Ignacio Zaragoza, Manzana 1, Maltrata, Veracruz</p>
        </div>
      </header>

      {estado && !estado.open && estado.proxima ? (
        <div className="aviso">
          Ahorita estamos cerrados. Abrimos {estado.proxima}. Puedes armar tu pedido y mandarlo, te
          contestamos al abrir.
        </div>
      ) : null}

      <nav className="nav" aria-label="Secciones del menú">
        <div className="nav-in">
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className={activa === section.id ? "on" : undefined}
            >
              {section.navLabel}
            </a>
          ))}
        </div>
      </nav>

      <main className="w">
        {cargando ? <p className="cargando">Cargando el menú…</p> : null}
        {fallo ? (
          <div className="fallo">
            <b>No pudimos cargar el menú.</b>
            Revisa tu conexión e inténtalo de nuevo, o llámanos al{" "}
            <a href="tel:+522722603537">272 260 3537</a>.
            <br />
            <button className="btn" type="button" onClick={() => setIntento((n) => n + 1)}>
              Reintentar
            </button>
          </div>
        ) : null}
        <MenuSections sections={sections} onOpen={abrirHoja} />
      </main>

      <footer className="w">
        <p>
          <strong>Horario</strong>
        </p>
        <div className="horario">
          {(hours?.days ?? []).map((day) => {
            const hoy = estado?.today === day.dayOfWeek ? "hoy" : undefined;
            return (
              <Fragment key={day.dayOfWeek}>
                <span className={hoy}>{nombreDia(day.dayOfWeek)}</span>
                <span className={hoy}>
                  {day.opensAt === null || day.closesAt === null
                    ? "Cerrado"
                    : `${hhmm(day.opensAt)} – ${hhmm(day.closesAt)}`}
                </span>
              </Fragment>
            );
          })}
        </div>
        <p>
          Av. Ignacio Zaragoza S/N, Manzana 1, 94700 Maltrata, Veracruz.
          <br />
          Pedidos al <a href="tel:+522722603537">272 260 3537</a> y{" "}
          <a href="tel:+522721005211">272 100 5211</a>.
        </p>
        <p>Venta de cerveza únicamente a mayores de 18 años.</p>
        <div className="demo">
          <strong>Versión de prueba.</strong> Los platillos y precios se tomaron del menú impreso de
          la casa. Algunos renglones venían sin precio (refresco 400 ml, botella de agua,
          micheladas) y aparecen marcados para completarse.
        </div>
        <button
          className="tema"
          type="button"
          onClick={() => {
            const actual = document.documentElement.getAttribute("data-theme");
            const oscuro = actual
              ? actual === "dark"
              : window.matchMedia("(prefers-color-scheme: dark)").matches;
            document.documentElement.setAttribute("data-theme", oscuro ? "light" : "dark");
          }}
        >
          Cambiar a vista clara / oscura
        </button>
      </footer>

      <div className={cart.pieces > 0 ? "barra on" : "barra"}>
        <div className="barra-in">
          <div className="c">
            <b>{mx(cart.total)}</b>
            <span>
              {cart.pieces} producto{cart.pieces === 1 ? "" : "s"}
            </span>
          </div>
          <button
            className="btn btn-wa"
            type="button"
            onClick={() => {
              focoPrevio.current = document.activeElement as HTMLElement | null;
              setCarroAbierto(true);
            }}
          >
            Ver pedido
          </button>
        </div>
      </div>

      <div className={abierta ? "fondo on" : "fondo"} onClick={cerrarTodo} />

      <div
        className={hojaAbierta ? "hoja on" : "hoja"}
        role="dialog"
        aria-modal="true"
        aria-labelledby="h-nom"
        ref={hojaRef}
      >
        {seleccion ? (
          <ProductSheet
            key={seleccion.item.id}
            selection={seleccion}
            onClose={cerrarTodo}
            onAdd={(nom, price, qty, det, ref) => {
              cart.add(nom, price, qty, det, ref);
              cerrarTodo();
            }}
          />
        ) : null}
      </div>

      <div
        className={carroAbierto ? "hoja on" : "hoja"}
        role="dialog"
        aria-modal="true"
        aria-labelledby="c-tit"
        ref={carroRef}
      >
        <CartSheet
          cart={cart}
          open={carroAbierto}
          apiReady={API_READY}
          sugerencias={sugerencias}
          onClose={cerrarTodo}
        />
      </div>
    </>
  );
}
