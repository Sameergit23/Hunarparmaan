import type { ErrorRequestHandler } from 'express';
import type { ApiError } from '@hunarpramaan/contracts';
import { ZodError } from 'zod';
// Loads pino-http's `req.log` type.
import type {} from 'pino-http';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: string[],
    /** Extra response headers, such as `Retry-After` on a 429. */
    readonly headers?: Record<string, string>,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: string[]) =>
  new HttpError(400, 'bad_request', message, details);
export const unauthorized = (message = 'Sign in first') =>
  new HttpError(401, 'unauthorized', message);
export const forbidden = (message: string) => new HttpError(403, 'forbidden', message);
export const notFound = (what: string) => new HttpError(404, 'not_found', `${what} not found`);
export const conflict = (message: string, details?: string[]) =>
  new HttpError(409, 'conflict', message, details);

export function zodDetails(error: ZodError): string[] {
  return error.issues.map((i) => `${i.path.join('.') || '(body)'}: ${i.message}`);
}

/** Turns every thrown error into the ApiError shape. Unknown errors are logged and hidden. */
export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  let body: ApiError;
  let status: number;
  if (error instanceof HttpError) {
    status = error.status;
    if (error.headers) res.set(error.headers);
    body = {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details && { details: error.details }),
      },
    };
  } else if (error instanceof ZodError) {
    status = 400;
    body = {
      error: {
        code: 'bad_request',
        message: 'The request is not valid',
        details: zodDetails(error),
      },
    };
  } else if ((error as { type?: string }).type === 'entity.parse.failed') {
    status = 400;
    body = { error: { code: 'bad_request', message: 'The body is not valid JSON' } };
  } else if ((error as { type?: string }).type === 'entity.too.large') {
    status = 413;
    body = { error: { code: 'too_large', message: 'The body is too large' } };
  } else {
    status = 500;
    req.log?.error({ err: error }, 'unhandled error');
    body = { error: { code: 'internal', message: 'Something went wrong on the server' } };
  }
  res.status(status).json(body);
};
