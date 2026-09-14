# Pizza's Chesa're — ordering site

Mobile ordering page for **Pizza's Chesa're**, a pizzería on Av. Ignacio
Zaragoza, Maltrata, Veracruz, Mexico. Customers browse the menu, build an
order, and send it to the shop's WhatsApp as a formatted message. The shop
pays no commission on anything ordered through it.

This is the first build of a custom-software-for-small-business line of work.
It is deliberately small: no backend, no accounts, no database, no delivery
platform in the middle.

---

## Why it is built this way

The constraints came from the business, not from preference:

- **The owner takes orders by phone and WhatsApp today.** The page produces a
  WhatsApp message, because that is the workflow that already exists. Nothing
  new to learn.
- **There is no POS, no inventory system and no staff to run one.** Anything
  requiring daily data entry would be abandoned in a week.
- **Delivery apps charge 15–30% nominal, and IVA lands on top of the
  commission.** Every order that comes through this page instead of Rappi or
  DiDi keeps that margin in the shop.
- **Rural mountain town, patchy data.** The site is one self-contained file
  with every asset inlined. It loads on a bad connection and works offline
  once installed to the home screen.
- **Evening-only business** (opens 5:30–6 pm, closed Thursdays). People browse
  in the afternoon for a 7 pm dinner, so the page stays orderable while
  closed and says when it opens.

---

## Architecture

```
  assets/source/*.jpg  ──┐
                         ├──►  build.py  ──►  dist/index.html   (one file, ~180 KB)
  src/index.html      ───┘                    dist/corte.html
  (template w/ tokens)
```

There is no framework, no bundler, no transpiler and no package manager for
the site itself. `src/index.html` is hand-written HTML, CSS and vanilla JS.
Python exists only to generate brand assets and inline them.

**The build's whole job** is turning three tokens in the template into
base64 `data:` URIs:

| Token | Becomes | Why inlined |
|---|---|---|
| `{{MARCA_WEBP_B64}}` | Header logo (WebP, 520 px) | Single-file delivery |
| `{{ICON_PNG_B64}}` | Home-screen icon (PNG, 180×180) | iOS `apple-touch-icon` won't take WebP |
| `{{MANIFEST_B64}}` | Web app manifest (with its own 192 px WebP icon inside) | Manifest can't reference a neighbouring file |

All three derive from **one photograph**: `assets/source/menu-00-portada.jpg`,
the cover of the shop's printed menu. The logo is used as a *crop of the
printed cover*, red patterned background and all — not a transparent cutout.
Masking the red out left a halo, and eroding hard enough to kill the halo ate
the black outlines off the lettering. The crop looks better and is a third of
the size.

### Runtime structure of `src/index.html`

Everything lives in one IIFE at the bottom of the file.

- **Menu data** — plain JS arrays near the top of the script:
  `TALLAS`, `ESTILOS`, `PIZZAS`, `ESPECIALES`, `BURGERS`, `ALITAS_65`,
  `ALITAS_80`, `PASTAS`, `POSTRES`, `FRAPPES`, `CAFES`, `REFRESCOS`,
  `CERVEZAS`, `HORAS`. **This is the menu.** Editing these arrays is 95% of
  all maintenance.
- **Rendering** — `tarjeta()` builds a tappable product card, `filas()` builds
  a compact price list. Sections are assembled into one HTML string and
  written to `#main` once on load.
- **Icons** — `icPizza()`, `icBurger()`, `icWing()` etc. return inline SVG
  strings. `icPizza(tops)` takes an array of hex colours and scatters 11
  toppings across the pie. There are no food photographs yet.
- **Product sheet** — `abrirPizza()` (size × style matrix), `abrirFijo()`
  (single price), `abrirLista()` (pick one from a list, e.g. wing sauces).
  State lives in the module-level `cfg` object.
- **Cart** — the `carro` array. `meter()` adds, `pintarCarro()` renders,
  `liga()` rebuilds the `wa.me` URL on every change.
- **Open/closed** — `ahora()` reads the wall clock in `America/Mexico_City`
  via `Intl.DateTimeFormat`, never the visitor's local time. Re-checks every
  60 s.

### Important files

| Path | What it is |
|---|---|
| `src/index.html` | **The site.** Template with 3 asset tokens. Edit this, never `dist/`. |
| `src/corte.html` | Standalone margin calculator — models what delivery-app commission actually costs the shop. Sales tool, not part of the customer site. No assets, no tokens. |
| `src/archive/chesare-v1.html` | First pass, superseded. Dark "oven at night" palette, placeholder prices, before the real menu arrived. Kept for reference only — do not deploy. |
| `build.py` | Asset pipeline + token injection. |
| `assets/source/` | Photographs of the shop's printed menu. **These are the price source of truth.** |
| `scripts/check_mobile.py` | Mobile layout regression check. |
| `dist/` | Build output. Gitignored. |

---

## Prerequisites

- **Python 3.9+** — build and checks only. The site itself needs nothing.
- **Pillow** — image processing.
- **Playwright + Chromium** — optional, only for `scripts/check_mobile.py`.
- A text editor. That is the entire toolchain.

---

## Setting up a fresh environment

```bash
git clone <remote-url> chesare-pizzeria
cd chesare-pizzeria

python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

pip install -r requirements.txt
playwright install chromium        # optional, for check_mobile.py

python build.py                    # writes dist/
```

### Environment variables

**There are none.** No API keys, no tokens, no connection strings. `.env.example`
exists only to establish the convention if that ever changes.

---

## Running locally

`dist/index.html` is self-contained — open it directly:

```bash
python build.py && open dist/index.html        # macOS
python build.py && xdg-open dist/index.html    # Linux
```

To exercise it the way a phone would (and to make the web manifest work,
which needs a real origin):

```bash
python -m http.server 8000 --directory dist
# then http://localhost:8000  — use your browser's device toolbar
```

For testing on an actual phone on the same wifi:

```bash
python -m http.server 8000 --directory dist --bind 0.0.0.0
# then http://<your-lan-ip>:8000 from the phone
```

---

## Common commands

| Command | Does |
|---|---|
| `python build.py` | Build `dist/` |
| `python build.py --check` | Verify the template still has all 3 tokens (fast, no image work) |
| `python scripts/check_mobile.py` | Layout + order-flow checks at 3 phone widths |
| `python scripts/check_mobile.py --shots` | Same, plus screenshots to `dist/capturas/` |
| `python -m http.server 8000 --directory dist` | Serve locally |

### Tests, linting, type-checking

**None configured.** `scripts/check_mobile.py` is the only automated check and
it is a smoke test, not a test suite. There is no linter, formatter or type
checker set up. *TODO: if this grows past one page, add `ruff` for the Python
and consider Prettier for the HTML.*

---

## How configuration is managed

Configuration is **literal values in `src/index.html`**, not a config file.
This is a deliberate trade for a one-page site, but it means you need to know
where things live:

| Thing | Where | Note |
|---|---|---|
| WhatsApp number | `var WA = "522722603537"` near the top of the script | Country code + 10 digits, no `+`, no spaces |
| Opening hours | `HORAS` array | Index 0 = Sunday. `a`/`c` are decimal hours (`17.5` = 5:30 pm), `a: null` = closed that day |
| Timezone | Hardcoded `"America/Mexico_City"` in `ahora()` | Deliberate — never the visitor's timezone |
| Prices | The menu arrays | See below |
| Colours | CSS custom properties on `:root`, with dark-mode overrides | Brand red `#D22B27`, sign yellow `#FFD429` |
| Image crops | `RECORTE_MARCA` / `RECORTE_ICONO` in `build.py` | Pixel coords against the 1080×1920 original |

---

## How to add or change menu items

This is the common task. All of it happens in `src/index.html`.

**A new pizza** (uses the size × style price matrix):

```js
var PIZZAS = [
  // ...
  {id:"pastor", n:"Al pastor", d:"Carne al pastor y piña.", top:["#B3441F","#F2C93B"]}
];
```

`id` must be unique across the whole menu. `top` is the topping colours for
the generated SVG. `fav: true` adds the yellow "Favorita" badge.

**A fixed-price specialty** — add to `ESPECIALES` with a `p:` value.

**A drink, dessert, burger or coffee** — add `{id, n, p}` to the right array.
Set `p: null` when the shop hasn't given you a price; the row renders greyed
out as "Pregunta el precio" and can't be added to the cart. Use this instead
of guessing.

**Changing sizes or crust prices** — `TALLAS`. Each `p` array is
`[normal, extra queso, orilla rellena]`, matching the columns on the printed
menu.

**A whole new section** — add to `SECS` (drives the sticky nav), then append a
`<section id="...">` to the `H` string, then make sure the click handler at
the bottom of the script knows how to route the new `data-sec` value.

After any menu change:

```bash
python build.py && python scripts/check_mobile.py
```

---

## Git workflow

- **`main` is always deployable.** What is on `main` should be safe to drag
  onto a host.
- **Branch per change**, named `<type>/<short-slug>`:
  - `feat/` new capability — `feat/half-and-half-pizzas`
  - `fix/` bug — `fix/wa-link-521-prefix`
  - `menu/` price or item changes — `menu/precios-enero`
  - `docs/` documentation only
  - `chore/` tooling, build, housekeeping
- Merge back into `main` via PR if the repo has more than one person on it;
  fast-forward merge is fine while it's solo.

### Commits

Present tense, imperative, scoped. What changed and why:

```
menu: update pizza sizes to January prices
fix: move .acciones out of .cab-info so Llamar isn't clipped
feat: add half-and-half pizza option to the size sheet
```

Keep menu-data changes in their own commits, separate from layout or logic
changes. When prices move you want to be able to read the history and see
exactly when and by how much — that record is useful to the owner.

Never commit `dist/`. It's gitignored, and it's 180 KB of base64 that would
produce an unreadable diff on every build.

---

## Handling secrets

There are no secrets in this project and it should stay that way.

- Never paste a hosting token, API key or password into any tracked file.
- If a backend is ever added, values go in `.env` (gitignored) with the shape
  documented in `.env.example`.
- The two phone numbers on the site are the business's own publicly printed
  contact details — they are on the storefront sign and the menu cover. Those
  are fine to commit. Customer names, addresses and order contents are **not**
  and never touch disk: they live in the URL of a WhatsApp link the customer
  taps and nowhere else. Do not add analytics or logging that would capture
  them.
- If something sensitive does get committed, rewriting history is not enough —
  rotate the credential first, then clean the history.

---

## Validating before you commit

```bash
python build.py --check          # template tokens intact
python build.py                  # builds clean
python scripts/check_mobile.py   # layout + order flow pass at 3 widths
git status                       # nothing unexpected staged
git diff --cached                # read what you're actually committing
```

Then, by hand, because the script doesn't catch these:

- Open `dist/index.html` in a real browser at phone width.
- Add something to the cart and read the generated WhatsApp message end to
  end. It goes to a human in a kitchen — it has to be legible.
- Toggle dark mode. The palette has a full dark variant and it's easy to break.

---

## Deployment

No hosting is set up yet. Current process is manual:

1. `python build.py`
2. Drag `dist/` onto <https://app.netlify.com/drop>
3. Claim the deploy with a free account, or the temporary URL expires
4. Send the URL to the shop

*TODO: decide on permanent hosting and a domain. Once there's a real origin,
split the manifest and icons out of the HTML into proper files and add a
service worker — data-URI manifests are inconsistently honoured by Chrome,
and a service worker would make the menu load with no signal at all, which
matters in Maltrata.*

*TODO: no CI. A GitHub Action running `build.py` and `check_mobile.py` on
every PR would be about twenty lines.*

---

## Debugging

**Build fails with "la plantilla no tiene estos tokens"** — a token in
`src/index.html` got clobbered, usually by editing `dist/` instead of `src/`.
Check `grep -o '{{[A-Z0-9_]*}}' src/index.html`.

**Logo looks wrong after swapping the cover photo** — `RECORTE_MARCA` and
`RECORTE_ICONO` in `build.py` are pixel coordinates calibrated against the
original 1080×1920 photograph. A different photo needs different numbers.
`build.py` warns if the dimensions don't match but it can't fix the crop.

**Fonts look wrong** — Bevan and Rubik come from Google Fonts, the only
external request the page makes. Offline or behind a blocker you get the
fallback stacks. Layout holds either way, but nothing has been verified
against the real fonts on a real device yet.

**WhatsApp link doesn't open** — see the gotchas below.

**Sheet gets cut off at the bottom on iOS** — the sheet uses `88dvh` with a
`90vh` fallback. If it regresses, the dynamic viewport unit is the thing to
check.

**A menu item won't add to the cart** — it probably has `p: null`, which is
intentional for items with no known price.

---

## Project-specific gotchas

1. **The shop's name is spelled two ways by the shop itself.** The logo reads
   *Chesa've*; the printed menu header, the storefront sign and the Google
   listing all say *Chesa're*. The site uses *Chesa're* (3 of 4 sources).
   *TODO: get the owner to pick one — the split is costing them search
   traffic.*

2. **The WhatsApp number is unverified.** `WA = "522722603537"`. Mexican
   mobile numbers sometimes need `521` + 10 digits rather than `52` + 10.
   **This has never been tested on a real Mexican handset.** It is the single
   highest-risk line in the codebase — if it's wrong, nothing works and the
   page fails silently. *TODO: test on a real phone. Also confirm which of the
   two numbers (272 260 3537 / 272 100 5211) is actually on WhatsApp.*

3. **Three menu items have no price** because the printed menu has blank
   stickers where the price should be: refresco 400 ml, botella de agua,
   michelada. They render as "Pregunta el precio". *TODO: get real prices.*

4. **The four `ESPECIALES` have no size.** Carnes frías $195, Boloñesa $200,
   Suprema $195, Vegetariana $195 — those sit between Grande ($165) and
   Familiar ($240) on the size table, so presumably they're one specific size,
   but the menu doesn't say. *TODO: ask.*

5. **The wings price tiers are a guess.** The printed menu has a $65 sticker
   beside the first 8 sauces and an $80 sticker below the next 7. Read here as
   two flavour tiers. It could just as easily mean wings $65 / boneless $80.
   *TODO: confirm before this goes in front of customers.*

6. **Caguama price is ambiguous handwriting** — entered as $90, could be $70.
   *TODO: verify.*

7. **Every price on the printed menu is a handwritten sticker over the printed
   one.** The paper menu can't keep up with repricing. That gap is the reason
   this project exists.

8. **Comments and UI strings are in Spanish, documentation is in English.**
   The product ships to Spanish speakers; the docs are for the developer. Keep
   it that way — don't translate UI strings to English "for clarity".

9. **`p: null` is load-bearing.** It is how "we don't know this price" is
   represented. Never substitute a guess.

10. **Beer is on the menu.** The footer carries an 18+ notice. Any change to
    the beverages section should keep it. *TODO: check whether Veracruz has
    delivery rules for alcohol that need more than a notice.*

11. **No analytics, no cookies, no consent banner** — because there's nothing
    to consent to. Adding any tracking means adding a banner and rethinking
    the privacy position above. Think hard before doing it.

12. **Prices in the code must match `assets/source/`.** Those photographs are
    the source of truth. When the owner reprices, take a new photo, replace
    the file, and update the arrays in the same commit.

---

## Open questions

- *TODO: no written agreement with the shop about who owns this code, what
  happens if the relationship ends, or whether the menu photographs can be
  redistributed. Worth settling before anything goes live on their domain.*
- *TODO: no delivery fee or minimum order in the model — unknown whether the
  shop charges either.*
- *TODO: `src/corte.html` uses market-range commission figures, not Chesa're's
  actual numbers. It's a demo until real figures replace them.*
