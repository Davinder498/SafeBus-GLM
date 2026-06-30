/**
 * SafeBus Alberta — Typed error classes.
 *
 * All API helpers throw these instead of generic Error, so the UI can
 * show appropriate messages (see UI Plan §9 — empty/error states).
 */

export type SafeBusErrorCode =
  | 'NOT_AUTHENTICATED'
  | 'NOT_AUTHORIZED'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'CONFLICT'
  | 'SERVER_ERROR'
  | 'UNKNOWN';

export class SafeBusError extends Error {
  readonly code: SafeBusErrorCode;
  readonly statusCode?: number;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: SafeBusErrorCode = 'UNKNOWN',
    options?: { statusCode?: number; details?: Record<string, unknown>; cause?: unknown },
  ) {
    super(message);
    this.name = 'SafeBusError';
    this.code = code;
    this.statusCode = options?.statusCode;
    this.details = options?.details;
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
  }
}

export class NotAuthenticatedError extends SafeBusError {
  constructor(message = 'You must be logged in to perform this action.') {
    super(message, 'NOT_AUTHENTICATED', { statusCode: 401 });
  }
}

export class NotAuthorizedError extends SafeBusError {
  constructor(message = 'You do not have permission to perform this action.') {
    super(message, 'NOT_AUTHORIZED', { statusCode: 403 });
  }
}

export class NotFoundError extends SafeBusError {
  constructor(resource: string, id?: string) {
    super(
      id ? `${resource} not found: ${id}` : `${resource} not found.`,
      'NOT_FOUND',
      { statusCode: 404 },
    );
  }
}

export class ValidationError extends SafeBusError {
  readonly fieldErrors: Record<string, string>;

  constructor(message: string, fieldErrors: Record<string, string> = {}) {
    super(message, 'VALIDATION_ERROR', { statusCode: 400, details: { fieldErrors } });
    this.fieldErrors = fieldErrors;
  }
}

export class RateLimitedError extends SafeBusError {
  constructor(message = 'Too many requests. Please slow down.') {
    super(message, 'RATE_LIMITED', { statusCode: 429 });
  }
}

export class NetworkError extends SafeBusError {
  constructor(message = 'Network error. Please check your connection.', cause?: unknown) {
    super(message, 'NETWORK_ERROR', { cause });
  }
}

export class ConflictError extends SafeBusError {
  constructor(message: string) {
    super(message, 'CONFLICT', { statusCode: 409 });
  }
}

/**
 * Convert an unknown error (e.g. from Supabase) into a SafeBusError.
 */
export function toSafeBusError(error: unknown): SafeBusError {
  if (error instanceof SafeBusError) return error;

  if (error instanceof Error) {
    // Supabase auth errors
    const msg = error.message.toLowerCase();
    if (msg.includes('jwt') || msg.includes('session') || msg.includes('not authenticated')) {
      return new NotAuthenticatedError();
    }
    if (msg.includes('permission') || msg.includes('rls') || msg.includes('policy')) {
      return new NotAuthorizedError();
    }
    if (msg.includes('rate limit')) {
      return new RateLimitedError();
    }
    if (msg.includes('network') || msg.includes('fetch')) {
      return new NetworkError(error.message, error);
    }
    return new SafeBusError(error.message, 'UNKNOWN', { cause: error });
  }

  return new SafeBusError('An unexpected error occurred.', 'UNKNOWN', { cause: error });
}
