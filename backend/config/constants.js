/**
 * System constants and configuration values
 */

// Native ETH sentinel address (used by 1inch and other protocols)
const NATIVE_ETH_SENTINEL = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

// Zero address
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

// Default configuration values
const DEFAULT_CONFIG = {
  MIN_PROFIT_THRESHOLD: '10',
  MAX_GAS_PRICE: '100000000000',
  RESOLVER_ID: 'resolver-1',
  PORT: 3003,
  NODE_ENV: 'development'
};

// Timeout values (in milliseconds)
const TIMEOUTS = {
  ESCROW_VALIDATION: 180000,    // 3 minutes
  SECRET_REVEAL: 1200000,       // 20 minutes
  WITHDRAWAL: 43200000,         // 12 hours
  HEALTH_CHECK: 30000,          // 30 seconds
  GRACEFUL_SHUTDOWN: 10000      // 10 seconds
};

// Gas configuration
const GAS_CONFIG = {
  DEFAULT_LIMIT: 500000,
  PRICE_MULTIPLIER: 1.1,
  BUFFER_PERCENTAGE: 20
};

// Database configuration
const DATABASE_CONFIG = {
  MAX_RETRIES: 3,
  RETRY_DELAY: 1000,
  CONNECTION_TIMEOUT: 30000
};

// API configuration
const API_CONFIG = {
  RATE_LIMIT_WINDOW: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX: 100,               // 100 requests per window
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  BODY_LIMIT: '10mb'
};

// Signature configuration
const SIGNATURE_CONFIG = {
  EXPECTED_LENGTH: 132, // 65 bytes = 130 hex chars + 0x prefix
  DOMAIN_NAME: '1inch Limit Order Protocol',
  DOMAIN_VERSION: '4'
};

module.exports = {
  NATIVE_ETH_SENTINEL,
  ZERO_ADDRESS,
  DEFAULT_CONFIG,
  TIMEOUTS,
  GAS_CONFIG,
  DATABASE_CONFIG,
  API_CONFIG,
  SIGNATURE_CONFIG
}; 