'use client';

import React, { useState } from 'react';
import { Wallet, ChevronDown } from 'lucide-react';
import { Button } from './ui/Button';

// Sui Wallet Connect Button Component
export const SuiConnectButton = () => {
  const [isConnected, setIsConnected] = useState(false);
  
  // Hardcoded Sui address (as requested)
  const suiAddress = "0x9f8cb97360c9606d1c2f85c8bbb64e7a2e1f9d7c4a6b7e8f3a2c5d9e7f8a1b2c3d4";
  
  const handleConnect = () => {
    setIsConnected(true);
  };
  
  const handleDisconnect = () => {
    setIsConnected(false);
  };
  
  if (!isConnected) {
    return (
      <Button
        onClick={handleConnect}
        variant="secondary"
        className="flex items-center space-x-2 px-3 py-2 bg-neutral-800/50 hover:bg-neutral-700/50 border border-neutral-700/50 font-[family-name:var(--font-unbounded)]"
      >
        <Wallet className="w-4 h-4" />
        <span className="text-sm">Connect Sui</span>
      </Button>
    );
  }
  
  return (
    <div className="flex items-center space-x-2">
      {/* Sui Chain Indicator */}
      <Button
        variant="secondary"
        className="flex items-center space-x-2 px-3 py-2 bg-neutral-800/50 hover:bg-neutral-700/50 border border-neutral-700/50 font-[family-name:var(--font-unbounded)]"
      >
        <div
          style={{
            background: 'linear-gradient(135deg, #4FC3F7, #29B6F6)',
            width: 16,
            height: 16,
            borderRadius: 999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '8px',
            fontWeight: 'bold',
            color: 'white'
          }}
        >
          S
        </div>
        <span className="text-xs">Sui</span>
        <ChevronDown className="w-3 h-3" />
      </Button>

      {/* Sui Account Button */}
      <Button
        onClick={handleDisconnect}
        variant="secondary"
        className="flex items-center space-x-2 px-3 py-2 bg-neutral-800/50 hover:bg-neutral-700/50 border border-neutral-700/50 font-[family-name:var(--font-unbounded)]"
      >
        <Wallet className="w-4 h-4" />
        <span className="text-sm">
          {`${suiAddress.slice(0, 6)}...${suiAddress.slice(-4)} (0.442 SUI)`}
        </span>
      </Button>
    </div>
  );
};