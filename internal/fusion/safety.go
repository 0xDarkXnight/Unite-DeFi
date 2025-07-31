package fusion

import (
	"fmt"
	"log"
	"math/big"
	"sync"
	"time"
)

// SafetyDepositManager implements safety deposit mechanics for resolvers as described in the Fusion+ whitepaper
// Safety deposits incentivize resolvers to:
// 1. Perform withdrawals on behalf of makers
// 2. Execute cancellations when timeouts occur
// 3. Complete swaps properly without malicious behavior
type SafetyDepositManager struct {
	deposits       map[string]*SafetyDeposit
	claimable      map[string]*ClaimableDeposit
	resolverTotals map[string]*big.Int
	config         *SafetyDepositConfig
	mutex          sync.RWMutex
	eventChan      chan SafetyDepositEvent
}

// SafetyDeposit represents a safety deposit made by a resolver
type SafetyDeposit struct {
	OrderHash    string
	ResolverID   string
	SourceAmount *big.Int // Amount deposited on source chain
	DestAmount   *big.Int // Amount deposited on destination chain
	Token        string   // Token type (e.g., "ETH", "SUI")
	DepositedAt  time.Time
	Status       DepositStatus
	ClaimedBy    string // Who claimed the deposit
	ClaimedAt    *time.Time
	ClaimTxHash  string // Transaction hash of claim

	// Escrow addresses where deposits are held
	SourceEscrowAddr string
	DestEscrowAddr   string
}

// ClaimableDeposit represents a safety deposit that can be claimed
type ClaimableDeposit struct {
	OrderHash       string
	TotalAmount     *big.Int
	ClaimableBy     []string  // List of addresses that can claim
	ClaimDeadline   time.Time // When the claim period expires
	ClaimReason     ClaimReason
	OriginalDeposit *SafetyDeposit
}

// DepositStatus represents the status of a safety deposit
type DepositStatus string

const (
	DepositStatusActive   DepositStatus = "ACTIVE"
	DepositStatusClaimed  DepositStatus = "CLAIMED"
	DepositStatusExpired  DepositStatus = "EXPIRED"
	DepositStatusRefunded DepositStatus = "REFUNDED"
)

// ClaimReason represents why a safety deposit can be claimed
type ClaimReason string

const (
	ClaimReasonWithdrawalExecuted   ClaimReason = "WITHDRAWAL_EXECUTED"
	ClaimReasonCancellationExecuted ClaimReason = "CANCELLATION_EXECUTED"
	ClaimReasonTimeout              ClaimReason = "TIMEOUT"
	ClaimReasonMaliciousBehavior    ClaimReason = "MALICIOUS_BEHAVIOR"
)

// SafetyDepositConfig represents configuration for safety deposits
type SafetyDepositConfig struct {
	MinimumDeposit      *big.Int      // Minimum safety deposit amount
	MaximumDeposit      *big.Int      // Maximum safety deposit amount
	ClaimWindow         time.Duration // How long deposits can be claimed
	RefundWindow        time.Duration // How long until unclaimed deposits are refunded
	IncentiveMultiplier float64       // Multiplier for incentive calculation
}

// SafetyDepositEvent represents events from the safety deposit system
type SafetyDepositEvent struct {
	Type      SafetyDepositEventType
	OrderHash string
	Data      interface{}
	Timestamp time.Time
}

// SafetyDepositEventType represents types of safety deposit events
type SafetyDepositEventType string

const (
	SafetyDepositEventDeposited SafetyDepositEventType = "DEPOSITED"
	SafetyDepositEventClaimable SafetyDepositEventType = "CLAIMABLE"
	SafetyDepositEventClaimed   SafetyDepositEventType = "CLAIMED"
	SafetyDepositEventRefunded  SafetyDepositEventType = "REFUNDED"
	SafetyDepositEventExpired   SafetyDepositEventType = "EXPIRED"
)

// NewSafetyDepositManager creates a new safety deposit manager
func NewSafetyDepositManager(config *SafetyDepositConfig) *SafetyDepositManager {
	return &SafetyDepositManager{
		deposits:       make(map[string]*SafetyDeposit),
		claimable:      make(map[string]*ClaimableDeposit),
		resolverTotals: make(map[string]*big.Int),
		config:         config,
		eventChan:      make(chan SafetyDepositEvent, 100),
	}
}

// RecordDeposit records a safety deposit made by a resolver
func (sdm *SafetyDepositManager) RecordDeposit(orderHash, resolverID string, sourceAmount, destAmount *big.Int, token string) error {
	sdm.mutex.Lock()
	defer sdm.mutex.Unlock()

	// Validate deposit amounts
	if sourceAmount.Cmp(sdm.config.MinimumDeposit) < 0 || destAmount.Cmp(sdm.config.MinimumDeposit) < 0 {
		return fmt.Errorf("deposit amounts below minimum: source=%s, dest=%s, min=%s",
			sourceAmount.String(), destAmount.String(), sdm.config.MinimumDeposit.String())
	}

	if sourceAmount.Cmp(sdm.config.MaximumDeposit) > 0 || destAmount.Cmp(sdm.config.MaximumDeposit) > 0 {
		return fmt.Errorf("deposit amounts above maximum: source=%s, dest=%s, max=%s",
			sourceAmount.String(), destAmount.String(), sdm.config.MaximumDeposit.String())
	}

	// Check if deposit already exists
	if _, exists := sdm.deposits[orderHash]; exists {
		return fmt.Errorf("deposit already exists for order: %s", orderHash)
	}

	deposit := &SafetyDeposit{
		OrderHash:    orderHash,
		ResolverID:   resolverID,
		SourceAmount: new(big.Int).Set(sourceAmount),
		DestAmount:   new(big.Int).Set(destAmount),
		Token:        token,
		DepositedAt:  time.Now(),
		Status:       DepositStatusActive,
	}

	sdm.deposits[orderHash] = deposit

	// Update resolver totals
	if _, exists := sdm.resolverTotals[resolverID]; !exists {
		sdm.resolverTotals[resolverID] = big.NewInt(0)
	}
	totalAmount := new(big.Int).Add(sourceAmount, destAmount)
	sdm.resolverTotals[resolverID].Add(sdm.resolverTotals[resolverID], totalAmount)

	log.Printf("Recorded safety deposit for order %s by resolver %s: source=%s, dest=%s",
		orderHash, resolverID, sourceAmount.String(), destAmount.String())

	// Send event
	sdm.eventChan <- SafetyDepositEvent{
		Type:      SafetyDepositEventDeposited,
		OrderHash: orderHash,
		Data:      deposit,
		Timestamp: time.Now(),
	}

	return nil
}

// MakeClaimable makes a safety deposit claimable due to successful withdrawal
func (sdm *SafetyDepositManager) MakeClaimable(orderHash string, claimableBy []string, reason ClaimReason) error {
	sdm.mutex.Lock()
	defer sdm.mutex.Unlock()

	deposit, exists := sdm.deposits[orderHash]
	if !exists {
		return fmt.Errorf("no deposit found for order: %s", orderHash)
	}

	if deposit.Status != DepositStatusActive {
		return fmt.Errorf("deposit not active for order: %s, status: %s", orderHash, deposit.Status)
	}

	totalAmount := new(big.Int).Add(deposit.SourceAmount, deposit.DestAmount)
	claimDeadline := time.Now().Add(sdm.config.ClaimWindow)

	claimable := &ClaimableDeposit{
		OrderHash:       orderHash,
		TotalAmount:     totalAmount,
		ClaimableBy:     claimableBy,
		ClaimDeadline:   claimDeadline,
		ClaimReason:     reason,
		OriginalDeposit: deposit,
	}

	sdm.claimable[orderHash] = claimable

	log.Printf("Safety deposit for order %s is now claimable by %v until %v (reason: %s)",
		orderHash, claimableBy, claimDeadline, reason)

	// Send event
	sdm.eventChan <- SafetyDepositEvent{
		Type:      SafetyDepositEventClaimable,
		OrderHash: orderHash,
		Data:      claimable,
		Timestamp: time.Now(),
	}

	// Schedule automatic refund if not claimed
	go sdm.scheduleRefund(orderHash, claimDeadline.Add(sdm.config.RefundWindow))

	return nil
}

// ClaimDeposit allows eligible parties to claim a safety deposit
func (sdm *SafetyDepositManager) ClaimDeposit(orderHash, claimerAddress, txHash string) error {
	sdm.mutex.Lock()
	defer sdm.mutex.Unlock()

	claimable, exists := sdm.claimable[orderHash]
	if !exists {
		return fmt.Errorf("no claimable deposit for order: %s", orderHash)
	}

	// Check if claimer is eligible
	eligible := false
	for _, addr := range claimable.ClaimableBy {
		if addr == claimerAddress {
			eligible = true
			break
		}
	}

	if !eligible {
		return fmt.Errorf("address %s not eligible to claim deposit for order %s", claimerAddress, orderHash)
	}

	// Check claim deadline
	if time.Now().After(claimable.ClaimDeadline) {
		return fmt.Errorf("claim deadline passed for order: %s", orderHash)
	}

	deposit := claimable.OriginalDeposit
	deposit.Status = DepositStatusClaimed
	deposit.ClaimedBy = claimerAddress
	deposit.ClaimedAt = &[]time.Time{time.Now()}[0]
	deposit.ClaimTxHash = txHash

	// Remove from claimable
	delete(sdm.claimable, orderHash)

	// Update resolver totals (subtract claimed amount)
	if total, exists := sdm.resolverTotals[deposit.ResolverID]; exists {
		total.Sub(total, claimable.TotalAmount)
	}

	log.Printf("Safety deposit for order %s claimed by %s (tx: %s)", orderHash, claimerAddress, txHash)

	// Send event
	sdm.eventChan <- SafetyDepositEvent{
		Type:      SafetyDepositEventClaimed,
		OrderHash: orderHash,
		Data: map[string]interface{}{
			"claimedBy": claimerAddress,
			"amount":    claimable.TotalAmount.String(),
			"txHash":    txHash,
		},
		Timestamp: time.Now(),
	}

	return nil
}

// RefundDeposit refunds an unclaimed safety deposit to the resolver
func (sdm *SafetyDepositManager) RefundDeposit(orderHash string) error {
	sdm.mutex.Lock()
	defer sdm.mutex.Unlock()

	deposit, exists := sdm.deposits[orderHash]
	if !exists {
		return fmt.Errorf("no deposit found for order: %s", orderHash)
	}

	if deposit.Status != DepositStatusActive {
		return fmt.Errorf("deposit not active for order: %s, status: %s", orderHash, deposit.Status)
	}

	deposit.Status = DepositStatusRefunded

	// Remove from claimable if it exists
	delete(sdm.claimable, orderHash)

	log.Printf("Safety deposit for order %s refunded to resolver %s", orderHash, deposit.ResolverID)

	// Send event
	sdm.eventChan <- SafetyDepositEvent{
		Type:      SafetyDepositEventRefunded,
		OrderHash: orderHash,
		Data:      deposit,
		Timestamp: time.Now(),
	}

	return nil
}

// GetDeposit returns a safety deposit by order hash
func (sdm *SafetyDepositManager) GetDeposit(orderHash string) (*SafetyDeposit, bool) {
	sdm.mutex.RLock()
	defer sdm.mutex.RUnlock()

	deposit, exists := sdm.deposits[orderHash]
	return deposit, exists
}

// GetClaimableDeposit returns a claimable deposit by order hash
func (sdm *SafetyDepositManager) GetClaimableDeposit(orderHash string) (*ClaimableDeposit, bool) {
	sdm.mutex.RLock()
	defer sdm.mutex.RUnlock()

	claimable, exists := sdm.claimable[orderHash]
	return claimable, exists
}

// GetResolverTotal returns the total safety deposits for a resolver
func (sdm *SafetyDepositManager) GetResolverTotal(resolverID string) *big.Int {
	sdm.mutex.RLock()
	defer sdm.mutex.RUnlock()

	if total, exists := sdm.resolverTotals[resolverID]; exists {
		return new(big.Int).Set(total)
	}

	return big.NewInt(0)
}

// GetEventChannel returns the event channel for safety deposit events
func (sdm *SafetyDepositManager) GetEventChannel() <-chan SafetyDepositEvent {
	return sdm.eventChan
}

// CalculateIncentive calculates the incentive amount for executing an operation
func (sdm *SafetyDepositManager) CalculateIncentive(depositAmount *big.Int, operationType ClaimReason) *big.Int {
	incentiveFloat := new(big.Float).SetInt(depositAmount)

	// Adjust multiplier based on operation type
	var multiplier *big.Float
	switch operationType {
	case ClaimReasonWithdrawalExecuted:
		// Standard incentive for withdrawal
		multiplier = big.NewFloat(sdm.config.IncentiveMultiplier)
	case ClaimReasonCancellationExecuted:
		// Higher incentive for cancellation (more complex operation)
		multiplier = big.NewFloat(sdm.config.IncentiveMultiplier * 1.5)
	case ClaimReasonTimeout:
		// Maximum incentive for timeout handling
		multiplier = big.NewFloat(sdm.config.IncentiveMultiplier * 2.0)
	default:
		// Default incentive
		multiplier = big.NewFloat(sdm.config.IncentiveMultiplier)
	}

	incentiveFloat.Mul(incentiveFloat, multiplier)
	incentive, _ := incentiveFloat.Int(nil)

	return incentive
}

// scheduleRefund schedules automatic refund of unclaimed deposits
func (sdm *SafetyDepositManager) scheduleRefund(orderHash string, refundTime time.Time) {
	waitDuration := time.Until(refundTime)
	if waitDuration <= 0 {
		return
	}

	time.AfterFunc(waitDuration, func() {
		sdm.mutex.RLock()
		_, exists := sdm.claimable[orderHash]
		sdm.mutex.RUnlock()

		if exists {
			if err := sdm.RefundDeposit(orderHash); err != nil {
				log.Printf("Failed to refund deposit for order %s: %v", orderHash, err)
			}
		}
	})
}

// GetDepositStats returns statistics about safety deposits
func (sdm *SafetyDepositManager) GetDepositStats() map[string]interface{} {
	sdm.mutex.RLock()
	defer sdm.mutex.RUnlock()

	stats := map[string]interface{}{
		"totalDeposits":     len(sdm.deposits),
		"claimableDeposits": len(sdm.claimable),
		"activeResolvers":   len(sdm.resolverTotals),
	}

	// Count by status
	statusCounts := make(map[DepositStatus]int)
	totalDepositValue := big.NewInt(0)
	totalClaimableValue := big.NewInt(0)

	for _, deposit := range sdm.deposits {
		statusCounts[deposit.Status]++

		if deposit.Status == DepositStatusActive {
			depositValue := new(big.Int).Add(deposit.SourceAmount, deposit.DestAmount)
			totalDepositValue.Add(totalDepositValue, depositValue)
		}
	}

	for _, claimable := range sdm.claimable {
		totalClaimableValue.Add(totalClaimableValue, claimable.TotalAmount)
	}

	stats["statusDistribution"] = statusCounts
	stats["totalDepositValue"] = totalDepositValue.String()
	stats["totalClaimableValue"] = totalClaimableValue.String()

	// Top resolvers by deposit amount
	type resolverTotal struct {
		ResolverID string
		Total      *big.Int
	}

	var resolverList []resolverTotal
	for resolverID, total := range sdm.resolverTotals {
		resolverList = append(resolverList, resolverTotal{
			ResolverID: resolverID,
			Total:      new(big.Int).Set(total),
		})
	}

	// Sort by total (simple implementation)
	for i := 0; i < len(resolverList)-1; i++ {
		for j := i + 1; j < len(resolverList); j++ {
			if resolverList[i].Total.Cmp(resolverList[j].Total) < 0 {
				resolverList[i], resolverList[j] = resolverList[j], resolverList[i]
			}
		}
	}

	topResolvers := make([]map[string]interface{}, 0)
	for i, resolver := range resolverList {
		if i >= 10 { // Top 10
			break
		}
		topResolvers = append(topResolvers, map[string]interface{}{
			"resolverId": resolver.ResolverID,
			"total":      resolver.Total.String(),
		})
	}

	stats["topResolvers"] = topResolvers

	return stats
}

// CleanupExpiredDeposits removes old deposits and refunds expired claimable deposits
func (sdm *SafetyDepositManager) CleanupExpiredDeposits(maxAge time.Duration) {
	sdm.mutex.Lock()
	defer sdm.mutex.Unlock()

	cutoff := time.Now().Add(-maxAge)
	cleaned := 0

	// Clean up old deposits
	for orderHash, deposit := range sdm.deposits {
		if (deposit.Status == DepositStatusClaimed || deposit.Status == DepositStatusRefunded) &&
			deposit.DepositedAt.Before(cutoff) {
			delete(sdm.deposits, orderHash)
			cleaned++
		}
	}

	// Handle expired claimable deposits
	now := time.Now()
	for orderHash, claimable := range sdm.claimable {
		if now.After(claimable.ClaimDeadline.Add(sdm.config.RefundWindow)) {
			// Mark as expired and refund
			deposit := claimable.OriginalDeposit
			deposit.Status = DepositStatusExpired
			delete(sdm.claimable, orderHash)

			sdm.eventChan <- SafetyDepositEvent{
				Type:      SafetyDepositEventExpired,
				OrderHash: orderHash,
				Data:      deposit,
				Timestamp: time.Now(),
			}

			log.Printf("Safety deposit for order %s expired and refunded", orderHash)
		}
	}

	if cleaned > 0 {
		log.Printf("Cleaned up %d expired safety deposits", cleaned)
	}
}
