# Cross-Chain Dutch Auction Contracts (EVM)

This directory contains all the smart contracts needed for the cross-chain Dutch auction system based on 1inch Limit Order Protocol and cross-chain atomic swaps.

## 📁 Directory Structure

### 🔧 Core (`/core/`)
- **LimitOrderProtocol.sol** - Main protocol contract for limit orders
- **OrderMixin.sol** - Core order execution logic and validation
- **OrderLib.sol** - Order utility functions and calculations

### 🎯 Extensions (`/extensions/`)
- **DutchAuctionCalculator.sol** - Time-based price decay calculator for Dutch auctions

### 🔗 Escrow (`/escrow/`)
- **EscrowFactory.sol** - Factory contract to create escrow clones
- **BaseEscrowFactory.sol** - Abstract factory base with common functionality
- **EscrowSrc.sol** - Source chain escrow for user tokens
- **EscrowDst.sol** - Destination chain escrow for resolver tokens
- **BaseEscrow.sol** - Abstract base escrow contract
- **Escrow.sol** - Common escrow logic
- **MerkleStorageInvalidator.sol** - Supports partial order fills

### 🤖 Resolver (`/resolver/`)
- **Resolver.sol** - Resolver contract for cross-chain swap execution

### 📋 Interfaces (`/interfaces/`)
All interface definitions for the system contracts

### 📚 Libraries (`/libraries/`)
Supporting libraries for order processing, escrow management, and utilities

### 🧪 Mocks (`/mocks/`)
- **WrappedTokenMock.sol** - WETH mock for testing

## 🚀 Deployment Order

1. **Core Infrastructure** (deploy on all chains)
   ```
   1. LimitOrderProtocol
   2. DutchAuctionCalculator
   3. EscrowFactory
   ```

2. **Resolver Network** (per resolver operator)
   ```
   1. Resolver (one per operator)
   ```

## 🎯 Key Dependencies

- OpenZeppelin Contracts v5.0.0+
- 1inch Solidity Utils v4.0.0+
- 1inch Limit Order Protocol Utils v4.0.0+

## 📝 Notes

### Cross-Chain Flow
1. User creates Dutch auction order on source chain
2. Resolvers compete by monitoring price decay
3. Winner resolver fills order + creates EscrowSrc
4. Resolver deploys EscrowDst on destination chain
5. Atomic swap execution via secret reveal

### Security Considerations
- Safety deposits required for all escrow operations
- Timelocks prevent premature cancellations
- Merkle proofs support secure partial fills
- EIP-712 signatures ensure order authenticity

### Gas Optimization
- Clone pattern for escrow deployment
- Packed data structures for storage efficiency
- Optimized calculation libraries