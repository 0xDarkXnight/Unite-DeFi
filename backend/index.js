/**
 * Main entry point for Cross-Chain Dutch Auction Backend System
 */

require('dotenv').config();

const { initializeConfig } = require('./config');
const { databaseManager } = require('./database/connection');
const RelayerService = require('./relayer/services/RelayerService');
const ResolverBot = require('./resolver/bots/ResolverBot');
const APIServer = require('./api');

// System components
let relayerService = null;
let resolverBots = [];
let apiServer = null;

/**
 * Initialize and start all system components
 */
async function startSystem() {
  try {
    console.log('🚀 Starting Cross-Chain Dutch Auction Backend System...');
    console.log('=====================================');
    
    // 1. Initialize configuration
    console.log('📋 Initializing configuration...');
    const config = initializeConfig();
    
    // 2. Connect to databases
    console.log('🔌 Connecting to databases...');
    await databaseManager.connect();
    
    // 3. Start services based on configuration
    const services = [];
    
    // Start Relayer Service
    if (config.relayer.enabled) {
      console.log('🔐 Starting Relayer Service...');
      relayerService = new RelayerService();
      await relayerService.start();
      services.push('Relayer');
    }
    
    // Start Resolver Bots
    if (config.resolver.enabled) {
      console.log('🤖 Starting Resolver Bots...');
      
      // Load resolver configurations from environment or database
      const resolverConfigs = await loadResolverConfigs();
      
      for (const resolverConfig of resolverConfigs) {
        const bot = new ResolverBot(resolverConfig);
        await bot.start();
        resolverBots.push(bot);
        services.push(`Resolver-${resolverConfig.resolverId}`);
      }
    }
    
    // Start API Server
    if (config.api.enabled) {
      console.log('🌐 Starting API Server...');
      apiServer = new APIServer();
      await apiServer.start();
      services.push('API');
    }
    
    // System startup complete
    console.log('=====================================');
    console.log('✅ System startup complete!');
    console.log(`📊 Active services: ${services.join(', ')}`);
    console.log(`🕐 Started at: ${new Date().toISOString()}`);
    console.log('=====================================');
    
    // Setup graceful shutdown
    setupGracefulShutdown();
    
    // Start health monitoring
    startHealthMonitoring();
    
  } catch (error) {
    console.error('❌ System startup failed:', error);
    await gracefulShutdown();
    process.exit(1);
  }
}

/**
 * Load resolver configurations
 */
async function loadResolverConfigs() {
  // In a real implementation, load from database or configuration files
  // For now, return example configurations from environment variables
  
  const configs = [];
  
  // Check for resolver configuration in environment
  if (process.env.RESOLVER_PRIVATE_KEY && process.env.RESOLVER_ADDRESS) {
    configs.push({
      resolverId: process.env.RESOLVER_ID || 'resolver-1',
      address: process.env.RESOLVER_ADDRESS,
      privateKey: process.env.RESOLVER_PRIVATE_KEY,
      owner: process.env.RESOLVER_OWNER || process.env.RESOLVER_ADDRESS,
      supportedChains: (process.env.RESOLVER_CHAINS || '1,137,56').split(',').map(Number),
      contractAddresses: {
        1: process.env.RESOLVER_CONTRACT_ETH,
        137: process.env.RESOLVER_CONTRACT_POLYGON,
        56: process.env.RESOLVER_CONTRACT_BSC,
        42161: process.env.RESOLVER_CONTRACT_ARBITRUM,
        10: process.env.RESOLVER_CONTRACT_OPTIMISM
      },
      minProfitThreshold: process.env.MIN_PROFIT_THRESHOLD || '10',
      maxGasPrice: process.env.MAX_GAS_PRICE || '100000000000',
      active: true
    });
  }
  
  // Add more resolver configurations as needed
  // You could also load from database:
  // const { Resolver } = require('./database/models');
  // const resolvers = await Resolver.find({ status: 'active' });
  
  return configs;
}

/**
 * Setup graceful shutdown handlers
 */
function setupGracefulShutdown() {
  const shutdown = async (signal) => {
    console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
    await gracefulShutdown();
    process.exit(0);
  };
  
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGUSR2', () => shutdown('SIGUSR2')); // Nodemon restart
  
  // Handle uncaught exceptions
  process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    gracefulShutdown().then(() => process.exit(1));
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown().then(() => process.exit(1));
  });
}

/**
 * Gracefully shutdown all services
 */
async function gracefulShutdown() {
  console.log('🔄 Shutting down services...');
  
  const shutdownPromises = [];
  
  // Stop Relayer Service
  if (relayerService) {
    shutdownPromises.push(relayerService.stop());
  }
  
  // Stop Resolver Bots
  for (const bot of resolverBots) {
    shutdownPromises.push(bot.stop());
  }
  
  // Stop API Server
  if (apiServer) {
    shutdownPromises.push(apiServer.stop());
  }
  
  // Wait for all services to stop
  await Promise.all(shutdownPromises);
  
  // Close database connections
  await databaseManager.disconnect();
  
  console.log('✅ Graceful shutdown completed');
}

/**
 * Start health monitoring
 */
function startHealthMonitoring() {
  const monitorHealth = async () => {
    try {
      const status = {
        timestamp: Date.now(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        database: databaseManager.getStatus(),
        services: {
          relayer: relayerService ? 'running' : 'stopped',
          resolvers: resolverBots.length,
          api: apiServer ? 'running' : 'stopped'
        }
      };
      
      // Log health status periodically
      if (status.timestamp % (5 * 60 * 1000) < 1000) { // Every 5 minutes
        console.log('❤️  System Health:', JSON.stringify(status, null, 2));
      }
      
      // You could also save to monitoring system or send to external service
      
    } catch (error) {
      console.error('❌ Health monitoring error:', error);
    }
  };
  
  // Run health check every 30 seconds
  setInterval(monitorHealth, 30000);
  console.log('❤️  Health monitoring started');
}

/**
 * Start specific service based on command line argument
 */
async function startSpecificService() {
  const service = process.argv[2];
  
  switch (service) {
    case 'relayer':
      console.log('🔐 Starting Relayer Service only...');
      await databaseManager.connect();
      relayerService = new RelayerService();
      await relayerService.start();
      break;
      
    case 'resolver':
      console.log('🤖 Starting Resolver Bot only...');
      await databaseManager.connect();
      const resolverConfigs = await loadResolverConfigs();
      if (resolverConfigs.length === 0) {
        throw new Error('No resolver configuration found');
      }
      const bot = new ResolverBot(resolverConfigs[0]);
      await bot.start();
      resolverBots.push(bot);
      break;
      
    case 'api':
      console.log('🌐 Starting API Server only...');
      await databaseManager.connect();
      apiServer = new APIServer();
      await apiServer.start();
      break;
      
    default:
      console.log('🚀 Starting all services...');
      await startSystem();
      return;
  }
  
  console.log(`✅ ${service} service started successfully`);
  setupGracefulShutdown();
}

// Export for testing
module.exports = {
  startSystem,
  gracefulShutdown,
  loadResolverConfigs
};

// Start the system if this file is run directly
if (require.main === module) {
  startSpecificService()
    .catch((error) => {
      console.error('❌ System startup failed:', error);
      process.exit(1);
    });
}