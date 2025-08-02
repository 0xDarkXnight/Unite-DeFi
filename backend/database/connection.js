/**
 * Database connection management - Supabase only
 */

const { supabaseManager } = require('./supabase');

// Simple wrapper for backward compatibility
class DatabaseManager {
  constructor() {
    this.isConnected = false;
  }

  async connect() {
    try {
      const result = await supabaseManager.connect();
      this.isConnected = result.success;
      return result;
    } catch (error) {
      console.error('❌ Database connection failed:', error);
      this.isConnected = false;
      return { success: false, error: error.message };
    }
  }

  async disconnect() {
    try {
      await supabaseManager.disconnect();
      this.isConnected = false;
      console.log('✅ Database connection closed');
    } catch (error) {
      console.error('❌ Error closing database connection:', error);
    }
  }

  isHealthy() {
    return this.isConnected && supabaseManager.isConnected;
  }

  getStatus() {
    return supabaseManager.getStatus();
  }
}

// Create singleton instance
const databaseManager = new DatabaseManager();

// Export database utilities with retry functionality
const withRetry = async (operation, retries = 3, delay = 1000) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error) {
      console.error(`Operation failed (attempt ${i + 1}/${retries}):`, error.message);
      
      if (i === retries - 1) {
        throw error;
      }
      
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
};

// Cache operations through Supabase manager
const cacheGet = async (key) => {
  try {
    return await supabaseManager.cacheGet(key);
  } catch (error) {
    console.error('Cache get error:', error);
    return null;
  }
};

const cacheSet = async (key, value, ttl = 3600) => {
  try {
    return await supabaseManager.cacheSet(key, value, ttl);
  } catch (error) {
    console.error('Cache set error:', error);
    return false;
  }
};

const cacheDel = async (key) => {
  try {
    return await supabaseManager.cacheDel(key);
  } catch (error) {
    console.error('Cache delete error:', error);
    return false;
  }
};

module.exports = {
  databaseManager,
  withRetry,
  cacheGet,
  cacheSet,
  cacheDel
};