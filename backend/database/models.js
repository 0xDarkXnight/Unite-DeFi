/**
 * Database models for Cross-Chain Dutch Auction System
 */

const mongoose = require('mongoose');

// Order Schema
const orderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true, index: true },
  orderHash: { type: String, required: true, unique: true, index: true },
  
  // Order data
  order: {
    salt: { type: String, required: true },
    maker: { type: String, required: true, index: true },
    receiver: { type: String },
    makerAsset: { type: String, required: true },
    takerAsset: { type: String, required: true },
    makingAmount: { type: String, required: true },
    takingAmount: { type: String, required: true },
    makerTraits: { type: String, required: true }
  },
  
  // Signature
  signature: {
    r: { type: String, required: true },
    vs: { type: String, required: true }
  },
  
  // Dutch auction parameters
  auctionParams: {
    startTime: { type: Number, required: true, index: true },
    endTime: { type: Number, required: true, index: true },
    startPrice: { type: String, required: true },
    endPrice: { type: String, required: true },
    duration: { type: Number, required: true }
  },
  
  // Cross-chain metadata
  crossChainData: {
    srcChainId: { type: Number, required: true, index: true },
    dstChainId: { type: Number, required: true, index: true },
    dstToken: { type: String, required: true },
    dstAmount: { type: String, required: true },
    hashlock: { type: String, required: true, index: true }
  },
  
  // Status tracking
  status: { 
    type: String, 
    enum: ['active', 'filled', 'expired', 'cancelled'], 
    default: 'active',
    index: true
  },
  currentPrice: { type: String },
  lastPriceUpdate: { type: Number },
  
  // Escrow information
  escrows: {
    src: {
      address: { type: String },
      txHash: { type: String },
      status: { type: String, enum: ['pending', 'created', 'funded', 'withdrawn', 'cancelled'] }
    },
    dst: {
      address: { type: String },
      txHash: { type: String },
      status: { type: String, enum: ['pending', 'created', 'funded', 'withdrawn', 'cancelled'] }
    }
  },
  
  // Resolver information
  resolver: {
    address: { type: String },
    filledAt: { type: Number },
    fillTxHash: { type: String }
  },
  
  // Timestamps
  createdAt: { type: Number, default: Date.now, index: true },
  updatedAt: { type: Number, default: Date.now },
  filledAt: { type: Number },
  expiredAt: { type: Number }
}, {
  timestamps: { currentTime: () => Date.now() }
});

// Indexes for performance
orderSchema.index({ 'crossChainData.srcChainId': 1, status: 1 });
orderSchema.index({ 'crossChainData.dstChainId': 1, status: 1 });
orderSchema.index({ 'auctionParams.startTime': 1, 'auctionParams.endTime': 1 });
orderSchema.index({ status: 1, createdAt: -1 });

// Escrow Schema
const escrowSchema = new mongoose.Schema({
  escrowId: { type: String, required: true, unique: true, index: true },
  orderId: { type: String, required: true, index: true },
  type: { type: String, enum: ['src', 'dst'], required: true },
  
  // Escrow details
  address: { type: String, required: true, index: true },
  chainId: { type: Number, required: true, index: true },
  
  // Immutables
  immutables: {
    orderHash: { type: String, required: true },
    hashlock: { type: String, required: true },
    maker: { type: String, required: true },
    taker: { type: String, required: true },
    token: { type: String, required: true },
    amount: { type: String, required: true },
    safetyDeposit: { type: String, required: true },
    timelocks: { type: String, required: true }
  },
  
  // Status tracking
  status: { 
    type: String, 
    enum: ['pending', 'created', 'funded', 'withdrawn', 'cancelled'], 
    default: 'pending',
    index: true
  },
  
  // Transaction data
  deployTxHash: { type: String },
  withdrawTxHash: { type: String },
  cancelTxHash: { type: String },
  
  // Timestamps
  createdAt: { type: Number, default: Date.now },
  deployedAt: { type: Number },
  withdrawnAt: { type: Number },
  cancelledAt: { type: Number }
});

// Indexes
escrowSchema.index({ orderId: 1, type: 1 });
escrowSchema.index({ chainId: 1, status: 1 });

// Secret Management Schema
const secretSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true, index: true },
  userAddress: { type: String, required: true, index: true },
  
  // Secret data (encrypted)
  encryptedSecret: { type: String, required: true },
  hashlock: { type: String, required: true, index: true },
  
  // Status
  status: { 
    type: String, 
    enum: ['pending', 'shared', 'revealed', 'used'], 
    default: 'pending',
    index: true
  },
  
  // Timestamps
  createdAt: { type: Number, default: Date.now },
  sharedAt: { type: Number },
  revealedAt: { type: Number },
  revealTxHash: { type: String }
});

// Resolver Schema
const resolverSchema = new mongoose.Schema({
  resolverId: { type: String, required: true, unique: true, index: true },
  address: { type: String, required: true, unique: true, index: true },
  owner: { type: String, required: true },
  
  // Configuration
  config: {
    supportedChains: [{ type: Number }],
    minProfitThreshold: { type: String, required: true },
    maxGasPrice: { type: String, required: true },
    active: { type: Boolean, default: true }
  },
  
  // Liquidity tracking
  liquidity: [{
    chainId: { type: Number, required: true },
    token: { type: String, required: true },
    balance: { type: String, required: true },
    reserved: { type: String, default: '0' },
    lastUpdated: { type: Number, default: Date.now }
  }],
  
  // Performance metrics
  metrics: {
    totalOrders: { type: Number, default: 0 },
    successfulOrders: { type: Number, default: 0 },
    totalVolume: { type: String, default: '0' },
    totalProfit: { type: String, default: '0' },
    averageExecutionTime: { type: Number, default: 0 }
  },
  
  // Status
  status: { 
    type: String, 
    enum: ['active', 'inactive', 'suspended'], 
    default: 'active',
    index: true
  },
  lastActive: { type: Number, default: Date.now },
  
  // Timestamps
  createdAt: { type: Number, default: Date.now },
  updatedAt: { type: Number, default: Date.now }
});

// Resolver Operation Schema
const resolverOperationSchema = new mongoose.Schema({
  operationId: { type: String, required: true, unique: true, index: true },
  resolverId: { type: String, required: true, index: true },
  orderId: { type: String, required: true, index: true },
  
  // Operation details
  type: { 
    type: String, 
    enum: ['auction_fill', 'escrow_deploy_src', 'escrow_deploy_dst', 'withdrawal'], 
    required: true 
  },
  chainId: { type: Number, required: true },
  
  // Transaction data
  txHash: { type: String },
  gasUsed: { type: String },
  gasPrice: { type: String },
  
  // Status
  status: { 
    type: String, 
    enum: ['pending', 'confirmed', 'failed'], 
    default: 'pending',
    index: true
  },
  
  // Metadata
  metadata: { type: mongoose.Schema.Types.Mixed },
  
  // Error handling
  error: { type: String },
  retryCount: { type: Number, default: 0 },
  
  // Timestamps
  createdAt: { type: Number, default: Date.now },
  confirmedAt: { type: Number },
  failedAt: { type: Number }
});

// System Metrics Schema
const systemMetricsSchema = new mongoose.Schema({
  timestamp: { type: Number, required: true, index: true },
  
  // Order metrics
  orders: {
    active: { type: Number, default: 0 },
    filled: { type: Number, default: 0 },
    expired: { type: Number, default: 0 },
    cancelled: { type: Number, default: 0 }
  },
  
  // Volume metrics
  volume: {
    total: { type: String, default: '0' },
    daily: { type: String, default: '0' },
    weekly: { type: String, default: '0' },
    monthly: { type: String, default: '0' }
  },
  
  // Resolver metrics
  resolvers: {
    active: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  },
  
  // Chain metrics
  chains: [{
    chainId: { type: Number, required: true },
    orders: { type: Number, default: 0 },
    volume: { type: String, default: '0' },
    avgGasPrice: { type: String, default: '0' }
  }],
  
  // Performance metrics
  performance: {
    avgExecutionTime: { type: Number, default: 0 },
    successRate: { type: Number, default: 0 },
    totalSwaps: { type: Number, default: 0 }
  }
});

// Create models
const Order = mongoose.model('Order', orderSchema);
const Escrow = mongoose.model('Escrow', escrowSchema);
const Secret = mongoose.model('Secret', secretSchema);
const Resolver = mongoose.model('Resolver', resolverSchema);
const ResolverOperation = mongoose.model('ResolverOperation', resolverOperationSchema);
const SystemMetrics = mongoose.model('SystemMetrics', systemMetricsSchema);

module.exports = {
  Order,
  Escrow,
  Secret,
  Resolver,
  ResolverOperation,
  SystemMetrics
};