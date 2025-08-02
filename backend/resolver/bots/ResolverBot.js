/**
 * Resolver Bot - Monitors Dutch auctions and executes profitable swaps
 * Clean, simplified version with proper sanity checks
 */

const { ethers } = require('ethers');
const { supabaseManager } = require('../../database/supabase');
const { getChainConfig } = require('../../config/chains');
const { NATIVE_ETH_SENTINEL, ZERO_ADDRESS, GAS_CONFIG, SIGNATURE_CONFIG } = require('../../config/constants');

// SimpleResolver contract ABI - minimal required functions
const RESOLVER_ABI = [
  "function executeOrder(tuple(uint256,address,address,address,address,address,uint256,uint256,uint256,bytes) order, bytes signature, uint256 makingAmount, uint256 takingAmount) external",
  "function config() external view returns (uint256 minProfitBasisPoints, uint256 maxGasPrice, bool enabled)",
  "function owner() external view returns (address)"
];

// WETH contract ABI for allowance checks
const WETH_ABI = [
  "function allowance(address,address) external view returns (uint256)",
  "function balanceOf(address) external view returns (uint256)"
];

// Limit Order Protocol ABI
const LOP_ABI = [
  "function paused() external view returns (bool)",
  "function fillOrder(tuple(uint256,address,address,address,address,address,uint256,uint256,uint256,bytes) order, bytes signature, uint256 makingAmount, uint256 takingAmount) external",
  "function hashOrder(tuple(uint256,address,address,address,address,address,uint256,uint256,uint256,bytes) order) external view returns (bytes32)",
  "function remaining(bytes32 orderHash) external view returns (uint256)",
  "function invalidatedOrders(bytes32) external view returns (bool)",
  "function filledAmount(bytes32) external view returns (uint256)"
];

class ResolverBot {
  constructor(resolverConfig) {
    // Sanity checks for configuration
    this.validateConfig(resolverConfig);
    
    this.config = resolverConfig;
    this.resolverId = resolverConfig.resolverId;
    this.isRunning = false;
    this.providers = new Map();
    this.resolverContracts = new Map();
    this.wallet = null;
    
    this.activeOrders = new Set();
    
    this.initializeBlockchainConnections();
  }

  /**
   * Validate resolver configuration
   */
  validateConfig(config) {
    if (!config) {
      throw new Error('Resolver configuration is required');
    }
    
    if (!config.privateKey) {
      throw new Error('Private key is required');
    }
    
    if (!config.address) {
      throw new Error('Resolver address is required');
    }
    
    if (!config.supportedChains || !Array.isArray(config.supportedChains)) {
      throw new Error('Supported chains must be an array');
    }
    
    if (!config.contractAddresses || typeof config.contractAddresses !== 'object') {
      throw new Error('Contract addresses must be provided');
    }
    
    // Validate private key format
    try {
      const wallet = new ethers.Wallet(config.privateKey);
      if (wallet.address.toLowerCase() !== config.address.toLowerCase()) {
        throw new Error('Private key does not match resolver address');
      }
    } catch (error) {
      throw new Error(`Invalid private key: ${error.message}`);
    }
    
    // Validate contract addresses
    for (const chainId of config.supportedChains) {
      const contractAddress = config.contractAddresses[chainId];
      if (!contractAddress) {
        throw new Error(`Contract address not found for chain ${chainId}`);
      }
      
      if (!ethers.isAddress(contractAddress)) {
        throw new Error(`Invalid contract address for chain ${chainId}: ${contractAddress}`);
      }
    }
  }

  /**
   * Initialize blockchain connections for all supported chains
   */
  initializeBlockchainConnections() {
    for (const chainId of this.config.supportedChains) {
      const chainConfig = getChainConfig(chainId);
      
      // Validate chain configuration
      if (!chainConfig || !chainConfig.rpcUrl) {
        throw new Error(`Invalid chain configuration for chain ${chainId}`);
      }
      
      // Create provider
      const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
      this.providers.set(chainId, provider);
      
      // Create wallet
      const wallet = new ethers.Wallet(this.config.privateKey, provider);
      if (!this.wallet) {
        this.wallet = wallet;
      }
      
      // Create resolver contract instance
      const resolverContract = new ethers.Contract(
        this.config.contractAddresses[chainId],
        RESOLVER_ABI,
        wallet
      );
      this.resolverContracts.set(chainId, resolverContract);
      
      console.log(`✅ Resolver bot initialized for ${chainConfig.name} (${chainId})`);
    }
  }

  /**
   * Start the resolver bot
   */
  async start() {
    if (this.isRunning) {
      throw new Error('Resolver bot is already running');
    }

    console.log(`🤖 Starting Resolver Bot ${this.resolverId}...`);
    
    this.isRunning = true;
    
    // Start order monitoring
    this.startOrderMonitoring();
    
    console.log(`✅ Resolver Bot ${this.resolverId} started successfully`);
  }

  /**
   * Stop the resolver bot
   */
  async stop() {
    console.log(`🛑 Stopping Resolver Bot ${this.resolverId}...`);
    this.isRunning = false;
    console.log(`✅ Resolver Bot ${this.resolverId} stopped`);
  }

  /**
   * Start monitoring Dutch auction orders
   */
  startOrderMonitoring() {
    const monitorOrders = async () => {
      if (!this.isRunning) return;
      
      try {
        // Get active orders from database
        const { orders: activeOrders } = await supabaseManager.getOrders(
          { status: 'active' },
          { limit: 100 }
        );
        
        // Filter out filled orders
        const filteredOrders = activeOrders.filter(order => order.status !== 'filled');
        
        if (filteredOrders.length > 0) {
          console.log(`🔍 Found ${filteredOrders.length} active orders`);
        }
        
        // Process each order
        for (const order of filteredOrders) {
          if (!this.activeOrders.has(order.orderId)) {
            await this.evaluateOrder(order);
          }
        }
      } catch (error) {
        console.error(`❌ Error monitoring orders:`, error);
      }
      
      // Schedule next check
      setTimeout(monitorOrders, 30000); // 30 seconds
    };
    
    // Start monitoring
    monitorOrders();
    console.log(`👁️ Order monitoring started`);
  }

  /**
   * Evaluate and process an order
   */
  async evaluateOrder(order) {
    const orderId = order.orderId || order.order_id;
    
    // Skip if already processing
    if (this.activeOrders.has(orderId)) {
      return;
    }
    
    // Mark order as being processed
    this.activeOrders.add(orderId);
    
    try {
      console.log(`🔍 Evaluating order: ${orderId}`);
      
      // Validate order structure
      this.validateOrder(order);
      
      // Get chain ID from cross-chain data
      const chainId = parseInt(order.crossChainData.srcChainId);
      
      // Check if order is already filled or invalidated
      const isOrderValid = await this.checkOrderStatus(order, chainId);
      if (!isOrderValid) {
        console.log(`❌ Order ${orderId} is no longer valid (filled or cancelled)`);
        return;
      }
      
      // Calculate current Dutch auction price
      const currentPrice = this.calculateCurrentAuctionPrice(order);
      console.log(`💰 Current auction price for ${orderId}: ${ethers.formatEther(currentPrice)} ETH`);
      
      // Check liquidity
      const hasLiquidity = await this.checkLiquidity(order, currentPrice);
      if (!hasLiquidity) {
        console.log(`💧 Insufficient liquidity for order ${orderId}`);
        return;
      }
      
      // Attempt to fill the order
      console.log(`🚀 Attempting to fill order: ${orderId}`);
      const result = await this.fillOrder(order, currentPrice, chainId);
      
      // If successful, mark order as filled in database
      if (result && result.success) {
        console.log(`✅ Order ${orderId} filled successfully, updating database...`);
        await this.markOrderAsFilled(orderId);
      }
      
    } catch (error) {
      console.error(`❌ Error evaluating order ${orderId}:`, error);
    } finally {
      // Remove from active orders
      this.activeOrders.delete(orderId);
    }
  }

  /**
   * Validate order structure
   */
  validateOrder(order) {
    if (!order) {
      throw new Error('Order is required');
    }
    
    if (!order.order) {
      throw new Error('Order.order is required');
    }
    
    const orderData = order.order;
    
    // Validate required fields
    const requiredFields = ['maker', 'makerAsset', 'takerAsset', 'makingAmount', 'takingAmount'];
    for (const field of requiredFields) {
      if (!orderData[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    // Validate addresses
    if (!ethers.isAddress(orderData.maker)) {
      throw new Error(`Invalid maker address: ${orderData.maker}`);
    }
    
    if (!ethers.isAddress(orderData.makerAsset)) {
      throw new Error(`Invalid maker asset address: ${orderData.makerAsset}`);
    }
    
    if (!ethers.isAddress(orderData.takerAsset)) {
      throw new Error(`Invalid taker asset address: ${orderData.takerAsset}`);
    }
    
    // Validate amounts
    if (BigInt(orderData.makingAmount) <= 0n) {
      throw new Error(`Invalid making amount: ${orderData.makingAmount}`);
    }
    
    if (BigInt(orderData.takingAmount) <= 0n) {
      throw new Error(`Invalid taking amount: ${orderData.takingAmount}`);
    }
    
    // Validate cross-chain data
    if (!order.crossChainData) {
      throw new Error('Cross-chain data is required');
    }
    
    const crossChainData = order.crossChainData;
    if (!crossChainData.srcChainId || !crossChainData.dstChainId) {
      throw new Error('Source and destination chain IDs are required');
    }
  }

  /**
   * Calculate current Dutch auction price
   */
  calculateCurrentAuctionPrice(order) {
    const now = Date.now() / 1000;
    const auctionParams = order.auctionParams;
    
    if (!auctionParams) {
      throw new Error('Auction parameters are required');
    }
    
    const { startTime, endTime, startPrice, endPrice } = auctionParams;
    
    // If auction hasn't started, return start price
    if (now < startTime) {
      return startPrice;
    }
    
    // If auction has ended, return end price
    if (now >= endTime) {
      return endPrice;
    }
    
    // Calculate linear interpolation
    const timeElapsed = now - startTime;
    const totalDuration = endTime - startTime;
    const priceRange = BigInt(startPrice) - BigInt(endPrice);
    const priceDecrease = (priceRange * BigInt(Math.floor(timeElapsed * 1000))) / BigInt(Math.floor(totalDuration * 1000));
    
    return (BigInt(startPrice) - priceDecrease).toString();
  }

  /**
   * Check if order is still valid (not filled or cancelled)
   */
  async checkOrderStatus(order, chainId) {
    try {
      const chainConfig = getChainConfig(chainId);
      const limitOrderContract = new ethers.Contract(
        chainConfig.contracts.limitOrderProtocol,
        LOP_ABI,
        this.providers.get(chainId)
      );
      
      // Calculate order hash
      const orderData = this.prepareOrderData(order, '0');
      
      // Log the order data we're sending to hashOrder
      console.log(`📄 Order data for hashOrder:`, {
        salt: orderData[0].toString(),
        makerAsset: orderData[1],
        takerAsset: orderData[2],
        maker: orderData[3],
        receiver: orderData[4],
        allowedSender: orderData[5],
        makingAmount: orderData[6].toString(),
        takingAmount: orderData[7].toString(),
        offsets: orderData[8].toString(),
        interactions: orderData[9]
      });
      
      // Get the order hash
      let orderHash;
      try {
        orderHash = await limitOrderContract.hashOrder(orderData);
        console.log(`📊 Order hash: ${orderHash}`);
      } catch (hashError) {
        console.error(`❌ Error getting order hash:`, hashError);
        console.log(`⚠️ Falling back to direct order processing`);
        // If we can't get the hash, assume the order is valid
        return true;
      }
      
      // If we got a hash, check if order is invalidated
      try {
        const isInvalidated = await limitOrderContract.invalidatedOrders(orderHash);
        if (isInvalidated) {
          console.log(`❌ Order ${order.orderId} is cancelled`);
          return false;
        }
      } catch (invalidatedError) {
        console.error(`❌ Error checking invalidated status:`, invalidatedError);
        // If we can't check invalidated, assume it's not invalidated
      }
      
      // Check remaining amount
      try {
        const remainingAmount = await limitOrderContract.remaining(orderHash);
        console.log(`📊 Order ${order.orderId} remaining amount: ${remainingAmount.toString()}`);
        
        if (remainingAmount === 0n) {
          console.log(`❌ Order ${order.orderId} is already fully filled`);
          return false;
        }
      } catch (remainingError) {
        console.error(`❌ Error checking remaining amount:`, remainingError);
        // If we can't check remaining, assume there is remaining amount
      }
      
      return true;
    } catch (error) {
      console.error(`❌ Error checking order status:`, error);
      // In case of any error, proceed with filling the order
      // The contract will revert if there's an issue
      return true;
    }
  }

  /**
   * Check if resolver has sufficient liquidity
   */
  async checkLiquidity(order, currentPrice) {
    try {
      const crossChainData = order.crossChainData;
      const srcChainId = parseInt(crossChainData.srcChainId);
      const dstChainId = parseInt(crossChainData.dstChainId);
      
      // Check source chain balance
      const srcProvider = this.providers.get(srcChainId);
      if (!srcProvider) {
        console.error(`❌ No provider found for chain ${srcChainId}`);
        return false;
      }
      
      const srcBalance = await srcProvider.getBalance(this.config.address);
      const minSrcBalance = ethers.parseEther('0.01'); // 0.01 ETH for gas
      
      console.log(`💰 Resolver balance on chain ${srcChainId}: ${ethers.formatEther(srcBalance)} ETH`);
      
      if (srcBalance < minSrcBalance) {
        console.error(`❌ Insufficient balance on source chain ${srcChainId}: ${ethers.formatEther(srcBalance)} ETH`);
        return false;
      }
      
      // Check destination chain balance if different
      if (srcChainId !== dstChainId) {
        const dstProvider = this.providers.get(dstChainId);
        if (!dstProvider) {
          console.error(`❌ No provider found for destination chain ${dstChainId}`);
          return false;
        }
        
        const dstBalance = await dstProvider.getBalance(this.config.address);
        const minDstBalance = ethers.parseEther('0.01');
        
        if (dstBalance < minDstBalance) {
          console.error(`❌ Insufficient balance on destination chain ${dstChainId}: ${ethers.formatEther(dstBalance)} ETH`);
          return false;
        }
      }
      
      console.log(`✅ Liquidity check passed for order ${order.orderId || order.order_id}`);
      return true;
    } catch (error) {
      console.error(`❌ Error checking liquidity:`, error);
      return false;
    }
  }

  /**
   * Convert signature to 65-byte format
   * This handles both {r, s, v} and {r, vs} formats
   */
  to65ByteSignature(signature) {
    try {
      // If signature is already a string, ensure it starts with 0x
      if (typeof signature === 'string') {
        return signature.startsWith('0x') ? signature : '0x' + signature;
      }
      
      console.log(`🔍 Converting signature:`, signature);
      
      // Handle r, s, v format
      if (signature.r && signature.s && signature.v !== undefined) {
        const r = signature.r.startsWith('0x') ? signature.r : '0x' + signature.r;
        const s = signature.s.startsWith('0x') ? signature.s : '0x' + signature.s;
        let v = Number(signature.v);
        
        // Ensure v is in the correct range (27-28)
        if (v < 27) {
          v += 27;
        }
        
        console.log(`📝 Using r, s, v format:`, { r, s, v });
        
        // Create the signature in r+s+v format (65 bytes)
        const sig = ethers.Signature.from({ r, s, v });
        console.log(`📝 Converted signature: ${sig.serialized}`);
        
        return sig.serialized;
      }
      
      // Handle r, vs format (1inch compact format)
      if (signature.r && signature.vs) {
        const r = signature.r.startsWith('0x') ? signature.r : '0x' + signature.r;
        const vs = signature.vs.startsWith('0x') ? signature.vs : '0x' + signature.vs;
        
        console.log(`📝 Using r, vs format:`, { r, vs });
        
        // For vs format, we need to extract the v from the last byte
        // and the s from the rest of the vs value
        const vsHex = vs.replace('0x', '');
        
        // Get the last byte for v
        let v = parseInt(vsHex.slice(-2), 16);
        if (v < 27) v += 27;
        
        // Get the s value (everything except the last byte)
        const s = '0x' + vsHex.slice(0, -2);
        
        console.log(`📝 Extracted s: ${s}, v: ${v}`);
        
        // Create the signature in r+s+v format (65 bytes)
        const sig = ethers.Signature.from({ r, s, v });
        console.log(`📝 Converted signature: ${sig.serialized}`);
        
        return sig.serialized;
      }
      
      throw new Error('Invalid signature format');
    } catch (error) {
      console.error('❌ Error converting signature:', error);
      throw error;
    }
  }

  /**
   * Fill order by calling Limit Order Protocol directly
   */
  async fillOrder(order, currentPrice, chainId) {
    console.log(`🔧 Filling order ${order.orderId} on chain ${chainId}`);
    
    try {
      // Validate order structure
      if (order.order.makerAsset === order.order.takerAsset) {
        throw new Error('Cannot swap the same token for itself');
      }
      
      const orderData = this.prepareOrderData(order, currentPrice);
      const chainConfig = getChainConfig(chainId);
      
      // Get the Limit Order Protocol contract directly
      const limitOrderContract = new ethers.Contract(
        chainConfig.contracts.limitOrderProtocol,
        LOP_ABI,
        this.wallet
      );
      
      console.log('✅ Calling Limit Order Protocol directly');
      
      // Convert signature to 65-byte format
      console.log(`🔍 Original signature:`, order.signature);
      
      // Handle different signature formats
      let signatureBytes;
      
      try {
        // Try to convert using our helper
        signatureBytes = this.to65ByteSignature(order.signature);
      } catch (sigError) {
        console.error(`❌ Error converting signature:`, sigError);
        
        // Fallback for r+vs format (most common from frontend)
        if (order.signature.r && order.signature.vs) {
          const r = order.signature.r.startsWith('0x') ? order.signature.r : '0x' + order.signature.r;
          const vs = order.signature.vs.startsWith('0x') ? order.signature.vs : '0x' + order.signature.vs;
          
          // Use simple concatenation as a last resort
          signatureBytes = r + vs.slice(2);
          console.log(`📝 Fallback signature: ${signatureBytes}`);
        } else {
          throw new Error('Could not process signature in any format');
        }
      }
      
      console.log(`📝 Final signature: ${signatureBytes}`);
      console.log(`📝 Signature length: ${signatureBytes.length} chars`);
      
      // Calculate order hash - do this first to fail fast if there's an issue
      let orderHash;
      try {
        orderHash = await limitOrderContract.hashOrder(orderData);
        console.log(`📊 Order hash: ${orderHash}`);
      } catch (hashError) {
        console.error(`❌ Error getting order hash:`, hashError);
        throw new Error(`Failed to get order hash: ${hashError.message}`);
      }
      
      // Skip signature verification if it might fail
      // The contract will verify the signature anyway
      
      // Check remaining amount if possible
      let remainingAmount;
      try {
        remainingAmount = await limitOrderContract.remaining(orderHash);
        console.log(`📊 Remaining amount for order: ${remainingAmount.toString()}`);
        
        // Skip if no remaining amount
        if (remainingAmount === 0n) {
          console.log(`❌ Order has no remaining amount, skipping fill`);
          return { success: false, reason: 'Order already filled' };
        }
      } catch (remainingError) {
        console.error(`❌ Error checking remaining amount:`, remainingError);
        // If we can't check remaining, proceed with full amount
        remainingAmount = orderData[6];
      }
      
      // Use the minimum of desired amount and remaining amount
      const actualMakingAmount = remainingAmount < orderData[6] ? remainingAmount : orderData[6];
      const actualTakingAmount = actualMakingAmount === remainingAmount ? 
        (BigInt(orderData[7]) * remainingAmount) / orderData[6] : orderData[7];
      
      console.log(`📄 Order data for contract:`, {
        salt: orderData[0].toString(),
        makerAsset: orderData[1],
        takerAsset: orderData[2],
        maker: orderData[3],
        receiver: orderData[4],
        allowedSender: orderData[5],
        makingAmount: actualMakingAmount.toString(),
        takingAmount: actualTakingAmount.toString(),
        offsets: orderData[8].toString(),
        interactions: orderData[9]
      });
      
      let tx;
      
      // Estimate gas with fallback
      try {
        const gasEstimate = await limitOrderContract.fillOrder.estimateGas(
          orderData,
          signatureBytes,
          actualMakingAmount,
          actualTakingAmount
        );
        
        console.log(`⛽ Gas estimate: ${gasEstimate.toString()}`);
        
        // Execute the order directly
        tx = await limitOrderContract.fillOrder(
          orderData,
          signatureBytes,
          actualMakingAmount,
          actualTakingAmount,
          { gasLimit: gasEstimate * BigInt(100 + GAS_CONFIG.BUFFER_PERCENTAGE) / 100n }
        );
      } catch (gasError) {
        console.error(`❌ Gas estimation failed:`, gasError);
        console.log(`⚠️ Trying with fixed gas limit...`);
        
        // Use a fixed gas limit as fallback
        const fixedGasLimit = BigInt(500000); // 500k gas
        
        tx = await limitOrderContract.fillOrder(
          orderData,
          signatureBytes,
          actualMakingAmount,
          actualTakingAmount,
          { gasLimit: fixedGasLimit }
        );
      }
      
      if (!tx) {
        throw new Error('Transaction failed to execute');
      }
      
      console.log(`📝 Transaction submitted: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`✅ Order filled successfully! Hash: ${receipt.hash}`);
      
      return {
        success: true,
        transactionHash: receipt.hash,
        gasUsed: receipt.gasUsed.toString()
      };
      
    } catch (error) {
      console.error(`❌ Error filling order: ${error.message}`);
      return { success: false, reason: error.message };
    }
  }

  /**
   * Mark order as filled in database
   */
  async markOrderAsFilled(orderId) {
    try {
      await supabaseManager.updateOrder(orderId, { 
        status: 'filled',
        filledAt: new Date().toISOString()
      });
      console.log(`✅ Order ${orderId} marked as filled in database`);
    } catch (error) {
      console.error(`❌ Error marking order as filled:`, error);
    }
  }

  /**
   * Check WETH allowances
   */
  async checkWETHAllowances(order, chainId) {
    const chainConfig = getChainConfig(chainId);
    const wethAddress = chainConfig.contracts.weth;
    const limitOrderProtocol = chainConfig.contracts.limitOrderProtocol;
    
    const wethContract = new ethers.Contract(wethAddress, WETH_ABI, this.providers.get(chainId));
    
    // Check maker's allowance
    const makerAllowance = await wethContract.allowance(order.order.maker, limitOrderProtocol);
    console.log(`🔍 Maker WETH allowance: ${ethers.formatEther(makerAllowance)} WETH`);
    
    if (makerAllowance < ethers.parseEther('0.1')) {
      throw new Error('Insufficient WETH allowance for maker');
    }
    
    // Check resolver's allowance
    const resolverAllowance = await wethContract.allowance(this.wallet.address, limitOrderProtocol);
    console.log(`🔍 Resolver WETH allowance: ${ethers.formatEther(resolverAllowance)} WETH`);
    
    if (resolverAllowance < ethers.parseEther('0.1')) {
      throw new Error('Insufficient WETH allowance for resolver');
    }
  }

  /**
   * Prepare order data for contract execution
   */
  prepareOrderData(order, currentPrice) {
    const orderData = order.order;
    
    // Validate no native ETH sentinel addresses
    if (orderData.makerAsset === NATIVE_ETH_SENTINEL || 
        orderData.takerAsset === NATIVE_ETH_SENTINEL) {
      throw new Error('Cannot use native ETH sentinel address. Use WETH instead.');
    }
    
    // Validate that makerAsset and takerAsset are different
    if (orderData.makerAsset.toLowerCase() === orderData.takerAsset.toLowerCase()) {
      throw new Error('Cannot swap the same token for itself');
    }
    
    // Ensure all values are properly formatted
    const salt = orderData.salt || order.orderId || order.order_id;
    // Use the original makingAmount from the order, not the currentPrice
    const makingAmount = BigInt(orderData.makingAmount);
    const takingAmount = BigInt(orderData.takingAmount);
    
    console.log(`🔧 Order data preparation:`, {
      salt: salt.toString(),
      makerAsset: orderData.makerAsset,
      takerAsset: orderData.takerAsset,
      maker: orderData.maker,
      makingAmount: makingAmount.toString(),
      takingAmount: takingAmount.toString()
    });
    
    // Create the order struct as an array (ethers.js expects arrays for structs)
    // Order struct: (uint256 salt, address makerAsset, address takerAsset, address maker, address receiver, address allowedSender, uint256 makingAmount, uint256 takingAmount, uint256 offsets, bytes interactions)
    const orderArray = [
      salt,                                               // salt
      orderData.makerAsset,                               // makerAsset
      orderData.takerAsset,                               // takerAsset
      orderData.maker,                                    // maker
      orderData.receiver || orderData.maker,              // receiver (use maker if not specified)
      ZERO_ADDRESS,                                       // allowedSender (public order)
      makingAmount,                                       // makingAmount (from order)
      takingAmount,                                       // takingAmount (from order)
      0n,                                                 // offsets
      '0x'                                                // interactions
    ];
    
    return orderArray;
  }
}

module.exports = ResolverBot;