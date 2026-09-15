import type { AdminRole } from "@prisma/client";
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import { forbidden, unauthorized } from "../lib/http-error.js";
import { type AdminUserContext, type SessionContext, validateSession } from "./session.js";

declare module "fastify" {
  interface FastifyRequest {
    adminUser?: AdminUserContext;
    adminSessionId?: string;
  }
}

export const requireAuth: preHandlerHookHandler = async (request: FastifyRequest, _reply: FastifyReply) => {
  const context: SessionContext | null = await validateSession(request);
  if (!context) {
    throw unauthorized("Sign in to continue");
  }
  request.adminUser = context.user;
  request.adminSessionId = context.session.id;
};

export function currentUser(request: FastifyRequest): AdminUserContext {
  if (!request.adminUser) {
    throw unauthorized("Sign in to continue");
  }
  return request.adminUser;
}

/**
 * The role permission matrix, as two lists. STAFF appears in ORDER_ROLES only —
 * an employee may work the orders queue and nothing else, and that is enforced
 * here rather than by hiding nav items in the SPA.
 */
export const BACK_OFFICE_ROLES: AdminRole[] = ["SUPER_ADMIN", "OWNER", "MANAGER"];
export const ORDER_ROLES: AdminRole[] = ["SUPER_ADMIN", "OWNER", "MANAGER", "STAFF"];

export function requireRole(...roles: AdminRole[]): preHandlerHookHandler {
  return async (request: FastifyRequest) => {
    const user = currentUser(request);
    if (!roles.includes(user.role)) {
      throw forbidden("Your role does not allow this action");
    }
  };
}

export function isSuperAdmin(request: FastifyRequest): boolean {
  return currentUser(request).role === "SUPER_ADMIN";
}

/**
 * The single location-scoping gate. Every admin handler that touches a row owned
 * by a Location must run the row's own locationId through here — a `:locationId`
 * path param is attacker-controlled and proves nothing on its own.
 */
export function assertLocationAccess(request: FastifyRequest, locationId: string | null): void {
  const user = currentUser(request);
  if (user.role === "SUPER_ADMIN") return;
  if (!user.locationId || !locationId || user.locationId !== locationId) {
    throw forbidden("This resource belongs to another location");
  }
}

/**
 * Resolves which location a list endpoint should read. Non-super-admins are pinned
 * to their own location whatever they asked for; super-admins may ask for any, and
 * get every location when they ask for none.
 */
export function resolveLocationFilter(
  request: FastifyRequest,
  requestedLocationId?: string | null
): string | undefined {
  const user = currentUser(request);
  if (user.role === "SUPER_ADMIN") {
    return requestedLocationId ?? undefined;
  }
  if (requestedLocationId) {
    assertLocationAccess(request, requestedLocationId);
  }
  if (!user.locationId) {
    throw forbidden("Your account is not attached to a location");
  }
  return user.locationId;
}
