export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, "BAD_REQUEST", message, details);

export const unauthorized = (message = "Authentication required") =>
  new HttpError(401, "UNAUTHORIZED", message);

export const forbidden = (message = "Not allowed") => new HttpError(403, "FORBIDDEN", message);

export const notFound = (message = "Not found") => new HttpError(404, "NOT_FOUND", message);

export const conflict = (message: string) => new HttpError(409, "CONFLICT", message);

export const unprocessable = (message: string, details?: unknown) =>
  new HttpError(422, "UNPROCESSABLE_ENTITY", message, details);

export const notImplemented = (message = "Not implemented yet") =>
  new HttpError(501, "NOT_IMPLEMENTED", message);
