/**
 * Resolvers API Routes - Handle resolver registration and management
 */

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
// const { Resolver, ResolverOperation } = require('../../database/models');
const { supabaseManager } = require('../../database/supabase');
const { requireRole } = require('../middleware/auth');
const { validationChains, handleValidationErrors } = require('../middleware/validation');

const router = express.Router();

/**
 * GET /api/resolvers - Get all resolvers with filtering
 */
router.get('/', [
  query('status').optional().isIn(['active', 'inactive', 'suspended']),
  query('chainId').optional().isInt({ min: 1 }),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  handleValidationErrors
], async (req, res) => {
  try {
    const {
      status,
      chainId,
      page = 1,
      limit = 20
    } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (chainId) filter['config.supportedChains'] = parseInt(chainId);

    const skip = (page - 1) * limit;
    const [resolvers, totalCount] = await Promise.all([
      Resolver.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Resolver.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: {
        resolvers,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit)
        }
      },
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Error fetching resolvers:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: Date.now()
    });
  }
});

/**
 * POST /api/resolvers - Register new resolver
 */
router.post('/', [
  ...validationChains.createResolver,
  handleValidationErrors
], async (req, res) => {
  try {
    const { address, owner, supportedChains, minProfitThreshold, maxGasPrice } = req.body;

    // Check if resolver already exists
    const existingResolver = await Resolver.findOne({ address: address.toLowerCase() });
    if (existingResolver) {
      return res.status(409).json({
        success: false,
        error: 'Resolver already registered',
        timestamp: Date.now()
      });
    }

    // Create resolver
    const resolver = new Resolver({
      resolverId: `resolver_${Date.now()}`,
      address: address.toLowerCase(),
      owner: owner.toLowerCase(),
      config: {
        supportedChains,
        minProfitThreshold,
        maxGasPrice,
        active: true
      },
      status: 'active',
      createdAt: Date.now()
    });

    await resolver.save();

    res.status(201).json({
      success: true,
      data: {
        resolverId: resolver.resolverId,
        address: resolver.address,
        status: resolver.status
      },
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Error registering resolver:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: Date.now()
    });
  }
});

/**
 * GET /api/resolvers/:id - Get specific resolver
 */
router.get('/:id', [
  param('id').isString().notEmpty(),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;

    const resolver = await Resolver.findOne({ resolverId: id }).lean();
    if (!resolver) {
      return res.status(404).json({
        success: false,
        error: 'Resolver not found',
        timestamp: Date.now()
      });
    }

    // Get recent operations
    const recentOperations = await ResolverOperation.find({ resolverId: id })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    res.json({
      success: true,
      data: {
        ...resolver,
        recentOperations
      },
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Error fetching resolver:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: Date.now()
    });
  }
});

/**
 * PUT /api/resolvers/:id - Update resolver configuration
 */
router.put('/:id', [
  param('id').isString().notEmpty(),
  body('config').optional().isObject(),
  body('status').optional().isIn(['active', 'inactive', 'suspended']),
  requireRole(['admin', 'resolver']),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;
    const { config, status } = req.body;
    const userAddress = req.user.address;

    const resolver = await Resolver.findOne({ resolverId: id });
    if (!resolver) {
      return res.status(404).json({
        success: false,
        error: 'Resolver not found',
        timestamp: Date.now()
      });
    }

    // Check permissions
    if (req.user.role !== 'admin' && resolver.owner.toLowerCase() !== userAddress.toLowerCase()) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to update this resolver',
        timestamp: Date.now()
      });
    }

    // Update fields
    const updateData = { updatedAt: Date.now() };
    if (config) updateData.config = { ...resolver.config, ...config };
    if (status) updateData.status = status;

    await Resolver.updateOne({ resolverId: id }, updateData);

    res.json({
      success: true,
      data: {
        resolverId: id,
        updated: Object.keys(updateData)
      },
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Error updating resolver:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: Date.now()
    });
  }
});

/**
 * GET /api/resolvers/:id/performance - Get resolver performance metrics
 */
router.get('/:id/performance', [
  param('id').isString().notEmpty(),
  query('period').optional().isIn(['1d', '7d', '30d']),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;
    const { period = '7d' } = req.query;

    const resolver = await Resolver.findOne({ resolverId: id });
    if (!resolver) {
      return res.status(404).json({
        success: false,
        error: 'Resolver not found',
        timestamp: Date.now()
      });
    }

    // Calculate time range
    const now = Date.now();
    const periodMs = {
      '1d': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    };
    const startTime = now - periodMs[period];

    // Get operations in period
    const operations = await ResolverOperation.find({
      resolverId: id,
      createdAt: { $gte: startTime }
    }).lean();

    // Calculate metrics
    const totalOperations = operations.length;
    const successfulOperations = operations.filter(op => op.status === 'confirmed').length;
    const failedOperations = operations.filter(op => op.status === 'failed').length;
    const successRate = totalOperations > 0 ? (successfulOperations / totalOperations) * 100 : 0;

    const avgExecutionTime = operations.length > 0 
      ? operations.reduce((sum, op) => sum + (op.confirmedAt - op.createdAt || 0), 0) / operations.length
      : 0;

    res.json({
      success: true,
      data: {
        period,
        metrics: {
          totalOperations,
          successfulOperations,
          failedOperations,
          successRate: Math.round(successRate * 100) / 100,
          avgExecutionTime: Math.round(avgExecutionTime)
        },
        overall: resolver.metrics
      },
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Error fetching resolver performance:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: Date.now()
    });
  }
});

/**
 * POST /api/resolvers/:id/operations - Log resolver operation
 */
router.post('/:id/operations', [
  param('id').isString().notEmpty(),
  body('type').isIn(['auction_fill', 'escrow_deploy_src', 'escrow_deploy_dst', 'withdrawal']),
  body('orderId').isString().notEmpty(),
  body('chainId').isInt({ min: 1 }),
  body('txHash').optional().isString(),
  body('status').isIn(['pending', 'confirmed', 'failed']),
  requireRole(['resolver']),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;
    const { type, orderId, chainId, txHash, status, metadata = {} } = req.body;

    // Verify resolver exists and user owns it
    const resolver = await Resolver.findOne({ resolverId: id });
    if (!resolver) {
      return res.status(404).json({
        success: false,
        error: 'Resolver not found',
        timestamp: Date.now()
      });
    }

    if (resolver.owner.toLowerCase() !== req.user.address.toLowerCase()) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized for this resolver',
        timestamp: Date.now()
      });
    }

    // Create operation record
    const operation = new ResolverOperation({
      operationId: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      resolverId: id,
      orderId,
      type,
      chainId,
      txHash,
      status,
      metadata,
      createdAt: Date.now(),
      confirmedAt: status === 'confirmed' ? Date.now() : null,
      failedAt: status === 'failed' ? Date.now() : null
    });

    await operation.save();

    res.status(201).json({
      success: true,
      data: {
        operationId: operation.operationId,
        status: operation.status
      },
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Error logging resolver operation:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: Date.now()
    });
  }
});

module.exports = router;