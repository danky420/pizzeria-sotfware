import type { BusinessHours } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { prisma } from "../../db/prisma.js";
import { presentHours } from "../../lib/present.js";
import { loadPublicLocation } from "../../lib/scope.js";
import { slugParams } from "../../schemas/index.js";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Open/closed is decided in the shop's own timezone, never the visitor's — a
 * customer in another timezone must still see Maltrata's clock (same rule the
 * static page's ahora() follows).
 */
function localNow(timezone: string): { dayOfWeek: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date());

  const lookup = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const dayOfWeek = Math.max(0, WEEKDAYS.indexOf(lookup("weekday")));
  const hour = Number(lookup("hour")) % 24;
  const minute = Number(lookup("minute"));

  return { dayOfWeek, minutes: hour * 60 + minute };
}

function isOpen(days: BusinessHours[], timezone: string): boolean {
  const { dayOfWeek, minutes } = localNow(timezone);
  const today = days.find((day) => day.dayOfWeek === dayOfWeek);
  if (!today || today.opensAt === null || today.closesAt === null) return false;
  return minutes >= today.opensAt && minutes < today.closesAt;
}

export default async function publicHoursRoutes(app: FastifyInstance): Promise<void> {
  app.get("/locations/:slug/hours", async (request) => {
    const { slug } = slugParams.parse(request.params);
    const location = await loadPublicLocation(slug);

    const days = await prisma.businessHours.findMany({
      where: { locationId: location.id },
      orderBy: { dayOfWeek: "asc" }
    });

    return {
      timezone: location.timezone,
      openNow: isOpen(days, location.timezone),
      days: presentHours(days)
    };
  });
}
