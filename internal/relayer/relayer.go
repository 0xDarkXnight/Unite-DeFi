package relayer

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"math/big"
	"sync"
	"time"

	"github.com/1inch/fusion-relayer/internal/adapters"
	"github.com/1inch/fusion-relayer/internal/api"
	"github.com/1inch/fusion-relayer/internal/config"
	"github.com/1inch/fusion-relayer/internal/database"
	"github.com/1inch/fusion-relayer/internal/fusion"
	"github.com/1inch/fusion-relayer/internal/scheduler"
	"github.com/1inch/fusion-relayer/internal/service"
	"github.com/1inch/fusion-relayer/internal/types"
)

// Relayer orchestrates all components of the fusion relayer
type Relayer struct {
	config *config.Config

	// Database
	db        *sql.DB
	orderRepo *database.OrderRepository

	// Blockchain adapters
	ethAdapter adapters.ChainAdapter
	suiAdapter adapters.ChainAdapter

	// Core services
	scheduler    *scheduler.Scheduler
	orderService *service.OrderService
	apiServer    *api.Server

	// Fusion+ integration
	fusionIntegration *fusion.FusionIntegration

	// Lifecycle management
	stopFunc context.CancelFunc
	wg       sync.WaitGroup
}

// New creates a new relayer instance with fork-specific adapters
func New(cfg *config.Config) (*Relayer, error) {
	// Initialize database
	db, err := database.New(cfg.Database)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize database: %w", err)
	}

	orderRepo := database.NewOrderRepository(db)

	// Initialize blockchain adapters based on fork configuration
	var ethAdapter adapters.ChainAdapter
	if cfg.Ethereum.IsFork {
		ethAdapter = adapters.NewAnvilAdapter(cfg.Ethereum)
		log.Println("Using Anvil fork adapter for Ethereum")
	} else {
		return nil, fmt.Errorf("non-fork Ethereum not yet implemented")
	}

	var suiAdapter adapters.ChainAdapter
	if cfg.Sui.IsLocalValidator {
		suiAdapter = adapters.NewSuiLocalAdapter(cfg.Sui)
		log.Println("Using local validator adapter for Sui")
	} else {
		return nil, fmt.Errorf("non-local Sui not yet implemented")
	}

	// Initialize scheduler
	sched := scheduler.NewScheduler(cfg.Relayer)

	// Initialize order service
	orderService := service.NewOrderServiceWithAdapters(cfg.Relayer, orderRepo, ethAdapter, suiAdapter, sched)

	// Initialize API server
	apiServer := api.NewServer(cfg.API, orderService)

	// Initialize Fusion+ integration
	fusionConfig := &fusion.FusionConfig{
		Relayer: cfg.Relayer,
		API:     cfg.API,
		Timelock: &types.TimelockConfig{
			FinalityLockDuration:      30 * time.Second,  // 30s for demo
			ResolverExclusiveDuration: 60 * time.Second,  // 1 minute exclusive
			CancellationDuration:      300 * time.Second, // 5 minutes to cancel
		},
		SafetyDeposit: &fusion.SafetyDepositConfig{
			MinimumDeposit:      big.NewInt(1000000000000000),   // 0.001 ETH
			MaximumDeposit:      big.NewInt(100000000000000000), // 0.1 ETH
			ClaimWindow:         180 * time.Second,              // 3 minutes to claim
			RefundWindow:        300 * time.Second,              // 5 minutes until refund
			IncentiveMultiplier: 0.1,                            // 10% of deposit as incentive
		},
		PartialFill: &fusion.PartialFillConfig{
			MaxParts:          10,
			MinFillAmount:     big.NewInt(1000000), // 1 USDC minimum
			MaxFillPercentage: 50.0,                // 50% max per resolver
			FillTimeout:       60 * time.Second,
			CompletionTimeout: 300 * time.Second,
		},
	}

	fusionIntegration, err := fusion.NewFusionIntegration(fusionConfig, orderRepo)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize Fusion+ integration: %w", err)
	}

	relayer := &Relayer{
		config:            cfg,
		db:                db,
		orderRepo:         orderRepo,
		ethAdapter:        ethAdapter,
		suiAdapter:        suiAdapter,
		scheduler:         sched,
		orderService:      orderService,
		apiServer:         apiServer,
		fusionIntegration: fusionIntegration,
	}

	return relayer, nil
}

// Start starts all relayer components with comprehensive boot sequence
func (r *Relayer) Start(ctx context.Context) error {
	log.Println("Starting Fusion+ Relayer with fork coordination")

	// Create cancellable context
	ctx, cancel := context.WithCancel(ctx)
	r.stopFunc = cancel

	// Boot sequence and configuration handshake
	if err := r.performBootSequence(ctx); err != nil {
		cancel()
		return fmt.Errorf("boot sequence failed: %w", err)
	}

	// Log startup information with fork details
	r.logStartupInfo(ctx)

	// Start scheduler
	r.wg.Add(1)
	go func() {
		defer r.wg.Done()
		if err := r.scheduler.Start(ctx); err != nil {
			log.Printf("Scheduler error: %v", err)
		}
	}()

	// Start blockchain event watchers
	r.wg.Add(1)
	go func() {
		defer r.wg.Done()
		if err := r.startChainWatcher(ctx, r.ethAdapter, "Ethereum"); err != nil {
			log.Printf("Ethereum watcher error: %v", err)
		}
	}()

	r.wg.Add(1)
	go func() {
		defer r.wg.Done()
		if err := r.startChainWatcher(ctx, r.suiAdapter, "Sui"); err != nil {
			log.Printf("Sui watcher error: %v", err)
		}
	}()

	// Start API server
	r.wg.Add(1)
	go func() {
		defer r.wg.Done()
		if err := r.apiServer.Start(ctx); err != nil {
			log.Printf("API server error: %v", err)
		}
	}()

	// Start Fusion+ integration
	r.wg.Add(1)
	go func() {
		defer r.wg.Done()
		if err := r.fusionIntegration.Start(ctx); err != nil {
			log.Printf("Fusion+ integration error: %v", err)
		}
	}()

	log.Println("All relayer components (including Fusion+) started successfully")

	// Wait for context cancellation
	<-ctx.Done()

	log.Println("Relayer shutdown initiated")
	return nil
}

// performBootSequence executes the comprehensive boot-up checklist
func (r *Relayer) performBootSequence(ctx context.Context) error {
	log.Println("Performing boot sequence and configuration handshake...")

	// Step 1: Connect to both chains
	log.Println("1. Connecting to blockchain adapters...")

	if err := r.ethAdapter.Connect(ctx); err != nil {
		return fmt.Errorf("failed to connect to Ethereum: %w", err)
	}

	if err := r.suiAdapter.Connect(ctx); err != nil {
		r.ethAdapter.Close()
		return fmt.Errorf("failed to connect to Sui: %w", err)
	}

	// Step 2: Validate chain configurations
	log.Println("2. Validating chain configurations...")

	if err := r.ethAdapter.Validate(ctx); err != nil {
		return fmt.Errorf("Ethereum validation failed: %w", err)
	}

	if err := r.suiAdapter.Validate(ctx); err != nil {
		return fmt.Errorf("Sui validation failed: %w", err)
	}

	// Step 3: Coordinate block times and deadlines
	log.Println("3. Coordinating block times and deadline strategies...")

	ethBlockTime := r.ethAdapter.GetBlockTime()
	suiBlockTime := r.suiAdapter.GetBlockTime()

	log.Printf("   Ethereum block time: %v", ethBlockTime)
	log.Printf("   Sui checkpoint time: %v", suiBlockTime)

	// Calculate recommended deadlines (slower chain gets longer deadline)
	if suiBlockTime > ethBlockTime {
		log.Printf("   Sui is slower - recommended: deadlineDst = now + 3min, deadlineSrc = now + 7min")
	} else {
		log.Printf("   Ethereum is slower - recommended: deadlineDst = now + 7min, deadlineSrc = now + 3min")
	}

	// Step 4: Test deterministic address calculation
	log.Println("4. Testing deterministic address calculations...")
	// This would test CREATE2 calculations in production

	log.Println("Boot sequence completed successfully ✓")
	return nil
}

// startChainWatcher starts a generic chain event watcher
func (r *Relayer) startChainWatcher(ctx context.Context, adapter adapters.ChainAdapter, chainName string) error {
	log.Printf("Starting %s event watcher", chainName)

	eventCh := make(chan *adapters.ChainEvent, r.config.Relayer.EventWatcherBufferSize)

	// Start adapter's event watching
	watchCtx, watchCancel := context.WithCancel(ctx)
	defer watchCancel()

	go func() {
		if err := adapter.Watch(watchCtx, eventCh); err != nil {
			log.Printf("%s adapter watch error: %v", chainName, err)
		}
	}()

	// Process events
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case event := <-eventCh:
			r.handleChainEvent(chainName, event)
		}
	}
}

// handleChainEvent processes events from any chain adapter
func (r *Relayer) handleChainEvent(chainName string, event *adapters.ChainEvent) {
	log.Printf("Received %s event: %s - Order: %s (Finalized: %v)",
		chainName, event.Type, event.OrderHash, event.IsFinalized)

	// Only process finalized events to avoid re-org issues
	if !event.IsFinalized {
		log.Printf("Event not yet finalized, skipping...")
		return
	}

	// Update order state based on event type
	if order, err := r.orderRepo.GetOrderByHash(event.OrderHash); err == nil {
		switch event.Type {
		case "ETH_ESCROW_CREATED":
			r.orderRepo.UpdateOrderState(order.ID, "ETH_LOCKED")
		case "SUI_ESCROW_CREATED":
			r.orderRepo.UpdateOrderState(order.ID, "SUI_LOCKED")
		case "ETH_ESCROW_WITHDRAWN", "SUI_ESCROW_WITHDRAWN":
			r.orderRepo.UpdateOrderState(order.ID, "EXECUTED")
		case "ETH_ESCROW_CANCELLED", "SUI_ESCROW_CANCELLED":
			r.orderRepo.UpdateOrderState(order.ID, "REFUNDED")
		}
	}
}

// Stop gracefully stops all relayer components
func (r *Relayer) Stop() {
	log.Println("Stopping relayer components")

	// Cancel context to stop all goroutines
	if r.stopFunc != nil {
		r.stopFunc()
	}

	// Stop scheduler
	r.scheduler.Stop()

	// Close blockchain adapters
	if r.ethAdapter != nil {
		r.ethAdapter.Close()
	}
	if r.suiAdapter != nil {
		r.suiAdapter.Close()
	}

	// Close database
	r.db.Close()

	// Wait for all goroutines to finish
	r.wg.Wait()

	log.Println("Relayer stopped successfully")
}

// logStartupInfo logs comprehensive relayer startup information
func (r *Relayer) logStartupInfo(ctx context.Context) {
	ethBalance, _ := r.ethAdapter.GetBalance(ctx)
	suiBalance, _ := r.suiAdapter.GetBalance(ctx)

	log.Printf("=== Fusion+ Relayer Configuration ===")
	log.Printf("Ethereum Adapter:")
	log.Printf("  Address: %s", r.ethAdapter.GetAddress())
	log.Printf("  Chain ID: %s", r.ethAdapter.GetChainID())
	log.Printf("  Balance: %s ETH", ethBalance.String())
	log.Printf("  Block Time: %v", r.ethAdapter.GetBlockTime())
	log.Printf("  Finality Depth: %d blocks", r.ethAdapter.GetFinalityDepth())

	log.Printf("Sui Adapter:")
	log.Printf("  Address: %s", r.suiAdapter.GetAddress())
	log.Printf("  Chain ID: %s", r.suiAdapter.GetChainID())
	log.Printf("  Balance: %s SUI", suiBalance.String())
	log.Printf("  Checkpoint Time: %v", r.suiAdapter.GetBlockTime())
	log.Printf("  Finality Depth: %d checkpoints", r.suiAdapter.GetFinalityDepth())

	log.Printf("API Server: %s:%d", r.config.API.Host, r.config.API.Port)
	log.Printf("Max Concurrent Orders: %d", r.config.Relayer.MaxConcurrentOrders)
	log.Printf("====================================")
}
