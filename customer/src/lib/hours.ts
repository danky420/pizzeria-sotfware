import type { HoursDay, HoursResponse } from "../api/types";
import { hhmm, nombreDia } from "./format";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export interface ShopStatus {
  open: boolean;
  /** "cierra 12:00 am" or "abre hoy a las 6:00 pm" — the tail of the header pill. */
  detalle: string;
  /** Wording for the closed banner, e.g. "hoy a las 6:00 pm". Empty while open. */
  proxima: string;
  today: number;
}

/**
 * Open/closed follows the shop's wall clock, never the visitor's — a customer in
 * another timezone still sees Maltrata's hours. Same rule the server applies in
 * its own `openNow`, recomputed here so the countdown text stays live between
 * fetches.
 */
function localNow(timezone: string): { dayOfWeek: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date());

  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const dayOfWeek = Math.max(0, WEEKDAYS.indexOf(read("weekday")));
  const hour = Number(read("hour")) % 24;
  return { dayOfWeek, minutes: hour * 60 + Number(read("minute")) };
}

function dayAt(days: HoursDay[], dayOfWeek: number): HoursDay | undefined {
  return days.find((day) => day.dayOfWeek === dayOfWeek);
}

export function shopStatus(hours: HoursResponse): ShopStatus {
  const { dayOfWeek, minutes } = localNow(hours.timezone);
  const today = dayAt(hours.days, dayOfWeek);

  if (today && today.opensAt !== null && today.closesAt !== null) {
    if (minutes >= today.opensAt && minutes < today.closesAt) {
      return { open: true, detalle: `cierra ${hhmm(today.closesAt)}`, proxima: "", today: dayOfWeek };
    }
    if (minutes < today.opensAt) {
      const proxima = `hoy a las ${hhmm(today.opensAt)}`;
      return { open: false, detalle: `abre ${proxima}`, proxima, today: dayOfWeek };
    }
  }

  let proxima = "";
  for (let step = 1; step <= 7; step += 1) {
    const candidate = dayAt(hours.days, (dayOfWeek + step) % 7);
    if (!candidate || candidate.opensAt === null) continue;
    const cuando = step === 1 ? "mañana" : `el ${nombreDia(candidate.dayOfWeek).toLowerCase()}`;
    proxima = `${cuando} a las ${hhmm(candidate.opensAt)}`;
    break;
  }

  return { open: false, detalle: proxima ? `abre ${proxima}` : "", proxima, today: dayOfWeek };
}
