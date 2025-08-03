<div align="center">
    <h1>🚀 Unite DeFi</h1>
    <p><strong>Cross-Chain Dutch Auction Protocol with Limit Orders</strong></p>
    <p>Building the future of decentralized cross-chain trading</p>
</div>

<div align="center">
    <img src="https://img.shields.io/badge/Status-Testing%20Phase-orange" alt="Testing Phase">
    <img src="https://img.shields.io/badge/Chain-Sepolia%20Testnet-blue" alt="Sepolia Testnet">
    <img src="https://img.shields.io/badge/License-MIT-green" alt="MIT License">
</div>

---

## 📋 Project Overview

**Unite DeFi** is an innovative cross-chain Dutch auction protocol that combines the efficiency of limit orders with the dynamic pricing of Dutch auctions. This project enables seamless trading across multiple blockchain networks with atomic swaps and advanced order management.

### 🎯 Current Status
**⚠️ This is a testing phase implementation for Sepolia testnet only.**
- This is one of the iterations and not the final codebase
- Currently testing on Sepolia chain, not the full cross-chain protocol
- All features are in development and testing phase
- Not production-ready

---

## 🏗️ Architecture

### Smart Contracts (`contracts_EVM/`)
- **`SimpleLimitOrderProtocol.sol`** - Core limit order functionality
- **`SimpleDutchAuctionCalculator.sol`** - Dynamic pricing calculations
- **`SimpleEscrowFactory.sol`** - Cross-chain escrow management
- **`SimpleEscrowSrc.sol`** - Source chain escrow contracts
- **`SimpleEscrowDst.sol`** - Destination chain escrow contracts
- **`SimpleResolver.sol`** - Order resolution and execution

### Backend (`backend/`)
- **API Server** - RESTful API for order management
- **Relayer Service** - Cross-chain transaction relaying
- **Resolver Bot** - Automated order execution
- **Database** - Order tracking and state management

### Frontend (`frontend/`)
- **Next.js Application** - Modern React-based UI
- **Wallet Integration** - RainbowKit + Wagmi
- **Order Management** - Create, view, and manage orders
- **Real-time Updates** - Live order status tracking

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn
- MetaMask or compatible wallet
- Sepolia testnet ETH

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/0xDarkXnight/Unite-DeFi.git
cd Unite-DeFi
```

2. **Install dependencies**
```bash
# Root dependencies
npm install

# Backend dependencies
cd backend
npm install

# Frontend dependencies
cd ../frontend
npm install
```

3. **Environment Setup**
```bash
# Copy environment files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# Configure your environment variables
```

4. **Start Development Servers**
```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
cd frontend
npm run dev

# Terminal 3: Smart Contract Deployment (if needed)
cd contracts_EVM
npx hardhat deploy --network sepolia
```

---

## 🔧 Features

### Core Functionality
- **Cross-Chain Dutch Auctions** - Dynamic pricing across networks
- **Limit Orders** - Traditional limit order functionality
- **Atomic Swaps** - Secure cross-chain token exchanges
- **Escrow System** - Trustless cross-chain asset management
- **Order Resolution** - Automated order execution

### Advanced Features
- **Dynamic Pricing** - Real-time price calculations
- **Multi-Chain Support** - Extensible for multiple networks
- **Gas Optimization** - Efficient transaction handling
- **Security** - Comprehensive safety measures

---

## 📚 Documentation

- **Smart Contracts**: See `contracts_EVM/` for contract documentation
- **API Reference**: Backend API documentation in `backend/README.md`
- **Frontend Guide**: UI/UX documentation in `frontend/README.md`
- **Deployment**: See `contracts_EVM/deploy.js` for deployment scripts

---

## 🧪 Testing

### Smart Contracts
```bash
cd contracts_EVM
npx hardhat test
```

### Backend API
```bash
cd backend
npm test
```

### Frontend
```bash
cd frontend
npm test
```

---

## 🔒 Security

**⚠️ Security Notice**
- This is a testing implementation
- Not audited for production use
- Use only on testnets
- Do not use with real funds

### Security Features
- EIP-712 signature verification
- Reentrancy protection
- Access control mechanisms
- Comprehensive input validation

---

## 🤝 Contributing

We welcome contributions! Please see our contributing guidelines:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

### Development Guidelines
- Follow Solidity best practices
- Write comprehensive tests
- Update documentation
- Use conventional commits

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

---

## 🙏 Acknowledgments

- Built on the foundation of 1inch Limit Order Protocol
- Inspired by cross-chain DeFi innovations
- Community-driven development

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/0xDarkXnight/Unite-DeFi/issues)
- **Discussions**: [GitHub Discussions](https://github.com/0xDarkXnight/Unite-DeFi/discussions)
- **Documentation**: See individual component READMEs

---

<div align="center">
    <p><strong>🚧 This project is in active development. Use at your own risk. 🚧</strong></p>
    <p>Built with ❤️ for the DeFi community</p>
</div>
