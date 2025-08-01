/**
 * Order History Component - Shows user's Dutch auction orders
 */

'use client';

import React from 'react';
import { useAccount } from 'wagmi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useOrders } from '@/hooks/useOrders';
import { Clock, TrendingDown, CheckCircle, XCircle, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Order } from '@/lib/api';

const OrderCard: React.FC<{ order: Order }> = ({ order }) => {
  // Simplified price calculation for Dutch auction
  const calculateCurrentPrice = () => {
    const now = Math.floor(Date.now() / 1000);
    const { startTime, endTime, startPrice, endPrice } = order.auctionParams;
    
    if (now < startTime) return startPrice;
    if (now >= endTime) return endPrice;
    
    const progress = (now - startTime) / (endTime - startTime);
    const priceRange = parseFloat(endPrice) - parseFloat(startPrice);
    return (parseFloat(startPrice) + progress * priceRange).toString();
  };

  const currentPrice = calculateCurrentPrice();
  const now = Math.floor(Date.now() / 1000);
  const isActive = order.status === 'active' && now >= order.auctionParams.startTime && now < order.auctionParams.endTime;
  const timeRemaining = Math.max(0, order.auctionParams.endTime - now);
  const progress = Math.min(100, Math.max(0, ((now - order.auctionParams.startTime) / (order.auctionParams.endTime - order.auctionParams.startTime)) * 100));
  
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-orange-400';
      case 'filled': return 'text-green-400';
      case 'expired': return 'text-red-400';
      case 'cancelled': return 'text-gray-400';
      default: return 'text-neutral-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <Clock className="w-4 h-4" />;
      case 'filled': return <CheckCircle className="w-4 h-4" />;
      case 'expired': case 'cancelled': return <XCircle className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const formatTimeRemaining = (seconds: number) => {
    if (seconds <= 0) return 'Ended';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-neutral-900/60 rounded-xl border border-neutral-800/50 p-4 hover:bg-neutral-900/80 transition-all duration-300"
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center space-x-2">
          <div className={`flex items-center space-x-1 ${getStatusColor(order.status)}`}>
            {getStatusIcon(order.status)}
            <span className="text-sm font-medium capitalize">{order.status}</span>
          </div>
        </div>
        <div className="text-xs text-neutral-500 font-[family-name:var(--font-spline-sans-mono)]">
          {formatTime(order.createdAt)}
        </div>
      </div>

      {/* Order Details */}
      <div className="grid grid-cols-2 gap-4 mb-3">
        <div>
          <div className="text-xs text-neutral-400 mb-1">From</div>
          <div className="text-sm font-medium">
            {(parseFloat(order.order.makingAmount) / 1e18).toFixed(4)} ETH
          </div>
          <div className="text-xs text-neutral-500">Chain {order.crossChainData.srcChainId}</div>
        </div>
        <div>
          <div className="text-xs text-neutral-400 mb-1">To</div>
          <div className="text-sm font-medium">
            {order.crossChainData.dstAmount} USDC
          </div>
          <div className="text-xs text-neutral-500">Chain {order.crossChainData.dstChainId}</div>
        </div>
      </div>

      {/* Dutch Auction Progress */}
      {order.status === 'active' && isActive && (
        <div className="mb-3">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-neutral-400">Auction Progress</span>
            <span className="text-xs text-orange-400">
              {formatTimeRemaining(timeRemaining)} remaining
            </span>
          </div>
          <div className="w-full bg-neutral-800 rounded-full h-2">
            <div 
              className="bg-gradient-to-r from-orange-600 to-yellow-600 h-2 rounded-full transition-all duration-1000"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <div className="flex justify-between items-center mt-1 text-xs">
            <span className="text-neutral-500">
              Start: {(parseFloat(order.auctionParams.startPrice) / 1e18).toFixed(4)}
            </span>
            <span className="text-orange-400 font-medium">
              Current: {(parseFloat(currentPrice) / 1e18).toFixed(4)}
            </span>
            <span className="text-neutral-500">
              End: {(parseFloat(order.auctionParams.endPrice) / 1e18).toFixed(4)}
            </span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-between items-center pt-2 border-t border-neutral-800/50">
        <div className="text-xs text-neutral-500 font-[family-name:var(--font-spline-sans-mono)]">
          ID: {order.orderId.slice(0, 8)}...
        </div>
        <button className="text-xs text-orange-400 hover:text-orange-300 flex items-center space-x-1 transition-colors">
          <span>View Details</span>
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>
    </motion.div>
  );
};

export const OrderHistory: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { data: ordersResponse, isLoading, error } = useOrders({ maker: address });
  const orders = ordersResponse?.data || [];

  if (!isConnected) {
    return (
      <Card className="bg-black/60 border-neutral-800/50">
        <CardContent className="p-6 text-center">
          <div className="text-neutral-400">Connect your wallet to view order history</div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="bg-black/60 border-neutral-800/50">
        <CardContent className="p-6">
          <div className="flex items-center justify-center space-x-2">
            <div className="w-4 h-4 border-2 border-orange-400/30 border-t-orange-400 rounded-full animate-spin" />
            <span className="text-neutral-400">Loading order history...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="bg-black/60 border-neutral-800/50">
        <CardContent className="p-6 text-center">
          <div className="text-red-400">Failed to load order history</div>
          <div className="text-neutral-500 text-sm mt-1">
            {error instanceof Error ? error.message : 'Unknown error'}
          </div>
        </CardContent>
      </Card>
    );
  }

  const orders = ordersData?.data?.orders || [];

  return (
    <Card className="bg-black/60 border-neutral-800/50">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <TrendingDown className="w-5 h-5 text-orange-400" />
          <span>Order History</span>
        </CardTitle>
        <div className="text-sm text-neutral-400">
          {orders.length} order{orders.length !== 1 ? 's' : ''} found
        </div>
      </CardHeader>
      <CardContent>
        {orders.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-neutral-400 mb-2">No orders found</div>
            <div className="text-neutral-500 text-sm">
              Create your first Dutch auction order to see it here
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <OrderCard key={order.orderId} order={order} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default OrderHistory;