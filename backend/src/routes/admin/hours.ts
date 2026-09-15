import type { FastifyInstance } from "fastify";
import { BACK_OFFICE_ROLES, requireAuth, requireRole } from "../../auth/middleware.js";
import { prisma } from "../../db/prisma.js";
import { presentHours } from "../../lib/present.js";
import { loadLocation } from "../../lib/scope.js";
import { idParams, putHoursBody } from "../../schemas/index.js";

export default async function adminHoursRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);
  app.addHook("preHandler", requireRole(...BACK_OFFICE_ROLES));

  app.get("/locations/:id/hours", async (request) => {
    const { id } = idParams.parse(request.params);
    await loadLocation(request, id);
    const days = await prisma.businessHours.findMany({
      where: { locationId: id },
      orderBy: { dayOfWeek: "asc" }
    });
    return { days: presentHours(days) };
  });

  app.put("/locations/:id/hours", async (request) => {
    const { id } = idParams.parse(request.params);
    const body = putHoursBody.parse(request.body);
    await loadLocation(request, id);

    await prisma.$transaction(
      body.days.map((day) =>
        prisma.businessHours.upsert({
          where: { locationId_dayOfWeek: { locationId: id, dayOfWeek: day.dayOfWeek } },
          create: {
            locationId: id,
            dayOfWeek: day.dayOfWeek,
            opensAt: day.opensAt,
            closesAt: day.closesAt
          },
          update: { opensAt: day.opensAt, closesAt: day.closesAt }
        })
      )
    );

    const days = await prisma.businessHours.findMany({
      where: { locationId: id },
      orderBy: { dayOfWeek: "asc" }
    });
    return { days: presentHours(days) };
  });
}
