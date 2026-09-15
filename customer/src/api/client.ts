import type { HoursResponse, MenuResponse, SubmitOrderPayload, SubmitOrderResponse } from "./types";

export const LOCATION_SLUG = "chesare-maltrata";

const RAW_BASE = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/+$/, "");

// An absolute origin, or an empty string meaning same-origin. Anything else (an
// unreplaced build token, a typo) counts as "no backend": ordering is disabled
// with a visible notice instead of failing silently, since WhatsApp is no longer
// a fallback on the order path.
export const API_BASE = RAW_BASE === "" || /^https?:\/\//.test(RAW_BASE) ? RAW_BASE : null;

export const API_READY = API_BASE !== null;

const PUBLIC_PREFIX = `${API_BASE ?? ""}/api/public/locations/${LOCATION_SLUG}`;

/**
 * The server's error envelope is always `{error:{code,message,details?}}` — see
 * `backend/src/lib/error-handler.ts`. `details` is only populated for
 * VALIDATION_ERROR (a list of `{path,message}`); it is kept here so a failure can
 * be diagnosed rather than swallowed.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function toError(status: number, payload: unknown): ApiError {
  if (payload && typeof payload === "object" && "error" in payload) {
    const envelope = (payload as {
      error?: { code?: string; message?: string; details?: unknown };
    }).error;
    return new ApiError(
      status,
      envelope?.code ?? "INTERNAL_ERROR",
      envelope?.message ?? "Error",
      envelope?.details
    );
  }
  return new ApiError(status, "INTERNAL_ERROR", "Error");
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (API_BASE === null) throw new ApiError(0, "NO_API", "Sin backend configurado");

  let response: Response;
  try {
    response = await fetch(`${PUBLIC_PREFIX}${path}`, init);
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "No se pudo conectar con el servidor");
  }

  const text = await response.text();
  const payload: unknown = text ? safeJson(text) : null;
  if (!response.ok) throw toError(response.status, payload);
  return payload as T;
}

export function fetchMenu(signal?: AbortSignal): Promise<MenuResponse> {
  return request<MenuResponse>("/menu", signal ? { signal } : undefined);
}

export function fetchHours(signal?: AbortSignal): Promise<HoursResponse> {
  return request<HoursResponse>("/hours", signal ? { signal } : undefined);
}

export function submitOrder(body: SubmitOrderPayload): Promise<SubmitOrderResponse> {
  return request<SubmitOrderResponse>("/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}
