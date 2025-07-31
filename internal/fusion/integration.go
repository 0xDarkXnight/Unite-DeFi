package fusion

import (
	"context"
	"fmt"
	"log"
	"math/big"
	"time"

	"github.com/1inch/fusion-relayer/internal/config"
	"github.com/1inch/fusion-relayer/internal/database"
	"github.com/1inch/fusion-relayer/internal/types"
)

// FusionIntegration integrates all Fusion+ components with the existing relayer
type FusionIntegration struct {
	// Core Fusion+ services
	relayerService     *RelayerService
	auctionEngine      *AuctionEngine
	secretManager      *SecretManager
	timelockManager    *TimelockManager
	safetyManager      *SafetyDepositManager
	partialFillManager *PartialFillManager
	stateMachine       *FusionStateMachine

	// API server
	apiServer *FusionAPIServer

	// Configuration
	config *FusionConfig

	// Database connection
	orderRepo *database.OrderRepository
}

// FusionConfig represents configuration for the entire Fusion+ system
type FusionConfig struct {
	Relayer       config.Relayer
	API           config.API
	Timelock      *types.TimelockConfig
	SafetyDeposit *SafetyDepositConfig
	PartialFill   *PartialFillConfig
}

// NewFusionIntegration creates a fully integrated Fusion+ system
func NewFusionIntegration(cfg *FusionConfig, orderRepo *database.OrderRepository) (*FusionIntegration, error) {
	log.Println("Initializing Fusion+ integration")

	// Create secret manager
	secretManager := NewSecretManager(cfg.Timelock)

	// Create timelock manager
	timelockManager := NewTimelockManager(cfg.Timelock)

	// Create safety deposit manager
	safetyManager := NewSafetyDepositManager(cfg.SafetyDeposit)

	// Create partial fill manager
	partialFillManager := NewPartialFillManager(cfg.PartialFill)

	// Create state machine
	stateMachine := NewFusionStateMachine()

	// Create auction engine
	auctionEngine := NewAuctionEngine()

	// Create relayer service
	relayerService := NewRelayerService(cfg.Timelock)

	// Create API server
	apiServer := NewFusionAPIServer(
		cfg.API,
		relayerService,
		auctionEngine,
		secretManager,
		timelockManager,
		safetyManager,
		partialFillManager,
		nil, // No resolver simulator in production
		stateMachine,
	)

	integration := &FusionIntegration{
		relayerService:     relayerService,
		auctionEngine:      auctionEngine,
		secretManager:      secretManager,
		timelockManager:    timelockManager,
		safetyManager:      safetyManager,
		partialFillManager: partialFillManager,
		stateMachine:       stateMachine,
		apiServer:          apiServer,
		config:             cfg,
		orderRepo:          orderRepo,
	}

	// Wire up component interactions
	integration.setupInterconnections()

	log.Println("Fusion+ integration initialized successfully")
	return integration, nil
}

// setupInterconnections wires up all the components to work together
func (fi *FusionIntegration) setupInterconnections() {
	log.Println("Setting up Fusion+ component interconnections")

	// Register state machine callbacks
	fi.stateMachine.RegisterCallback(types.StateAuctionStarted, fi.handleAuctionStarted)
	fi.stateMachine.RegisterCallback(types.StateEthLocked, fi.handleEthLocked)
	fi.stateMachine.RegisterCallback(types.StateSuiLocked, fi.handleSuiLocked)
	fi.stateMachine.RegisterCallback(types.StateSecretReceived, fi.handleSecretReceived)
	fi.stateMachine.RegisterCallback(types.StateExecuted, fi.handleOrderExecuted)

	// Set timelock callbacks
	fi.timelockManager.SetCallbacks(
		fi.handleFinalityReached,
		fi.handleWithdrawalExecuted,
		fi.handleCancellationTriggered,
	)

	// Fusion+ relayer setup complete
}

// handleAuctionStarted handles when an auction starts
func (fi *FusionIntegration) handleAuctionStarted(orderHash string, oldState, newState types.SwapState, data interface{}) error {
	log.Printf("Handling auction started for order: %s", orderHash)

	// The auction engine will have already been started by the relayer service
	// We just need to ensure the state machine is updated
	return nil
}

// handleEthLocked handles when Ethereum escrow is locked
func (fi *FusionIntegration) handleEthLocked(orderHash string, oldState, newState types.SwapState, data interface{}) error {
	log.Printf("Handling Ethereum locked for order: %s", orderHash)

	// Notify timelock manager
	if err := fi.timelockManager.SetEscrowCreated(orderHash, true); err != nil {
		log.Printf("Failed to set source escrow created: %v", err)
		return err
	}

	// Record safety deposit (would be extracted from transaction data in real implementation)
	resolverID := "default-resolver"             // This would come from the winning bid
	sourceAmount := big.NewInt(1000000000000000) // 0.001 ETH
	destAmount := big.NewInt(1000000000000000)   // 0.001 ETH

	if err := fi.safetyManager.RecordDeposit(orderHash, resolverID, sourceAmount, destAmount, "ETH"); err != nil {
		log.Printf("Failed to record safety deposit: %v", err)
	}

	return nil
}

// handleSuiLocked handles when Sui escrow is locked
func (fi *FusionIntegration) handleSuiLocked(orderHash string, oldState, newState types.SwapState, data interface{}) error {
	log.Printf("Handling Sui locked for order: %s", orderHash)

	// Notify timelock manager
	if err := fi.timelockManager.SetEscrowCreated(orderHash, false); err != nil {
		log.Printf("Failed to set destination escrow created: %v", err)
		return err
	}

	// Update finality status in secret manager
	if err := fi.secretManager.UpdateFinalityStatus(orderHash, true, true); err != nil {
		log.Printf("Failed to update finality status: %v", err)
	}

	return nil
}

// handleSecretReceived handles when a secret is received
func (fi *FusionIntegration) handleSecretReceived(orderHash string, oldState, newState types.SwapState, data interface{}) error {
	log.Printf("Handling secret received for order: %s", orderHash)

	// Trigger secret sharing in timelock manager
	if err := fi.timelockManager.TriggerSecretSharing(orderHash); err != nil {
		log.Printf("Failed to trigger secret sharing: %v", err)
		return err
	}

	return nil
}

// handleOrderExecuted handles when an order is executed
func (fi *FusionIntegration) handleOrderExecuted(orderHash string, oldState, newState types.SwapState, data interface{}) error {
	log.Printf("Handling order executed for order: %s", orderHash)

	// Notify timelock manager
	if err := fi.timelockManager.NotifyWithdrawalCompleted(orderHash); err != nil {
		log.Printf("Failed to notify withdrawal completed: %v", err)
	}

	// Make safety deposit claimable
	claimableBy := []string{"resolver-address"} // This would be the actual resolver address
	if err := fi.safetyManager.MakeClaimable(orderHash, claimableBy, ClaimReasonWithdrawalExecuted); err != nil {
		log.Printf("Failed to make safety deposit claimable: %v", err)
	}

	return nil
}

// handleFinalityReached handles when finality is reached
func (fi *FusionIntegration) handleFinalityReached(orderHash string) error {
	log.Printf("Handling finality reached for order: %s", orderHash)

	// This would trigger secret sharing - already handled by secret manager
	return nil
}

// handleWithdrawalExecuted handles when withdrawal is executed
func (fi *FusionIntegration) handleWithdrawalExecuted(orderHash string) error {
	log.Printf("Handling withdrawal executed for order: %s", orderHash)

	// Update state machine
	return fi.stateMachine.TransitionTo(orderHash, types.StateExecuted, map[string]interface{}{})
}

// handleCancellationTriggered handles when cancellation is triggered
func (fi *FusionIntegration) handleCancellationTriggered(orderHash string) error {
	log.Printf("Handling cancellation triggered for order: %s", orderHash)

	// Update state machine
	return fi.stateMachine.TransitionTo(orderHash, types.StateCancelledDst, map[string]interface{}{})
}

// Start starts all Fusion+ components
func (fi *FusionIntegration) Start(ctx context.Context) error {
	log.Println("Starting Fusion+ integration")

	// Start timelock manager
	if err := fi.timelockManager.Start(); err != nil {
		return err
	}

	// Start relayer service
	if err := fi.relayerService.Start(ctx); err != nil {
		return err
	}

	// Start API server
	go func() {
		if err := fi.apiServer.Start(ctx); err != nil {
			log.Printf("Fusion+ API server error: %v", err)
		}
	}()

	log.Println("All Fusion+ components started successfully")
	return nil
}

// Stop stops all Fusion+ components gracefully
func (fi *FusionIntegration) Stop() {
	log.Println("Stopping Fusion+ integration")

	fi.timelockManager.Stop()

	log.Println("Fusion+ integration stopped")
}

// ProcessFusionOrder processes a new Fusion+ order through the complete system
func (fi *FusionIntegration) ProcessFusionOrder(orderReq *types.FusionOrderRequest) (*types.FusionSwapOrder, error) {
	log.Printf("Processing Fusion+ order from maker: %s", orderReq.Order.Maker)

	// Create order state in state machine
	orderHash, err := fi.computeOrderHash(&orderReq.Order)
	if err != nil {
		return nil, err
	}

	// Process through relayer service
	fusionOrder, err := fi.relayerService.ReceiveFusionOrder(context.Background(), orderReq)
	if err != nil {
		fi.stateMachine.TransitionTo(orderHash, types.StateError, map[string]interface{}{
			"error": err.Error(),
		})
		return nil, err
	}

	// Create timelock
	resolverID := "pending" // Will be updated when auction is won
	fi.timelockManager.CreateOrderTimelock(orderHash, resolverID)

	// Transition to auction started
	fi.stateMachine.TransitionTo(orderHash, types.StateAuctionStarted, map[string]interface{}{
		"order": fusionOrder,
	})

	return fusionOrder, nil
}

// ProcessSecretReveal processes secret revelation
func (fi *FusionIntegration) ProcessSecretReveal(orderHash, secret string) error {
	log.Printf("Processing secret reveal for order: %s", orderHash)

	// Store secret in secret manager
	order, exists := fi.relayerService.GetOrder(orderHash)
	if !exists {
		return fmt.Errorf("order not found: %s", orderHash)
	}

	if err := fi.secretManager.StoreSecret(orderHash, secret, order.Maker); err != nil {
		return err
	}

	// Process through relayer service
	if err := fi.relayerService.ReceiveSecret(context.Background(), orderHash, secret); err != nil {
		return err
	}

	// Update state machine
	return fi.stateMachine.TransitionTo(orderHash, types.StateSecretReceived, map[string]interface{}{
		"secret": secret,
	})
}

// GetOrderStatus returns comprehensive order status
func (fi *FusionIntegration) GetOrderStatus(orderHash string) map[string]interface{} {
	status := make(map[string]interface{})

	// Get order from relayer
	if order, exists := fi.relayerService.GetOrder(orderHash); exists {
		status["order"] = order
	}

	// Get state machine state
	if orderState, exists := fi.stateMachine.GetOrderState(orderHash); exists {
		status["state"] = orderState
	}

	// Get timelock info
	if timelock, exists := fi.timelockManager.GetTimelock(orderHash); exists {
		status["timelock"] = timelock
	}

	// Get auction info
	if auction, exists := fi.auctionEngine.GetActiveAuction(orderHash); exists {
		status["auction"] = auction
	}

	// Get secret info
	if secret, exists := fi.secretManager.GetSecret(orderHash); exists {
		status["secret"] = map[string]interface{}{
			"stored":     secret.StoredAt,
			"shared":     secret.SharedAt,
			"sharedWith": secret.SharedWith,
		}
	}

	// Get safety deposit info
	if deposit, exists := fi.safetyManager.GetDeposit(orderHash); exists {
		status["safetyDeposit"] = deposit
	}

	return status
}

// GetSystemStats returns comprehensive system statistics
func (fi *FusionIntegration) GetSystemStats() map[string]interface{} {
	return map[string]interface{}{
		"stateMachine":   fi.stateMachine.GetStateMachineStats(),
		"secrets":        fi.secretManager.GetSecretStats(),
		"timelocks":      fi.timelockManager.GetTimelockStats(),
		"safetyDeposits": fi.safetyManager.GetDepositStats(),
		"partialFills":   fi.partialFillManager.GetPartialFillStats(),
		"timestamp":      time.Now().Unix(),
	}
}

// Helper function to compute order hash
func (fi *FusionIntegration) computeOrderHash(order *types.FusionOrder) (string, error) {
	// This should implement proper EIP-712 hash computation for Fusion+ orders
	// For now, use a simple hash
	return fmt.Sprintf("fusion_%s_%d", order.Maker, order.AuctionStartTimestamp), nil
}
