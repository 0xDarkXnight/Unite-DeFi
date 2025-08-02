/**
 * Integrated backend server with full functionality
 */

const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const { supabaseManager } = require('./database/supabase');
const { config } = require('./config');
const RelayerService = require('./relayer/services/RelayerService');
const ResolverBot = require('./resolver/bots/ResolverBot');

const app = express();
const PORT = process.env.PORT || 3003;

// Service instances
let relayerService = null;
let resolverBot = null;

// Basic middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Initialize database and services
async function initializeServices() {
  try {
    // Initialize database
    await supabaseManager.connect();
    console.log('✅ Database connected');

    // Initialize relayer service if enabled
    if (process.env.RELAYER_ENABLED === 'true') {
      relayerService = new RelayerService();
      await relayerService.start();
      console.log('✅ Relayer service started');
    }

    // Initialize resolver bot if enabled
    if (process.env.RESOLVER_ENABLED === 'true' && process.env.RESOLVER_PRIVATE_KEY) {
      const resolverConfig = {
        resolverId: process.env.RESOLVER_ID || 'resolver-1',
        address: process.env.RESOLVER_ADDRESS,
        privateKey: process.env.RESOLVER_PRIVATE_KEY,
        owner: process.env.RESOLVER_OWNER || process.env.RESOLVER_ADDRESS,
        supportedChains: [11155111], // Only Sepolia
        contractAddresses: {
          11155111: process.env.SEPOLIA_RESOLVER
        },
        minProfitThreshold: process.env.MIN_PROFIT_THRESHOLD || '10',
        maxGasPrice: process.env.MAX_GAS_PRICE || '50000000000'
      };

      resolverBot = new ResolverBot(resolverConfig);
      await resolverBot.start();
      console.log('✅ Resolver bot started');
    }
  } catch (error) {
    console.error('❌ Service initialization failed:', error);
  }
}

initializeServices();

// Health endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    database: supabaseManager.getStatus(),
    services: {
      relayer: relayerService ? 'running' : 'stopped',
      resolver: resolverBot ? 'running' : 'stopped'
    }
  });
});

// System status endpoint
app.get('/api/system/status', (req, res) => {
  res.json({
    success: true,
    data: {
      system: 'Cross-Chain Dutch Auction Backend',
      version: '1.0.0',
      timestamp: Date.now(),
      database: supabaseManager.getStatus(),
      services: {
        relayer: {
          enabled: process.env.RELAYER_ENABLED === 'true',
          running: relayerService ? relayerService.isRunning : false
        },
        resolver: {
          enabled: process.env.RESOLVER_ENABLED === 'true',
          running: resolverBot ? resolverBot.isRunning : false,
          resolverId: process.env.RESOLVER_ID || 'resolver-1'
        }
      },
      chains: {
        supported: [11155111], // Only Sepolia
        default: 11155111
      }
    }
  });
});

// Orders endpoints
app.get('/api/orders', async (req, res) => {
  try {
    const { orders, totalCount } = await supabaseManager.getOrders({}, {
      page: 1,
      limit: 20
    });
    
    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          page: 1,
          limit: 20,
          totalCount,
          totalPages: Math.ceil(totalCount / 20),
          hasNext: false,
          hasPrev: false
        }
      },
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: Date.now()
    });
  }
});

app.post('/api/orders', async (req, res) => {
  try {
    console.log('📝 Creating order:', req.body);
    
    const { order, signature, auctionParams, crossChainData } = req.body;
    
    // Validate required fields
    if (!order || !signature || !auctionParams || !crossChainData) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: order, signature, auctionParams, crossChainData',
        timestamp: Date.now()
      });
    }
    
    // Generate order ID and hash
    const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const orderHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['string', 'uint256', 'address', 'address'],
        [orderId, Date.now(), order.maker, order.makerAsset]
      )
    );
    
    // Create order in database
    const orderDocument = {
      orderId,
      orderHash,
      order,
      signature,
      auctionParams,
      crossChainData,
      status: 'active',
      currentPrice: auctionParams.startPrice,
      lastPriceUpdate: Date.now()
    };
    
    const newOrder = await supabaseManager.createOrder(orderDocument);
    
    // Generate and store secret for atomic swap
    let hashlock = null;
    if (relayerService && relayerService.secretManager) {
      try {
        const secret = relayerService.secretManager.generateSecret();
        hashlock = await relayerService.secretManager.storeSecret(orderId, secret, order.maker);
        console.log(`🔐 Secret generated and stored for order ${orderId}`);
      } catch (secretError) {
        console.error('❌ Error generating secret:', secretError);
      }
    }
    
    console.log('✅ Order created:', orderId);
    
    res.status(201).json({
      success: true,
      data: {
        orderId,
        orderHash,
        status: 'active',
        auctionStartTime: auctionParams.startTime,
        auctionEndTime: auctionParams.endTime,
        currentPrice: auctionParams.startPrice,
        hashlock
      },
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      details: error.message,
      timestamp: Date.now()
    });
  }
});

// Get order by ID
app.get('/api/orders/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await supabaseManager.getOrder(orderId);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
        timestamp: Date.now()
      });
    }
    
    res.json({
      success: true,
      data: order,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: Date.now()
    });
  }
});

// Resolver notification endpoint
app.post('/api/resolver/notify', async (req, res) => {
  try {
    const notification = req.body;
    
    if (!relayerService) {
      return res.status(503).json({
        success: false,
        error: 'Relayer service not available',
        timestamp: Date.now()
      });
    }
    
    // Queue the notification for processing
    relayerService.queueValidation(notification);
    
    res.json({
      success: true,
      message: 'Notification queued for processing',
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Error processing resolver notification:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      timestamp: Date.now()
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Simple API server running on port ${PORT}`);
  console.log(`📖 Health check: http://localhost:${PORT}/health`);
  console.log(`📝 Orders API: http://localhost:${PORT}/api/orders`);
});