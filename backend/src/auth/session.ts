import { randomBytes } from "node:crypto";
import type { AdminRole, AdminSession, AdminUser } from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";

export const SESSION_COOKIE_NAME = "chesare_admin_session";
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

// Sliding expiry: the row is only rewritten once the session is more than half an
// hour into its window, so a busy admin does not cause a write on every request.
const SLIDE_THRESHOLD_MS = 30 * 60 * 1000;

export interface AdminUserContext {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  locationId: string | null;
}

export interface SessionContext {
  session: AdminSession;
  user: AdminUserContext;
}

export function toAdminUserContext(user: AdminUser): AdminUserContext {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    locationId: user.locationId
  };
}

function newSessionId(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(
  adminUserId: string,
  meta: { userAgent?: string | undefined } = {}
): Promise<AdminSession> {
  return prisma.adminSession.create({
    data: {
      id: newSessionId(),
      adminUserId,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      userAgent: meta.userAgent?.slice(0, 255) ?? null
    }
  });
}

export function setSessionCookie(reply: FastifyReply, session: AdminSession): void {
  reply.setCookie(SESSION_COOKIE_NAME, session.id, {
    httpOnly: true,
    signed: true,
    path: "/",
    // Production serves the SPA and the API from one origin, so Lax is enough and
    // is the safer default. Local dev runs the Vite server on another origin, which
    // only works with SameSite=None (which in turn requires Secure — browsers treat
    // http://localhost as a secure context).
    sameSite: env.isProduction ? "lax" : "none",
    secure: true,
    expires: session.expiresAt
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    signed: true,
    path: "/",
    sameSite: env.isProduction ? "lax" : "none",
    secure: true
  });
}

export function readSessionId(request: FastifyRequest): string | null {
  const raw = request.cookies[SESSION_COOKIE_NAME];
  if (!raw) return null;
  const unsigned = request.unsignCookie(raw);
  return unsigned.valid && unsigned.value ? unsigned.value : null;
}

export async function validateSession(request: FastifyRequest): Promise<SessionContext | null> {
  const sessionId = readSessionId(request);
  if (!sessionId) return null;

  const session = await prisma.adminSession.findUnique({
    where: { id: sessionId },
    include: { adminUser: true }
  });

  if (!session) return null;

  if (session.expiresAt.getTime() <= Date.now()) {
    await destroySession(session.id);
    return null;
  }

  if (!session.adminUser.active) {
    await destroySession(session.id);
    return null;
  }

  const now = Date.now();
  let current: AdminSession = session;
  if (session.expiresAt.getTime() - now < SESSION_TTL_MS - SLIDE_THRESHOLD_MS) {
    current = await prisma.adminSession.update({
      where: { id: session.id },
      data: { expiresAt: new Date(now + SESSION_TTL_MS), lastSeenAt: new Date(now) }
    });
  }

  return { session: current, user: toAdminUserContext(session.adminUser) };
}

export async function destroySession(sessionId: string): Promise<void> {
  await prisma.adminSession.deleteMany({ where: { id: sessionId } });
}

export async function destroyAllSessionsForUser(adminUserId: string): Promise<void> {
  await prisma.adminSession.deleteMany({ where: { adminUserId } });
}

export async function sweepExpiredSessions(): Promise<number> {
  const result = await prisma.adminSession.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  return result.count;
}
