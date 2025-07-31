/**
 * Logging middleware for API requests
 */

const winston = require('winston');
const { config } = require('../../config');

// Create Winston logger
const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    config.logging.format === 'json' 
      ? winston.format.json()
      : winston.format.simple()
  ),
  transports: []
});

// Add console transport if enabled
if (config.logging.console.enabled) {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize({ all: config.logging.console.colorize }),
      winston.format.simple()
    )
  }));
}

// Add file transport if enabled
if (config.logging.file.enabled) {
  logger.add(new winston.transports.File({
    filename: config.logging.file.filename,
    maxsize: config.logging.file.maxSize,
    maxFiles: config.logging.file.maxFiles,
    format: winston.format.json()
  }));
}

/**
 * Request logging middleware
 */
const loggingMiddleware = (req, res, next) => {
  const startTime = Date.now();
  
  // Generate unique request ID
  req.requestId = generateRequestId();
  
  // Log incoming request
  logger.info('Incoming request', {
    requestId: req.requestId,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentLength: req.get('Content-Length'),
    timestamp: new Date().toISOString()
  });
  
  // Override res.json to log response
  const originalJson = res.json;
  res.json = function(body) {
    const responseTime = Date.now() - startTime;
    
    // Log outgoing response
    logger.info('Outgoing response', {
      requestId: req.requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      responseTime,
      success: body?.success !== false,
      timestamp: new Date().toISOString()
    });
    
    return originalJson.call(this, body);
  };
  
  // Override res.send to log response
  const originalSend = res.send;
  res.send = function(body) {
    const responseTime = Date.now() - startTime;
    
    logger.info('Outgoing response', {
      requestId: req.requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      responseTime,
      timestamp: new Date().toISOString()
    });
    
    return originalSend.call(this, body);
  };
  
  next();
};

/**
 * Error logging middleware
 */
const errorLoggingMiddleware = (error, req, res, next) => {
  logger.error('Request error', {
    requestId: req.requestId,
    method: req.method,
    url: req.url,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack
    },
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });
  
  next(error);
};

/**
 * Generate unique request ID
 */
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Log levels for different scenarios
 */
const logLevels = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error'
};

/**
 * Custom logging functions
 */
const log = {
  debug: (message, meta = {}) => logger.debug(message, meta),
  info: (message, meta = {}) => logger.info(message, meta),
  warn: (message, meta = {}) => logger.warn(message, meta),
  error: (message, meta = {}) => logger.error(message, meta),
  
  // Specific logging functions
  orderCreated: (orderId, userAddress) => {
    logger.info('Order created', {
      event: 'order_created',
      orderId,
      userAddress,
      timestamp: new Date().toISOString()
    });
  },
  
  orderFilled: (orderId, resolver, price) => {
    logger.info('Order filled', {
      event: 'order_filled',
      orderId,
      resolver,
      price,
      timestamp: new Date().toISOString()
    });
  },
  
  escrowDeployed: (orderId, escrowAddress, chainId, type) => {
    logger.info('Escrow deployed', {
      event: 'escrow_deployed',
      orderId,
      escrowAddress,
      chainId,
      type,
      timestamp: new Date().toISOString()
    });
  },
  
  swapCompleted: (orderId, srcTxHash, dstTxHash) => {
    logger.info('Swap completed', {
      event: 'swap_completed',
      orderId,
      srcTxHash,
      dstTxHash,
      timestamp: new Date().toISOString()
    });
  },
  
  resolverPerformance: (resolverId, metrics) => {
    logger.info('Resolver performance', {
      event: 'resolver_performance',
      resolverId,
      ...metrics,
      timestamp: new Date().toISOString()
    });
  },
  
  systemHealth: (status) => {
    logger.info('System health', {
      event: 'system_health',
      ...status,
      timestamp: new Date().toISOString()
    });
  }
};

module.exports = {
  loggingMiddleware,
  errorLoggingMiddleware,
  logger,
  log,
  logLevels
};