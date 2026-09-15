import { Prisma } from "@prisma/client";
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { HttpError } from "./http-error.js";

export interface ErrorEnvelope {
  error: { code: string; message: string; details?: unknown };
}

function envelope(code: string, message: string, details?: unknown): ErrorEnvelope {
  return details === undefined ? { error: { code, message } } : { error: { code, message, details } };
}

function zodDetails(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message
  }));
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof HttpError) {
      return reply.status(error.statusCode).send(envelope(error.code, error.message, error.details));
    }

    if (error instanceof ZodError) {
      return reply.status(400).send(envelope("VALIDATION_ERROR", "Invalid request", zodDetails(error)));
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return reply.status(409).send(envelope("CONFLICT", "That value is already taken"));
      }
      if (error.code === "P2025") {
        return reply.status(404).send(envelope("NOT_FOUND", "Not found"));
      }
    }

    const status = error.statusCode ?? 500;
    if (status < 500) {
      return reply.status(status).send(envelope(error.code ?? "BAD_REQUEST", error.message));
    }

    // Anything unrecognised is a bug, not a client problem: log it in full and
    // hand the caller nothing that describes our internals.
    request.log.error({ err: error }, "unhandled error");
    return reply.status(500).send(envelope("INTERNAL_ERROR", "Something went wrong"));
  });
}
