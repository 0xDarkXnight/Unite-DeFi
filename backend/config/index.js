/**
 * Main configuration file for Cross-Chain Dutch Auction Backend
 */

require('dotenv').config();

const { getChainConfig, getSupportedChains } = require('./chains');

const config = {
  // Environment
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT) || 3003,
  
  // Database Configuration - Supabase only
  database: {
    supabase: {
      connectionString: process.env.SUPABASE_CONNECTION_STRING || 'https://your-project-id.supabase.co?key=your-anon-key'
    }
  },

  // Blockchain Configuration - Sepolia only
  blockchain: {
    supportedChains: getSupportedChains(), // Only Sepolia (11155111)
    defaultChain: 11155111, // Sepolia
    getChainConfig,
    
    // Global blockchain settings
    maxRetries: 3,
    retryDelay: 1000,
    defaultGasLimit: 500000,
    maxGasPrice: '50000000000', // 50 gwei for testnet
    
    // Event monitoring
    eventPollingInterval: 5000, // 5 seconds
    blockConfirmations: {
      sepolia: 3 // Only Sepolia
    }
  },

  // Relayer Service Configuration
  relayer: {
    enabled: process.env.RELAYER_ENABLED === 'true',
    port: parseInt(process.env.RELAYER_PORT) || 3001,
    
    // Secret management
    secretEncryption: {
      algorithm: 'aes-256-gcm',
      keyLength: 32,
      ivLength: 16,
      tagLength: 16
    },
    
    // Validation settings
    validation: {
      escrowTimeout: 300000,      // 5 minutes
      fundsCheckInterval: 30000,  // 30 seconds
      retryAttempts: 5,
      retryDelay: 10000          // 10 seconds
    },
    
    // Secret sharing
    secretSharing: {
      maxRetries: 3,
      timeout: 60000,           // 1 minute
      encryptionRequired: true
    }
  },

  // Resolver Configuration
  resolver: {
    enabled: process.env.RESOLVER_ENABLED === 'true',
    port: parseInt(process.env.RESOLVER_PORT) || 3002,
    
    // Bot settings
    bots: {
      maxConcurrentOrders: 10,
      orderPollingInterval: 30000,   // 30 seconds
      priceUpdateInterval: 30000,    // 30 seconds
      profitCheckInterval: 30000,    // 30 seconds
    },
    
    // Economic parameters
    economics: {
      minProfitThreshold: process.env.MIN_PROFIT_USD || '10', // $10 minimum profit
      maxSlippage: '0.05',          // 5% maximum slippage
      gasPriceMultiplier: 1.1,      // 10% gas price buffer
      safetyDepositMultiplier: 1.2, // 20% safety deposit buffer
    },
    
    // Risk management
    riskManagement: {
      maxPositionSize: process.env.MAX_POSITION_USD || '10000', // $10k max per order
      maxDailyVolume: process.env.MAX_DAILY_VOLUME_USD || '100000', // $100k daily limit
      liquidityCheckInterval: 60000, // 1 minute
      emergencyStopEnabled: true
    }
  },

  // API Configuration
  api: {
    enabled: process.env.API_ENABLED === 'true',
    port: parseInt(process.env.API_PORT) || 3003,
    
    // Rate limiting
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      standardHeaders: true,
      legacyHeaders: false,
    },
    
    // CORS settings
    cors: {
      origin: process.env.CORS_ORIGIN || ['http://localhost:3000', 'http://localhost:3001'],
      credentials: true,
      optionsSuccessStatus: 200
    },
    
    // JWT settings
    jwt: {
      secret: process.env.JWT_SECRET || 'your-super-secret-jwt-key',
      expiresIn: '24h',
      algorithm: 'HS256'
    }
  },

  // WebSocket Configuration
  websocket: {
    enabled: process.env.WEBSOCKET_ENABLED === 'true',
    port: parseInt(process.env.WEBSOCKET_PORT) || 3004,
    
    // Connection settings
    pingInterval: 30000,    // 30 seconds
    pingTimeout: 5000,      // 5 seconds
    maxConnections: 1000,
    
    // Message types
    messageTypes: {
      ORDER_UPDATE: 'order_update',
      PRICE_UPDATE: 'price_update',
      ESCROW_UPDATE: 'escrow_update',
      SYSTEM_STATUS: 'system_status'
    }
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    
    // File logging
    file: {
      enabled: process.env.FILE_LOGGING === 'true',
      filename: process.env.LOG_FILE || 'app.log',
      maxSize: '20m',
      maxFiles: 5
    },
    
    // Console logging
    console: {
      enabled: process.env.CONSOLE_LOGGING !== 'false',
      colorize: process.env.NODE_ENV === 'development'
    }
  },

  // Monitoring & Health
  monitoring: {
    enabled: process.env.MONITORING_ENABLED === 'true',
    
    // Health check intervals
    healthCheck: {
      interval: 30000,        // 30 seconds
      timeout: 5000,          // 5 seconds
      unhealthyThreshold: 3,  // 3 consecutive failures
      healthyThreshold: 2     // 2 consecutive successes
    },
    
    // Metrics collection
    metrics: {
      enabled: true,
      collectInterval: 60000, // 1 minute
      retentionPeriod: 86400000, // 24 hours
    }
  },

  // Security Configuration
  security: {
    // Rate limiting
    rateLimiting: {
      enabled: true,
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100
    },
    
    // Request validation
    validation: {
      maxPayloadSize: '10mb',
      allowedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
      trustProxy: true
    },
    
    // Encryption
    encryption: {
      enabled: true,
      algorithm: 'aes-256-gcm'
    }
  },

  // External Services
  external: {
    // Price feeds
    priceFeeds: {
      coingecko: {
        apiKey: process.env.COINGECKO_API_KEY,
        baseUrl: 'https://api.coingecko.com/api/v3',
        rateLimit: 50, // requests per second
        timeout: 10000 // 10 seconds
      },
      
      chainlink: {
        enabled: true,
        updateInterval: 30000 // 30 seconds
      }
    },
    
    // Analytics
    analytics: {
      enabled: process.env.ANALYTICS_ENABLED === 'true',
      provider: process.env.ANALYTICS_PROVIDER || 'internal'
    }
  }
};

// Validation (relaxed for development)
const validateConfig = () => {
  const required = [
    'blockchain.supportedChains'
  ];
  
  for (const path of required) {
    const value = path.split('.').reduce((obj, key) => obj?.[key], config);
    if (!value) {
      throw new Error(`Missing required configuration: ${path}`);
    }
  }
  
  // Validate chain configurations
  try {
    config.blockchain.supportedChains.forEach(getChainConfig);
  } catch (error) {
    throw new Error(`Invalid chain configuration: ${error.message}`);
  }
};

// Initialize configuration
const initializeConfig = () => {
  try {
    validateConfig();
    console.log('✅ Configuration validated successfully');
    return config;
  } catch (error) {
    console.error('❌ Configuration validation failed:', error.message);
    process.exit(1);
  }
};

module.exports = {
  config,
  validateConfig,
  initializeConfig
};