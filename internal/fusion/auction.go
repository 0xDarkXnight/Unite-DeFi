package fusion

import (
	"context"
	"fmt"
	"log"
	"math/big"
	"sync"
	"time"

	"github.com/1inch/fusion-relayer/internal/types"
)

// AuctionEngine manages Dutch auctions for Fusion+ orders
type AuctionEngine struct {
	activeAuctions map[string]*ActiveAuction
	mutex          sync.RWMutex
	resolvers      map[string]*Resolver
	eventChan      chan AuctionEvent
}

// ActiveAuction represents an ongoing Dutch auction
type ActiveAuction struct {
	Order           *types.FusionOrder
	OrderHash       string
	StartTime       time.Time
	EndTime         time.Time
	CurrentRate     *big.Int
	WinningResolver string
	Status          AuctionStatus
	Bids            []*types.ResolverBid
	mutex           sync.RWMutex
}

// AuctionStatus represents the status of an auction
type AuctionStatus string

const (
	AuctionStatusPending   AuctionStatus = "PENDING"
	AuctionStatusActive    AuctionStatus = "ACTIVE"
	AuctionStatusWon       AuctionStatus = "WON"
	AuctionStatusExpired   AuctionStatus = "EXPIRED"
	AuctionStatusCancelled AuctionStatus = "CANCELLED"
)

// AuctionEvent represents events from the auction engine
type AuctionEvent struct {
	Type      AuctionEventType
	OrderHash string
	Data      interface{}
	Timestamp time.Time
}

// AuctionEventType represents types of auction events
type AuctionEventType string

const (
	AuctionEventStarted   AuctionEventType = "AUCTION_STARTED"
	AuctionEventBidPlaced AuctionEventType = "BID_PLACED"
	AuctionEventWon       AuctionEventType = "AUCTION_WON"
	AuctionEventExpired   AuctionEventType = "AUCTION_EXPIRED"
	AuctionEventCancelled AuctionEventType = "AUCTION_CANCELLED"
)

// Resolver represents a resolver that can bid on auctions
type Resolver struct {
	ID           string
	KYCCompleted bool
	TotalDeposit *big.Int
	ActiveOrders int
	LastActivity time.Time
}

// NewAuctionEngine creates a new auction engine
func NewAuctionEngine() *AuctionEngine {
	return &AuctionEngine{
		activeAuctions: make(map[string]*ActiveAuction),
		resolvers:      make(map[string]*Resolver),
		eventChan:      make(chan AuctionEvent, 100),
	}
}

// StartAuction starts a new Dutch auction for a Fusion+ order
func (ae *AuctionEngine) StartAuction(ctx context.Context, order *types.FusionOrder, orderHash string) error {
	ae.mutex.Lock()
	defer ae.mutex.Unlock()

	log.Printf("Starting auction for order: %s", orderHash)

	// Check if auction already exists
	if _, exists := ae.activeAuctions[orderHash]; exists {
		return fmt.Errorf("auction already exists for order: %s", orderHash)
	}

	startTime := time.Unix(int64(order.AuctionStartTimestamp), 0)

	// Calculate auction end time based on price curve
	var endTime time.Time
	if len(order.PriceCurve) > 0 {
		lastPoint := order.PriceCurve[len(order.PriceCurve)-1]
		endTime = startTime.Add(time.Duration(lastPoint.TimeOffset) * time.Second)
	} else {
		// Default 10 minute auction
		endTime = startTime.Add(10 * time.Minute)
	}

	auction := &ActiveAuction{
		Order:       order,
		OrderHash:   orderHash,
		StartTime:   startTime,
		EndTime:     endTime,
		CurrentRate: new(big.Int).Set(order.AuctionStartRate),
		Status:      AuctionStatusPending,
		Bids:        make([]*types.ResolverBid, 0),
	}

	ae.activeAuctions[orderHash] = auction

	// Schedule auction to start
	go ae.scheduleAuctionStart(ctx, auction)

	// Send auction started event
	ae.eventChan <- AuctionEvent{
		Type:      AuctionEventStarted,
		OrderHash: orderHash,
		Data:      auction,
		Timestamp: time.Now(),
	}

	return nil
}

// PlaceBid allows a resolver to place a bid on an auction
func (ae *AuctionEngine) PlaceBid(ctx context.Context, bid *types.ResolverBid) error {
	ae.mutex.RLock()
	auction, exists := ae.activeAuctions[bid.OrderHash]
	ae.mutex.RUnlock()

	if !exists {
		return fmt.Errorf("auction not found for order: %s", bid.OrderHash)
	}

	auction.mutex.Lock()
	defer auction.mutex.Unlock()

	// Validate resolver
	resolver, exists := ae.resolvers[bid.ResolverID]
	if !exists || !resolver.KYCCompleted {
		return fmt.Errorf("invalid or non-KYC resolver: %s", bid.ResolverID)
	}

	// Check auction status
	if auction.Status != AuctionStatusActive {
		return fmt.Errorf("auction not active for order: %s", bid.OrderHash)
	}

	// Calculate current rate
	currentRate := auction.Order.CalculateCurrentRate(time.Now())

	// Check if bid meets current rate
	if bid.BidRate.Cmp(currentRate) < 0 {
		return fmt.Errorf("bid rate %s below current rate %s", bid.BidRate.String(), currentRate.String())
	}

	// Add bid to auction
	auction.Bids = append(auction.Bids, bid)

	log.Printf("Bid placed by resolver %s for order %s at rate %s",
		bid.ResolverID, bid.OrderHash, bid.BidRate.String())

	// Check if this bid wins the auction (at or above current rate)
	if bid.BidRate.Cmp(currentRate) >= 0 {
		auction.Status = AuctionStatusWon
		auction.WinningResolver = bid.ResolverID
		auction.CurrentRate = new(big.Int).Set(bid.BidRate)

		// Send auction won event
		ae.eventChan <- AuctionEvent{
			Type:      AuctionEventWon,
			OrderHash: bid.OrderHash,
			Data:      bid,
			Timestamp: time.Now(),
		}

		log.Printf("Auction won by resolver %s for order %s", bid.ResolverID, bid.OrderHash)
		return nil
	}

	// Send bid placed event
	ae.eventChan <- AuctionEvent{
		Type:      AuctionEventBidPlaced,
		OrderHash: bid.OrderHash,
		Data:      bid,
		Timestamp: time.Now(),
	}

	return nil
}

// GetActiveAuction returns an active auction by order hash
func (ae *AuctionEngine) GetActiveAuction(orderHash string) (*ActiveAuction, bool) {
	ae.mutex.RLock()
	defer ae.mutex.RUnlock()

	auction, exists := ae.activeAuctions[orderHash]
	return auction, exists
}

// GetEventChannel returns the event channel for auction events
func (ae *AuctionEngine) GetEventChannel() <-chan AuctionEvent {
	return ae.eventChan
}

// RegisterResolver registers a new resolver
func (ae *AuctionEngine) RegisterResolver(resolver *Resolver) {
	ae.mutex.Lock()
	defer ae.mutex.Unlock()

	ae.resolvers[resolver.ID] = resolver
	log.Printf("Registered resolver: %s (KYC: %v)", resolver.ID, resolver.KYCCompleted)
}

// scheduleAuctionStart schedules the auction to become active
func (ae *AuctionEngine) scheduleAuctionStart(ctx context.Context, auction *ActiveAuction) {
	// Wait for auction start time
	waitDuration := time.Until(auction.StartTime)
	if waitDuration > 0 {
		timer := time.NewTimer(waitDuration)
		defer timer.Stop()

		select {
		case <-timer.C:
			ae.activateAuction(auction)
		case <-ctx.Done():
			return
		}
	} else {
		// Auction should start immediately
		ae.activateAuction(auction)
	}

	// Schedule auction expiry
	ae.scheduleAuctionExpiry(ctx, auction)
}

// activateAuction makes an auction active
func (ae *AuctionEngine) activateAuction(auction *ActiveAuction) {
	auction.mutex.Lock()
	defer auction.mutex.Unlock()

	auction.Status = AuctionStatusActive
	log.Printf("Auction activated for order: %s", auction.OrderHash)
}

// scheduleAuctionExpiry schedules auction expiry
func (ae *AuctionEngine) scheduleAuctionExpiry(ctx context.Context, auction *ActiveAuction) {
	waitDuration := time.Until(auction.EndTime)
	if waitDuration <= 0 {
		return
	}

	timer := time.NewTimer(waitDuration)
	defer timer.Stop()

	select {
	case <-timer.C:
		ae.expireAuction(auction)
	case <-ctx.Done():
		return
	}
}

// expireAuction marks an auction as expired
func (ae *AuctionEngine) expireAuction(auction *ActiveAuction) {
	auction.mutex.Lock()
	defer auction.mutex.Unlock()

	if auction.Status == AuctionStatusActive {
		auction.Status = AuctionStatusExpired

		ae.eventChan <- AuctionEvent{
			Type:      AuctionEventExpired,
			OrderHash: auction.OrderHash,
			Data:      auction,
			Timestamp: time.Now(),
		}

		log.Printf("Auction expired for order: %s", auction.OrderHash)
	}
}

// CancelAuction cancels an active auction
func (ae *AuctionEngine) CancelAuction(orderHash string) error {
	ae.mutex.Lock()
	defer ae.mutex.Unlock()

	auction, exists := ae.activeAuctions[orderHash]
	if !exists {
		return fmt.Errorf("auction not found for order: %s", orderHash)
	}

	auction.mutex.Lock()
	auction.Status = AuctionStatusCancelled
	auction.mutex.Unlock()

	delete(ae.activeAuctions, orderHash)

	ae.eventChan <- AuctionEvent{
		Type:      AuctionEventCancelled,
		OrderHash: orderHash,
		Data:      auction,
		Timestamp: time.Now(),
	}

	log.Printf("Auction cancelled for order: %s", orderHash)
	return nil
}

// UpdateCurrentRates updates current rates for all active auctions
func (ae *AuctionEngine) UpdateCurrentRates() {
	ae.mutex.RLock()
	auctions := make([]*ActiveAuction, 0, len(ae.activeAuctions))
	for _, auction := range ae.activeAuctions {
		auctions = append(auctions, auction)
	}
	ae.mutex.RUnlock()

	currentTime := time.Now()
	for _, auction := range auctions {
		auction.mutex.Lock()
		if auction.Status == AuctionStatusActive {
			auction.CurrentRate = auction.Order.CalculateCurrentRate(currentTime)
		}
		auction.mutex.Unlock()
	}
}

// GetAuctionStats returns statistics for an auction
func (ae *AuctionEngine) GetAuctionStats(orderHash string) map[string]interface{} {
	ae.mutex.RLock()
	auction, exists := ae.activeAuctions[orderHash]
	ae.mutex.RUnlock()

	if !exists {
		return nil
	}

	auction.mutex.RLock()
	defer auction.mutex.RUnlock()

	return map[string]interface{}{
		"orderHash":       auction.OrderHash,
		"status":          auction.Status,
		"startTime":       auction.StartTime,
		"endTime":         auction.EndTime,
		"currentRate":     auction.CurrentRate.String(),
		"bidCount":        len(auction.Bids),
		"winningResolver": auction.WinningResolver,
	}
}
