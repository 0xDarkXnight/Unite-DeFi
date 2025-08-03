# Unite-DeFi

Unite-DeFi is a comprehensive cross-chain decentralized exchange platform that implements advanced limit order protocols and Dutch auction mechanisms. Built on top of the 1inch Limit Order Protocol v4, it enables secure and efficient cross-chain trading with atomic swaps and privacy-preserving features.

## 🏗️ System Architecture

![System Architecture](./assets/architecture-diagram.png)

The system operates through four distinct phases:

### Phase 1: Announcement
- **Maker** initiates fusion orders with EIP-712 hash signatures
- **Relayer Service** processes and shares orders with resolvers
- **Resolvers** receive order information and prepare for execution

### Phase 2: Deposit
- Tokens are deposited into escrow contracts on both source and destination chains
- **EscrowSrcSepolia** handles deposits on the source chain
- **EscrowDstSui Devnet** manages deposits on the destination chain

### Phase 3: Withdrawal
- Secure withdrawal process using secrets shared after finality
- Cross-chain coordination ensures atomic swaps

### Phase 4: Recovery (Optional)
- Fallback mechanism for failed transactions
- Ensures user funds are never permanently locked

## 🌟 Key Features

### Cross-Chain Trading
- **Multi-chain Support**: Native support for Ethereum, Sepolia testnet, and Sui networks
- **Atomic Swaps**: Guaranteed execution or complete rollback
- **Bridge-Free**: Direct cross-chain trading without traditional bridges

### Advanced Order Types
- **Limit Orders**: Classic buy/sell orders at specific prices
- **Dutch Auctions**: Time-decreasing price mechanisms
- **Range Orders**: Dynamic pricing based on volume
- **Conditional Orders**: Execute based on on-chain conditions

### Privacy & Security
- **EIP-712 Signatures**: Secure order signing standard
- **Escrow Protection**: Funds secured in smart contracts
- **Resolver Network**: Decentralized execution layer
- **Secret Sharing**: Privacy-preserving execution mechanism

## 🛠️ Technology Stack

### Smart Contracts
- **EVM Contracts** (`/contracts_EVM/`)
  - Solidity-based contracts for Ethereum-compatible chains
  - Foundry framework for testing and deployment
  - Integration with 1inch Limit Order Protocol

- **Sui Contracts** (`/contracts_sui/`)
  - Move-based contracts for Sui blockchain
  - Native Sui object model implementation

### Backend Services
- **API Server** (`/backend/`)
  - Node.js with Express framework
  - RESTful API endpoints for order management
  - WebSocket support for real-time updates
  - Database integration with Supabase

### Frontend Application
- **React/Next.js** (`/frontend/`)
  - Modern web interface built with Next.js 15
  - TypeScript for type safety
  - Tailwind CSS for styling
  - RainbowKit for wallet connections
  - Wagmi for Ethereum interactions

## 🚀 Quick Start

### Prerequisites
- Node.js v18+ 
- npm or yarn
- Git

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/your-username/Unite-DeFi.git
cd Unite-DeFi
```

2. **Install dependencies**
```bash
# Root dependencies
npm install

# Frontend dependencies
cd frontend && npm install && cd ..

# Backend dependencies  
cd backend && npm install && cd ..

# Contract dependencies
cd contracts_EVM && npm install && cd ..
```

3. **Environment Setup**
```bash
# Copy environment files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

4. **Start the development environment**
```bash
# Start backend services
./setup-backend.sh

# In a new terminal, start frontend
cd frontend && npm run dev
```

## 📁 Project Structure

```
Unite-DeFi/
├── backend/                 # Node.js API server
│   ├── api/                # API routes and middleware
│   ├── config/             # Configuration files
│   ├── database/           # Database models and connections
│   ├── relayer/            # Relayer service components
│   └── resolver/           # Resolver bots and services
├── contracts_EVM/          # Ethereum smart contracts
│   ├── src/                # Solidity contract sources
│   ├── script/             # Deployment scripts
│   └── test/               # Contract tests
├── contracts_sui/          # Sui smart contracts
│   ├── sources/            # Move contract sources
│   └── tests/              # Move tests
└── frontend/               # React/Next.js frontend
    ├── src/app/            # Next.js app directory
    ├── src/components/     # React components
    ├── src/hooks/          # Custom React hooks
    └── src/lib/            # Utility libraries
```

## 🔧 Development

### Running Tests
```bash
# Smart contract tests (EVM)
cd contracts_EVM
forge test

# Smart contract tests (Sui)
cd contracts_sui
sui move test

# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test
```

### Building for Production
```bash
# Build all components
npm run build

# Build specific components
cd frontend && npm run build     # Frontend
cd backend && npm run build      # Backend
cd contracts_EVM && forge build  # EVM contracts
```

### Deployment

#### Smart Contracts
```bash
# Deploy EVM contracts
cd contracts_EVM
forge script script/Deploy.s.sol --broadcast --rpc-url $RPC_URL

# Deploy Sui contracts
cd contracts_sui
sui client publish --gas-budget 50000000
```

#### Backend Services
```bash
cd backend
npm run deploy
```

#### Frontend Application
```bash
cd frontend
npm run build
npm run export  # For static deployment
```

## 🔐 Security Features

- **Multi-signature Support**: Contract-level multi-sig capabilities
- **Time-locked Operations**: Configurable time delays for sensitive operations
- **Emergency Pause**: Circuit breaker functionality
- **Upgradeable Contracts**: Proxy pattern for contract upgrades
- **Access Control**: Role-based permissions system

## 🌐 Supported Networks

### Mainnet
- Ethereum
- Sui

### Testnets
- Sepolia (Ethereum)
- Sui Devnet

## 📖 API Documentation

### Order Management
- `POST /api/orders` - Create new order
- `GET /api/orders` - Retrieve orders
- `PUT /api/orders/:id` - Update order
- `DELETE /api/orders/:id` - Cancel order

### Escrow Operations
- `POST /api/escrows` - Create escrow
- `GET /api/escrows/:id` - Get escrow status
- `POST /api/escrows/:id/deposit` - Deposit funds
- `POST /api/escrows/:id/withdraw` - Withdraw funds

### System Status
- `GET /api/system/health` - System health check
- `GET /api/system/stats` - Platform statistics

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

## 🙏 Acknowledgments

- Built on [1inch Limit Order Protocol v4](https://docs.1inch.io/docs/limit-order-protocol/introduction)
- Powered by [Foundry](https://book.getfoundry.sh/) for EVM development
- Utilizes [Sui Move](https://sui.io/) for next-generation blockchain functionality
- Frontend built with [Next.js](https://nextjs.org/) and [React](https://reactjs.org/)

## 📞 Support

- **Documentation**: [Link to docs]
- **Discord**: [Community Discord]
- **Twitter**: [@Unite_DeFi]
- **Email**: support@unite-defi.com

---

**Disclaimer**: This software is in active development. Use at your own risk and never invest more than you can afford to lose.