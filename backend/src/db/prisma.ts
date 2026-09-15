import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";

// tsx watch and vitest re-import this module on every reload; without the global
// cache each reload would open a fresh connection pool until Postgres refuses.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.LOG_LEVEL === "debug" || env.LOG_LEVEL === "trace" ? ["query", "warn", "error"] : ["warn", "error"]
  });

if (!env.isProduction) {
  globalForPrisma.prisma = prisma;
}

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
  if (globalForPrisma.prisma === prisma) {
    delete globalForPrisma.prisma;
  }
}
