/**
 * AR Management System - Error Classes
 *
 * Custom error types for Agent Resource management operations.
 */

/**
 * Base error class for all AR operations
 */
export class ARError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, any>
  ) {
    super(message);
    this.name = 'ARError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error thrown when a requested resource is not found
 */
export class ARNotFoundError extends ARError {
  constructor(resource: string, identifier: string | Record<string, any>) {
    const idStr = typeof identifier === 'string'
      ? identifier
      : JSON.stringify(identifier);
    super(
      `${resource} not found: ${idStr}`,
      'AR_NOT_FOUND',
      404,
      { resource, identifier }
    );
    this.name = 'ARNotFoundError';
  }
}

/**
 * Error thrown when an operation violates business rules
 */
export class ARValidationError extends ARError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'AR_VALIDATION_ERROR', 400, details);
    this.name = 'ARValidationError';
  }
}

/**
 * Error thrown when an operation conflicts with existing data
 */
export class ARConflictError extends ARError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'AR_CONFLICT', 409, details);
    this.name = 'ARConflictError';
  }
}

/**
 * Error thrown when operation lacks required permissions
 */
export class ARPermissionError extends ARError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'AR_PERMISSION_DENIED', 403, details);
    this.name = 'ARPermissionError';
  }
}

/**
 * Error thrown when budget limits are exceeded
 */
export class ARBudgetError extends ARError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'AR_BUDGET_EXCEEDED', 400, details);
    this.name = 'ARBudgetError';
  }
}
