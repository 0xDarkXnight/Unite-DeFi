#!/bin/bash
set -e

echo "=== Cross-Chain Dutch Auction Setup Script ==="
echo ""

# Step 1: Contract Deployment
echo "Step 1: Contract Deployment"
echo "------------------------"
echo "You need to:"
echo "1. Edit contracts_EVM/.env with your wallet private key and Sepolia RPC URL"
echo "2. Make sure you have Sepolia ETH in your wallet"
echo "3. Run the following commands:"
echo ""
echo "   cd contracts_EVM"
echo "   npx hardhat compile"
echo "   npx hardhat run scripts/deploy.js --network sepolia"
echo ""
echo "This will deploy the contracts and create a deployed-addresses.env file"
echo ""

# Step 2: Backend Setup
echo "Step 2: Backend Setup"
echo "-----------------"
echo "After deploying contracts, set up your backend:"
echo ""
echo "1. Create backend/.env file with the following content:"
echo ""
cat << 'EOF'
# Database
SUPABASE_CONNECTION_STRING=your-supabase-connection-string

# Blockchain
SEPOLIA_RPC_URL=your-sepolia-rpc-url

# Contract Addresses (copy from contracts_EVM/deployed-addresses.env)
SEPOLIA_LIMIT_ORDER_PROTOCOL=
SEPOLIA_DUTCH_AUCTION_CALCULATOR=
SEPOLIA_ESCROW_FACTORY=
SEPOLIA_RESOLVER=

# Security (generate with: openssl rand -hex 32)
SECRET_MASTER_KEY=

# Server Configuration
PORT=3003

# Service Configuration
API_ENABLED=true
RELAYER_ENABLED=true
RESOLVER_ENABLED=true

# Resolver Configuration
RESOLVER_ID=resolver-1
RESOLVER_ADDRESS=your-wallet-address
RESOLVER_PRIVATE_KEY=your-wallet-private-key
EOF
echo ""
echo "2. Generate a secure SECRET_MASTER_KEY with: openssl rand -hex 32"
echo "3. Start the backend with: cd backend && node simple-server.js"
echo ""

# Step 3: Testing
echo "Step 3: Testing"
echo "------------"
echo "Test your backend with:"
echo "curl http://localhost:3003/health"
echo "curl http://localhost:3003/api/system/status"
echo ""

echo "=== Setup Instructions Complete ==="
