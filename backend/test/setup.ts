// Runs before any test file imports src/config/env.ts, which throws on a missing
// or too-short SESSION_COOKIE_SECRET. A real DATABASE_URL can still be supplied
// from the outside; these are only the fallbacks.
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL = "silent";
process.env.SESSION_COOKIE_SECRET ??= "test-session-secret-at-least-32-characters-long";
process.env.DATABASE_URL ??= "postgresql://pizzeria:pizzeria@localhost:5432/pizzeria_test?schema=public";
process.env.ADMIN_ORIGIN ??= "http://localhost:5173";
process.env.PUBLIC_SITE_ORIGINS ??= "http://localhost:8000";
