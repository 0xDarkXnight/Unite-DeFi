# Fusion+ Cross-Chain Relayer

A modular Go-based relayer for Fusion+ cross-chain atomic swaps between Ethereum and Sui blockchain forks. This implementation prioritizes minimal external dependencies and uses the Go standard library wherever possible.

## Architecture

The relayer implements the **ChainAdapter pattern** for modular blockchain interactions, allowing easy integration of additional chains in the future.

### Fork-Specific Design

This relayer is optimized for development and testing using blockchain forks:

- **Anvil** (Ethereum mainnet fork) - All canonical 1inch contracts are pre-deployed
- **Sui local validator** - Clean genesis with HTLC Move packages

## Key Features

- **Modular Design**: ChainAdapter interface for easy chain integration
- **Fork Coordination**: Boot sequence validates chain configurations and coordinates block times
- **Deterministic Address Calculation**: CREATE2 escrow addresses on Ethereum
- **Event Finality**: Configurable finality depths to handle re-orgs
- **Timeout Management**: Coordinated deadline handling across chains
- **Minimal Dependencies**: Uses Go standard library wherever possible

## Quick Start

### 1. Prerequisites

```bash
# Install required tools
brew install foundry  # for anvil
brew install sui      # for sui-test-validator
```

### 2. Start Blockchain Forks

```bash
# Start both Anvil and Sui local validator
make start-forks

# This will:
# - Fork Ethereum mainnet at block 19,000,000
# - Start Sui local validator with genesis configuration
# - Validate that 1inch contracts exist on the fork
# - Pre-fund relayer accounts
```

### 3. Configure Environment

```bash
cp .env.example .env
# Edit .env with your configuration
```

### 4. Setup Database and Run

```bash
# Setup PostgreSQL and run migrations
make dev-setup
make migrate

# Build and run the relayer
make run
```

### 5. Stop Everything

```bash
make stop-forks
make dev-stop
```

## Development Workflow

The relayer implements the **mini-mainnet pattern** for rapid, repeatable testing:

### Boot Sequence

1. **Connect** to Anvil HTTP/WS and Sui RPC endpoints
2. **Validate** chain IDs and contract deployments
3. **Check balances** and ensure adequate funding
4. **Coordinate deadlines** based on block/checkpoint times
5. **Test deterministic address calculations**

### Block Time Coordination

The relayer automatically coordinates deadlines based on the slower chain:

```
# If Sui checkpoints (4s) > Ethereum blocks (1s):
deadlineDst (Sui) = now + 3 minutes
deadlineSrc (Eth) = now + 7 minutes
```

### Event Finality

- **Anvil**: Instant finality (1 block for forks)
- **Sui Local**: Instant finality (1 checkpoint for local validator)
- **Production**: Configurable depths (6+ blocks for Ethereum, 2+ checkpoints for Sui)

## Configuration

### Ethereum (Anvil Fork)

```env
ETH_HTTP_URL=http://127.0.0.1:8545
ETH_WS_URL=ws://127.0.0.1:8545
ETH_CHAIN_ID=1
ETH_BLOCK_TIME=1
ETH_FINALITY_DEPTH=1
ETH_IS_FORK=true
ETH_LIMIT_ORDER_PROTOCOL_ADDRESS=0x1111111254EEB25477B68fb85Ed929f73A960582
```

### Sui (Local Validator)

```env
SUI_RPC_URL=http://127.0.0.1:9000
SUI_NETWORK_ID=2
SUI_CHECKPOINT_TIME=4
SUI_FINALITY_DEPTH=1
SUI_IS_LOCAL_VALIDATOR=true
```

## API Endpoints

- `POST /orders` - Submit a new cross-chain order
- `GET /orders/:hash` - Get order status
- `GET /orders` - List active orders
- `POST /secret` - Reveal secret to complete swap
- `GET /health` - Health check

## State Machine

```
NEW → ETH_LOCKED → SUI_LOCKED → READY_FOR_SECRET → EXECUTED
  ↓       ↓            ↓              ↓
REFUNDED ← REFUNDED ← REFUNDED ← REFUNDED
```

## Security Features

- **Hash Time-Locked Contracts (HTLC)** on both chains
- **Safety deposits** to incentivize proper behavior
- **Configurable timeouts** with automatic cancellation
- **Secret hash verification** before fund release
- **Re-org protection** with finality depth checking

## Extending to Other Chains

The ChainAdapter interface makes it easy to add new chains:

```go
type ChainAdapter interface {
    Connect(ctx context.Context) error
    Validate(ctx context.Context) error
    Lock(ctx context.Context, order *types.SwapOrder) (*LockReceipt, error)
    Unlock(ctx context.Context, order *types.SwapOrder, secret string) (*UnlockReceipt, error)
    Cancel(ctx context.Context, order *types.SwapOrder) (*CancelReceipt, error)
    Watch(ctx context.Context, events chan<- *ChainEvent) error
    // ... other methods
}
```

Examples:

- **Polygon Fork**: `adapter/polygon.go` using Hardhat node
- **Aptos Local**: `adapter/aptos.go` using Aptos local node
- **Arbitrum Fork**: `adapter/arbitrum.go` using Anvil

## Monitoring and Logs

```bash
# View real-time logs
make logs

# Example log output:
[eth] EscrowSrcCreated 0x8f... hash=0xb3...
[sui] EscrowDstCreated object=0x9ab1...
[state] READY_FOR_SECRET
[api] secret accepted for order 0xb3...
[sui] EscrowWithdrawn ✓
[eth] EscrowSrcWithdrawn ✓
[state] EXECUTED in 28.4s
```

## Testing

```bash
# Run unit tests
make test

# Start development environment and run E2E tests
make dev
node scripts/e2eEthToSui.js
```

## Future Enhancements

- [ ] Production-ready Ethereum client with full ABI support
- [ ] Real Sui SDK integration (currently mocked)
- [ ] Advanced CREATE2 escrow factory integration
- [ ] MEV protection and gas optimization
- [ ] Multi-signature relayer support
- [ ] Advanced monitoring and alerting
- [ ] Cross-chain fee optimization

## License

MIT License
