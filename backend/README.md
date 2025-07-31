# Cross-Chain Dutch Auction Backend

Backend system for cross-chain Dutch auction with automated resolvers and relayer service.

## Quick Start

```bash
# Install dependencies
npm install

# Start all services
npm start

# Development mode with auto-restart
npm run dev
```

## Environment Setup

Copy and configure environment variables:
```bash
# Required environment variables
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/cross-chain-auction
REDIS_HOST=localhost
REDIS_PORT=6379

# Blockchain RPC URLs
ETHEREUM_RPC_URL=https://eth-mainnet.alchemyapi.io/v2/YOUR_KEY
POLYGON_RPC_URL=https://polygon-rpc.com

# Resolver Configuration
RESOLVER_PRIVATE_KEY=0x...
RESOLVER_ADDRESS=0x...

# Security
JWT_SECRET=your-secret-key
```

## Services

- **Relayer Service**: Manages secrets and validates escrows
- **Resolver Bots**: Automated Dutch auction bidding
- **API Server**: REST endpoints for frontend integration

## API Endpoints

```
GET    /api/orders              # List orders
POST   /api/orders              # Create order
GET    /api/orders/:id          # Get order details
GET    /api/system/status       # System health
```

## Dependencies

- MongoDB 5.0+
- Redis 6.0+
- Node.js 18+