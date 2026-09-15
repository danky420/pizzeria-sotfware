export function mx(amount: number): string {
  return `$${Math.round(amount).toLocaleString("es-MX")}`;
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
