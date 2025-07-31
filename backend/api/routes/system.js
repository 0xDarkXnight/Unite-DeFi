/**
 * System API Routes - Health, metrics, and system information
 */

const express = require('express');
const { query, validationResult } = require('express-validator');
const { Order, Resolver, SystemMetrics } = require('../../database/models');
const { databaseManager } = require('../../database/connection');
const { getSupportedChains, getChainConfig } = require('../../config/chains');
const { config } = require('../../config');

const router = express.Router();

/**
 * GET /api/system/status - Get system health status
 */
router.get('/status', async (req, res) => {
  try {
    const now = Date.now();
    
    // Check database health
    const dbHealth = databaseManager.isHealthy();
    const dbStatus = databaseManager.getStatus();
    
    // Check active services
    const services = {
      relayer: config.relayer.enabled,
      resolver: config.resolver.enabled,
      api: config.api.enabled,
      websocket: config.websocket.enabled
    };
    
    // Get basic metrics
    const [activeOrders, totalResolvers] = await Promise.all([
      Order.countDocuments({ status: 'active' }),
      Resolver.countDocuments({ status: 'active' })
    ]);
    
    const systemStatus = {
      status: dbHealth ? 'healthy' : 'unhealthy',
      timestamp: now,
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: config.NODE_ENV,
      
      services,
      
      database: {
        status: dbHealth ? 'connected' : 'disconnected',
        mongodb: dbStatus.mongodb,
        redis: dbStatus.redis
      },
      
      metrics: {
        activeOrders,
        activeResolvers: totalResolvers,
        supportedChains: getSupportedChains().length
      },
      
      system: {
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        platform: process.platform,
        nodeVersion: process.version
      }
    };
    
    const statusCode = systemStatus.status === 'healthy' ? 200 : 503;
    
    res.status(statusCode).json({
      success: systemStatus.status === 'healthy',
      data: systemStatus,
      timestamp: now
    });
    
  } catch (error) {
    console.error('Error checking system status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check system status',
      timestamp: Date.now()
    });
  }
});

/**
 * GET /api/system/metrics - Get detailed system metrics
 */
router.get('/metrics', [
  query('period').optional().isIn(['1h', '24h', '7d', '30d']).withMessage('Invalid period')
], async (req, res) => {
  try {
    const { period = '24h' } = req.query;
    
    // Calculate time range
    const now = Date.now();
    const periodMs = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    };
    const startTime = now - periodMs[period];
    
    // Get orders metrics
    const [
      totalOrders,
      activeOrders,
      filledOrders,
      expiredOrders,
      cancelledOrders,
      recentOrders
    ] = await Promise.all([
      Order.countDocuments(),
      Order.countDocuments({ status: 'active' }),
      Order.countDocuments({ status: 'filled', filledAt: { $gte: startTime } }),
      Order.countDocuments({ status: 'expired' }),
      Order.countDocuments({ status: 'cancelled' }),
      Order.countDocuments({ createdAt: { $gte: startTime } })
    ]);
    
    // Get resolver metrics
    const [totalResolvers, activeResolvers] = await Promise.all([
      Resolver.countDocuments(),
      Resolver.countDocuments({ status: 'active' })
    ]);
    
    // Get chain-specific metrics
    const chainMetrics = {};
    for (const chainId of getSupportedChains()) {
      const chainConfig = getChainConfig(chainId);
      const chainOrders = await Order.countDocuments({
        $or: [
          { 'crossChainData.srcChainId': chainId },
          { 'crossChainData.dstChainId': chainId }
        ]
      });
      
      chainMetrics[chainId] = {
        name: chainConfig.name,
        orders: chainOrders
      };
    }
    
    // Calculate performance metrics
    const performanceMetrics = {
      orderSuccessRate: totalOrders > 0 ? (filledOrders / totalOrders) * 100 : 0,
      avgOrderLifetime: 0, // Would calculate from order data
      systemUptime: process.uptime()
    };
    
    const metrics = {
      period,
      timestamp: now,
      
      orders: {
        total: totalOrders,
        active: activeOrders,
        filled: filledOrders,
        expired: expiredOrders,
        cancelled: cancelledOrders,
        recent: recentOrders
      },
      
      resolvers: {
        total: totalResolvers,
        active: activeResolvers
      },
      
      chains: chainMetrics,
      
      performance: performanceMetrics,
      
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
      }
    };
    
    res.json({
      success: true,
      data: metrics,
      timestamp: now
    });
    
  } catch (error) {
    console.error('Error fetching system metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch system metrics',
      timestamp: Date.now()
    });
  }
});

/**
 * GET /api/system/chains - Get supported chains information
 */
router.get('/chains', async (req, res) => {
  try {
    const supportedChains = getSupportedChains();
    const chainsInfo = supportedChains.map(chainId => {
      const chainConfig = getChainConfig(chainId);
      return {
        chainId,
        name: chainConfig.name,
        nativeCurrency: chainConfig.nativeCurrency,
        blockTime: chainConfig.blockTime,
        confirmations: chainConfig.confirmations,
        contracts: chainConfig.contracts,
        active: true // You could add chain-specific health checks here
      };
    });
    
    res.json({
      success: true,
      data: {
        totalChains: supportedChains.length,
        chains: chainsInfo
      },
      timestamp: Date.now()
    });
    
  } catch (error) {
    console.error('Error fetching chains info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch chains information',
      timestamp: Date.now()
    });
  }
});

/**
 * GET /api/system/config - Get system configuration (non-sensitive)
 */
router.get('/config', async (req, res) => {
  try {
    const publicConfig = {
      environment: config.NODE_ENV,
      services: {
        relayer: { enabled: config.relayer.enabled },
        resolver: { enabled: config.resolver.enabled },
        api: { enabled: config.api.enabled },
        websocket: { enabled: config.websocket.enabled }
      },
      blockchain: {
        supportedChains: getSupportedChains(),
        defaultChain: config.blockchain.defaultChain
      },
      api: {
        rateLimit: {
          windowMs: config.api.rateLimit.windowMs,
          max: config.api.rateLimit.max
        }
      },
      features: {
        authentication: true,
        rateLimiting: true,
        requestLogging: true,
        errorHandling: true,
        inputValidation: true
      }
    };
    
    res.json({
      success: true,
      data: publicConfig,
      timestamp: Date.now()
    });
    
  } catch (error) {
    console.error('Error fetching system config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch system configuration',
      timestamp: Date.now()
    });
  }
});

/**
 * GET /api/system/health - Comprehensive health check
 */
router.get('/health', async (req, res) => {
  try {
    const healthChecks = [];
    
    // Database health
    const dbHealthy = databaseManager.isHealthy();
    healthChecks.push({
      name: 'database',
      status: dbHealthy ? 'healthy' : 'unhealthy',
      details: databaseManager.getStatus()
    });
    
    // Memory usage check
    const memUsage = process.memoryUsage();
    const memHealthy = memUsage.heapUsed / memUsage.heapTotal < 0.9; // Less than 90%
    healthChecks.push({
      name: 'memory',
      status: memHealthy ? 'healthy' : 'warning',
      details: memUsage
    });
    
    // Active orders check
    try {
      const activeOrdersCount = await Order.countDocuments({ status: 'active' });
      healthChecks.push({
        name: 'active_orders',
        status: 'healthy',
        details: { count: activeOrdersCount }
      });
    } catch (error) {
      healthChecks.push({
        name: 'active_orders',
        status: 'unhealthy',
        details: { error: error.message }
      });
    }
    
    // Overall health status
    const allHealthy = healthChecks.every(check => check.status === 'healthy');
    const hasWarnings = healthChecks.some(check => check.status === 'warning');
    
    let overallStatus = 'healthy';
    if (!allHealthy) overallStatus = 'unhealthy';
    else if (hasWarnings) overallStatus = 'warning';
    
    const statusCode = overallStatus === 'healthy' ? 200 : 
                      overallStatus === 'warning' ? 200 : 503;
    
    res.status(statusCode).json({
      success: overallStatus !== 'unhealthy',
      data: {
        status: overallStatus,
        timestamp: Date.now(),
        checks: healthChecks
      },
      timestamp: Date.now()
    });
    
  } catch (error) {
    console.error('Error performing health check:', error);
    res.status(500).json({
      success: false,
      error: 'Health check failed',
      timestamp: Date.now()
    });
  }
});

module.exports = router;