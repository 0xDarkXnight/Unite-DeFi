/**
 * Webhooks API Routes - Handle external notifications and events
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
// const { Order, Escrow, ResolverOperation } = require('../../database/models');
const { supabaseManager } = require('../../database/supabase');
const { cacheSet } = require('../../database/connection');

const router = express.Router();

/**
 * POST /api/webhooks/resolver - Resolver notification webhook
 * Called by resolvers to notify about operations
 */
router.post('/resolver', [
  body('resolverId').isString().notEmpty().withMessage('Resolver ID is required'),
  body('type').isIn(['order_filled', 'escrow_deployed', 'operation_completed']).withMessage('Invalid notification type'),
  body('data').isObject().withMessage('Data object is required')
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

    const { resolverId, type, data } = req.body;
    
    console.log(`📨 Received resolver webhook: ${type} from ${resolverId}`);
    
    switch (type) {
      case 'order_filled':
        await handleOrderFilled(resolverId, data);
        break;
        
      case 'escrow_deployed':
        await handleEscrowDeployed(resolverId, data);
        break;
        
      case 'operation_completed':
        await handleOperationCompleted(resolverId, data);
        break;
        
      default:
        return res.status(400).json({
          success: false,
          error: 'Unknown notification type',
          timestamp: Date.now()
        });
    }
    
    res.json({
      success: true,
      data: {
        type,
        processed: true
      },
      timestamp: Date.now()
    });
    
  } catch (error) {
    console.error('Error processing resolver webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Webhook processing failed',
      timestamp: Date.now()
    });
  }
});

/**
 * POST /api/webhooks/blockchain - Blockchain event webhook
 * Called by blockchain monitoring services
 */
router.post('/blockchain', [
  body('chainId').isInt({ min: 1 }).withMessage('Valid chain ID is required'),
  body('eventType').isString().notEmpty().withMessage('Event type is required'),
  body('transactionHash').isString().notEmpty().withMessage('Transaction hash is required'),
  body('blockNumber').isInt({ min: 0 }).withMessage('Block number is required'),
  body('eventData').isObject().withMessage('Event data is required')
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

    const { chainId, eventType, transactionHash, blockNumber, eventData } = req.body;
    
    console.log(`⛓️ Received blockchain event: ${eventType} on chain ${chainId}`);
    
    switch (eventType) {
      case 'EscrowWithdrawal':
        await handleEscrowWithdrawal(chainId, transactionHash, eventData);
        break;
        
      case 'EscrowCancelled':
        await handleEscrowCancelled(chainId, transactionHash, eventData);
        break;
        
      case 'OrderFilled':
        await handleOrderFilledEvent(chainId, transactionHash, eventData);
        break;
        
      default:
        console.log(`⚠️ Unknown blockchain event type: ${eventType}`);
    }
    
    res.json({
      success: true,
      data: {
        chainId,
        eventType,
        processed: true
      },
      timestamp: Date.now()
    });
    
  } catch (error) {
    console.error('Error processing blockchain webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Blockchain webhook processing failed',
      timestamp: Date.now()
    });
  }
});

/**
 * POST /api/webhooks/relayer - Relayer service webhook
 * For relayer service notifications
 */
router.post('/relayer', [
  body('type').isIn(['secret_shared', 'validation_completed', 'swap_completed']).withMessage('Invalid relayer event type'),
  body('orderId').isString().notEmpty().withMessage('Order ID is required'),
  body('data').isObject().withMessage('Data object is required')
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

    const { type, orderId, data } = req.body;
    
    console.log(`🔐 Received relayer event: ${type} for order ${orderId}`);
    
    switch (type) {
      case 'secret_shared':
        await handleSecretShared(orderId, data);
        break;
        
      case 'validation_completed':
        await handleValidationCompleted(orderId, data);
        break;
        
      case 'swap_completed':
        await handleSwapCompleted(orderId, data);
        break;
    }
    
    res.json({
      success: true,
      data: {
        type,
        orderId,
        processed: true
      },
      timestamp: Date.now()
    });
    
  } catch (error) {
    console.error('Error processing relayer webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Relayer webhook processing failed',
      timestamp: Date.now()
    });
  }
});

// Webhook handler functions

async function handleOrderFilled(resolverId, data) {
  const { orderId, txHash, chainId, price } = data;
  
  // Update order status
  await Order.updateOne(
    { orderId },
    {
      status: 'filled',
      filledAt: Date.now(),
      'resolver.address': resolverId,
      'resolver.fillTxHash': txHash,
      currentPrice: price
    }
  );
  
  console.log(`✅ Order ${orderId} filled by resolver ${resolverId}`);
}

async function handleEscrowDeployed(resolverId, data) {
  const { orderId, escrowAddress, chainId, type, txHash, immutables } = data;
  
  // Create or update escrow record
  const escrowId = `${orderId}_${type}_${chainId}`;
  
  await Escrow.findOneAndUpdate(
    { escrowId },
    {
      escrowId,
      orderId,
      type,
      address: escrowAddress,
      chainId,
      immutables,
      status: 'created',
      deployTxHash: txHash,
      deployedAt: Date.now(),
      createdAt: Date.now()
    },
    { upsert: true }
  );
  
  console.log(`🏗️ Escrow ${type} deployed for order ${orderId} at ${escrowAddress}`);
  
  // Cache notification for relayer service
  await cacheSet(`relayer_notification:${orderId}`, {
    orderId,
    resolver: resolverId,
    escrowAddress,
    chainId,
    type,
    txHash,
    timestamp: Date.now()
  }, 3600);
}

async function handleOperationCompleted(resolverId, data) {
  const { operationId, status, txHash, gasUsed } = data;
  
  // Update operation record
  await ResolverOperation.updateOne(
    { operationId, resolverId },
    {
      status,
      txHash,
      gasUsed,
      confirmedAt: status === 'confirmed' ? Date.now() : null,
      failedAt: status === 'failed' ? Date.now() : null
    }
  );
  
  console.log(`📋 Operation ${operationId} ${status} for resolver ${resolverId}`);
}

async function handleEscrowWithdrawal(chainId, txHash, eventData) {
  const { escrowAddress, secret } = eventData;
  
  // Find escrow by address and chain
  const escrow = await Escrow.findOne({ address: escrowAddress, chainId });
  if (!escrow) {
    console.warn(`⚠️ Escrow not found: ${escrowAddress} on chain ${chainId}`);
    return;
  }
  
  // Update escrow status
  await Escrow.updateOne(
    { _id: escrow._id },
    {
      status: 'withdrawn',
      withdrawTxHash: txHash,
      withdrawnAt: Date.now()
    }
  );
  
  console.log(`💰 Escrow withdrawal detected: ${escrowAddress}`);
  
  // If this withdrawal revealed a secret, update related records
  if (secret) {
    // TODO: Update secret status and handle atomic swap completion logic
  }
}

async function handleEscrowCancelled(chainId, txHash, eventData) {
  const { escrowAddress } = eventData;
  
  // Find and update escrow
  await Escrow.updateOne(
    { address: escrowAddress, chainId },
    {
      status: 'cancelled',
      cancelTxHash: txHash,
      cancelledAt: Date.now()
    }
  );
  
  console.log(`❌ Escrow cancelled: ${escrowAddress}`);
}

async function handleOrderFilledEvent(chainId, txHash, eventData) {
  const { orderHash, taker, makingAmount, takingAmount } = eventData;
  
  // Find order by hash
  const order = await Order.findOne({ orderHash });
  if (!order) {
    console.warn(`⚠️ Order not found for hash: ${orderHash}`);
    return;
  }
  
  // Update order if not already updated
  if (order.status === 'active') {
    await Order.updateOne(
      { orderHash },
      {
        status: 'filled',
        filledAt: Date.now(),
        'resolver.address': taker,
        'resolver.fillTxHash': txHash
      }
    );
    
    console.log(`📝 Order filled event processed: ${order.orderId}`);
  }
}

async function handleSecretShared(orderId, data) {
  const { userAddress, sharedAt } = data;
  
  // Update order status to indicate secret has been shared
  await Order.updateOne(
    { orderId },
    { 
      'secretStatus': 'shared',
      'secretSharedAt': sharedAt || Date.now()
    }
  );
  
  console.log(`🔑 Secret shared for order ${orderId} with user ${userAddress}`);
}

async function handleValidationCompleted(orderId, data) {
  const { valid, srcEscrow, dstEscrow } = data;
  
  if (valid) {
    // Update escrows to funded status
    await Escrow.updateMany(
      { orderId },
      { status: 'funded' }
    );
    
    console.log(`✅ Validation completed for order ${orderId} - escrows are valid`);
  } else {
    console.log(`❌ Validation failed for order ${orderId}`);
  }
}

async function handleSwapCompleted(orderId, data) {
  const { srcTxHash, dstTxHash, completedAt } = data;
  
  // Update order to completed status
  await Order.updateOne(
    { orderId },
    {
      status: 'filled',
      filledAt: completedAt || Date.now(),
      'swapCompletedAt': completedAt || Date.now()
    }
  );
  
  console.log(`🎊 Atomic swap completed for order ${orderId}`);
}

module.exports = router;