/**
 * Escrows API Routes - Handle escrow contract operations
 */

const express = require('express');
const { param, query, body, validationResult } = require('express-validator');
const { Escrow, Order } = require('../../database/models');
const { requireRole } = require('../middleware/auth');
const { validationChains, handleValidationErrors } = require('../middleware/validation');

const router = express.Router();

/**
 * GET /api/escrows - Get escrows with filtering
 */
router.get('/', [
  ...validationChains.queryEscrows,
  handleValidationErrors
], async (req, res) => {
  try {
    const {
      orderId,
      status,
      chainId,
      type,
      page = 1,
      limit = 20
    } = req.query;

    const filter = {};
    if (orderId) filter.orderId = orderId;
    if (status) filter.status = status;
    if (chainId) filter.chainId = parseInt(chainId);
    if (type) filter.type = type;

    const skip = (page - 1) * limit;
    const [escrows, totalCount] = await Promise.all([
      Escrow.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Escrow.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: {
        escrows,
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
    console.error('Error fetching escrows:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: Date.now()
    });
  }
});

/**
 * GET /api/escrows/:id - Get specific escrow
 */
router.get('/:id', [
  ...validationChains.escrowIdParam,
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;

    const escrow = await Escrow.findOne({ escrowId: id }).lean();
    if (!escrow) {
      return res.status(404).json({
        success: false,
        error: 'Escrow not found',
        timestamp: Date.now()
      });
    }

    // Get related order information
    const order = await Order.findOne({ orderId: escrow.orderId }, {
      orderId: 1,
      status: 1,
      'order.maker': 1,
      'crossChainData.srcChainId': 1,
      'crossChainData.dstChainId': 1
    }).lean();

    res.json({
      success: true,
      data: {
        ...escrow,
        order
      },
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Error fetching escrow:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: Date.now()
    });
  }
});

/**
 * GET /api/escrows/order/:orderId - Get escrows for specific order
 */
router.get('/order/:orderId', [
  param('orderId').isString().notEmpty(),
  handleValidationErrors
], async (req, res) => {
  try {
    const { orderId } = req.params;

    const escrows = await Escrow.find({ orderId }).lean();
    
    const response = {
      orderId,
      src: escrows.find(e => e.type === 'src') || null,
      dst: escrows.find(e => e.type === 'dst') || null,
      totalEscrows: escrows.length
    };

    res.json({
      success: true,
      data: response,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Error fetching order escrows:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: Date.now()
    });
  }
});

/**
 * POST /api/escrows/:id/validate - Validate escrow (relayer only)
 */
router.post('/:id/validate', [
  param('id').isString().notEmpty(),
  requireRole(['relayer', 'admin']),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;

    const escrow = await Escrow.findOne({ escrowId: id });
    if (!escrow) {
      return res.status(404).json({
        success: false,
        error: 'Escrow not found',
        timestamp: Date.now()
      });
    }

    // TODO: Implement actual escrow validation logic
    // This would involve:
    // 1. Checking on-chain escrow contract exists
    // 2. Verifying funding amounts
    // 3. Validating immutable parameters
    // 4. Checking timelock configurations

    const validationResult = {
      contractExists: true,
      properlyFunded: true,
      correctParameters: true,
      validTimelocks: true
    };

    const isValid = Object.values(validationResult).every(Boolean);

    // Update escrow status based on validation
    if (isValid && escrow.status === 'pending') {
      await Escrow.updateOne(
        { escrowId: id },
        { 
          status: 'created',
          updatedAt: Date.now()
        }
      );
    }

    res.json({
      success: true,
      data: {
        escrowId: id,
        valid: isValid,
        validation: validationResult,
        status: isValid ? 'created' : escrow.status
      },
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Error validating escrow:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: Date.now()
    });
  }
});

/**
 * POST /api/escrows/:id/withdraw - Initiate withdrawal
 */
router.post('/:id/withdraw', [
  param('id').isString().notEmpty(),
  body('secret').optional().isString().isLength({ min: 10, max: 100 }),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;
    const { secret } = req.body;
    const userAddress = req.user?.address;

    const escrow = await Escrow.findOne({ escrowId: id });
    if (!escrow) {
      return res.status(404).json({
        success: false,
        error: 'Escrow not found',
        timestamp: Date.now()
      });
    }

    // Check if user is authorized to withdraw
    const canWithdraw = escrow.immutables.maker.toLowerCase() === userAddress?.toLowerCase() ||
                       escrow.immutables.taker.toLowerCase() === userAddress?.toLowerCase();

    if (!canWithdraw) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to withdraw from this escrow',
        timestamp: Date.now()
      });
    }

    // Check escrow status
    if (escrow.status !== 'funded') {
      return res.status(400).json({
        success: false,
        error: 'Escrow is not in withdrawable state',
        details: `Current status: ${escrow.status}`,
        timestamp: Date.now()
      });
    }

    // TODO: Implement actual withdrawal logic
    // This would involve:
    // 1. Validating secret if provided
    // 2. Checking timelock conditions
    // 3. Calling escrow contract withdrawal function
    // 4. Monitoring transaction confirmation

    // For now, just return withdrawal instructions
    res.json({
      success: true,
      data: {
        escrowId: id,
        escrowAddress: escrow.address,
        chainId: escrow.chainId,
        withdrawalType: secret ? 'secret_withdrawal' : 'timelock_withdrawal',
        instructions: 'Call withdraw function on escrow contract',
        // In real implementation, this would include transaction data
        transactionData: {
          to: escrow.address,
          data: '0x...' // Encoded withdrawal call
        }
      },
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Error initiating withdrawal:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: Date.now()
    });
  }
});

/**
 * GET /api/escrows/:id/status - Get escrow status and timeline
 */
router.get('/:id/status', [
  param('id').isString().notEmpty(),
  handleValidationErrors
], async (req, res) => {
  try {
    const { id } = req.params;

    const escrow = await Escrow.findOne({ escrowId: id }).lean();
    if (!escrow) {
      return res.status(404).json({
        success: false,
        error: 'Escrow not found',
        timestamp: Date.now()
      });
    }

    // Calculate timeline information
    const now = Date.now();
    const timeline = {
      created: escrow.createdAt,
      deployed: escrow.deployedAt,
      withdrawn: escrow.withdrawnAt,
      cancelled: escrow.cancelledAt
    };

    // TODO: Parse timelocks to provide withdrawal windows
    const withdrawalWindows = {
      secretWithdrawal: {
        available: escrow.status === 'funded',
        startsAt: escrow.deployedAt,
        endsAt: null // Would be calculated from timelocks
      },
      timelockWithdrawal: {
        available: false,
        startsAt: null, // Would be calculated from timelocks
        endsAt: null
      }
    };

    res.json({
      success: true,
      data: {
        escrowId: id,
        status: escrow.status,
        timeline,
        withdrawalWindows,
        canWithdrawNow: escrow.status === 'funded'
      },
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Error fetching escrow status:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: Date.now()
    });
  }
});

module.exports = router;