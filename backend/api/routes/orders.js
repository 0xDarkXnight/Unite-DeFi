/**
 * Orders API Routes - Handle Dutch auction order operations
 */

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { ethers } = require('ethers');
const { Order, Secret, Escrow } = require('../../database/models');
const { cacheGet, cacheSet } = require('../../database/connection');
const { getChainConfig } = require('../../config/chains');

const router = express.Router();

/**
 * GET /api/orders - Get orders with filtering and pagination
 */
router.get('/', [
  query('status').optional().isIn(['active', 'filled', 'expired', 'cancelled']),
  query('maker').optional().isEthereumAddress(),
  query('srcChainId').optional().isInt({ min: 1 }),
  query('dstChainId').optional().isInt({ min: 1 }),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('sortBy').optional().isIn(['createdAt', 'currentPrice', 'filledAt']),
  query('sortOrder').optional().isIn(['asc', 'desc'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array(),
        timestamp: Date.now()
      });
    }

    const {
      status,
      maker,
      srcChainId,
      dstChainId,
      page = 1,
      limit = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter query
    const filter = {};
    if (status) filter.status = status;
    if (maker) filter['order.maker'] = maker.toLowerCase();
    if (srcChainId) filter['crossChainData.srcChainId'] = parseInt(srcChainId);
    if (dstChainId) filter['crossChainData.dstChainId'] = parseInt(dstChainId);

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;

    // Execute query with pagination
    const skip = (page - 1) * limit;
    const [orders, totalCount] = await Promise.all([
      Order.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Order.countDocuments(filter)
    ]);

    // Calculate current prices for active orders
    const ordersWithCurrentPrices = orders.map(order => {
      if (order.status === 'active') {
        order.currentPrice = calculateCurrentAuctionPrice(order);
      }
      return order;
    });

    res.json({
      success: true,
      data: {
        orders: ordersWithCurrentPrices,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
          hasNext: page * limit < totalCount,
          hasPrev: page > 1
        }
      },
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: Date.now()
    });
  }
});

/**
 * POST /api/orders - Create new Dutch auction order
 */
router.post('/', [
  body('order').isObject().notEmpty(),
  body('order.salt').isString().notEmpty(),
  body('order.maker').isEthereumAddress(),
  body('order.makerAsset').isEthereumAddress(),
  body('order.takerAsset').isEthereumAddress(),
  body('order.makingAmount').isString().notEmpty(),
  body('order.takingAmount').isString().notEmpty(),
  body('order.makerTraits').isString().notEmpty(),
  body('signature').isObject().notEmpty(),
  body('signature.r').isString().notEmpty(),
  body('signature.vs').isString().notEmpty(),
  body('auctionParams').isObject().notEmpty(),
  body('auctionParams.startTime').isInt({ min: 0 }),
  body('auctionParams.endTime').isInt({ min: 0 }),
  body('auctionParams.startPrice').isString().notEmpty(),
  body('auctionParams.endPrice').isString().notEmpty(),
  body('crossChainData').isObject().notEmpty(),
  body('crossChainData.srcChainId').isInt({ min: 1 }),
  body('crossChainData.dstChainId').isInt({ min: 1 }),
  body('crossChainData.dstToken').isEthereumAddress(),
  body('crossChainData.dstAmount').isString().notEmpty(),
  body('secret').isString().notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array(),
        timestamp: Date.now()
      });
    }

    const { order, signature, auctionParams, crossChainData, secret } = req.body;

    // Validate auction timing
    const now = Math.floor(Date.now() / 1000);
    if (auctionParams.startTime < now) {
      return res.status(400).json({
        success: false,
        error: 'Auction start time must be in the future',
        timestamp: Date.now()
      });
    }

    if (auctionParams.endTime <= auctionParams.startTime) {
      return res.status(400).json({
        success: false,
        error: 'Auction end time must be after start time',
        timestamp: Date.now()
      });
    }

    // Validate chain support
    try {
      getChainConfig(crossChainData.srcChainId);
      getChainConfig(crossChainData.dstChainId);
    } catch (error) {
      return res.status(400).json({
        success: false,
        error: 'Unsupported chain ID',
        details: error.message,
        timestamp: Date.now()
      });
    }

    // Generate order ID and hash
    const orderId = generateOrderId(order);
    const orderHash = calculateOrderHash(order);

    // Generate hashlock from secret
    const hashedSecret = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(secret));
    const hashlock = ethers.utils.keccak256(hashedSecret);

    // Create order document
    const newOrder = new Order({
      orderId,
      orderHash,
      order,
      signature,
      auctionParams: {
        ...auctionParams,
        duration: auctionParams.endTime - auctionParams.startTime
      },
      crossChainData: {
        ...crossChainData,
        hashlock
      },
      status: 'active',
      currentPrice: auctionParams.startPrice,
      lastPriceUpdate: Date.now(),
      createdAt: Date.now()
    });

    // Save order to database
    await newOrder.save();

    // Store encrypted secret
    const encryptedSecret = await encryptSecret(secret, order.maker);
    const secretRecord = new Secret({
      orderId,
      userAddress: order.maker.toLowerCase(),
      encryptedSecret,
      hashlock,
      status: 'pending',
      createdAt: Date.now()
    });

    await secretRecord.save();

    // Cache order for quick access
    await cacheSet(`order:${orderId}`, newOrder.toObject(), 3600);

    console.log(`✅ New order created: ${orderId}`);

    res.status(201).json({
      success: true,
      data: {
        orderId,
        orderHash,
        status: 'active',
        auctionStartTime: auctionParams.startTime,
        auctionEndTime: auctionParams.endTime,
        currentPrice: auctionParams.startPrice
      },
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Error creating order:', error);
    
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        error: 'Order already exists',
        timestamp: Date.now()
      });
    }

    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: Date.now()
    });
  }
});

/**
 * GET /api/orders/:id - Get specific order
 */
router.get('/:id', [
  param('id').isString().notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array(),
        timestamp: Date.now()
      });
    }

    const { id: orderId } = req.params;

    // Try cache first
    let order = await cacheGet(`order:${orderId}`);
    
    if (!order) {
      // Fetch from database
      order = await Order.findOne({ orderId }).lean();
      
      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found',
          timestamp: Date.now()
        });
      }

      // Cache for future requests
      await cacheSet(`order:${orderId}`, order, 3600);
    }

    // Calculate current price if active
    if (order.status === 'active') {
      order.currentPrice = calculateCurrentAuctionPrice(order);
    }

    // Get escrow information if available
    const escrows = await Escrow.find({ orderId }).lean();
    order.escrows = {
      src: escrows.find(e => e.type === 'src') || null,
      dst: escrows.find(e => e.type === 'dst') || null
    };

    res.json({
      success: true,
      data: order,
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: Date.now()
    });
  }
});

/**
 * GET /api/orders/:id/status - Get order status and current price
 */
router.get('/:id/status', [
  param('id').isString().notEmpty()
], async (req, res) => {
  try {
    const { id: orderId } = req.params;

    const order = await Order.findOne({ orderId }, {
      orderId: 1,
      status: 1,
      auctionParams: 1,
      currentPrice: 1,
      lastPriceUpdate: 1,
      createdAt: 1,
      filledAt: 1
    }).lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
        timestamp: Date.now()
      });
    }

    let currentPrice = order.currentPrice;
    let auctionStatus = 'active';

    if (order.status === 'active') {
      const now = Math.floor(Date.now() / 1000);
      
      if (now < order.auctionParams.startTime) {
        auctionStatus = 'pending';
        currentPrice = order.auctionParams.startPrice;
      } else if (now >= order.auctionParams.endTime) {
        auctionStatus = 'expired';
        currentPrice = order.auctionParams.endPrice;
      } else {
        auctionStatus = 'active';
        currentPrice = calculateCurrentAuctionPrice(order);
      }
    } else {
      auctionStatus = order.status;
    }

    res.json({
      success: true,
      data: {
        orderId,
        status: order.status,
        auctionStatus,
        currentPrice,
        timeRemaining: Math.max(0, order.auctionParams.endTime - Math.floor(Date.now() / 1000)),
        lastUpdated: Date.now()
      },
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Error fetching order status:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: Date.now()
    });
  }
});

/**
 * DELETE /api/orders/:id - Cancel order
 */
router.delete('/:id', [
  param('id').isString().notEmpty()
], async (req, res) => {
  try {
    const { id: orderId } = req.params;
    const userAddress = req.user?.address; // From auth middleware

    const order = await Order.findOne({ orderId });
    
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
        timestamp: Date.now()
      });
    }

    // Check if user owns the order
    if (order.order.maker.toLowerCase() !== userAddress?.toLowerCase()) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to cancel this order',
        timestamp: Date.now()
      });
    }

    // Check if order can be cancelled
    if (order.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'Order cannot be cancelled',
        details: `Order status is ${order.status}`,
        timestamp: Date.now()
      });
    }

    // Update order status
    await Order.updateOne(
      { orderId },
      { 
        status: 'cancelled',
        updatedAt: Date.now()
      }
    );

    // Update secret status
    await Secret.updateOne(
      { orderId },
      { status: 'cancelled' }
    );

    // Clear cache
    await cacheSet(`order:${orderId}`, null, 1);

    console.log(`📋 Order cancelled: ${orderId}`);

    res.json({
      success: true,
      data: {
        orderId,
        status: 'cancelled'
      },
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: Date.now()
    });
  }
});

// Helper functions
function generateOrderId(order) {
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ['string', 'address', 'uint256'],
      [order.salt, order.maker, Date.now()]
    )
  ).substring(0, 18); // Use first 16 characters as ID
}

function calculateOrderHash(order) {
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ['tuple(uint256,address,address,address,address,uint256,uint256,uint256)'],
      [[
        order.salt,
        order.maker,
        order.receiver || ethers.constants.AddressZero,
        order.makerAsset,
        order.takerAsset,
        order.makingAmount,
        order.takingAmount,
        order.makerTraits
      ]]
    )
  );
}

function calculateCurrentAuctionPrice(order) {
  const now = Math.floor(Date.now() / 1000);
  const { startTime, endTime, startPrice, endPrice } = order.auctionParams;
  
  if (now < startTime) return startPrice;
  if (now >= endTime) return endPrice;
  
  const timeElapsed = now - startTime;
  const totalDuration = endTime - startTime;
  const progress = timeElapsed / totalDuration;
  
  const startPriceBig = ethers.BigNumber.from(startPrice);
  const endPriceBig = ethers.BigNumber.from(endPrice);
  const priceDifference = startPriceBig.sub(endPriceBig);
  const priceReduction = priceDifference.mul(Math.floor(progress * 10000)).div(10000);
  const currentPrice = startPriceBig.sub(priceReduction);
  
  return currentPrice.toString();
}

async function encryptSecret(secret, userAddress) {
  // In a real implementation, use proper encryption
  // For now, return a simple encoded version
  return Buffer.from(secret + userAddress).toString('base64');
}

module.exports = router;