'use client'
import React from 'react';
import FusionTimeline from '@/components/FusionTimeline';
import TechnicalOverview from '@/components/TechnicalOverview';
import InteractiveDemo from '@/components/InteractiveDemo';
import { ArrowRight, Zap, Github, Sparkles, Globe, Shield, Users, TrendingUp, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import Link from 'next/link';

const NetworkBackground = () => {
  return (
    <div className="fixed inset-0 -z-10">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_80%,rgba(6,182,212,0.1),transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(20,184,166,0.1),transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_40%_40%,rgba(99,102,241,0.05),transparent_50%)]" />
    </div>
  );
};

const UniteDefiLanding = () => {
  const stats = [
    { label: 'Chains Supported', value: '15+', color: 'from-cyan-400 to-teal-400' },
    { label: 'Total Volume', value: '$5.2B+', color: 'from-teal-400 to-emerald-400' },
    { label: 'Transactions', value: '2.5M+', color: 'from-emerald-400 to-cyan-400' },
    { label: 'Gas Savings', value: '45%', color: 'from-cyan-300 to-teal-300' }
  ];

  const features = [
    {
      icon: <Globe className="w-10 h-10" />,
      title: 'Universal Connectivity',
      description: 'Seamlessly connect and swap across 15+ blockchain networks including EVM, Sui, Aptos, Solana, and emerging chains.',
      gradient: 'from-cyan-500 via-teal-500 to-cyan-600',
    },
    {
      icon: <Shield className="w-10 h-10" />,
      title: 'Military-Grade Security',
      description: 'Advanced cryptographic protocols, multi-signature architecture, and formal verification ensure maximum security.',
      gradient: 'from-teal-500 via-emerald-500 to-teal-600',
    },
    {
      icon: <Zap className="w-10 h-10" />,
      title: 'Lightning Performance',
      description: 'AI-powered routing, parallel processing, and optimized algorithms deliver sub-second swap confirmations.',
      gradient: 'from-emerald-500 via-cyan-500 to-emerald-600',
    }
  ];

  return (
    <div className="min-h-screen bg-transparent text-white overflow-hidden relative">
      <NetworkBackground />
      
      {/* Navigation */}
      <nav className="relative z-50 px-6 py-6 backdrop-blur-xl bg-slate-950/40 border-b border-slate-800/50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3 group cursor-pointer">
            <div className="w-11 h-11 bg-gradient-to-br from-cyan-500 via-teal-500 to-cyan-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/25 group-hover:shadow-cyan-500/40 transition-all duration-300 group-hover:scale-105">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold bg-gradient-to-r from-cyan-400 via-teal-400 to-cyan-300 bg-clip-text text-transparent">
              Unite DeFi
            </span>
          </div>

          <div className="hidden md:flex items-center space-x-8">
            {['Features', 'How It Works', 'Technical', 'Demo'].map((item) => (
              <a 
                key={item}
                href={`#${item.toLowerCase().replace(' ', '-')}`} 
                className="relative px-4 py-2 text-slate-300 hover:text-white transition-all duration-300 group"
              >
                <span className="relative z-10 font-medium">{item}</span>
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-600/0 via-cyan-600/20 to-cyan-600/0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="absolute bottom-0 left-0 w-0 h-0.5 bg-gradient-to-r from-cyan-400 to-teal-400 group-hover:w-full transition-all duration-300"></div>
              </a>
            ))}
          </div>

          <div className="flex items-center space-x-4">
            <Button variant="outline" size="sm">
              <Github className="w-4 h-4 mr-2" />
              GitHub
            </Button>
            <Button variant="gradient">
              Launch App
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 px-6 py-24 min-h-screen flex items-center">
        <div className="max-w-7xl mx-auto text-center">
          <div className="mb-16 space-y-8">
            <div className="inline-flex items-center px-6 py-3 bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-full text-sm text-cyan-300 mb-8 shadow-lg shadow-cyan-500/10 hover:shadow-cyan-500/20 transition-all duration-500 cursor-pointer group">
              <Sparkles className="w-4 h-4 mr-2 animate-pulse" />
              <span className="font-semibold">Advanced Cross-Chain Protocol</span>
              <div className="ml-2 w-2 h-2 bg-green-400 rounded-full animate-pulse shadow-sm shadow-green-400/50"></div>
            </div>
            
            <h1 className="text-6xl md:text-8xl font-black mb-8 leading-tight">
              <div className="bg-gradient-to-r from-white via-slate-100 to-white bg-clip-text text-transparent mb-4">
                Unite Every Chain
              </div>
              <div className="bg-gradient-to-r from-cyan-400 via-teal-400 to-cyan-300 bg-clip-text text-transparent">
                One Protocol
              </div>
            </h1>
            
            <p className="text-xl md:text-2xl text-slate-300 mb-12 max-w-4xl mx-auto leading-relaxed font-light">
              The ultimate <span className="text-cyan-400 font-semibold">cross-chain DeFi protocol</span> powered by 
              Hash Time-Locked Contracts and Dutch auction mechanisms. Experience <span className="text-emerald-400 font-semibold">trustless atomic swaps</span> across EVM and non-EVM chains.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mb-20">
            <Button variant="gradient" size="lg" className="group">
              <span>Launch App</span>
              <ArrowRight className="w-6 h-6 ml-2 group-hover:translate-x-2 transition-transform duration-300" />
            </Button>
            
            <Button variant="outline" size="lg" className="group">
              <Github className="w-6 h-6 mr-2 group-hover:rotate-12 transition-transform duration-300" />
              <span>View Documentation</span>
            </Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-6xl mx-auto">
            {stats.map((stat, index) => (
              <div key={index} className="group text-center p-8 bg-slate-800/20 backdrop-blur-sm border border-slate-700/30 rounded-2xl hover:bg-slate-800/30 hover:border-slate-600/40 transition-all duration-300 transform hover:scale-105 cursor-pointer">
                <div className={`text-4xl md:text-5xl font-black bg-gradient-to-r ${stat.color} bg-clip-text text-transparent mb-3 group-hover:scale-110 transition-transform duration-300`}>
                  {stat.value}
                </div>
                <div className="text-slate-400 text-sm font-medium group-hover:text-slate-300 transition-colors duration-300">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce cursor-pointer group">
          <div className="p-3 bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-full group-hover:bg-slate-800/50 transition-all duration-300">
            <ChevronDown className="w-6 h-6 text-cyan-400 group-hover:text-cyan-300" />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="relative z-10 px-6 py-32">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-5xl md:text-6xl font-black mb-8 bg-gradient-to-r from-white via-slate-100 to-white bg-clip-text text-transparent">
              Revolutionary Features
            </h2>
            <p className="text-2xl text-slate-400 max-w-4xl mx-auto font-light">
              Built with cutting-edge technology for the next generation of <span className="text-cyan-400 font-semibold">cross-chain DeFi</span>
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-12">
            {features.map((feature, index) => (
              <div key={index} className="group cursor-pointer">
                <Card className="h-full hover:scale-105 transition-transform duration-500">                  
                  <CardHeader>
                    <div className={`w-20 h-20 bg-gradient-to-br ${feature.gradient} rounded-2xl flex items-center justify-center mb-8 group-hover:scale-110 group-hover:rotate-6 transition-all duration-500 shadow-lg shadow-cyan-500/20`}>
                      {feature.icon}
                    </div>
                    
                    <CardTitle className="text-3xl mb-6 bg-gradient-to-r from-white to-slate-200 bg-clip-text text-transparent group-hover:from-cyan-200 group-hover:to-white transition-all duration-300">
                      {feature.title}
                    </CardTitle>
                  </CardHeader>
                  
                  <CardContent>
                    <p className="text-slate-400 leading-relaxed text-lg group-hover:text-slate-300 transition-colors duration-300">
                      {feature.description}
                    </p>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Interactive Demo Section */}
      <section id="demo" className="relative z-10 px-6 py-32 bg-slate-900/20">
        <InteractiveDemo />
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="relative z-10 py-32">
        <FusionTimeline />
      </section>

      {/* Technical Deep Dive */}
      <section id="technical" className="relative z-10 px-6 py-32 bg-slate-900/20">
        <TechnicalOverview />
      </section>

      {/* Call to Action */}
      <section className="relative z-10 px-6 py-32">
        <div className="max-w-4xl mx-auto text-center">
          <Card className="bg-gradient-to-r from-cyan-900/20 via-teal-900/20 to-emerald-900/20 border border-cyan-500/30">
            <CardHeader>
              <CardTitle className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-cyan-400 to-teal-400 bg-clip-text text-transparent mb-4">
                Ready to Unite DeFi?
              </CardTitle>
              <CardDescription className="text-xl text-slate-300 max-w-2xl mx-auto">
                Join thousands of users already experiencing the future of cross-chain swaps
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-8">
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Button variant="gradient" size="lg" className="group">
                  <span>Launch Application</span>
                  <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-2 transition-transform duration-300" />
                </Button>
                <Button variant="outline" size="lg">
                  Read Documentation
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 px-6 py-20 border-t border-slate-800/50">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-12 mb-16">
            <div className="md:col-span-2">
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 via-teal-500 to-cyan-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/25">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold bg-gradient-to-r from-cyan-400 via-teal-400 to-cyan-300 bg-clip-text text-transparent">
                  Unite DeFi
                </span>
              </div>
              <p className="text-slate-400 leading-relaxed mb-6 max-w-md">
                The future of cross-chain DeFi is here. Unite every blockchain, empower every trader, and unlock infinite possibilities with our revolutionary protocol.
              </p>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-6">Product</h4>
              <div className="space-y-3">
                {['Swap', 'Bridge', 'Analytics', 'API'].map((item) => (
                  <a key={item} href="#" className="block text-slate-400 hover:text-cyan-400 transition-colors duration-300">
                    {item}
                  </a>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-6">Resources</h4>
              <div className="space-y-3">
                {['Documentation', 'Tutorials', 'Blog', 'Support'].map((item) => (
                  <a key={item} href="#" className="block text-slate-400 hover:text-cyan-400 transition-colors duration-300">
                    {item}
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-slate-800/50 pt-8 flex flex-col md:flex-row items-center justify-between">
            <p className="text-slate-500 text-sm mb-4 md:mb-0">
              © 2024 Unite DeFi. All rights reserved. Built for the future of finance.
            </p>
            <div className="flex space-x-6 text-sm">
              {['Privacy Policy', 'Terms of Service', 'Cookie Policy'].map((item) => (
                <a key={item} href="#" className="text-slate-500 hover:text-cyan-400 transition-colors duration-300">
                  {item}
                </a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default UniteDefiLanding;