/**
 * Multi-chain configuration for the Dutch auction system
 */

// Only Sepolia testnet configuration
const SEPOLIA_CONFIG = {
  11155111: {
    name: 'sepolia',
    rpcUrl: process.env.SEPOLIA_RPC_URL || 'https://eth-sepolia.g.alchemy.com/v2/d40IDFW5NaYldNIOSb_vuJBNF5sm1WR7',
    chainId: 11155111,
    nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
    blockTime: 12000, // 12 seconds
    confirmations: 3,  // Fewer confirmations for testnet
    gasLimit: 500000,
    gasPriceMultiplier: 1.1,
    contracts: {
      limitOrderProtocol: process.env.SEPOLIA_LIMIT_ORDER_PROTOCOL || '0x95508c5e6e02db99F17cd4c348EC6A791C189026',
      dutchAuctionCalculator: process.env.SEPOLIA_DUTCH_AUCTION_CALCULATOR || '0x3CE7918d54FeFf0133c429C5CE1245d54e88E08e',
      escrowFactory: process.env.SEPOLIA_ESCROW_FACTORY || '0x44CA7ff3aD7255e206ae24b0d15ACAFF5ee080E5',
      resolver: process.env.SEPOLIA_RESOLVER || '0x8C1c1F0F562523590613fD01280EE259782d6328',
      weth: process.env.SEPOLIA_WETH || '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14' // Sepolia WETH
    },
    timeouts: {
      escrowValidation: 180000, // 3 minutes
      secretReveal: 1200000,    // 20 minutes  
      withdrawal: 43200000      // 12 hours
    }
  }
};

// Only Sepolia is supported
const ALL_CHAINS = SEPOLIA_CONFIG;

// Helper functions
const getChainConfig = (chainId) => {
  const config = ALL_CHAINS[chainId];
  if (!config) {
    console.error(`Unsupported chain ID: ${chainId}. Only Sepolia (11155111) is supported.`);
    throw new Error(`Unsupported chain ID: ${chainId}`);
  }
  return config;
};

const getSupportedChains = () => {
  return [11155111]; // Only Sepolia
};

const getSepoliaConfig = () => {
  return SEPOLIA_CONFIG[11155111];
};

const isSupported = (chainId) => {
  return chainId === 11155111; // Only Sepolia
};

module.exports = {
  SEPOLIA_CONFIG,
  ALL_CHAINS,
  getChainConfig,
  getSupportedChains,
  getSepoliaConfig,
  isSupported
};