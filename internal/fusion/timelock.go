package fusion

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/1inch/fusion-relayer/internal/types"
)

// TimelockManager implements the enhanced timelock system for Fusion+ as described in the whitepaper
// It manages three types of timelocks:
// 1. Finality locks - ensure chain finality before secret sharing
// 2. Exclusive withdrawal periods - give winning resolver exclusive time to withdraw
// 3. Cancellation timelocks - handle timeout and recovery scenarios
type TimelockManager struct {
	timelocks      map[string]*FusionTimelock
	scheduledTasks map[string]*ScheduledTask
	config         *types.TimelockConfig
	mutex          sync.RWMutex
	eventChan      chan TimelockEvent
	ctx            context.Context
	cancelFunc     context.CancelFunc

	// Callbacks for timelock events
	finalityCallback     func(string) error
	withdrawalCallback   func(string) error
	cancellationCallback func(string) error
}

// FusionTimelock represents a comprehensive timelock for a Fusion+ order
type FusionTimelock struct {
	OrderHash string
	State     TimelockState

	// Phase 2: Deposit phase timelocks
	SrcEscrowCreated   *time.Time
	DstEscrowCreated   *time.Time
	FinalityLockStart  *time.Time
	FinalityLockExpiry *time.Time

	// Phase 3: Withdrawal phase timelocks
	SecretSharedAt         *time.Time
	ExclusiveWithdrawStart *time.Time
	ExclusiveWithdrawEnd   *time.Time
	PublicWithdrawStart    *time.Time

	// Phase 4: Recovery phase timelocks
	DstCancellationStart *time.Time
	SrcCancellationStart *time.Time
	CancellationExpiry   *time.Time

	// Resolver information
	WinningResolverID string
	SafetyDeposit     bool

	// Tracking
	CreatedAt time.Time
	UpdatedAt time.Time
}

// TimelockState represents the current state of a timelock
type TimelockState string

const (
	TimelockStateCreated             TimelockState = "CREATED"
	TimelockStateFinalityPending     TimelockState = "FINALITY_PENDING"
	TimelockStateFinalityLocked      TimelockState = "FINALITY_LOCKED"
	TimelockStateExclusiveWithdraw   TimelockState = "EXCLUSIVE_WITHDRAW"
	TimelockStatePublicWithdraw      TimelockState = "PUBLIC_WITHDRAW"
	TimelockStateCancellationPending TimelockState = "CANCELLATION_PENDING"
	TimelockStateExpired             TimelockState = "EXPIRED"
	TimelockStateCompleted           TimelockState = "COMPLETED"
)

// ScheduledTask represents a scheduled timelock task
type ScheduledTask struct {
	ID          string
	OrderHash   string
	TaskType    TaskType
	ScheduledAt time.Time
	ExecuteAt   time.Time
	Executed    bool
	timer       *time.Timer
}

// TaskType represents types of scheduled tasks
type TaskType string

const (
	TaskTypeFinalityExpiry      TaskType = "FINALITY_EXPIRY"
	TaskTypeExclusiveExpiry     TaskType = "EXCLUSIVE_EXPIRY"
	TaskTypeCancellationTrigger TaskType = "CANCELLATION_TRIGGER"
	TaskTypeRecoveryTrigger     TaskType = "RECOVERY_TRIGGER"
)

// TimelockEvent represents events from the timelock system
type TimelockEvent struct {
	Type      TimelockEventType
	OrderHash string
	Data      interface{}
	Timestamp time.Time
}

// TimelockEventType represents types of timelock events
type TimelockEventType string

const (
	TimelockEventFinalityLockSet     TimelockEventType = "FINALITY_LOCK_SET"
	TimelockEventFinalityLockExpired TimelockEventType = "FINALITY_LOCK_EXPIRED"
	TimelockEventExclusiveStarted    TimelockEventType = "EXCLUSIVE_STARTED"
	TimelockEventExclusiveExpired    TimelockEventType = "EXCLUSIVE_EXPIRED"
	TimelockEventCancellationStarted TimelockEventType = "CANCELLATION_STARTED"
	TimelockEventOrderExpired        TimelockEventType = "ORDER_EXPIRED"
)

// NewTimelockManager creates a new timelock manager
func NewTimelockManager(config *types.TimelockConfig) *TimelockManager {
	ctx, cancel := context.WithCancel(context.Background())

	return &TimelockManager{
		timelocks:      make(map[string]*FusionTimelock),
		scheduledTasks: make(map[string]*ScheduledTask),
		config:         config,
		eventChan:      make(chan TimelockEvent, 100),
		ctx:            ctx,
		cancelFunc:     cancel,
	}
}

// Start starts the timelock manager
func (tm *TimelockManager) Start() error {
	log.Println("Starting Fusion+ Timelock Manager")

	// Start task processor
	go tm.processScheduledTasks()

	return nil
}

// Stop stops the timelock manager
func (tm *TimelockManager) Stop() {
	tm.cancelFunc()

	// Cancel all active timers
	tm.mutex.Lock()
	defer tm.mutex.Unlock()

	for _, task := range tm.scheduledTasks {
		if task.timer != nil {
			task.timer.Stop()
		}
	}

	log.Println("Timelock manager stopped")
}

// CreateOrderTimelock creates a new timelock for a Fusion+ order
func (tm *TimelockManager) CreateOrderTimelock(orderHash, resolverID string) *FusionTimelock {
	tm.mutex.Lock()
	defer tm.mutex.Unlock()

	now := time.Now()

	timelock := &FusionTimelock{
		OrderHash:         orderHash,
		State:             TimelockStateCreated,
		WinningResolverID: resolverID,
		CreatedAt:         now,
		UpdatedAt:         now,
	}

	tm.timelocks[orderHash] = timelock

	log.Printf("Created timelock for order %s with resolver %s", orderHash, resolverID)
	return timelock
}

// SetEscrowCreated sets the escrow creation time and starts finality lock
func (tm *TimelockManager) SetEscrowCreated(orderHash string, isSource bool) error {
	tm.mutex.Lock()
	defer tm.mutex.Unlock()

	timelock, exists := tm.timelocks[orderHash]
	if !exists {
		return fmt.Errorf("timelock not found for order: %s", orderHash)
	}

	now := time.Now()
	timelock.UpdatedAt = now

	if isSource {
		timelock.SrcEscrowCreated = &now
		log.Printf("Source escrow created for order %s", orderHash)
	} else {
		timelock.DstEscrowCreated = &now
		log.Printf("Destination escrow created for order %s", orderHash)
	}

	// Start finality lock if both escrows are created
	if timelock.SrcEscrowCreated != nil && timelock.DstEscrowCreated != nil {
		tm.startFinalityLock(timelock)
	}

	return nil
}

// startFinalityLock starts the finality lock period
func (tm *TimelockManager) startFinalityLock(timelock *FusionTimelock) {
	now := time.Now()
	timelock.FinalityLockStart = &now
	timelock.FinalityLockExpiry = &[]time.Time{now.Add(tm.config.FinalityLockDuration)}[0]
	timelock.State = TimelockStateFinalityLocked

	// Schedule finality expiry task
	tm.scheduleTask(timelock.OrderHash, TaskTypeFinalityExpiry, *timelock.FinalityLockExpiry)

	log.Printf("Finality lock started for order %s, expires at %v",
		timelock.OrderHash, timelock.FinalityLockExpiry)

	tm.eventChan <- TimelockEvent{
		Type:      TimelockEventFinalityLockSet,
		OrderHash: timelock.OrderHash,
		Data:      timelock,
		Timestamp: time.Now(),
	}
}

// TriggerSecretSharing triggers secret sharing after finality lock expiry
func (tm *TimelockManager) TriggerSecretSharing(orderHash string) error {
	tm.mutex.Lock()
	defer tm.mutex.Unlock()

	timelock, exists := tm.timelocks[orderHash]
	if !exists {
		return fmt.Errorf("timelock not found for order: %s", orderHash)
	}

	now := time.Now()
	timelock.SecretSharedAt = &now
	timelock.ExclusiveWithdrawStart = &now
	timelock.ExclusiveWithdrawEnd = &[]time.Time{now.Add(tm.config.ResolverExclusiveDuration)}[0]
	timelock.PublicWithdrawStart = timelock.ExclusiveWithdrawEnd
	timelock.State = TimelockStateExclusiveWithdraw
	timelock.UpdatedAt = now

	// Schedule exclusive withdrawal expiry
	tm.scheduleTask(orderHash, TaskTypeExclusiveExpiry, *timelock.ExclusiveWithdrawEnd)

	// Schedule cancellation trigger (destination chain timeout)
	dstCancellationTime := now.Add(tm.config.CancellationDuration)
	timelock.DstCancellationStart = &dstCancellationTime
	tm.scheduleTask(orderHash, TaskTypeCancellationTrigger, dstCancellationTime)

	log.Printf("Secret sharing triggered for order %s, exclusive withdraw until %v",
		orderHash, timelock.ExclusiveWithdrawEnd)

	// Execute finality callback
	if tm.finalityCallback != nil {
		go func() {
			if err := tm.finalityCallback(orderHash); err != nil {
				log.Printf("Finality callback failed for order %s: %v", orderHash, err)
			}
		}()
	}

	tm.eventChan <- TimelockEvent{
		Type:      TimelockEventExclusiveStarted,
		OrderHash: orderHash,
		Data:      timelock,
		Timestamp: time.Now(),
	}

	return nil
}

// NotifyWithdrawalCompleted notifies that withdrawal has been completed
func (tm *TimelockManager) NotifyWithdrawalCompleted(orderHash string) error {
	tm.mutex.Lock()
	defer tm.mutex.Unlock()

	timelock, exists := tm.timelocks[orderHash]
	if !exists {
		return fmt.Errorf("timelock not found for order: %s", orderHash)
	}

	timelock.State = TimelockStateCompleted
	timelock.UpdatedAt = time.Now()

	// Cancel all pending tasks for this order
	tm.cancelOrderTasks(orderHash)

	log.Printf("Withdrawal completed for order %s", orderHash)
	return nil
}

// scheduleTask schedules a timelock task
func (tm *TimelockManager) scheduleTask(orderHash string, taskType TaskType, executeAt time.Time) {
	taskID := fmt.Sprintf("%s_%s_%d", orderHash, taskType, executeAt.Unix())

	task := &ScheduledTask{
		ID:          taskID,
		OrderHash:   orderHash,
		TaskType:    taskType,
		ScheduledAt: time.Now(),
		ExecuteAt:   executeAt,
		Executed:    false,
	}

	// Create timer
	duration := time.Until(executeAt)
	if duration > 0 {
		task.timer = time.AfterFunc(duration, func() {
			tm.executeTask(task)
		})
	} else {
		// Execute immediately if time has passed
		go tm.executeTask(task)
	}

	tm.scheduledTasks[taskID] = task
	log.Printf("Scheduled task %s for order %s at %v", taskType, orderHash, executeAt)
}

// executeTask executes a scheduled task
func (tm *TimelockManager) executeTask(task *ScheduledTask) {
	tm.mutex.Lock()
	defer tm.mutex.Unlock()

	if task.Executed {
		return
	}

	task.Executed = true
	timelock := tm.timelocks[task.OrderHash]

	log.Printf("Executing task %s for order %s", task.TaskType, task.OrderHash)

	switch task.TaskType {
	case TaskTypeFinalityExpiry:
		tm.handleFinalityExpiry(timelock)
	case TaskTypeExclusiveExpiry:
		tm.handleExclusiveExpiry(timelock)
	case TaskTypeCancellationTrigger:
		tm.handleCancellationTrigger(timelock)
	case TaskTypeRecoveryTrigger:
		tm.handleRecoveryTrigger(timelock)
	}

	// Clean up task
	delete(tm.scheduledTasks, task.ID)
}

// handleFinalityExpiry handles finality lock expiry
func (tm *TimelockManager) handleFinalityExpiry(timelock *FusionTimelock) {
	log.Printf("Finality lock expired for order %s", timelock.OrderHash)

	tm.eventChan <- TimelockEvent{
		Type:      TimelockEventFinalityLockExpired,
		OrderHash: timelock.OrderHash,
		Data:      timelock,
		Timestamp: time.Now(),
	}

	// Trigger secret sharing
	tm.TriggerSecretSharing(timelock.OrderHash)
}

// handleExclusiveExpiry handles exclusive withdrawal period expiry
func (tm *TimelockManager) handleExclusiveExpiry(timelock *FusionTimelock) {
	timelock.State = TimelockStatePublicWithdraw
	timelock.UpdatedAt = time.Now()

	log.Printf("Exclusive withdrawal expired for order %s, now public", timelock.OrderHash)

	tm.eventChan <- TimelockEvent{
		Type:      TimelockEventExclusiveExpired,
		OrderHash: timelock.OrderHash,
		Data:      timelock,
		Timestamp: time.Now(),
	}
}

// handleCancellationTrigger handles cancellation trigger
func (tm *TimelockManager) handleCancellationTrigger(timelock *FusionTimelock) {
	timelock.State = TimelockStateCancellationPending
	timelock.UpdatedAt = time.Now()

	// Schedule recovery trigger for source chain (longer timeout)
	srcCancellationTime := time.Now().Add(tm.config.CancellationDuration * 2)
	timelock.SrcCancellationStart = &srcCancellationTime
	tm.scheduleTask(timelock.OrderHash, TaskTypeRecoveryTrigger, srcCancellationTime)

	log.Printf("Cancellation triggered for order %s", timelock.OrderHash)

	tm.eventChan <- TimelockEvent{
		Type:      TimelockEventCancellationStarted,
		OrderHash: timelock.OrderHash,
		Data:      timelock,
		Timestamp: time.Now(),
	}

	// Execute cancellation callback
	if tm.cancellationCallback != nil {
		go func() {
			if err := tm.cancellationCallback(timelock.OrderHash); err != nil {
				log.Printf("Cancellation callback failed for order %s: %v", timelock.OrderHash, err)
			}
		}()
	}
}

// handleRecoveryTrigger handles recovery trigger (final timeout)
func (tm *TimelockManager) handleRecoveryTrigger(timelock *FusionTimelock) {
	timelock.State = TimelockStateExpired
	timelock.CancellationExpiry = &[]time.Time{time.Now()}[0]
	timelock.UpdatedAt = time.Now()

	log.Printf("Order %s expired, recovery phase triggered", timelock.OrderHash)

	tm.eventChan <- TimelockEvent{
		Type:      TimelockEventOrderExpired,
		OrderHash: timelock.OrderHash,
		Data:      timelock,
		Timestamp: time.Now(),
	}
}

// cancelOrderTasks cancels all tasks for an order
func (tm *TimelockManager) cancelOrderTasks(orderHash string) {
	for taskID, task := range tm.scheduledTasks {
		if task.OrderHash == orderHash && !task.Executed {
			if task.timer != nil {
				task.timer.Stop()
			}
			delete(tm.scheduledTasks, taskID)
		}
	}
}

// GetTimelock returns a timelock by order hash
func (tm *TimelockManager) GetTimelock(orderHash string) (*FusionTimelock, bool) {
	tm.mutex.RLock()
	defer tm.mutex.RUnlock()

	timelock, exists := tm.timelocks[orderHash]
	return timelock, exists
}

// GetEventChannel returns the event channel for timelock events
func (tm *TimelockManager) GetEventChannel() <-chan TimelockEvent {
	return tm.eventChan
}

// SetCallbacks sets callback functions for timelock events
func (tm *TimelockManager) SetCallbacks(
	finalityCallback func(string) error,
	withdrawalCallback func(string) error,
	cancellationCallback func(string) error,
) {
	tm.finalityCallback = finalityCallback
	tm.withdrawalCallback = withdrawalCallback
	tm.cancellationCallback = cancellationCallback
}

// processScheduledTasks processes scheduled tasks (cleanup and monitoring)
func (tm *TimelockManager) processScheduledTasks() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			tm.cleanupExpiredTasks()
		case <-tm.ctx.Done():
			return
		}
	}
}

// cleanupExpiredTasks removes old executed tasks
func (tm *TimelockManager) cleanupExpiredTasks() {
	tm.mutex.Lock()
	defer tm.mutex.Unlock()

	cutoff := time.Now().Add(-1 * time.Hour)
	cleaned := 0

	for taskID, task := range tm.scheduledTasks {
		if task.Executed && task.ScheduledAt.Before(cutoff) {
			delete(tm.scheduledTasks, taskID)
			cleaned++
		}
	}

	if cleaned > 0 {
		log.Printf("Cleaned up %d expired timelock tasks", cleaned)
	}
}

// GetTimelockStats returns statistics about timelocks
func (tm *TimelockManager) GetTimelockStats() map[string]interface{} {
	tm.mutex.RLock()
	defer tm.mutex.RUnlock()

	stats := map[string]interface{}{
		"totalTimelocks": len(tm.timelocks),
		"scheduledTasks": len(tm.scheduledTasks),
	}

	// Count by state
	stateCounts := make(map[TimelockState]int)
	for _, timelock := range tm.timelocks {
		stateCounts[timelock.State]++
	}

	stats["stateDistribution"] = stateCounts

	// Count tasks by type
	taskCounts := make(map[TaskType]int)
	for _, task := range tm.scheduledTasks {
		if !task.Executed {
			taskCounts[task.TaskType]++
		}
	}

	stats["pendingTasks"] = taskCounts

	return stats
}
