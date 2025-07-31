/**
 * Database connection management
 */

const mongoose = require('mongoose');
const redis = require('redis');
const { config } = require('../config');

class DatabaseManager {
  constructor() {
    this.mongoConnection = null;
    this.redisClient = null;
    this.isConnected = false;
  }

  /**
   * Initialize MongoDB connection
   */
  async connectMongoDB() {
    try {
      console.log('🔌 Connecting to MongoDB...');
      
      this.mongoConnection = await mongoose.connect(
        config.database.mongodb.uri,
        config.database.mongodb.options
      );

      // Connection event handlers
      mongoose.connection.on('connected', () => {
        console.log('✅ MongoDB connected successfully');
      });

      mongoose.connection.on('error', (error) => {
        console.error('❌ MongoDB connection error:', error);
      });

      mongoose.connection.on('disconnected', () => {
        console.log('📤 MongoDB disconnected');
      });

      // Graceful shutdown
      process.on('SIGINT', async () => {
        await mongoose.connection.close();
        console.log('📤 MongoDB connection closed through app termination');
        process.exit(0);
      });

      return this.mongoConnection;
      
    } catch (error) {
      console.error('❌ MongoDB connection failed:', error);
      throw error;
    }
  }

  /**
   * Initialize Redis connection
   */
  async connectRedis() {
    try {
      console.log('🔌 Connecting to Redis...');
      
      this.redisClient = redis.createClient({
        host: config.database.redis.host,
        port: config.database.redis.port,
        password: config.database.redis.password,
        db: config.database.redis.db,
        keyPrefix: config.database.redis.keyPrefix,
        retryDelayOnFailover: 100,
        enableReadyCheck: false,
        maxRetriesPerRequest: null,
      });

      // Error handling
      this.redisClient.on('error', (error) => {
        console.error('❌ Redis connection error:', error);
      });

      this.redisClient.on('connect', () => {
        console.log('✅ Redis connected successfully');
      });

      this.redisClient.on('ready', () => {
        console.log('✅ Redis ready for operations');
      });

      this.redisClient.on('end', () => {
        console.log('📤 Redis connection ended');
      });

      await this.redisClient.connect();
      return this.redisClient;
      
    } catch (error) {
      console.error('❌ Redis connection failed:', error);
      throw error;
    }
  }

  /**
   * Initialize all database connections
   */
  async connect() {
    try {
      await Promise.all([
        this.connectMongoDB(),
        this.connectRedis()
      ]);
      
      this.isConnected = true;
      console.log('✅ All database connections established');
      
      return {
        mongo: this.mongoConnection,
        redis: this.redisClient
      };
      
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      throw error;
    }
  }

  /**
   * Close all database connections
   */
  async disconnect() {
    try {
      const promises = [];
      
      if (this.mongoConnection) {
        promises.push(mongoose.connection.close());
      }
      
      if (this.redisClient) {
        promises.push(this.redisClient.quit());
      }
      
      await Promise.all(promises);
      this.isConnected = false;
      console.log('✅ All database connections closed');
      
    } catch (error) {
      console.error('❌ Error closing database connections:', error);
      throw error;
    }
  }

  /**
   * Get MongoDB connection
   */
  getMongo() {
    if (!this.mongoConnection) {
      throw new Error('MongoDB not connected');
    }
    return this.mongoConnection;
  }

  /**
   * Get Redis client
   */
  getRedis() {
    if (!this.redisClient) {
      throw new Error('Redis not connected');
    }
    return this.redisClient;
  }

  /**
   * Check if databases are connected
   */
  isHealthy() {
    return this.isConnected && 
           mongoose.connection.readyState === 1 && 
           this.redisClient && 
           this.redisClient.isReady;
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      connected: this.isConnected,
      mongodb: {
        status: mongoose.connection.readyState,
        host: mongoose.connection.host,
        name: mongoose.connection.name
      },
      redis: {
        status: this.redisClient ? this.redisClient.status : 'disconnected',
        host: config.database.redis.host,
        port: config.database.redis.port
      }
    };
  }
}

// Create singleton instance
const databaseManager = new DatabaseManager();

// Export database utilities
const withRetry = async (operation, retries = 3, delay = 1000) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await operation();
    } catch (error) {
      console.warn(`Operation failed (attempt ${i + 1}/${retries}):`, error.message);
      
      if (i === retries - 1) {
        throw error;
      }
      
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
};

const cacheGet = async (key) => {
  try {
    const redis = databaseManager.getRedis();
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  } catch (error) {
    console.error('Cache get error:', error);
    return null;
  }
};

const cacheSet = async (key, value, ttl = 3600) => {
  try {
    const redis = databaseManager.getRedis();
    await redis.setEx(key, ttl, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error('Cache set error:', error);
    return false;
  }
};

const cacheDel = async (key) => {
  try {
    const redis = databaseManager.getRedis();
    await redis.del(key);
    return true;
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