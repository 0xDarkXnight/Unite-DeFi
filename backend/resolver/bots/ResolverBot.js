/**
 * Resolver Bot - Monitors Dutch auctions and executes profitable swaps
 * Clean, simplified version with proper sanity checks
 */

const { ethers } = require('ethers');
const { supabaseManager } = require('../../database/supabase');
const { getChainConfig } = require('../../config/chains');
const { NATIVE_ETH_SENTINEL, ZERO_ADDRESS, GAS_CONFIG, SIGNATURE_CONFIG } = require('../../config/constants');
const SecretMonitor = require('../services/SecretMonitor');

// SimpleResolver contract ABI - minimal required functions
const RESOLVER_ABI = [
  "function executeOrder(tuple(uint256,address,address,address,address,address,uint256,uint256,uint256,bytes) order, bytes signature, uint256 makingAmount, uint256 takingAmount) external",
  "function deployEscrows(bytes32 orderId, address srcToken, address dstToken, uint256 srcAmount, uint256 dstAmount, bytes32 secretHash, uint256 timelock, address user) external returns (address srcEscrow, address dstEscrow)",
  "function executeOrderWithEscrows(tuple(uint256 salt, address makerAsset, address takerAsset, address maker, address receiver, address allowedSender, uint256 makingAmount, uint256 takingAmount, uint256 offsets, bytes interactions) order, bytes signature, uint256 makingAmount, uint256 takingAmount, address srcEscrow, address dstEscrow) external",
  "function config() external view returns (uint256 minProfitBasisPoints, uint256 maxGasPrice, bool enabled)",
  "function owner() external view returns (address)",
  "event OrderExecuted(bytes32 indexed orderHash, address indexed maker, uint256 makingAmount, uint256 takingAmount, uint256 profit)",
  "event EscrowDeployed(bytes32 indexed orderId, address indexed srcEscrow, address indexed dstEscrow)"
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
    this.secretMonitor = null;
    
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
      if (!chainConfig.contracts || !chainConfig.contracts.resolver) {
        throw new Error(`Resolver contract address not found for chain ${chainId}`);
      }
      
      const resolverAddress = chainConfig.contracts.resolver;
      console.log(`📝 Using resolver contract at ${resolverAddress} for chain ${chainId}`);
      
      const resolverContract = new ethers.Contract(
        resolverAddress,
        RESOLVER_ABI,
        wallet
      );
      this.resolverContracts.set(chainId, resolverContract);
      
      // Verify resolver contract is accessible
      try {
        // Try to call a view function to verify the contract is accessible
        resolverContract.config().then(config => {
          const isEnabled = config.enabled;
          console.log(`✅ Resolver contract status: ${isEnabled ? 'enabled' : 'disabled'}`);
        }).catch(error => {
          console.warn(`⚠️ Could not verify resolver contract status: ${error.message}`);
        });
      } catch (error) {
        console.warn(`⚠️ Could not verify resolver contract status: ${error.message}`);
      }
      
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
    
    // Initialize and start Secret Monitor
    this.secretMonitor = new SecretMonitor();
    await this.secretMonitor.initialize();
    await this.secretMonitor.start();
    
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
    
    // Stop Secret Monitor
    if (this.secretMonitor) {
      await this.secretMonitor.stop();
    }
    
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
      console.log(`🔄 Calculating Dutch auction price for order ${orderId}...`);
      const currentPrice = this.calculateCurrentAuctionPrice(order);
      console.log(`💰 Current Dutch auction price for ${orderId}: ${ethers.formatEther(currentPrice)} ETH`);
      
      // Determine if the price is favorable for execution
      const originalTakingAmount = BigInt(order.order.takingAmount);
      const currentTakingAmount = BigInt(currentPrice);
      
      if (currentTakingAmount > originalTakingAmount) {
        console.log(`⚠️ Current price (${currentTakingAmount}) is higher than original price (${originalTakingAmount}). Waiting for better price.`);
        return;
      }
      
      const savingsPercentage = ((originalTakingAmount - currentTakingAmount) * 10000n) / originalTakingAmount;
      console.log(`💰 Dutch auction savings: ${savingsPercentage / 100n}.${savingsPercentage % 100n}%`);
      
      // Check liquidity
      const hasLiquidity = await this.checkLiquidity(order, currentPrice);
      if (!hasLiquidity) {
        console.log(`💧 Insufficient liquidity for order ${orderId}`);
        return;
      }
      
      // NEW FLOW: Deploy escrows first, then process the order
      console.log(`🏗️ Deploying escrows for order ${orderId}...`);
      const escrowDeployment = await this.deployEscrowsForOrder(order, currentPrice, chainId);
      
      if (escrowDeployment && escrowDeployment.success) {
        console.log(`✅ Escrows deployed successfully for order ${orderId}`);
        console.log(`📍 Source escrow: ${escrowDeployment.srcEscrow}`);
        console.log(`📍 Destination escrow: ${escrowDeployment.dstEscrow}`);
        
        // Fund the destination escrow with resolver's tokens
        console.log(`💰 Funding destination escrow...`);
        const fundingResult = await this.fundDestinationEscrow(
          escrowDeployment.dstEscrow, 
          order, 
          currentPrice, 
          chainId
        );
        
        if (fundingResult && fundingResult.success) {
          console.log(`✅ Destination escrow funded successfully`);
          
          // Transfer user funds from temporary storage to source escrow
          console.log(`🔄 Transferring user funds to source escrow...`);
          const transferResult = await this.transferUserFundsToSourceEscrow(
            order, 
            escrowDeployment.srcEscrow, 
            chainId
          );
          
          if (transferResult && transferResult.success) {
            console.log(`✅ User funds transferred to source escrow`);
            console.log(`✅ Both escrows are now funded - atomic swap ready!`);
            
            // Update order status in database
            await this.markOrderAsEscrowsDeployed(orderId, escrowDeployment);
            
            // Start monitoring the escrows for automatic secret sharing
            console.log(`👁️ Starting escrow monitoring for order ${orderId}...`);
            await this.secretMonitor.addOrderToMonitor({
              orderId,
              srcEscrow: escrowDeployment.srcEscrow,
              dstEscrow: escrowDeployment.dstEscrow,
              secretHash: await this.getSecretHashForOrder(orderId),
              chainId
            });
          }
        }
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
      console.log(`⏳ Auction hasn't started yet. Current time: ${now}, Start time: ${startTime}`);
      console.log(`⏳ Time until start: ${startTime - now} seconds`);
      return startPrice;
    }
    
    // If auction has ended, return end price
    if (now >= endTime) {
      console.log(`⌛ Auction has ended. Current time: ${now}, End time: ${endTime}`);
      console.log(`⌛ Time since end: ${now - endTime} seconds`);
      return endPrice;
    }
    
    // Calculate linear interpolation
    const timeElapsed = now - startTime;
    const totalDuration = endTime - startTime;
    const priceRange = BigInt(startPrice) - BigInt(endPrice);
    const priceDecrease = (priceRange * BigInt(Math.floor(timeElapsed * 1000))) / BigInt(Math.floor(totalDuration * 1000));
    const currentPrice = (BigInt(startPrice) - priceDecrease).toString();
    
    // Calculate percentage of auction completed
    const percentComplete = (timeElapsed / totalDuration) * 100;
    console.log(`📉 Dutch auction in progress: ${percentComplete.toFixed(2)}% complete`);
    console.log(`📉 Time elapsed: ${timeElapsed.toFixed(0)} seconds out of ${totalDuration.toFixed(0)} seconds`);
    console.log(`📉 Price range: ${startPrice} → ${endPrice}`);
    console.log(`📉 Current price: ${currentPrice} (${ethers.formatEther(currentPrice)} ETH)`);
    
    return currentPrice;
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
      
      // Check if order is invalidated (cancelled)
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
      
      // Check if order is already filled
      try {
        const filledAmount = await limitOrderContract.filledAmount(orderHash);
        console.log(`📊 Order ${order.orderId} filled amount: ${filledAmount.toString()}`);
        
        // For cross-chain orders, we only process if the order is completely unfilled
        if (filledAmount > 0n) {
          console.log(`❌ Order ${order.orderId} is already partially or fully filled`);
          return false;
        }
      } catch (filledError) {
        console.error(`❌ Error checking filled amount:`, filledError);
        // If we can't check filled amount, proceed with caution
      }
      
      // Check token allowances
      try {
        // Check if maker has approved the LOP contract to spend their tokens
        const makerAssetContract = new ethers.Contract(
          orderData[1], // makerAsset
          ["function allowance(address,address) external view returns (uint256)"],
          this.providers.get(chainId)
        );
        
        // CRITICAL FIX: Check allowance for TemporaryFundStorage instead of LimitOrderProtocol
        // because TemporaryFundStorage.depositFunds() calls safeTransferFrom(user, this, amount)
        const makerAllowance = await makerAssetContract.allowance(
          orderData[3], // maker
          chainConfig.contracts.temporaryStorage
        );
        
        console.log(`📊 Maker allowance: ${makerAllowance.toString()}`);
        
        if (makerAllowance < BigInt(orderData[6])) {
          console.log(`❌ Order ${order.orderId} maker has insufficient allowance`);
          console.log(`   Required: ${orderData[6]}, Available: ${makerAllowance}`);
          return false;
        }
        
        // Check if resolver has approved the LOP contract to spend their tokens
        const takerAssetContract = new ethers.Contract(
          orderData[2], // takerAsset
          ["function allowance(address,address) external view returns (uint256)"],
          this.providers.get(chainId)
        );
        
        const resolverAllowance = await takerAssetContract.allowance(
          this.wallet.address,
          chainConfig.contracts.limitOrderProtocol
        );
        
        console.log(`📊 Resolver allowance: ${resolverAllowance.toString()}`);
        
        if (resolverAllowance < BigInt(orderData[7])) {
          console.log(`❌ Order ${order.orderId} resolver has insufficient allowance`);
          console.log(`   Required: ${orderData[7]}, Available: ${resolverAllowance}`);
          
          // Approve tokens if needed
          await this.approveTokens(
            orderData[2], // takerAsset
            chainConfig.contracts.limitOrderProtocol,
            orderData[7], // takingAmount
            chainId
          );
        }
      } catch (allowanceError) {
        console.error(`❌ Error checking allowances:`, allowanceError);
        // If we can't check allowances, proceed with caution
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
   * Approve tokens for spending
   */
  async approveTokens(tokenAddress, spender, amount, chainId) {
    try {
      console.log(`🔐 Checking approval for ${amount} of token ${tokenAddress} for spender ${spender}`);
      
      const tokenContract = new ethers.Contract(
        tokenAddress,
        [
          "function approve(address spender, uint256 amount) external returns (bool)",
          "function allowance(address owner, address spender) external view returns (uint256)",
          "function balanceOf(address owner) external view returns (uint256)"
        ],
        this.wallet
      );
      
      // Convert amount to BigInt
      const requiredAmount = BigInt(amount);
      
      // Check current balance
      const balance = await tokenContract.balanceOf(this.wallet.address);
      console.log(`📊 Current token balance: ${balance.toString()}`);
      
      if (balance < requiredAmount) {
        throw new Error(`Insufficient token balance. Required: ${requiredAmount}, Have: ${balance}`);
      }
      
      // Check current allowance
      const currentAllowance = await tokenContract.allowance(this.wallet.address, spender);
      console.log(`📊 Current allowance: ${currentAllowance.toString()}`);
      
      // Only approve if current allowance is insufficient
      if (currentAllowance < requiredAmount) {
        console.log(`📊 Current allowance ${currentAllowance} is less than required ${requiredAmount}`);
        
        // Use the maximum possible value (type(uint256).max) for approval
        const MAX_UINT256 = "115792089237316195423570985008687907853269984665640564039457584007913129639935"; // 2^256 - 1
        console.log(`🔐 Setting approval to maximum value`);
        
        const tx = await tokenContract.approve(spender, MAX_UINT256);
        console.log(`📝 Approval transaction submitted: ${tx.hash}`);
        
        const receipt = await tx.wait();
        console.log(`✅ Approval confirmed in block ${receipt.blockNumber}`);
        
        // Verify new allowance
        const newAllowance = await tokenContract.allowance(this.wallet.address, spender);
        console.log(`📊 New allowance: ${newAllowance.toString()}`);
        
        // Verify the allowance is sufficient
        if (newAllowance < requiredAmount) {
          throw new Error(`Failed to set sufficient allowance. Required: ${requiredAmount}, Got: ${newAllowance}`);
        }
      } else {
        console.log(`✅ Current allowance ${currentAllowance} is sufficient`);
      }
      
      return true;
    } catch (error) {
      console.error(`❌ Error approving tokens:`, error);
      throw error; // Propagate error up instead of returning false
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
   * Fill order using the Resolver contract with cross-chain escrows
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
      
      // Get the Resolver contract
      const resolverContract = this.resolverContracts.get(chainId);
      if (!resolverContract) {
        throw new Error(`Resolver contract not found for chain ${chainId}`);
      }
      
      // Get the Limit Order Protocol contract for hash calculation
      const limitOrderContract = new ethers.Contract(
        chainConfig.contracts.limitOrderProtocol,
        LOP_ABI,
        this.providers.get(chainId)
      );
      
      console.log('✅ Using Resolver contract with cross-chain escrows');
      
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
        
      // Calculate order hash - need to use EIP-712 hash like the contract does
      let orderHash;
      try {
        // Get the inner order hash first
        const innerOrderHash = await limitOrderContract.hashOrder(orderData);
        console.log(`📊 Inner order hash: ${innerOrderHash}`);
        
        // Now create the EIP-712 typed data hash like the contract does
        // This matches the contract's _hashTypedDataV4(hashOrder(order)) pattern
        const domain = {
          name: '1inch Limit Order Protocol',
          version: '4',
          chainId,
          verifyingContract: chainConfig.contracts.limitOrderProtocol
        };
        
        // Create the EIP-712 hash manually
        const domainSeparator = ethers.TypedDataEncoder.hashDomain(domain);
        orderHash = ethers.keccak256(
          ethers.concat([
            ethers.toUtf8Bytes('\x19\x01'),
            domainSeparator,
            innerOrderHash
          ])
        );
        
        console.log(`📊 EIP-712 order hash: ${orderHash}`);
        
        // Verify signature against the calculated EIP-712 hash
        console.log(`🔍 Verifying signature against hash: ${orderHash}`);
        try {
          // Use ethers.recoverAddress with the EIP-712 hash
          // This is the correct way to verify EIP-712 signatures
          const signerAddress = ethers.recoverAddress(orderHash, signatureBytes);
          console.log(`✅ Signature verification result: ${signerAddress}`);
          
          // Compare signer address with maker address
          if (signerAddress.toLowerCase() !== orderData[3].toLowerCase()) {
            console.warn(`⚠️ WARNING: Signature was signed by ${signerAddress}, but maker is ${orderData[3]}`);
            console.warn(`⚠️ This order will likely fail with 'Invalid signature' error`);
          }
        } catch (verifyError) {
          console.warn(`⚠️ WARNING: Could not verify signature: ${verifyError.message}`);
          console.warn(`⚠️ This order will likely fail with 'Invalid signature' error`);
        }
      } catch (hashError) {
        console.error(`❌ Error getting order hash:`, hashError);
        throw new Error(`Failed to get order hash: ${hashError.message}`);
      }
      
      // For cross-chain orders, we need to use the full order amount
      // No partial fills - we're going to complete the transaction in one go
      const makingAmount = orderData[6];
      const takingAmount = orderData[7];
      
      console.log(`📄 Order data for contract:`, {
        salt: orderData[0].toString(),
        makerAsset: orderData[1],
        takerAsset: orderData[2],
        maker: orderData[3],
        receiver: orderData[4],
        allowedSender: orderData[5],
        makingAmount: makingAmount.toString(),
        takingAmount: takingAmount.toString(),
        offsets: orderData[8].toString(),
        interactions: orderData[9]
      });
      
      // Make sure we have sufficient token allowances
      console.log(`🔄 Checking token approvals...`);
      
      try {
        // Check both approvals in sequence
        await this.approveTokens(
          orderData[2], // takerAsset
          chainConfig.contracts.resolver,
          takingAmount.toString(),
          chainId
        );
        
        await this.approveTokens(
          orderData[2], // takerAsset
          chainConfig.contracts.limitOrderProtocol,
          takingAmount.toString(),
          chainId
        );
      } catch (approvalError) {
        console.error(`❌ Error during token approval:`, approvalError.message);
        throw new Error(`Failed to approve tokens: ${approvalError.message}`);
      }
      
      // STEP 1: Fill the order through the Resolver contract
      console.log(`🚀 Step 1: Executing order through Resolver`);
      
      // Double-check allowances before proceeding
      console.log(`🔍 Verifying token allowances before execution...`);
      
      // Check if resolver is enabled
      try {
        const resolverConfig = await resolverContract.config();
        console.log(`📊 Resolver config:`, {
          minProfitBasisPoints: resolverConfig.minProfitBasisPoints.toString(),
          maxGasPrice: resolverConfig.maxGasPrice.toString(),
          enabled: resolverConfig.enabled
        });
        
        if (!resolverConfig.enabled) {
          console.log(`⚠️ Resolver is disabled! Will fall back to direct LOP call.`);
        }
      } catch (configError) {
        console.error(`❌ Error checking resolver config:`, configError.message);
      }
      
      // Check all relevant allowances and balances
      const takerAssetContract = new ethers.Contract(
        orderData[2], // takerAsset
        ["function allowance(address,address) external view returns (uint256)", "function balanceOf(address) external view returns (uint256)"],
        this.providers.get(chainId)
      );
      
      const makerAssetContract = new ethers.Contract(
        orderData[1], // makerAsset
        ["function allowance(address,address) external view returns (uint256)", "function balanceOf(address) external view returns (uint256)"],
        this.providers.get(chainId)
      );
      
      // CRITICAL FIX: Check if the maker has approved the TemporaryFundStorage
      // because the new flow deposits to TemporaryFundStorage, not LimitOrderProtocol
      const makerLOPAllowance = await makerAssetContract.allowance(
        orderData[3], // maker
        chainConfig.contracts.temporaryStorage
      );
      
      // Check if the bot has approved the LimitOrderProtocol directly
      const botLOPAllowance = await takerAssetContract.allowance(
        this.wallet.address,
        chainConfig.contracts.limitOrderProtocol
      );
      
      // Check if the bot has approved the Resolver
      const botResolverAllowance = await takerAssetContract.allowance(
        this.wallet.address, 
        chainConfig.contracts.resolver
      );
      
      const botBalance = await takerAssetContract.balanceOf(this.wallet.address);
      const makerBalance = await makerAssetContract.balanceOf(orderData[3]);
      
      console.log(`📊 Bot balance of taker asset: ${botBalance.toString()}`);
      console.log(`📊 Maker balance of maker asset: ${makerBalance.toString()}`);
      console.log(`📊 Maker allowance to LOP: ${makerLOPAllowance.toString()}`);
      console.log(`📊 Bot allowance to LOP: ${botLOPAllowance.toString()}`);
      console.log(`📊 Bot allowance to Resolver: ${botResolverAllowance.toString()}`);
      console.log(`📊 Required taking amount: ${takingAmount.toString()}`);
      console.log(`📊 Required making amount: ${makingAmount.toString()}`);
      
      // Check if maker has sufficient allowance for TemporaryFundStorage
      if (makerLOPAllowance < BigInt(makingAmount)) {
        console.log(`⚠️ Maker has insufficient allowance for TemporaryFundStorage: ${makerLOPAllowance} < ${makingAmount}`);
        console.log(`⚠️ This order will likely fail because the maker hasn't approved TemporaryFundStorage.`);
        console.log(`⚠️ Maker needs to approve TemporaryFundStorage (${chainConfig.contracts.temporaryStorage}) to spend tokens.`);
        console.log(`⚠️ Attempting to continue anyway, but transaction will likely fail.`);
        // We'll continue and let the transaction fail naturally instead of throwing an error
        // This allows testing with smaller amounts that might work
      }
      
      // Check if we already have sufficient allowances
      if (botResolverAllowance >= BigInt(takingAmount) && botLOPAllowance >= BigInt(takingAmount)) {
        console.log(`✅ Existing allowances are sufficient, skipping approval`);
      } else {
        console.log(`🔄 Setting up token approvals with maximum values...`);
        
        // Only approve if current allowance is insufficient
        if (botResolverAllowance < BigInt(takingAmount)) {
          await this.approveTokens(
            orderData[2],
            chainConfig.contracts.resolver,
            takingAmount,
            chainId
          );
        }
        
        if (botLOPAllowance < BigInt(takingAmount)) {
          await this.approveTokens(
            orderData[2],
            chainConfig.contracts.limitOrderProtocol,
            takingAmount,
            chainId
          );
        }
      }
      
      // Double-check allowances after re-approval
      const updatedResolverAllowance = await takerAssetContract.allowance(
        this.wallet.address, 
        chainConfig.contracts.resolver
      );
      
      const updatedLOPAllowance = await takerAssetContract.allowance(
        this.wallet.address,
        chainConfig.contracts.limitOrderProtocol
      );
      
      console.log(`📊 Updated Resolver allowance: ${updatedResolverAllowance.toString()}`);
      console.log(`📊 Updated LOP allowance: ${updatedLOPAllowance.toString()}`);
      
      if (updatedResolverAllowance < BigInt(takingAmount) || updatedLOPAllowance < BigInt(takingAmount)) {
        throw new Error(`Failed to set sufficient allowances after multiple attempts`);
      }
      
      let tx;
      
              // NEW PROPER FLOW: Use Resolver contract with integrated escrow management
        console.log(`🔧 Using Resolver contract for proper escrow-based atomic swap flow`);
        
        // Use the existing Resolver contract but connect it to the wallet for execution
        const escrowResolverContract = resolverContract.connect(this.wallet);
      
      // STEP 1: Deploy escrows first
      console.log(`🚀 Step 1: Deploying escrows via Resolver contract`);
      
      // Generate secret and secret hash for atomic swap
      const secret = ethers.randomBytes(32);
      const secretHash = ethers.keccak256(secret);
      const timelock = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      
      console.log(`🔑 Generated secret: ${ethers.hexlify(secret)}`);
      console.log(`🔑 Secret hash: ${secretHash}`);
      
      // Deploy escrow contracts via Resolver
      const orderId = ethers.randomBytes(32);
      console.log(`📝 Deploying escrows for order ID: ${ethers.hexlify(orderId)}`);
      
      const deployTx = await escrowResolverContract.deployEscrows(
        orderId,
        orderData[1], // srcToken (makerAsset)
        orderData[2], // dstToken (takerAsset)  
        makingAmount, // srcAmount
        takingAmount, // dstAmount
        secretHash,
        timelock,
        orderData[3] // user
      );
      
      console.log(`📝 Escrow deployment transaction: ${deployTx.hash}`);
      const deployReceipt = await deployTx.wait();
      console.log(`✅ Escrows deployed! Hash: ${deployReceipt.hash}`);
      
      // Parse EscrowDeployed event
      const eventSignature = ethers.id("EscrowDeployed(bytes32,address,address)");
      const escrowDeployedEvent = deployReceipt.logs.find(log => 
        log.topics[0] === eventSignature
      );
      
      if (!escrowDeployedEvent) {
        throw new Error('EscrowDeployed event not found in transaction logs');
      }
      
      // Parse the event manually
      const srcEscrow = ethers.getAddress('0x' + escrowDeployedEvent.topics[2].slice(26));
      const dstEscrow = ethers.getAddress('0x' + escrowDeployedEvent.topics[3].slice(26));
      
      console.log(`📝 Source escrow: ${srcEscrow}`);
      console.log(`📝 Destination escrow: ${dstEscrow}`);
      
      // STEP 2: Execute order with escrows
      console.log(`🚀 Step 2: Executing order with escrows via Resolver contract`);
      
      try {
        const executeTx = await escrowResolverContract.executeOrderWithEscrows(
          {
            salt: orderData[0],
            makerAsset: orderData[1],
            takerAsset: orderData[2],
            maker: orderData[3],
            receiver: orderData[4],
            allowedSender: orderData[5],
            makingAmount: orderData[6],
            takingAmount: orderData[7],
            offsets: orderData[8],
            interactions: orderData[9]
          },
          signatureBytes,
          makingAmount,
          takingAmount,
          srcEscrow,
          dstEscrow
        );
        
        console.log(`📝 Order execution transaction: ${executeTx.hash}`);
        const executeReceipt = await executeTx.wait();
        console.log(`✅ Order executed with escrows! Hash: ${executeReceipt.hash}`);
        
        tx = executeReceipt;
        
        // STEP 3: Store secret and notify user
        console.log(`🚀 Step 3: Order executed and escrows set up - Now user must deposit and reveal secret`);
        console.log(`🔑 Secret (for user): ${ethers.hexlify(secret)}`);
        console.log(`📍 Source escrow (user must deposit WETH): ${srcEscrow}`);
        console.log(`📍 Destination escrow (user gets USDC): ${dstEscrow}`);
        console.log(`💡 User flow:`);
        console.log(`   1. User calls deposit() on source escrow ${srcEscrow} to deposit ${ethers.formatEther(makingAmount)} WETH`);
        console.log(`   2. User calls withdraw("${ethers.hexlify(secret)}") on destination escrow to get USDC`);
        console.log(`   3. Resolver automatically completes swap using revealed secret`);
        
        // Store the secret for the user to access via API
        await this.storeSecretForUser(order.orderId, ethers.hexlify(secret), {
          srcEscrow,
          dstEscrow,
          secretHash: secretHash,
          makingAmount: makingAmount.toString(),
          takingAmount: takingAmount.toString()
        });
        
        // Add order to secret monitoring
        if (this.secretMonitor) {
          await this.secretMonitor.addOrderToMonitor({
            orderId: order.orderId,
            srcEscrow,
            dstEscrow,
            secretHash: secretHash,
            chainId: chainId
          });
        }
        
        return {
          success: true,
          transactionHash: executeReceipt.hash,
          gasUsed: executeReceipt.gasUsed.toString(),
          srcEscrow,
          dstEscrow,
          status: 'awaiting_user_deposit',
          message: 'Escrows deployed and resolver funded destination escrow. User must deposit to source escrow.'
        };
      } catch (escrowError) {
        console.error(`❌ Error in escrow-based order execution:`, escrowError);
        throw new Error(`Escrow-based order execution failed: ${escrowError.message}`);
      }
      
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
    const temporaryStorage = chainConfig.contracts.temporaryStorage;
    
    const wethContract = new ethers.Contract(wethAddress, WETH_ABI, this.providers.get(chainId));
    
    // CRITICAL FIX: Check maker's allowance for TemporaryFundStorage, not LimitOrderProtocol
    const makerAllowance = await wethContract.allowance(order.order.maker, temporaryStorage);
    console.log(`🔍 Maker WETH allowance for TemporaryFundStorage: ${ethers.formatEther(makerAllowance)} WETH`);
    
    if (makerAllowance < ethers.parseEther('0.1')) {
      throw new Error('Insufficient WETH allowance for maker to TemporaryFundStorage');
    }
    
    // Check resolver's allowance for LimitOrderProtocol (resolver still uses LOP for taker tokens)
    const resolverAllowance = await wethContract.allowance(this.wallet.address, chainConfig.contracts.limitOrderProtocol);
    console.log(`🔍 Resolver WETH allowance for LimitOrderProtocol: ${ethers.formatEther(resolverAllowance)} WETH`);
    
    if (resolverAllowance < ethers.parseEther('0.1')) {
      throw new Error('Insufficient WETH allowance for resolver to LimitOrderProtocol');
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

  /**
   * Store secret for user to complete atomic swap
   */
  async storeSecretForUser(orderId, secret, escrowData) {
    try {
      // Update order status
      await supabaseManager.updateOrder(orderId, {
        status: 'awaiting_user_action'
      });
      
      // Store secret in secrets table
      const order = await supabaseManager.getOrder(orderId);
      await supabaseManager.createSecret({
        orderId: orderId,
        userAddress: order.order.maker,
        encryptedSecret: secret, // In production, encrypt this
        hashlock: escrowData.secretHash,
        status: 'pending'
      });
      
      console.log(`📁 Secret stored for order ${orderId} - user can access via API`);
      
      // TODO: In production, also notify user via webhook or push notification
      // await this.notifyUser(orderId, escrowData);
      
    } catch (error) {
      console.error(`❌ Error storing secret for user:`, error);
      throw error;
    }
  }
  /**
   * Deploy escrows for an order (new flow)
   * @param {object} order - Order data
   * @param {bigint} currentPrice - Current auction price
   * @param {number} chainId - Chain ID
   * @returns {object} Deployment result with escrow addresses
   */
  async deployEscrowsForOrder(order, currentPrice, chainId) {
    try {
      const chainConfig = getChainConfig(chainId);
      const provider = this.providers.get(chainId);
      const wallet = new ethers.Wallet(this.config.privateKey, provider);

      // Connect to resolver contract
      const resolverContract = new ethers.Contract(
        chainConfig.contracts.resolver,
        [
          "function deployEscrows(bytes32 orderId, address srcToken, address dstToken, uint256 srcAmount, uint256 dstAmount, bytes32 secretHash, uint256 timelock, address user) external returns (address srcEscrow, address dstEscrow)"
        ],
        wallet
      );

      // Use the order hash from the database (already calculated correctly)
      const orderHash = order.orderHash;

      // Get secret hash from database
      const secretData = await supabaseManager.getSecret(order.orderId);
      if (!secretData || !secretData.hashlock) {
        throw new Error(`No secret found for order ${order.orderId}`);
      }

      // Set timelock to 24 hours from now
      const timelock = Math.floor(Date.now() / 1000) + (24 * 60 * 60);

      console.log(`🔧 Deploying escrows with parameters:`);
      console.log(`   Order ID: ${orderHash}`);
      console.log(`   Source token: ${order.order.makerAsset}`);
      console.log(`   Destination token: ${order.order.takerAsset}`);
      console.log(`   Source amount: ${order.order.makingAmount}`);
      console.log(`   Destination amount: ${currentPrice.toString()}`);
      console.log(`   Secret hash: ${secretData.hashlock}`);
      console.log(`   Timelock: ${timelock}`);
      console.log(`   User: ${order.order.maker}`);

      // Deploy escrows
      const deployTx = await resolverContract.deployEscrows(
        orderHash,
        order.order.makerAsset,
        order.order.takerAsset,
        order.order.makingAmount,
        currentPrice.toString(),
        secretData.hashlock,
        timelock,
        order.order.maker
      );

      console.log(`📝 Escrow deployment transaction: ${deployTx.hash}`);
      const deployReceipt = await deployTx.wait();
      
      // Parse the deployment event to get escrow addresses
      console.log(`🔍 Parsing ${deployReceipt.logs.length} logs from deployment transaction...`);
      
      const escrowDeployedEvent = deployReceipt.logs.find((log, index) => {
        console.log(`📋 Log ${index}: Address: ${log.address}, Topics[0]: ${log.topics[0]}`);
        
        // Check if this is from our resolver contract and has the EscrowDeployed event signature
        if (log.address.toLowerCase() === chainConfig.contracts.resolver.toLowerCase() && 
            log.topics[0] === '0xa1245e1edc7ca4a2c5379f2483084e765c47dfd642751551d236a7776e33eb6e') {
          console.log(`✅ Found EscrowDeployed event at log index ${index}`);
          console.log(`   Topics:`, log.topics);
          return true;
        }
        
        // Also try parsing with interface as backup
        try {
          const parsed = resolverContract.interface.parseLog(log);
          if (parsed && parsed.name === 'EscrowDeployed') {
            console.log(`✅ Found EscrowDeployed event via interface at log index ${index}`);
            console.log(`   Args:`, parsed.args);
            return true;
          }
          return false;
        } catch (e) {
          console.log(`📋 Log ${index}: Could not parse (${e.message})`);
          return false;
        }
      });

      if (!escrowDeployedEvent) {
        console.error(`❌ EscrowDeployed event not found in ${deployReceipt.logs.length} logs`);
        console.log(`📝 All logs:`, deployReceipt.logs.map((log, i) => ({
          index: i,
          address: log.address,
          topics: log.topics,
          data: log.data
        })));
        throw new Error('EscrowDeployed event not found in transaction receipt');
      }

      // Extract escrow addresses from the event
      let srcEscrow, dstEscrow;
      
      try {
        // Try to parse with interface first
        const parsedEvent = resolverContract.interface.parseLog(escrowDeployedEvent);
        srcEscrow = parsedEvent.args[1];
        dstEscrow = parsedEvent.args[2];
      } catch (e) {
        // If interface parsing fails, extract from topics directly
        // topics[0] = event signature
        // topics[1] = orderId (indexed)  
        // topics[2] = srcEscrow (indexed)
        // topics[3] = dstEscrow (indexed)
        srcEscrow = ethers.getAddress('0x' + escrowDeployedEvent.topics[2].slice(26));
        dstEscrow = ethers.getAddress('0x' + escrowDeployedEvent.topics[3].slice(26));
      }

      console.log(`✅ Escrows deployed successfully!`);
      console.log(`   Source escrow: ${srcEscrow}`);
      console.log(`   Destination escrow: ${dstEscrow}`);

      return {
        success: true,
        srcEscrow,
        dstEscrow,
        txHash: deployReceipt.hash,
        orderHash
      };

    } catch (error) {
      console.error(`❌ Error deploying escrows for order ${order.orderId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Fund the destination escrow with resolver's tokens
   * @param {string} dstEscrow - Destination escrow address
   * @param {object} order - Order data
   * @param {bigint} amount - Amount to fund
   * @param {number} chainId - Chain ID
   */
  async fundDestinationEscrow(dstEscrow, order, amount, chainId) {
    try {
      const chainConfig = getChainConfig(chainId);
      const provider = this.providers.get(chainId);
      const wallet = new ethers.Wallet(this.config.privateKey, provider);

      // Connect to resolver contract (not escrow directly)
      const resolverContract = new ethers.Contract(
        chainConfig.contracts.resolver,
        [
          "function fundDestinationEscrow(address dstEscrow, address token, uint256 amount) external",
          "function approveToken(address token, address spender, uint256 amount) external"
        ],
        wallet
      );

      // First approve resolver to spend our tokens
      const tokenContract = new ethers.Contract(
        order.order.takerAsset,
        [
          "function approve(address spender, uint256 amount) external returns (bool)",
          "function balanceOf(address account) external view returns (uint256)"
        ],
        wallet
      );

      console.log(`💰 Approving resolver to spend ${amount.toString()} tokens...`);
      const approveTx = await tokenContract.approve(chainConfig.contracts.resolver, amount.toString());
      await approveTx.wait();

      console.log(`💰 Calling resolver to fund destination escrow...`);
      const fundTx = await resolverContract.fundDestinationEscrow(
        dstEscrow,
        order.order.takerAsset,
        amount.toString()
      );
      const fundReceipt = await fundTx.wait();

      console.log(`✅ Destination escrow funded successfully! Hash: ${fundReceipt.hash}`);
      
      return {
        success: true,
        txHash: fundReceipt.hash
      };

    } catch (error) {
      console.error(`❌ Error funding destination escrow:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Transfer user funds from temporary storage to source escrow
   * @param {object} order - Order data
   * @param {string} srcEscrow - Source escrow address
   * @param {number} chainId - Chain ID
   */
  async transferUserFundsToSourceEscrow(order, srcEscrow, chainId) {
    try {
      const chainConfig = getChainConfig(chainId);
      const provider = this.providers.get(chainId);
      const wallet = new ethers.Wallet(this.config.privateKey, provider);

      // Use the order hash from the database (already calculated correctly)
      const orderHash = order.orderHash;

      // First check if funds are available in temporary storage
      const tempStorageContract = new ethers.Contract(
        chainConfig.contracts.temporaryStorage,
        [
          "function hasFunds(bytes32 orderId) external view returns (bool)"
        ],
        wallet
      );

      const hasFunds = await tempStorageContract.hasFunds(orderHash);
      if (!hasFunds) {
        throw new Error(`No funds available in temporary storage for order ${order.orderId}`);
      }

      // CRITICAL FIX: Call SimpleResolver to withdraw funds (it's authorized)
      // instead of calling TemporaryFundStorage directly (ResolverBot is not authorized)
      const resolverContract = new ethers.Contract(
        chainConfig.contracts.resolver,
        [
          "function withdrawFromTemporaryStorage(address temporaryStorage, bytes32 orderHash, address destination) external"
        ],
        wallet
      );

      console.log(`🔄 Transferring user funds via SimpleResolver from temporary storage to source escrow...`);
      const transferTx = await resolverContract.withdrawFromTemporaryStorage(
        chainConfig.contracts.temporaryStorage,
        orderHash,
        srcEscrow
      );
      const transferReceipt = await transferTx.wait();

      console.log(`✅ User funds transferred successfully to source escrow! Hash: ${transferReceipt.hash}`);

      return {
        success: true,
        txHash: transferReceipt.hash
      };

    } catch (error) {
      console.error(`❌ Error transferring user funds to source escrow:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Mark an order as having escrows deployed
   * @param {string} orderId - Order ID
   * @param {object} escrowDeployment - Escrow deployment data
   */
  async markOrderAsEscrowsDeployed(orderId, escrowDeployment) {
    try {
      // Update order status
      await supabaseManager.updateOrder(orderId, {
        status: 'escrows_deployed',
        updated_at: new Date().toISOString()
      });

      // Create escrow records
      await supabaseManager.createEscrow({
        orderId,
        type: 'src',
        address: escrowDeployment.srcEscrow,
        chainId: 11155111, // TODO: get from order
        status: 'deployed',
        transactionHash: escrowDeployment.txHash
      });

      await supabaseManager.createEscrow({
        orderId,
        type: 'dst',
        address: escrowDeployment.dstEscrow,
        chainId: 11155111, // TODO: get from order
        status: 'deployed',
        transactionHash: escrowDeployment.txHash
      });

      console.log(`✅ Order ${orderId} marked as having escrows deployed`);
    } catch (error) {
      console.error(`❌ Error marking order ${orderId} as escrows deployed:`, error);
    }
  }

  /**
   * Get the secret hash for an order
   * @param {string} orderId - Order ID
   * @returns {string} Secret hash
   */
  async getSecretHashForOrder(orderId) {
    try {
      const secretData = await supabaseManager.getSecret(orderId);
      if (!secretData || !secretData.hashlock) {
        throw new Error(`No secret found for order ${orderId}`);
      }
      return secretData.hashlock;
    } catch (error) {
      console.error(`❌ Error getting secret hash for order ${orderId}:`, error);
      throw error;
    }
  }
}

module.exports = ResolverBot;