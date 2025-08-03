const { ethers } = require('ethers');
const { supabaseManager } = require('../../database/supabase');
const { getChainConfig } = require('../../config/chains');

/**
 * Service to monitor destination escrows for secret reveals
 * and automatically complete atomic swaps
 */
class SecretMonitor {
  constructor() {
    this.providers = new Map();
    this.activeMonitors = new Map(); // orderId -> monitor data
    this.resolverWallet = null;
    this.isRunning = false;
  }

  /**
   * Initialize the secret monitor
   */
  async initialize() {
    try {
      console.log('🔍 Initializing Secret Monitor...');
      
      // Store resolver private key for creating wallets as needed
      this.resolverPrivateKey = process.env.RESOLVER_PRIVATE_KEY || '0xb92a8c71a5b044a7f52b5aa2dd68a32bf4be0c3c9ebf462b10db7d6ba1cb5ecb';
      
      // Setup providers for supported chains
      const supportedChains = [11155111]; // Sepolia
      for (const chainId of supportedChains) {
        const chainConfig = getChainConfig(chainId);
        const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
        this.providers.set(chainId, provider);
      }
      
      // Create a sample wallet to get the address
      const sampleProvider = this.providers.get(11155111);
      const sampleWallet = new ethers.Wallet(this.resolverPrivateKey, sampleProvider);
      
      console.log('✅ Secret Monitor initialized successfully');
      console.log('🔑 Resolver address:', sampleWallet.address);
      
    } catch (error) {
      console.error('❌ Error initializing Secret Monitor:', error);
      throw error;
    }
  }

  /**
   * Start monitoring service
   */
  async start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    console.log('🚀 Starting Secret Monitor...');
    
    // Start the monitoring loop
    this.monitorLoop();
    
    console.log('✅ Secret Monitor started');
  }

  /**
   * Stop monitoring service
   */
  async stop() {
    this.isRunning = false;
    
    // Clear all active monitors
    for (const [orderId, monitor] of this.activeMonitors) {
      if (monitor.provider && monitor.provider.removeAllListeners) {
        monitor.provider.removeAllListeners();
      }
    }
    this.activeMonitors.clear();
    
    console.log('✅ Secret Monitor stopped');
  }

  /**
   * Add an order to monitor for escrow funding and secret reveals (NEW FLOW)
   */
  async addOrderToMonitor(orderData) {
    try {
      const { orderId, srcEscrow, dstEscrow, secretHash, chainId } = orderData;
      
      console.log(`👁️ Adding order ${orderId} to escrow funding monitoring`);
      console.log(`📍 Source escrow: ${srcEscrow}`);
      console.log(`📍 Destination escrow: ${dstEscrow}`);
      console.log(`🔑 Secret hash: ${secretHash}`);
      
      const provider = this.providers.get(chainId);
      if (!provider) {
        throw new Error(`No provider configured for chain ${chainId}`);
      }
      
      // Monitor both escrows for funding
      await this.monitorEscrowFunding(orderId, srcEscrow, dstEscrow, secretHash, chainId);
      
      console.log(`✅ Order ${orderId} added to escrow funding monitoring`);
      
    } catch (error) {
      console.error(`❌ Error adding order ${orderData.orderId} to monitoring:`, error);
      throw error;
    }
  }

  /**
   * Monitor escrow funding and trigger secret sharing when both are funded
   */
  async monitorEscrowFunding(orderId, srcEscrow, dstEscrow, secretHash, chainId) {
    const provider = this.providers.get(chainId);
    
    // Setup escrow contracts for monitoring
    const srcEscrowContract = new ethers.Contract(
      srcEscrow,
      [
        "function getStatus() external view returns (bool, bool, bool, uint256)",
        "event Withdrawn(address indexed to, bytes32 secret)"
      ],
      provider
    );

    const dstEscrowContract = new ethers.Contract(
      dstEscrow,
      [
        "function getStatus() external view returns (bool, bool, bool, uint256)",
        "event Withdrawn(address indexed to, bytes32 secret)"
      ],
      provider
    );

    // Monitor for secret reveals on destination escrow (user claiming funds)
    const dstWithdrawalHandler = async (to, secret, event) => {
      console.log(`🎉 Secret revealed for order ${orderId}!`);
      console.log(`🔑 Revealed secret: ${secret}`);
      console.log(`📍 User withdrawal from destination escrow by: ${to}`);
      
      try {
        // Complete the atomic swap by withdrawing from source escrow
        await this.completeAtomicSwap(orderId, srcEscrow, secret, chainId);
        
        // Remove from monitoring
        this.removeOrderFromMonitor(orderId);
        
      } catch (error) {
        console.error(`❌ Error completing atomic swap for order ${orderId}:`, error);
      }
    };

    // Start listening for destination escrow withdrawals
    dstEscrowContract.on('Withdrawn', dstWithdrawalHandler);

    // Store monitor data
    this.activeMonitors.set(orderId, {
      srcEscrow,
      dstEscrow,
      secretHash,
      chainId,
      provider,
      srcContract: srcEscrowContract,
      dstContract: dstEscrowContract,
      dstHandler: dstWithdrawalHandler,
      startedAt: Date.now(),
      bothFunded: false
    });

    // Start periodic funding check
    this.startFundingCheck(orderId);
  }

  /**
   * Periodically check if both escrows are funded
   */
  async startFundingCheck(orderId) {
    const checkFunding = async () => {
      try {
        const monitor = this.activeMonitors.get(orderId);
        if (!monitor || monitor.bothFunded) return;

        // Check both escrow funding status
        const [srcInitialized, srcWithdrawn, srcRefunded, srcBalance] = await monitor.srcContract.getStatus();
        const [dstInitialized, dstWithdrawn, dstRefunded, dstBalance] = await monitor.dstContract.getStatus();

        const srcFunded = srcInitialized && srcBalance > 0 && !srcWithdrawn && !srcRefunded;
        const dstFunded = dstInitialized && dstBalance > 0 && !dstWithdrawn && !dstRefunded;

        console.log(`📊 Funding status for order ${orderId}:`);
        console.log(`   Source escrow funded: ${srcFunded} (balance: ${srcBalance.toString()})`);
        console.log(`   Destination escrow funded: ${dstFunded} (balance: ${dstBalance.toString()})`);

        if (srcFunded && dstFunded && !monitor.bothFunded) {
          console.log(`🎉 Both escrows are funded for order ${orderId}! Sharing secret...`);
          monitor.bothFunded = true;
          
          // Clear the interval before processing to prevent duplicate attempts
          if (monitor.fundingCheckInterval) {
            clearInterval(monitor.fundingCheckInterval);
            monitor.fundingCheckInterval = null;
          }
          
                // Share the secret with the user - wrap in try-catch to prevent interval issues
      try {
        await this.shareSecretWithUser(orderId);
      } catch (error) {
        console.error(`❌ Error in shareSecretWithUser for order ${orderId}:`, error);
        // Don't re-throw here to prevent interval from crashing
      }
        }
      } catch (error) {
        console.error(`❌ Error checking funding for order ${orderId}:`, error);
      }
    };

    // Check immediately and then every 30 seconds
    await checkFunding();
    const interval = setInterval(checkFunding, 30000);
    
    // Store interval for cleanup
    const monitor = this.activeMonitors.get(orderId);
    if (monitor) {
      monitor.fundingCheckInterval = interval;
    }
  }

  /**
   * Automatically complete the atomic swap once both escrows are funded
   */
  async shareSecretWithUser(orderId) {
    try {
      console.log(`🔑 Both escrows funded - automatically completing atomic swap for order ${orderId}...`);
      
      // Get secret from database
      const secretData = await supabaseManager.getSecret(orderId);
      if (!secretData) {
        throw new Error(`No secret found for order ${orderId}`);
      }

      // Get monitor data
      const monitor = this.activeMonitors.get(orderId);
      if (!monitor) {
        throw new Error(`No monitor found for order ${orderId}`);
      }

      // AUTOMATIC WITHDRAWAL: Withdraw user's tokens from destination escrow
      console.log(`🚀 Automatically withdrawing user tokens from destination escrow...`);
      
      // Create resolver wallet for this chain
      const chainConfig = getChainConfig(monitor.chainId);
      const provider = this.providers.get(monitor.chainId);
      const resolverWallet = new ethers.Wallet(this.resolverPrivateKey, provider);
      
      // CRITICAL FIX: Call withdrawToUser via SimpleResolver instead of directly
      // because destination escrow has onlyResolver modifier
      const resolverContract = new ethers.Contract(
        chainConfig.contracts.resolver,
        [
          "function withdrawToUserFromDestinationEscrow(address dstEscrow, bytes32 secret) external"
        ],
        resolverWallet
      );

      // Use the secret to withdraw user's tokens from destination escrow (sent directly to user)
      // CRITICAL FIX: secretData.encryptedSecret is Base64 encoded and concatenated with user address
      // Need to decode and extract just the secret part
      let secret;
      let secretForContract;
      try {
        // Decode the Base64 encoded secret
        const decodedSecret = Buffer.from(secretData.encryptedSecret, 'base64').toString();
        console.log(`🔑 Decoded secret: ${decodedSecret}`);
        
        // Extract just the secret part (before the user address)
        // Format is: secret + userAddress
        const userAddress = secretData.userAddress || secretData.user_address;
        if (decodedSecret.endsWith(userAddress)) {
          secret = decodedSecret.slice(0, -userAddress.length);
        } else {
          // Fallback: try to extract 66-character hex string (0x + 64 chars)
          const hexMatch = decodedSecret.match(/0x[a-fA-F0-9]{64}/);
          secret = hexMatch ? hexMatch[0] : decodedSecret;
        }
        
        // CRITICAL FIX: The stored secret is the original user input, but escrows expect the FIRST hash
        // orders.js does: hashlock = keccak256(keccak256(utf8Bytes(secret)))
        // Escrow validates: keccak256(provided_secret) == hashlock
        // So we need to provide: keccak256(utf8Bytes(original_secret))
        
        // First ensure secret has proper format
        if (!secret.startsWith('0x')) {
          // If secret is 64 chars without 0x prefix, add it
          if (secret.length === 64 && /^[a-fA-F0-9]+$/.test(secret)) {
            secret = '0x' + secret;
          } else {
            throw new Error(`Invalid secret format: ${secret}`);
          }
        }
        
        // Convert the original secret to the first hash (what escrow expects)
        secretForContract = ethers.keccak256(ethers.toUtf8Bytes(secret));
        
        console.log(`🔑 Original secret: ${secret}`);
        console.log(`🔑 Secret hash for contract: ${secretForContract}`);
      } catch (error) {
        console.error(`❌ Error processing secret:`, error);
        throw error;
      }
      
      let withdrawTx;
      let withdrawTxHash;
      try {
        withdrawTx = await resolverContract.withdrawToUserFromDestinationEscrow(monitor.dstEscrow, secretForContract);
        const withdrawReceipt = await withdrawTx.wait();
        withdrawTxHash = withdrawReceipt.hash;
        console.log(`✅ User tokens automatically withdrawn from destination escrow! Hash: ${withdrawReceipt.hash}`);
      } catch (error) {
        // Check if it's an "already known" error - transaction was already submitted
        if (error.code === 'UNKNOWN_ERROR' && error.error?.message === 'already known') {
          console.log(`⏳ Transaction already submitted, waiting for confirmation...`);
          // Transaction was already sent, just wait a bit and continue
          await new Promise(resolve => setTimeout(resolve, 5000));
          withdrawTxHash = 'pending_withdrawal';
        } else {
          throw error;
        }
      }

      // Now complete the atomic swap by withdrawing resolver tokens from source escrow
      await this.completeAtomicSwap(orderId, monitor.srcEscrow, secretForContract, monitor.chainId);

      // Update status
      await supabaseManager.updateSecret(orderId, {
        status: 'revealed',
        revealed_at: new Date().toISOString()
      });

      await supabaseManager.updateOrder(orderId, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        completion_tx_hash: withdrawTxHash
      });

      console.log(`🎉 ATOMIC SWAP COMPLETED AUTOMATICALLY for order ${orderId}!`);
      console.log(`📝 User tokens sent to user, resolver tokens claimed from source escrow`);

      // Remove from monitoring
      this.removeOrderFromMonitor(orderId);

    } catch (error) {
      console.error(`❌ Error automatically completing atomic swap for order ${orderId}:`, error);
      throw error;
    }
  }

  /**
   * Remove an order from monitoring
   */
  removeOrderFromMonitor(orderId) {
    const monitor = this.activeMonitors.get(orderId);
    if (monitor) {
      // Remove event listeners
      if (monitor.dstContract && monitor.dstHandler) {
        monitor.dstContract.off('Withdrawn', monitor.dstHandler);
      }
      
      // Clear funding check interval
      if (monitor.fundingCheckInterval) {
        clearInterval(monitor.fundingCheckInterval);
      }
      
      // Remove from active monitors
      this.activeMonitors.delete(orderId);
      
      console.log(`🗑️ Removed order ${orderId} from monitoring`);
    }
  }

  /**
   * Complete the atomic swap after secret is revealed
   */
  async completeAtomicSwap(orderId, srcEscrow, revealedSecret, chainId) {
    try {
      // Check if we're already processing this order
      const monitor = this.activeMonitors.get(orderId);
      if (monitor && monitor.isCompletingSwap) {
        console.log(`⏳ Atomic swap already in progress for order ${orderId}`);
        return;
      }
      
      // Mark as processing
      if (monitor) {
        monitor.isCompletingSwap = true;
      }
      
      console.log(`🔄 Completing atomic swap for order ${orderId}`);
      console.log(`📍 Source escrow: ${srcEscrow}`);
      console.log(`🔑 Using revealed secret: ${revealedSecret}`);
      
      const chainConfig = getChainConfig(chainId);
      const provider = this.providers.get(chainId);
      
      // Create resolver wallet for this chain
      const resolverWallet = new ethers.Wallet(this.resolverPrivateKey, provider);
      
      // Connect to Resolver contract
      const resolverContract = new ethers.Contract(
        chainConfig.contracts.resolver,
        [
          "function completeAtomicSwap(address srcEscrow, bytes32 secret) external"
        ],
        resolverWallet
      );
      
      // Call completeAtomicSwap on the Resolver contract
      console.log(`🚀 Calling completeAtomicSwap on Resolver contract...`);
      
      let completeTx;
      let txHash;
      try {
        completeTx = await resolverContract.completeAtomicSwap(srcEscrow, revealedSecret);
        console.log(`📝 Atomic swap completion transaction: ${completeTx.hash}`);
        txHash = completeTx.hash;
        const completeReceipt = await completeTx.wait();
        console.log(`✅ Atomic swap completed successfully! Hash: ${completeReceipt.hash}`);
      } catch (error) {
        // Check if it's an "already known" error - transaction was already submitted
        if (error.code === 'UNKNOWN_ERROR' && error.error?.message === 'already known') {
          console.log(`⏳ Atomic swap transaction already submitted, checking status...`);
          // Wait a bit for the transaction to be mined
          await new Promise(resolve => setTimeout(resolve, 5000));
          console.log(`✅ Atomic swap should be completed or in progress`);
          // We don't have the tx hash in this case, but the swap is processing
          txHash = 'pending';
        } else {
          throw error;
        }
      }
      
      // Update order status in database
      await supabaseManager.updateOrder(orderId, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        completion_tx_hash: txHash
      });
      
      console.log(`✅ Atomic swap for order ${orderId} completed successfully!`);
      
    } catch (error) {
      console.error(`❌ Error completing atomic swap for order ${orderId}:`, error);
      
      // Update order status to show error
      await supabaseManager.updateOrder(orderId, {
        status: 'error',
        error_message: error.message,
        updated_at: new Date().toISOString()
      });
      
      throw error;
    }
  }

  /**
   * Monitoring loop to check for stale monitors and cleanup
   */
  async monitorLoop() {
    while (this.isRunning) {
      try {
        // Check for stale monitors (older than 24 hours)
        const now = Date.now();
        const staleThreshold = 24 * 60 * 60 * 1000; // 24 hours
        
        for (const [orderId, monitor] of this.activeMonitors) {
          if (now - monitor.startedAt > staleThreshold) {
            console.log(`🧹 Removing stale monitor for order ${orderId}`);
            this.removeOrderFromMonitor(orderId);
          }
        }
        
        // Log monitoring status every 5 minutes
        if (this.activeMonitors.size > 0) {
          console.log(`👁️ Secret Monitor: actively monitoring ${this.activeMonitors.size} orders`);
        }
        
      } catch (error) {
        console.error('❌ Error in secret monitor loop:', error);
      }
      
      // Wait 5 minutes before next check
      await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
    }
  }

  /**
   * Get monitoring status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      activeMonitors: this.activeMonitors.size,
      monitoredOrders: Array.from(this.activeMonitors.keys())
    };
  }
}

module.exports = SecretMonitor;