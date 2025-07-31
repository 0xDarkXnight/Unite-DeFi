package fusion

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log"
	"math/big"
	"sync"
	"time"

	"github.com/1inch/fusion-relayer/internal/types"
)

// RelayerService implements the 1inch relayer functionality as described in Fusion+ whitepaper
// It acts as the central coordinator that:
// 1. Receives signed Fusion orders from makers
// 2. Shares orders with resolvers through Dutch auction
// 3. Manages secret sharing after escrow finality
// 4. Coordinates the 4-phase Fusion+ flow
type RelayerService struct {
	auctionEngine *AuctionEngine
	resolvers     map[string]*Resolver
	orders        map[string]*types.FusionSwapOrder
	secrets       map[string]string // orderHash -> secret
	mutex         sync.RWMutex

	// Configuration
	finalityConfig *types.TimelockConfig

	// Event channels
	orderChan  chan *types.RelayerAnnouncement
	secretChan chan *types.SecretRevealRequest
	eventChan  chan RelayerEvent
}

// RelayerEvent represents events from the relayer service
type RelayerEvent struct {
	Type      RelayerEventType
	OrderHash string
	Data      interface{}
	Timestamp time.Time
}

// RelayerEventType represents types of relayer events
type RelayerEventType string

const (
	RelayerEventOrderReceived    RelayerEventType = "ORDER_RECEIVED"
	RelayerEventOrderShared      RelayerEventType = "ORDER_SHARED"
	RelayerEventSecretReceived   RelayerEventType = "SECRET_RECEIVED"
	RelayerEventSecretShared     RelayerEventType = "SECRET_SHARED"
	RelayerEventFinalityReached  RelayerEventType = "FINALITY_REACHED"
	RelayerEventTimeoutTriggered RelayerEventType = "TIMEOUT_TRIGGERED"
)

// NewRelayerService creates a new relayer service
func NewRelayerService(finalityConfig *types.TimelockConfig) *RelayerService {
	return &RelayerService{
		auctionEngine:  NewAuctionEngine(),
		resolvers:      make(map[string]*Resolver),
		orders:         make(map[string]*types.FusionSwapOrder),
		secrets:        make(map[string]string),
		finalityConfig: finalityConfig,
		orderChan:      make(chan *types.RelayerAnnouncement, 100),
		secretChan:     make(chan *types.SecretRevealRequest, 100),
		eventChan:      make(chan RelayerEvent, 100),
	}
}

// Start starts the relayer service
func (rs *RelayerService) Start(ctx context.Context) error {
	log.Println("Starting Fusion+ Relayer Service")

	// Start auction engine monitoring
	go rs.monitorAuctionEvents(ctx)

	// Start order processing
	go rs.processOrders(ctx)

	// Start secret processing
	go rs.processSecrets(ctx)

	// Start periodic rate updates
	go rs.periodicRateUpdates(ctx)

	return nil
}

// ReceiveFusionOrder processes a new Fusion+ order from a maker
// This implements Phase 1: Announcement phase
func (rs *RelayerService) ReceiveFusionOrder(ctx context.Context, orderReq *types.FusionOrderRequest) (*types.FusionSwapOrder, error) {
	log.Printf("Received Fusion+ order from maker: %s", orderReq.Order.Maker)

	// Compute order hash
	orderHash, err := rs.computeFusionOrderHash(&orderReq.Order)
	if err != nil {
		return nil, fmt.Errorf("failed to compute order hash: %w", err)
	}

	// Verify order signature
	if err := rs.verifyFusionOrderSignature(&orderReq.Order, orderReq.Signature, orderHash); err != nil {
		return nil, fmt.Errorf("invalid order signature: %w", err)
	}

	// Verify secret hash format
	if len(orderReq.SecretHash) != 64 { // 32 bytes hex encoded
		return nil, fmt.Errorf("invalid secret hash format")
	}

	// Create Fusion swap order
	fusionOrder := &types.FusionSwapOrder{
		SwapOrder: types.SwapOrder{
			OrderHash:       orderHash,
			State:           types.StateNew,
			Maker:           orderReq.Order.Maker,
			MakerSuiAddress: orderReq.MakerSuiAddress,
			Receiver:        orderReq.Order.Receiver,
			MakerAsset:      orderReq.Order.MakerAsset,
			TakerAsset:      orderReq.Order.TakerAsset,
			MakingAmount:    orderReq.Order.MakingAmount,
			TakingAmount:    orderReq.Order.TakingAmount,
			SecretHash:      orderReq.SecretHash,
			CreatedAt:       time.Now(),
			UpdatedAt:       time.Now(),
		},
		AuctionStartTime: time.Unix(int64(orderReq.Order.AuctionStartTimestamp), 0),
		AuctionEndTime:   time.Unix(int64(orderReq.Order.AuctionStartTimestamp), 0).Add(10 * time.Minute), // Default duration
	}

	// Store order
	rs.mutex.Lock()
	rs.orders[orderHash] = fusionOrder
	rs.mutex.Unlock()

	// Create relayer announcement
	announcement := &types.RelayerAnnouncement{
		OrderHash:       orderHash,
		Order:           orderReq.Order,
		Signature:       orderReq.Signature,
		MakerSuiAddress: orderReq.MakerSuiAddress,
		SecretHash:      orderReq.SecretHash,
		Timestamp:       time.Now(),
	}

	// Share with resolvers (start auction)
	select {
	case rs.orderChan <- announcement:
		log.Printf("Order shared with resolvers: %s", orderHash)
	case <-ctx.Done():
		return nil, ctx.Err()
	}

	// Send event
	rs.eventChan <- RelayerEvent{
		Type:      RelayerEventOrderReceived,
		OrderHash: orderHash,
		Data:      fusionOrder,
		Timestamp: time.Now(),
	}

	return fusionOrder, nil
}

// ReceiveSecret processes a secret from the maker
// This is called after both escrows are created and finality is reached
func (rs *RelayerService) ReceiveSecret(ctx context.Context, orderHash, secret string) error {
	log.Printf("Received secret for order: %s", orderHash)

	rs.mutex.RLock()
	order, exists := rs.orders[orderHash]
	rs.mutex.RUnlock()

	if !exists {
		return fmt.Errorf("order not found: %s", orderHash)
	}

	// Verify secret matches hash
	hash := sha256.Sum256([]byte(secret))
	if hex.EncodeToString(hash[:]) != order.SecretHash {
		return fmt.Errorf("invalid secret provided for order: %s", orderHash)
	}

	// Store secret
	rs.mutex.Lock()
	rs.secrets[orderHash] = secret
	rs.mutex.Unlock()

	// Update order state
	order.State = types.StateSecretReceived
	order.UpdatedAt = time.Now()

	// Create secret reveal request
	secretReveal := &types.SecretRevealRequest{
		OrderHash: orderHash,
		Secret:    secret,
		Timestamp: time.Now(),
	}

	// Share secret with resolvers
	select {
	case rs.secretChan <- secretReveal:
		log.Printf("Secret shared with resolvers for order: %s", orderHash)
	case <-ctx.Done():
		return ctx.Err()
	}

	// Send event
	rs.eventChan <- RelayerEvent{
		Type:      RelayerEventSecretReceived,
		OrderHash: orderHash,
		Data:      secretReveal,
		Timestamp: time.Now(),
	}

	return nil
}

// NotifyEscrowFinality notifies the relayer that escrow finality has been reached
// This triggers secret sharing according to the Fusion+ protocol
func (rs *RelayerService) NotifyEscrowFinality(orderHash string, srcChainFinalized, dstChainFinalized bool) error {
	log.Printf("Escrow finality notification for order %s: src=%v, dst=%v", orderHash, srcChainFinalized, dstChainFinalized)

	rs.mutex.RLock()
	order, exists := rs.orders[orderHash]
	secret, hasSecret := rs.secrets[orderHash]
	rs.mutex.RUnlock()

	if !exists {
		return fmt.Errorf("order not found: %s", orderHash)
	}

	// Both escrows must reach finality before sharing secret
	if srcChainFinalized && dstChainFinalized && hasSecret {
		// Set finality lock expiry
		order.FinalityLockExpiry = time.Now().Add(rs.finalityConfig.FinalityLockDuration)
		order.ExclusiveWithdrawEnd = order.FinalityLockExpiry.Add(rs.finalityConfig.ResolverExclusiveDuration)

		// Share secret with resolvers after finality lock
		go rs.scheduleSecretSharing(orderHash, secret, order.FinalityLockExpiry)

		rs.eventChan <- RelayerEvent{
			Type:      RelayerEventFinalityReached,
			OrderHash: orderHash,
			Data:      order,
			Timestamp: time.Now(),
		}

		log.Printf("Finality reached for order %s, secret sharing scheduled", orderHash)
	}

	return nil
}

// GetOrder returns a Fusion order by hash
func (rs *RelayerService) GetOrder(orderHash string) (*types.FusionSwapOrder, bool) {
	rs.mutex.RLock()
	defer rs.mutex.RUnlock()

	order, exists := rs.orders[orderHash]
	return order, exists
}

// GetEventChannel returns the event channel for relayer events
func (rs *RelayerService) GetEventChannel() <-chan RelayerEvent {
	return rs.eventChan
}

// RegisterResolver registers a resolver with the relayer
func (rs *RelayerService) RegisterResolver(resolver *Resolver) {
	rs.mutex.Lock()
	defer rs.mutex.Unlock()

	rs.resolvers[resolver.ID] = resolver
	rs.auctionEngine.RegisterResolver(resolver)

	log.Printf("Registered resolver with relayer: %s", resolver.ID)
}

// processOrders processes incoming order announcements
func (rs *RelayerService) processOrders(ctx context.Context) {
	for {
		select {
		case announcement := <-rs.orderChan:
			rs.handleOrderAnnouncement(ctx, announcement)
		case <-ctx.Done():
			return
		}
	}
}

// processSecrets processes secret sharing
func (rs *RelayerService) processSecrets(ctx context.Context) {
	for {
		select {
		case secretReveal := <-rs.secretChan:
			rs.handleSecretReveal(ctx, secretReveal)
		case <-ctx.Done():
			return
		}
	}
}

// handleOrderAnnouncement handles sharing an order with resolvers
func (rs *RelayerService) handleOrderAnnouncement(ctx context.Context, announcement *types.RelayerAnnouncement) {
	log.Printf("Sharing order %s with %d resolvers", announcement.OrderHash, len(rs.resolvers))

	// Start Dutch auction
	if err := rs.auctionEngine.StartAuction(ctx, &announcement.Order, announcement.OrderHash); err != nil {
		log.Printf("Failed to start auction for order %s: %v", announcement.OrderHash, err)
		return
	}

	// Update order state
	rs.mutex.RLock()
	order, exists := rs.orders[announcement.OrderHash]
	rs.mutex.RUnlock()

	if exists {
		order.State = types.StateAuctionStarted
		order.UpdatedAt = time.Now()
	}

	rs.eventChan <- RelayerEvent{
		Type:      RelayerEventOrderShared,
		OrderHash: announcement.OrderHash,
		Data:      announcement,
		Timestamp: time.Now(),
	}
}

// handleSecretReveal handles sharing a secret with resolvers
func (rs *RelayerService) handleSecretReveal(ctx context.Context, secretReveal *types.SecretRevealRequest) {
	log.Printf("Sharing secret for order %s with resolvers", secretReveal.OrderHash)

	// In a real implementation, this would send the secret to specific resolvers
	// For now, we'll just log and emit an event

	rs.eventChan <- RelayerEvent{
		Type:      RelayerEventSecretShared,
		OrderHash: secretReveal.OrderHash,
		Data:      secretReveal,
		Timestamp: time.Now(),
	}
}

// scheduleSecretSharing schedules secret sharing after finality lock expiry
func (rs *RelayerService) scheduleSecretSharing(orderHash, secret string, finalityExpiry time.Time) {
	waitDuration := time.Until(finalityExpiry)
	if waitDuration > 0 {
		time.Sleep(waitDuration)
	}

	secretReveal := &types.SecretRevealRequest{
		OrderHash: orderHash,
		Secret:    secret,
		Timestamp: time.Now(),
	}

	select {
	case rs.secretChan <- secretReveal:
		log.Printf("Secret shared after finality lock for order: %s", orderHash)
	default:
		log.Printf("Failed to share secret for order: %s", orderHash)
	}
}

// monitorAuctionEvents monitors events from the auction engine
func (rs *RelayerService) monitorAuctionEvents(ctx context.Context) {
	auctionEventChan := rs.auctionEngine.GetEventChannel()

	for {
		select {
		case event := <-auctionEventChan:
			rs.handleAuctionEvent(event)
		case <-ctx.Done():
			return
		}
	}
}

// handleAuctionEvent handles events from the auction engine
func (rs *RelayerService) handleAuctionEvent(event AuctionEvent) {
	switch event.Type {
	case AuctionEventWon:
		rs.handleAuctionWon(event)
	case AuctionEventExpired:
		rs.handleAuctionExpired(event)
	}
}

// handleAuctionWon handles when an auction is won
func (rs *RelayerService) handleAuctionWon(event AuctionEvent) {
	bid, ok := event.Data.(*types.ResolverBid)
	if !ok {
		return
	}

	rs.mutex.RLock()
	order, exists := rs.orders[event.OrderHash]
	rs.mutex.RUnlock()

	if exists {
		order.State = types.StateEthLockPending
		order.ResolverID = bid.ResolverID
		order.WinningBidRate = new(big.Int).Set(bid.BidRate)
		order.SafetyDeposit = new(big.Int).Set(bid.SafetyDeposit)
		order.UpdatedAt = time.Now()

		log.Printf("Order %s won by resolver %s at rate %s",
			event.OrderHash, bid.ResolverID, bid.BidRate.String())
	}
}

// handleAuctionExpired handles when an auction expires
func (rs *RelayerService) handleAuctionExpired(event AuctionEvent) {
	rs.mutex.RLock()
	order, exists := rs.orders[event.OrderHash]
	rs.mutex.RUnlock()

	if exists {
		order.State = types.StateCancelled
		order.UpdatedAt = time.Now()

		log.Printf("Auction expired for order: %s", event.OrderHash)
	}
}

// periodicRateUpdates periodically updates auction rates
func (rs *RelayerService) periodicRateUpdates(ctx context.Context) {
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			rs.auctionEngine.UpdateCurrentRates()
		case <-ctx.Done():
			return
		}
	}
}

// Helper functions

func (rs *RelayerService) computeFusionOrderHash(order *types.FusionOrder) (string, error) {
	// This should implement proper EIP-712 hash computation for Fusion+ orders
	// For now, use a simple hash of the order data
	data := fmt.Sprintf("%s%s%s%s%d%d%d",
		order.Maker, order.Receiver, order.MakerAsset, order.TakerAsset,
		order.MakingAmount.Uint64(), order.TakingAmount.Uint64(), order.AuctionStartTimestamp)

	hash := sha256.Sum256([]byte(data))
	return hex.EncodeToString(hash[:]), nil
}

func (rs *RelayerService) verifyFusionOrderSignature(order *types.FusionOrder, signature, orderHash string) error {
	// This should implement proper EIP-712 signature verification for Fusion+ orders
	// For now, just check if signature is not empty
	if signature == "" {
		return fmt.Errorf("empty signature")
	}
	return nil
}
