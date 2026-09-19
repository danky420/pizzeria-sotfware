/**
 * Onboard a new restaurant tenant.
 *
 * `--target local` (the only one implemented today) stands up a real, fully
 * isolated local instance: its own Postgres database, migrated fresh, with
 * a single Location row and one OWNER login -- then starts dev instances of
 * all four apps (backend, admin, employee, customer) pointed at it, on their
 * own ports so they can run alongside the primary dev stack.
 *
 * `--target railway` is a deliberate stub. Provisioning real Railway
 * infrastructure needs to be built against Chesa're's actual first
 * deployment, not guessed at beforehand -- see docs/ (once that deployment
 * exists) for the real topology this will replicate.
 *
 * Usage:
 *   npm run onboard -- --slug=tacos-el-buen-sabor --name="Tacos El Buen Sabor" \
 *     --wa=522721234567 --owner-email=owner@tacos.mx [--port-offset=1000] [--no-start]
 *   npm run onboard -- --stop tacos-el-buen-sabor [--drop-db]
 */
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../backend/src/auth/hash.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const backendDir = resolve(repoRoot, "backend");
const stateDir = resolve(repoRoot, ".onboard");

loadDotenv({ path: resolve(backendDir, ".env"), quiet: true });
loadDotenv({ path: resolve(repoRoot, ".env"), quiet: true });

// ---- reuse the exact same validation the admin API applies -- a config
// that would fail POST /api/admin/locations must fail here too. ----
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const WA_RE = /^[0-9]{10,15}$/;

interface TenantState {
  slug: string;
  dbName: string;
  ports: { backend: number; admin: number; employee: number; customer: number };
  pids: Partial<Record<"backend" | "admin" | "employee" | "customer", number>>;
  ownerEmail: string;
  createdAt: string;
}

function fail(message: string): never {
  console.error(`onboard: ${message}`);
  process.exit(1);
}

function generatePassword(): string {
  return randomBytes(18).toString("base64url");
}

function baseConnection(): { prefix: string; host: string } {
  const raw = process.env.DATABASE_URL;
  if (!raw) fail("DATABASE_URL is not set (check .env / backend/.env)");
  const match = raw!.match(/^(postgresql:\/\/[^/]+)\/([^?]+)(\?.*)?$/);
  if (!match) fail(`DATABASE_URL is not in the expected postgresql://user:pass@host:port/db form: ${raw}`);
  return { prefix: match![1], host: match![1] };
}

function dbNameFor(slug: string): string {
  return `pizzeria_${slug.replace(/-/g, "_")}`;
}

function stateFile(slug: string): string {
  return resolve(stateDir, `${slug}.json`);
}

function readState(slug: string): TenantState {
  const path = stateFile(slug);
  if (!existsSync(path)) fail(`No local onboarding state found for "${slug}" (looked in ${path})`);
  return JSON.parse(readFileSync(path, "utf8")) as TenantState;
}

function candidatePorts(offset: number) {
  return { backend: 3000 + offset, admin: 5173 + offset, employee: 5174 + offset, customer: 8000 + offset };
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const server = createServer();
    server.once("error", () => resolvePromise(false));
    server.once("listening", () => server.close(() => resolvePromise(true)));
    server.listen(port, "127.0.0.1");
  });
}

/**
 * Fails loudly if any of the four ports at this offset are already taken,
 * instead of silently colliding with an already-running stack -- a "new"
 * tenant landing on the primary stack's ports looks, from the browser,
 * indistinguishable from the primary tenant itself, which is exactly the bug
 * this replaces.
 */
async function pickPorts(offset: number): Promise<ReturnType<typeof candidatePorts>> {
  const ports = candidatePorts(offset);
  for (const [name, port] of Object.entries(ports)) {
    if (!(await isPortFree(port))) {
      fail(`Port ${port} (${name}) is already in use. Pass a different --port-offset.`);
    }
  }
  return ports;
}

async function createTenantLocal(args: {
  slug: string;
  name: string;
  wa: string;
  ownerEmail: string;
  ownerName: string;
  timezone: string;
  currency: string;
  portOffset: number;
  start: boolean;
}): Promise<void> {
  if (!SLUG_RE.test(args.slug)) fail(`--slug must be lowercase letters, numbers and dashes: "${args.slug}"`);
  if (!WA_RE.test(args.wa)) fail(`--wa must be 10-15 digits, country code included, no + or spaces: "${args.wa}"`);
  if (args.name.trim() === "") fail("--name is required");
  if (!args.ownerEmail.includes("@")) fail(`--owner-email doesn't look like an email: "${args.ownerEmail}"`);

  // Checked up front, before touching the database: a port collision should
  // never be discovered after a Location/owner already got created.
  const ports = args.start ? await pickPorts(args.portOffset) : candidatePorts(args.portOffset);

  const dbName = dbNameFor(args.slug);
  const { prefix } = baseConnection();
  const maintenanceUrl = `${prefix}/postgres`;
  const tenantUrl = `${prefix}/${dbName}?schema=public`;

  console.log(`Creating database "${dbName}"...`);
  try {
    execFileSync("psql", [maintenanceUrl, "-c", `CREATE DATABASE "${dbName}";`], { stdio: "inherit" });
  } catch {
    fail(`Could not create database "${dbName}" -- does it already exist? (drop it first with --stop --drop-db)`);
  }

  console.log("Applying migrations...");
  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: tenantUrl },
    stdio: "inherit"
  });

  console.log("Creating the location and owner login...");
  const prisma = new PrismaClient({ datasources: { db: { url: tenantUrl } } });
  const location = await prisma.location.create({
    data: {
      slug: args.slug,
      name: args.name,
      waNumber: args.wa,
      timezone: args.timezone,
      currency: args.currency,
      active: true
    }
  });
  const password = generatePassword();
  const owner = await prisma.adminUser.create({
    data: {
      email: args.ownerEmail,
      name: args.ownerName,
      role: "OWNER",
      locationId: location.id,
      passwordHash: await hashPassword(password)
    }
  });
  await prisma.$disconnect();

  const state: TenantState = {
    slug: args.slug,
    dbName,
    ports,
    pids: {},
    ownerEmail: owner.email,
    createdAt: new Date().toISOString()
  };

  console.log("");
  console.log(`Tenant "${args.slug}" created.`);
  console.log(`  database:    ${dbName}`);
  console.log(`  owner login: ${owner.email} / ${password}`);
  console.log(`  (password shown once -- it is not stored anywhere in plaintext)`);

  if (!args.start) {
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(stateFile(args.slug), JSON.stringify(state, null, 2));
    console.log("");
    console.log("--no-start passed: nothing launched. To start it later, re-run without --no-start,");
    console.log("or start the four apps yourself with these ports:");
    printManualPorts(ports, args.slug, tenantUrl);
    return;
  }

  mkdirSync(resolve(stateDir, args.slug), { recursive: true });
  const sessionSecret = randomBytes(24).toString("base64url");

  state.pids.backend = spawnApp("backend", "npm", ["run", "dev", "--workspace", "backend"], args.slug, {
    PORT: String(ports.backend),
    DATABASE_URL: tenantUrl,
    SESSION_COOKIE_SECRET: sessionSecret,
    ADMIN_ORIGIN: `http://localhost:${ports.admin}`,
    PUBLIC_SITE_ORIGINS: `http://localhost:${ports.customer},http://localhost:${ports.employee}`,
    NODE_ENV: "development",
    LOG_LEVEL: "info"
  });

  await waitForHealth(ports.backend);

  // VITE_API_BASE_URL is forced empty on all three regardless of whatever a
  // developer's own .env.local happens to have (an absolute
  // http://localhost:3000 there, left over from single-instance debugging,
  // would otherwise bypass this tenant's own proxy entirely and silently hit
  // the *primary* backend instead -- exactly the failure mode this exists to
  // rule out).
  state.pids.admin = spawnApp(
    "admin",
    "npm",
    ["run", "dev", "--workspace", "admin", "--", "--port", String(ports.admin)],
    args.slug,
    { VITE_API_PROXY_TARGET: `http://localhost:${ports.backend}`, VITE_API_BASE_URL: "" }
  );
  state.pids.employee = spawnApp(
    "employee",
    "npm",
    ["run", "dev", "--workspace", "employee", "--", "--port", String(ports.employee)],
    args.slug,
    { VITE_API_PROXY_TARGET: `http://localhost:${ports.backend}`, VITE_API_BASE_URL: "" }
  );
  state.pids.customer = spawnApp(
    "customer",
    "npm",
    ["run", "dev", "--workspace", "customer", "--", "--port", String(ports.customer)],
    args.slug,
    {
      VITE_API_PROXY_TARGET: `http://localhost:${ports.backend}`,
      VITE_API_BASE_URL: "",
      VITE_LOCATION_SLUG: args.slug
    }
  );

  writeFileSync(stateFile(args.slug), JSON.stringify(state, null, 2));

  console.log("");
  console.log("Started:");
  console.log(`  backend:  http://localhost:${ports.backend}/api/health`);
  console.log(`  admin:    http://localhost:${ports.admin}`);
  console.log(`  employee: http://localhost:${ports.employee}`);
  console.log(`  customer: http://localhost:${ports.customer}`);
  console.log(`  logs:     .onboard/${args.slug}/*.log`);
  console.log("");
  console.log(`To stop: npm run onboard -- --stop ${args.slug} [--drop-db]`);
}

function printManualPorts(
  ports: { backend: number; admin: number; employee: number; customer: number },
  slug: string,
  tenantUrl: string
): void {
  console.log(`  DATABASE_URL=${tenantUrl} PORT=${ports.backend} npm run dev:api`);
  console.log(`  VITE_API_PROXY_TARGET=http://localhost:${ports.backend} npm run dev:admin -- --port ${ports.admin}`);
  console.log(
    `  VITE_API_PROXY_TARGET=http://localhost:${ports.backend} npm run dev:employee -- --port ${ports.employee}`
  );
  console.log(
    `  VITE_API_PROXY_TARGET=http://localhost:${ports.backend} VITE_LOCATION_SLUG=${slug} npm run dev:customer -- --port ${ports.customer}`
  );
}

function spawnApp(
  name: string,
  command: string,
  args: string[],
  slug: string,
  env: Record<string, string>
): number {
  const logPath = resolve(stateDir, slug, `${name}.log`);
  const fd = openSync(logPath, "a");
  const child = spawn(command, args, {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    detached: true,
    stdio: ["ignore", fd, fd]
  });
  child.unref();
  return child.pid ?? -1;
}

async function waitForHealth(port: number, timeoutMs = 20000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://localhost:${port}/api/health`);
      if (response.ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log(`(backend on :${port} didn't answer /api/health within ${timeoutMs}ms -- check its log)`);
}

function stopTenant(slug: string, dropDb: boolean): void {
  const state = readState(slug);
  for (const [name, pid] of Object.entries(state.pids)) {
    if (!pid) continue;
    try {
      process.kill(-pid, "SIGTERM"); // negative pid: the whole detached process group
      console.log(`stopped ${name} (pid ${pid})`);
    } catch {
      console.log(`${name} (pid ${pid}) was already gone`);
    }
  }

  if (dropDb) {
    const { prefix } = baseConnection();
    console.log(`Dropping database "${state.dbName}"...`);
    execFileSync("psql", [`${prefix}/postgres`, "-c", `DROP DATABASE IF EXISTS "${state.dbName}";`], {
      stdio: "inherit"
    });
  } else {
    console.log(`Database "${state.dbName}" left in place (pass --drop-db to remove it too).`);
  }

  rmSync(resolve(stateDir, slug), { recursive: true, force: true });
  rmSync(stateFile(slug), { force: true });
  console.log(`Tenant "${slug}" stopped.`);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      slug: { type: "string" },
      name: { type: "string" },
      wa: { type: "string" },
      "owner-email": { type: "string" },
      "owner-name": { type: "string" },
      timezone: { type: "string", default: "America/Mexico_City" },
      currency: { type: "string", default: "MXN" },
      target: { type: "string", default: "local" },
      "port-offset": { type: "string", default: "0" },
      "no-start": { type: "boolean", default: false },
      stop: { type: "string" },
      "drop-db": { type: "boolean", default: false }
    }
  });

  if (values.stop) {
    stopTenant(values.stop, values["drop-db"] === true);
    return;
  }

  if (values.target === "railway") {
    fail(
      "--target railway is not implemented yet. Deploy Chesa're to Railway for real first, " +
        "then this replicates that proven topology instead of guessing at one."
    );
  }
  if (values.target !== "local") fail(`Unknown --target "${values.target}" (use "local")`);

  if (!values.slug || !values.name || !values.wa || !values["owner-email"]) {
    fail("Usage: --slug --name --wa --owner-email [--owner-name] [--port-offset] [--no-start]");
  }

  await createTenantLocal({
    slug: values.slug,
    name: values.name,
    wa: values.wa,
    ownerEmail: values["owner-email"],
    ownerName: values["owner-name"] ?? `Dueño ${values.name}`,
    timezone: values.timezone!,
    currency: values.currency!,
    portOffset: Number(values["port-offset"]),
    start: !values["no-start"]
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
