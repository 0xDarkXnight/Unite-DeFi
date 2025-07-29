'use client'
import React from 'react';
import Navigation from '@/components/Navigation';
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
      {/* Static background for non-hero sections */}
      <div className="absolute inset-0 bg-gradient-to-br from-black via-neutral-950 to-black" />
      <div className="mesh-gradient-1 absolute inset-0 opacity-40" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
    </div>
  );
};

const HeroVideoBackground = () => {
  return (
    <div className="absolute inset-0 -z-10">
      {/* Video Background with margin from top */}
      <video
        autoPlay
        muted
        loop
        playsInline
        className="absolute top-[1%] left-0 w-full h-[99%] object-cover opacity-98"
      >
        <source src="/bg.mp4" type="video/mp4" />
      </video>
      
      {/* Dark overlay for better text readability */}
      <div className="absolute inset-0 bg-black/10" />
      
      {/* Existing gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-br from-black/30 via-neutral-950/10 to-black/30" />
      <div className="mesh-gradient-1 absolute inset-0 opacity-30" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
    </div>
  );
};

const UniteDefiLanding = () => {
  const stats = [
    { label: 'Chains Supported', value: '15+', color: 'from-orange-400 to-red-400' },
    { label: 'Total Volume', value: '$5.2B+', color: 'from-red-400 to-orange-500' },
    { label: 'Transactions', value: '2M', color: 'from-orange-500 to-red-500' },
    { label: 'Gas Savings', value: '45%', color: 'from-red-300 to-orange-400' }
  ];

  const features = [
    {
      icon: <Globe className="w-10 h-10" />,
      title: 'Universal Connectivity',
      description: 'Seamlessly connect and swap across 15+ blockchain networks including EVM, Sui, Aptos, Solana, and emerging chains.',
      gradient: 'from-orange-500 via-red-500 to-orange-600',
    },
    {
      icon: <Shield className="w-10 h-10" />,
      title: 'Military-Grade Security',
      description: 'Advanced cryptographic protocols, multi-signature architecture, and formal verification ensure maximum security.',
      gradient: 'from-red-500 via-orange-600 to-red-600',
    },
    {
      icon: <Zap className="w-10 h-10" />,
      title: 'Lightning Performance',
      description: 'AI-powered routing, parallel processing, and optimized algorithms deliver sub-second swap confirmations.',
      gradient: 'from-orange-600 via-red-500 to-orange-700',
    }
  ];

  return (
    <div className="min-h-screen text-white overflow-hidden relative">
      <NetworkBackground />
      
      {/* Navigation */}
      <Navigation />

      {/* Hero Section */}
      <section className="relative z-10 px-6 py-24 min-h-screen flex items-center">
        <HeroVideoBackground />
        <div className="max-w-7xl mx-auto w-full relative">
          {/* Stats Grid - Higher up position (where text was) */}
          <div className="absolute top-1/3 left-1/2 transform -translate-x-1/2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {stats.map((stat, index) => (
                <div key={index} className="group text-center p-6 bg-neutral-900/30 backdrop-blur-sm border border-neutral-800/50 rounded-2xl hover:bg-neutral-900/50 hover:border-neutral-700/60 transition-all duration-300 transform hover:scale-105 cursor-pointer">
                  <div className={`text-2xl md:text-3xl font-black bg-gradient-to-r ${stat.color} bg-clip-text text-transparent mb-2 group-hover:scale-110 transition-transform duration-300 font-[family-name:var(--font-unbounded)]`}>
                    {stat.value}
                  </div>
                  <div className="text-neutral-400 text-xs font-medium group-hover:text-neutral-300 transition-colors duration-300 font-[family-name:var(--font-spline-sans-mono)]">{stat.label}</div>
                </div>
              ))}
            </div>
            </div>
            
          {/* Left positioned text - Bottom position (where cards were) */}
          {/* 
          <div className="absolute bottom-20 left-0 max-w-2xl">
            <h1 className="text-6xl md:text-8xl font-black leading-tight font-[family-name:var(--font-unbounded)]">
              <div className="bg-gradient-to-r from-white via-neutral-100 to-white bg-clip-text text-transparent">
                Unite Every Chain
              </div>
            </h1>
          </div>
          */}
          
          {/* UNCOMMENT AND ADJUST THE SECTION BELOW */}
          <div className="absolute bottom-12 left-0 max-w-2xl mt-8">
            <h1 className="text-5xl md:text-7xl font-black leading-tight font-[family-name:var(--font-unbounded)]">
              <div className="bg-gradient-to-r from-white via-neutral-100 to-white bg-clip-text text-transparent">
                Unite Every Chain
              </div>
            </h1>
          </div>
          {/* 
          ADJUSTMENT GUIDE:
          - Change "bottom-12" to adjust distance from bottom (bottom-8, bottom-16, bottom-20, etc.)
          - Change "mt-8" to adjust top margin (mt-4, mt-6, mt-10, mt-12, etc.)
          - Change "text-5xl md:text-7xl" to adjust font size:
            * Smaller: text-4xl md:text-6xl
            * Current: text-5xl md:text-7xl  
            * Original: text-6xl md:text-8xl
            * Larger: text-7xl md:text-9xl
          */}
        </div>

        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce cursor-pointer group">
          <div className="p-3 bg-neutral-900/30 backdrop-blur-sm border border-neutral-800/50 rounded-full group-hover:bg-neutral-900/50 transition-all duration-300">
            <ChevronDown className="w-6 h-6 text-orange-400 group-hover:text-orange-300" />
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="relative z-10 px-6 py-24">
        <div className="mesh-gradient-2 absolute inset-0 opacity-30"></div>
        <div className="max-w-6xl mx-auto relative">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-black mb-6 bg-gradient-to-r from-white via-neutral-100 to-white bg-clip-text text-transparent font-[family-name:var(--font-unbounded)]">
              Revolutionary Features
            </h2>
            <p className="text-lg text-neutral-400 max-w-3xl mx-auto font-light font-[family-name:var(--font-spline-sans-mono)]">
              Built with cutting-edge technology for the next generation of <span className="text-orange-400 font-semibold">crosschain DeFi</span>
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div key={index} className="group cursor-pointer">
                <Card className="h-full hover:scale-105 transition-transform duration-500">                  
                  <CardHeader>
                    <div className={`w-16 h-16 bg-gradient-to-br ${feature.gradient} rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-6 transition-all duration-500 shadow-lg shadow-orange-500/20`}>
                      {feature.icon}
                    </div>
                    
                    <CardTitle className="text-xl mb-4 bg-gradient-to-r from-white to-neutral-200 bg-clip-text text-transparent group-hover:from-orange-200 group-hover:to-white transition-all duration-300">
                      {feature.title}
                    </CardTitle>
                  </CardHeader>
                  
                  <CardContent>
                    <p className="text-neutral-400 leading-relaxed text-sm group-hover:text-neutral-300 transition-colors duration-300">
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
      <section id="demo" className="relative z-10 px-6 py-32">
        <div className="mesh-gradient-1 absolute inset-0 opacity-30"></div>
        <div className="relative">
          <InteractiveDemo />
        </div>
      </section>

      {/* How It Works Section - NEW COLOR THEME */}
      <section id="how-it-works" className="relative z-10 py-32 bg-black">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-900/10 via-yellow-900/5 to-orange-900/10"></div>
        <div className="relative">
          <FusionTimeline />
        </div>
      </section>

      {/* Technical Deep Dive - NEW COLOR THEME */}
      <section id="technical" className="relative z-10 px-6 py-32 bg-gradient-to-br from-black via-orange-950/20 to-black">
        <div className="absolute inset-0 bg-gradient-to-r from-orange-900/10 via-yellow-900/5 to-orange-900/10 opacity-50"></div>
        <div className="relative">
          <TechnicalOverview />
        </div>
      </section>

      {/* Footer - NEW COLOR THEME */}
      <footer className="relative z-10 px-6 py-20 border-t border-orange-800/30 bg-black">
        <div className="absolute inset-0 bg-gradient-to-br from-orange-900/10 to-yellow-900/5"></div>
        <div className="max-w-7xl mx-auto relative">
          <div className="grid md:grid-cols-4 gap-12 mb-16">
            <div className="md:col-span-2">
              <div className="flex items-center space-x-3 mb-6">
                <div className="w-10 h-10 bg-gradient-to-br from-orange-600 via-yellow-600 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/25">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold font-[family-name:var(--font-unbounded)] bg-gradient-to-r from-orange-400 via-yellow-400 to-orange-400 bg-clip-text text-transparent">
                  Unite DeFi
                </span>
              </div>
              <p className="text-neutral-300 leading-relaxed mb-6 max-w-md font-[family-name:var(--font-spline-sans-mono)]">
                The future of cross-chain DeFi is here. Unite every blockchain, empower every trader, and unlock infinite possibilities with our revolutionary protocol.
              </p>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-6 font-[family-name:var(--font-unbounded)]">Product</h4>
              <div className="space-y-3">
                {[
                  { name: 'Swap', href: '/swap' },
                  { name: 'Bridge', href: '#' },
                  { name: 'Analytics', href: '#' },
                  { name: 'API', href: '#' }
                ].map((item) => (
                  <Link key={item.name} href={item.href} className="block text-neutral-300 hover:text-orange-400 transition-colors duration-300 font-[family-name:var(--font-spline-sans-mono)]">
                    {item.name}
                  </Link>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-white font-semibold mb-6 font-[family-name:var(--font-unbounded)]">Resources</h4>
              <div className="space-y-3">
                {['Documentation', 'Tutorials', 'Blog', 'Support'].map((item) => (
                  <a key={item} href="#" className="block text-neutral-300 hover:text-orange-400 transition-colors duration-300 font-[family-name:var(--font-spline-sans-mono)]">
                    {item}
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-orange-800/30 pt-8 flex flex-col md:flex-row items-center justify-between">
            <p className="text-neutral-400 text-sm mb-4 md:mb-0 font-[family-name:var(--font-spline-sans-mono)]">
              © 2024 Unite DeFi. All rights reserved. Built for the future of finance.
            </p>
            <div className="flex space-x-6 text-sm">
              {['Privacy Policy', 'Terms of Service', 'Cookie Policy'].map((item) => (
                <a key={item} href="#" className="text-neutral-400 hover:text-orange-400 transition-colors duration-300 font-[family-name:var(--font-spline-sans-mono)]">
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