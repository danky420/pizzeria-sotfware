import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { disconnectPrisma } from "./db/prisma.js";
import { sweepExpiredSessions } from "./auth/session.js";

const SESSION_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function main(): Promise<void> {
  const app = await buildApp();

  const sweep = setInterval(() => {
    sweepExpiredSessions().catch((error: unknown) => app.log.warn({ err: error }, "session sweep failed"));
  }, SESSION_SWEEP_INTERVAL_MS);
  sweep.unref();

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, "shutting down");
    clearInterval(sweep);
    await app.close();
    await disconnectPrisma();
    process.exit(0);
  };

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void shutdown(signal);
    });
  }

  // 0.0.0.0, not localhost: Railway routes to the container's external interface.
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
