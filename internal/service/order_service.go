package service

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"math/big"
	"time"

	"github.com/1inch/fusion-relayer/internal/adapters"
	"github.com/1inch/fusion-relayer/internal/config"
	"github.com/1inch/fusion-relayer/internal/database"
	"github.com/1inch/fusion-relayer/internal/ethereum"
	"github.com/1inch/fusion-relayer/internal/scheduler"
	"github.com/1inch/fusion-relayer/internal/sui"
	"github.com/1inch/fusion-relayer/internal/types"
	"github.com/ethereum/go-ethereum/common"
)

// OrderService implements business logic for cross-chain order processing
type OrderService struct {
	config    config.Relayer
	db        *database.OrderRepository
	ethClient *ethereum.Client
	suiClient *sui.Client
	scheduler *scheduler.Scheduler
}

// NewOrderService creates a new order service
func NewOrderService(
	cfg config.Relayer,
	db *database.OrderRepository,
	ethClient *ethereum.Client,
	suiClient *sui.Client,
	sched *scheduler.Scheduler,
) *OrderService {
	service := &OrderService{
		config:    cfg,
		db:        db,
		ethClient: ethClient,
		suiClient: suiClient,
		scheduler: sched,
	}

	// Set this service as the cancel handler for the scheduler
	sched.SetCancelHandler(service)

	return service
}

// NewOrderServiceWithAdapters creates a new order service with chain adapters
func NewOrderServiceWithAdapters(
	cfg config.Relayer,
	db *database.OrderRepository,
	ethAdapter adapters.ChainAdapter,
	suiAdapter adapters.ChainAdapter,
	sched *scheduler.Scheduler,
) *OrderService {
	service := &OrderService{
		config:    cfg,
		db:        db,
		ethClient: nil, // Will be replaced by adapter
		suiClient: nil, // Will be replaced by adapter
		scheduler: sched,
	}

	// Set this service as the cancel handler for the scheduler
	sched.SetCancelHandler(service)

	return service
}

// CreateOrder processes a new order request
func (s *OrderService) CreateOrder(orderReq *types.OrderRequest) (*types.SwapOrder, error) {
	log.Printf("Creating new order from maker: %s", orderReq.Order.Maker)

	// Compute order hash
	orderHash, err := s.computeOrderHash(&orderReq.Order)
	if err != nil {
		return nil, fmt.Errorf("failed to compute order hash: %w", err)
	}

	// Verify order signature
	if err := s.verifyOrderSignature(&orderReq.Order, orderReq.Signature, orderHash); err != nil {
		return nil, fmt.Errorf("invalid order signature: %w", err)
	}

	// Generate secret hash for HTLC
	secretHash, err := s.generateSecretHash()
	if err != nil {
		return nil, fmt.Errorf("failed to generate secret hash: %w", err)
	}

	// Encode original order as JSON
	originalOrderJSON, err := json.Marshal(orderReq.Order)
	if err != nil {
		return nil, fmt.Errorf("failed to encode original order: %w", err)
	}

	// Create swap order record
	order := &types.SwapOrder{
		OrderHash:       orderHash,
		State:           types.StateNew,
		Maker:           orderReq.Order.Maker,
		MakerSuiAddress: orderReq.MakerSuiAddress,
		Receiver:        orderReq.Order.Receiver,
		MakerAsset:      orderReq.Order.MakerAsset,
		TakerAsset:      orderReq.Order.TakerAsset,
		MakingAmount:    orderReq.Order.MakingAmount,
		TakingAmount:    orderReq.Order.TakingAmount,
		SecretHash:      secretHash,
		DeadlineSrc:     orderReq.Order.Salt.Uint64() + s.config.DefaultSrcTimeoutOffset,
		DeadlineDst:     orderReq.Order.Salt.Uint64() + s.config.DefaultDstTimeoutOffset,
		OriginalOrder:   originalOrderJSON,
		Signature:       orderReq.Signature,
		Extension:       orderReq.Extension,
		CreatedAt:       time.Now(),
		UpdatedAt:       time.Now(),
	}

	// Save to database
	if err := s.db.CreateOrder(order); err != nil {
		return nil, fmt.Errorf("failed to save order: %w", err)
	}

	// Start async processing
	go s.processOrder(order)

	log.Printf("Order created successfully - Hash: %s", orderHash)
	return order, nil
}

// GetOrderByHash retrieves an order by its hash
func (s *OrderService) GetOrderByHash(hash string) (*types.SwapOrder, error) {
	return s.db.GetOrderByHash(hash)
}

// GetActiveOrders returns all active orders
func (s *OrderService) GetActiveOrders() ([]*types.SwapOrder, error) {
	return s.db.GetActiveOrders()
}

// GetOrdersByMaker returns orders for a specific maker
func (s *OrderService) GetOrdersByMaker(maker string) ([]*types.SwapOrder, error) {
	return s.db.GetOrdersByMaker(maker)
}

// RevealSecret processes secret revelation to complete the swap
func (s *OrderService) RevealSecret(req *types.SecretRequest) error {
	log.Printf("Revealing secret for order: %s", req.OrderHash)

	// Get order from database
	order, err := s.db.GetOrderByHash(req.OrderHash)
	if err != nil {
		return fmt.Errorf("order not found: %w", err)
	}

	// Verify order is in the correct state
	if order.State != types.StateReadyForSecret {
		return fmt.Errorf("order not ready for secret revelation, current state: %s", order.State)
	}

	// Verify secret hash matches
	hash := sha256.Sum256([]byte(req.Secret))
	if hex.EncodeToString(hash[:]) != order.SecretHash {
		return fmt.Errorf("invalid secret provided")
	}

	// Update order with secret
	if err := s.db.UpdateOrderWithSecret(order.ID, req.Secret); err != nil {
		return fmt.Errorf("failed to update order with secret: %w", err)
	}

	// Execute withdrawals on both chains
	go s.executeWithdrawals(order, req.Secret)

	return nil
}

// processOrder handles the async processing of an order
func (s *OrderService) processOrder(order *types.SwapOrder) {
	ctx := context.Background()

	log.Printf("Starting order processing - Hash: %s", order.OrderHash)

	// Step 1: Fill Ethereum order (create EscrowSrc)
	if err := s.fillEthereumOrder(ctx, order); err != nil {
		log.Printf("Failed to fill Ethereum order: %v", err)
		s.db.SetOrderError(order.ID, fmt.Sprintf("Failed to fill Ethereum order: %v", err))
		return
	}

	// Step 2: Create Sui escrow (EscrowDst)
	if err := s.createSuiEscrow(ctx, order); err != nil {
		log.Printf("Failed to create Sui escrow: %v", err)
		s.db.SetOrderError(order.ID, fmt.Sprintf("Failed to create Sui escrow: %v", err))
		return
	}

	// Step 3: Update state to ready for secret
	if err := s.db.UpdateOrderState(order.ID, string(types.StateReadyForSecret)); err != nil {
		log.Printf("Failed to update order state: %v", err)
		return
	}

	log.Printf("Order processing completed - Hash: %s", order.OrderHash)
}

// fillEthereumOrder fills the limit order on Ethereum
func (s *OrderService) fillEthereumOrder(ctx context.Context, order *types.SwapOrder) error {
	log.Printf("Filling Ethereum order - Hash: %s", order.OrderHash)

	// Parse original order
	var limitOrder types.LimitOrder
	if err := json.Unmarshal(order.OriginalOrder, &limitOrder); err != nil {
		return fmt.Errorf("failed to parse original order: %w", err)
	}

	// Create escrow immutables
	safetyDeposit := new(big.Int)
	if s.ethClient != nil {
		// Use configured safety deposit - this will be replaced by adapter pattern
		safetyDeposit.SetString("1000000000000000", 10) // Default 0.001 ETH
	}

	immutables := &types.EscrowImmutables{
		OrderHash:     order.OrderHash,
		Maker:         order.Maker,
		Receiver:      order.Receiver,
		SecretHash:    order.SecretHash,
		MakingAmount:  order.MakingAmount,
		TakingAmount:  order.TakingAmount,
		SafetyDeposit: safetyDeposit,
	}

	// Fill the order
	txHash, err := s.ethClient.FillOrder(ctx, &limitOrder, order.Signature, order.TakingAmount, immutables)
	if err != nil {
		return fmt.Errorf("failed to fill order: %w", err)
	}

	// Update order with Ethereum transaction details
	if err := s.db.UpdateOrderWithEscrowSrc(order.ID, txHash.Hex(), "0x"+order.OrderHash[:40]); err != nil {
		return fmt.Errorf("failed to update order with escrow src: %w", err)
	}

	// Schedule source timeout
	deadlineTime := time.Unix(int64(order.DeadlineSrc), 0)
	s.scheduler.ScheduleSrcTimeout(order.OrderHash, deadlineTime)

	return nil
}

// createSuiEscrow creates an escrow on Sui
func (s *OrderService) createSuiEscrow(ctx context.Context, order *types.SwapOrder) error {
	log.Printf("Creating Sui escrow - Hash: %s", order.OrderHash)

	// Create Sui escrow
	resp, err := s.suiClient.CreateEscrow(
		ctx,
		order.OrderHash,
		order.MakingAmount,
		order.SecretHash,
		order.DeadlineDst,
		order.MakerSuiAddress,
	)
	if err != nil {
		return fmt.Errorf("failed to create Sui escrow: %w", err)
	}

	// Update order with Sui escrow details
	if err := s.db.UpdateOrderWithEscrowDst(order.ID, resp.Hash, resp.Digest); err != nil {
		return fmt.Errorf("failed to update order with escrow dst: %w", err)
	}

	// Schedule destination timeout
	deadlineTime := time.Unix(int64(order.DeadlineDst), 0)
	s.scheduler.ScheduleDstTimeout(order.OrderHash, deadlineTime)

	return nil
}

// executeWithdrawals withdraws from both escrows using the revealed secret
func (s *OrderService) executeWithdrawals(order *types.SwapOrder, secret string) {
	ctx := context.Background()

	log.Printf("Executing withdrawals for order: %s", order.OrderHash)

	// Withdraw from Ethereum escrow
	if order.EscrowSrcAddress != "" {
		// Convert secret to hash format expected by contract
		secretBytes := []byte(secret)
		var secretHash [32]byte
		copy(secretHash[:], secretBytes)

		immutables := &types.EscrowImmutables{
			OrderHash:    order.OrderHash,
			Maker:        order.Maker,
			Receiver:     order.Receiver,
			SecretHash:   order.SecretHash,
			MakingAmount: order.MakingAmount,
			TakingAmount: order.TakingAmount,
		}

		escrowAddr := common.HexToAddress(order.EscrowSrcAddress)
		if _, err := s.ethClient.WithdrawFromEscrow(ctx, escrowAddr, secretHash, immutables); err != nil {
			log.Printf("Failed to withdraw from Ethereum escrow: %v", err)
		}
	}

	// Withdraw from Sui escrow
	if order.EscrowDstID != "" {
		if _, err := s.suiClient.WithdrawFromEscrow(ctx, order.EscrowDstID, secret); err != nil {
			log.Printf("Failed to withdraw from Sui escrow: %v", err)
		}
	}

	// Update order state to executed
	if err := s.db.UpdateOrderState(order.ID, string(types.StateExecuted)); err != nil {
		log.Printf("Failed to update order state to executed: %v", err)
	}

	// Cancel any pending timeouts
	s.scheduler.CancelTimeout(order.OrderHash)

	log.Printf("Withdrawals completed for order: %s", order.OrderHash)
}

// Implement scheduler.CancelHandler interface
func (s *OrderService) CancelEthereumEscrow(ctx context.Context, orderHash string) error {
	log.Printf("Cancelling Ethereum escrow for order: %s", orderHash)

	order, err := s.db.GetOrderByHash(orderHash)
	if err != nil {
		return fmt.Errorf("failed to get order: %w", err)
	}

	if order.EscrowSrcAddress == "" {
		return fmt.Errorf("no Ethereum escrow address for order")
	}

	immutables := &types.EscrowImmutables{
		OrderHash:    order.OrderHash,
		Maker:        order.Maker,
		Receiver:     order.Receiver,
		SecretHash:   order.SecretHash,
		MakingAmount: order.MakingAmount,
		TakingAmount: order.TakingAmount,
	}

	escrowAddr := common.HexToAddress(order.EscrowSrcAddress)
	_, err = s.ethClient.CancelEscrow(ctx, escrowAddr, immutables)
	if err != nil {
		return fmt.Errorf("failed to cancel Ethereum escrow: %w", err)
	}

	// Update order state
	return s.db.UpdateOrderState(order.ID, string(types.StateRefunded))
}

func (s *OrderService) CancelSuiEscrow(ctx context.Context, orderHash string) error {
	log.Printf("Cancelling Sui escrow for order: %s", orderHash)

	order, err := s.db.GetOrderByHash(orderHash)
	if err != nil {
		return fmt.Errorf("failed to get order: %w", err)
	}

	if order.EscrowDstID == "" {
		return fmt.Errorf("no Sui escrow ID for order")
	}

	_, err = s.suiClient.CancelEscrow(ctx, order.EscrowDstID)
	if err != nil {
		return fmt.Errorf("failed to cancel Sui escrow: %w", err)
	}

	// Update order state
	return s.db.UpdateOrderState(order.ID, string(types.StateRefunded))
}

// Helper functions (placeholder implementations)

func (s *OrderService) computeOrderHash(order *types.LimitOrder) (string, error) {
	// This should implement proper EIP-712 hash computation
	// For now, use a simple hash of the order data
	data := fmt.Sprintf("%s%s%s%s%d%d",
		order.Maker, order.Receiver, order.MakerAsset, order.TakerAsset,
		order.MakingAmount.Uint64(), order.TakingAmount.Uint64())

	hash := sha256.Sum256([]byte(data))
	return hex.EncodeToString(hash[:]), nil
}

func (s *OrderService) verifyOrderSignature(order *types.LimitOrder, signature, orderHash string) error {
	// This should implement proper EIP-712 signature verification
	// For now, just check if signature is not empty
	if signature == "" {
		return fmt.Errorf("empty signature")
	}
	return nil
}

func (s *OrderService) generateSecretHash() (string, error) {
	// Generate a random 32-byte secret
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		return "", err
	}

	// Return the hash of the secret
	hash := sha256.Sum256(secret)
	return hex.EncodeToString(hash[:]), nil
}
