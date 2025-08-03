'use client'
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount } from 'wagmi';
import { useCreateOrder } from '@/hooks/useOrders';
import Navigation from '@/components/Navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatTokenAmount } from '@/lib/utils';
// import { Progress } from '@/components/ui/progress';
import { 
  ArrowUpDown, 
  Settings, 
  ChevronDown, 
  RefreshCw,
  Check,
  Layers
} from 'lucide-react';

interface SwapState {
  fromToken: string;
  toToken: string;
  fromChain: string;
  toChain: string;
  fromAmount: string;
  slippage: string;
  isAdvanced: boolean;
  orderType: 'market' | 'limit';
  limitPrice: string;
}

interface TokenData {
  symbol: string;
  name: string;
  logo: string;
  balance: string;
  price: number;
  change24h: number;
  volume24h: string;
}

interface ChainData {
  name: string;
  symbol: string;
  color: string;
  logo: string;
  gasPrice: string;
  status: 'fast' | 'normal' | 'slow';
}

// Token Icon Components
const TokenIcon = ({ symbol, size = 24 }: { symbol: string; size?: number }) => {
  const getTokenIcon = () => {
    switch (symbol) {
      case 'ETH':
        return (
          <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="16" fill="#627EEA"/>
            <path d="M16.498 4v8.87l7.497 3.35L16.498 4z" fill="#FFFFFF" fillOpacity="0.602"/>
            <path d="M16.498 4L9 16.22l7.498-3.35V4z" fill="#FFFFFF"/>
            <path d="M16.498 21.968v6.027L24 17.616l-7.502 4.352z" fill="#FFFFFF" fillOpacity="0.602"/>
            <path d="M16.498 27.995v-6.028L9 17.616l7.498 10.38z" fill="#FFFFFF"/>
            <path d="M16.498 20.573l7.497-4.353-7.497-3.348v7.701z" fill="#FFFFFF" fillOpacity="0.2"/>
            <path d="M9 16.22l7.498 4.353v-7.701L9 16.22z" fill="#FFFFFF" fillOpacity="0.602"/>
          </svg>
        );
      case 'USDC':
        return (
          <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="16" fill="#2775CA"/>
            <path d="M15.75 27.5C9.26 27.5 4 22.24 4 15.75S9.26 4 15.75 4 27.5 9.26 27.5 15.75 22.24 27.5 15.75 27.5z" fill="#2775CA"/>
            <path d="M10.11 17.22c0-3.13 1.89-4.82 5.18-4.82 1.68 0 2.88.32 4.09 1.05l-.83 2.16c-.96-.58-1.89-.83-3.21-.83-1.63 0-2.42.71-2.42 2.34v.48c0 1.58.79 2.29 2.42 2.29 1.32 0 2.25-.25 3.21-.83l.83 2.16c-1.21.73-2.41 1.05-4.09 1.05-3.29 0-5.18-1.69-5.18-4.82v-.48z" fill="#FFFFFF"/>
          </svg>
        );
      case 'BTC':
        return (
          <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="16" fill="#F7931A"/>
            <path d="M23.189 14.02c.314-2.096-1.283-3.223-3.465-3.975l.708-2.84-1.728-.43-.69 2.765c-.454-.113-.92-.22-1.385-.326l.695-2.783L15.596 6l-.708 2.839c-.376-.086-.746-.17-1.104-.26l.002-.009-2.384-.595-.46 1.846s1.283.294 1.256.312c.7.175.826.638.805 1.006l-.806 3.235c.048.012.11.03.18.057l-.181-.045-1.13 4.532c-.086.212-.303.531-.793.41.018.025-1.256-.313-1.256-.313l-.858 1.978 2.25.561c.418.105.828.215 1.231.318l-.715 2.872 1.727.43.708-2.84c.472.127.93.245 1.378.357l-.706 2.828 1.728.43.715-2.866c2.948.558 5.164.333 6.097-2.333.752-2.146-.037-3.385-1.588-4.192 1.13-.26 1.98-1.003 2.207-2.538zm-3.95 5.538c-.533 2.147-4.148.986-5.32.695l.95-3.805c1.172.293 4.929.872 4.37 3.11zm.535-5.569c-.487 1.953-3.495.96-4.47.717l.86-3.45c.975.243 4.118.696 3.61 2.733z" fill="#FFFFFF"/>
          </svg>
        );
      case 'MATIC':
        return (
          <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="16" fill="#8247E5"/>
            <path d="M21.092 12.693c-.369-.215-.821-.215-1.19 0l-3.377 1.95-2.287 1.316-3.377 1.95c-.369.215-.821.215-1.19 0l-2.698-1.565c-.369-.215-.595-.611-.595-1.04V12.97c0-.429.226-.825.595-1.04l2.698-1.565c.369-.215.821-.215 1.19 0l2.698 1.565c.369.215.595.611.595 1.04v1.95l2.287-1.316v-1.95c0-.429-.226-.825-.595-1.04L12.238 8.069c-.369-.215-.821-.215-1.19 0l-5.857 3.386c-.369.215-.595.611-.595 1.04v6.772c0 .429.226.825.595 1.04l5.857 3.386c.369.215.821.215 1.19 0l3.377-1.95 2.287-1.316 3.377-1.95c.369-.215.821-.215 1.19 0l2.698 1.565c.369.215.595.611.595 1.04v3.234c0 .429-.226.825-.595 1.04l-2.698 1.565c-.369.215-.821.215-1.19 0l-2.698-1.565c-.369-.215-.595-.611-.595-1.04v-1.95l-2.287 1.316v1.95c0 .429.226.825.595 1.04l5.857 3.386c.369.215.821.215 1.19 0l5.857-3.386c.369-.215.595-.611.595-1.04v-6.772c0-.429-.226-.825-.595-1.04l-5.857-3.386z" fill="#FFFFFF"/>
          </svg>
        );
      case 'SOL':
        return (
          <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="16" fill="url(#solana-gradient)"/>
            <defs>
              <linearGradient id="solana-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#00FFA3"/>
                <stop offset="100%" stopColor="#DC1FFF"/>
              </linearGradient>
            </defs>
            <path d="M7.5 19.8c.2-.2.5-.3.8-.3h15.4c.6 0 .9.7.5 1.1l-3.2 3.2c-.2.2-.5.3-.8.3H4.8c-.6 0-.9-.7-.5-1.1l3.2-3.2zM7.5 8.7c.2-.2.5-.3.8-.3h15.4c.6 0 .9.7.5 1.1l-3.2 3.2c-.2.2-.5.3-.8.3H4.8c-.6 0-.9-.7-.5-1.1l3.2-3.2zM24.5 13.8c-.2-.2-.5-.3-.8-.3H8.3c-.6 0-.9.7-.5 1.1l3.2 3.2c.2.2.5.3.8.3h15.4c.6 0 .9-.7.5-1.1l-3.2-3.2z" fill="#FFFFFF"/>
          </svg>
        );
      case 'SUI':
        return (
          <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="16" fill="#4DA2FF"/>
            <path d="M16.5 6.5c-3.3 0-6 2.7-6 6v7c0 3.3 2.7 6 6 6s6-2.7 6-6v-7c0-3.3-2.7-6-6-6zm3 13c0 1.7-1.3 3-3 3s-3-1.3-3-3v-7c0-1.7 1.3-3 3-3s3 1.3 3 3v7z" fill="#FFFFFF"/>
            <circle cx="16.5" cy="14" r="2" fill="#4DA2FF"/>
          </svg>
        );
      case 'APT':
        return (
          <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="16" fill="#000000"/>
            <path d="M16 4L8 12h4v12h8V12h4L16 4z" fill="#FFFFFF"/>
            <circle cx="16" cy="16" r="2" fill="#00D4AA"/>
          </svg>
        );
      default:
        return (
          <div 
            className="rounded-full flex items-center justify-center text-white font-bold bg-neutral-600"
            style={{ width: size, height: size, fontSize: size * 0.4 }}
          >
            {symbol.charAt(0)}
          </div>
        );
    }
  };

  return getTokenIcon();
};

// Chain Icon Component
const ChainIcon = ({ name, size = 20 }: { name: string; size?: number }) => {
  const getChainIcon = () => {
    switch (name) {
      case 'Ethereum':
        return <TokenIcon symbol="ETH" size={size} />;
      case 'Polygon':
        return <TokenIcon symbol="MATIC" size={size} />;
      case 'Solana':
        return <TokenIcon symbol="SOL" size={size} />;
      case 'Sui':
        return <TokenIcon symbol="SUI" size={size} />;
      case 'Aptos':
        return <TokenIcon symbol="APT" size={size} />;
      case 'Arbitrum':
        return (
          <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="16" fill="#28A0F0"/>
            <path d="M16 6L8 20h4l4-8 4 8h4L16 6z" fill="#FFFFFF"/>
          </svg>
        );
      case 'Optimism':
        return (
          <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="16" fill="#FF0420"/>
            <path d="M12 10c-2.2 0-4 1.8-4 4s1.8 4 4 4h1c1.1 0 2-.9 2-2s-.9-2-2-2h-1c-.6 0-1-.4-1-1s.4-1 1-1h8c.6 0 1 .4 1 1s-.4 1-1 1h-1c-1.1 0-2 .9-2 2s.9 2 2 2h1c2.2 0 4-1.8 4-4s-1.8-4-4-4H12z" fill="#FFFFFF"/>
          </svg>
        );
      case 'BNB Chain':
        return (
          <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="16" fill="#F3BA2F"/>
            <path d="M12 10L16 6l4 4 4-4-8-2-8 2 4 4zm8 6l4-4v8l-4 4v-8zm-8 6l4 4 4-4 4 4-8 2-8-2 4-4zm-4-6v-8l4 4v8l-4-4z" fill="#FFFFFF"/>
          </svg>
        );
      default:
        return (
          <div 
            className="rounded-full flex items-center justify-center text-white font-bold bg-neutral-600"
            style={{ width: size, height: size, fontSize: size * 0.4 }}
          >
            {name.charAt(0)}
          </div>
        );
    }
  };

  return getChainIcon();
};

// Custom Dropdown Component
const CustomDropdown = ({ 
  value, 
  onChange, 
  options, 
  type = 'token',
  className = '' 
}: {
  value: string;
  onChange: (value: string) => void;
  options: (TokenData | ChainData)[];
  type?: 'token' | 'chain';
  className?: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const selectedOption = options.find(option => 
    type === 'token' ? option.symbol === value : option.name === value
  );

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-3 py-2 bg-neutral-800/50 border border-neutral-700/50 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500 transition-all duration-300 hover:bg-neutral-700/50 hover:border-neutral-600/50 flex items-center justify-between text-left ${
          isOpen ? 'ring-1 ring-orange-500 bg-neutral-700/50' : ''
        }`}
      >
        <div className="flex items-center space-x-2">
          {type === 'token' ? (
            <TokenIcon symbol={selectedOption?.symbol || value} size={18} />
          ) : (
            <ChainIcon name={selectedOption?.name || value} size={18} />
          )}
          <span className="text-white font-medium text-sm font-[family-name:var(--font-unbounded)]">
            {type === 'token' ? selectedOption?.symbol : selectedOption?.name}
          </span>
        </div>
        <ChevronDown className={`w-4 h-4 text-neutral-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-orange-400' : ''}`} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute top-full left-0 right-0 mt-1 bg-neutral-900/95 backdrop-blur-xl border border-neutral-700/50 rounded-lg shadow-2xl z-50 max-h-60 overflow-y-auto"
            style={{
              boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 10px 10px -5px rgb(0 0 0 / 0.04), 0 0 0 1px rgb(234 88 12 / 0.1)'
            }}
          >
            {options.map((option, index) => {
              const optionValue = type === 'token' ? option.symbol : option.name;
              const isSelected = optionValue === value;
              
              return (
                <motion.button
                  key={optionValue}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.03 }}
                  onClick={() => {
                    onChange(optionValue);
                    setIsOpen(false);
                  }}
                  className={`w-full px-3 py-3 flex items-center space-x-3 hover:bg-neutral-800/60 transition-all duration-200 group ${
                    index === 0 ? 'rounded-t-lg' : ''
                  } ${
                    index === options.length - 1 ? 'rounded-b-lg' : ''
                  } ${
                    isSelected ? 'bg-orange-600/20 border-l-2 border-orange-500' : ''
                  }`}
                >
                  <div className="flex-shrink-0">
                    {type === 'token' ? (
                      <TokenIcon symbol={option.symbol} size={20} />
                    ) : (
                      <ChainIcon name={option.name} size={20} />
                    )}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <div className={`text-white font-medium text-sm font-[family-name:var(--font-unbounded)] transition-colors duration-200 ${
                      isSelected ? 'text-orange-100' : 'group-hover:text-white'
                    }`}>
                      {type === 'token' ? option.symbol : option.name}
                    </div>
                    {type === 'token' && (
                      <div className="text-neutral-400 text-xs font-[family-name:var(--font-spline-sans-mono)] truncate group-hover:text-neutral-300 transition-colors duration-200">
                        {option.name}
                      </div>
                    )}
                    {type === 'chain' && (
                      <div className="text-neutral-400 text-xs font-[family-name:var(--font-spline-sans-mono)] group-hover:text-neutral-300 transition-colors duration-200">
                        {option.gasPrice}
                      </div>
                    )}
                  </div>
                  {isSelected && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    >
                      <Check className="w-4 h-4 text-orange-400 flex-shrink-0" />
                    </motion.div>
                  )}
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const SwapPage = () => {
  const { address, isConnected } = useAccount();
  const createOrderMutation = useCreateOrder();
  
  const [swapState, setSwapState] = useState<SwapState>({
    fromToken: 'ETH',
    toToken: 'USDC',
    fromChain: 'Ethereum',
    toChain: 'Sepolia',
    fromAmount: '',
    slippage: '0.5',
    isAdvanced: false,
    orderType: 'market',
    limitPrice: ''
  });

  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [estimatedOutput, setEstimatedOutput] = useState('');
  const [priceImpact, setPriceImpact] = useState('0.02');
  const [routeInfo, setRouteInfo] = useState<{
    exchangeRate: string;
    estimatedGas: string;
    minReceived: string;
  } | null>(null);

  // Available tokens - should be fetched from backend or chain config in production
  const tokens: TokenData[] = [
    { symbol: 'ETH', name: 'Ethereum', logo: 'ETH', balance: '0', price: 0, change24h: 0, volume24h: '' },
    { symbol: 'USDC', name: 'USD Coin', logo: 'USDC', balance: '0', price: 0, change24h: 0, volume24h: '' },
  ];

  const chains: ChainData[] = [
    { name: 'Ethereum', symbol: 'ETH', color: 'from-neutral-600 to-neutral-800', logo: 'ETH', gasPrice: '', status: 'normal' },
    { name: 'Sepolia', symbol: 'ETH', color: 'from-neutral-600 to-neutral-800', logo: 'ETH', gasPrice: '', status: 'fast' },
    { name: 'Sui', symbol: 'Sui', color: 'from-neutral-600 to-neutral-800', logo: '', gasPrice: '', status: 'fast' },
  ];

  const recentTransactions = [
    { type: 'swap', from: 'ETH', to: 'USDC', amount: '0.5', value: '$1,620', time: '2m ago', status: 'completed', hash: '0x1a2b3c...' },
    { type: 'bridge', from: 'USDC', to: 'USDC', amount: '500', value: '$500', time: '1h ago', status: 'completed', hash: '0x4d5e6f...', fromChain: 'Ethereum', toChain: 'Polygon' },
    { type: 'swap', from: 'SOL', to: 'SUI', amount: '10', value: '$1,802', time: '2h ago', status: 'completed', hash: '0x7g8h9i...' },
  ];

  const fromTokenData = tokens.find(t => t.symbol === swapState.fromToken);
  const toTokenData = tokens.find(t => t.symbol === swapState.toToken);
  const fromChainData = chains.find(c => c.name === swapState.fromChain);
  const toChainData = chains.find(c => c.name === swapState.toChain);

  // Calculate estimated output
  useEffect(() => {
    if (swapState.fromAmount && parseFloat(swapState.fromAmount) > 0) {
      // Simple 1:1 exchange rate for testing
      const inputAmount = parseFloat(swapState.fromAmount);
      const estimated = (inputAmount * 0.997); // 0.3% fee
      
      // Format based on the target token using utility function
      const formattedEstimated = formatTokenAmount(estimated, swapState.toToken);
      console.log(`Formatting estimated output: ${estimated} ${swapState.toToken} -> ${formattedEstimated}`);
      setEstimatedOutput(formattedEstimated);
      
      setRouteInfo({
        exchangeRate: '1.0',
        estimatedGas: '$12.50',
        minReceived: formatTokenAmount(estimated * 0.995, swapState.toToken)
      });
    } else {
      setEstimatedOutput('');
      setRouteInfo(null);
    }
  }, [swapState.fromAmount, swapState.toToken]);

  const handleSwap = async () => {
    if (!isConnected || !address) {
      console.error('Wallet not connected');
      return;
    }

    if (!swapState.fromAmount || parseFloat(swapState.fromAmount) <= 0) {
      console.error('Invalid amount');
      return;
    }

    setIsLoading(true);
    
    try {
      // Import order builder
      const { OrderBuilder } = await import('@/lib/orderBuilder');
      
      // Get chain IDs (convert chain names to IDs)
      const getChainId = (chainName: string): number => {
        const chainMap: Record<string, number> = {
          'ethereum': 1,
          'sepolia': 11155111
        };
        return chainMap[chainName.toLowerCase()] || 1;
      };

      const fromChainId = getChainId(swapState.fromChain);
      const toChainId = getChainId(swapState.toChain);

      // Validate swap parameters
      const swapParams = {
        fromToken: swapState.fromToken,
        toToken: swapState.toToken,
        fromChain: fromChainId,
        toChain: toChainId,
        fromAmount: swapState.fromAmount,
        toAmount: estimatedOutput || '0',
        maker: address,
        orderType: swapState.orderType,
        limitPrice: swapState.limitPrice,
        slippage: swapState.slippage,
        auctionDuration: 300 // 5 minutes
      };

      const validationErrors = OrderBuilder.validateSwapParams(swapParams);
      if (validationErrors.length > 0) {
        console.error('Validation errors:', validationErrors);
        alert('Validation failed: ' + validationErrors.join(', '));
        return;
      }

      // Get signer from wagmi
      const { getWalletClient } = await import('wagmi/actions');
      const { config } = await import('@/lib/wagmi');
      const walletClient = await getWalletClient(config);
      
      if (!walletClient) {
        throw new Error('No wallet client available');
      }

      // Convert viem wallet client to ethers signer
      const { ethers } = await import('ethers');
      
      // Check if we have ethereum provider
      if (!window.ethereum) {
        throw new Error('No Ethereum provider found. Please install MetaMask or another wallet.');
      }
      
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      
      // Check network
      const network = await provider.getNetwork();
      console.log('Current network:', network.name, 'Chain ID:', network.chainId);
      
      // Check balance (just for info, not blocking)
      try {
        const balance = await provider.getBalance(address);
        console.log('ETH Balance:', ethers.formatEther(balance), 'ETH');
        
        if (balance === BigInt(0)) {
          console.warn('⚠️ No ETH balance detected. You may need ETH for gas fees.');
        }
      } catch (balanceError) {
        console.warn('Could not check balance:', balanceError);
      }

      // Build the Dutch auction order
      console.log('Building Dutch auction order...');
      const orderRequest = await OrderBuilder.buildDutchAuctionOrder(swapParams, signer);

      console.log('Order built successfully:', orderRequest);

      // Create the order via hook
      const response = await createOrderMutation.mutateAsync(orderRequest);

      if (response.success && response.data) {
        console.log('✅ Order created successfully:', response.data);
        
        // Show success message
        alert(`Order created successfully! Order ID: ${response.data.orderId}`);
        
        // Reset form
        setSwapState(prev => ({ ...prev, fromAmount: '' }));
        setEstimatedOutput('');
        
      } else {
        throw new Error(response.error || 'Failed to create order');
      }

    } catch (error) {
      console.error('❌ Swap failed:', error);
      
      let errorMessage = 'Unknown error occurred';
      
      if (error instanceof Error) {
        errorMessage = error.message;
        
        // Handle specific error types
        if (error.message.includes('BytesLike')) {
          errorMessage = 'Invalid data format. Please try again.';
        } else if (error.message.includes('rejected')) {
          errorMessage = 'Transaction was rejected by user.';
        } else if (error.message.includes('insufficient funds')) {
          errorMessage = 'Insufficient funds for gas fees.';
        } else if (error.message.includes('network')) {
          errorMessage = 'Network error. Please check your connection and try again.';
        }
      }
      
      alert(`Swap failed: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const swapTokens = () => {
    setSwapState(prev => ({
      ...prev,
      fromToken: prev.toToken,
      toToken: prev.fromToken,
      fromChain: prev.toChain,
      toChain: prev.fromChain,
      fromAmount: estimatedOutput,
    }));
    setEstimatedOutput('');
  };

  return (
    <div className="min-h-screen text-white relative">
      {/* Background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-black via-neutral-950 to-black" />
        <div className="mesh-gradient-1 absolute inset-0" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
      </div>

      <Navigation />

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Centered Main Swap Interface */}
        <div className="flex justify-center">
          <div className="w-full max-w-2xl">
            {/* Header */}
            <div className="mb-6">
              <h1 className="text-3xl font-black gradient-text mb-2 font-[family-name:var(--font-unbounded)]">
                Cross-Chain Swap
              </h1>
            </div>

            {/* Order Type Selector */}
            <Card className="mb-6 bg-black/60 border-neutral-800/50">
              <CardContent className="p-4">
                <div className="flex space-x-2 bg-neutral-900/50 rounded-xl p-1">
                  <button
                    onClick={() => setSwapState(prev => ({ ...prev, orderType: 'market' }))}
                    className={`flex-1 py-2 px-3 rounded-lg font-medium transition-all duration-300 text-sm font-[family-name:var(--font-unbounded)] ${
                      swapState.orderType === 'market'
                        ? 'bg-orange-600 text-white shadow-lg'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    Market Order
                  </button>
                  <button
                    onClick={() => setSwapState(prev => ({ ...prev, orderType: 'limit' }))}
                    className={`flex-1 py-2 px-3 rounded-lg font-medium transition-all duration-300 text-sm font-[family-name:var(--font-unbounded)] ${
                      swapState.orderType === 'limit'
                        ? 'bg-orange-600 text-white shadow-lg'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    Limit Order
                  </button>
                </div>
              </CardContent>
            </Card>

            {/* Main Swap Card */}
            <Card className="mb-6 overflow-hidden bg-black/60 border-neutral-800/50">
              <div className="h-1 bg-gradient-to-r from-orange-600 to-yellow-600"></div>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <CardTitle className="flex items-center space-x-2 text-lg">
                  <Layers className="w-5 h-5 text-orange-400" />
                  <span>Swap Details</span>
                </CardTitle>
                <button 
                  onClick={() => setShowSettings(!showSettings)}
                  className="p-2 bg-neutral-800/50 hover:bg-neutral-700/50 rounded-lg transition-all duration-300"
                >
                  <Settings className="w-4 h-4" />
                </button>
              </CardHeader>

              {/* Settings Panel */}
              <AnimatePresence>
                {showSettings && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mx-6 mb-4 p-4 bg-neutral-900/60 rounded-xl border border-neutral-800/50">
                      <h3 className="text-base font-semibold mb-3 font-[family-name:var(--font-unbounded)]">Swap Settings</h3>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs text-neutral-400 mb-2 font-[family-name:var(--font-spline-sans-mono)]">Slippage Tolerance</label>
                          <div className="flex space-x-2">
                            {['0.1', '0.5', '1.0'].map((value) => (
                              <button
                                key={value}
                                onClick={() => setSwapState(prev => ({ ...prev, slippage: value }))}
                                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all duration-300 font-[family-name:var(--font-unbounded)] ${
                                  swapState.slippage === value 
                                    ? 'bg-orange-600 text-white' 
                                    : 'bg-neutral-800/50 text-neutral-300 hover:bg-neutral-700/50'
                                }`}
                              >
                                {value}%
                              </button>
                            ))}
                            <input
                              type="text"
                              value={swapState.slippage}
                              onChange={(e) => setSwapState(prev => ({ ...prev, slippage: e.target.value }))}
                              className="w-16 px-2 py-1 bg-neutral-800/50 border border-neutral-700/50 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-orange-500 font-[family-name:var(--font-spline-sans-mono)]"
                              placeholder="Custom"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-neutral-400 font-[family-name:var(--font-spline-sans-mono)]">Advanced Mode</span>
                          <button
                            onClick={() => setSwapState(prev => ({ ...prev, isAdvanced: !prev.isAdvanced }))}
                            className={`relative w-10 h-5 rounded-full transition-colors duration-300 ${
                              swapState.isAdvanced ? 'bg-orange-600' : 'bg-neutral-700'
                            }`}
                          >
                            <div className={`absolute w-4 h-4 bg-white rounded-full top-0.5 transition-transform duration-300 ${
                              swapState.isAdvanced ? 'translate-x-5' : 'translate-x-0.5'
                            }`} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <CardContent className="space-y-4 p-6">
                {/* From Token */}
                <div className="space-y-3">
                  <div className="bg-neutral-900/60 rounded-xl p-4 border border-neutral-800/50 hover:border-neutral-700/50 transition-all duration-300">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-neutral-400 text-xs font-medium font-[family-name:var(--font-spline-sans-mono)]">From</span>
                    </div>
                    
                    <div className="flex items-center space-x-3">
                      <div className="flex-1">
                        <input
                          type="text"
                          value={swapState.fromAmount}
                          onChange={(e) => setSwapState(prev => ({ ...prev, fromAmount: e.target.value }))}
                          placeholder="0.0"
                          className="w-full text-2xl font-bold bg-transparent border-none outline-none text-white placeholder-neutral-500 font-[family-name:var(--font-spline-sans-mono)]"
                        />
                      </div>
                      
                      <div className="flex flex-col space-y-2">
                        <CustomDropdown
                          value={swapState.fromChain}
                          onChange={(value) => setSwapState(prev => ({ ...prev, fromChain: value }))}
                          options={chains}
                          type="chain"
                        />
                        <CustomDropdown
                          value={swapState.fromToken}
                          onChange={(value) => setSwapState(prev => ({ ...prev, fromToken: value }))}
                          options={tokens}
                          type="token"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Swap Button */}
                  <div className="flex justify-center">
                    <button
                      onClick={swapTokens}
                      className="p-2 bg-neutral-800/50 hover:bg-neutral-700/50 rounded-lg border border-neutral-700/50 transition-all duration-300 group"
                    >
                      <ArrowUpDown className="w-4 h-4 text-orange-400 group-hover:rotate-180 transition-transform duration-500" />
                    </button>
                  </div>

                  {/* To Token */}
                  <div className="bg-neutral-900/60 rounded-xl p-4 border border-neutral-800/50 hover:border-neutral-700/50 transition-all duration-300">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-neutral-400 text-xs font-medium font-[family-name:var(--font-spline-sans-mono)]">To</span>
                    </div>
                    
                    <div className="flex items-center space-x-3">
                      <div className="flex-1">
                        <div className="text-2xl font-bold text-white font-[family-name:var(--font-spline-sans-mono)]">
                          {estimatedOutput || '0.0'}
                        </div>
                      </div>
                      
                      <div className="flex flex-col space-y-2">
                        <CustomDropdown
                          value={swapState.toChain}
                          onChange={(value) => setSwapState(prev => ({ ...prev, toChain: value }))}
                          options={chains}
                          type="chain"
                        />
                        
                        <CustomDropdown
                          value={swapState.toToken}
                          onChange={(value) => setSwapState(prev => ({ ...prev, toToken: value }))}
                          options={tokens}
                          type="token"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Limit Price Input (for limit orders) */}
                {swapState.orderType === 'limit' && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-neutral-900/60 rounded-xl p-4 border border-neutral-800/50"
                  >
                    <label className="block text-xs text-neutral-400 mb-2 font-[family-name:var(--font-spline-sans-mono)]">
                      Limit Price ({swapState.toToken} per {swapState.fromToken})
                    </label>
                    <input
                      type="text"
                      value={swapState.limitPrice}
                      onChange={(e) => setSwapState(prev => ({ ...prev, limitPrice: e.target.value }))}
                      placeholder="0.0"
                      className="w-full px-3 py-2 bg-neutral-800/50 border border-neutral-700/50 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500 text-sm font-[family-name:var(--font-spline-sans-mono)]"
                    />
                  </motion.div>
                )}

                {/* Route Information */}
                {routeInfo && estimatedOutput && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-neutral-900/60 rounded-xl p-4 border border-neutral-800/50"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-medium text-orange-400 text-sm font-[family-name:var(--font-unbounded)]">Route Information</span>
                      <RefreshCw className="w-3 h-3 text-neutral-400 hover:text-neutral-200 cursor-pointer transition-colors" />
                    </div>
                    
                    <div className="space-y-2 text-xs font-[family-name:var(--font-spline-sans-mono)]">
                      <div className="flex justify-between">
                        <span className="text-neutral-400">Exchange Rate</span>
                        <span className="text-white">{routeInfo.exchangeRate}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-400">Price Impact</span>
                        <span className="text-orange-400">{routeInfo.priceImpact}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-400">Est. Gas Fee</span>
                        <span className="text-white">{routeInfo.gasEstimate}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-neutral-400">Min. Received</span>
                        <span className="text-white">{routeInfo.minReceived} {swapState.toToken}</span>
                      </div>
                    </div>
                  </motion.div>
                )}

                <CardContent className="pt-0">
                  <Button
                    onClick={handleSwap}
                    disabled={!isConnected || !swapState.fromAmount || isLoading}
                    className="w-full py-3 bg-gradient-to-r from-orange-600 to-yellow-600 hover:from-orange-700 hover:to-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed font-[family-name:var(--font-unbounded)] text-sm"
                  >
                    {!isConnected ? (
                      'Connect Wallet'
                    ) : isLoading ? (
                      <div className="flex items-center space-x-2">
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        <span>Processing...</span>
                      </div>
                    ) : (
                      `Swap ${swapState.fromToken} for ${swapState.toToken}`
                    )}
                  </Button>
                </CardContent>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SwapPage; 