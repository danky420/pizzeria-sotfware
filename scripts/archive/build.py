#!/usr/bin/env python3
"""
RETIRED — reference only, do not run.

This built the single-file static site that `customer/` (React + Vite) now
replaces. Its input, `src/index.html`, is archived at
`src/archive/chesare-v2-vanilla-js.html`, so this script no longer has a
template to build and will exit with "falta la plantilla" if invoked.

It is kept for the asset pipeline it documents: the pixel crops
(`RECORTE_MARCA`, `RECORTE_ICONO`) that derive the brand logo, the
home-screen icon and the web manifest from `assets/source/menu-00-portada.jpg`.
If those brand assets are ever needed again, this is where the recipe lives.

The one job that outlived the static site — copying `src/corte.html` to
`dist/` — was dropped: `src/corte.html` is a standalone, asset-free,
token-free page that is opened directly from `src/`.

--- original docstring below ---

Build del sitio de Pizza's Chesa're.

Toma la plantilla src/index.html, genera los assets de marca a partir de la
foto de la portada del menu, y los inyecta como data: URI para producir un
archivo HTML unico y autocontenido en dist/index.html.

Por que se inyecta todo: el sitio se entrega como un solo archivo que se
arrastra a un host estatico (Netlify Drop) o se abre sin conexion desde el
telefono. No puede depender de archivos vecinos.

Uso:
    python build.py            # construye dist/
    python build.py --check    # falla si la plantilla no tiene todos los tokens
"""

from __future__ import annotations

import argparse
import base64
import json
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageEnhance

RAIZ = Path(__file__).resolve().parent
SRC = RAIZ / "src"
ASSETS = RAIZ / "assets" / "source"
DIST = RAIZ / "dist"

# Foto de la portada del menu impreso. De aqui sale el logotipo.
PORTADA = ASSETS / "menu-00-portada.jpg"

# Recortes en pixeles sobre PORTADA (1080x1920).
# Ajustados a mano contra esta foto: si se reemplaza la foto hay que
# recalcularlos. Ver READER.md -> "Reemplazar la foto de portada".
RECORTE_MARCA = (58, 552, 836, 1298)   # logotipo + fondo rojo del menu
RECORTE_ICONO = (120, 600, 800, 1280)  # cuadrado centrado en el logotipo

TOKENS_REQUERIDOS = ("{{MARCA_WEBP_B64}}", "{{ICON_PNG_B64}}", "{{MANIFEST_B64}}")

MANIFEST = {
    "name": "Pizza's Chesa're",
    "short_name": "Chesa're",
    "start_url": "./",
    "scope": "./",
    "display": "standalone",
    "orientation": "portrait",
    "background_color": "#D22B27",
    "theme_color": "#D22B27",
}


def realzar(im: Image.Image) -> Image.Image:
    """La foto del menu esta tomada con luz de interior y sale apagada."""
    im = ImageEnhance.Color(im).enhance(1.14)
    im = ImageEnhance.Brightness(im).enhance(1.06)
    return ImageEnhance.Contrast(im).enhance(1.07)


def b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def a_bytes(im: Image.Image, formato: str, **kw) -> bytes:
    from io import BytesIO

    buf = BytesIO()
    im.save(buf, formato, **kw)
    return buf.getvalue()


def generar_assets() -> dict[str, str]:
    if not PORTADA.exists():
        sys.exit(f"falta la foto de portada: {PORTADA}")

    origen = Image.open(PORTADA)
    if origen.size != (1080, 1920):
        print(
            f"  aviso: la portada mide {origen.size}, no (1080, 1920). "
            "Los recortes de build.py estan calibrados para el original; "
            "revisa RECORTE_MARCA y RECORTE_ICONO.",
            file=sys.stderr,
        )

    # 1. Marca del encabezado: el logotipo con su fondo rojo estampado.
    #    Se uso el recorte en lugar de recortar el logo con transparencia
    #    porque el enmascarado dejaba un halo y se comia los contornos negros.
    marca = realzar(origen.crop(RECORTE_MARCA))
    marca.thumbnail((520, 520), Image.LANCZOS)
    marca_webp = a_bytes(marca, "WEBP", quality=80, method=6)

    # 2. Icono de pantalla de inicio. PNG para iOS (no acepta webp aqui),
    #    webp de 192 px dentro del manifest para Android.
    base_icono = realzar(origen.crop(RECORTE_ICONO))
    icono_png = a_bytes(
        base_icono.resize((180, 180), Image.LANCZOS)
        .quantize(colors=110, method=Image.MEDIANCUT)
        .convert("P"),
        "PNG",
        optimize=True,
    )
    icono_webp = a_bytes(
        base_icono.resize((192, 192), Image.LANCZOS), "WEBP", quality=84, method=6
    )

    # 3. Manifest con el icono incrustado (el sitio es un solo archivo, no
    #    puede apuntar a un icons/ vecino).
    manifest = dict(MANIFEST)
    manifest["icons"] = [
        {
            "src": "data:image/webp;base64," + b64(icono_webp),
            "sizes": "192x192",
            "type": "image/webp",
            "purpose": "any maskable",
        }
    ]
    manifest_b64 = b64(json.dumps(manifest, separators=(",", ":")).encode())

    print(f"  marca.webp   {len(marca_webp) / 1024:6.1f} KB  {marca.size}")
    print(f"  icono.png    {len(icono_png) / 1024:6.1f} KB  (180x180)")
    print(f"  icono.webp   {len(icono_webp) / 1024:6.1f} KB  (192x192)")
    print(f"  manifest     {len(manifest_b64) / 1024:6.1f} KB  (base64)")

    return {
        "{{MARCA_WEBP_B64}}": b64(marca_webp),
        "{{ICON_PNG_B64}}": b64(icono_png),
        "{{MANIFEST_B64}}": manifest_b64,
    }


def revisar_plantilla(html: str) -> None:
    faltan = [t for t in TOKENS_REQUERIDOS if t not in html]
    if faltan:
        sys.exit("la plantilla no tiene estos tokens: " + ", ".join(faltan))


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--check", action="store_true", help="solo valida la plantilla")
    args = ap.parse_args()

    plantilla = SRC / "index.html"
    if not plantilla.exists():
        sys.exit(f"falta la plantilla: {plantilla}")

    html = plantilla.read_text(encoding="utf-8")
    revisar_plantilla(html)
    if args.check:
        print("plantilla ok: estan los", len(TOKENS_REQUERIDOS), "tokens")
        return

    print("generando assets desde", PORTADA.name)
    for token, valor in generar_assets().items():
        html = html.replace(token, valor)

    DIST.mkdir(exist_ok=True)
    salida = DIST / "index.html"
    salida.write_text(html, encoding="utf-8")

    # corte.html no lleva assets, se copia tal cual
    shutil.copy2(SRC / "corte.html", DIST / "corte.html")

    print(f"\nlisto -> {salida.relative_to(RAIZ)}  ({salida.stat().st_size / 1024:.0f} KB)")
    print(f"        {(DIST / 'corte.html').relative_to(RAIZ)}")
    print("\nArrastra dist/ completo a https://app.netlify.com/drop")


if __name__ == "__main__":
    main()
