-- Migration: 001_create_swap_orders_table.sql
-- Create the main table for storing cross-chain swap orders

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enum for swap states
CREATE TYPE swap_state AS ENUM (
    'NEW',
    'ETH_LOCK_PENDING',
    'ETH_LOCKED',
    'SUI_LOCK_PENDING',
    'SUI_LOCKED',
    'READY_FOR_SECRET',
    'SECRET_RECEIVED',
    'EXECUTED',
    'REFUNDED',
    'CANCELLED_DST',
    'CANCELLED_SRC',
    'ERROR'
);

-- Main table for swap orders
CREATE TABLE swap_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_hash BYTEA NOT NULL UNIQUE,
    quote_id VARCHAR(255) NOT NULL,
    state swap_state NOT NULL DEFAULT 'NEW',
    
    -- Order details
    maker BYTEA NOT NULL,
    maker_sui_address VARCHAR(255) NOT NULL,
    receiver BYTEA NOT NULL,
    maker_asset BYTEA NOT NULL,
    taker_asset BYTEA NOT NULL,
    making_amount NUMERIC(78, 0) NOT NULL, -- Support up to 256-bit numbers
    taking_amount NUMERIC(78, 0) NOT NULL,
    
    -- Swap specific data
    secret BYTEA,
    secret_hash BYTEA NOT NULL,
    
    -- Timeouts
    deadline_src TIMESTAMP WITH TIME ZONE NOT NULL,
    deadline_dst TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Contract addresses and IDs
    escrow_src BYTEA,
    escrow_dst VARCHAR(255), -- Sui object ID
    
    -- Transaction hashes
    eth_fill_tx BYTEA,
    sui_create_tx VARCHAR(255),
    eth_withdraw_tx BYTEA,
    sui_withdraw_tx VARCHAR(255),
    
    -- Safety deposits (stored as numeric to handle big integers)
    eth_safety_deposit NUMERIC(78, 0),
    sui_safety_deposit NUMERIC(78, 0),
    
    -- Original order and signature for reference
    original_order JSONB NOT NULL,
    signature TEXT NOT NULL,
    extension TEXT NOT NULL,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    -- Error information
    error_message TEXT
);

-- Indexes for performance
CREATE INDEX idx_swap_orders_order_hash ON swap_orders(order_hash);
CREATE INDEX idx_swap_orders_state ON swap_orders(state);
CREATE INDEX idx_swap_orders_maker ON swap_orders(maker);
CREATE INDEX idx_swap_orders_created_at ON swap_orders(created_at);
CREATE INDEX idx_swap_orders_deadline_src ON swap_orders(deadline_src);
CREATE INDEX idx_swap_orders_deadline_dst ON swap_orders(deadline_dst);
CREATE INDEX idx_swap_orders_quote_id ON swap_orders(quote_id);

-- Partial indexes for common queries
CREATE INDEX idx_swap_orders_active_states ON swap_orders(state, created_at) 
WHERE state IN ('NEW', 'ETH_LOCK_PENDING', 'ETH_LOCKED', 'SUI_LOCK_PENDING', 'SUI_LOCKED', 'READY_FOR_SECRET', 'SECRET_RECEIVED');

-- Function to automatically update the updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at
CREATE TRIGGER update_swap_orders_updated_at 
    BEFORE UPDATE ON swap_orders 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Table for tracking timeout events (for scheduler)
CREATE TABLE timeout_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES swap_orders(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL, -- 'SRC_TIMEOUT', 'DST_TIMEOUT'
    scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
    executed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_timeout_events_scheduled_at ON timeout_events(scheduled_at);
CREATE INDEX idx_timeout_events_order_id ON timeout_events(order_id);
CREATE INDEX idx_timeout_events_type ON timeout_events(event_type);

-- Table for storing relayer configuration and metrics
CREATE TABLE relayer_metrics (
    id SERIAL PRIMARY KEY,
    metric_name VARCHAR(100) NOT NULL,
    metric_value NUMERIC,
    metadata JSONB,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_relayer_metrics_name_time ON relayer_metrics(metric_name, timestamp);

-- Insert initial metrics
INSERT INTO relayer_metrics (metric_name, metric_value, metadata) VALUES
('orders_processed', 0, '{"description": "Total orders processed by the relayer"}'),
('successful_swaps', 0, '{"description": "Total successful cross-chain swaps"}'),
('failed_swaps', 0, '{"description": "Total failed cross-chain swaps"}'),
('eth_transactions', 0, '{"description": "Total Ethereum transactions sent"}'),
('sui_transactions', 0, '{"description": "Total Sui transactions sent"}'); 