/**
 * Orders API Routes - Handle Dutch auction order operations
 */

const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { ethers } = require('ethers');
const { supabaseManager, cacheGet, cacheSet } = require('../../database/supabase');
const { getChainConfig } = require('../../config/chains');
const { NATIVE_ETH_SENTINEL } = require('../../config/constants');

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
    const filters = {};
    if (status) filters.status = status;
    if (maker) filters.maker = maker.toLowerCase();
    if (srcChainId) filters.srcChainId = parseInt(srcChainId);
    if (dstChainId) filters.dstChainId = parseInt(dstChainId);

    const { orders, totalCount } = await supabaseManager.getOrders(filters, {
      page,
      limit,
      sortBy,
      sortOrder
    });

    // Calculate current prices for active orders
    const ordersWithCurrentPrices = orders.map(order => {
      if (order.status === 'active') {
        // Convert Supabase format to expected format for calculation
        const orderForCalc = {
          auctionParams: order.auction_params || order.auctionParams,
          status: order.status
        };
        order.currentPrice = calculateCurrentAuctionPrice(orderForCalc);
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
  body('order.receiver').isEthereumAddress(),
  body('order.allowedSender').isEthereumAddress(),
  body('order.offsets').isString().notEmpty(),
  body('order.interactions').isString().notEmpty(),
  body('signature').isObject().notEmpty(),
  body('signature.r').isString().notEmpty(),
  // Accept either s+v format or vs format for backward compatibility
  body('signature.s').optional().isString(),
  body('signature.v').optional(),
  body('signature.vs').optional().isString(),
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
    
    // CRITICAL VALIDATION: Prevent invalid order data
    // 1. Check for native ETH sentinel addresses
    if (order.makerAsset === NATIVE_ETH_SENTINEL || 
        order.takerAsset === NATIVE_ETH_SENTINEL) {
      return res.status(400).json({
        success: false,
        error: 'Cannot use native ETH sentinel address (0xEeeee...) in limit orders. Use WETH instead.',
        code: 'INVALID_ASSET_ADDRESS'
      });
    }
    
    // 2. Check for zero amounts
    if (!order.makingAmount || order.makingAmount === '0' || BigInt(order.makingAmount) === 0n) {
      return res.status(400).json({
        success: false,
        error: 'makingAmount must be non-zero',
        code: 'INVALID_MAKING_AMOUNT'
      });
    }
    
    if (!order.takingAmount || order.takingAmount === '0' || BigInt(order.takingAmount) === 0n) {
      return res.status(400).json({
        success: false,
        error: 'takingAmount must be non-zero',
        code: 'INVALID_TAKING_AMOUNT'
      });
    }
    
    console.log('✅ Order validation passed at API level');

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
    const hashedSecret = ethers.keccak256(ethers.toUtf8Bytes(secret));
    
    // NEW FLOW: User funds should be deposited to temporary storage when order is created
    // The frontend should call SimpleLimitOrderProtocol.createAndDepositOrder() 
    // which will automatically deposit funds to TemporaryFundStorage
    const hashlock = ethers.keccak256(hashedSecret);

    // Create order document
    const orderDocument = {
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
      lastPriceUpdate: Date.now()
    };

    // Save order to database
    const newOrder = await supabaseManager.createOrder(orderDocument);

    // Store encrypted secret
    const encryptedSecret = await encryptSecret(secret, order.maker);
    const secretData = {
      orderId,
      userAddress: order.maker.toLowerCase(),
      encryptedSecret,
      hashlock,
      status: 'pending'
    };

    await supabaseManager.createSecret(secretData);

    // Cache order for quick access
    await cacheSet(`order:${orderId}`, newOrder, 3600);

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
      order = await supabaseManager.getOrder(orderId);
      
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
      const orderForCalc = {
        auctionParams: order.auction_params || order.auctionParams,
        status: order.status
      };
      order.currentPrice = calculateCurrentAuctionPrice(orderForCalc);
    }

    // Get escrow information if available (mock for now)
    order.escrows = {
      src: null,
      dst: null
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

    const order = await supabaseManager.getOrder(orderId);

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
      const auctionParams = order.auction_params || order.auctionParams;
      
      if (now < auctionParams.startTime) {
        auctionStatus = 'pending';
        currentPrice = auctionParams.startPrice;
      } else if (now >= auctionParams.endTime) {
        auctionStatus = 'expired';
        currentPrice = auctionParams.endPrice;
      } else {
        auctionStatus = 'active';
        const orderForCalc = {
          auctionParams,
          status: order.status
        };
        currentPrice = calculateCurrentAuctionPrice(orderForCalc);
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
        timeRemaining: Math.max(0, (order.auction_params || order.auctionParams).endTime - Math.floor(Date.now() / 1000)),
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

    const order = await supabaseManager.getOrder(orderId);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
        timestamp: Date.now()
      });
    }

    // Check if user owns the order
    const orderData = order.order_data || order.order;
    if (orderData.maker.toLowerCase() !== userAddress?.toLowerCase()) {
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
    await supabaseManager.updateOrder(orderId, { 
      status: 'cancelled'
    });

    // Update secret status would be handled in supabaseManager if needed

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
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['string', 'address', 'uint256'],
      [order.salt, order.maker, Date.now()]
    )
  ).substring(0, 18); // Use first 16 characters as ID
}

function calculateOrderHash(order) {
  // CRITICAL FIX: Use same EIP-712 hash as SimpleLimitOrderProtocol contract
  // This must match: orderHash = _hashTypedDataV4(hashOrder(order))
  
  const domain = {
    name: "1inch Limit Order Protocol",
    version: "4",
    chainId: 11155111, // Sepolia
    verifyingContract: "0x584c43954CfbA4C0Cb00eECE36d1dcc249ae2dfD" // SimpleLimitOrderProtocol address
  };

  const types = {
    Order: [
      { name: "salt", type: "uint256" },
      { name: "makerAsset", type: "address" },
      { name: "takerAsset", type: "address" },
      { name: "maker", type: "address" },
      { name: "receiver", type: "address" },
      { name: "allowedSender", type: "address" },
      { name: "makingAmount", type: "uint256" },
      { name: "takingAmount", type: "uint256" },
      { name: "offsets", type: "uint256" },
      { name: "interactions", type: "bytes" }
    ]
  };

  const orderData = {
    salt: order.salt,
    makerAsset: order.makerAsset,
    takerAsset: order.takerAsset,
    maker: order.maker,
    receiver: order.receiver || ethers.ZeroAddress,
    allowedSender: order.allowedSender || ethers.ZeroAddress,
    makingAmount: order.makingAmount,
    takingAmount: order.takingAmount,
    offsets: order.offsets || '0',
    interactions: order.interactions || '0x'
  };

  // Use ethers.js to calculate EIP-712 hash
  return ethers.TypedDataEncoder.hash(domain, types, orderData);
}

function calculateCurrentAuctionPrice(order) {
  const now = Math.floor(Date.now() / 1000);
  const { startTime, endTime, startPrice, endPrice } = order.auctionParams;
  
  if (now < startTime) return startPrice;
  if (now >= endTime) return endPrice;
  
  const timeElapsed = now - startTime;
  const totalDuration = endTime - startTime;
  const progress = timeElapsed / totalDuration;
  
  const startPriceBig = BigInt(startPrice);
  const endPriceBig = BigInt(endPrice);
  const priceDifference = startPriceBig - endPriceBig;
  const priceReduction = (priceDifference * BigInt(Math.floor(progress * 10000))) / BigInt(10000);
  const currentPrice = startPriceBig - priceReduction;
  
  return currentPrice.toString();
}

async function encryptSecret(secret, userAddress) {
  // In a real implementation, use proper encryption
  // For now, return a simple encoded version
  return Buffer.from(secret + userAddress).toString('base64');
}

/**
 * GET /api/orders/:id/secret - Get secret for atomic swap completion
 */
router.get('/:id/secret', [
  param('id').isString().notEmpty(),
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

    const { id } = req.params;
    const userAddress = req.headers['user-address']?.toLowerCase();

    // Get order from database
    const order = await supabaseManager.getOrder(id);
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
        timestamp: Date.now()
      });
    }

    // Check if user is authorized (maker of the order)
    if (!userAddress || order.order.maker.toLowerCase() !== userAddress) {
      return res.status(403).json({
        success: false,
        error: 'Not authorized to access this order secret',
        timestamp: Date.now()
      });
    }

    // Check if order is in a state where secret can be accessed
    const validStatuses = ['awaiting_user_action', 'active', 'filled'];
    if (!validStatuses.includes(order.status)) {
      return res.status(400).json({
        success: false,
        error: 'Order is not in a valid state for secret access',
        details: `Current status: ${order.status}`,
        timestamp: Date.now()
      });
    }

    // Get the secret from the secrets table
    const secret = await supabaseManager.getSecret(id);
    if (!secret) {
      return res.status(404).json({
        success: false,
        error: 'Secret not found for this order',
        timestamp: Date.now()
      });
    }

    // Return the secret and escrow information
    res.json({
      success: true,
      data: {
        orderId: id,
        secret: secret.encryptedSecret,
        hashlock: secret.hashlock,
        instructions: {
          step1: `Call withdraw("${secret.encryptedSecret}") on destination escrow`,
          step2: "This will reveal the secret and give you your tokens",
          note: "Check escrow addresses on blockchain explorer"
        }
      },
      timestamp: Date.now()
    });

  } catch (error) {
    console.error('Error getting order secret:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: Date.now()
    });
  }
});

module.exports = router;