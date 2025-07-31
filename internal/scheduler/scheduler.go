package scheduler

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/1inch/fusion-relayer/internal/config"
)

// CancelHandler defines the interface for handling cancellation events
type CancelHandler interface {
	CancelEthereumEscrow(ctx context.Context, orderHash string) error
	CancelSuiEscrow(ctx context.Context, orderHash string) error
}

// TimeoutEvent represents a scheduled timeout event
type TimeoutEvent struct {
	ID          string
	OrderHash   string
	EventType   string // "ethereum_timeout" or "sui_timeout"
	ScheduledAt time.Time
	ExecuteAt   time.Time
	Executed    bool
	CreatedAt   time.Time
}

// Scheduler manages timeout events for escrow cancellations
type Scheduler struct {
	config        config.Relayer
	cancelHandler CancelHandler
	events        map[string]*TimeoutEvent
	mutex         sync.RWMutex
	stopCh        chan struct{}
	doneCh        chan struct{}
}

// NewScheduler creates a new timeout scheduler
func NewScheduler(cfg config.Relayer) *Scheduler {
	return &Scheduler{
		config: cfg,
		events: make(map[string]*TimeoutEvent),
		stopCh: make(chan struct{}),
		doneCh: make(chan struct{}),
	}
}

// SetCancelHandler sets the cancel handler for the scheduler
func (s *Scheduler) SetCancelHandler(handler CancelHandler) {
	s.cancelHandler = handler
}

// Start starts the scheduler
func (s *Scheduler) Start(ctx context.Context) error {
	log.Println("Starting timeout scheduler")

	// Load any existing timeout events from storage
	if err := s.loadTimeoutEvents(); err != nil {
		return fmt.Errorf("failed to load timeout events: %w", err)
	}

	go s.run(ctx)
	return nil
}

// Stop stops the scheduler
func (s *Scheduler) Stop() {
	log.Println("Stopping timeout scheduler")
	close(s.stopCh)
	<-s.doneCh
}

// ScheduleDstTimeout schedules a timeout for destination escrow cancellation
func (s *Scheduler) ScheduleDstTimeout(orderHash string, executeAt time.Time) {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	eventID := fmt.Sprintf("dst_%s_%d", orderHash, executeAt.Unix())
	event := &TimeoutEvent{
		ID:          eventID,
		OrderHash:   orderHash,
		EventType:   "sui_timeout",
		ScheduledAt: time.Now(),
		ExecuteAt:   executeAt,
		Executed:    false,
		CreatedAt:   time.Now(),
	}

	s.events[eventID] = event
	log.Printf("Scheduled Sui timeout - Order: %s, Execute at: %s", orderHash, executeAt.Format(time.RFC3339))
}

// ScheduleSrcTimeout schedules a timeout for source escrow cancellation
func (s *Scheduler) ScheduleSrcTimeout(orderHash string, executeAt time.Time) {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	eventID := fmt.Sprintf("src_%s_%d", orderHash, executeAt.Unix())
	event := &TimeoutEvent{
		ID:          eventID,
		OrderHash:   orderHash,
		EventType:   "ethereum_timeout",
		ScheduledAt: time.Now(),
		ExecuteAt:   executeAt,
		Executed:    false,
		CreatedAt:   time.Now(),
	}

	s.events[eventID] = event
	log.Printf("Scheduled Ethereum timeout - Order: %s, Execute at: %s", orderHash, executeAt.Format(time.RFC3339))
}

// CancelTimeout cancels a scheduled timeout event
func (s *Scheduler) CancelTimeout(orderHash string) {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	// Find and remove events for this order
	for id, event := range s.events {
		if event.OrderHash == orderHash && !event.Executed {
			delete(s.events, id)
			log.Printf("Cancelled timeout event - Order: %s, Type: %s", orderHash, event.EventType)
		}
	}
}

// run is the main scheduler loop
func (s *Scheduler) run(ctx context.Context) {
	defer close(s.doneCh)

	ticker := time.NewTicker(10 * time.Second) // Check every 10 seconds
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-s.stopCh:
			return
		case <-ticker.C:
			s.processTimeouts(ctx)
		}
	}
}

// processTimeouts checks for and executes due timeout events
func (s *Scheduler) processTimeouts(ctx context.Context) {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	now := time.Now()
	for id, event := range s.events {
		if !event.Executed && now.After(event.ExecuteAt) {
			go s.executeTimeout(ctx, event)
			event.Executed = true
			delete(s.events, id)
		}
	}
}

// executeTimeout executes a timeout event
func (s *Scheduler) executeTimeout(ctx context.Context, event *TimeoutEvent) {
	if s.cancelHandler == nil {
		log.Printf("No cancel handler set, skipping timeout execution for order %s", event.OrderHash)
		return
	}

	log.Printf("Executing timeout - Order: %s, Type: %s", event.OrderHash, event.EventType)

	var err error
	switch event.EventType {
	case "ethereum_timeout":
		err = s.cancelHandler.CancelEthereumEscrow(ctx, event.OrderHash)
	case "sui_timeout":
		err = s.cancelHandler.CancelSuiEscrow(ctx, event.OrderHash)
	default:
		log.Printf("Unknown timeout event type: %s", event.EventType)
		return
	}

	if err != nil {
		log.Printf("Failed to execute timeout for order %s: %v", event.OrderHash, err)
	} else {
		log.Printf("Successfully executed timeout for order %s", event.OrderHash)
	}
}

// loadTimeoutEvents loads existing timeout events (mock implementation)
func (s *Scheduler) loadTimeoutEvents() error {
	// In a real implementation, this would load from database
	// For now, just return nil
	return nil
}

// GetPendingTimeouts returns the count of pending timeout events
func (s *Scheduler) GetPendingTimeouts() int {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	count := 0
	for _, event := range s.events {
		if !event.Executed {
			count++
		}
	}
	return count
}
