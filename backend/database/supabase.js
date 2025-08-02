/**
 * Supabase client and database operations
 * Replaces MongoDB/Redis with PostgreSQL
 */

const { createClient } = require('@supabase/supabase-js');

class SupabaseManager {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  /**
   * Initialize Supabase connection
   */
  async connect() {
    try {
      // Use single connection string from environment
      const supabaseConnectionString = process.env.SUPABASE_CONNECTION_STRING;
      
      if (!supabaseConnectionString || 
          supabaseConnectionString.includes('your-connection-string') || 
          supabaseConnectionString.startsWith('mock://')) {
        console.log('🔧 Using in-memory database (mock mode)');
        this.mockMode = true;
        this.initMockData();
        this.isConnected = true;
        return { success: true, mode: 'mock' };
      }

      console.log('🔌 Connecting to Supabase...');
      
      // Parse connection string to extract URL and key
      // Expected format: https://project-id.supabase.co?key=anon-key
      const url = new URL(supabaseConnectionString);
      const supabaseUrl = `${url.protocol}//${url.host}`;
      const supabaseKey = url.searchParams.get('key');
      
      if (!supabaseKey) {
        throw new Error('Supabase connection string must include key parameter');
      }
      
      this.client = createClient(supabaseUrl, supabaseKey);
      
      // Test connection
      const { data, error } = await this.client
        .from('orders')
        .select('count', { count: 'exact', head: true });
      
      if (error && error.code === 'PGRST116') {
        // Table doesn't exist, we'll create schema
        console.log('📋 Creating database schema...');
        await this.createSchema();
      } else if (error) {
        throw error;
      }
      
      this.isConnected = true;
      console.log('✅ Supabase connected successfully');
      
      return { success: true, mode: 'supabase' };
      
    } catch (error) {
      console.error('❌ Supabase connection failed, using in-memory fallback:', error.message);
      this.mockMode = true;
      this.initMockData();
      this.isConnected = true;
      return { success: true, mode: 'mock' };
    }
  }

  /**
   * Disconnect from Supabase
   */
  async disconnect() {
    try {
      if (this.client) {
        // Supabase client doesn't require explicit disconnection
        this.client = null;
      }
      this.isConnected = false;
      this.mockMode = false;
      console.log('✅ Supabase disconnected successfully');
    } catch (error) {
      console.error('❌ Error disconnecting from Supabase:', error);
    }
  }

  /**
   * Initialize mock data for development
   */
  initMockData() {
    this.mockData = {
      orders: new Map(),
      secrets: new Map(),
      escrows: new Map()
    };
  }

  /**
   * Create database schema
   */
  async createSchema() {
    if (this.mockMode) return;

    const schema = `
      -- Orders table
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        order_id VARCHAR(255) UNIQUE NOT NULL,
        order_hash VARCHAR(255) UNIQUE NOT NULL,
        
        -- Order data (JSON)
        order_data JSONB NOT NULL,
        signature JSONB NOT NULL,
        auction_params JSONB NOT NULL,
        cross_chain_data JSONB NOT NULL,
        
        -- Status and pricing
        status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'filled', 'expired', 'cancelled')),
        current_price VARCHAR(255),
        last_price_update BIGINT,
        
        -- Timestamps
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        filled_at TIMESTAMP WITH TIME ZONE,
        
        -- Indexes
        INDEX idx_orders_status (status),
        INDEX idx_orders_maker (((order_data->>'maker'))),
        INDEX idx_orders_src_chain (((cross_chain_data->>'srcChainId')::int)),
        INDEX idx_orders_dst_chain (((cross_chain_data->>'dstChainId')::int)),
        INDEX idx_orders_start_time (((auction_params->>'startTime')::bigint)),
        INDEX idx_orders_end_time (((auction_params->>'endTime')::bigint))
      );

      -- Secrets table
      CREATE TABLE IF NOT EXISTS secrets (
        id SERIAL PRIMARY KEY,
        order_id VARCHAR(255) NOT NULL REFERENCES orders(order_id),
        user_address VARCHAR(255) NOT NULL,
        encrypted_secret TEXT NOT NULL,
        hashlock VARCHAR(255) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'revealed', 'cancelled')),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        
        INDEX idx_secrets_order_id (order_id),
        INDEX idx_secrets_user_address (user_address),
        INDEX idx_secrets_hashlock (hashlock)
      );

      -- Escrows table
      CREATE TABLE IF NOT EXISTS escrows (
        id SERIAL PRIMARY KEY,
        order_id VARCHAR(255) NOT NULL REFERENCES orders(order_id),
        type VARCHAR(10) NOT NULL CHECK (type IN ('src', 'dst')),
        chain_id INTEGER NOT NULL,
        address VARCHAR(255) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'deployed', 'funded', 'withdrawn', 'cancelled')),
        transaction_hash VARCHAR(255),
        block_number BIGINT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        
        INDEX idx_escrows_order_id (order_id),
        INDEX idx_escrows_type (type),
        INDEX idx_escrows_chain_id (chain_id),
        INDEX idx_escrows_status (status)
      );

      -- Update timestamps trigger
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ language 'plpgsql';

      CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

      CREATE TRIGGER update_escrows_updated_at BEFORE UPDATE ON escrows
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    `;

    // Note: This would require admin privileges, so in practice you'd run this manually
    // For now, we'll log the schema and expect it to be created externally
    console.log('📋 Database schema (run this in Supabase SQL editor):');
    console.log(schema);
  }

  /**
   * Orders operations
   */
  async createOrder(orderData) {
    if (this.mockMode) {
      const id = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const order = {
        ...orderData,
        id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      this.mockData.orders.set(orderData.orderId, order);
      return order;
    }

    const { data, error } = await this.client
      .from('orders')
      .insert({
        order_id: orderData.orderId,
        order_hash: orderData.orderHash,
        order_data: orderData.order,
        signature: orderData.signature,
        auction_params: orderData.auctionParams,
        cross_chain_data: orderData.crossChainData,
        status: orderData.status,
        current_price: orderData.currentPrice,
        last_price_update: orderData.lastPriceUpdate
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getOrder(orderId) {
    if (this.mockMode) {
      return this.mockData.orders.get(orderId) || null;
    }

    const { data, error } = await this.client
      .from('orders')
      .select('*')
      .eq('order_id', orderId)
      .single();

    if (error && error.code === 'PGRST116') return null;
    if (error) throw error;
    return data;
  }

  async getOrders(filters = {}, pagination = {}) {
    if (this.mockMode) {
      let orders = Array.from(this.mockData.orders.values());
      
      // Apply filters
      if (filters.status) {
        orders = orders.filter(o => o.status === filters.status);
      }
      if (filters.maker) {
        orders = orders.filter(o => o.order_data?.maker?.toLowerCase() === filters.maker.toLowerCase());
      }
      if (filters.srcChainId) {
        orders = orders.filter(o => o.cross_chain_data?.srcChainId === filters.srcChainId);
      }
      if (filters.dstChainId) {
        orders = orders.filter(o => o.cross_chain_data?.dstChainId === filters.dstChainId);
      }

      // Apply pagination
      const { page = 1, limit = 20 } = pagination;
      const start = (page - 1) * limit;
      const paginatedOrders = orders.slice(start, start + limit);

      return {
        orders: paginatedOrders,
        totalCount: orders.length
      };
    }

    let query = this.client.from('orders').select('*', { count: 'exact' });
    
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.maker) {
      query = query.eq('order_data->>maker', filters.maker.toLowerCase());
    }
    if (filters.srcChainId) {
      query = query.eq('cross_chain_data->>srcChainId', filters.srcChainId.toString());
    }
    if (filters.dstChainId) {
      query = query.eq('cross_chain_data->>dstChainId', filters.dstChainId.toString());
    }

    // Pagination
    const { page = 1, limit = 20, sortBy = 'created_at', sortOrder = 'desc' } = pagination;
    const start = (page - 1) * limit;
    const end = start + limit - 1;

    query = query
      .order(sortBy, { ascending: sortOrder === 'asc' })
      .range(start, end);

    const { data, error, count } = await query;
    
    if (error) throw error;
    
    return {
      orders: data || [],
      totalCount: count || 0
    };
  }

  async updateOrder(orderId, updates) {
    if (this.mockMode) {
      const order = this.mockData.orders.get(orderId);
      if (!order) return null;
      
      const updatedOrder = {
        ...order,
        ...updates,
        updated_at: new Date().toISOString()
      };
      this.mockData.orders.set(orderId, updatedOrder);
      return updatedOrder;
    }

    const { data, error } = await this.client
      .from('orders')
      .update(updates)
      .eq('order_id', orderId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Secrets operations
   */
  async createSecret(secretData) {
    if (this.mockMode) {
      const id = `secret_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const secret = {
        ...secretData,
        id,
        created_at: new Date().toISOString()
      };
      this.mockData.secrets.set(secretData.orderId, secret);
      return secret;
    }

    const { data, error } = await this.client
      .from('secrets')
      .insert({
        order_id: secretData.orderId,
        user_address: secretData.userAddress,
        encrypted_secret: secretData.encryptedSecret,
        hashlock: secretData.hashlock,
        status: secretData.status
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getSecret(orderId) {
    if (this.mockMode) {
      return this.mockData.secrets.get(orderId) || null;
    }

    const { data, error } = await this.client
      .from('secrets')
      .select('*')
      .eq('order_id', orderId)
      .single();

    if (error && error.code === 'PGRST116') return null;
    if (error) throw error;
    return data;
  }

  async updateSecret(orderId, updates) {
    if (this.mockMode) {
      const secret = this.mockData.secrets.get(orderId);
      if (!secret) return null;
      
      const updatedSecret = {
        ...secret,
        ...updates,
        updated_at: new Date().toISOString()
      };
      this.mockData.secrets.set(orderId, updatedSecret);
      return updatedSecret;
    }

    const { data, error } = await this.client
      .from('secrets')
      .update(updates)
      .eq('order_id', orderId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Get escrows with filters
   */
  async getEscrows(filters = {}, pagination = {}) {
    if (this.mockMode) {
      // Return mock escrows
      const mockEscrows = Array.from(this.mockData.escrows.values());
      return { escrows: mockEscrows };
    }

    try {
      const { data, error } = await this.client
        .from('escrows')
        .select('*')
        .limit(pagination.limit || 100);

      if (error) throw error;
      return { escrows: data || [] };
    } catch (error) {
      console.error('❌ Error getting escrows:', error);
      return { escrows: [] };
    }
  }

  /**
   * Cache operations (in-memory for now)
   */
  cache = new Map();

  async cacheGet(key) {
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) {
      return cached.value;
    }
    return null;
  }

  async cacheSet(key, value, ttl = 3600) {
    this.cache.set(key, {
      value,
      expires: Date.now() + (ttl * 1000)
    });
    return true;
  }

  async cacheDel(key) {
    this.cache.delete(key);
    return true;
  }

  /**
   * Health check
   */
  getStatus() {
    return {
      connected: this.isConnected,
      mode: this.mockMode ? 'mock' : 'supabase',
      timestamp: Date.now()
    };
  }
}

// Create singleton instance
const supabaseManager = new SupabaseManager();

module.exports = {
  supabaseManager,
  // Export cache functions for backward compatibility
  cacheGet: (key) => supabaseManager.cacheGet(key),
  cacheSet: (key, value, ttl) => supabaseManager.cacheSet(key, value, ttl),
  cacheDel: (key) => supabaseManager.cacheDel(key)
};