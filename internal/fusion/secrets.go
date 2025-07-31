package fusion

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/1inch/fusion-relayer/internal/types"
)

// SecretManager implements conditional secret transmission based on escrow finality
// as described in the Fusion+ whitepaper. It handles:
// 1. Secret storage from makers
// 2. Finality verification across chains
// 3. Conditional secret sharing with resolvers
// 4. Merkle tree secrets for partial fills
type SecretManager struct {
	secrets        map[string]*StoredSecret
	finalityStates map[string]*FinalityState
	merkleSecrets  map[string]*MerkleSecretTree
	resolvers      map[string]*Resolver
	mutex          sync.RWMutex

	// Finality configuration
	finalityConfig *types.TimelockConfig

	// Event channels
	secretEventChan chan SecretEvent
}

// StoredSecret represents a secret stored by the secret manager
type StoredSecret struct {
	OrderHash    string
	Secret       string
	SecretHash   string
	MakerAddress string
	StoredAt     time.Time
	SharedAt     *time.Time
	SharedWith   []string // List of resolver IDs
}

// FinalityState tracks finality status for both chains
type FinalityState struct {
	OrderHash           string
	SrcChainFinalized   bool
	DstChainFinalized   bool
	SrcFinalityTime     *time.Time
	DstFinalityTime     *time.Time
	BothChainsFinalized bool
	FinalityReachedAt   *time.Time
	SecretSharedAt      *time.Time
}

// MerkleSecretTree represents secrets organized in a Merkle tree for partial fills
type MerkleSecretTree struct {
	OrderHash    string
	TotalParts   int
	Secrets      []string       // N+1 secrets for N parts
	SecretHashes []string       // Hashes of secrets
	MerkleRoot   string         // Root hash of Merkle tree
	UsedSecrets  map[int]bool   // Track which secrets have been used
	FillProgress map[string]int // Track fill progress per resolver
}

// SecretEvent represents events from secret management
type SecretEvent struct {
	Type      SecretEventType
	OrderHash string
	Data      interface{}
	Timestamp time.Time
}

// SecretEventType represents types of secret events
type SecretEventType string

const (
	SecretEventStored          SecretEventType = "SECRET_STORED"
	SecretEventFinalityReached SecretEventType = "FINALITY_REACHED"
	SecretEventShared          SecretEventType = "SECRET_SHARED"
	SecretEventPartialRevealed SecretEventType = "PARTIAL_REVEALED"
	SecretEventMerkleUpdated   SecretEventType = "MERKLE_UPDATED"
)

// NewSecretManager creates a new secret manager
func NewSecretManager(finalityConfig *types.TimelockConfig) *SecretManager {
	return &SecretManager{
		secrets:         make(map[string]*StoredSecret),
		finalityStates:  make(map[string]*FinalityState),
		merkleSecrets:   make(map[string]*MerkleSecretTree),
		resolvers:       make(map[string]*Resolver),
		finalityConfig:  finalityConfig,
		secretEventChan: make(chan SecretEvent, 100),
	}
}

// StoreSecret stores a secret from a maker
func (sm *SecretManager) StoreSecret(orderHash, secret, makerAddress string) error {
	sm.mutex.Lock()
	defer sm.mutex.Unlock()

	// Validate secret format
	if len(secret) == 0 {
		return fmt.Errorf("empty secret")
	}

	// Calculate secret hash
	hash := sha256.Sum256([]byte(secret))
	secretHash := hex.EncodeToString(hash[:])

	// Store secret
	storedSecret := &StoredSecret{
		OrderHash:    orderHash,
		Secret:       secret,
		SecretHash:   secretHash,
		MakerAddress: makerAddress,
		StoredAt:     time.Now(),
		SharedWith:   make([]string, 0),
	}

	sm.secrets[orderHash] = storedSecret

	log.Printf("Secret stored for order %s from maker %s", orderHash, makerAddress)

	// Send event
	sm.secretEventChan <- SecretEvent{
		Type:      SecretEventStored,
		OrderHash: orderHash,
		Data:      storedSecret,
		Timestamp: time.Now(),
	}

	// Check if we can share secret (if finality already reached)
	if finalityState, exists := sm.finalityStates[orderHash]; exists && finalityState.BothChainsFinalized {
		go sm.scheduleSecretSharing(orderHash)
	}

	return nil
}

// UpdateFinalityStatus updates the finality status for a chain
func (sm *SecretManager) UpdateFinalityStatus(orderHash string, srcFinalized, dstFinalized bool) error {
	sm.mutex.Lock()
	defer sm.mutex.Unlock()

	finalityState, exists := sm.finalityStates[orderHash]
	if !exists {
		finalityState = &FinalityState{
			OrderHash: orderHash,
		}
		sm.finalityStates[orderHash] = finalityState
	}

	now := time.Now()

	// Update source chain finality
	if srcFinalized && !finalityState.SrcChainFinalized {
		finalityState.SrcChainFinalized = true
		finalityState.SrcFinalityTime = &now
		log.Printf("Source chain finality reached for order %s", orderHash)
	}

	// Update destination chain finality
	if dstFinalized && !finalityState.DstChainFinalized {
		finalityState.DstChainFinalized = true
		finalityState.DstFinalityTime = &now
		log.Printf("Destination chain finality reached for order %s", orderHash)
	}

	// Check if both chains are finalized
	if finalityState.SrcChainFinalized && finalityState.DstChainFinalized && !finalityState.BothChainsFinalized {
		finalityState.BothChainsFinalized = true
		finalityState.FinalityReachedAt = &now

		log.Printf("Both chains finalized for order %s, scheduling secret sharing", orderHash)

		// Send event
		sm.secretEventChan <- SecretEvent{
			Type:      SecretEventFinalityReached,
			OrderHash: orderHash,
			Data:      finalityState,
			Timestamp: time.Now(),
		}

		// Schedule secret sharing if we have the secret
		if _, hasSecret := sm.secrets[orderHash]; hasSecret {
			go sm.scheduleSecretSharing(orderHash)
		}
	}

	return nil
}

// scheduleSecretSharing schedules secret sharing after finality lock duration
func (sm *SecretManager) scheduleSecretSharing(orderHash string) {
	// Wait for finality lock duration
	time.Sleep(sm.finalityConfig.FinalityLockDuration)

	sm.mutex.RLock()
	secret, hasSecret := sm.secrets[orderHash]
	finalityState, hasFinality := sm.finalityStates[orderHash]
	sm.mutex.RUnlock()

	if !hasSecret || !hasFinality || !finalityState.BothChainsFinalized {
		log.Printf("Cannot share secret for order %s: hasSecret=%v, hasFinality=%v, bothFinalized=%v",
			orderHash, hasSecret, hasFinality, finalityState.BothChainsFinalized)
		return
	}

	// Share secret with all registered resolvers
	sm.shareSecretWithResolvers(orderHash, secret.Secret)
}

// shareSecretWithResolvers shares the secret with all registered resolvers
func (sm *SecretManager) shareSecretWithResolvers(orderHash, secret string) {
	sm.mutex.Lock()
	defer sm.mutex.Unlock()

	storedSecret := sm.secrets[orderHash]
	finalityState := sm.finalityStates[orderHash]

	// Update shared timestamp
	now := time.Now()
	storedSecret.SharedAt = &now
	finalityState.SecretSharedAt = &now

	// Add all resolver IDs to shared list
	for resolverID := range sm.resolvers {
		storedSecret.SharedWith = append(storedSecret.SharedWith, resolverID)
	}

	log.Printf("Secret shared for order %s with %d resolvers", orderHash, len(sm.resolvers))

	// Send event
	sm.secretEventChan <- SecretEvent{
		Type:      SecretEventShared,
		OrderHash: orderHash,
		Data: map[string]interface{}{
			"secret":     secret,
			"sharedWith": storedSecret.SharedWith,
			"sharedAt":   now,
		},
		Timestamp: time.Now(),
	}
}

// CreateMerkleSecretTree creates a Merkle tree of secrets for partial fills
func (sm *SecretManager) CreateMerkleSecretTree(orderHash string, totalParts int) (*MerkleSecretTree, error) {
	sm.mutex.Lock()
	defer sm.mutex.Unlock()

	if totalParts <= 0 {
		return nil, fmt.Errorf("totalParts must be positive")
	}

	// Generate N+1 secrets for N parts
	secrets := make([]string, totalParts+1)
	secretHashes := make([]string, totalParts+1)

	for i := 0; i <= totalParts; i++ {
		secret := make([]byte, 32)
		if _, err := rand.Read(secret); err != nil {
			return nil, fmt.Errorf("failed to generate secret %d: %w", i, err)
		}

		secretStr := hex.EncodeToString(secret)
		hash := sha256.Sum256(secret)
		hashStr := hex.EncodeToString(hash[:])

		secrets[i] = secretStr
		secretHashes[i] = hashStr
	}

	// Calculate Merkle root
	merkleRoot := sm.calculateMerkleRoot(secretHashes)

	merkleTree := &MerkleSecretTree{
		OrderHash:    orderHash,
		TotalParts:   totalParts,
		Secrets:      secrets,
		SecretHashes: secretHashes,
		MerkleRoot:   merkleRoot,
		UsedSecrets:  make(map[int]bool),
		FillProgress: make(map[string]int),
	}

	sm.merkleSecrets[orderHash] = merkleTree

	log.Printf("Created Merkle secret tree for order %s with %d parts", orderHash, totalParts)

	// Send event
	sm.secretEventChan <- SecretEvent{
		Type:      SecretEventMerkleUpdated,
		OrderHash: orderHash,
		Data:      merkleTree,
		Timestamp: time.Now(),
	}

	return merkleTree, nil
}

// RevealPartialSecret reveals a secret for partial fill
func (sm *SecretManager) RevealPartialSecret(orderHash, resolverID string, fillPercentage int) (string, error) {
	sm.mutex.Lock()
	defer sm.mutex.Unlock()

	merkleTree, exists := sm.merkleSecrets[orderHash]
	if !exists {
		return "", fmt.Errorf("no Merkle tree found for order %s", orderHash)
	}

	// Calculate which secret to reveal based on fill percentage
	secretIndex := sm.calculateSecretIndex(fillPercentage, merkleTree.TotalParts)

	if secretIndex >= len(merkleTree.Secrets) {
		return "", fmt.Errorf("invalid secret index %d for order %s", secretIndex, orderHash)
	}

	// Mark secret as used
	merkleTree.UsedSecrets[secretIndex] = true
	merkleTree.FillProgress[resolverID] = fillPercentage

	secret := merkleTree.Secrets[secretIndex]

	log.Printf("Revealed partial secret %d for order %s to resolver %s (fill: %d%%)",
		secretIndex, orderHash, resolverID, fillPercentage)

	// Send event
	sm.secretEventChan <- SecretEvent{
		Type:      SecretEventPartialRevealed,
		OrderHash: orderHash,
		Data: map[string]interface{}{
			"secretIndex":    secretIndex,
			"secret":         secret,
			"resolverID":     resolverID,
			"fillPercentage": fillPercentage,
		},
		Timestamp: time.Now(),
	}

	return secret, nil
}

// GetSecret returns a stored secret
func (sm *SecretManager) GetSecret(orderHash string) (*StoredSecret, bool) {
	sm.mutex.RLock()
	defer sm.mutex.RUnlock()

	secret, exists := sm.secrets[orderHash]
	return secret, exists
}

// GetFinalityState returns the finality state for an order
func (sm *SecretManager) GetFinalityState(orderHash string) (*FinalityState, bool) {
	sm.mutex.RLock()
	defer sm.mutex.RUnlock()

	state, exists := sm.finalityStates[orderHash]
	return state, exists
}

// GetMerkleSecretTree returns the Merkle secret tree for an order
func (sm *SecretManager) GetMerkleSecretTree(orderHash string) (*MerkleSecretTree, bool) {
	sm.mutex.RLock()
	defer sm.mutex.RUnlock()

	tree, exists := sm.merkleSecrets[orderHash]
	return tree, exists
}

// GetEventChannel returns the event channel for secret events
func (sm *SecretManager) GetEventChannel() <-chan SecretEvent {
	return sm.secretEventChan
}

// RegisterResolver registers a resolver with the secret manager
func (sm *SecretManager) RegisterResolver(resolver *Resolver) {
	sm.mutex.Lock()
	defer sm.mutex.Unlock()

	sm.resolvers[resolver.ID] = resolver
	log.Printf("Registered resolver %s with secret manager", resolver.ID)
}

// calculateMerkleRoot calculates the Merkle root of secret hashes
func (sm *SecretManager) calculateMerkleRoot(hashes []string) string {
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

// calculateSecretIndex calculates which secret to use based on fill percentage
func (sm *SecretManager) calculateSecretIndex(fillPercentage, totalParts int) int {
	// Map fill percentage to secret index
	// 0-25% -> secret 0, 25-50% -> secret 1, etc.
	partSize := 100 / totalParts
	index := fillPercentage / partSize

	if index >= totalParts {
		return totalParts // Use the final secret
	}

	return index
}

// GetSecretStats returns statistics about secret management
func (sm *SecretManager) GetSecretStats() map[string]interface{} {
	sm.mutex.RLock()
	defer sm.mutex.RUnlock()

	stats := map[string]interface{}{
		"totalSecrets":        len(sm.secrets),
		"finalityStates":      len(sm.finalityStates),
		"merkleTreesActive":   len(sm.merkleSecrets),
		"registeredResolvers": len(sm.resolvers),
	}

	// Count secrets by status
	secretsShared := 0
	secretsPending := 0

	for _, secret := range sm.secrets {
		if secret.SharedAt != nil {
			secretsShared++
		} else {
			secretsPending++
		}
	}

	stats["secretsShared"] = secretsShared
	stats["secretsPending"] = secretsPending

	// Count finality by status
	bothFinalized := 0
	partialFinalized := 0

	for _, state := range sm.finalityStates {
		if state.BothChainsFinalized {
			bothFinalized++
		} else if state.SrcChainFinalized || state.DstChainFinalized {
			partialFinalized++
		}
	}

	stats["bothChainsFinalized"] = bothFinalized
	stats["partiallyFinalized"] = partialFinalized

	return stats
}

// CleanupExpiredSecrets removes old secrets and states
func (sm *SecretManager) CleanupExpiredSecrets(maxAge time.Duration) {
	sm.mutex.Lock()
	defer sm.mutex.Unlock()

	cutoff := time.Now().Add(-maxAge)
	cleaned := 0

	// Clean up old secrets
	for orderHash, secret := range sm.secrets {
		if secret.StoredAt.Before(cutoff) {
			delete(sm.secrets, orderHash)
			delete(sm.finalityStates, orderHash)
			delete(sm.merkleSecrets, orderHash)
			cleaned++
		}
	}

	if cleaned > 0 {
		log.Printf("Cleaned up %d expired secrets", cleaned)
	}
}
