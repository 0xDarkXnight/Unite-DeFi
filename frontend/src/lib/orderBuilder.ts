/**
 * 1inch Limit Order Protocol order builder
 * Builds orders compatible with the backend API
 */

import { ethers } from 'ethers';
import { CreateOrderRequest } from './api';

export interface SwapParams {
  fromToken: string;
  toToken: string; 
  fromChain: number;
  toChain: number;
  fromAmount: string;
  toAmount: string;
  maker: string;
  orderType: 'market' | 'limit';
  limitPrice?: string;
  slippage: string;
  auctionDuration?: number; // in seconds, default 300 (5 minutes)
}

export interface TokenInfo {
  address: string;
  symbol: string;
  decimals: number;
}

// Token mappings for different chains
const TOKEN_ADDRESSES: Record<number, Record<string, string>> = {
  1: { // Ethereum
    'ETH': '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    'WETH': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    'USDC': '0xA0b86a33E6441e1c4aceBE4d7c8E5Ce0f7E0Be8C',
    'USDT': '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  },
  11155111: { // Sepolia Testnet
    'ETH': '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
    'WETH': '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', // Sepolia WETH
    'USDC': '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // Sepolia USDC
    'USDT': '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06', // Sepolia USDT
  }
};

export class OrderBuilder {
  
  static getTokenAddress(chainId: number, symbol: string): string {
    const chainTokens = TOKEN_ADDRESSES[chainId];
    if (!chainTokens || !chainTokens[symbol]) {
      throw new Error(`Token ${symbol} not supported on chain ${chainId}`);
    }
    return chainTokens[symbol];
  }

  /**
   * Parse token amount with correct decimals
   */
  static parseTokenAmount(amount: string, tokenSymbol: string): bigint {
    const tokenDecimals: Record<string, number> = {
      'WETH': 18,
      'ETH': 18,
      'USDC': 6,
      'USDT': 6
    };
    
    const decimals = tokenDecimals[tokenSymbol];
    if (decimals === undefined) {
      throw new Error(`Unknown token decimals for ${tokenSymbol}`);
    }
    
    try {
      // Make sure we have a clean string with the right number of decimals
      const amountStr = amount.toString();
      
      // If the amount has more decimals than the token supports, truncate it
      if (amountStr.includes('.')) {
        const [whole, fraction] = amountStr.split('.');
        const truncatedFraction = fraction.slice(0, decimals);
        const cleanAmount = `${whole}.${truncatedFraction}`;
        return ethers.parseUnits(cleanAmount, decimals);
      }
      
      return ethers.parseUnits(amountStr, decimals);
    } catch (error) {
      console.error(`Error parsing token amount: ${amount} ${tokenSymbol}`, error);
      throw new Error(`Failed to parse token amount: ${error.message}`);
    }
  }

  /**
   * Get token symbol from address and chain
   */
  static getTokenSymbol(tokenAddress: string, chainId: number): string {
    const chainTokens = TOKEN_ADDRESSES[chainId];
    if (!chainTokens) {
      throw new Error(`Chain ${chainId} not supported`);
    }
    
    for (const [symbol, address] of Object.entries(chainTokens)) {
      if (address.toLowerCase() === tokenAddress.toLowerCase()) {
        return symbol;
      }
    }
    
    throw new Error(`Token address ${tokenAddress} not found on chain ${chainId}`);
  }

  static async buildDutchAuctionOrder(
    params: SwapParams,
    signer: ethers.Signer
  ): Promise<CreateOrderRequest> {
    const {
      fromToken,
      toToken,
      fromChain,
      toChain,
      fromAmount,
      toAmount,
      maker,
      orderType,
      slippage,
      auctionDuration = 300 // 5 minutes default
    } = params;

    // Get token addresses
    const makerAsset = this.getTokenAddress(fromChain, fromToken);
    const takerAsset = this.getTokenAddress(fromChain, toToken); // Use actual destination token
    const dstToken = this.getTokenAddress(toChain, toToken);

    // Ensure token approvals before creating order
    await this.ensureTokenApprovals(makerAsset, fromAmount, signer, fromChain);

    // Validate amounts before parsing
    if (!fromAmount || !toAmount || isNaN(parseFloat(fromAmount)) || isNaN(parseFloat(toAmount))) {
      throw new Error(`Invalid amounts: fromAmount=${fromAmount}, toAmount=${toAmount}`);
    }

    // Convert amounts to proper decimals
    console.log(`Converting amounts to proper decimals:`);
    console.log(`  From: ${fromAmount} ${fromToken}`);
    console.log(`  To: ${toAmount} ${toToken}`);
    
    const makingAmount = this.parseTokenAmount(fromAmount, fromToken).toString();
    const baseTakingAmount = this.parseTokenAmount(toAmount, toToken).toString();
    
    console.log(`  makingAmount: ${makingAmount}`);
    console.log(`  baseTakingAmount: ${baseTakingAmount}`);

    // Calculate auction prices with slippage
    const slippagePercent = parseFloat(slippage) / 100;
    
    // Use the already parsed baseTakingAmount for consistency
    const startPrice = baseTakingAmount; // Start at expected price
    
    // Calculate end price with slippage
    // For safety, we'll create a clean string with the right number of decimals
    const slippageAmount = parseFloat(toAmount) * (1 + slippagePercent);
    const slippageAmountClean = slippageAmount.toString();
    const endPrice = this.parseTokenAmount(slippageAmountClean, toToken).toString();
    
    console.log(`  startPrice: ${startPrice}`);
    console.log(`  endPrice: ${endPrice}`);

    // Auction timing
    const now = Math.floor(Date.now() / 1000);
    const startTime = now + 60; // Start in 1 minute
    const endTime = startTime + auctionDuration;

    // Generate salt as BigInt
    const salt = ethers.hexlify(ethers.randomBytes(32));
    const saltBigInt = BigInt(salt).toString();
    
    // Build maker traits (simplified)
    const makerTraits = '0x0000000000000000000000000000000000000000000000000000000000000000'; // Basic traits

    // Build the order - must match contract struct
    const order = {
      salt: saltBigInt,
      maker: maker.toLowerCase(),
      makerAsset,
      takerAsset,
      makingAmount: makingAmount, // Explicitly set makingAmount
      takingAmount: baseTakingAmount, // Explicitly set takingAmount
      receiver: maker.toLowerCase(), // Receiver is the maker
      allowedSender: '0x0000000000000000000000000000000000000000', // Public order
      offsets: '0', // No offsets
      interactions: '0x' // No interactions
    };

    // Sign the order
    const signature = await this.signOrder(order, signer);
    
    // Generate secret for cross-chain atomic swap  
    const secretBytes = ethers.randomBytes(32);
    const secret = ethers.hexlify(secretBytes);

    return {
      order,
      signature,
      auctionParams: {
        startTime,
        endTime,
        startPrice,
        endPrice
      },
      crossChainData: {
        srcChainId: fromChain,
        dstChainId: toChain,
        dstToken,
        dstAmount: toAmount
      },
      secret
    };
  }

  private static async signOrder(
    order: {
      salt: string;
      maker: string;
      makerAsset: string;
      takerAsset: string;
      makingAmount: string;
      takingAmount: string;
      receiver: string;
      allowedSender: string;
      offsets: string;
      interactions: string;
    },
    signer: ethers.Signer
  ): Promise<{ r: string; s: string; v: number }> {
    // Get network info from provider
    if (!signer.provider) {
      throw new Error('Signer must have a provider');
    }
    
    const network = await signer.provider.getNetwork();
    const chainId = Number(network.chainId);
    
    // EIP-712 domain for our deployed Limit Order Protocol
    const domain = {
      name: '1inch Limit Order Protocol',
      version: '4',
      chainId,
              verifyingContract: '0x95508c5e6e02db99F17cd4c348EC6A791C189026' // Our deployed contract
    };

    // Order type definition - must match the contract struct exactly
    const types = {
      Order: [
        { name: 'salt', type: 'uint256' },
        { name: 'makerAsset', type: 'address' },
        { name: 'takerAsset', type: 'address' },
        { name: 'maker', type: 'address' },
        { name: 'receiver', type: 'address' },
        { name: 'allowedSender', type: 'address' },
        { name: 'makingAmount', type: 'uint256' },
        { name: 'takingAmount', type: 'uint256' },
        { name: 'offsets', type: 'uint256' },
        { name: 'interactions', type: 'bytes' }
      ]
    };

    // Ensure all values are properly formatted - must match contract struct order
    const orderToSign = {
      salt: order.salt,
      makerAsset: order.makerAsset,
      takerAsset: order.takerAsset,
      maker: order.maker,
      receiver: order.receiver,
      allowedSender: '0x0000000000000000000000000000000000000000', // Public order
      makingAmount: order.makingAmount,
      takingAmount: order.takingAmount,
      offsets: '0', // No offsets
      interactions: '0x' // No interactions
    };

    try {
      // Sign with EIP-712
      // Log the data being signed
      console.log('Signing order with data:', {
        domain,
        types,
        orderToSign
      });
      
      const signature = await signer.signTypedData(domain, types, orderToSign);
      
      // Split signature into r and vs format (compact signature)
      const sig = ethers.Signature.from(signature);
      
      // Create a standard 65-byte Ethereum signature
      console.log('Signature components:', { 
        r: sig.r, 
        s: sig.s, 
        v: sig.v,
        serialized: sig.serialized
      });
      
      // Return the full serialized signature (65 bytes)
      return {
        r: sig.r,
        s: sig.s,
        v: sig.v
      };
    } catch (error) {
      console.error('Error signing order:', error);
      throw new Error('Failed to sign order');
    }
  }

  // Utility to estimate output amount (simplified)
  static estimateOutput(
    inputAmount: string,
    exchangeRate: number,
    slippage: string
  ): string {
    const input = parseFloat(inputAmount);
    const slippagePercent = parseFloat(slippage) / 100;
    const output = input * exchangeRate * (1 - slippagePercent);
    return output.toFixed(6);
  }

  // Get supported tokens for a chain
  static getSupportedTokens(chainId: number): string[] {
    return Object.keys(TOKEN_ADDRESSES[chainId] || {});
  }

  // Validate swap parameters
  static validateSwapParams(params: SwapParams): string[] {
    const errors: string[] = [];

    if (!params.fromToken || !params.toToken) {
      errors.push('From and to tokens are required');
    }

    if (!params.fromAmount || parseFloat(params.fromAmount) <= 0) {
      errors.push('Valid from amount is required');
    }

    if (!params.maker || !ethers.isAddress(params.maker)) {
      errors.push('Valid maker address is required');
    }

    if (!this.getSupportedTokens(params.fromChain).includes(params.fromToken)) {
      errors.push(`Token ${params.fromToken} not supported on source chain`);
    }

    if (!this.getSupportedTokens(params.toChain).includes(params.toToken)) {
      errors.push(`Token ${params.toToken} not supported on destination chain`);
    }

    return errors;
  }

  /**
   * Ensure token approvals for the Limit Order Protocol
   */
  static async ensureTokenApprovals(
    tokenAddress: string,
    amount: string,
    signer: ethers.Signer,
    chainId: number
  ): Promise<void> {
    const LIMIT_ORDER_PROTOCOL = this.getLimitOrderProtocolAddress(chainId);
    
    // ERC20 ABI for approvals
    const ERC20_ABI = [
      "function approve(address spender, uint256 amount) external returns (bool)",
      "function allowance(address owner, address spender) external view returns (uint256)"
    ];
    
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
    const signerAddress = await signer.getAddress();
    
    try {
      // Check current allowance
      const currentAllowance = await tokenContract.allowance(signerAddress, LIMIT_ORDER_PROTOCOL);
      const requiredAmount = this.parseTokenAmount(amount, this.getTokenSymbol(tokenAddress, chainId));
      
      // If allowance is insufficient, request approval
      if (currentAllowance < requiredAmount) {
        console.log(`🔧 Requesting approval for ${amount} tokens...`);
        
        // Request approval with some buffer (2x the required amount)
        const approvalAmount = requiredAmount * 2n;
        const tx = await tokenContract.approve(LIMIT_ORDER_PROTOCOL, approvalAmount);
        
        console.log(`📝 Approval transaction submitted: ${tx.hash}`);
        await tx.wait();
        console.log(`✅ Token approval completed!`);
      } else {
        console.log(`✅ Sufficient token allowance already exists`);
      }
    } catch (error) {
      console.error('❌ Error during token approval:', error);
      throw new Error(`Token approval failed: ${error.message}`);
    }
  }

  /**
   * Get the Limit Order Protocol address for the given chain
   */
  static getLimitOrderProtocolAddress(chainId: number): string {
    const addresses: Record<number, string> = {
      11155111: '0x95508c5e6e02db99F17cd4c348EC6A791C189026', // Sepolia
      1: '0x0000000000000000000000000000000000000000' // Mainnet (placeholder)
    };
    
    const address = addresses[chainId];
    if (!address) {
      throw new Error(`Limit Order Protocol not deployed on chain ${chainId}`);
    }
    
    return address;
  }
}