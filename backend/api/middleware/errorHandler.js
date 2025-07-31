/**
 * Global error handling middleware
 */

const { config } = require('../../config');

/**
 * Global error handler middleware
 * Should be the last middleware in the chain
 */
const errorHandler = (error, req, res, next) => {
  console.error('API Error:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });

  // Default error response
  let status = 500;
  let message = 'Internal server error';
  let details = null;

  // Handle specific error types
  if (error.name === 'ValidationError') {
    status = 400;
    message = 'Validation failed';
    details = Object.values(error.errors).map(err => ({
      field: err.path,
      message: err.message,
      value: err.value
    }));
  } else if (error.name === 'CastError') {
    status = 400;
    message = 'Invalid data format';
    details = `Invalid ${error.path}: ${error.value}`;
  } else if (error.code === 11000) {
    status = 409;
    message = 'Duplicate entry';
    details = 'Resource already exists';
  } else if (error.name === 'UnauthorizedError') {
    status = 401;
    message = 'Unauthorized';
  } else if (error.name === 'ForbiddenError') {
    status = 403;
    message = 'Forbidden';
  } else if (error.name === 'NotFoundError') {
    status = 404;
    message = 'Resource not found';
  } else if (error.name === 'RateLimitError') {
    status = 429;
    message = 'Rate limit exceeded';
    details = 'Too many requests, please try again later';
  } else if (error.name === 'TimeoutError') {
    status = 408;
    message = 'Request timeout';
  } else if (error.status) {
    status = error.status;
    message = error.message;
  }

  // Prepare error response
  const errorResponse = {
    success: false,
    error: message,
    timestamp: Date.now()
  };

  // Add details in development mode
  if (config.NODE_ENV === 'development') {
    errorResponse.details = details || error.message;
    errorResponse.stack = error.stack;
  } else if (details) {
    errorResponse.details = details;
  }

  // Add request context for debugging
  if (config.NODE_ENV === 'development') {
    errorResponse.request = {
      method: req.method,
      url: req.url,
      query: req.query,
      body: req.body,
      headers: req.headers
    };
  }

  res.status(status).json(errorResponse);
};

/**
 * Async error handler wrapper
 * Wraps async route handlers to catch rejected promises
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 404 Not Found handler
 */
const notFoundHandler = (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path,
    method: req.method,
    timestamp: Date.now()
  });
};

/**
 * Custom error classes
 */
class APIError extends Error {
  constructor(message, status = 500, details = null) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.details = details;
  }
}

class ValidationError extends APIError {
  constructor(message, details = null) {
    super(message, 400, details);
    this.name = 'ValidationError';
  }
}

class NotFoundError extends APIError {
  constructor(message = 'Resource not found') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

class UnauthorizedError extends APIError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
    this.name = 'UnauthorizedError';
  }
}

class ForbiddenError extends APIError {
  constructor(message = 'Forbidden') {
    super(message, 403);
    this.name = 'ForbiddenError';
  }
}

class RateLimitError extends APIError {
  constructor(message = 'Rate limit exceeded') {
    super(message, 429);
    this.name = 'RateLimitError';
  }
}

class TimeoutError extends APIError {
  constructor(message = 'Request timeout') {
    super(message, 408);
    this.name = 'TimeoutError';
  }
}

module.exports = {
  errorHandler,
  asyncHandler,
  notFoundHandler,
  APIError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  RateLimitError,
  TimeoutError
};