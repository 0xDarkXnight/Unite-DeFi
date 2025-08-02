/**
 * Main Relayer Service - Manages secrets and validates cross-chain escrows
 */

const crypto = require('crypto');
const { ethers } = require('ethers');
const { supabaseManager } = require('../../database/supabase');
const { config } = require('../../config');
const { getChainConfig } = require('../../config/chains');
const { cacheGet, cacheSet } = require('../../database/connection');

class RelayerService {
  constructor() {
    this.providers = new Map();
    this.isRunning = false;
    this.validationQueue = [];
    this.secretManager = new SecretManager();
    
    this.initializeProviders();
    this.escrowValidator = new EscrowValidator(this.providers);
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
      
      // Get order from database using Supabase
      const order = await supabaseManager.getOrder(orderId);
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
      console.log(`🔐 Sharing secret with user for order ${order.order_id}`);
      
      // Get encrypted secret from database using Supabase
      const secretRecord = await supabaseManager.getSecret(order.order_id);
      if (!secretRecord) {
        throw new Error(`Secret not found for order ${order.order_id}`);
      }
      
      // Decrypt secret
      const secret = await this.secretManager.decryptSecret(secretRecord.encrypted_secret, order.order_id);
      
      // Share secret with user (this would be through encrypted communication)
      await this.sendSecretToUser(order.order_data.maker, secret, order.order_id);
      
      // Update secret status using Supabase
      await supabaseManager.updateSecret(order.order_id, { 
        status: 'shared',
        shared_at: new Date().toISOString()
      });
      
      console.log(`✅ Secret shared with user for order ${order.order_id}`);
      
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
        // Get pending escrows that need validation using Supabase
        const { escrows: pendingEscrows } = await supabaseManager.getEscrows(
          { status: 'pending' },
          { limit: 100 }
        );
        
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

  /**
   * Save validation results to database
   * @param {string} orderId - Order ID
   * @param {Object} results - Validation results
   */
  async saveValidationResults(orderId, results) {
    try {
      const validationData = {
        orderId,
        srcValidation: results.src,
        dstValidation: results.dst,
        overallValid: results.overall,
        validatedAt: new Date().toISOString(),
        validatedBy: 'relayer-service'
      };

      // Store in cache for quick access
      await cacheSet(`validation:${orderId}`, validationData, 3600);
      
      // Could also store in database table for permanent record
      console.log(`✅ Validation results saved for order ${orderId}`);
      return validationData;
    } catch (error) {
      console.error(`❌ Error saving validation results for order ${orderId}:`, error);
      throw error;
    }
  }

  /**
   * Log validation failure for debugging
   * @param {string} orderId - Order ID
   * @param {Object} validation - Validation data
   */
  async logValidationFailure(orderId, validation) {
    try {
      const failureLog = {
        orderId,
        error: validation.error,
        srcValidation: validation.src,
        dstValidation: validation.dst,
        timestamp: new Date().toISOString(),
        severity: 'error'
      };

      // Store failure log in cache with longer TTL for debugging
      await cacheSet(`validation_failure:${orderId}`, failureLog, 86400);
      
      console.error(`❌ Validation failure logged for order ${orderId}:`, {
        error: validation.error,
        srcValid: validation.src?.valid || false,
        dstValid: validation.dst?.valid || false
      });
      
      return failureLog;
    } catch (error) {
      console.error(`❌ Error logging validation failure for order ${orderId}:`, error);
    }
  }

  /**
   * Validate escrow deployment
   * @param {Object} escrow - Escrow data
   */
  async validateEscrowDeployment(escrow) {
    try {
      const provider = this.providers.get(escrow.chainId);
      if (!provider) {
        throw new Error(`No provider available for chain ${escrow.chainId}`);
      }

      // Check if contract exists at address
      const code = await provider.getCode(escrow.address);
      if (code === '0x') {
        throw new Error(`No contract found at address ${escrow.address}`);
      }

      // Create contract instance to check if it's valid escrow
      const escrowContract = new ethers.Contract(escrow.address, ESCROW_ABI, provider);
      
      // Verify contract state
      const [initialized, token, amount] = await Promise.all([
        escrowContract.initialized().catch(() => false),
        escrowContract.token().catch(() => null),
        escrowContract.amount().catch(() => null)
      ]);

      if (!initialized) {
        throw new Error('Escrow contract not properly initialized');
      }

      console.log(`✅ Escrow deployment validated: ${escrow.address} on chain ${escrow.chainId}`);
      return {
        valid: true,
        address: escrow.address,
        chainId: escrow.chainId,
        token,
        amount,
        initialized
      };
    } catch (error) {
      console.error(`❌ Escrow deployment validation failed:`, error);
      return {
        valid: false,
        error: error.message,
        address: escrow.address,
        chainId: escrow.chainId
      };
    }
  }
}

/**
 * Secret Manager - Handles secret encryption/decryption
 */
class SecretManager {
  constructor() {
    this.algorithm = config.relayer?.secretEncryption?.algorithm || 'aes-256-gcm';
    this.keyLength = config.relayer?.secretEncryption?.keyLength || 32;
    this.ivLength = config.relayer?.secretEncryption?.ivLength || 16;
    this.masterKey = process.env.SECRET_MASTER_KEY || this.generateMasterKey();
  }

  /**
   * Generate a master key for encryption
   */
  generateMasterKey() {
    const key = crypto.randomBytes(this.keyLength).toString('hex');
    console.error('⚠️  Generated temporary master key. Set SECRET_MASTER_KEY in environment for production.');
    return key;
  }

  /**
   * Generate a random secret
   */
  generateSecret() {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Create hashlock from secret
   * @param {string} secret - Plain text secret
   */
  createHashlock(secret) {
    return ethers.keccak256(ethers.toUtf8Bytes(secret));
  }

  /**
   * Encrypt a secret
   * @param {string} secret - Plain text secret
   * @param {string} orderId - Order ID for key derivation
   */
  encryptSecret(secret, orderId) {
    try {
      const iv = crypto.randomBytes(this.ivLength);
      
      // Derive key from master key and order ID
      const derivedKey = crypto.scryptSync(this.masterKey, orderId, this.keyLength);
      
      const cipher = crypto.createCipherGCM(this.algorithm, derivedKey, iv);
      
      let encrypted = cipher.update(secret, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      return {
        encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        algorithm: this.algorithm
      };
    } catch (error) {
      console.error('❌ Error encrypting secret:', error);
      throw error;
    }
  }

  /**
   * Decrypt a secret
   * @param {Object|string} encryptedData - Encrypted secret data
   * @param {string} orderId - Order ID for key derivation
   */
  decryptSecret(encryptedData, orderId) {
    try {
      // Handle string input (backwards compatibility)
      if (typeof encryptedData === 'string') {
        return encryptedData; // Assume it's already decrypted
      }

      const { encrypted, iv, authTag, algorithm = this.algorithm } = encryptedData;
      
      // Derive same key from master key and order ID
      const derivedKey = crypto.scryptSync(this.masterKey, orderId, this.keyLength);
      
      const decipher = crypto.createDecipherGCM(algorithm, derivedKey, Buffer.from(iv, 'hex'));
      decipher.setAuthTag(Buffer.from(authTag, 'hex'));
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      console.error('❌ Error decrypting secret:', error);
      throw error;
    }
  }

  /**
   * Store encrypted secret in database
   * @param {string} orderId - Order ID
   * @param {string} secret - Plain text secret
   * @param {string} userAddress - User address
   */
  async storeSecret(orderId, secret, userAddress) {
    try {
      const hashlock = this.createHashlock(secret);
      const encryptedSecret = this.encryptSecret(secret, orderId);
      
      const secretData = {
        orderId,
        userAddress,
        encryptedSecret,
        hashlock,
        status: 'stored',
        createdAt: new Date().toISOString()
      };

      await supabaseManager.createSecret(secretData);
      console.log(`✅ Secret stored for order ${orderId}`);
      
      return hashlock;
    } catch (error) {
      console.error(`❌ Error storing secret for order ${orderId}:`, error);
      throw error;
    }
  }
}

/**
 * Escrow Validator - Validates escrow contracts and funding
 */
class EscrowValidator {
  constructor(providers) {
    this.providers = providers;
  }
  /**
   * Validate source escrow
   * @param {Object} order - Order data
   * @param {string} escrowAddress - Escrow address
   * @param {number} chainId - Chain ID
   */
  async validateSourceEscrow(order, escrowAddress, chainId) {
    try {
      const provider = this.providers.get(chainId);
      if (!provider) {
        throw new Error(`No provider available for chain ${chainId}`);
      }

      // Check if contract exists
      const code = await provider.getCode(escrowAddress);
      if (code === '0x') {
        throw new Error(`No contract found at address ${escrowAddress}`);
      }

      const escrowContract = new ethers.Contract(escrowAddress, ESCROW_ABI, provider);
      
      // Validate contract state
      const [token, amount, secretHash, user, resolver, initialized] = await Promise.all([
        escrowContract.token().catch(() => null),
        escrowContract.amount().catch(() => null),
        escrowContract.secretHash().catch(() => null),
        escrowContract.user().catch(() => null),
        escrowContract.resolver().catch(() => null),
        escrowContract.initialized().catch(() => false)
      ]);

      if (!initialized) {
        throw new Error('Source escrow not initialized');
      }

      // Validate against order data
      const expectedToken = order.order_data?.makerAsset || order.order?.makerAsset;
      const expectedAmount = order.order_data?.makingAmount || order.order?.makingAmount;
      const expectedUser = order.order_data?.maker || order.order?.maker;
      
      if (token.toLowerCase() !== expectedToken?.toLowerCase()) {
        throw new Error(`Token mismatch: expected ${expectedToken}, got ${token}`);
      }

      if (amount !== expectedAmount) {
        throw new Error(`Amount mismatch: expected ${expectedAmount}, got ${amount}`);
      }

      if (user.toLowerCase() !== expectedUser?.toLowerCase()) {
        throw new Error(`User mismatch: expected ${expectedUser}, got ${user}`);
      }

      // Check if escrow is properly funded
      const balance = await provider.getBalance(escrowAddress);
      const minBalance = ethers.parseEther('0.001'); // Minimum for gas
      
              if (balance < minBalance) {
        console.error(`❌ Source escrow insufficient balance: ${ethers.formatEther(balance)} ETH`);
      }

      console.log(`✅ Source escrow validation passed: ${escrowAddress}`);
      return {
        valid: true,
        address: escrowAddress,
        token,
        amount,
        secretHash,
        user,
        resolver,
        balance: balance.toString()
      };
    } catch (error) {
      console.error(`❌ Source escrow validation failed:`, error);
      return {
        valid: false,
        error: error.message,
        address: escrowAddress,
        chainId
      };
    }
  }

  /**
   * Validate destination escrow
   * @param {Object} order - Order data
   * @param {string} escrowAddress - Escrow address
   * @param {number} chainId - Chain ID
   */
  async validateDestinationEscrow(order, escrowAddress, chainId) {
    try {
      const provider = this.providers.get(chainId);
      if (!provider) {
        throw new Error(`No provider available for chain ${chainId}`);
      }

      // Check if contract exists
      const code = await provider.getCode(escrowAddress);
      if (code === '0x') {
        throw new Error(`No contract found at address ${escrowAddress}`);
      }

      const escrowContract = new ethers.Contract(escrowAddress, ESCROW_ABI, provider);
      
      // Validate contract state
      const [token, amount, secretHash, user, resolver, initialized] = await Promise.all([
        escrowContract.token().catch(() => null),
        escrowContract.amount().catch(() => null),
        escrowContract.secretHash().catch(() => null),
        escrowContract.user().catch(() => null),
        escrowContract.resolver().catch(() => null),
        escrowContract.initialized().catch(() => false)
      ]);

      if (!initialized) {
        throw new Error('Destination escrow not initialized');
      }

      // Validate against order data
      const expectedToken = order.cross_chain_data?.dstToken || order.crossChainData?.dstToken;
      const expectedAmount = order.cross_chain_data?.dstAmount || order.crossChainData?.dstAmount;
      const expectedUser = order.order_data?.maker || order.order?.maker;
      
      if (token.toLowerCase() !== expectedToken?.toLowerCase()) {
        throw new Error(`Token mismatch: expected ${expectedToken}, got ${token}`);
      }

      if (amount !== expectedAmount) {
        throw new Error(`Amount mismatch: expected ${expectedAmount}, got ${amount}`);
      }

      if (user.toLowerCase() !== expectedUser?.toLowerCase()) {
        throw new Error(`User mismatch: expected ${expectedUser}, got ${user}`);
      }

      // Check if resolver has deposited funds
      const balance = await provider.getBalance(escrowAddress);
      const minBalance = ethers.parseEther('0.001'); // Minimum for gas
      
              if (balance < minBalance) {
        console.error(`❌ Destination escrow insufficient balance: ${ethers.formatEther(balance)} ETH`);
      }

      console.log(`✅ Destination escrow validation passed: ${escrowAddress}`);
      return {
        valid: true,
        address: escrowAddress,
        token,
        amount,
        secretHash,
        user,
        resolver,
        balance: balance.toString()
      };
    } catch (error) {
      console.error(`❌ Destination escrow validation failed:`, error);
      return {
        valid: false,
        error: error.message,
        address: escrowAddress,
        chainId
      };
    }
  }
}

// Placeholder for escrow ABI - you would import this from your contract artifacts
const ESCROW_ABI = [
  "event EscrowWithdrawal(bytes32 secret)",
  "event EscrowCancelled()",
  "function withdraw(bytes32 secret, tuple(bytes32,bytes32,address,address,address,uint256,uint256,uint256) immutables) external"
];

module.exports = RelayerService;