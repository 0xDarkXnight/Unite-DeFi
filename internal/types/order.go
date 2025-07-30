package types

import (
	"encoding/json"
	"math/big"
	"time"
)

// SwapState represents the state of a cross-chain swap
type SwapState string

const (
	StateNew            SwapState = "NEW"
	StateAuctionStarted SwapState = "AUCTION_STARTED"
	StateEthLockPending SwapState = "ETH_LOCK_PENDING"
	StateEthLocked      SwapState = "ETH_LOCKED"
	StateSuiLockPending SwapState = "SUI_LOCK_PENDING"
	StateSuiLocked      SwapState = "SUI_LOCKED"
	StateReadyForSecret SwapState = "READY_FOR_SECRET"
	StateSecretReceived SwapState = "SECRET_RECEIVED"
	StateExecuted       SwapState = "EXECUTED"
	StateCancelledSrc   SwapState = "CANCELLED_SRC"
	StateCancelledDst   SwapState = "CANCELLED_DST"
	StateRefunded       SwapState = "REFUNDED"
	StateCancelled      SwapState = "CANCELLED"
	StateError          SwapState = "ERROR"
)

// LimitOrder represents a 1inch limit order
type LimitOrder struct {
	Salt         *big.Int `json:"salt"`
	Maker        string   `json:"maker"`
	Receiver     string   `json:"receiver"`
	MakerAsset   string   `json:"makerAsset"`
	TakerAsset   string   `json:"takerAsset"`
	MakingAmount *big.Int `json:"makingAmount"`
	TakingAmount *big.Int `json:"takingAmount"`
	MakerTraits  *big.Int `json:"makerTraits"`
}

// OrderRequest represents a request to create a new cross-chain order
type OrderRequest struct {
	Order           LimitOrder `json:"order"`
	Signature       string     `json:"signature"`
	MakerSuiAddress string     `json:"makerSuiAddress"`
	Extension       string     `json:"extension,omitempty"`
}

// SecretRequest represents a request to reveal the secret
type SecretRequest struct {
	OrderHash string `json:"orderHash"`
	Secret    string `json:"secret"`
}

// SwapOrder represents a cross-chain swap order in the database
type SwapOrder struct {
	ID               int64           `json:"id"`
	OrderHash        string          `json:"orderHash"`
	State            SwapState       `json:"state"`
	Maker            string          `json:"maker"`
	MakerSuiAddress  string          `json:"makerSuiAddress"`
	Receiver         string          `json:"receiver"`
	MakerAsset       string          `json:"makerAsset"`
	TakerAsset       string          `json:"takerAsset"`
	MakingAmount     *big.Int        `json:"makingAmount"`
	TakingAmount     *big.Int        `json:"takingAmount"`
	SecretHash       string          `json:"secretHash"`
	Secret           string          `json:"secret,omitempty"`
	DeadlineSrc      uint64          `json:"deadlineSrc"`
	DeadlineDst      uint64          `json:"deadlineDst"`
	EscrowSrcAddress string          `json:"escrowSrcAddress,omitempty"`
	EscrowSrcTxHash  string          `json:"escrowSrcTxHash,omitempty"`
	EscrowDstID      string          `json:"escrowDstId,omitempty"`
	EscrowDstTxHash  string          `json:"escrowDstTxHash,omitempty"`
	OriginalOrder    json.RawMessage `json:"originalOrder"`
	Signature        string          `json:"signature"`
	Extension        string          `json:"extension,omitempty"`
	CreatedAt        time.Time       `json:"createdAt"`
	UpdatedAt        time.Time       `json:"updatedAt"`
	ErrorMessage     string          `json:"errorMessage,omitempty"`
}

// OrderStatusResponse represents the response for order status queries
type OrderStatusResponse struct {
	OrderHash string    `json:"orderHash"`
	State     SwapState `json:"state"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// ActiveOrdersResponse represents the response for active orders query
type ActiveOrdersResponse struct {
	Orders []*SwapOrder `json:"orders"`
	Count  int          `json:"count"`
}

// EscrowImmutables represents the immutable parameters for Ethereum escrows
type EscrowImmutables struct {
	OrderHash     string   `json:"orderHash"`
	Maker         string   `json:"maker"`
	Receiver      string   `json:"receiver"`
	SecretHash    string   `json:"secretHash"`
	MakingAmount  *big.Int `json:"makingAmount"`
	TakingAmount  *big.Int `json:"takingAmount"`
	SafetyDeposit *big.Int `json:"safetyDeposit"`
}

// SuiEscrowImmutables represents the immutable parameters for Sui escrows
type SuiEscrowImmutables struct {
	OrderHash  string `json:"orderHash"`
	Maker      string `json:"maker"`
	SecretHash string `json:"secretHash"`
	TokenType  string `json:"tokenType"`
	Amount     uint64 `json:"amount"`
	Timeout    uint64 `json:"timeout"`
}

// FusionOrder represents a 1inch Fusion+ order with Dutch auction parameters
type FusionOrder struct {
	LimitOrder                              // Embedded 1inch limit order
	AuctionStartTimestamp uint64            `json:"auctionStartTimestamp"`
	WaitingPeriod         uint64            `json:"waitingPeriod"`
	AuctionStartRate      *big.Int          `json:"auctionStartRate"`
	MinimumReturnAmount   *big.Int          `json:"minimumReturnAmount"`
	PriceCurve            []PriceCurvePoint `json:"priceCurve"`
}

// PriceCurvePoint represents a point on the Dutch auction price curve
type PriceCurvePoint struct {
	TimeOffset    uint64   `json:"timeOffset"`    // Time offset from auction start in seconds
	ExchangeRate  *big.Int `json:"exchangeRate"`  // Exchange rate at this point
	GasAdjustment *big.Int `json:"gasAdjustment"` // Gas cost adjustment factor
}

// FusionOrderRequest represents a request to create a new Fusion+ cross-chain order
type FusionOrderRequest struct {
	Order           FusionOrder `json:"order"`
	Signature       string      `json:"signature"`
	MakerSuiAddress string      `json:"makerSuiAddress"`
	SecretHash      string      `json:"secretHash"` // Maker provides secret hash
	Extension       string      `json:"extension,omitempty"`
}

// RelayerAnnouncement represents a relayer sharing a Fusion order with resolvers
type RelayerAnnouncement struct {
	OrderHash       string      `json:"orderHash"`
	Order           FusionOrder `json:"order"`
	Signature       string      `json:"signature"`
	MakerSuiAddress string      `json:"makerSuiAddress"`
	SecretHash      string      `json:"secretHash"`
	Timestamp       time.Time   `json:"timestamp"`
}

// ResolverBid represents a resolver's bid on a Fusion order
type ResolverBid struct {
	OrderHash     string    `json:"orderHash"`
	ResolverID    string    `json:"resolverId"`
	BidRate       *big.Int  `json:"bidRate"`
	PartialFill   bool      `json:"partialFill"`
	FillAmount    *big.Int  `json:"fillAmount"`
	SafetyDeposit *big.Int  `json:"safetyDeposit"`
	Timestamp     time.Time `json:"timestamp"`
}

// SecretRevealRequest represents the relayer revealing secret to resolvers
type SecretRevealRequest struct {
	OrderHash string    `json:"orderHash"`
	Secret    string    `json:"secret"`
	Timestamp time.Time `json:"timestamp"`
}

// TimelockConfig represents timelock configuration for chains
type TimelockConfig struct {
	FinalityLockDuration      time.Duration `json:"finalityLockDuration"`
	ResolverExclusiveDuration time.Duration `json:"resolverExclusiveDuration"`
	CancellationDuration      time.Duration `json:"cancellationDuration"`
}

// FusionSwapOrder extends SwapOrder with Fusion+ specific fields
type FusionSwapOrder struct {
	SwapOrder                            // Embedded base swap order
	IsPartialFill        bool            `json:"isPartialFill"`
	FillAmount           *big.Int        `json:"fillAmount"`
	ResolverID           string          `json:"resolverId"`
	AuctionStartTime     time.Time       `json:"auctionStartTime"`
	AuctionEndTime       time.Time       `json:"auctionEndTime"`
	WinningBidRate       *big.Int        `json:"winningBidRate"`
	SafetyDeposit        *big.Int        `json:"safetyDeposit"`
	FinalityLockExpiry   time.Time       `json:"finalityLockExpiry"`
	ExclusiveWithdrawEnd time.Time       `json:"exclusiveWithdrawEnd"`
	PartialSecrets       json.RawMessage `json:"partialSecrets,omitempty"` // For Merkle tree secrets
}

// ParseBigInt parses a string into a big.Int
func ParseBigInt(s string) (*big.Int, error) {
	if s == "" {
		return big.NewInt(0), nil
	}

	result := new(big.Int)
	if _, ok := result.SetString(s, 10); !ok {
		return nil, nil // Return error if parsing fails
	}

	return result, nil
}

// CalculateCurrentRate calculates the current rate in a Dutch auction
func (fo *FusionOrder) CalculateCurrentRate(currentTime time.Time) *big.Int {
	auctionStart := time.Unix(int64(fo.AuctionStartTimestamp), 0)

	// Before auction starts, use auction start rate
	if currentTime.Before(auctionStart) {
		return new(big.Int).Set(fo.AuctionStartRate)
	}

	elapsed := currentTime.Sub(auctionStart)
	elapsedSeconds := uint64(elapsed.Seconds())

	// Find the appropriate curve segment
	for i, point := range fo.PriceCurve {
		if elapsedSeconds <= point.TimeOffset {
			if i == 0 {
				// First segment - interpolate from start rate
				ratio := float64(elapsedSeconds) / float64(point.TimeOffset)
				startRate := new(big.Float).SetInt(fo.AuctionStartRate)
				endRate := new(big.Float).SetInt(point.ExchangeRate)

				diff := new(big.Float).Sub(endRate, startRate)
				adjustment := new(big.Float).Mul(diff, big.NewFloat(ratio))
				currentRate := new(big.Float).Add(startRate, adjustment)

				result, _ := currentRate.Int(nil)
				return result
			}

			// Interpolate between previous and current point
			prevPoint := fo.PriceCurve[i-1]
			timeInSegment := elapsedSeconds - prevPoint.TimeOffset
			segmentDuration := point.TimeOffset - prevPoint.TimeOffset

			if segmentDuration == 0 {
				return new(big.Int).Set(point.ExchangeRate)
			}

			ratio := float64(timeInSegment) / float64(segmentDuration)
			startRate := new(big.Float).SetInt(prevPoint.ExchangeRate)
			endRate := new(big.Float).SetInt(point.ExchangeRate)

			diff := new(big.Float).Sub(endRate, startRate)
			adjustment := new(big.Float).Mul(diff, big.NewFloat(ratio))
			currentRate := new(big.Float).Add(startRate, adjustment)

			result, _ := currentRate.Int(nil)
			return result
		}
	}

	// After auction ends, use minimum return amount
	return new(big.Int).Set(fo.MinimumReturnAmount)
}
