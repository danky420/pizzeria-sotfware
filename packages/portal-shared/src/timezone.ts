/**
 * "What day is it, and what UTC instants bound that day" for an arbitrary IANA
 * zone — used to default a filter to "today" in the shop's own wall clock
 * rather than the browser's, or the server's. `Intl.DateTimeFormat` gives us
 * the zone's calendar reading for an instant; there is no zone-arithmetic API
 * more direct than reading it and re-encoding as UTC to find the offset.
 */

function zonedPartsAsUtcMillis(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(date);

  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? "0";
  // Intl's hour12:false reports local midnight as "24", which Date.UTC would
  // otherwise roll into the next day.
  const hour = read("hour") === "24" ? 0 : Number(read("hour"));

  return Date.UTC(
    Number(read("year")),
    Number(read("month")) - 1,
    Number(read("day")),
    hour,
    Number(read("minute")),
    Number(read("second"))
  );
}

/** Minutes to subtract from a UTC instant to get that zone's wall-clock reading. */
function offsetMinutes(date: Date, timeZone: string): number {
  return (zonedPartsAsUtcMillis(date, timeZone) - date.getTime()) / 60_000;
}

/** "YYYY-MM-DD" for the zone's calendar day containing this instant. */
export function zonedDateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

/** The UTC instant range covering one full local calendar day in `timeZone`. */
export function zonedDayRange(dateKey: string, timeZone: string): { from: string; to: string } {
  const utcGuess = new Date(`${dateKey}T00:00:00.000Z`);
  const start = new Date(utcGuess.getTime() - offsetMinutes(utcGuess, timeZone) * 60_000);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  return { from: start.toISOString(), to: end.toISOString() };
}

/** Today's date key and UTC range, read from the shop's own clock. */
export function zonedToday(timeZone: string): { dateKey: string; from: string; to: string } {
  const dateKey = zonedDateKey(new Date(), timeZone);
  return { dateKey, ...zonedDayRange(dateKey, timeZone) };
}
