#!/usr/bin/env python3
"""
Revision de maquetado movil para dist/index.html.

No es una suite de pruebas. Es el arnes que encontro los bugs reales de la
primera version: encabezado de 770 px, boton "Llamar" cortado por la derecha,
desbordamiento horizontal. Correlo despues de tocar el CSS.

Revisa, en tres anchos de telefono:
  - errores de JavaScript en consola
  - desbordamiento horizontal de la pagina
  - cualquier elemento que se salga del viewport (incluso dentro de
    contenedores con overflow:hidden, que es como se escondia el boton)
  - alto del encabezado (si crece mucho, el menu queda bajo el pliegue)
  - que el flujo de pedido arme un enlace de WhatsApp valido

Uso:
    pip install playwright && playwright install chromium
    python scripts/check_mobile.py [--shots]      # --shots guarda capturas
"""

from __future__ import annotations

import argparse
import sys
import urllib.parse
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sys.exit("falta playwright: pip install playwright && playwright install chromium")

RAIZ = Path(__file__).resolve().parent.parent
PAGINA = RAIZ / "dist" / "index.html"
CAPTURAS = RAIZ / "dist" / "capturas"

# Los tres anchos que importan: iPhone SE (el mas angosto que sigue vivo),
# iPhone 14/15, y un Android tipico. Android domina en Mexico.
ANCHOS = [("iphone_se", 375, 667), ("iphone_14", 390, 844), ("android", 412, 915)]

ALTO_MAX_ENCABEZADO = 260  # px; mas que esto y el menu no se ve al abrir

# Telefono de la pizzeria. Ojo: Mexico a veces necesita 521 y no 52.
# Verificar en un telefono real antes de publicar (ver READER.md).
WA_ESPERADO = "https://wa.me/52"


def revisar(pagina, nombre: str, ancho: int, guardar: bool) -> list[str]:
    fallas: list[str] = []
    errores: list[str] = []
    pagina.on("pageerror", lambda e: errores.append(str(e)))

    pagina.goto(PAGINA.as_uri())
    pagina.wait_for_timeout(900)

    if errores:
        fallas.append(f"errores de JS: {errores}")

    desborde = pagina.evaluate(
        "document.documentElement.scrollWidth - document.documentElement.clientWidth"
    )
    if desborde > 0:
        fallas.append(f"la pagina se desplaza {desborde}px de lado")

    # Elementos fuera del viewport aunque su padre los recorte. Asi se
    # escondia el boton "Llamar": overflow:hidden lo tapaba y scrollWidth
    # no lo delataba.
    cortados = pagina.evaluate(
        """Array.from(document.querySelectorAll('header *, main *, .barra *'))
             .filter(e => e.getBoundingClientRect().right > window.innerWidth + 0.5)
             .map(e => (e.tagName + '.' + (e.className || '')).slice(0, 40))"""
    )
    if cortados:
        fallas.append(f"elementos cortados por la derecha: {cortados[:5]}")

    alto = pagina.evaluate(
        "Math.round(document.querySelector('.cab').getBoundingClientRect().height)"
    )
    if alto > ALTO_MAX_ENCABEZADO:
        fallas.append(f"encabezado de {alto}px (maximo {ALTO_MAX_ENCABEZADO})")

    if guardar:
        CAPTURAS.mkdir(parents=True, exist_ok=True)
        pagina.screenshot(path=str(CAPTURAS / f"{nombre}.png"))

    print(f"  {nombre:10s} ancho={ancho}  encabezado={alto}px  " + ("FALLA" if fallas else "ok"))
    return fallas


def revisar_pedido(pagina) -> list[str]:
    """Arma un pedido real y revisa el enlace de WhatsApp que sale."""
    fallas: list[str] = []
    pagina.goto(PAGINA.as_uri())
    pagina.wait_for_timeout(800)

    pagina.click("[data-abrir='hawaiana']")
    pagina.wait_for_timeout(300)
    pagina.click("[data-talla='3']")      # familiar
    pagina.click("[data-estilo='2']")     # orilla rellena
    pagina.wait_for_timeout(200)
    pagina.click("#h-add")
    pagina.wait_for_timeout(300)
    pagina.click("#b-ver")
    pagina.wait_for_timeout(400)

    href = pagina.get_attribute("#c-enviar", "href") or ""
    if not href.startswith(WA_ESPERADO):
        fallas.append(f"el enlace de WhatsApp no empieza con {WA_ESPERADO}: {href[:60]}")

    texto = urllib.parse.unquote(href.split("text=", 1)[-1])
    for debe_estar in ("Hawaiana", "familiar", "Orilla rellena", "TOTAL"):
        if debe_estar not in texto:
            fallas.append(f"al mensaje le falta '{debe_estar}'")

    total = pagina.inner_text("#c-total")
    if total.strip() in ("", "$0"):
        fallas.append(f"el total salio en {total!r}")

    print(f"  pedido     total={total}  mensaje={'ok' if not fallas else 'FALLA'}")
    if fallas:
        print("    mensaje generado:\n      " + texto.replace("\n", "\n      "))
    return fallas


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--shots", action="store_true", help="guarda capturas en dist/capturas/")
    args = ap.parse_args()

    if not PAGINA.exists():
        sys.exit(f"no existe {PAGINA} — corre primero: python build.py")

    todas: list[str] = []
    print(f"revisando {PAGINA.relative_to(RAIZ)}")
    with sync_playwright() as p:
        navegador = p.chromium.launch(args=["--no-sandbox"])
        for nombre, ancho, alto in ANCHOS:
            pagina = navegador.new_page(
                viewport={"width": ancho, "height": alto},
                device_scale_factor=2,
                is_mobile=True,
                has_touch=True,
            )
            todas += [f"[{nombre}] {f}" for f in revisar(pagina, nombre, ancho, args.shots)]
            pagina.close()

        pagina = navegador.new_page(
            viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True
        )
        todas += [f"[pedido] {f}" for f in revisar_pedido(pagina)]
        pagina.close()
        navegador.close()

    print()
    if todas:
        print(f"{len(todas)} problema(s):")
        for f in todas:
            print("  -", f)
        return 1
    print("todo bien.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
