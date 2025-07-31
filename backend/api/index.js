/**
 * API Server for Cross-Chain Dutch Auction System
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { config } = require('../config');
const { databaseManager } = require('../database/connection');

// Import route handlers
const orderRoutes = require('./routes/orders');
const resolverRoutes = require('./routes/resolvers');
const escrowRoutes = require('./routes/escrows');
const systemRoutes = require('./routes/system');
const webhookRoutes = require('./routes/webhooks');

// Import middleware
const errorHandler = require('./middleware/errorHandler');
const authMiddleware = require('./middleware/auth');
const validationMiddleware = require('./middleware/validation');
const loggingMiddleware = require('./middleware/logging');

class APIServer {
  constructor() {
    this.app = express();
    this.server = null;
    this.isRunning = false;
    
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  /**
   * Initialize Express middleware
   */
  initializeMiddleware() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // CORS configuration
    this.app.use(cors(config.api.cors));

    // Rate limiting
    const limiter = rateLimit(config.api.rateLimit);
    this.app.use('/api/', limiter);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use(loggingMiddleware);

    // Health check endpoint (no auth required)
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: Date.now(),
        database: databaseManager.isHealthy(),
        version: process.env.npm_package_version || '1.0.0'
      });
    });
  }

  /**
   * Initialize API routes
   */
  initializeRoutes() {
    // Public routes (no authentication required)
    this.app.use('/api/system', systemRoutes);
    this.app.use('/api/webhooks', webhookRoutes);
    
    // Protected routes (authentication required)
    this.app.use('/api/orders', authMiddleware, orderRoutes);
    this.app.use('/api/resolvers', authMiddleware, resolverRoutes);
    this.app.use('/api/escrows', authMiddleware, escrowRoutes);

    // API documentation endpoint
    this.app.get('/api/docs', (req, res) => {
      res.json({
        title: 'Cross-Chain Dutch Auction API',
        version: '1.0.0',
        endpoints: this.getApiEndpoints(),
        timestamp: Date.now()
      });
    });

    // 404 handler for API routes
    this.app.use('/api/*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'API endpoint not found',
        path: req.path,
        method: req.method,
        timestamp: Date.now()
      });
    });
  }

  /**
   * Initialize error handling
   */
  initializeErrorHandling() {
    this.app.use(errorHandler);
  }

  /**
   * Start the API server
   */
  async start() {
    if (this.isRunning) {
      throw new Error('API server is already running');
    }

    return new Promise((resolve, reject) => {
      this.server = this.app.listen(config.api.port, (error) => {
        if (error) {
          reject(error);
        } else {
          this.isRunning = true;
          console.log(`✅ API Server running on port ${config.api.port}`);
          console.log(`📖 API Documentation: http://localhost:${config.api.port}/api/docs`);
          console.log(`❤️  Health Check: http://localhost:${config.api.port}/health`);
          resolve();
        }
      });

      // Handle server errors
      this.server.on('error', (error) => {
        console.error('❌ API Server error:', error);
        reject(error);
      });
    });
  }

  /**
   * Stop the API server
   */
  async stop() {
    if (!this.isRunning || !this.server) {
      return;
    }

    return new Promise((resolve) => {
      this.server.close(() => {
        this.isRunning = false;
        console.log('✅ API Server stopped');
        resolve();
      });
    });
  }

  /**
   * Get available API endpoints
   */
  getApiEndpoints() {
    return {
      orders: {
        'GET /api/orders': 'Get all orders with filters',
        'POST /api/orders': 'Create new order',
        'GET /api/orders/:id': 'Get specific order',
        'PUT /api/orders/:id': 'Update order',
        'DELETE /api/orders/:id': 'Cancel order',
        'GET /api/orders/:id/status': 'Get order status',
        'POST /api/orders/:id/fill': 'Fill order (resolver only)'
      },
      resolvers: {
        'GET /api/resolvers': 'Get all resolvers',
        'POST /api/resolvers': 'Register new resolver',
        'GET /api/resolvers/:id': 'Get specific resolver',
        'PUT /api/resolvers/:id': 'Update resolver config',
        'DELETE /api/resolvers/:id': 'Unregister resolver',
        'GET /api/resolvers/:id/performance': 'Get resolver performance metrics',
        'POST /api/resolvers/:id/operations': 'Log resolver operation'
      },
      escrows: {
        'GET /api/escrows': 'Get all escrows with filters',
        'GET /api/escrows/:id': 'Get specific escrow',
        'GET /api/escrows/order/:orderId': 'Get escrows for order',
        'POST /api/escrows/:id/validate': 'Validate escrow (relayer only)',
        'POST /api/escrows/:id/withdraw': 'Initiate withdrawal'
      },
      system: {
        'GET /api/system/status': 'Get system status',
        'GET /api/system/metrics': 'Get system metrics',
        'GET /api/system/chains': 'Get supported chains',
        'GET /api/system/config': 'Get system configuration'
      },
      webhooks: {
        'POST /api/webhooks/resolver': 'Resolver notification webhook',
        'POST /api/webhooks/blockchain': 'Blockchain event webhook'
      }
    };
  }

  /**
   * Get Express app instance
   */
  getApp() {
    return this.app;
  }
}

module.exports = APIServer;