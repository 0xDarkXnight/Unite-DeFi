/**
 * Type definitions for the Cross-Chain Dutch Auction System
 * Using JSDoc for type safety
 */

/**
 * @typedef {Object} Order
 * @property {string} salt - Order salt + extension hash
 * @property {string} maker - Maker address
 * @property {string} receiver - Receiver address (optional)
 * @property {string} makerAsset - Maker asset address
 * @property {string} takerAsset - Taker asset address
 * @property {string} makingAmount - Amount maker is selling
 * @property {string} takingAmount - Amount maker wants to receive
 * @property {string} makerTraits - Maker traits bit flags
 */

/**
 * @typedef {Object} OrderSignature
 * @property {string} r - R component of signature
 * @property {string} vs - VS component of signature
 */

/**
 * @typedef {Object} DutchAuctionParams
 * @property {number} startTime - Auction start timestamp
 * @property {number} endTime - Auction end timestamp
 * @property {string} startPrice - Starting price (high)
 * @property {string} endPrice - Ending price (low)
 * @property {number} duration - Auction duration in seconds
 */

/**
 * @typedef {Object} CrossChainOrderMetadata
 * @property {number} srcChainId - Source chain ID
 * @property {number} dstChainId - Destination chain ID
 * @property {string} dstToken - Destination token address
 * @property {string} dstAmount - Destination token amount
 * @property {string} secret - User's secret (only known to user and relayer)
 * @property {string} hashlock - Hash of the secret
 */

/**
 * @typedef {Object} EscrowImmutables
 * @property {string} orderHash - Hash of the order
 * @property {string} hashlock - Hash of the secret
 * @property {string} maker - Maker address
 * @property {string} taker - Taker/resolver address
 * @property {string} token - Token address
 * @property {string} amount - Token amount
 * @property {string} safetyDeposit - Safety deposit amount
 * @property {string} timelocks - Packed timelocks
 */

/**
 * @typedef {Object} EscrowState
 * @property {string} id - Unique escrow ID
 * @property {string} address - Escrow contract address
 * @property {EscrowImmutables} immutables - Immutable parameters
 * @property {string} status - 'created' | 'funded' | 'withdrawn' | 'cancelled'
 * @property {number} createdAt - Creation timestamp
 * @property {number} deployedAt - Deployment timestamp
 * @property {string} txHash - Deployment transaction hash
 * @property {number} chainId - Chain ID where escrow is deployed
 */

/**
 * @typedef {Object} ResolverConfig
 * @property {string} address - Resolver contract address
 * @property {string} privateKey - Resolver private key
 * @property {string} owner - Resolver owner address
 * @property {number[]} supportedChains - Supported chain IDs
 * @property {Object} liquidityPool - Available liquidity per chain/token
 * @property {number} minProfitThreshold - Minimum profit threshold (in USD)
 * @property {number} maxGasPrice - Maximum gas price willing to pay
 * @property {boolean} active - Whether resolver is active
 */

/**
 * @typedef {Object} ResolverOperation
 * @property {string} id - Operation ID
 * @property {string} type - 'auction_fill' | 'escrow_deploy' | 'withdrawal'
 * @property {string} orderId - Related order ID
 * @property {number} chainId - Chain ID
 * @property {string} txHash - Transaction hash
 * @property {string} status - 'pending' | 'confirmed' | 'failed'
 * @property {number} timestamp - Operation timestamp
 * @property {Object} metadata - Additional operation data
 */

/**
 * @typedef {Object} OrderMonitoringData
 * @property {Order} order - The limit order
 * @property {OrderSignature} signature - Order signature
 * @property {DutchAuctionParams} auctionParams - Dutch auction parameters
 * @property {CrossChainOrderMetadata} crossChainData - Cross-chain metadata
 * @property {string} status - 'active' | 'filled' | 'expired' | 'cancelled'
 * @property {number} createdAt - Order creation timestamp
 * @property {string} currentPrice - Current auction price
 * @property {number} lastPriceUpdate - Last price calculation timestamp
 */

/**
 * @typedef {Object} SecretManagement
 * @property {string} orderId - Order ID
 * @property {string} userAddress - User address
 * @property {string} secret - The actual secret
 * @property {string} hashlock - Hash of the secret
 * @property {string} status - 'pending' | 'shared' | 'revealed' | 'used'
 * @property {number} sharedAt - When secret was shared with user
 * @property {number} revealedAt - When secret was revealed on-chain
 * @property {string} revealTxHash - Transaction where secret was revealed
 */

/**
 * @typedef {Object} LiquidityPosition
 * @property {number} chainId - Chain ID
 * @property {string} token - Token address
 * @property {string} balance - Available balance
 * @property {string} reserved - Reserved/locked balance
 * @property {string} symbol - Token symbol
 * @property {number} decimals - Token decimals
 * @property {number} lastUpdated - Last balance update timestamp
 */

/**
 * @typedef {Object} ProfitCalculation
 * @property {string} orderId - Order ID
 * @property {string} currentPrice - Current auction price
 * @property {string} dstTokenPrice - Destination token market price
 * @property {string} estimatedProfit - Estimated profit in USD
 * @property {string} gasEstimate - Estimated gas costs
 * @property {string} netProfit - Net profit after costs
 * @property {boolean} isProfitable - Whether order is profitable
 * @property {number} calculatedAt - Calculation timestamp
 */

/**
 * @typedef {Object} RelayerValidation
 * @property {string} orderId - Order ID
 * @property {EscrowState} srcEscrow - Source escrow state
 * @property {EscrowState} dstEscrow - Destination escrow state
 * @property {boolean} srcValid - Source escrow validation result
 * @property {boolean} dstValid - Destination escrow validation result
 * @property {boolean} fundsValid - Funds validation result
 * @property {string} validationMessage - Validation details
 * @property {number} validatedAt - Validation timestamp
 */

/**
 * @typedef {Object} SystemMetrics
 * @property {number} activeOrders - Number of active orders
 * @property {number} completedSwaps - Number of completed swaps
 * @property {number} totalVolume - Total volume processed (USD)
 * @property {number} activeResolvers - Number of active resolvers
 * @property {Object} chainMetrics - Per-chain metrics
 * @property {number} lastUpdated - Last metrics update timestamp
 */

/**
 * @typedef {Object} WebSocketMessage
 * @property {string} type - Message type
 * @property {string} id - Message ID
 * @property {Object} data - Message payload
 * @property {number} timestamp - Message timestamp
 */

/**
 * @typedef {Object} APIResponse
 * @property {boolean} success - Whether request was successful
 * @property {Object|null} data - Response data
 * @property {string|null} error - Error message if failed
 * @property {number} timestamp - Response timestamp
 */

module.exports = {
  // Export types for JSDoc usage
  // This file serves as documentation and doesn't export runtime values
};