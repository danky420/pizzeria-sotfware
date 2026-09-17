// Set once, when the menu response arrives (App.tsx has the location's
// configured currency; nothing else in this file does) -- the same
// configure-once pattern api/client.ts uses for the API base URL, so every
// existing mx() call site keeps working with no argument to thread through.
let currentCurrency = "MXN";

export function configureCurrency(currency: string): void {
  currentCurrency = currency;
}

/**
 * MXN and USD both commonly render with a bare "$", which would silently mean
 * two different amounts of money depending on which the shop has configured --
 * passing `currency` through Intl is what disambiguates them (typically as
 * "US$" or "USD" for the latter, exact glyph depends on the runtime's ICU
 * data). minimumFractionDigits stays 0 so a whole-peso price still reads as
 * "$70", not "$70.00", matching every price on the shop's printed menu.
 */
export function mx(amount: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: currentCurrency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(amount);
}

/** Minutes from midnight to the shop's own clock wording; 1440 is midnight closing. */
export function hhmm(minutes: number): string {
  if (minutes >= 1440) return "12:00 am";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return `${h12}:${m < 10 ? `0${m}` : m} ${suffix}`;
}

export const DIAS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado"
] as const;

export function nombreDia(dayOfWeek: number): string {
  return DIAS[dayOfWeek] ?? "";
}
