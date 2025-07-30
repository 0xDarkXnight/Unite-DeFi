package adapters

import (
	"context"
	"math/big"
	"time"

	"github.com/1inch/fusion-relayer/internal/types"
)

// ChainAdapter defines the interface for blockchain interactions
type ChainAdapter interface {
	// Connection and validation
	Connect(ctx context.Context) error
	Validate(ctx context.Context) error
	Close() error

	// Account management
	GetAddress() string
	GetBalance(ctx context.Context) (*big.Int, error)

	// Escrow operations
	Lock(ctx context.Context, order *types.SwapOrder) (*LockReceipt, error)
	Unlock(ctx context.Context, order *types.SwapOrder, secret string) (*UnlockReceipt, error)
	Cancel(ctx context.Context, order *types.SwapOrder) (*CancelReceipt, error)

	// Event watching
	Watch(ctx context.Context, events chan<- *ChainEvent) error

	// Chain properties
	GetChainID() string
	GetBlockTime() time.Duration
	GetFinalityDepth() uint64
}

// LockReceipt represents the result of creating an escrow
type LockReceipt struct {
	TxHash      string
	EscrowAddr  string
	BlockNumber uint64
	GasUsed     uint64
}

// UnlockReceipt represents the result of withdrawing from escrow
type UnlockReceipt struct {
	TxHash      string
	BlockNumber uint64
	GasUsed     uint64
}

// CancelReceipt represents the result of cancelling an escrow
type CancelReceipt struct {
	TxHash      string
	BlockNumber uint64
	GasUsed     uint64
}

// ChainEvent represents a blockchain event
type ChainEvent struct {
	Type        string
	OrderHash   string
	EscrowAddr  string
	TxHash      string
	BlockNumber uint64
	Secret      *string
	IsFinalized bool
}
