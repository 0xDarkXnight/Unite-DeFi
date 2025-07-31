/**
 * Main Relayer Service - Manages secrets and validates cross-chain escrows
 */

const crypto = require('crypto');
const { ethers } = require('ethers');
const { Order, Escrow, Secret } = require('../../database/models');
const { config } = require('../../config');
const { getChainConfig } = require('../../config/chains');
const { cacheGet, cacheSet } = require('../../database/connection');

class RelayerService {
  constructor() {
    this.providers = new Map();
    this.isRunning = false;
    this.validationQueue = [];
    this.secretManager = new SecretManager();
    this.escrowValidator = new EscrowValidator();
    
    this.initializeProviders();
  }

  /**
   * Initialize blockchain providers for all supported chains
   */
  initializeProviders() {
    for (const chainId of config.blockchain.supportedChains) {
      const chainConfig = getChainConfig(chainId);
      const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
      this.providers.set(chainId, provider);
      console.log(`✅ Provider initialized for ${chainConfig.name} (${chainId})`);
    }
  }

  /**
   * Start the relayer service
   */
  async start() {
    if (this.isRunning) {
      throw new Error('Relayer service is already running');
    }

    console.log('🚀 Starting Relayer Service...');
    
    this.isRunning = true;
    
    // Start validation worker
    this.startValidationWorker();
    
    // Start monitoring escrow events
    this.startEscrowMonitoring();
    
    console.log('✅ Relayer Service started successfully');
  }

  /**
   * Stop the relayer service
   */
  async stop() {
    console.log('🛑 Stopping Relayer Service...');
    this.isRunning = false;
    console.log('✅ Relayer Service stopped');
  }

  /**
   * Process resolver notification about escrow deployment
   * @param {Object} notification - Resolver notification data
   */
  async processResolverNotification(notification) {
    try {
      const { orderId, escrowSrc, escrowDst, resolver } = notification;
      
      console.log(`📨 Processing resolver notification for order ${orderId}`);
      
      // Get order from database
      const order = await Order.findOne({ orderId });
      if (!order) {
        throw new Error(`Order ${orderId} not found`);
      }

      // Validate both escrows
      const validation = await this.validateEscrowPair(order, escrowSrc, escrowDst);
      
      if (validation.valid) {
        // Share secret with user
        await this.shareSecretWithUser(order);
        
        // Start monitoring atomic swap
        await this.monitorAtomicSwap(order, escrowSrc, escrowDst);
        
        console.log(`✅ Successfully processed notification for order ${orderId}`);
      } else {
        console.error(`❌ Escrow validation failed for order ${orderId}:`, validation.error);
        
        // Log failed validation for debugging
        await this.logValidationFailure(orderId, validation);
      }
      
    } catch (error) {
      console.error('❌ Error processing resolver notification:', error);
      throw error;
    }
  }

  /**
   * Validate escrow pair (source and destination)
   * @param {Object} order - Order data
   * @param {string} escrowSrcAddress - Source escrow address
   * @param {string} escrowDstAddress - Destination escrow address
   */
  async validateEscrowPair(order, escrowSrcAddress, escrowDstAddress) {
    try {
      console.log(`🔍 Validating escrow pair for order ${order.orderId}`);
      
      // Validate source escrow
      const srcValidation = await this.escrowValidator.validateSourceEscrow(
        order,
        escrowSrcAddress,
        order.crossChainData.srcChainId
      );
      
      // Validate destination escrow
      const dstValidation = await this.escrowValidator.validateDestinationEscrow(
        order,
        escrowDstAddress,
        order.crossChainData.dstChainId
      );
      
      const isValid = srcValidation.valid && dstValidation.valid;
      
      // Save validation results
      await this.saveValidationResults(order.orderId, {
        src: srcValidation,
        dst: dstValidation,
        overall: isValid
      });
      
      return {
        valid: isValid,
        src: srcValidation,
        dst: dstValidation,
        error: isValid ? null : 'Escrow validation failed'
      };
      
    } catch (error) {
      console.error('❌ Error validating escrow pair:', error);
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Share secret with user securely
   * @param {Object} order - Order data
   */
  async shareSecretWithUser(order) {
    try {
      console.log(`🔐 Sharing secret with user for order ${order.orderId}`);
      
      // Get encrypted secret from database
      const secretRecord = await Secret.findOne({ orderId: order.orderId });
      if (!secretRecord) {
        throw new Error(`Secret not found for order ${order.orderId}`);
      }
      
      // Decrypt secret
      const secret = await this.secretManager.decryptSecret(secretRecord.encryptedSecret);
      
      // Share secret with user (this would be through encrypted communication)
      await this.sendSecretToUser(order.order.maker, secret, order.orderId);
      
      // Update secret status
      await Secret.updateOne(
        { orderId: order.orderId },
        { 
          status: 'shared',
          sharedAt: Date.now()
        }
      );
      
      console.log(`✅ Secret shared with user for order ${order.orderId}`);
      
    } catch (error) {
      console.error('❌ Error sharing secret:', error);
      throw error;
    }
  }

  /**
   * Send secret to user (placeholder for secure communication)
   * @param {string} userAddress - User's address
   * @param {string} secret - The secret
   * @param {string} orderId - Order ID
   */
  async sendSecretToUser(userAddress, secret, orderId) {
    // In a real implementation, this would use:
    // 1. Encrypted WebSocket connection
    // 2. Push notification with encryption
    // 3. Email with encryption
    // 4. Off-chain messaging protocol
    
    console.log(`📧 Sending secret to user ${userAddress} for order ${orderId}`);
    
    // For now, we'll emit an event that the frontend can listen to
    // In production, implement secure communication channel
    
    // Cache the secret temporarily for user retrieval
    await cacheSet(`user_secret:${userAddress}:${orderId}`, {
      secret,
      orderId,
      timestamp: Date.now()
    }, 1800); // 30 minutes TTL
    
    // Here you would integrate with your secure communication method
    // Example: encrypted WebSocket, secure email, push notification, etc.
  }

  /**
   * Monitor atomic swap execution
   * @param {Object} order - Order data
   * @param {string} escrowSrcAddress - Source escrow address
   * @param {string} escrowDstAddress - Destination escrow address
   */
  async monitorAtomicSwap(order, escrowSrcAddress, escrowDstAddress) {
    try {
      console.log(`👁️ Starting atomic swap monitoring for order ${order.orderId}`);
      
      const srcProvider = this.providers.get(order.crossChainData.srcChainId);
      const dstProvider = this.providers.get(order.crossChainData.dstChainId);
      
      // Monitor destination escrow for user withdrawal (secret reveal)
      this.monitorEscrowWithdrawal(
        dstProvider,
        escrowDstAddress,
        order,
        'dst'
      );
      
      // Monitor source escrow for resolver withdrawal
      this.monitorEscrowWithdrawal(
        srcProvider,
        escrowSrcAddress,
        order,
        'src'
      );
      
    } catch (error) {
      console.error('❌ Error starting atomic swap monitoring:', error);
    }
  }

  /**
   * Monitor escrow withdrawal events
   * @param {Object} provider - Blockchain provider
   * @param {string} escrowAddress - Escrow contract address
   * @param {Object} order - Order data
   * @param {string} type - 'src' or 'dst'
   */
  async monitorEscrowWithdrawal(provider, escrowAddress, order, type) {
    try {
      // Create contract instance
      const escrowContract = new ethers.Contract(
        escrowAddress,
        ESCROW_ABI, // You would import this from your contract ABIs
        provider
      );
      
      // Listen for withdrawal events
      escrowContract.on('EscrowWithdrawal', async (secret, event) => {
        console.log(`🎉 Withdrawal detected on ${type} escrow for order ${order.orderId}`);
        
        // Update secret status if this is where it was revealed
        if (type === 'dst') {
          await Secret.updateOne(
            { orderId: order.orderId },
            {
              status: 'revealed',
              revealedAt: Date.now(),
              revealTxHash: event.transactionHash
            }
          );
        }
        
        // Update escrow status
        await Escrow.updateOne(
          { orderId: order.orderId, type },
          {
            status: 'withdrawn',
            withdrawnAt: Date.now(),
            withdrawTxHash: event.transactionHash
          }
        );
        
        // Check if atomic swap is complete
        await this.checkSwapCompletion(order.orderId);
      });
      
    } catch (error) {
      console.error(`❌ Error monitoring ${type} escrow withdrawal:`, error);
    }
  }

  /**
   * Check if atomic swap is complete
   * @param {string} orderId - Order ID
   */
  async checkSwapCompletion(orderId) {
    try {
      const escrows = await Escrow.find({ orderId });
      const allWithdrawn = escrows.every(escrow => escrow.status === 'withdrawn');
      
      if (allWithdrawn) {
        // Update order status to completed
        await Order.updateOne(
          { orderId },
          { 
            status: 'filled',
            filledAt: Date.now()
          }
        );
        
        console.log(`🎊 Atomic swap completed for order ${orderId}`);
        
        // Emit completion event for monitoring
        this.emit('swapCompleted', { orderId });
      }
      
    } catch (error) {
      console.error('❌ Error checking swap completion:', error);
    }
  }

  /**
   * Start validation worker
   */
  startValidationWorker() {
    const processQueue = async () => {
      if (!this.isRunning) return;
      
      if (this.validationQueue.length > 0) {
        const notification = this.validationQueue.shift();
        try {
          await this.processResolverNotification(notification);
        } catch (error) {
          console.error('❌ Error processing validation:', error);
        }
      }
      
      setTimeout(processQueue, 1000); // Process every second
    };
    
    processQueue();
  }

  /**
   * Start escrow monitoring
   */
  startEscrowMonitoring() {
    // Monitor for new escrow deployments and validate them
    setInterval(async () => {
      if (!this.isRunning) return;
      
      try {
        // Get pending escrows that need validation
        const pendingEscrows = await Escrow.find({ status: 'pending' });
        
        for (const escrow of pendingEscrows) {
          await this.validateEscrowDeployment(escrow);
        }
        
      } catch (error) {
        console.error('❌ Error in escrow monitoring:', error);
      }
    }, config.relayer.validation.fundsCheckInterval);
  }

  /**
   * Add notification to validation queue
   * @param {Object} notification - Resolver notification
   */
  queueValidation(notification) {
    this.validationQueue.push(notification);
    console.log(`📋 Added validation to queue. Queue size: ${this.validationQueue.length}`);
  }

  // Additional helper methods would go here...
  async saveValidationResults(orderId, results) {
    // Implementation for saving validation results
  }

  async logValidationFailure(orderId, validation) {
    // Implementation for logging validation failures
  }

  async validateEscrowDeployment(escrow) {
    // Implementation for validating escrow deployment
  }
}

/**
 * Secret Manager - Handles secret encryption/decryption
 */
class SecretManager {
  constructor() {
    this.algorithm = config.relayer.secretEncryption.algorithm;
    this.keyLength = config.relayer.secretEncryption.keyLength;
    this.ivLength = config.relayer.secretEncryption.ivLength;
  }

  /**
   * Encrypt a secret
   * @param {string} secret - Plain text secret
   * @param {string} key - Encryption key
   */
  encryptSecret(secret, key) {
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipher(this.algorithm, key);
    cipher.setAutoPadding(true);
    
    let encrypted = cipher.update(secret, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag ? cipher.getAuthTag() : Buffer.alloc(0);
    
    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  /**
   * Decrypt a secret
   * @param {Object} encryptedData - Encrypted secret data
   * @param {string} key - Decryption key
   */
  decryptSecret(encryptedData, key) {
    const decipher = crypto.createDecipher(this.algorithm, key);
    
    if (encryptedData.authTag) {
      decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
    }
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  }
}

/**
 * Escrow Validator - Validates escrow contracts and funding
 */
class EscrowValidator {
  /**
   * Validate source escrow
   * @param {Object} order - Order data
   * @param {string} escrowAddress - Escrow address
   * @param {number} chainId - Chain ID
   */
  async validateSourceEscrow(order, escrowAddress, chainId) {
    // Implementation for validating source escrow
    // Check: contract exists, properly funded, correct parameters
    return { valid: true }; // Placeholder
  }

  /**
   * Validate destination escrow
   * @param {Object} order - Order data
   * @param {string} escrowAddress - Escrow address
   * @param {number} chainId - Chain ID
   */
  async validateDestinationEscrow(order, escrowAddress, chainId) {
    // Implementation for validating destination escrow
    // Check: contract exists, properly funded, correct parameters
    return { valid: true }; // Placeholder
  }
}

// Placeholder for escrow ABI - you would import this from your contract artifacts
const ESCROW_ABI = [
  "event EscrowWithdrawal(bytes32 secret)",
  "event EscrowCancelled()",
  "function withdraw(bytes32 secret, tuple(bytes32,bytes32,address,address,address,uint256,uint256,uint256) immutables) external"
];

module.exports = RelayerService;