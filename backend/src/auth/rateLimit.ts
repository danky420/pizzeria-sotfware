import type { AdminUser } from "@prisma/client";
import type { FastifyRequest, RouteShorthandOptions } from "fastify";
import { prisma } from "../db/prisma.js";
import { HttpError } from "../lib/http-error.js";

export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;

type RateLimitRouteConfig = NonNullable<RouteShorthandOptions["config"]>;

function emailFromBody(request: FastifyRequest): string {
  const body = request.body as { email?: unknown } | undefined;
  return typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
}

/**
 * Login throttle: 10 attempts per 15 minutes per IP+email pair. Keyed on both so
 * one IP cannot grind through a list of accounts, and runs on preHandler because
 * the body (and therefore the email) does not exist yet at onRequest.
 */
export const loginRateLimit: RateLimitRouteConfig = {
  rateLimit: {
    max: 10,
    timeWindow: "15 minutes",
    hook: "preHandler",
    keyGenerator: (request: FastifyRequest) => `login:${request.ip}:${emailFromBody(request)}`
  }
};

/**
 * The public order endpoint is the only unauthenticated write in the API, so it
 * gets a hard per-IP cap on top of the Zod payload caps.
 */
export const publicOrderRateLimit: RateLimitRouteConfig = {
  rateLimit: {
    max: 20,
    timeWindow: "10 minutes",
    keyGenerator: (request: FastifyRequest) => `order:${request.ip}`
  }
};

/**
 * Order-tracking lookup is read-only but still unauthenticated and takes a
 * phone number, so it gets its own cap: generous enough for one customer
 * polling an open tracking tab every few seconds, tight enough that grinding
 * through order numbers against a guessed phone is slow.
 */
export const publicTrackRateLimit: RateLimitRouteConfig = {
  rateLimit: {
    max: 60,
    timeWindow: "10 minutes",
    keyGenerator: (request: FastifyRequest) => `track:${request.ip}`
  }
};

export function isLocked(user: Pick<AdminUser, "lockedUntil">): boolean {
  return user.lockedUntil !== null && user.lockedUntil.getTime() > Date.now();
}

export function lockRetryAfterSeconds(user: Pick<AdminUser, "lockedUntil">): number {
  if (!user.lockedUntil) return 0;
  return Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 1000));
}

export function accountLockedError(user: Pick<AdminUser, "lockedUntil">): HttpError {
  return new HttpError(423, "ACCOUNT_LOCKED", "Too many failed attempts. Try again later.", {
    retryAfterSeconds: lockRetryAfterSeconds(user)
  });
}

export async function registerFailedLogin(userId: string): Promise<void> {
  const updated = await prisma.adminUser.update({
    where: { id: userId },
    data: { failedLoginAttempts: { increment: 1 } },
    select: { failedLoginAttempts: true }
  });

  if (updated.failedLoginAttempts >= MAX_FAILED_LOGIN_ATTEMPTS) {
    await prisma.adminUser.update({
      where: { id: userId },
      data: { lockedUntil: new Date(Date.now() + LOCKOUT_MS), failedLoginAttempts: 0 }
    });
  }
}

export async function registerSuccessfulLogin(userId: string): Promise<void> {
  await prisma.adminUser.update({
    where: { id: userId },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() }
  });
}
