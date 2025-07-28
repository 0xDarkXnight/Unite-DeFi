'use client'
import React, { useState, useEffect, useRef } from 'react';
import { ArrowRight, Zap, Globe, Shield, ChevronDown, Menu, X, Github, Sparkles } from 'lucide-react';

const NetworkBackground = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mousePosition = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let animationFrameId: number;
    let time = 0;

    const handleResize = () => {
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const handleMouseMove = (e: MouseEvent) => {
      mousePosition.current = { x: e.clientX, y: e.clientY };
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);
    handleResize();

    type Node = {
      x: number;
      y: number;
      radius: number;
      vx: number;
      vy: number;
      color: string;
      pulsePhase: number;
      connections: Array<{ node: Node; distance: number }>;
    };
    type HexNode = {
      x: number;
      y: number;
      size: number;
      rotation: number;
      rotationSpeed: number;
      opacity: number;
      color: string;
    };
    type EnergyOrb = {
      x: number;
      y: number;
      radius: number;
      vx: number;
      vy: number;
      opacity: number;
      pulseSpeed: number;
    };

    const nodes: Node[] = [];
    const nodeCount = Math.floor((canvas.width * canvas.height) / 50000);
    for (let i = 0; i < nodeCount; i++) {
      nodes.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        radius: Math.random() * 4 + 2,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        color: Math.random() > 0.6 ? 'cyan' : 'teal',
        pulsePhase: Math.random() * Math.PI * 2,
        connections: []
      });
    }

    const hexNodes: HexNode[] = [];
    for (let i = 0; i < 8; i++) {
      hexNodes.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 80 + 60,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.002,
        opacity: Math.random() * 0.1 + 0.05,
        color: Math.random() > 0.5 ? 'cyan' : 'teal'
      });
    }

    const energyOrbs: EnergyOrb[] = [];
    for (let i = 0; i < 6; i++) {
      energyOrbs.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        radius: Math.random() * 200 + 150,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2,
        opacity: Math.random() * 0.08 + 0.02,
        pulseSpeed: Math.random() * 0.01 + 0.005
      });
    }
    const animate = () => {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.08)'; // Very subtle trail effect
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      time += 0.008;

      // Draw energy orbs (ambient lighting)
      energyOrbs.forEach(orb => {
        orb.x += orb.vx;
        orb.y += orb.vy;
        
        if (orb.x < -orb.radius) orb.x = canvas.width + orb.radius;
        if (orb.x > canvas.width + orb.radius) orb.x = -orb.radius;
        if (orb.y < -orb.radius) orb.y = canvas.height + orb.radius;
        if (orb.y > canvas.height + orb.radius) orb.y = -orb.radius;

        const pulse = Math.sin(time * orb.pulseSpeed) * 0.3 + 0.7;
        const gradient = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, orb.radius);
        
        gradient.addColorStop(0, `rgba(6, 182, 212, ${orb.opacity * pulse})`);
        gradient.addColorStop(0.4, `rgba(20, 184, 166, ${orb.opacity * pulse * 0.5})`);
        gradient.addColorStop(1, 'rgba(6, 182, 212, 0)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(orb.x, orb.y, orb.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      

      // Update nodes
      nodes.forEach(node => {
        node.x += node.vx;
        node.y += node.vy;
        node.pulsePhase += 0.02;
        
        if (node.x < 0 || node.x > canvas.width) node.vx *= -1;
        if (node.y < 0 || node.y > canvas.height) node.vy *= -1;
        
        // Mouse interaction
        const dx = mousePosition.current.x - node.x;
        const dy = mousePosition.current.y - node.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const mouseInfluence = Math.max(0, 1 - distance / 150);
        
        if (mouseInfluence > 0) {
          node.vx += dx * 0.00001 * mouseInfluence;
          node.vy += dy * 0.00001 * mouseInfluence;
        }
      });

      // Calculate connections
      const maxDistance = Math.min(canvas.width, canvas.height) * 0.12;
      nodes.forEach(node => {
        node.connections = [];
        nodes.forEach(otherNode => {
          if (node !== otherNode) {
            const dx = node.x - otherNode.x;
            const dy = node.y - otherNode.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < maxDistance) {
              node.connections.push({ node: otherNode, distance });
            }
          }
        });
      });

      // Draw connections
      nodes.forEach(node => {
        node.connections.forEach(connection => {
          const opacity = (1 - connection.distance / maxDistance) * 0.15;
          const pulse = Math.sin(time + node.pulsePhase) * 0.3 + 0.7;
          
          ctx.strokeStyle = node.color === 'cyan' 
            ? `rgba(6, 182, 212, ${opacity * pulse})` 
            : `rgba(20, 184, 166, ${opacity * pulse})`;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(node.x, node.y);
          ctx.lineTo(connection.node.x, connection.node.y);
          ctx.stroke();
        });
      });

      // Draw nodes
      nodes.forEach(node => {
        const dx = mousePosition.current.x - node.x;
        const dy = mousePosition.current.y - node.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const mouseInfluence = Math.max(0, 1 - distance / 150);
        
        const pulse = Math.sin(time + node.pulsePhase) * 0.4 + 0.6;
        const radius = node.radius * (1 + pulse * 0.3 + mouseInfluence * 1.5);
        const opacity = 0.6 + pulse * 0.3 + mouseInfluence * 0.4;
        
        // Node glow
        if (mouseInfluence > 0.1 || node.radius > 4) {
          const glowRadius = radius * 3;
          const gradient = ctx.createRadialGradient(node.x, node.y, radius * 0.2, node.x, node.y, glowRadius);
          
          gradient.addColorStop(0, node.color === 'cyan' 
            ? `rgba(6, 182, 212, ${opacity * 0.8})` 
            : `rgba(20, 184, 166, ${opacity * 0.8})`);
          gradient.addColorStop(1, 'rgba(6, 182, 212, 0)');
          
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(node.x, node.y, glowRadius, 0, Math.PI * 2);
          ctx.fill();
        }
        
        // Node core
        ctx.fillStyle = node.color === 'cyan' 
          ? `rgba(6, 182, 212, ${opacity})` 
          : `rgba(20, 184, 166, ${opacity})`;
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fill();
      });

      // Occasional energy pulses
      if (Math.random() < 0.003) {
        const pulseX = Math.random() * canvas.width;
        const pulseY = Math.random() * canvas.height;
        const maxRadius = 120;
        
        for (let r = 0; r < maxRadius; r += 8) {
          setTimeout(() => {
            if (ctx) {
              const opacity = (maxRadius - r) / maxRadius * 0.3;
              ctx.strokeStyle = `rgba(6, 182, 212, ${opacity})`;
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(pulseX, pulseY, r, 0, Math.PI * 2);
              ctx.stroke();
            }
          }, r * 15);
        }
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, []); // Only run once on mount

  return <canvas ref={canvasRef} className="fixed inset-0 -z-10" />;
};

const FusionPlusLanding = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Removed useEffect for scrollY

  return (
    <div className="min-h-screen bg-transparent text-white overflow-hidden relative">
      {/* Dynamic Network Background */}
      <NetworkBackground />
      
      {/* Subtle overlay for better text readability */}
      <div className="fixed inset-0 bg-slate-950/20 pointer-events-none z-0"></div>

      {/* Enhanced Navigation */}
      <nav className="relative z-50 px-6 py-6 backdrop-blur-xl bg-slate-950/40 border-b border-slate-800/50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3 group cursor-pointer">
            <div className="w-11 h-11 bg-gradient-to-br from-cyan-500 via-teal-500 to-cyan-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/25 group-hover:shadow-cyan-500/40 transition-all duration-300 group-hover:scale-105">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <span className="text-2xl font-bold bg-gradient-to-r from-cyan-400 via-teal-400 to-cyan-300 bg-clip-text text-transparent">
              Fusion+
            </span>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            {['Features', 'Architecture', 'Chains', 'Docs'].map((item) => (
              <a 
                key={item}
                href={`#${item.toLowerCase()}`} 
                className="relative px-4 py-2 text-slate-300 hover:text-white transition-all duration-300 group"
              >
                <span className="relative z-10 font-medium">{item}</span>
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-600/0 via-cyan-600/20 to-cyan-600/0 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                <div className="absolute bottom-0 left-0 w-0 h-0.5 bg-gradient-to-r from-cyan-400 to-teal-400 group-hover:w-full transition-all duration-300"></div>
              </a>
            ))}
          </div>

          <button 
            className="md:hidden relative p-3 bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl hover:bg-slate-800/70 transition-all duration-300"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden absolute top-full left-0 right-0 bg-slate-950/95 backdrop-blur-xl border-b border-slate-800/50 animate-slideDown">
            <div className="px-6 py-6 space-y-4">
              {['Features', 'Architecture', 'Chains', 'Docs'].map((item) => (
                <a 
                  key={item}
                  href={`#${item.toLowerCase()}`} 
                  className="block px-4 py-3 text-slate-300 hover:text-white hover:bg-slate-800/30 rounded-lg transition-all duration-300"
                >
                  {item}
                </a>
              ))}
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section className="relative z-10 px-6 py-24 min-h-screen flex items-center">
        <div className="max-w-7xl mx-auto text-center">
          <div className="mb-16 space-y-8">
            {/* Enhanced Badge */}
            <div className="inline-flex items-center px-6 py-3 bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-full text-sm text-cyan-300 mb-8 shadow-lg shadow-cyan-500/10 hover:shadow-cyan-500/20 transition-all duration-500 cursor-pointer group">
              <Sparkles className="w-4 h-4 mr-2 animate-pulse" />
              <span className="font-semibold">Multi-Chain Fusion Protocol</span>
              <div className="ml-2 w-2 h-2 bg-green-400 rounded-full animate-pulse shadow-sm shadow-green-400/50"></div>
            </div>
            
            {/* Enhanced Title */}
            <h1 className="text-6xl md:text-8xl font-black mb-8 leading-tight">
              <div className="bg-gradient-to-r from-white via-slate-100 to-white bg-clip-text text-transparent mb-4">
                Next-Gen Cross-Chain
              </div>
              <div className="bg-gradient-to-r from-cyan-400 via-teal-400 to-cyan-300 bg-clip-text text-transparent">
                Swap Protocol
              </div>
            </h1>
            
            {/* Enhanced Description */}
            <p className="text-xl md:text-2xl text-slate-300 mb-12 max-w-4xl mx-auto leading-relaxed font-light">
              Extending <span className="text-cyan-400 font-semibold">1inch Fusion+</span> to support multiple non-EVM chains including 
              <span className="text-teal-400 font-semibold"> Sui</span>, 
              <span className="text-cyan-300 font-semibold"> Aptos</span>, and more. 
              Experience <span className="text-emerald-400 font-semibold">seamless cross-chain swaps</span> with enhanced security and efficiency.
            </p>
          </div>

          {/* Enhanced CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mb-20">
            <button className="group relative px-10 py-5 bg-gradient-to-r from-cyan-600 via-teal-600 to-cyan-600 rounded-2xl font-bold text-lg hover:from-cyan-700 hover:via-teal-700 hover:to-cyan-700 transition-all duration-300 transform hover:scale-105 shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 flex items-center space-x-3 backdrop-blur-sm">
              <span>Launch App</span>
              <ArrowRight className="w-6 h-6 group-hover:translate-x-2 transition-transform duration-300" />
              <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </button>
            
            <button className="group px-10 py-5 bg-slate-800/40 backdrop-blur-sm border-2 border-slate-700/50 rounded-2xl font-bold text-lg hover:bg-slate-800/60 hover:border-slate-600/50 transition-all duration-300 transform hover:scale-105 flex items-center space-x-3 shadow-lg shadow-slate-900/20">
              <Github className="w-6 h-6 group-hover:rotate-12 transition-transform duration-300" />
              <span>View Code</span>
            </button>
          </div>

          {/* Enhanced Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-6xl mx-auto">
            {[
              { label: 'Chains Supported', value: '10+', color: 'from-cyan-400 to-teal-400' },
              { label: 'Total Volume', value: '$2.5B+', color: 'from-teal-400 to-emerald-400' },
              { label: 'Transactions', value: '1M+', color: 'from-emerald-400 to-cyan-400' },
              { label: 'Gas Saved', value: '40%', color: 'from-cyan-300 to-teal-300' }
            ].map((stat, index) => (
              <div key={index} className="group text-center p-8 bg-slate-800/20 backdrop-blur-sm border border-slate-700/30 rounded-2xl hover:bg-slate-800/30 hover:border-slate-600/40 transition-all duration-300 transform hover:scale-105 cursor-pointer">
                <div className={`text-4xl md:text-5xl font-black bg-gradient-to-r ${stat.color} bg-clip-text text-transparent mb-3 group-hover:scale-110 transition-transform duration-300`}>
                  {stat.value}
                </div>
                <div className="text-slate-400 text-sm font-medium group-hover:text-slate-300 transition-colors duration-300">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Enhanced Scroll Indicator */}
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce cursor-pointer group">
          <div className="p-3 bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 rounded-full group-hover:bg-slate-800/50 transition-all duration-300">
            <ChevronDown className="w-6 h-6 text-cyan-400 group-hover:text-cyan-300" />
          </div>
        </div>
      </section>

      {/* Enhanced Features Section */}
      <section id="features" className="relative z-10 px-6 py-32">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-20">
            <h2 className="text-5xl md:text-6xl font-black mb-8 bg-gradient-to-r from-white via-slate-100 to-white bg-clip-text text-transparent">
              Revolutionary Features
            </h2>
            <p className="text-2xl text-slate-400 max-w-4xl mx-auto font-light">
              Built on top of <span className="text-cyan-400 font-semibold">1inch Fusion+</span> with groundbreaking multi-chain capabilities
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-12">
            {[
              {
                icon: <Globe className="w-10 h-10" />,
                title: 'Multi-Chain Support',
                description: 'Seamlessly swap across EVM and non-EVM chains including Sui, Aptos, Solana, and more with unprecedented efficiency.',
                gradient: 'from-cyan-500 via-teal-500 to-cyan-600',
                borderGradient: 'from-cyan-500/20 to-teal-500/20'
              },
              {
                icon: <Shield className="w-10 h-10" />,
                title: 'Enhanced Security',
                description: 'Advanced cryptographic protocols and multi-signature architecture ensure maximum security for all cross-chain transactions.',
                gradient: 'from-teal-500 via-emerald-500 to-teal-600',
                borderGradient: 'from-teal-500/20 to-emerald-500/20'
              },
              {
                icon: <Zap className="w-10 h-10" />,
                title: 'Lightning Fast',
                description: 'Optimized routing algorithms and parallel processing deliver the fastest swap times across all supported blockchains.',
                gradient: 'from-emerald-500 via-cyan-500 to-emerald-600',
                borderGradient: 'from-emerald-500/20 to-cyan-500/20'
              }
            ].map((feature, index) => (
              <div key={index} className="group cursor-pointer">
                <div className={`h-full p-10 bg-slate-800/20 backdrop-blur-sm border border-slate-700/30 rounded-3xl hover:bg-slate-800/30 hover:border-slate-600/40 transition-all duration-500 transform hover:scale-105 relative overflow-hidden`}>
                  
                  <div className={`w-20 h-20 bg-gradient-to-br ${feature.gradient} rounded-2xl flex items-center justify-center mb-8 group-hover:scale-110 group-hover:rotate-6 transition-all duration-500 shadow-lg shadow-cyan-500/20`}>
                    {feature.icon}
                  </div>
                  
                  <h3 className="text-3xl font-bold mb-6 bg-gradient-to-r from-white to-slate-200 bg-clip-text text-transparent group-hover:from-cyan-200 group-hover:to-white transition-all duration-300">
                    {feature.title}
                  </h3>
                  
                  <p className="text-slate-400 leading-relaxed text-lg group-hover:text-slate-300 transition-colors duration-300">
                    {feature.description}
                  </p>

                  {/* Card overlay effect */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${feature.borderGradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-3xl pointer-events-none`}></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <style jsx>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        
        .animate-slideDown {
          animation: slideDown 0.3s ease-out;
        }
      `}</style>
    </div>
  );
};

export default FusionPlusLanding;