'use client'
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Navigation from '@/components/Navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Progress } from '@/components/ui/progress';
import { 
  ArrowUpDown, 
  Settings, 
  Zap, 
  Info, 
  TrendingUp, 
  Clock, 
  Shield, 
  ChevronDown, 
  Wallet, 
  ExternalLink, 
  RefreshCw, 
  AlertTriangle,
  ArrowRight,
  Layers,
  BarChart3,
  History,
  Target,
  DollarSign,
  Activity,
  CheckCircle
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

const SwapPage = () => {
  const [swapState, setSwapState] = useState<SwapState>({
    fromToken: 'ETH',
    toToken: 'USDC',
    fromChain: 'Ethereum',
    toChain: 'Polygon',
    fromAmount: '',
    slippage: '0.5',
    isAdvanced: false,
    orderType: 'market',
    limitPrice: ''
  });

  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [estimatedOutput, setEstimatedOutput] = useState('');
  const [priceImpact, setPriceImpact] = useState('0.02');
  const [routeInfo, setRouteInfo] = useState<any>(null);

  const tokens: TokenData[] = [
    { symbol: 'ETH', name: 'Ethereum', logo: '🔷', balance: '2.5847', price: 3240.50, change24h: 2.3, volume24h: '$12.5B' },
    { symbol: 'USDC', name: 'USD Coin', logo: '💵', balance: '1,250.50', price: 1.00, change24h: 0.01, volume24h: '$8.2B' },
    { symbol: 'BTC', name: 'Bitcoin', logo: '₿', balance: '0.1563', price: 67500.00, change24h: -0.8, volume24h: '$15.8B' },
    { symbol: 'MATIC', name: 'Polygon', logo: '🟣', balance: '850.25', price: 0.85, change24h: 3.2, volume24h: '$450M' },
    { symbol: 'SOL', name: 'Solana', logo: '☀️', balance: '12.8', price: 180.25, change24h: -1.2, volume24h: '$2.1B' },
    { symbol: 'SUI', name: 'Sui', logo: '💧', balance: '125.0', price: 3.15, change24h: 5.7, volume24h: '$180M' },
    { symbol: 'APT', name: 'Aptos', logo: '🍃', balance: '45.2', price: 12.45, change24h: 2.8, volume24h: '$95M' },
  ];

  const chains: ChainData[] = [
    { name: 'Ethereum', symbol: 'ETH', color: 'from-neutral-600 to-neutral-800', logo: '🔷', gasPrice: '25 gwei', status: 'normal' },
    { name: 'Polygon', symbol: 'MATIC', color: 'from-neutral-600 to-neutral-800', logo: '🟣', gasPrice: '35 gwei', status: 'fast' },
    { name: 'Arbitrum', symbol: 'ARB', color: 'from-neutral-600 to-neutral-800', logo: '🔵', gasPrice: '0.5 gwei', status: 'fast' },
    { name: 'Optimism', symbol: 'OP', color: 'from-neutral-600 to-neutral-800', logo: '🔴', gasPrice: '0.3 gwei', status: 'fast' },
    { name: 'BNB Chain', symbol: 'BNB', color: 'from-neutral-600 to-neutral-800', logo: '🟡', gasPrice: '3 gwei', status: 'normal' },
    { name: 'Sui', symbol: 'SUI', color: 'from-neutral-600 to-neutral-800', logo: '💧', gasPrice: '0.001 SUI', status: 'fast' },
    { name: 'Aptos', symbol: 'APT', color: 'from-neutral-600 to-neutral-800', logo: '🍃', gasPrice: '0.001 APT', status: 'fast' },
    { name: 'Solana', symbol: 'SOL', color: 'from-neutral-600 to-neutral-800', logo: '☀️', gasPrice: '0.00025 SOL', status: 'fast' },
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
    if (swapState.fromAmount && fromTokenData && toTokenData) {
      const fromValue = parseFloat(swapState.fromAmount) * fromTokenData.price;
      const estimated = (fromValue / toTokenData.price * 0.997).toFixed(6);
      setEstimatedOutput(estimated);
      
      setRouteInfo({
        route: ['Ethereum', 'Polygon Bridge', 'Polygon'],
        gasEstimate: '$12.50',
        priceImpact: '0.02%',
        minReceived: (parseFloat(estimated) * (1 - parseFloat(swapState.slippage) / 100)).toFixed(6),
        exchangeRate: `1 ${swapState.fromToken} = ${(fromTokenData.price / toTokenData.price).toFixed(4)} ${swapState.toToken}`
      });
    }
  }, [swapState.fromAmount, swapState.fromToken, swapState.toToken, swapState.slippage, fromTokenData, toTokenData]);

  const handleSwap = () => {
    if (!isConnected) return;
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      // Show success state
    }, 3000);
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

      <Navigation isConnected={isConnected} onConnectWallet={() => setIsConnected(!isConnected)} />

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Main Swap Interface */}
          <div className="flex-1 max-w-2xl">
            {/* Header */}
            <div className="mb-6">
              <h1 className="text-3xl font-black gradient-text mb-2 font-[family-name:var(--font-unbounded)]">
                Cross-Chain Swap
              </h1>
              <p className="text-neutral-400 text-sm font-[family-name:var(--font-spline-sans-mono)]">
                Trade across 15+ blockchains with zero compromises
              </p>
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
                      <span className="text-neutral-400 text-xs font-[family-name:var(--font-spline-sans-mono)]">
                        Balance: {fromTokenData?.balance || '0.00'}
                      </span>
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
                        <div className="text-neutral-400 text-xs mt-1 font-[family-name:var(--font-spline-sans-mono)]">
                          ≈ ${swapState.fromAmount && fromTokenData ? (parseFloat(swapState.fromAmount) * fromTokenData.price).toLocaleString() : '0.00'}
                        </div>
                      </div>
                      
                      <div className="flex flex-col space-y-2">
                        <select
                          value={swapState.fromChain}
                          onChange={(e) => setSwapState(prev => ({ ...prev, fromChain: e.target.value }))}
                          className="px-3 py-2 bg-neutral-800/50 border border-neutral-700/50 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-orange-500 font-[family-name:var(--font-spline-sans-mono)]"
                        >
                          {chains.map(chain => (
                            <option key={chain.name} value={chain.name}>{chain.name}</option>
                          ))}
                        </select>
                        <select
                          value={swapState.fromToken}
                          onChange={(e) => setSwapState(prev => ({ ...prev, fromToken: e.target.value }))}
                          className="px-3 py-2 bg-neutral-800/50 border border-neutral-700/50 rounded-lg text-sm font-medium focus:outline-none focus:ring-1 focus:ring-orange-500 font-[family-name:var(--font-unbounded)]"
                        >
                          {tokens.map(token => (
                            <option key={token.symbol} value={token.symbol}>
                              {token.logo} {token.symbol}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="text-right">
                        <div className="text-white font-semibold text-sm font-[family-name:var(--font-spline-sans-mono)]">
                          ${fromTokenData?.price.toLocaleString() || '0.00'}
                        </div>
                        <div className={`text-xs font-[family-name:var(--font-spline-sans-mono)] ${
                          (fromTokenData?.change24h || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {(fromTokenData?.change24h || 0) >= 0 ? '+' : ''}{fromTokenData?.change24h || 0}%
                        </div>
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
                      <span className="text-neutral-400 text-xs font-[family-name:var(--font-spline-sans-mono)]">
                        Balance: {toTokenData?.balance || '0.00'}
                      </span>
                    </div>
                    
                    <div className="flex items-center space-x-3">
                      <div className="flex-1">
                        <div className="text-2xl font-bold text-white font-[family-name:var(--font-spline-sans-mono)]">
                          {estimatedOutput || '0.0'}
                        </div>
                        <div className="text-neutral-400 text-xs mt-1 font-[family-name:var(--font-spline-sans-mono)]">
                          ≈ ${estimatedOutput && toTokenData ? (parseFloat(estimatedOutput) * toTokenData.price).toLocaleString() : '0.00'}
                        </div>
                      </div>
                      
                      <div className="flex flex-col space-y-2">
                        <select
                          value={swapState.toChain}
                          onChange={(e) => setSwapState(prev => ({ ...prev, toChain: e.target.value }))}
                          className="px-3 py-2 bg-neutral-800/50 border border-neutral-700/50 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-orange-500 font-[family-name:var(--font-spline-sans-mono)]"
                        >
                          {chains.map(chain => (
                            <option key={chain.name} value={chain.name}>{chain.name}</option>
                          ))}
                        </select>
                        
                        <select
                          value={swapState.toToken}
                          onChange={(e) => setSwapState(prev => ({ ...prev, toToken: e.target.value }))}
                          className="px-3 py-2 bg-neutral-800/50 border border-neutral-700/50 rounded-lg text-sm font-medium focus:outline-none focus:ring-1 focus:ring-orange-500 font-[family-name:var(--font-unbounded)]"
                        >
                          {tokens.map(token => (
                            <option key={token.symbol} value={token.symbol}>
                              {token.logo} {token.symbol}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="text-right">
                        <div className="text-white font-semibold text-sm font-[family-name:var(--font-spline-sans-mono)]">
                          ${toTokenData?.price.toLocaleString() || '0.00'}
                        </div>
                        <div className={`text-xs font-[family-name:var(--font-spline-sans-mono)] ${
                          (toTokenData?.change24h || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {(toTokenData?.change24h || 0) >= 0 ? '+' : ''}{toTokenData?.change24h || 0}%
                        </div>
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

          {/* Side Panel */}
          <div className="lg:w-80 space-y-4">
            {/* Market Stats */}
            <Card className="bg-black/60 border-neutral-800/50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center space-x-2 text-base">
                  <TrendingUp className="w-4 h-4 text-orange-400" />
                  <span>Market Overview</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-400 text-xs font-[family-name:var(--font-spline-sans-mono)]">24h Volume</span>
                    <span className="text-white font-semibold text-xs font-[family-name:var(--font-spline-sans-mono)]">$125.2M</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-400 text-xs font-[family-name:var(--font-spline-sans-mono)]">Total Swaps</span>
                    <span className="text-white font-semibold text-xs font-[family-name:var(--font-spline-sans-mono)]">2.5M+</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-400 text-xs font-[family-name:var(--font-spline-sans-mono)]">Avg. Gas Saved</span>
                    <span className="text-orange-400 font-semibold text-xs font-[family-name:var(--font-spline-sans-mono)]">45%</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-neutral-400 text-xs font-[family-name:var(--font-spline-sans-mono)]">Active Chains</span>
                    <span className="text-orange-400 font-semibold text-xs font-[family-name:var(--font-spline-sans-mono)]">15</span>
                  </div>
                  
                  <div className="pt-3 border-t border-neutral-800/50">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-neutral-400 text-xs font-[family-name:var(--font-spline-sans-mono)]">Price Impact</span>
                      <span className="text-orange-400 text-xs font-[family-name:var(--font-spline-sans-mono)]">{priceImpact}%</span>
                    </div>
                    <Progress value={parseFloat(priceImpact) * 10} className="h-1" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recent Activity */}
            <Card className="bg-black/60 border-neutral-800/50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center space-x-2 text-base">
                  <History className="w-4 h-4 text-orange-400" />
                  <span>Recent Activity</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {recentTransactions.map((tx, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="flex items-center justify-between p-2 bg-neutral-900/30 rounded-lg hover:bg-neutral-900/50 transition-colors duration-300 cursor-pointer"
                    >
                      <div className="flex items-center space-x-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                          tx.type === 'swap' ? 'bg-orange-500/20' : 'bg-orange-500/20'
                        }`}>
                          {tx.type === 'swap' ? (
                            <ArrowUpDown className="w-3 h-3 text-orange-400" />
                          ) : (
                            <Layers className="w-3 h-3 text-orange-400" />
                          )}
                        </div>
                        <div>
                          <div className="text-xs font-medium text-white font-[family-name:var(--font-spline-sans-mono)]">
                            {tx.type === 'bridge' ? `${tx.amount} ${tx.from}` : `${tx.from} → ${tx.to}`}
                          </div>
                          <div className="text-xs text-neutral-400 font-[family-name:var(--font-spline-sans-mono)]">{tx.time}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-medium text-white font-[family-name:var(--font-spline-sans-mono)]">{tx.value}</div>
                        <div className="flex items-center space-x-1">
                          <CheckCircle className="w-2 h-2 text-orange-400" />
                          <span className="text-xs text-orange-400 font-[family-name:var(--font-spline-sans-mono)]">Complete</span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
                
                <Button variant="ghost" className="w-full mt-3 text-xs font-[family-name:var(--font-unbounded)]">
                  View All Transactions
                </Button>
              </CardContent>
            </Card>

            {/* Network Status */}
            <Card className="bg-black/60 border-neutral-800/50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center space-x-2 text-base">
                  <Activity className="w-4 h-4 text-orange-400" />
                  <span>Network Status</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {chains.slice(0, 6).map((network, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div className={`w-2 h-2 rounded-full ${
                          network.status === 'fast' ? 'bg-orange-400' : 
                          network.status === 'normal' ? 'bg-yellow-400' : 'bg-red-400'
                        }`}></div>
                        <span className="text-xs text-white font-[family-name:var(--font-spline-sans-mono)]">{network.name}</span>
                      </div>
                      <span className="text-xs text-neutral-400 font-[family-name:var(--font-spline-sans-mono)]">{network.gasPrice}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Security Badge */}
            <Card className="bg-neutral-900/40 border-neutral-800/50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center text-orange-400 text-base">
                  <Shield className="w-4 h-4 mr-2" />
                  <span>Security Verified</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-3 h-3 text-orange-400" />
                    <span className="text-neutral-300 font-[family-name:var(--font-spline-sans-mono)]">Multi-signature verified</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-3 h-3 text-orange-400" />
                    <span className="text-neutral-300 font-[family-name:var(--font-spline-sans-mono)]">Audited by leading firms</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <CheckCircle className="w-3 h-3 text-orange-400" />
                    <span className="text-neutral-300 font-[family-name:var(--font-spline-sans-mono)]">Non-custodial protocol</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SwapPage; 