import type { FastifyInstance } from "fastify";
import { burnTiming, verifyPassword } from "../../auth/hash.js";
import { currentUser, requireAuth } from "../../auth/middleware.js";
import {
  accountLockedError,
  isLocked,
  loginRateLimit,
  registerFailedLogin,
  registerSuccessfulLogin
} from "../../auth/rateLimit.js";
import {
  clearSessionCookie,
  createSession,
  destroySession,
  setSessionCookie,
  toAdminUserContext
} from "../../auth/session.js";
import { prisma } from "../../db/prisma.js";
import { unauthorized } from "../../lib/http-error.js";
import { presentLocation } from "../../lib/present.js";
import { loginBody } from "../../schemas/index.js";

// One message for every failed login, so the response never tells an attacker
// whether the email exists, is inactive, or simply had the wrong password.
const REJECTED = "Email or password is incorrect";

export default async function adminAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/login", { config: loginRateLimit }, async (request, reply) => {
    const { email, password } = loginBody.parse(request.body);

    const user = await prisma.adminUser.findUnique({ where: { email } });
    if (!user || !user.active) {
      await burnTiming(password);
      throw unauthorized(REJECTED);
    }

    if (isLocked(user)) {
      throw accountLockedError(user);
    }

    if (!(await verifyPassword(user.passwordHash, password))) {
      await registerFailedLogin(user.id);
      const after = await prisma.adminUser.findUnique({ where: { id: user.id } });
      if (after && isLocked(after)) {
        throw accountLockedError(after);
      }
      throw unauthorized(REJECTED);
    }

    await registerSuccessfulLogin(user.id);
    const session = await createSession(user.id, { userAgent: request.headers["user-agent"] });
    setSessionCookie(reply, session);

    return { user: toAdminUserContext(user) };
  });

  app.post("/auth/logout", { preHandler: requireAuth }, async (request, reply) => {
    if (request.adminSessionId) {
      await destroySession(request.adminSessionId);
    }
    clearSessionCookie(reply);
    return { ok: true };
  });

  app.get("/auth/me", { preHandler: requireAuth }, async (request) => {
    const user = currentUser(request);
    const location = user.locationId
      ? await prisma.location.findUnique({ where: { id: user.locationId } })
      : null;

    return { user, location: location ? presentLocation(location) : null };
  });
}
