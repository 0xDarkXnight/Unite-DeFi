/**
 * API client for Cross-Chain Dutch Auction Backend
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_API_URL || 'http://localhost:3003';

export interface CreateOrderRequest {
  order: {
    salt: string;
    maker: string;
    receiver?: string;
    makerAsset: string;
    takerAsset: string;
    makingAmount: string;
    takingAmount: string;
    makerTraits: string;
  };
  signature: {
    r: string;
    vs: string;
  };
  auctionParams: {
    startTime: number;
    endTime: number;
    startPrice: string;
    endPrice: string;
  };
  crossChainData: {
    srcChainId: number;
    dstChainId: number;
    dstToken: string;
    dstAmount: string;
  };
  secret: string;
}

export interface OrderResponse {
  success: boolean;
  data?: {
    orderId: string;
    orderHash: string;
    status: string;
    auctionStartTime: number;
    auctionEndTime: number;
    currentPrice: string;
  };
  error?: string;
  details?: unknown[];
  timestamp: number;
}

export interface Order {
  orderId: string;
  orderHash: string;
  order: {
    salt: string;
    maker: string;
    receiver?: string;
    makerAsset: string;
    takerAsset: string;
    makingAmount: string;
    takingAmount: string;
    makerTraits: string;
  };
  auctionParams: {
    startTime: number;
    endTime: number;
    startPrice: string;
    endPrice: string;
    duration: number;
  };
  crossChainData: {
    srcChainId: number;
    dstChainId: number;
    dstToken: string;
    dstAmount: string;
    hashlock: string;
  };
  status: 'active' | 'filled' | 'expired' | 'cancelled';
  currentPrice: string;
  lastPriceUpdate: number;
  createdAt: number;
}

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const defaultHeaders = {
      'Content-Type': 'application/json',
    };

    const config: RequestInit = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        throw new ApiError(
          data.error || `HTTP error! status: ${response.status}`,
          response.status,
          data.details
        );
      }

      return data;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      
      // Network or other errors
      throw new ApiError(
        error instanceof Error ? error.message : 'Unknown error occurred',
        0
      );
    }
  }

  // Order Management
  async createOrder(orderData: CreateOrderRequest): Promise<OrderResponse> {
    return this.request<OrderResponse>('/api/orders', {
      method: 'POST',
      body: JSON.stringify(orderData),
    });
  }

  async getOrders(params?: {
    status?: 'active' | 'filled' | 'expired' | 'cancelled';
    maker?: string;
    srcChainId?: number;
    dstChainId?: number;
    page?: number;
    limit?: number;
    sortBy?: 'createdAt' | 'currentPrice' | 'filledAt';
    sortOrder?: 'asc' | 'desc';
  }): Promise<{
    success: boolean;
    data?: {
      orders: Order[];
      pagination: {
        page: number;
        limit: number;
        totalCount: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
      };
    };
    error?: string;
    timestamp: number;
  }> {
    const searchParams = new URLSearchParams();
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, value.toString());
        }
      });
    }

    const queryString = searchParams.toString();
    const endpoint = `/api/orders${queryString ? `?${queryString}` : ''}`;
    
    return this.request(endpoint);
  }

  async getOrder(orderId: string): Promise<{
    success: boolean;
    data?: Order;
    error?: string;
    timestamp: number;
  }> {
    return this.request(`/api/orders/${orderId}`);
  }

  async getOrderStatus(orderId: string): Promise<{
    success: boolean;
    data?: {
      orderId: string;
      status: string;
      currentPrice: string;
      lastPriceUpdate: number;
      escrows?: {
        src?: { address: string; status: string; txHash?: string };
        dst?: { address: string; status: string; txHash?: string };
      };
      resolver?: {
        address: string;
        filledAt: number;
        fillTxHash: string;
      };
    };
    error?: string;
    timestamp: number;
  }> {
    return this.request(`/api/orders/${orderId}/status`);
  }

  // System Info
  async getSystemHealth(): Promise<{
    success: boolean;
    data?: {
      status: string;
      timestamp: number;
      services: {
        api: { status: string; uptime: number };
        database: { status: string; type: string };
        blockchain: { [chainId: string]: { status: string; blockNumber?: number } };
      };
      version: string;
    };
    error?: string;
    timestamp: number;
  }> {
    return this.request('/api/system/health');
  }

  async getSupportedChains(): Promise<{
    success: boolean;
    data?: {
      chains: Array<{
        chainId: number;
        name: string;
        nativeCurrency: { name: string; symbol: string; decimals: number };
        rpcUrl: string;
        contracts: {
          limitOrderProtocol: string;
          dutchAuctionCalculator: string;
          escrowFactory: string;
          weth: string;
        };
      }>;
    };
    error?: string;
    timestamp: number;
  }> {
    return this.request('/api/system/chains');
  }
}

// Create singleton instance
export const apiClient = new ApiClient();

// Export for convenience
export { ApiError };