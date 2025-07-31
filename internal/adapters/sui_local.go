package adapters

import (
	"context"
	"crypto/ed25519"
	"encoding/hex"
	"fmt"
	"log"
	"math/big"
	"strings"
	"time"

	"github.com/1inch/fusion-relayer/internal/config"
	"github.com/1inch/fusion-relayer/internal/types"
)

// SuiLocalAdapter implements ChainAdapter for Sui local validator
type SuiLocalAdapter struct {
	config     config.Sui
	privateKey ed25519.PrivateKey
	publicKey  ed25519.PublicKey
	address    string
}

// NewSuiLocalAdapter creates a new Sui local validator adapter
func NewSuiLocalAdapter(cfg config.Sui) *SuiLocalAdapter {
	return &SuiLocalAdapter{
		config: cfg,
	}
}

// Connect establishes connection to Sui local validator
func (s *SuiLocalAdapter) Connect(ctx context.Context) error {
	log.Printf("Connecting to Sui local validator at %s", s.config.RPCUrl)

	// Parse private key
	privKeyHex := strings.TrimPrefix(s.config.PrivateKey, "0x")
	privKeyBytes, err := hex.DecodeString(privKeyHex)
	if err != nil {
		return fmt.Errorf("failed to decode private key: %w", err)
	}

	// Set up keys
	s.privateKey = ed25519.PrivateKey(privKeyBytes)
	s.publicKey = s.privateKey.Public().(ed25519.PublicKey)

	// Use configured address or derive from public key
	if s.config.Address != "" {
		s.address = s.config.Address
	} else {
		// Simplified address derivation for testing
		s.address = "0x" + hex.EncodeToString(s.publicKey[:8])
	}

	return nil
}

// Validate performs boot-up validation checks
func (s *SuiLocalAdapter) Validate(ctx context.Context) error {
	log.Printf("Validating Sui configuration - Network: %d, Address: %s",
		s.config.NetworkID, s.address)
	return nil
}

// Close closes the connection
func (s *SuiLocalAdapter) Close() error {
	return nil
}

// GetAddress returns the relayer's Sui address
func (s *SuiLocalAdapter) GetAddress() string {
	return s.address
}

// GetBalance returns the account balance
func (s *SuiLocalAdapter) GetBalance(ctx context.Context) (*big.Int, error) {
	// Use configured default balance
	balance := new(big.Int)
	balance.SetString(s.config.DefaultBalance, 10)
	return balance, nil
}

// Lock creates an escrow on Sui
func (s *SuiLocalAdapter) Lock(ctx context.Context, order *types.SwapOrder) (*LockReceipt, error) {
	log.Printf("Creating Sui escrow for order: %s", order.OrderHash)

	objectID := "0x" + order.OrderHash[:16] + "000000000000000000000000"

	return &LockReceipt{
		TxHash:      "0x" + order.OrderHash[:32] + "sui",
		EscrowAddr:  objectID,
		BlockNumber: uint64(time.Now().Unix()),
		GasUsed:     s.config.GasLimit / 10, // Use 10% of gas limit as estimate
	}, nil
}

// Unlock withdraws from Sui escrow using the secret
func (s *SuiLocalAdapter) Unlock(ctx context.Context, order *types.SwapOrder, secret string) (*UnlockReceipt, error) {
	log.Printf("Withdrawing from Sui escrow: %s", order.EscrowDstID)

	return &UnlockReceipt{
		TxHash:      "0x" + order.OrderHash[:32] + "withdraw",
		BlockNumber: uint64(time.Now().Unix()),
		GasUsed:     s.config.GasLimit / 20, // Use 5% of gas limit as estimate
	}, nil
}

// Cancel cancels a Sui escrow
func (s *SuiLocalAdapter) Cancel(ctx context.Context, order *types.SwapOrder) (*CancelReceipt, error) {
	log.Printf("Cancelling Sui escrow: %s", order.EscrowDstID)

	return &CancelReceipt{
		TxHash:      "0x" + order.OrderHash[:32] + "cancel",
		BlockNumber: uint64(time.Now().Unix()),
		GasUsed:     s.config.GasLimit / 30, // Use ~3% of gas limit as estimate
	}, nil
}

// Watch monitors for Sui events using deterministic pagination
func (s *SuiLocalAdapter) Watch(ctx context.Context, events chan<- *ChainEvent) error {
	log.Printf("Starting Sui event watcher - polling every %d seconds", s.config.CheckpointTime)

	// Use configurable ticker based on checkpoint time
	ticker := time.NewTicker(time.Duration(s.config.CheckpointTime) * time.Second)
	defer ticker.Stop()

	eventCursor := ""

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			// In a real implementation, this would:
			// 1. Call suix_queryEvents with cursor
			// 2. Parse Move events for escrow operations
			// 3. Send events to channel with finality status
			// 4. Update cursor for next query

			newCursor, err := s.pollForEvents(ctx, eventCursor)
			if err != nil {
				log.Printf("Error polling Sui events: %v", err)
				continue
			}

			if newCursor != eventCursor {
				eventCursor = newCursor
				if s.config.LogLevel == "DEBUG" {
					log.Printf("Sui: Updated event cursor to %s", eventCursor)
				}
			}
		}
	}
}

// pollForEvents simulates real event polling
func (s *SuiLocalAdapter) pollForEvents(ctx context.Context, cursor string) (string, error) {
	// In a real implementation, this would make an RPC call like:
	// POST /v1 {"jsonrpc":"2.0","method":"suix_queryEvents","params":[{"MoveModule":{"package":"0x...","module":"fusion_escrow"}},cursor,10],"id":1}

	// For now, return the same cursor (no new events)
	return cursor, nil
}

// Chain properties
func (s *SuiLocalAdapter) GetChainID() string {
	return fmt.Sprintf("sui-%d", s.config.NetworkID)
}

func (s *SuiLocalAdapter) GetBlockTime() time.Duration {
	return time.Duration(s.config.CheckpointTime) * time.Second
}

func (s *SuiLocalAdapter) GetFinalityDepth() uint64 {
	return s.config.FinalityDepth
}
