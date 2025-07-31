/**
 * Multi-chain configuration for the Dutch auction system
 */

const CHAIN_CONFIG = {
  // Ethereum Mainnet
  1: {
    name: 'ethereum',
    rpcUrl: process.env.ETHEREUM_RPC_URL || 'https://eth-mainnet.alchemyapi.io/v2/your-api-key',
    chainId: 1,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    blockTime: 12000, // 12 seconds
    confirmations: 12,
    gasLimit: 500000,
    gasPriceMultiplier: 1.1,
    contracts: {
      limitOrderProtocol: process.env.ETH_LIMIT_ORDER_PROTOCOL || '',
      dutchAuctionCalculator: process.env.ETH_DUTCH_AUCTION_CALCULATOR || '',
      escrowFactory: process.env.ETH_ESCROW_FACTORY || '',
      weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
    },
    timeouts: {
      escrowValidation: 300000, // 5 minutes
      secretReveal: 1800000,    // 30 minutes
      withdrawal: 86400000      // 24 hours
    }
  },

  // Polygon
  137: {
    name: 'polygon',
    rpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
    chainId: 137,
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    blockTime: 2000, // 2 seconds
    confirmations: 20,
    gasLimit: 800000,
    gasPriceMultiplier: 1.2,
    contracts: {
      limitOrderProtocol: process.env.POLYGON_LIMIT_ORDER_PROTOCOL || '',
      dutchAuctionCalculator: process.env.POLYGON_DUTCH_AUCTION_CALCULATOR || '',
      escrowFactory: process.env.POLYGON_ESCROW_FACTORY || '',
      weth: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270' // WMATIC
    },
    timeouts: {
      escrowValidation: 120000, // 2 minutes (faster finality)
      secretReveal: 900000,     // 15 minutes
      withdrawal: 43200000      // 12 hours
    }
  },

  // BSC
  56: {
    name: 'bsc',
    rpcUrl: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org',
    chainId: 56,
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    blockTime: 3000, // 3 seconds
    confirmations: 15,
    gasLimit: 600000,
    gasPriceMultiplier: 1.1,
    contracts: {
      limitOrderProtocol: process.env.BSC_LIMIT_ORDER_PROTOCOL || '',
      dutchAuctionCalculator: process.env.BSC_DUTCH_AUCTION_CALCULATOR || '',
      escrowFactory: process.env.BSC_ESCROW_FACTORY || '',
      weth: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' // WBNB
    },
    timeouts: {
      escrowValidation: 180000, // 3 minutes
      secretReveal: 1200000,    // 20 minutes
      withdrawal: 43200000      // 12 hours
    }
  },

  // Arbitrum
  42161: {
    name: 'arbitrum',
    rpcUrl: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    chainId: 42161,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    blockTime: 1000, // 1 second
    confirmations: 5,
    gasLimit: 1000000,
    gasPriceMultiplier: 1.0,
    contracts: {
      limitOrderProtocol: process.env.ARB_LIMIT_ORDER_PROTOCOL || '',
      dutchAuctionCalculator: process.env.ARB_DUTCH_AUCTION_CALCULATOR || '',
      escrowFactory: process.env.ARB_ESCROW_FACTORY || '',
      weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'
    },
    timeouts: {
      escrowValidation: 60000,  // 1 minute (very fast)
      secretReveal: 600000,     // 10 minutes
      withdrawal: 21600000      // 6 hours
    }
  },

  // Optimism
  10: {
    name: 'optimism',
    rpcUrl: process.env.OPTIMISM_RPC_URL || 'https://mainnet.optimism.io',
    chainId: 10,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    blockTime: 2000, // 2 seconds
    confirmations: 10,
    gasLimit: 800000,
    gasPriceMultiplier: 1.0,
    contracts: {
      limitOrderProtocol: process.env.OP_LIMIT_ORDER_PROTOCOL || '',
      dutchAuctionCalculator: process.env.OP_DUTCH_AUCTION_CALCULATOR || '',
      escrowFactory: process.env.OP_ESCROW_FACTORY || '',
      weth: '0x4200000000000000000000000000000000000006'
    },
    timeouts: {
      escrowValidation: 90000,  // 1.5 minutes
      secretReveal: 720000,     // 12 minutes
      withdrawal: 21600000      // 6 hours
    }
  }
};

// Testnet configurations
const TESTNET_CONFIG = {
  // Goerli
  5: {
    name: 'goerli',
    rpcUrl: process.env.GOERLI_RPC_URL || 'https://goerli.infura.io/v3/your-api-key',
    chainId: 5,
    nativeCurrency: { name: 'Goerli Ether', symbol: 'GoerliETH', decimals: 18 },
    blockTime: 15000,
    confirmations: 3,
    gasLimit: 500000,
    gasPriceMultiplier: 1.5,
    contracts: {
      limitOrderProtocol: process.env.GOERLI_LIMIT_ORDER_PROTOCOL || '',
      dutchAuctionCalculator: process.env.GOERLI_DUTCH_AUCTION_CALCULATOR || '',
      escrowFactory: process.env.GOERLI_ESCROW_FACTORY || '',
      weth: '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6'
    },
    timeouts: {
      escrowValidation: 120000,
      secretReveal: 600000,
      withdrawal: 3600000
    }
  },

  // Mumbai (Polygon Testnet)
  80001: {
    name: 'mumbai',
    rpcUrl: process.env.MUMBAI_RPC_URL || 'https://rpc-mumbai.maticvigil.com',
    chainId: 80001,
    nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
    blockTime: 2000,
    confirmations: 5,
    gasLimit: 800000,
    gasPriceMultiplier: 1.5,
    contracts: {
      limitOrderProtocol: process.env.MUMBAI_LIMIT_ORDER_PROTOCOL || '',
      dutchAuctionCalculator: process.env.MUMBAI_DUTCH_AUCTION_CALCULATOR || '',
      escrowFactory: process.env.MUMBAI_ESCROW_FACTORY || '',
      weth: '0x9c3C9283D3e44854697Cd22D3Faa240Cfb032889' // WMATIC
    },
    timeouts: {
      escrowValidation: 60000,
      secretReveal: 300000,
      withdrawal: 1800000
    }
  }
};

// Combine mainnet and testnet configs
const ALL_CHAINS = {
  ...CHAIN_CONFIG,
  ...TESTNET_CONFIG
};

// Helper functions
const getChainConfig = (chainId) => {
  const config = ALL_CHAINS[chainId];
  if (!config) {
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }
  return config;
};

const getSupportedChains = () => {
  return Object.keys(ALL_CHAINS).map(Number);
};

const getMainnetChains = () => {
  return Object.keys(CHAIN_CONFIG).map(Number);
};

const getTestnetChains = () => {
  return Object.keys(TESTNET_CONFIG).map(Number);
};

const isTestnet = (chainId) => {
  return chainId in TESTNET_CONFIG;
};

const isMainnet = (chainId) => {
  return chainId in CHAIN_CONFIG;
};

module.exports = {
  CHAIN_CONFIG,
  TESTNET_CONFIG,
  ALL_CHAINS,
  getChainConfig,
  getSupportedChains,
  getMainnetChains,
  getTestnetChains,
  isTestnet,
  isMainnet
};