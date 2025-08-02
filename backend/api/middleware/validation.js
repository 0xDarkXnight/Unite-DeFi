/**
 * Validation middleware for API requests
 */

const { body, param, query, validationResult } = require('express-validator');
const { ethers } = require('ethers');
const { getSupportedChains } = require('../../config/chains');

/**
 * Custom validation functions
 */
const customValidators = {
  isEthereumAddress: (value) => {
    return ethers.isAddress(value);
  },
  
  isValidChainId: (value) => {
    const supportedChains = getSupportedChains();
    return supportedChains.includes(parseInt(value));
  },
  
  isBigNumberString: (value) => {
    try {
      ethers.BigNumber.from(value);
      return true;
    } catch {
      return false;
    }
  },
  
  isPositiveBigNumber: (value) => {
    try {
      const bn = BigInt(value);
      return bn > 0n;
    } catch {
      return false;
    }
  },
  
  isValidTimestamp: (value) => {
    const timestamp = parseInt(value);
    return timestamp > 0 && timestamp < 2147483647; // Valid Unix timestamp
  },
  
  isValidOrderStatus: (value) => {
    return ['active', 'filled', 'expired', 'cancelled'].includes(value);
  },
  
  isValidEscrowStatus: (value) => {
    return ['pending', 'created', 'funded', 'withdrawn', 'cancelled'].includes(value);
  },
  
  isValidHexString: (value, length = null) => {
    if (!value.startsWith('0x')) return false;
    const hex = value.slice(2);
    if (length !== null && hex.length !== length) return false;
    return /^[0-9a-fA-F]*$/.test(hex);
  }
};

/**
 * Validation result handler
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array().map(error => ({
        field: error.param,
        message: error.msg,
        value: error.value,
        location: error.location
      })),
      timestamp: Date.now()
    });
  }
  
  next();
};

/**
 * Common validation chains
 */
const validationChains = {
  // Order validation
  createOrder: [
    body('order').isObject().withMessage('Order must be an object'),
    body('order.salt').isString().notEmpty().withMessage('Salt is required'),
    body('order.maker').custom(customValidators.isEthereumAddress).withMessage('Invalid maker address'),
    body('order.makerAsset').custom(customValidators.isEthereumAddress).withMessage('Invalid maker asset address'),
    body('order.takerAsset').custom(customValidators.isEthereumAddress).withMessage('Invalid taker asset address'),
    body('order.makingAmount').custom(customValidators.isPositiveBigNumber).withMessage('Invalid making amount'),
    body('order.takingAmount').custom(customValidators.isPositiveBigNumber).withMessage('Invalid taking amount'),
    body('order.makerTraits').isString().notEmpty().withMessage('Maker traits is required'),
    
    body('signature').isObject().withMessage('Signature must be an object'),
    body('signature.r').custom(value => customValidators.isValidHexString(value, 64)).withMessage('Invalid signature r'),
    body('signature.vs').custom(value => customValidators.isValidHexString(value, 64)).withMessage('Invalid signature vs'),
    
    body('auctionParams').isObject().withMessage('Auction params must be an object'),
    body('auctionParams.startTime').custom(customValidators.isValidTimestamp).withMessage('Invalid start time'),
    body('auctionParams.endTime').custom(customValidators.isValidTimestamp).withMessage('Invalid end time'),
    body('auctionParams.startPrice').custom(customValidators.isPositiveBigNumber).withMessage('Invalid start price'),
    body('auctionParams.endPrice').custom(customValidators.isPositiveBigNumber).withMessage('Invalid end price'),
    
    body('crossChainData').isObject().withMessage('Cross chain data must be an object'),
    body('crossChainData.srcChainId').custom(customValidators.isValidChainId).withMessage('Invalid source chain ID'),
    body('crossChainData.dstChainId').custom(customValidators.isValidChainId).withMessage('Invalid destination chain ID'),
    body('crossChainData.dstToken').custom(customValidators.isEthereumAddress).withMessage('Invalid destination token address'),
    body('crossChainData.dstAmount').custom(customValidators.isPositiveBigNumber).withMessage('Invalid destination amount'),
    
    body('secret').isString().isLength({ min: 10, max: 100 }).withMessage('Secret must be 10-100 characters'),
    
    // Custom validation
    body().custom((value, { req }) => {
      const { auctionParams } = req.body;
      if (auctionParams.endTime <= auctionParams.startTime) {
        throw new Error('End time must be after start time');
      }
      
      const now = Math.floor(Date.now() / 1000);
      if (auctionParams.startTime < now) {
        throw new Error('Start time must be in the future');
      }
      
      if (auctionParams.endTime - auctionParams.startTime < 60) {
        throw new Error('Auction duration must be at least 1 minute');
      }
      
      if (auctionParams.endTime - auctionParams.startTime > 86400) {
        throw new Error('Auction duration cannot exceed 24 hours');
      }
      
      return true;
    })
  ],
  
  // Order query validation
  queryOrders: [
    query('status').optional().custom(customValidators.isValidOrderStatus).withMessage('Invalid status'),
    query('maker').optional().custom(customValidators.isEthereumAddress).withMessage('Invalid maker address'),
    query('srcChainId').optional().custom(customValidators.isValidChainId).withMessage('Invalid source chain ID'),
    query('dstChainId').optional().custom(customValidators.isValidChainId).withMessage('Invalid destination chain ID'),
    query('page').optional().isInt({ min: 1 }).toInt().withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt().withMessage('Limit must be between 1 and 100'),
    query('sortBy').optional().isIn(['createdAt', 'currentPrice', 'filledAt']).withMessage('Invalid sort field'),
    query('sortOrder').optional().isIn(['asc', 'desc']).withMessage('Invalid sort order')
  ],
  
  // Resolver validation
  createResolver: [
    body('address').custom(customValidators.isEthereumAddress).withMessage('Invalid resolver address'),
    body('owner').custom(customValidators.isEthereumAddress).withMessage('Invalid owner address'),
    body('supportedChains').isArray().withMessage('Supported chains must be an array'),
    body('supportedChains.*').custom(customValidators.isValidChainId).withMessage('Invalid chain ID'),
    body('minProfitThreshold').custom(customValidators.isPositiveBigNumber).withMessage('Invalid profit threshold'),
    body('maxGasPrice').custom(customValidators.isPositiveBigNumber).withMessage('Invalid max gas price')
  ],
  
  // Escrow validation
  queryEscrows: [
    query('orderId').optional().isString().notEmpty().withMessage('Invalid order ID'),
    query('status').optional().custom(customValidators.isValidEscrowStatus).withMessage('Invalid escrow status'),
    query('chainId').optional().custom(customValidators.isValidChainId).withMessage('Invalid chain ID'),
    query('type').optional().isIn(['src', 'dst']).withMessage('Invalid escrow type')
  ],
  
  // Parameter validation
  orderIdParam: [
    param('id').isString().notEmpty().withMessage('Order ID is required')
  ],
  
  resolverIdParam: [
    param('id').isString().notEmpty().withMessage('Resolver ID is required')
  ],
  
  escrowIdParam: [
    param('id').isString().notEmpty().withMessage('Escrow ID is required')
  ],
  
  addressParam: [
    param('address').custom(customValidators.isEthereumAddress).withMessage('Invalid address')
  ]
};

/**
 * Sanitization functions
 */
const sanitizers = {
  normalizeAddress: (address) => {
    if (typeof address === 'string' && ethers.isAddress(address)) {
      return ethers.getAddress(address); // Checksum address
    }
    return address;
  },
  
  normalizeBigNumber: (value) => {
    try {
      return ethers.BigNumber.from(value).toString();
    } catch {
      return value;
    }
  },
  
  sanitizeString: (str) => {
    if (typeof str !== 'string') return str;
    return str.trim().replace(/[<>]/g, '');
  }
};

/**
 * Sanitization middleware
 */
const sanitizeRequest = (req, res, next) => {
  try {
    // Sanitize common fields
    if (req.body) {
      // Normalize addresses
      if (req.body.order) {
        if (req.body.order.maker) {
          req.body.order.maker = sanitizers.normalizeAddress(req.body.order.maker);
        }
        if (req.body.order.receiver) {
          req.body.order.receiver = sanitizers.normalizeAddress(req.body.order.receiver);
        }
        if (req.body.order.makerAsset) {
          req.body.order.makerAsset = sanitizers.normalizeAddress(req.body.order.makerAsset);
        }
        if (req.body.order.takerAsset) {
          req.body.order.takerAsset = sanitizers.normalizeAddress(req.body.order.takerAsset);
        }
      }
      
      if (req.body.crossChainData && req.body.crossChainData.dstToken) {
        req.body.crossChainData.dstToken = sanitizers.normalizeAddress(req.body.crossChainData.dstToken);
      }
      
      if (req.body.address) {
        req.body.address = sanitizers.normalizeAddress(req.body.address);
      }
      
      if (req.body.owner) {
        req.body.owner = sanitizers.normalizeAddress(req.body.owner);
      }
    }
    
    // Sanitize query parameters
    if (req.query.maker) {
      req.query.maker = sanitizers.normalizeAddress(req.query.maker);
    }
    
    next();
  } catch (error) {
    console.error('Sanitization error:', error);
    next(error);
  }
};

module.exports = {
  customValidators,
  handleValidationErrors,
  validationChains,
  sanitizers,
  sanitizeRequest
};