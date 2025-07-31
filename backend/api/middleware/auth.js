/**
 * Authentication middleware for API routes
 */

const jwt = require('jsonwebtoken');
const { config } = require('../../config');

/**
 * JWT Authentication middleware
 * Verifies JWT tokens and extracts user information
 */
const authMiddleware = (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'No authorization header provided',
        timestamp: Date.now()
      });
    }
    
    // Extract token from "Bearer <token>" format
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No token provided',
        timestamp: Date.now()
      });
    }
    
    // Verify token
    const decoded = jwt.verify(token, config.api.jwt.secret);
    
    // Add user info to request
    req.user = {
      address: decoded.address,
      role: decoded.role || 'user',
      issuedAt: decoded.iat,
      expiresAt: decoded.exp
    };
    
    next();
    
  } catch (error) {
    console.error('Authentication error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired',
        timestamp: Date.now()
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token',
        timestamp: Date.now()
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'Authentication failed',
      timestamp: Date.now()
    });
  }
};

/**
 * Optional authentication middleware
 * Sets user info if token is provided, but doesn't require it
 */
const optionalAuthMiddleware = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader) {
      const token = authHeader.split(' ')[1];
      
      if (token) {
        try {
          const decoded = jwt.verify(token, config.api.jwt.secret);
          req.user = {
            address: decoded.address,
            role: decoded.role || 'user',
            issuedAt: decoded.iat,
            expiresAt: decoded.exp
          };
        } catch (error) {
          // Invalid token, but we continue without user info
          console.warn('Invalid token in optional auth:', error.message);
        }
      }
    }
    
    next();
    
  } catch (error) {
    console.error('Optional authentication error:', error);
    next();
  }
};

/**
 * Role-based authorization middleware
 * @param {string|string[]} allowedRoles - Allowed roles for the endpoint
 */
const requireRole = (allowedRoles) => {
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        timestamp: Date.now()
      });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        required: roles,
        current: req.user.role,
        timestamp: Date.now()
      });
    }
    
    next();
  };
};

/**
 * Generate JWT token for user
 * @param {string} address - User's Ethereum address
 * @param {string} role - User's role (default: 'user')
 * @param {Object} additionalClaims - Additional claims to include
 */
const generateToken = (address, role = 'user', additionalClaims = {}) => {
  const payload = {
    address: address.toLowerCase(),
    role,
    iat: Math.floor(Date.now() / 1000),
    ...additionalClaims
  };
  
  return jwt.sign(payload, config.api.jwt.secret, {
    expiresIn: config.api.jwt.expiresIn,
    algorithm: config.api.jwt.algorithm
  });
};

/**
 * Verify JWT token
 * @param {string} token - JWT token to verify
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, config.api.jwt.secret);
  } catch (error) {
    throw new Error(`Token verification failed: ${error.message}`);
  }
};

module.exports = {
  authMiddleware,
  optionalAuthMiddleware,
  requireRole,
  generateToken,
  verifyToken
};