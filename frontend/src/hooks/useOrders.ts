/**
 * React hooks for order management
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { apiClient, CreateOrderRequest, Order, ApiError } from '@/lib/api';

// Query Keys
export const orderKeys = {
  all: ['orders'] as const,
  lists: () => [...orderKeys.all, 'list'] as const,
  list: (filters: Record<string, unknown>) => [...orderKeys.lists(), filters] as const,
  details: () => [...orderKeys.all, 'detail'] as const,
  detail: (id: string) => [...orderKeys.details(), id] as const,
  status: (id: string) => [...orderKeys.detail(id), 'status'] as const,
};

// Get Orders Hook
export function useOrders(params?: {
  status?: 'active' | 'filled' | 'expired' | 'cancelled';
  srcChainId?: number;
  dstChainId?: number;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'currentPrice' | 'filledAt';
  sortOrder?: 'asc' | 'desc';
}) {
  const { address } = useAccount();
  
  return useQuery({
    queryKey: orderKeys.list({ ...params, maker: address }),
    queryFn: () => apiClient.getOrders({ ...params, maker: address }),
    enabled: !!address,
    refetchInterval: 5000, // Refetch every 5 seconds for real-time updates
    staleTime: 1000, // Consider data stale after 1 second
  });
}

// Get Single Order Hook
export function useOrder(orderId: string | undefined) {
  return useQuery({
    queryKey: orderKeys.detail(orderId || ''),
    queryFn: () => apiClient.getOrder(orderId!),
    enabled: !!orderId,
    refetchInterval: 2000, // Frequent updates for active orders
  });
}

// Get Order Status Hook (for real-time price updates)
export function useOrderStatus(orderId: string | undefined) {
  return useQuery({
    queryKey: orderKeys.status(orderId || ''),
    queryFn: () => apiClient.getOrderStatus(orderId!),
    enabled: !!orderId,
    refetchInterval: 1000, // Every second for price updates
    staleTime: 500,
  });
}

// Create Order Hook
export function useCreateOrder() {
  const queryClient = useQueryClient();
  const { address } = useAccount();

  return useMutation({
    mutationFn: async (orderData: CreateOrderRequest) => {
      if (!address) {
        throw new Error('Wallet not connected');
      }
      
      return apiClient.createOrder(orderData);
    },
    onSuccess: (data) => {
      // Invalidate and refetch orders
      queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
      
      // If we have the order ID, prefetch its details
      if (data.data?.orderId) {
        queryClient.setQueryData(
          orderKeys.detail(data.data.orderId),
          { success: true, data: data.data, timestamp: Date.now() }
        );
      }
    },
    onError: (error: ApiError) => {
      console.error('Failed to create order:', error);
    },
  });
}

// Get Active Dutch Auctions Hook
export function useActiveAuctions(chainId?: number) {
  return useQuery({
    queryKey: orderKeys.list({ status: 'active', srcChainId: chainId }),
    queryFn: () => apiClient.getOrders({ 
      status: 'active', 
      srcChainId: chainId,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      limit: 50
    }),
    refetchInterval: 3000,
  });
}

// Get User's Order History Hook
export function useOrderHistory() {
  const { address } = useAccount();
  
  return useQuery({
    queryKey: orderKeys.list({ maker: address, sortBy: 'createdAt', sortOrder: 'desc' }),
    queryFn: () => apiClient.getOrders({
      maker: address,
      sortBy: 'createdAt',
      sortOrder: 'desc',
      limit: 100
    }),
    enabled: !!address,
    refetchInterval: 10000, // Less frequent for history
  });
}

// Utility Hook for Real-time Price Updates
export function useDutchAuctionPrice(order: Order | undefined) {
  const calculateCurrentPrice = (order: Order): string => {
    if (!order || order.status !== 'active') return order?.currentPrice || '0';
    
    const now = Math.floor(Date.now() / 1000);
    const { startTime, endTime, startPrice, endPrice } = order.auctionParams;
    
    if (now < startTime) return startPrice;
    if (now >= endTime) return endPrice;
    
    const timeElapsed = now - startTime;
    const totalDuration = endTime - startTime;
    const progress = timeElapsed / totalDuration;
    
    // Linear interpolation (matching backend logic)
    const startPriceNum = parseFloat(startPrice);
    const endPriceNum = parseFloat(endPrice);
    const currentPrice = startPriceNum - (startPriceNum - endPriceNum) * progress;
    
    return currentPrice.toString();
  };

  return {
    currentPrice: order ? calculateCurrentPrice(order) : '0',
    progress: order ? Math.min(1, Math.max(0, 
      (Math.floor(Date.now() / 1000) - order.auctionParams.startTime) / 
      (order.auctionParams.endTime - order.auctionParams.startTime)
    )) : 0,
    timeRemaining: order ? Math.max(0, order.auctionParams.endTime - Math.floor(Date.now() / 1000)) : 0,
    isActive: order?.status === 'active' && 
             Math.floor(Date.now() / 1000) >= order.auctionParams.startTime &&
             Math.floor(Date.now() / 1000) < order.auctionParams.endTime,
  };
}