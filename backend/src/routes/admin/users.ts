import { Prisma, type AdminRole } from "@prisma/client";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { hashPassword } from "../../auth/hash.js";
import {
  BACK_OFFICE_ROLES,
  currentUser,
  requireAuth,
  requireRole
} from "../../auth/middleware.js";
import { destroyAllSessionsForUser } from "../../auth/session.js";
import { prisma } from "../../db/prisma.js";
import { conflict, forbidden } from "../../lib/http-error.js";
import { presentUser } from "../../lib/present.js";
import { loadAdminUser, loadLocation } from "../../lib/scope.js";
import { createUserBody, idParams, updateUserBody } from "../../schemas/index.js";

// A location-scoped admin must not be able to mint an account that outranks the
// whole location, so SUPER_ADMIN can only ever be granted by a SUPER_ADMIN.
function assertCanGrant(request: FastifyRequest, role: AdminRole): void {
  if (role === "SUPER_ADMIN" && currentUser(request).role !== "SUPER_ADMIN") {
    throw forbidden("Only a super admin can grant that role");
  }
}

export default async function adminUserRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", requireAuth);
  app.addHook("preHandler", requireRole(...BACK_OFFICE_ROLES));

  app.get("/locations/:id/users", async (request) => {
    const { id } = idParams.parse(request.params);
    await loadLocation(request, id);
    const users = await prisma.adminUser.findMany({
      where: { locationId: id },
      orderBy: { createdAt: "asc" }
    });
    return { users: users.map(presentUser) };
  });

  app.post("/locations/:id/users", async (request, reply) => {
    const { id } = idParams.parse(request.params);
    const body = createUserBody.parse(request.body);
    await loadLocation(request, id);
    assertCanGrant(request, body.role);

    const user = await prisma.adminUser.create({
      data: {
        locationId: id,
        email: body.email,
        name: body.name,
        role: body.role,
        passwordHash: await hashPassword(body.password)
      }
    });

    return reply.status(201).send({ user: presentUser(user) });
  });

  app.patch("/users/:id", async (request) => {
    const { id } = idParams.parse(request.params);
    const body = updateUserBody.parse(request.body);
    const target = await loadAdminUser(request, id);
    if (body.role) assertCanGrant(request, body.role);
    assertCanGrant(request, target.role);

    if (body.active === false && target.id === currentUser(request).id) {
      throw forbidden("You cannot deactivate your own account");
    }

    const user = await prisma.adminUser.update({
      where: { id },
      data: {
        ...(body.name === undefined ? {} : { name: body.name }),
        ...(body.role === undefined ? {} : { role: body.role }),
        ...(body.active === undefined ? {} : { active: body.active }),
        ...(body.password === undefined
          ? {}
          : { passwordHash: await hashPassword(body.password), failedLoginAttempts: 0, lockedUntil: null })
      }
    });

    // A role change, a lock-out reversal or a new password must take effect now,
    // not whenever the old 8h session happens to expire.
    if (body.role !== undefined || body.password !== undefined || body.active === false) {
      await destroyAllSessionsForUser(id);
    }

    return { user: presentUser(user) };
  });

  app.delete("/users/:id", async (request) => {
    const { id } = idParams.parse(request.params);
    const target = await loadAdminUser(request, id);
    assertCanGrant(request, target.role);

    if (target.id === currentUser(request).id) {
      throw forbidden("You cannot delete your own account");
    }

    try {
      await prisma.adminUser.delete({ where: { id } });
    } catch (error) {
      // OrderEdit.editedBy is onDelete: Restrict -- an account that has ever
      // corrected an order keeps that attribution rather than going anonymous
      // because the account was later removed. Deactivate it instead.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw conflict("This account has edited orders and can't be deleted — deactivate it instead");
      }
      throw error;
    }
    return { ok: true };
  });
}
