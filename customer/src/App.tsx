import { Fragment, type JSX, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { API_READY, fetchHours, fetchMenu } from "./api/client";
import type { HoursResponse, MenuCategory, MenuItem, MenuResponse } from "./api/types";
import { CartSheet, type Sugerencia } from "./components/CartSheet";
import { IcCarrito, IcChevron, IcPin } from "./components/icons";
import { MenuSections } from "./components/MenuSections";
import { ProductSheet, type ProductSelection } from "./components/ProductSheet";
import { applyColorScheme, cacheBranding, readCachedBranding } from "./lib/branding";
import { useCart } from "./lib/cart";
import { configureCurrency, formatPhone, hhmm, mx, nombreDia, telHref } from "./lib/format";
import { shopStatus } from "./lib/hours";
import { buildSections, cartName, choicePrice, singleChoiceGroup } from "./lib/menu";

/** Seeded default so the very first paint of a cold browser (no cache yet)
 *  still shows Chesa're's real name instead of going blank -- same principle
 *  as index.html's static <title>. Once the menu fetch resolves, or a cached
 *  branding value exists, that always wins. */
const DEFAULT_NAME = "Pizza's Chesa're";

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
  const navRef = useRef<HTMLDivElement>(null);

  const tick = useTick(60000);

  // Read once: this only seeds the very first render before the fetch below
  // resolves, so it deliberately isn't kept in sync afterwards -- `menu.location`
  // takes over once it lands.
  const cachedBranding = useRef(readCachedBranding()).current;

  useEffect(() => {
    const control = new AbortController();
    setCargando(true);
    setFallo(false);

    Promise.all([fetchMenu(control.signal), fetchHours(control.signal)])
      .then(([menuResponse, hoursResponse]) => {
        const { location } = menuResponse;
        configureCurrency(location.currency);
        applyColorScheme(location.colorScheme);
        cacheBranding({
          name: location.name,
          colorScheme: location.colorScheme,
          logoUrl: location.logoUrl,
          waNumber: location.waNumber,
          tagline: location.tagline
        });
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

  const location = menu?.location ?? null;
  const brandName = location?.name ?? cachedBranding?.name ?? DEFAULT_NAME;
  const logoUrl = location?.logoUrl ?? cachedBranding?.logoUrl ?? null;
  const failoverWaNumber = location?.waNumber ?? cachedBranding?.waNumber ?? null;
  const tagline = location?.tagline ?? cachedBranding?.tagline ?? null;

  // The <title> and description can't be templated server-side (no SSR here),
  // so the seeded defaults in index.html hold until this runs -- see
  // docs/multi-tenant-branding-plan.md.
  useEffect(() => {
    if (!location) return;
    document.title = location.name;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        "content",
        `Pide en línea en ${location.name}${location.addressText ? ` — ${location.addressText}` : ""}.`
      );
    // The browser tab icon and "add to home screen" icon are still the
    // static seeded default (index.html's <link>s) until this runs -- same
    // acknowledged first-paint limitation as the <title>/description above,
    // no SSR to template them at request time.
    if (location.logoUrl) {
      document.querySelector('link[rel="icon"]')?.setAttribute("href", location.logoUrl);
      document.querySelector('link[rel="apple-touch-icon"]')?.setAttribute("href", location.logoUrl);
    }
    document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute("content", location.name);
  }, [location]);

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

  // The nav strip scrolls horizontally on its own (more categories than fit
  // on screen) -- without this, scrolling the page changes which category is
  // "on" but the highlighted link can end up off to the side, out of view.
  useEffect(() => {
    if (!activa) return;
    const link = navRef.current?.querySelector<HTMLAnchorElement>(`a[href="#${activa}"]`);
    link?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activa]);

  return (
    <>
      <header className="cab">
        <div className="w">
          <div className="hero-fila">
            {logoUrl ? (
              <img className="marca" src={logoUrl} alt={brandName} width={520} height={499} />
            ) : null}
            <div className="hero-texto">
              <h1>{brandName}</h1>
              {tagline ? <p className="hero-tag">{tagline}</p> : null}
            </div>
          </div>
          <div className="cab-info">
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
            {location?.addressText ? (
              <p className="dir">
                <IcPin /> {location.addressText}
              </p>
            ) : null}
          </div>
        </div>
      </header>

      {estado && !estado.open && estado.proxima ? (
        <div className="aviso">
          Ahorita estamos cerrados. Abrimos {estado.proxima}. Puedes armar tu pedido y mandarlo, te
          contestamos al abrir.
        </div>
      ) : null}

      <nav className="nav" aria-label="Secciones del menú">
        <div className="nav-in" ref={navRef}>
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
            Revisa tu conexión e inténtalo de nuevo
            {failoverWaNumber ? (
              <>
                , o llámanos al <a href={telHref(failoverWaNumber)}>{formatPhone(failoverWaNumber)}</a>
              </>
            ) : null}
            .
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
        {location ? (
          <p>
            {location.addressText}
            {location.addressText ? "." : null}
            <br />
            {location.waNumber ? (
              <>
                Pedidos al <a href={telHref(location.waNumber)}>{formatPhone(location.waNumber)}</a>.
              </>
            ) : null}
          </p>
        ) : null}
        {location?.legalNotice ? <p>{location.legalNotice}</p> : null}
        {location?.demoNotice ? <div className="demo">{location.demoNotice}</div> : null}
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
        <button
          className="barra-in"
          type="button"
          aria-label={`Ver pedido: ${cart.pieces} producto${cart.pieces === 1 ? "" : "s"}, ${mx(cart.total)}`}
          onClick={() => {
            focoPrevio.current = document.activeElement as HTMLElement | null;
            setCarroAbierto(true);
          }}
        >
          <span className="barra-icono">
            <IcCarrito />
            <span className="barra-cuenta">{cart.pieces}</span>
          </span>
          <b>{mx(cart.total)}</b>
          <span className="cheq" aria-hidden="true">
            <IcChevron size={18} />
          </span>
        </button>
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
