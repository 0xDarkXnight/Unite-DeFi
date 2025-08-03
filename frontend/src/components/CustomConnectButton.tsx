'use client';

import React, { useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Wallet, ChevronDown, Copy, ExternalLink, LogOut } from 'lucide-react';
import { Button } from './ui/Button';
import { motion, AnimatePresence } from 'framer-motion';

export const CustomConnectButton = () => {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        authenticationStatus,
        mounted,
      }) => {
        // Note: If your app doesn't use authentication, you
        // can remove all 'authenticationStatus' checks
        const ready = mounted && authenticationStatus !== 'loading';
        const connected =
          ready &&
          account &&
          chain &&
          (!authenticationStatus ||
            authenticationStatus === 'authenticated');

        return (
          <div
            {...(!ready && {
              'aria-hidden': true,
              'style': {
                opacity: 0,
                pointerEvents: 'none',
                userSelect: 'none',
              },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <Button
                    onClick={openConnectModal}
                    variant="gradient"
                    className="flex items-center space-x-2 font-[family-name:var(--font-unbounded)]"
                  >
                    <Wallet className="w-4 h-4" />
                    <span>Connect Wallet</span>
                  </Button>
                );
              }

              if (chain.unsupported) {
                return (
                  <Button
                    onClick={openChainModal}
                    variant="destructive"
                    className="flex items-center space-x-2 font-[family-name:var(--font-unbounded)]"
                  >
                    <span>Wrong network</span>
                  </Button>
                );
              }

              return (
                <div className="flex items-center space-x-2">
                  {/* Chain Selector */}
                  <Button
                    onClick={openChainModal}
                    variant="secondary"
                    className="flex items-center space-x-2 px-3 py-2 bg-neutral-800/50 hover:bg-neutral-700/50 border border-neutral-700/50 font-[family-name:var(--font-unbounded)]"
                  >
                    {chain.hasIcon && (
                      <div
                        style={{
                          background: chain.iconBackground,
                          width: 16,
                          height: 16,
                          borderRadius: 999,
                          overflow: 'hidden',
                        }}
                      >
                        {chain.iconUrl && (
                          <img
                            alt={chain.name ?? 'Chain icon'}
                            src={chain.iconUrl}
                            style={{ width: 16, height: 16 }}
                          />
                        )}
                      </div>
                    )}
                    <span className="text-xs">{chain.name}</span>
                    <ChevronDown className="w-3 h-3" />
                  </Button>

                  {/* Account Button */}
                  <Button
                    onClick={openAccountModal}
                    variant="secondary"
                    className="flex items-center space-x-2 px-3 py-2 bg-neutral-800/50 hover:bg-neutral-700/50 border border-neutral-700/50 font-[family-name:var(--font-unbounded)]"
                  >
                    <Wallet className="w-4 h-4" />
                    <span className="text-sm">
                      {account.displayName}
                      {account.displayBalance
                        ? ` (${account.displayBalance})`
                        : ''}
                    </span>
                  </Button>
                </div>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
};

// Mobile version of the connect button
export const MobileCustomConnectButton = () => {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        authenticationStatus,
        mounted,
      }) => {
        const ready = mounted && authenticationStatus !== 'loading';
        const connected =
          ready &&
          account &&
          chain &&
          (!authenticationStatus ||
            authenticationStatus === 'authenticated');

        return (
          <div
            {...(!ready && {
              'aria-hidden': true,
              'style': {
                opacity: 0,
                pointerEvents: 'none',
                userSelect: 'none',
              },
            })}
            className="w-full"
          >
            {(() => {
              if (!connected) {
                return (
                  <Button
                    onClick={openConnectModal}
                    variant="gradient"
                    className="w-full flex items-center justify-center space-x-2 font-[family-name:var(--font-unbounded)]"
                  >
                    <Wallet className="w-4 h-4" />
                    <span>Connect Wallet</span>
                  </Button>
                );
              }

              if (chain.unsupported) {
                return (
                  <Button
                    onClick={openChainModal}
                    variant="destructive"
                    className="w-full flex items-center justify-center space-x-2 font-[family-name:var(--font-unbounded)]"
                  >
                    <span>Wrong network</span>
                  </Button>
                );
              }

              return (
                <div className="w-full space-y-2">
                  {/* Chain Selector */}
                  <Button
                    onClick={openChainModal}
                    variant="secondary"
                    className="w-full flex items-center justify-center space-x-2 px-3 py-2 bg-neutral-800/50 hover:bg-neutral-700/50 border border-neutral-700/50 font-[family-name:var(--font-unbounded)]"
                  >
                    {chain.hasIcon && (
                      <div
                        style={{
                          background: chain.iconBackground,
                          width: 16,
                          height: 16,
                          borderRadius: 999,
                          overflow: 'hidden',
                        }}
                      >
                        {chain.iconUrl && (
                          <img
                            alt={chain.name ?? 'Chain icon'}
                            src={chain.iconUrl}
                            style={{ width: 16, height: 16 }}
                          />
                        )}
                      </div>
                    )}
                    <span>{chain.name}</span>
                  </Button>

                  {/* Account Button */}
                  <Button
                    onClick={openAccountModal}
                    variant="secondary"
                    className="w-full flex items-center justify-center space-x-2 px-3 py-2 bg-neutral-800/50 hover:bg-neutral-700/50 border border-neutral-700/50 font-[family-name:var(--font-unbounded)]"
                  >
                    <Wallet className="w-4 h-4" />
                    <span className="text-sm">
                      {account.displayName}
                      {account.displayBalance
                        ? ` (${account.displayBalance})`
                        : ''}
                    </span>
                  </Button>
                </div>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}; 