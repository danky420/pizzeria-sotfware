/**
 * Multi-tenant branding: the shop's name, logo and color scheme come from the
 * fetched `location`, not a hardcoded string (see docs/multi-tenant-branding-plan.md).
 *
 * `App.tsx` only learns the real location after `fetchMenu()` resolves, which
 * runs in a `useEffect` — after first paint. Caching the last-known branding
 * to localStorage and reading it back in a small blocking `<script>` in
 * `index.html` (before `#root`) lets a *returning* visitor's `<html>` get the
 * right `data-scheme` immediately, with no flash of the default scheme. A
 * first-ever visit still briefly shows the default until the fetch resolves —
 * acceptable, not a regression from today's zero-flash behaviour.
 *
 * This is the same "configure once" pattern api/client.ts's API_BASE and
 * lib/format.ts's configureCurrency already use, just persisted across reloads
 * instead of only for the life of the tab. Keep `BRANDING_CACHE_KEY` in sync
 * with the literal duplicated in index.html's inline script — that script
 * can't import this module.
 */
export const BRANDING_CACHE_KEY = "branding-cache-v1";

export interface CachedBranding {
  name: string;
  colorScheme: string;
  logoUrl: string | null;
  // Not needed for the flash-avoidance the inline script does (which only reads
  // colorScheme), but cheap to keep around so the network-failure state in
  // App.tsx can still offer a phone number instead of going silent.
  waNumber: string | null;
  tagline: string | null;
}

export function cacheBranding(branding: CachedBranding): void {
  try {
    window.localStorage.setItem(BRANDING_CACHE_KEY, JSON.stringify(branding));
  } catch {
    // A blocked or full localStorage only costs the flash-avoidance optimization.
  }
}

export function readCachedBranding(): CachedBranding | null {
  try {
    const raw = window.localStorage.getItem(BRANDING_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedBranding>;
    if (typeof parsed.name !== "string" || typeof parsed.colorScheme !== "string") return null;
    return {
      name: parsed.name,
      colorScheme: parsed.colorScheme,
      logoUrl: typeof parsed.logoUrl === "string" ? parsed.logoUrl : null,
      waNumber: typeof parsed.waNumber === "string" ? parsed.waNumber : null,
      tagline: typeof parsed.tagline === "string" ? parsed.tagline : null
    };
  } catch {
    return null;
  }
}

// The light-mode PWA status-bar color (index.html's light theme-color meta)
// -- must match each scheme's --rojo in styles.css exactly, since this can't
// read a CSS custom property before paint. The dark theme-color meta stays
// "#181210" (the fixed dark --crema background) regardless of scheme; only
// --rojo/--rojo-osc/--rojo-hondo/--amarillo shift between schemes, not --crema.
const THEME_COLOR_LIGHT: Record<string, string> = {
  "rojo-clasico": "#D22B27",
  "verde-oliva": "#3F7D42",
  "azul-marino": "#1F5C8B"
};

export function applyColorScheme(colorScheme: string): void {
  document.documentElement.setAttribute("data-scheme", colorScheme);
  const light = THEME_COLOR_LIGHT[colorScheme];
  if (light) {
    document
      .querySelector('meta[name="theme-color"][media="(prefers-color-scheme: light)"]')
      ?.setAttribute("content", light);
  }
}
