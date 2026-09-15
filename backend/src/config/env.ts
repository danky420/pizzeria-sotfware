import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

const here = dirname(fileURLToPath(import.meta.url));
export const backendRoot = resolve(here, "..", "..");
export const repoRoot = resolve(backendRoot, "..");

// The repo ships a single .env at the root (see .env.example) but the server is
// started from backend/, so both locations are read. First value wins.
loadDotenv({ path: resolve(backendRoot, ".env"), quiet: true });
loadDotenv({ path: resolve(repoRoot, ".env"), quiet: true });

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_COOKIE_SECRET: z
    .string()
    .min(32, "SESSION_COOKIE_SECRET must be at least 32 characters"),
  ADMIN_ORIGIN: z.string().min(1).optional(),
  PUBLIC_SITE_ORIGINS: z.string().default("")
});

function parseOrigins(raw: string): string[] {
  return raw
    .split(",")
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter((origin) => origin.length > 0);
}

function load() {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  const value = parsed.data;
  const adminOrigin = value.ADMIN_ORIGIN?.replace(/\/+$/, "");

  return {
    ...value,
    ADMIN_ORIGIN: adminOrigin,
    publicSiteOrigins: parseOrigins(value.PUBLIC_SITE_ORIGINS),
    allowedOrigins: [...parseOrigins(value.PUBLIC_SITE_ORIGINS), ...(adminOrigin ? [adminOrigin] : [])],
    isProduction: value.NODE_ENV === "production",
    isTest: value.NODE_ENV === "test",
    backendRoot,
    repoRoot,
    adminDistDir: resolve(repoRoot, "admin", "dist")
  };
}

export type Env = ReturnType<typeof load>;

export const env: Env = load();
