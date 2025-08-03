'use client'
import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Zap, Menu, X, ExternalLink, ArrowUpDown } from 'lucide-react';
import { Button } from './ui/Button';
import { CustomConnectButton, MobileCustomConnectButton } from './CustomConnectButton';
import { SuiConnectButton } from './SuiConnectButton';

const Navigation: React.FC = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const pathname = usePathname();

  const navItems = [
    { href: '/', label: 'Home' },
    { href: '/swap', label: 'Swap', icon: <ArrowUpDown className="w-4 h-4" /> },
    { href: '#demo', label: 'Demo', icon: <ArrowUpDown className="w-4 h-4" /> },
  ];

  const isActive = (href: string) => pathname === href;

  return (
    <nav className="px-8 py-6  bg-transparent sticky top-0 z-50">
      <div className="max-w-8xl mx-auto flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center space-x-3 group cursor-pointer">
          <div className="w-11 h-11 bg-gradient-to-br from-orange-600 via-red-600 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-500/25 group-hover:shadow-orange-500/40 transition-all duration-300 group-hover:scale-105">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl font-bold font-[family-name:var(--font-unbounded)] gradient-text">
            Unite DeFi
          </span>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center space-x-8">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`relative px-6 py-3 rounded-xl text-sm font-medium transition-all duration-300 font-[family-name:var(--font-unbounded)] flex items-center space-x-2 ${
                isActive(item.href)
                  ? 'text-white bg-neutral-800/50 border border-neutral-700/50'
                  : 'text-neutral-300 hover:text-white hover:bg-neutral-800/30'
              }`}
            >
              {item.icon && item.icon}
              <span>{item.label}</span>
              {isActive(item.href) && (
                <div className="absolute bottom-0 left-0 w-full h-0.5 bg-gradient-to-r from-orange-400 to-red-400 rounded-full"></div>
              )}
            </Link>
          ))}
        </div>

        {/* Desktop Actions */}
        <div className="hidden md:flex items-center space-x-4">
          <CustomConnectButton />
          <SuiConnectButton />
        </div>

        {/* Mobile Menu Button */}
        <button
          className="md:hidden p-2 bg-neutral-800/50 hover:bg-neutral-800/70 rounded-xl transition-all duration-300 backdrop-blur-sm border border-neutral-700/50"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
        >
          {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Navigation */}
      {isMenuOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-neutral-900/95 backdrop-blur-xl border-b border-neutral-800/50 animate-slideDown">
          <div className="px-6 py-6 space-y-4">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-300 font-[family-name:var(--font-unbounded)] ${
                  isActive(item.href)
                    ? 'text-white bg-neutral-800/50 border border-neutral-700/50'
                    : 'text-neutral-300 hover:text-white hover:bg-neutral-800/30'
                }`}
                onClick={() => setIsMenuOpen(false)}
              >
                {item.icon && item.icon}
                <span>{item.label}</span>
              </Link>
            ))}
            
            <div className="pt-4 border-t border-neutral-800/50 space-y-3">
              <Button variant="outline" size="sm" className="w-full">
                <ExternalLink className="w-4 h-4 mr-2" />
                Documentation
              </Button>
              
              <MobileCustomConnectButton />
              <SuiConnectButton />
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navigation; 