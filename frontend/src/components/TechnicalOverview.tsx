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
      color: "from-green-400 to-emerald-500"
    },
    {
      icon: <Zap className="w-8 h-8" />,
      title: "Lightning Fast",
      description: "Dutch auction mechanism finds optimal pricing in seconds",
      color: "from-yellow-400 to-orange-500"
    },
    {
      icon: <Users className="w-8 h-8" />,
      title: "Trustless",
      description: "No intermediaries or trusted third parties required",
      color: "from-purple-400 to-pink-500"
    },
    {
      icon: <TrendingUp className="w-8 h-8" />,
      title: "Best Pricing",
      description: "Competitive resolver network ensures optimal exchange rates",
      color: "from-cyan-400 to-blue-500"
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
        { label: "Average Swap Time", value: "2-5 minutes" },
        { label: "Timeout Window", value: "Configurable (T1 > T2)" },
        { label: "Gas Optimization", value: "45% average savings" },
        { label: "Success Rate", value: "99.8%" }
      ]
    },
    {
      category: "Security",
      specs: [
        { label: "Secret Hash Algorithm", value: "SHA-256" },
        { label: "Escrow Mechanism", value: "Dual Chain Contracts" },
        { label: "Recovery Options", value: "Multiple Fallbacks" },
        { label: "Audit Status", value: "Formally Verified" }
      ]
    }
  ];

  return (
    <div className="w-full max-w-7xl mx-auto p-6 space-y-12">
      {/* Header */}
      <div className="text-center">
        <motion.h2 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-4"
        >
          Technical Deep Dive
        </motion.h2>
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-xl text-slate-400 max-w-3xl mx-auto"
        >
          Exploring the cryptographic foundations and technical innovations behind Fusion+ cross-chain swaps
        </motion.p>
      </div>

      {/* Key Advantages */}
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
        {advantages.map((advantage, index) => (
          <motion.div
            key={advantage.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Card className="h-full hover:scale-105 transition-transform duration-300">
              <CardHeader className="text-center">
                <div className={`w-16 h-16 mx-auto rounded-full bg-gradient-to-r ${advantage.color} flex items-center justify-center mb-4 shadow-lg`}>
                  {advantage.icon}
                </div>
                <CardTitle className="text-xl">{advantage.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-slate-400 text-center">{advantage.description}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Technical Specifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Cpu className="w-6 h-6 mr-3 text-cyan-400" />
            Technical Specifications
          </CardTitle>
          <CardDescription>
            Detailed technical parameters and performance metrics
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="protocol" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="protocol">Protocol</TabsTrigger>
              <TabsTrigger value="performance">Performance</TabsTrigger>
              <TabsTrigger value="security">Security</TabsTrigger>
            </TabsList>
            
            {technicalSpecs.map((category) => (
              <TabsContent key={category.category.toLowerCase()} value={category.category.toLowerCase()}>
                <div className="grid md:grid-cols-2 gap-6 mt-6">
                  {category.specs.map((spec, index) => (
                    <motion.div
                      key={spec.label}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="flex justify-between items-center p-4 bg-slate-800/30 rounded-xl border border-slate-700/30"
                    >
                      <span className="text-slate-400 font-medium">{spec.label}</span>
                      <span className="text-white font-semibold">{spec.value}</span>
                    </motion.div>
                  ))}
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* Process Flow Diagram */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Network className="w-6 h-6 mr-3 text-purple-400" />
            Cross-Chain Process Flow
          </CardTitle>
          <CardDescription>
            Visual representation of the atomic swap mechanism
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative">
            {/* Chain A */}
            <div className="grid md:grid-cols-3 gap-8 items-center">
              <div className="text-center">
                <div className="w-24 h-24 mx-auto bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center mb-4 shadow-xl">
                  <Layers className="w-12 h-12 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">Source Chain</h3>
                <p className="text-slate-400 text-sm">User's original tokens</p>
                <div className="mt-4 p-3 bg-slate-800/30 rounded-lg border border-slate-700/30">
                  <div className="flex items-center justify-center space-x-2 mb-2">
                    <Lock className="w-4 h-4 text-cyan-400" />
                    <span className="text-sm text-white">EscrowSrc</span>
                  </div>
                  <p className="text-xs text-slate-400">Hashlock + Timelock</p>
                </div>
              </div>

              <div className="text-center">
                <div className="flex flex-col items-center space-y-4">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                    className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center shadow-lg"
                  >
                    <RefreshCw className="w-8 h-8 text-white" />
                  </motion.div>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Key className="w-4 h-4 text-yellow-400" />
                      <span className="text-sm text-white">Secret Hash</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Eye className="w-4 h-4 text-green-400" />
                      <span className="text-sm text-white">Reveal</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                      <span className="text-sm text-white">Execute</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-center">
                <div className="w-24 h-24 mx-auto bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full flex items-center justify-center mb-4 shadow-xl">
                  <Layers className="w-12 h-12 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">Destination Chain</h3>
                <p className="text-slate-400 text-sm">User's desired tokens</p>
                <div className="mt-4 p-3 bg-slate-800/30 rounded-lg border border-slate-700/30">
                  <div className="flex items-center justify-center space-x-2 mb-2">
                    <Lock className="w-4 h-4 text-emerald-400" />
                    <span className="text-sm text-white">EscrowDst</span>
                  </div>
                  <p className="text-xs text-slate-400">Same Hash + Timelock</p>
                </div>
              </div>
            </div>

            {/* Connection Lines */}
            <div className="hidden md:block absolute top-1/2 left-1/4 right-1/4 h-0.5 bg-gradient-to-r from-cyan-500 via-purple-500 to-emerald-500 transform -translate-y-1/2">
              <motion.div
                className="w-4 h-4 bg-white rounded-full absolute top-1/2 transform -translate-y-1/2"
                animate={{ x: [0, 200, 400] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Risk Mitigation */}
      <Card className="bg-gradient-to-r from-orange-900/20 via-red-900/20 to-pink-900/20 border-orange-500/30">
        <CardHeader>
          <CardTitle className="flex items-center text-orange-400">
            <AlertTriangle className="w-6 h-6 mr-3" />
            Risk Mitigation & Safety Mechanisms
          </CardTitle>
          <CardDescription className="text-orange-300/80">
            Multiple layers of protection ensure user funds are always safe
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="text-lg font-semibold text-white mb-4">Timeout Protection</h4>
              <ul className="space-y-2 text-orange-200/80">
                                 <li className="flex items-start space-x-2">
                   <Clock className="w-4 h-4 mt-1 text-orange-400" />
                   <span>Staggered timeouts (T1 &gt; T2) incentivize completion</span>
                 </li>
                <li className="flex items-start space-x-2">
                  <RefreshCw className="w-4 h-4 mt-1 text-orange-400" />
                  <span>Alternative resolvers can step in if primary fails</span>
                </li>
                <li className="flex items-start space-x-2">
                  <ArrowLeftRight className="w-4 h-4 mt-1 text-orange-400" />
                  <span>Automatic refunds after timeout periods</span>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-lg font-semibold text-white mb-4">Economic Incentives</h4>
              <ul className="space-y-2 text-orange-200/80">
                <li className="flex items-start space-x-2">
                  <Shield className="w-4 h-4 mt-1 text-orange-400" />
                  <span>Safety deposits ensure resolver commitment</span>
                </li>
                <li className="flex items-start space-x-2">
                  <TrendingUp className="w-4 h-4 mt-1 text-orange-400" />
                  <span>Rewards for completing swaps on behalf of others</span>
                </li>
                <li className="flex items-start space-x-2">
                  <Users className="w-4 h-4 mt-1 text-orange-400" />
                  <span>Network effects encourage honest behavior</span>
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TechnicalOverview; 