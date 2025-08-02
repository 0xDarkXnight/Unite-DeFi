/**
 * Database models for Cross-Chain Dutch Auction System
 * 
 * DEPRECATED: This file is maintained for backward compatibility only.
 * All database operations now use Supabase through supabaseManager.
 * 
 * Models are now defined as Supabase tables:
 * - orders: Store order data, signatures, and auction parameters
 * - secrets: Store encrypted secrets for atomic swaps
 * - escrows: Store escrow contract information and status
 * 
 * Use supabaseManager methods instead:
 * - supabaseManager.createOrder()
 * - supabaseManager.getOrder()
 * - supabaseManager.createSecret()
 * - etc.
 */

console.error('⚠️  DEPRECATED: database/models.js is deprecated. Use supabaseManager instead.');

// Export null objects to catch usage of old model references
module.exports = {
  Order: null,
  Secret: null,  
  Escrow: null,
  Resolver: null,
  ResolverOperation: null,
  SystemMetrics: null
};