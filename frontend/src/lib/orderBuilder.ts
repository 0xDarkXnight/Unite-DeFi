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
    'ETH': '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    'WETH': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    'USDC': '0xA0b86a33E6441e1c4aceBE4d7c8E5Ce0f7E0Be8C',
    'USDT': '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  },
  11155111: { // Sepolia Testnet
    'ETH': '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
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
    const takerAsset = this.getTokenAddress(fromChain, 'WETH'); // Use WETH as intermediate for cross-chain
    const dstToken = this.getTokenAddress(toChain, toToken);

    // Validate amounts before parsing
    if (!fromAmount || !toAmount || isNaN(parseFloat(fromAmount)) || isNaN(parseFloat(toAmount))) {
      throw new Error(`Invalid amounts: fromAmount=${fromAmount}, toAmount=${toAmount}`);
    }

    // Convert amounts to wei
    const makingAmount = ethers.parseEther(fromAmount).toString();
    const baseTakingAmount = ethers.parseEther(toAmount).toString();

    // Calculate auction prices with slippage
    const slippagePercent = parseFloat(slippage) / 100;
    const startPrice = ethers.parseEther(toAmount).toString(); // Start at expected price
    const endPrice = ethers.parseEther((parseFloat(toAmount) * (1 + slippagePercent)).toString()).toString(); // End with slippage

    // Auction timing
    const now = Math.floor(Date.now() / 1000);
    const startTime = now + 60; // Start in 1 minute
    const endTime = startTime + auctionDuration;

    // Generate salt as BigInt
    const salt = ethers.hexlify(ethers.randomBytes(32));
    const saltBigInt = BigInt(salt).toString();
    
    // Build maker traits (simplified)
    const makerTraits = '0x0000000000000000000000000000000000000000000000000000000000000000'; // Basic traits

    // Build the order
    const order = {
      salt: saltBigInt,
      maker: maker.toLowerCase(),
      makerAsset,
      takerAsset,
      makingAmount,
      takingAmount: baseTakingAmount,
      makerTraits,
      receiver: '0x0000000000000000000000000000000000000000' // Add explicit receiver
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
      makerTraits: string;
      receiver: string;
    },
    signer: ethers.Signer
  ): Promise<{ r: string; vs: string }> {
    // Get network info from provider
    if (!signer.provider) {
      throw new Error('Signer must have a provider');
    }
    
    const network = await signer.provider.getNetwork();
    const chainId = Number(network.chainId);
    
    // EIP-712 domain for 1inch Limit Order Protocol
    const domain = {
      name: '1inch Limit Order Protocol',
      version: '4',
      chainId,
      verifyingContract: '0x111111125421cA6dc452d289314280a0f8842A65' // 1inch v4 address
    };

    // Order type definition
    const types = {
      Order: [
        { name: 'salt', type: 'uint256' },
        { name: 'maker', type: 'address' },
        { name: 'receiver', type: 'address' },
        { name: 'makerAsset', type: 'address' },
        { name: 'takerAsset', type: 'address' },
        { name: 'makingAmount', type: 'uint256' },
        { name: 'takingAmount', type: 'uint256' },
        { name: 'makerTraits', type: 'uint256' }
      ]
    };

    // Ensure all values are properly formatted
    const orderToSign = {
      ...order,
      salt: order.salt,
      maker: order.maker,
      receiver: order.receiver,
      makerAsset: order.makerAsset,
      takerAsset: order.takerAsset,
      makingAmount: order.makingAmount,
      takingAmount: order.takingAmount,
      makerTraits: order.makerTraits
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
      
      // For 1inch compact signature format: vs = s + v
      const vHex = sig.v.toString(16).padStart(2, '0');
      const sWithoutPrefix = sig.s.replace('0x', '');
      const vs = '0x' + sWithoutPrefix + vHex + '00000000000000000000000000000000000000000000000000000000';
      
      console.log('Signature components:', { 
        r: sig.r, 
        s: sig.s, 
        v: sig.v, 
        vHex,
        vs 
      });
      
      return {
        r: sig.r,
        vs: vs
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
}