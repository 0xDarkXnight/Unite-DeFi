package fusion

import (
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/1inch/fusion-relayer/internal/types"
)

// FusionStateMachine implements the 4-phase Fusion+ state machine as described in the whitepaper:
// Phase 1: Announcement phase - Maker signs and shares order, Dutch auction begins
// Phase 2: Depositing phase - Resolver deposits tokens into escrows on both chains
// Phase 3: Withdrawal phase - Relayer shares secret, resolver withdraws funds
// Phase 4: Recovery phase (optional) - Handles timeouts and cancellations
type FusionStateMachine struct {
	orders    map[string]*FusionOrderState
	mutex     sync.RWMutex
	eventChan chan StateEvent
	callbacks map[types.SwapState][]StateCallback
}

// FusionOrderState represents the complete state of a Fusion+ order
type FusionOrderState struct {
	OrderHash     string
	CurrentState  types.SwapState
	PreviousState types.SwapState
	Phase         FusionPhase

	// Phase 1: Announcement
	OrderReceived    *time.Time
	AuctionStarted   *time.Time
	ResolverSelected *time.Time
	AuctionRate      string
	SelectedResolver string

	// Phase 2: Depositing
	SrcDepositStarted   *time.Time
	SrcDepositConfirmed *time.Time
	DstDepositStarted   *time.Time
	DstDepositConfirmed *time.Time
	FinalityReached     *time.Time

	// Phase 3: Withdrawal
	SecretShared       *time.Time
	SrcWithdrawStarted *time.Time
	SrcWithdrawDone    *time.Time
	DstWithdrawStarted *time.Time
	DstWithdrawDone    *time.Time

	// Phase 4: Recovery
	TimeoutTriggered    *time.Time
	CancellationStarted *time.Time
	RecoveryCompleted   *time.Time

	// Metadata
	CreatedAt    time.Time
	UpdatedAt    time.Time
	ErrorMessage string
	RetryCount   int
}

// FusionPhase represents the current phase of the Fusion+ protocol
type FusionPhase int

const (
	PhaseAnnouncement FusionPhase = 1 // Phase 1: Order announcement and auction
	PhaseDepositing   FusionPhase = 2 // Phase 2: Escrow deposits
	PhaseWithdrawal   FusionPhase = 3 // Phase 3: Secret sharing and withdrawals
	PhaseRecovery     FusionPhase = 4 // Phase 4: Recovery and cancellation
)

// StateEvent represents state machine events
type StateEvent struct {
	Type      StateEventType
	OrderHash string
	OldState  types.SwapState
	NewState  types.SwapState
	Phase     FusionPhase
	Data      interface{}
	Timestamp time.Time
}

// StateEventType represents types of state events
type StateEventType string

const (
	StateEventTransition  StateEventType = "STATE_TRANSITION"
	StateEventPhaseChange StateEventType = "PHASE_CHANGE"
	StateEventError       StateEventType = "STATE_ERROR"
	StateEventRetry       StateEventType = "STATE_RETRY"
	StateEventTimeout     StateEventType = "STATE_TIMEOUT"
)

// StateCallback represents a callback function for state changes
type StateCallback func(orderHash string, oldState, newState types.SwapState, data interface{}) error

// StateTransition represents a valid state transition
type StateTransition struct {
	From        types.SwapState
	To          types.SwapState
	Phase       FusionPhase
	Description string
	Required    []string // Required data fields
}

// Valid state transitions for Fusion+
var validTransitions = []StateTransition{
	// Phase 1: Announcement phase
	{types.StateNew, types.StateAuctionStarted, PhaseAnnouncement, "Order received, auction started", []string{"order"}},
	{types.StateAuctionStarted, types.StateEthLockPending, PhaseDepositing, "Resolver selected, starting source deposit", []string{"resolver", "rate"}},

	// Phase 2: Depositing phase
	{types.StateEthLockPending, types.StateEthLocked, PhaseDepositing, "Source escrow created", []string{"src_tx_hash"}},
	{types.StateEthLocked, types.StateSuiLockPending, PhaseDepositing, "Starting destination deposit", []string{}},
	{types.StateSuiLockPending, types.StateSuiLocked, PhaseDepositing, "Destination escrow created", []string{"dst_tx_hash"}},
	{types.StateSuiLocked, types.StateReadyForSecret, PhaseDepositing, "Both escrows finalized", []string{}},

	// Phase 3: Withdrawal phase
	{types.StateReadyForSecret, types.StateSecretReceived, PhaseWithdrawal, "Secret shared with resolvers", []string{"secret"}},
	{types.StateSecretReceived, types.StateExecuted, PhaseWithdrawal, "Withdrawals completed", []string{}},

	// Phase 4: Recovery phase (from any depositing/withdrawal state)
	{types.StateEthLocked, types.StateCancelledSrc, PhaseRecovery, "Source escrow cancelled", []string{}},
	{types.StateSuiLocked, types.StateCancelledDst, PhaseRecovery, "Destination escrow cancelled", []string{}},
	{types.StateReadyForSecret, types.StateCancelledDst, PhaseRecovery, "Timeout cancellation", []string{}},
	{types.StateSecretReceived, types.StateCancelledSrc, PhaseRecovery, "Recovery cancellation", []string{}},

	// Final states
	{types.StateCancelledSrc, types.StateRefunded, PhaseRecovery, "Funds refunded to maker", []string{}},
	{types.StateCancelledDst, types.StateRefunded, PhaseRecovery, "Funds refunded to resolver", []string{}},

	// Error transitions (from any state)
	{types.StateNew, types.StateError, PhaseAnnouncement, "Error during processing", []string{"error"}},
	{types.StateAuctionStarted, types.StateError, PhaseAnnouncement, "Auction error", []string{"error"}},
	{types.StateEthLockPending, types.StateError, PhaseDepositing, "Source deposit error", []string{"error"}},
	{types.StateSuiLockPending, types.StateError, PhaseDepositing, "Destination deposit error", []string{"error"}},
	{types.StateSecretReceived, types.StateError, PhaseWithdrawal, "Withdrawal error", []string{"error"}},
}

// NewFusionStateMachine creates a new Fusion+ state machine
func NewFusionStateMachine() *FusionStateMachine {
	return &FusionStateMachine{
		orders:    make(map[string]*FusionOrderState),
		eventChan: make(chan StateEvent, 100),
		callbacks: make(map[types.SwapState][]StateCallback),
	}
}

// CreateOrder creates a new order state
func (fsm *FusionStateMachine) CreateOrder(orderHash string) *FusionOrderState {
	fsm.mutex.Lock()
	defer fsm.mutex.Unlock()

	now := time.Now()
	state := &FusionOrderState{
		OrderHash:     orderHash,
		CurrentState:  types.StateNew,
		Phase:         PhaseAnnouncement,
		OrderReceived: &now,
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	fsm.orders[orderHash] = state

	log.Printf("Created order state for %s in phase %d", orderHash, PhaseAnnouncement)
	return state
}

// TransitionTo attempts to transition an order to a new state
func (fsm *FusionStateMachine) TransitionTo(orderHash string, newState types.SwapState, data map[string]interface{}) error {
	fsm.mutex.Lock()
	defer fsm.mutex.Unlock()

	orderState, exists := fsm.orders[orderHash]
	if !exists {
		return fmt.Errorf("order not found: %s", orderHash)
	}

	oldState := orderState.CurrentState

	// Validate transition
	transition, valid := fsm.isValidTransition(oldState, newState)
	if !valid {
		return fmt.Errorf("invalid transition from %s to %s for order %s", oldState, newState, orderHash)
	}

	// Validate required data
	if err := fsm.validateRequiredData(transition, data); err != nil {
		return fmt.Errorf("transition validation failed: %w", err)
	}

	// Update state
	orderState.PreviousState = oldState
	orderState.CurrentState = newState
	orderState.UpdatedAt = time.Now()

	// Update phase if changed
	oldPhase := orderState.Phase
	if transition.Phase != orderState.Phase {
		orderState.Phase = transition.Phase

		fsm.eventChan <- StateEvent{
			Type:      StateEventPhaseChange,
			OrderHash: orderHash,
			OldState:  oldState,
			NewState:  newState,
			Phase:     transition.Phase,
			Data:      map[string]interface{}{"oldPhase": oldPhase, "newPhase": transition.Phase},
			Timestamp: time.Now(),
		}
	}

	// Update state-specific timestamps and data
	fsm.updateStateData(orderState, newState, data)

	log.Printf("Order %s transitioned from %s to %s (phase %d)", orderHash, oldState, newState, transition.Phase)

	// Send transition event
	fsm.eventChan <- StateEvent{
		Type:      StateEventTransition,
		OrderHash: orderHash,
		OldState:  oldState,
		NewState:  newState,
		Phase:     transition.Phase,
		Data:      data,
		Timestamp: time.Now(),
	}

	// Execute callbacks
	fsm.executeCallbacks(orderHash, oldState, newState, data)

	return nil
}

// updateStateData updates state-specific data and timestamps
func (fsm *FusionStateMachine) updateStateData(orderState *FusionOrderState, newState types.SwapState, data map[string]interface{}) {
	now := time.Now()

	switch newState {
	case types.StateAuctionStarted:
		orderState.AuctionStarted = &now

	case types.StateEthLockPending:
		if resolver, ok := data["resolver"].(string); ok {
			orderState.SelectedResolver = resolver
		}
		if rate, ok := data["rate"].(string); ok {
			orderState.AuctionRate = rate
		}
		orderState.ResolverSelected = &now
		orderState.SrcDepositStarted = &now

	case types.StateEthLocked:
		orderState.SrcDepositConfirmed = &now

	case types.StateSuiLockPending:
		orderState.DstDepositStarted = &now

	case types.StateSuiLocked:
		orderState.DstDepositConfirmed = &now

	case types.StateReadyForSecret:
		orderState.FinalityReached = &now

	case types.StateSecretReceived:
		orderState.SecretShared = &now
		orderState.SrcWithdrawStarted = &now

	case types.StateExecuted:
		orderState.SrcWithdrawDone = &now
		orderState.DstWithdrawDone = &now

	case types.StateCancelledSrc, types.StateCancelledDst:
		orderState.TimeoutTriggered = &now
		orderState.CancellationStarted = &now

	case types.StateRefunded:
		orderState.RecoveryCompleted = &now

	case types.StateError:
		if errorMsg, ok := data["error"].(string); ok {
			orderState.ErrorMessage = errorMsg
		}
		orderState.RetryCount++
	}
}

// isValidTransition checks if a state transition is valid
func (fsm *FusionStateMachine) isValidTransition(from, to types.SwapState) (StateTransition, bool) {
	for _, transition := range validTransitions {
		if transition.From == from && transition.To == to {
			return transition, true
		}
	}

	// Special case: error transitions from any state
	if to == types.StateError {
		return StateTransition{
			From:        from,
			To:          to,
			Phase:       PhaseRecovery,
			Description: "Error transition",
			Required:    []string{"error"},
		}, true
	}

	return StateTransition{}, false
}

// validateRequiredData validates that required data is present
func (fsm *FusionStateMachine) validateRequiredData(transition StateTransition, data map[string]interface{}) error {
	for _, required := range transition.Required {
		if _, exists := data[required]; !exists {
			return fmt.Errorf("missing required data field: %s", required)
		}
	}
	return nil
}

// GetOrderState returns the state of an order
func (fsm *FusionStateMachine) GetOrderState(orderHash string) (*FusionOrderState, bool) {
	fsm.mutex.RLock()
	defer fsm.mutex.RUnlock()

	state, exists := fsm.orders[orderHash]
	return state, exists
}

// GetOrdersByState returns all orders in a specific state
func (fsm *FusionStateMachine) GetOrdersByState(state types.SwapState) []*FusionOrderState {
	fsm.mutex.RLock()
	defer fsm.mutex.RUnlock()

	var orders []*FusionOrderState
	for _, orderState := range fsm.orders {
		if orderState.CurrentState == state {
			orders = append(orders, orderState)
		}
	}

	return orders
}

// GetOrdersByPhase returns all orders in a specific phase
func (fsm *FusionStateMachine) GetOrdersByPhase(phase FusionPhase) []*FusionOrderState {
	fsm.mutex.RLock()
	defer fsm.mutex.RUnlock()

	var orders []*FusionOrderState
	for _, orderState := range fsm.orders {
		if orderState.Phase == phase {
			orders = append(orders, orderState)
		}
	}

	return orders
}

// RegisterCallback registers a callback for state transitions
func (fsm *FusionStateMachine) RegisterCallback(state types.SwapState, callback StateCallback) {
	fsm.mutex.Lock()
	defer fsm.mutex.Unlock()

	if _, exists := fsm.callbacks[state]; !exists {
		fsm.callbacks[state] = make([]StateCallback, 0)
	}

	fsm.callbacks[state] = append(fsm.callbacks[state], callback)
}

// executeCallbacks executes registered callbacks for a state transition
func (fsm *FusionStateMachine) executeCallbacks(orderHash string, oldState, newState types.SwapState, data interface{}) {
	callbacks := fsm.callbacks[newState]

	for _, callback := range callbacks {
		go func(cb StateCallback) {
			if err := cb(orderHash, oldState, newState, data); err != nil {
				log.Printf("State callback error for order %s: %v", orderHash, err)

				fsm.eventChan <- StateEvent{
					Type:      StateEventError,
					OrderHash: orderHash,
					OldState:  oldState,
					NewState:  newState,
					Data:      err,
					Timestamp: time.Now(),
				}
			}
		}(callback)
	}
}

// GetEventChannel returns the event channel for state events
func (fsm *FusionStateMachine) GetEventChannel() <-chan StateEvent {
	return fsm.eventChan
}

// RetryOrder retries an order in error state
func (fsm *FusionStateMachine) RetryOrder(orderHash string) error {
	fsm.mutex.Lock()
	defer fsm.mutex.Unlock()

	orderState, exists := fsm.orders[orderHash]
	if !exists {
		return fmt.Errorf("order not found: %s", orderHash)
	}

	if orderState.CurrentState != types.StateError {
		return fmt.Errorf("order %s is not in error state", orderHash)
	}

	// Reset to previous state
	oldState := orderState.CurrentState
	orderState.CurrentState = orderState.PreviousState
	orderState.UpdatedAt = time.Now()

	log.Printf("Retrying order %s: %s -> %s", orderHash, oldState, orderState.CurrentState)

	fsm.eventChan <- StateEvent{
		Type:      StateEventRetry,
		OrderHash: orderHash,
		OldState:  oldState,
		NewState:  orderState.CurrentState,
		Phase:     orderState.Phase,
		Data:      nil,
		Timestamp: time.Now(),
	}

	return nil
}

// GetStateMachineStats returns statistics about the state machine
func (fsm *FusionStateMachine) GetStateMachineStats() map[string]interface{} {
	fsm.mutex.RLock()
	defer fsm.mutex.RUnlock()

	stats := map[string]interface{}{
		"totalOrders": len(fsm.orders),
	}

	// Count by state
	stateCounts := make(map[types.SwapState]int)
	phaseCounts := make(map[FusionPhase]int)
	errorCount := 0

	for _, orderState := range fsm.orders {
		stateCounts[orderState.CurrentState]++
		phaseCounts[orderState.Phase]++

		if orderState.CurrentState == types.StateError {
			errorCount++
		}
	}

	stats["stateDistribution"] = stateCounts
	stats["phaseDistribution"] = phaseCounts
	stats["errorCount"] = errorCount

	// Calculate average processing time by phase
	phaseTimings := make(map[FusionPhase]time.Duration)
	for phase := PhaseAnnouncement; phase <= PhaseRecovery; phase++ {
		var totalDuration time.Duration
		count := 0

		for _, orderState := range fsm.orders {
			if orderState.Phase > phase && orderState.OrderReceived != nil {
				// Calculate time spent in this phase
				duration := orderState.UpdatedAt.Sub(*orderState.OrderReceived)
				totalDuration += duration
				count++
			}
		}

		if count > 0 {
			phaseTimings[phase] = totalDuration / time.Duration(count)
		}
	}

	stats["averagePhaseTimings"] = phaseTimings

	return stats
}

// CleanupCompletedOrders removes old completed orders
func (fsm *FusionStateMachine) CleanupCompletedOrders(maxAge time.Duration) {
	fsm.mutex.Lock()
	defer fsm.mutex.Unlock()

	cutoff := time.Now().Add(-maxAge)
	cleaned := 0

	for orderHash, orderState := range fsm.orders {
		if (orderState.CurrentState == types.StateExecuted ||
			orderState.CurrentState == types.StateRefunded) &&
			orderState.UpdatedAt.Before(cutoff) {

			delete(fsm.orders, orderHash)
			cleaned++
		}
	}

	if cleaned > 0 {
		log.Printf("Cleaned up %d completed orders", cleaned)
	}
}
