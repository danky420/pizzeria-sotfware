import type { FastifyInstance } from "fastify";
import {
  BACK_OFFICE_ROLES,
  currentUser,
  requireAuth,
  requireRole
} from "../../auth/middleware.js";
import { prisma } from "../../db/prisma.js";
import { presentLocation } from "../../lib/present.js";
import { loadLocation } from "../../lib/scope.js";
import { createLocationBody, idParams, updateLocationBody } from "../../schemas/index.js";

export default async function adminLocationRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);
  app.addHook("preHandler", requireRole(...BACK_OFFICE_ROLES));

  app.get("/locations", async (request) => {
    const user = currentUser(request);
    const locations = await prisma.location.findMany({
      where: user.role === "SUPER_ADMIN" ? {} : { id: user.locationId ?? "" },
      orderBy: { name: "asc" }
    });
    return { locations: locations.map(presentLocation) };
  });

  // Creating a tenant is not a per-location action, so it stays with the only role
  // that is not itself scoped to a location.
  app.post("/locations", { preHandler: requireRole("SUPER_ADMIN") }, async (request, reply) => {
    const body = createLocationBody.parse(request.body);
    const location = await prisma.location.create({ data: body });
    return reply.status(201).send({ location: presentLocation(location) });
  });

  app.get("/locations/:id", async (request) => {
    const { id } = idParams.parse(request.params);
    return { location: presentLocation(await loadLocation(request, id)) };
  });

  app.patch("/locations/:id", async (request) => {
    const { id } = idParams.parse(request.params);
    const body = updateLocationBody.parse(request.body);
    await loadLocation(request, id);
    const location = await prisma.location.update({ where: { id }, data: body });
    return { location: presentLocation(location) };
  });
}
