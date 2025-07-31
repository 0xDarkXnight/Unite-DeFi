// Hardhat Configuration Template for Cross-Chain Dutch Auction System
// Copy this to your project root and customize as needed

require("@nomiclabs/hardhat-ethers");
require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");
require("hardhat-gas-reporter");
require("solidity-coverage");
require("hardhat-deploy");

// Load environment variables
require("dotenv").config();

const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x" + "0".repeat(64);
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";
const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY || "";
const BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY || "";
const ARBITRUM_API_KEY = process.env.ARBITRUM_API_KEY || "";

module.exports = {
  solidity: {
    version: "0.8.23",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true, // Enable intermediate representation for better optimization
    },
  },
  
  networks: {
    // Local development
    hardhat: {
      chainId: 31337,
      gasPrice: 20_000_000_000, // 20 gwei
      gasMultiplier: 1.2,
    },
    
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },

    // Testnets
    goerli: {
      url: `https://goerli.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
      accounts: [PRIVATE_KEY],
      chainId: 5,
      gasPrice: 20_000_000_000,
    },
    
    sepolia: {
      url: `https://sepolia.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
      accounts: [PRIVATE_KEY],
      chainId: 11155111,
      gasPrice: 20_000_000_000,
    },

    mumbai: {
      url: "https://rpc-mumbai.maticvigil.com",
      accounts: [PRIVATE_KEY],
      chainId: 80001,
      gasPrice: 20_000_000_000,
    },

    // Mainnets
    mainnet: {
      url: `https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
      accounts: [PRIVATE_KEY],
      chainId: 1,
      gasPrice: 30_000_000_000, // 30 gwei
    },

    polygon: {
      url: "https://polygon-rpc.com",
      accounts: [PRIVATE_KEY],
      chainId: 137,
      gasPrice: 50_000_000_000, // 50 gwei
    },

    bsc: {
      url: "https://bsc-dataseed.binance.org",
      accounts: [PRIVATE_KEY],
      chainId: 56,
      gasPrice: 5_000_000_000, // 5 gwei
    },

    arbitrum: {
      url: "https://arb1.arbitrum.io/rpc",
      accounts: [PRIVATE_KEY],
      chainId: 42161,
      gasPrice: 1_000_000_000, // 1 gwei
    },

    optimism: {
      url: "https://mainnet.optimism.io",
      accounts: [PRIVATE_KEY],
      chainId: 10,
      gasPrice: 1_000_000_000, // 1 gwei
    },

    avalanche: {
      url: "https://api.avax.network/ext/bc/C/rpc",
      accounts: [PRIVATE_KEY],
      chainId: 43114,
      gasPrice: 25_000_000_000, // 25 gwei
    },
  },

  // Contract verification
  etherscan: {
    apiKey: {
      mainnet: ETHERSCAN_API_KEY,
      goerli: ETHERSCAN_API_KEY,
      sepolia: ETHERSCAN_API_KEY,
      polygon: POLYGONSCAN_API_KEY,
      polygonMumbai: POLYGONSCAN_API_KEY,
      bsc: BSCSCAN_API_KEY,
      bscTestnet: BSCSCAN_API_KEY,
      arbitrumOne: ARBITRUM_API_KEY,
      arbitrumGoerli: ARBITRUM_API_KEY,
    },
  },

  // Gas reporting
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
    coinmarketcap: process.env.COINMARKETCAP_API_KEY,
  },

  // Named accounts for hardhat-deploy
  namedAccounts: {
    deployer: {
      default: 0, // First account as deployer
    },
    resolver1: {
      default: 1, // Second account as resolver 1
    },
    resolver2: {
      default: 2, // Third account as resolver 2
    },
    user: {
      default: 3, // Fourth account as test user
    },
  },

  // Deployment paths
  paths: {
    sources: "./contracts_EVM",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
    deploy: "./deploy",
    deployments: "./deployments",
  },

  // Mocha test configuration
  mocha: {
    timeout: 60000, // 60 seconds
  },

  // Additional settings
  contractSizer: {
    alphaSort: true,
    runOnCompile: true,
    disambiguatePaths: false,
  },
};