package fusion

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log"
	"math/big"
	"sync"
	"time"
)

// PartialFillManager implements partial fill support with Merkle tree secrets as described in the Fusion+ whitepaper
// When an order is divided into N parts, N+1 secrets are generated and organized in a Merkle tree
// Each resolver uses the appropriate secret based on their fill percentage
type PartialFillManager struct {
	partialOrders map[string]*PartialFillOrder
	merkleSecrets map[string]*MerkleSecretTree
	fillEvents    map[string][]*FillEvent
	config        *PartialFillConfig
	mutex         sync.RWMutex
	eventChan     chan PartialFillEvent
}

// PartialFillOrder represents an order that supports partial fills
type PartialFillOrder struct {
	OrderHash       string
	TotalAmount     *big.Int
	FilledAmount    *big.Int
	RemainingAmount *big.Int
	FillPercentage  float64
	TotalParts      int
	CompletedParts  int

	// Merkle tree configuration
	MerkleRoot       string
	SecretsGenerated bool

	// Fill tracking
	FillHistory     []*FillEvent
	ActiveResolvers map[string]*ResolverFill

	// Status
	Status      PartialFillStatus
	CreatedAt   time.Time
	UpdatedAt   time.Time
	CompletedAt *time.Time
}

// ResolverFill represents a resolver's fill for a partial order
type ResolverFill struct {
	ResolverID     string
	FillAmount     *big.Int
	FillPercentage float64
	SecretIndex    int
	Secret         string
	TxHash         string
	Timestamp      time.Time
	Status         FillStatus
}

// FillEvent represents a fill event
type FillEvent struct {
	OrderHash      string
	ResolverID     string
	FillAmount     *big.Int
	SecretIndex    int
	CumulativeFill *big.Int
	FillPercentage float64
	Timestamp      time.Time
	TxHash         string
}

// MerkleSecretTree represents the Merkle tree of secrets for partial fills
// type MerkleSecretTree struct {
// 	OrderHash    string
// 	TotalParts   int
// 	Secrets      []string       // N+1 secrets
// 	SecretHashes []string       // Hashes of secrets
// 	MerkleRoot   string         // Root of Merkle tree
// 	MerkleProofs [][]string     // Merkle proofs for each secret
// 	UsedSecrets  map[int]bool   // Track which secrets have been used
// 	SecretMap    map[int]string // Map fill percentage to secret index
// }

// PartialFillStatus represents the status of a partial fill order
type PartialFillStatus string

const (
	PartialFillStatusActive    PartialFillStatus = "ACTIVE"
	PartialFillStatusCompleted PartialFillStatus = "COMPLETED"
	PartialFillStatusCancelled PartialFillStatus = "CANCELLED"
	PartialFillStatusExpired   PartialFillStatus = "EXPIRED"
)

// FillStatus represents the status of an individual fill
type FillStatus string

const (
	FillStatusPending   FillStatus = "PENDING"
	FillStatusConfirmed FillStatus = "CONFIRMED"
	FillStatusFailed    FillStatus = "FAILED"
)

// PartialFillConfig represents configuration for partial fills
type PartialFillConfig struct {
	MaxParts          int           // Maximum number of parts an order can be divided into
	MinFillAmount     *big.Int      // Minimum amount for a single fill
	MaxFillPercentage float64       // Maximum percentage a single resolver can fill
	FillTimeout       time.Duration // Timeout for individual fills
	CompletionTimeout time.Duration // Timeout for order completion
}

// PartialFillEvent represents events from the partial fill system
type PartialFillEvent struct {
	Type      PartialFillEventType
	OrderHash string
	Data      interface{}
	Timestamp time.Time
}

// PartialFillEventType represents types of partial fill events
type PartialFillEventType string

const (
	PartialFillEventOrderCreated     PartialFillEventType = "ORDER_CREATED"
	PartialFillEventSecretsGenerated PartialFillEventType = "SECRETS_GENERATED"
	PartialFillEventFillExecuted     PartialFillEventType = "FILL_EXECUTED"
	PartialFillEventOrderCompleted   PartialFillEventType = "ORDER_COMPLETED"
	PartialFillEventSecretRevealed   PartialFillEventType = "SECRET_REVEALED"
)

// NewPartialFillManager creates a new partial fill manager
func NewPartialFillManager(config *PartialFillConfig) *PartialFillManager {
	return &PartialFillManager{
		partialOrders: make(map[string]*PartialFillOrder),
		merkleSecrets: make(map[string]*MerkleSecretTree),
		fillEvents:    make(map[string][]*FillEvent),
		config:        config,
		eventChan:     make(chan PartialFillEvent, 100),
	}
}

// CreatePartialFillOrder creates a new partial fill order
func (pfm *PartialFillManager) CreatePartialFillOrder(orderHash string, totalAmount *big.Int, totalParts int) (*PartialFillOrder, error) {
	pfm.mutex.Lock()
	defer pfm.mutex.Unlock()

	// Validate parameters
	if totalParts <= 0 || totalParts > pfm.config.MaxParts {
		return nil, fmt.Errorf("invalid total parts: %d (max: %d)", totalParts, pfm.config.MaxParts)
	}

	if totalAmount.Cmp(pfm.config.MinFillAmount) < 0 {
		return nil, fmt.Errorf("total amount below minimum: %s (min: %s)",
			totalAmount.String(), pfm.config.MinFillAmount.String())
	}

	// Check if order already exists
	if _, exists := pfm.partialOrders[orderHash]; exists {
		return nil, fmt.Errorf("partial fill order already exists: %s", orderHash)
	}

	order := &PartialFillOrder{
		OrderHash:       orderHash,
		TotalAmount:     new(big.Int).Set(totalAmount),
		FilledAmount:    big.NewInt(0),
		RemainingAmount: new(big.Int).Set(totalAmount),
		FillPercentage:  0.0,
		TotalParts:      totalParts,
		CompletedParts:  0,
		FillHistory:     make([]*FillEvent, 0),
		ActiveResolvers: make(map[string]*ResolverFill),
		Status:          PartialFillStatusActive,
		CreatedAt:       time.Now(),
		UpdatedAt:       time.Now(),
	}

	pfm.partialOrders[orderHash] = order
	pfm.fillEvents[orderHash] = make([]*FillEvent, 0)

	log.Printf("Created partial fill order %s: total=%s, parts=%d",
		orderHash, totalAmount.String(), totalParts)

	// Generate Merkle tree secrets
	if err := pfm.generateMerkleSecrets(order); err != nil {
		delete(pfm.partialOrders, orderHash)
		return nil, fmt.Errorf("failed to generate Merkle secrets: %w", err)
	}

	// Send event
	pfm.eventChan <- PartialFillEvent{
		Type:      PartialFillEventOrderCreated,
		OrderHash: orderHash,
		Data:      order,
		Timestamp: time.Now(),
	}

	return order, nil
}

// generateMerkleSecrets generates N+1 secrets and organizes them in a Merkle tree
func (pfm *PartialFillManager) generateMerkleSecrets(order *PartialFillOrder) error {
	totalParts := order.TotalParts
	secrets := make([]string, totalParts+1)
	secretHashes := make([]string, totalParts+1)

	// Generate secrets
	for i := 0; i <= totalParts; i++ {
		secret := pfm.generateRandomSecret()
		hash := sha256.Sum256([]byte(secret))

		secrets[i] = secret
		secretHashes[i] = hex.EncodeToString(hash[:])
	}

	// Calculate Merkle root
	merkleRoot := pfm.calculateMerkleRoot(secretHashes)

	merkleTree := &MerkleSecretTree{
		OrderHash:    order.OrderHash,
		TotalParts:   totalParts,
		Secrets:      secrets,
		SecretHashes: secretHashes,
		MerkleRoot:   merkleRoot,
		UsedSecrets:  make(map[int]bool),
		FillProgress: make(map[string]int),
	}

	pfm.merkleSecrets[order.OrderHash] = merkleTree
	order.MerkleRoot = merkleRoot
	order.SecretsGenerated = true

	log.Printf("Generated Merkle secrets for order %s: root=%s", order.OrderHash, merkleRoot)

	// Send event
	pfm.eventChan <- PartialFillEvent{
		Type:      PartialFillEventSecretsGenerated,
		OrderHash: order.OrderHash,
		Data:      merkleTree,
		Timestamp: time.Now(),
	}

	return nil
}

// ExecuteFill executes a partial fill by a resolver
func (pfm *PartialFillManager) ExecuteFill(orderHash, resolverID string, fillAmount *big.Int, txHash string) error {
	pfm.mutex.Lock()
	defer pfm.mutex.Unlock()

	order, exists := pfm.partialOrders[orderHash]
	if !exists {
		return fmt.Errorf("partial fill order not found: %s", orderHash)
	}

	if order.Status != PartialFillStatusActive {
		return fmt.Errorf("order not active: %s, status: %s", orderHash, order.Status)
	}

	// Validate fill amount
	if fillAmount.Cmp(pfm.config.MinFillAmount) < 0 {
		return fmt.Errorf("fill amount below minimum: %s (min: %s)",
			fillAmount.String(), pfm.config.MinFillAmount.String())
	}

	if fillAmount.Cmp(order.RemainingAmount) > 0 {
		return fmt.Errorf("fill amount exceeds remaining: %s (remaining: %s)",
			fillAmount.String(), order.RemainingAmount.String())
	}

	// Calculate fill percentage
	newFilledAmount := new(big.Int).Add(order.FilledAmount, fillAmount)
	fillPercentage := float64(newFilledAmount.Uint64()) / float64(order.TotalAmount.Uint64()) * 100

	// Check maximum fill percentage per resolver
	if fillPercentage > pfm.config.MaxFillPercentage {
		return fmt.Errorf("fill percentage exceeds maximum: %.2f%% (max: %.2f%%)",
			fillPercentage, pfm.config.MaxFillPercentage)
	}

	// Determine secret index based on fill percentage
	secretIndex := pfm.calculateSecretIndex(fillPercentage, order.TotalParts)

	// Get the appropriate secret
	merkleTree := pfm.merkleSecrets[orderHash]
	if secretIndex >= len(merkleTree.Secrets) {
		return fmt.Errorf("invalid secret index: %d", secretIndex)
	}

	secret := merkleTree.Secrets[secretIndex]

	// Mark secret as used
	merkleTree.UsedSecrets[secretIndex] = true

	// Create resolver fill
	resolverFill := &ResolverFill{
		ResolverID:     resolverID,
		FillAmount:     new(big.Int).Set(fillAmount),
		FillPercentage: fillPercentage,
		SecretIndex:    secretIndex,
		Secret:         secret,
		TxHash:         txHash,
		Timestamp:      time.Now(),
		Status:         FillStatusConfirmed,
	}

	order.ActiveResolvers[resolverID] = resolverFill

	// Update order state
	order.FilledAmount.Add(order.FilledAmount, fillAmount)
	order.RemainingAmount.Sub(order.RemainingAmount, fillAmount)
	order.FillPercentage = float64(order.FilledAmount.Uint64()) / float64(order.TotalAmount.Uint64()) * 100
	order.CompletedParts++
	order.UpdatedAt = time.Now()

	// Create fill event
	fillEvent := &FillEvent{
		OrderHash:      orderHash,
		ResolverID:     resolverID,
		FillAmount:     new(big.Int).Set(fillAmount),
		SecretIndex:    secretIndex,
		CumulativeFill: new(big.Int).Set(order.FilledAmount),
		FillPercentage: order.FillPercentage,
		Timestamp:      time.Now(),
		TxHash:         txHash,
	}

	order.FillHistory = append(order.FillHistory, fillEvent)
	pfm.fillEvents[orderHash] = append(pfm.fillEvents[orderHash], fillEvent)

	log.Printf("Fill executed for order %s by resolver %s: amount=%s, percentage=%.2f%%, secret_index=%d",
		orderHash, resolverID, fillAmount.String(), fillPercentage, secretIndex)

	// Send event
	pfm.eventChan <- PartialFillEvent{
		Type:      PartialFillEventFillExecuted,
		OrderHash: orderHash,
		Data:      fillEvent,
		Timestamp: time.Now(),
	}

	// Check if order is completed
	if order.RemainingAmount.Cmp(big.NewInt(0)) == 0 {
		order.Status = PartialFillStatusCompleted
		order.CompletedAt = &[]time.Time{time.Now()}[0]

		log.Printf("Partial fill order %s completed: total_filled=%s", orderHash, order.FilledAmount.String())

		pfm.eventChan <- PartialFillEvent{
			Type:      PartialFillEventOrderCompleted,
			OrderHash: orderHash,
			Data:      order,
			Timestamp: time.Now(),
		}
	}

	// Reveal secret to resolver
	pfm.eventChan <- PartialFillEvent{
		Type:      PartialFillEventSecretRevealed,
		OrderHash: orderHash,
		Data: map[string]interface{}{
			"resolverID":  resolverID,
			"secret":      secret,
			"secretIndex": secretIndex,
			"fillAmount":  fillAmount.String(),
		},
		Timestamp: time.Now(),
	}

	return nil
}

// GetSecretForFill returns the appropriate secret for a fill percentage
func (pfm *PartialFillManager) GetSecretForFill(orderHash string, fillPercentage float64) (string, int, error) {
	pfm.mutex.RLock()
	defer pfm.mutex.RUnlock()

	order, exists := pfm.partialOrders[orderHash]
	if !exists {
		return "", 0, fmt.Errorf("partial fill order not found: %s", orderHash)
	}

	merkleTree, exists := pfm.merkleSecrets[orderHash]
	if !exists {
		return "", 0, fmt.Errorf("merkle tree not found for order: %s", orderHash)
	}

	secretIndex := pfm.calculateSecretIndex(fillPercentage, order.TotalParts)

	if secretIndex >= len(merkleTree.Secrets) {
		return "", 0, fmt.Errorf("invalid secret index: %d", secretIndex)
	}

	return merkleTree.Secrets[secretIndex], secretIndex, nil
}

// GetPartialFillOrder returns a partial fill order
func (pfm *PartialFillManager) GetPartialFillOrder(orderHash string) (*PartialFillOrder, bool) {
	pfm.mutex.RLock()
	defer pfm.mutex.RUnlock()

	order, exists := pfm.partialOrders[orderHash]
	return order, exists
}

// GetMerkleTree returns the Merkle tree for an order
func (pfm *PartialFillManager) GetMerkleTree(orderHash string) (*MerkleSecretTree, bool) {
	pfm.mutex.RLock()
	defer pfm.mutex.RUnlock()

	tree, exists := pfm.merkleSecrets[orderHash]
	return tree, exists
}

// GetEventChannel returns the event channel for partial fill events
func (pfm *PartialFillManager) GetEventChannel() <-chan PartialFillEvent {
	return pfm.eventChan
}

// calculateSecretIndex calculates which secret to use based on fill percentage
func (pfm *PartialFillManager) calculateSecretIndex(fillPercentage float64, totalParts int) int {
	partSize := 100.0 / float64(totalParts)
	index := int(fillPercentage / partSize)

	if index >= totalParts {
		return totalParts // Use the final secret
	}

	return index
}

// generateRandomSecret generates a random 32-byte secret
func (pfm *PartialFillManager) generateRandomSecret() string {
	bytes := make([]byte, 32)
	for i := range bytes {
		bytes[i] = byte(time.Now().UnixNano() % 256)
	}
	return hex.EncodeToString(bytes)
}

// calculateMerkleRoot calculates the Merkle root of secret hashes
func (pfm *PartialFillManager) calculateMerkleRoot(hashes []string) string {
	if len(hashes) == 0 {
		return ""
	}

	if len(hashes) == 1 {
		return hashes[0]
	}

	// Simple implementation - in production, use proper Merkle tree
	combined := ""
	for _, hash := range hashes {
		combined += hash
	}

	rootHash := sha256.Sum256([]byte(combined))
	return hex.EncodeToString(rootHash[:])
}

// generateMerkleProofs generates Merkle proofs for each secret
func (pfm *PartialFillManager) generateMerkleProofs(hashes []string) [][]string {
	proofs := make([][]string, len(hashes))

	// Simple implementation - each proof contains all other hashes
	// In production, implement proper Merkle proof generation
	for i := range hashes {
		proof := make([]string, 0)
		for j, hash := range hashes {
			if i != j {
				proof = append(proof, hash)
			}
		}
		proofs[i] = proof
	}

	return proofs
}

// GetPartialFillStats returns statistics about partial fills
func (pfm *PartialFillManager) GetPartialFillStats() map[string]interface{} {
	pfm.mutex.RLock()
	defer pfm.mutex.RUnlock()

	stats := map[string]interface{}{
		"totalOrders":          len(pfm.partialOrders),
		"merkleTreesGenerated": len(pfm.merkleSecrets),
	}

	// Count by status
	statusCounts := make(map[PartialFillStatus]int)
	totalVolume := big.NewInt(0)
	totalFilled := big.NewInt(0)

	for _, order := range pfm.partialOrders {
		statusCounts[order.Status]++
		totalVolume.Add(totalVolume, order.TotalAmount)
		totalFilled.Add(totalFilled, order.FilledAmount)
	}

	stats["statusDistribution"] = statusCounts
	stats["totalVolume"] = totalVolume.String()
	stats["totalFilled"] = totalFilled.String()

	// Fill efficiency
	if totalVolume.Cmp(big.NewInt(0)) > 0 {
		efficiency := float64(totalFilled.Uint64()) / float64(totalVolume.Uint64()) * 100
		stats["fillEfficiency"] = efficiency
	}

	// Count total fills
	totalFills := 0
	for _, events := range pfm.fillEvents {
		totalFills += len(events)
	}
	stats["totalFills"] = totalFills

	return stats
}
