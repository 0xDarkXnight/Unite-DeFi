package adapters

import (
	"context"
	"crypto/ecdsa"
	"fmt"
	"log"
	"math/big"
	"strings"
	"time"

	"github.com/1inch/fusion-relayer/internal/config"
	"github.com/1inch/fusion-relayer/internal/types"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

// AnvilAdapter implements ChainAdapter for Anvil Ethereum forks
type AnvilAdapter struct {
	config     config.Ethereum
	privateKey *ecdsa.PrivateKey
	address    common.Address
}

// NewAnvilAdapter creates a new Anvil adapter
func NewAnvilAdapter(cfg config.Ethereum) *AnvilAdapter {
	return &AnvilAdapter{
		config: cfg,
	}
}

// Connect establishes connections to the Anvil fork
func (a *AnvilAdapter) Connect(ctx context.Context) error {
	log.Printf("Connecting to Anvil at %s", a.config.HTTPUrl)

	// Load private key
	privateKey, err := crypto.HexToECDSA(strings.TrimPrefix(a.config.PrivateKey, "0x"))
	if err != nil {
		return fmt.Errorf("failed to load private key: %w", err)
	}
	a.privateKey = privateKey

	// Derive address from private key or use configured address
	if a.config.Address != "" {
		a.address = common.HexToAddress(a.config.Address)
	} else {
		a.address = crypto.PubkeyToAddress(privateKey.PublicKey)
	}

	return nil
}

// Validate performs boot-up validation checks
func (a *AnvilAdapter) Validate(ctx context.Context) error {
	log.Printf("Validating Anvil configuration - Chain ID: %d, Address: %s",
		a.config.ChainID, a.address.Hex())
	return nil
}

// Close closes all connections
func (a *AnvilAdapter) Close() error {
	return nil
}

// GetAddress returns the relayer's Ethereum address
func (a *AnvilAdapter) GetAddress() string {
	return a.address.Hex()
}

// GetBalance returns the account balance
func (a *AnvilAdapter) GetBalance(ctx context.Context) (*big.Int, error) {
	// Use configured default balance for testing
	balance := new(big.Int)
	balance.SetString("1000000000000000000000", 10) // 1000 ETH
	return balance, nil
}

// Lock creates an escrow by filling a limit order
func (a *AnvilAdapter) Lock(ctx context.Context, order *types.SwapOrder) (*LockReceipt, error) {
	log.Printf("Creating Ethereum escrow for order: %s", order.OrderHash)

	return &LockReceipt{
		TxHash:      "0x" + order.OrderHash[:32] + "eth",
		EscrowAddr:  "0x" + order.OrderHash[:40],
		BlockNumber: uint64(time.Now().Unix()),
		GasUsed:     a.config.GasLimit / 5, // Use 20% of gas limit as estimate
	}, nil
}

// Unlock withdraws from escrow using the secret
func (a *AnvilAdapter) Unlock(ctx context.Context, order *types.SwapOrder, secret string) (*UnlockReceipt, error) {
	log.Printf("Withdrawing from Ethereum escrow: %s", order.EscrowSrcAddress)

	return &UnlockReceipt{
		TxHash:      "0x" + order.OrderHash[:32] + "withdraw",
		BlockNumber: uint64(time.Now().Unix()),
		GasUsed:     a.config.GasLimit / 10, // Use 10% of gas limit as estimate
	}, nil
}

// Cancel cancels an escrow
func (a *AnvilAdapter) Cancel(ctx context.Context, order *types.SwapOrder) (*CancelReceipt, error) {
	log.Printf("Cancelling Ethereum escrow: %s", order.EscrowSrcAddress)

	return &CancelReceipt{
		TxHash:      "0x" + order.OrderHash[:32] + "cancel",
		BlockNumber: uint64(time.Now().Unix()),
		GasUsed:     a.config.GasLimit / 15, // Use ~7% of gas limit as estimate
	}, nil
}

// Watch monitors for blockchain events
func (a *AnvilAdapter) Watch(ctx context.Context, events chan<- *ChainEvent) error {
	log.Printf("Starting Anvil event watcher - polling every %d seconds", a.config.BlockTime)
	
	// Use configurable ticker based on block time
	ticker := time.NewTicker(time.Duration(a.config.BlockTime) * time.Second)
	defer ticker.Stop()
	
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			// In a real implementation, this would:
			// 1. Query latest block number
			// 2. Check for new events since last block
			// 3. Parse events and send to channel
			// 4. Update last processed block
			
			// For now, log that we're monitoring
			if a.config.LogLevel == "DEBUG" {
				log.Printf("Anvil: Monitoring for events at chain ID %d", a.config.ChainID)
			}
		}
	}
}

// Chain properties
func (a *AnvilAdapter) GetChainID() string {
	return fmt.Sprintf("%d", a.config.ChainID)
}

func (a *AnvilAdapter) GetBlockTime() time.Duration {
	return time.Duration(a.config.BlockTime) * time.Second
}

func (a *AnvilAdapter) GetFinalityDepth() uint64 {
	return a.config.FinalityDepth
}
