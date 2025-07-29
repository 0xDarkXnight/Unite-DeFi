'use client'
import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/Card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { 
  Network, 
  Layers, 
  Shield, 
  Zap, 
  Clock, 
  ArrowLeftRight,
  Lock,
  Key,
  Eye,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  TrendingUp,
  Users,
  Cpu
} from 'lucide-react';

const TechnicalOverview: React.FC = () => {
  const advantages = [
    {
      icon: <Shield className="w-8 h-8" />,
      title: "Security First",
      description: "Hash Time-Locked Contracts ensure atomic swaps with cryptographic guarantees",
      color: "from-orange-400 to-yellow-500"
    },
    {
      icon: <Zap className="w-8 h-8" />,
      title: "Lightning Speed",
      description: "Dutch auction mechanism optimizes for fastest execution and best prices",
      color: "from-yellow-400 to-orange-500"
    },
    {
      icon: <Network className="w-8 h-8" />,
      title: "Universal Support",
      description: "Works across EVM and non-EVM chains including Sui, Aptos, and Solana",
      color: "from-orange-500 to-yellow-400"
    },
    {
      icon: <Users className="w-8 h-8" />,
      title: "Trustless Design",
      description: "No intermediaries, no custody, no trust assumptions required",
      color: "from-yellow-500 to-orange-600"
    }
  ];

  const technicalSpecs = [
    {
      category: "Protocol",
      specs: [
        { label: "Contract Type", value: "Hash Time-Locked Contract (HTLC)" },
        { label: "Auction Model", value: "Dutch Auction" },
        { label: "Security Model", value: "Cryptographic Proofs" },
        { label: "Trust Assumptions", value: "Zero (Trustless)" }
      ]
    },
    {
      category: "Performance",
      specs: [
        { label: "Average Swap Time", value: "< 2 minutes" },
        { label: "Gas Optimization", value: "45% savings" },
        { label: "Success Rate", value: "99.7%" },
        { label: "Supported Chains", value: "15+ networks" }
      ]
    },
    {
      category: "Security",
      specs: [
        { label: "Audit Status", value: "Multi-firm audited" },
        { label: "Bug Bounty", value: "$1M+ rewards" },
        { label: "TVL Protected", value: "$5.2B+" },
        { label: "Incident History", value: "Zero exploits" }
      ]
    }
  ];

  const processFlow = [
    { step: 1, title: "Order Creation", description: "User signs swap order with secret hash", icon: <Key className="w-6 h-6" /> },
    { step: 2, title: "Dutch Auction", description: "Resolvers compete for best execution", icon: <TrendingUp className="w-6 h-6" /> },
    { step: 3, title: "HTLC Deposit", description: "Winner deposits tokens in time-locked contract", icon: <Lock className="w-6 h-6" /> },
    { step: 4, title: "Secret Reveal", description: "User reveals secret to claim destination tokens", icon: <Eye className="w-6 h-6" /> },
    { step: 5, title: "Atomic Completion", description: "Resolver claims source tokens automatically", icon: <CheckCircle className="w-6 h-6" /> }
  ];

  const riskMitigations = [
    {
      risk: "Resolver Default",
      mitigation: "Time-locked recovery mechanisms",
      icon: <Clock className="w-5 h-5" />
    },
    {
      risk: "Secret Exposure",
      mitigation: "One-time cryptographic commitments",
      icon: <Shield className="w-5 h-5" />
    },
    {
      risk: "Network Congestion",
      mitigation: "Multi-chain routing and fallbacks",
      icon: <Network className="w-5 h-5" />
    },
    {
      risk: "Price Manipulation",
      mitigation: "Competitive Dutch auction pricing",
      icon: <TrendingUp className="w-5 h-5" />
    }
  ];

  return (
    <div className="w-full max-w-6xl mx-auto p-4 space-y-8 bg-black">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-3xl md:text-4xl font-black mb-4 bg-gradient-to-r from-orange-400 via-yellow-400 to-orange-400 bg-clip-text text-transparent font-[family-name:var(--font-unbounded)]">
          Technical Deep Dive
        </h2>
        <p className="text-lg text-neutral-300 max-w-3xl mx-auto font-[family-name:var(--font-spline-sans-mono)]">
          Sophisticated architecture powering the next generation of 
          <span className="text-orange-400 font-semibold"> cross-chain DeFi</span>
        </p>
      </div>

      {/* Key Advantages */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        {advantages.slice(0, 4).map((advantage, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="h-full text-center hover:scale-105 transition-transform duration-300 bg-black/80 border-neutral-800/50">
              <CardHeader>
                <div className={`w-12 h-12 mx-auto mb-3 rounded-xl bg-gradient-to-r ${advantage.color} flex items-center justify-center shadow-lg text-black`}>
                  {advantage.icon}
                </div>
                <CardTitle className="text-base text-white font-[family-name:var(--font-unbounded)]">
                  {advantage.title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-neutral-300 text-xs leading-relaxed font-[family-name:var(--font-spline-sans-mono)]">
                  {advantage.description}
                </p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Technical Specifications */}
      <Card className="bg-black/80 border-neutral-800/50">
        <CardHeader>
          <CardTitle className="flex items-center text-white text-lg font-[family-name:var(--font-unbounded)]">
            <Cpu className="w-5 h-5 mr-2 text-orange-400" />
            Technical Specifications
          </CardTitle>
          <CardDescription className="text-neutral-300 text-sm font-[family-name:var(--font-spline-sans-mono)]">
            Key technical parameters and performance metrics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="protocol" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="protocol" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-600 data-[state=active]:to-yellow-600 text-sm">Protocol</TabsTrigger>
              <TabsTrigger value="performance" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-600 data-[state=active]:to-yellow-600 text-sm">Performance</TabsTrigger>
              <TabsTrigger value="security" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-600 data-[state=active]:to-yellow-600 text-sm">Security</TabsTrigger>
            </TabsList>
            
            {technicalSpecs.map((category) => (
              <TabsContent key={category.category.toLowerCase()} value={category.category.toLowerCase()}>
                <div className="grid md:grid-cols-2 gap-4 mt-4">
                  {category.specs.map((spec, index) => (
                    <motion.div
                      key={spec.label}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="flex justify-between items-center p-3 bg-neutral-900/50 rounded-lg border border-neutral-800/50 hover:border-orange-500/40 transition-colors duration-300"
                    >
                      <span className="text-neutral-300 font-medium text-sm font-[family-name:var(--font-spline-sans-mono)]">{spec.label}</span>
                      <span className="text-white font-semibold text-sm font-[family-name:var(--font-spline-sans-mono)]">{spec.value}</span>
                    </motion.div>
                  ))}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* Process Flow Diagram */}
      <Card className="bg-black/80 border-neutral-800/50">
        <CardHeader>
          <CardTitle className="flex items-center text-white text-lg font-[family-name:var(--font-unbounded)]">
            <ArrowLeftRight className="w-5 h-5 mr-2 text-orange-400" />
            Atomic Swap Process Flow
          </CardTitle>
          <CardDescription className="text-neutral-300 text-sm font-[family-name:var(--font-spline-sans-mono)]">
            Step-by-step breakdown of the cross-chain swap mechanism
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-5 gap-3">
            {processFlow.map((step, index) => (
              <motion.div
                key={step.step}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.1 }}
                className="relative"
              >
                <div className="bg-neutral-900/50 rounded-xl p-4 text-center border border-neutral-800/50 hover:border-orange-500/40 transition-all duration-300 group">
                  <div className="w-10 h-10 mx-auto mb-3 rounded-lg bg-gradient-to-r from-orange-500 to-yellow-500 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300 text-black">
                    {step.icon}
                  </div>
                  <div className="w-6 h-6 mx-auto mb-2 rounded-full bg-gradient-to-r from-orange-600 to-yellow-600 flex items-center justify-center">
                    <span className="text-xs font-bold text-white">{step.step}</span>
                  </div>
                  <h3 className="font-semibold text-white mb-1 text-xs font-[family-name:var(--font-unbounded)]">
                    {step.title}
                  </h3>
                  <p className="text-xs text-neutral-300 leading-tight font-[family-name:var(--font-spline-sans-mono)]">
                    {step.description}
                  </p>
                </div>
                {index < processFlow.length - 1 && (
                  <div className="hidden md:block absolute top-1/2 -right-2 transform -translate-y-1/2">
                    <ArrowLeftRight className="w-3 h-3 text-orange-400 rotate-0" />
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TechnicalOverview; 