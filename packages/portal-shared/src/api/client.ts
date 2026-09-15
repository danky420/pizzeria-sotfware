export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "BAD_REQUEST"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNPROCESSABLE_ENTITY"
  | "PRICE_UNAVAILABLE"
  | "ITEM_UNORDERABLE"
  | "ACCOUNT_LOCKED"
  | "RATE_LIMITED"
  | "NOT_IMPLEMENTED"
  | "INTERNAL_ERROR"
  | "NETWORK_ERROR";

export interface ApiErrorDetail {
  path?: string;
  message?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode | string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isNotImplemented(): boolean {
    return this.status === 501 || this.code === "NOT_IMPLEMENTED";
  }

  get fieldErrors(): ApiErrorDetail[] {
    return Array.isArray(this.details) ? (this.details as ApiErrorDetail[]) : [];
  }
}

/**
 * Where the API lives. Empty (the default) means same-origin `/api/admin`,
 * which is how production serves it — Fastify hosts the API and both SPAs.
 *
 * Each app configures it from its own `VITE_API_BASE_URL` at startup rather
 * than this package reading `import.meta.env` itself: the literal has to stay
 * in the consuming app for Vite's build-time replacement to see it, and that
 * also keeps this package free of a Vite-specific type dependency.
 */
let baseUrl = "";

export function configureApiBaseUrl(url: string | undefined | null): void {
  baseUrl = (url ?? "").replace(/\/+$/, "");
}

export function adminApiPrefix(): string {
  return `${baseUrl}/api/admin`;
}

type UnauthorizedHandler = () => void;

let onUnauthorized: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler;
}

function parseEnvelope(status: number, payload: unknown): ApiError {
  if (payload && typeof payload === "object" && "error" in payload) {
    const envelope = (payload as { error: { code?: string; message?: string; details?: unknown } }).error;
    return new ApiError(
      status,
      envelope?.code ?? "INTERNAL_ERROR",
      envelope?.message ?? "Ocurrió un error",
      envelope?.details
    );
  }
  return new ApiError(status, "INTERNAL_ERROR", "Ocurrió un error");
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${adminApiPrefix()}${path}`, {
      method,
      credentials: "include",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "No se pudo conectar con el servidor");
  }

  const text = await response.text();
  const payload: unknown = text ? safeJson(text) : null;

  if (!response.ok) {
    const error = parseEnvelope(response.status, payload);
    // Only the session check itself should decide what a lost session looks
    // like on screen; every other caller just needs to be told it happened.
    if (error.isUnauthorized) onUnauthorized?.();
    throw error;
  }

  return payload as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body ?? {}),
  del: <T>(path: string) => request<T>("DELETE", path)
};

export function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const rendered = search.toString();
  return rendered ? `?${rendered}` : "";
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Ocurrió un error";
}
