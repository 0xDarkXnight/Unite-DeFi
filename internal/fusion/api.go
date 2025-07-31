package fusion

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/1inch/fusion-relayer/internal/config"
	"github.com/1inch/fusion-relayer/internal/types"
)

// FusionAPIServer extends the basic API server with Fusion+ specific endpoints
type FusionAPIServer struct {
	server             *http.Server
	config             config.API
	relayerService     *RelayerService
	auctionEngine      *AuctionEngine
	secretManager      *SecretManager
	timelockManager    *TimelockManager
	safetyManager      *SafetyDepositManager
	partialFillManager *PartialFillManager
	resolverSimulator  *ResolverSimulator
	stateMachine       *FusionStateMachine
	mux                *http.ServeMux
}

// NewFusionAPIServer creates a new Fusion+ API server
func NewFusionAPIServer(
	cfg config.API,
	relayerService *RelayerService,
	auctionEngine *AuctionEngine,
	secretManager *SecretManager,
	timelockManager *TimelockManager,
	safetyManager *SafetyDepositManager,
	partialFillManager *PartialFillManager,
	resolverSimulator *ResolverSimulator,
	stateMachine *FusionStateMachine,
) *FusionAPIServer {
	mux := http.NewServeMux()

	server := &FusionAPIServer{
		config:             cfg,
		relayerService:     relayerService,
		auctionEngine:      auctionEngine,
		secretManager:      secretManager,
		timelockManager:    timelockManager,
		safetyManager:      safetyManager,
		partialFillManager: partialFillManager,
		resolverSimulator:  resolverSimulator,
		stateMachine:       stateMachine,
		mux:                mux,
		server: &http.Server{
			Addr:         fmt.Sprintf("%s:%d", cfg.Host, cfg.Port),
			Handler:      mux,
			ReadTimeout:  cfg.ReadTimeout,
			WriteTimeout: cfg.WriteTimeout,
		},
	}

	server.setupRoutes()
	return server
}

// setupRoutes configures all API routes
func (s *FusionAPIServer) setupRoutes() {
	// Fusion+ order management
	s.mux.HandleFunc("/api/v1/fusion/orders", s.fusionOrderHandler)
	s.mux.HandleFunc("/api/v1/fusion/orders/", s.fusionOrderDetailsHandler)
	s.mux.HandleFunc("/api/v1/fusion/secret", s.fusionSecretHandler)

	// Auction endpoints
	s.mux.HandleFunc("/api/v1/fusion/auctions", s.auctionListHandler)
	s.mux.HandleFunc("/api/v1/fusion/auctions/", s.auctionDetailsHandler)
	s.mux.HandleFunc("/api/v1/fusion/bids", s.bidHandler)

	// Resolver endpoints
	s.mux.HandleFunc("/api/v1/fusion/resolvers", s.resolverHandler)
	s.mux.HandleFunc("/api/v1/fusion/resolvers/", s.resolverDetailsHandler)

	// Safety deposit endpoints
	s.mux.HandleFunc("/api/v1/fusion/deposits", s.safetyDepositHandler)
	s.mux.HandleFunc("/api/v1/fusion/deposits/", s.safetyDepositDetailsHandler)
	s.mux.HandleFunc("/api/v1/fusion/deposits/claim", s.claimDepositHandler)

	// Partial fill endpoints
	s.mux.HandleFunc("/api/v1/fusion/partial", s.partialFillHandler)
	s.mux.HandleFunc("/api/v1/fusion/partial/", s.partialFillDetailsHandler)

	// State and monitoring endpoints
	s.mux.HandleFunc("/api/v1/fusion/state/", s.stateHandler)
	s.mux.HandleFunc("/api/v1/fusion/stats", s.statsHandler)
	s.mux.HandleFunc("/api/v1/fusion/health", s.healthHandler)

	// Timelock endpoints
	s.mux.HandleFunc("/api/v1/fusion/timelocks/", s.timelockHandler)

	// WebSocket endpoint for real-time events
	s.mux.HandleFunc("/api/v1/fusion/events", s.eventsHandler)

	// Default handler
	s.mux.HandleFunc("/", s.notFoundHandler)
}

// Start starts the Fusion+ API server
func (s *FusionAPIServer) Start(ctx context.Context) error {
	log.Printf("Starting Fusion+ API server on %s", s.server.Addr)

	go func() {
		if err := s.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("Fusion+ API server error: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("Shutting down Fusion+ API server")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	return s.server.Shutdown(shutdownCtx)
}

// fusionOrderHandler handles Fusion+ order operations
func (s *FusionAPIServer) fusionOrderHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		s.createFusionOrder(w, r)
	case http.MethodGet:
		s.listFusionOrders(w, r)
	default:
		s.methodNotAllowed(w)
	}
}

// createFusionOrder creates a new Fusion+ order
func (s *FusionAPIServer) createFusionOrder(w http.ResponseWriter, r *http.Request) {
	var orderReq types.FusionOrderRequest
	if err := json.NewDecoder(r.Body).Decode(&orderReq); err != nil {
		s.writeErrorResponse(w, http.StatusBadRequest, "Invalid JSON", err)
		return
	}

	// Validate order
	if orderReq.Order.Maker == "" || orderReq.Signature == "" || orderReq.SecretHash == "" {
		s.writeErrorResponse(w, http.StatusBadRequest, "Missing required fields", nil)
		return
	}

	// Create order through relayer service
	order, err := s.relayerService.ReceiveFusionOrder(r.Context(), &orderReq)
	if err != nil {
		s.writeErrorResponse(w, http.StatusBadRequest, "Failed to create order", err)
		return
	}

	response := map[string]interface{}{
		"status":    "success",
		"orderHash": order.OrderHash,
		"order":     order,
	}

	s.writeJSONResponse(w, http.StatusCreated, response)
}

// listFusionOrders lists active Fusion+ orders
func (s *FusionAPIServer) listFusionOrders(w http.ResponseWriter, r *http.Request) {
	// Get query parameters
	status := r.URL.Query().Get("status")
	phase := r.URL.Query().Get("phase")
	// resolver := r.URL.Query().Get("resolver")

	var orders []*FusionOrderState

	if status != "" {
		// Filter by status
		swapState := types.SwapState(status)
		orders = s.stateMachine.GetOrdersByState(swapState)
	} else if phase != "" {
		// Filter by phase
		phaseNum, err := strconv.Atoi(phase)
		if err != nil {
			s.writeErrorResponse(w, http.StatusBadRequest, "Invalid phase number", err)
			return
		}
		orders = s.stateMachine.GetOrdersByPhase(FusionPhase(phaseNum))
	} else {
		// Get all orders (this would need to be implemented in state machine)
		orders = make([]*FusionOrderState, 0)
	}

	response := map[string]interface{}{
		"orders": orders,
		"count":  len(orders),
	}

	s.writeJSONResponse(w, http.StatusOK, response)
}

// fusionOrderDetailsHandler handles specific order details
func (s *FusionAPIServer) fusionOrderDetailsHandler(w http.ResponseWriter, r *http.Request) {
	orderHash := strings.TrimPrefix(r.URL.Path, "/api/v1/fusion/orders/")
	if orderHash == "" {
		s.writeErrorResponse(w, http.StatusBadRequest, "Missing order hash", nil)
		return
	}

	// Get order from relayer service
	order, exists := s.relayerService.GetOrder(orderHash)
	if !exists {
		s.writeErrorResponse(w, http.StatusNotFound, "Order not found", nil)
		return
	}

	// Get additional details
	orderState, _ := s.stateMachine.GetOrderState(orderHash)
	timelock, _ := s.timelockManager.GetTimelock(orderHash)
	auction, _ := s.auctionEngine.GetActiveAuction(orderHash)

	response := map[string]interface{}{
		"order":    order,
		"state":    orderState,
		"timelock": timelock,
		"auction":  auction,
	}

	s.writeJSONResponse(w, http.StatusOK, response)
}

// fusionSecretHandler handles secret revelation for Fusion+ orders
func (s *FusionAPIServer) fusionSecretHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.methodNotAllowed(w)
		return
	}

	var secretReq types.SecretRequest
	if err := json.NewDecoder(r.Body).Decode(&secretReq); err != nil {
		s.writeErrorResponse(w, http.StatusBadRequest, "Invalid JSON", err)
		return
	}

	// Store secret through relayer service
	if err := s.relayerService.ReceiveSecret(r.Context(), secretReq.OrderHash, secretReq.Secret); err != nil {
		s.writeErrorResponse(w, http.StatusBadRequest, "Failed to store secret", err)
		return
	}

	response := map[string]string{
		"status":  "success",
		"message": "Secret received and will be shared after finality",
	}

	s.writeJSONResponse(w, http.StatusOK, response)
}

// auctionListHandler lists active auctions
func (s *FusionAPIServer) auctionListHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.methodNotAllowed(w)
		return
	}

	// This would need to be implemented in auction engine
	response := map[string]interface{}{
		"auctions": []interface{}{},
		"count":    0,
	}

	s.writeJSONResponse(w, http.StatusOK, response)
}

// auctionDetailsHandler shows details of a specific auction
func (s *FusionAPIServer) auctionDetailsHandler(w http.ResponseWriter, r *http.Request) {
	orderHash := strings.TrimPrefix(r.URL.Path, "/api/v1/fusion/auctions/")
	if orderHash == "" {
		s.writeErrorResponse(w, http.StatusBadRequest, "Missing order hash", nil)
		return
	}

	auction, exists := s.auctionEngine.GetActiveAuction(orderHash)
	if !exists {
		s.writeErrorResponse(w, http.StatusNotFound, "Auction not found", nil)
		return
	}

	stats := s.auctionEngine.GetAuctionStats(orderHash)

	response := map[string]interface{}{
		"auction": auction,
		"stats":   stats,
	}

	s.writeJSONResponse(w, http.StatusOK, response)
}

// bidHandler handles resolver bids
func (s *FusionAPIServer) bidHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.methodNotAllowed(w)
		return
	}

	var bid types.ResolverBid
	if err := json.NewDecoder(r.Body).Decode(&bid); err != nil {
		s.writeErrorResponse(w, http.StatusBadRequest, "Invalid JSON", err)
		return
	}

	// Place bid through auction engine
	if err := s.auctionEngine.PlaceBid(r.Context(), &bid); err != nil {
		s.writeErrorResponse(w, http.StatusBadRequest, "Failed to place bid", err)
		return
	}

	response := map[string]string{
		"status":  "success",
		"message": "Bid placed successfully",
	}

	s.writeJSONResponse(w, http.StatusOK, response)
}

// resolverHandler handles resolver operations
func (s *FusionAPIServer) resolverHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		stats := s.resolverSimulator.GetResolverStats()
		s.writeJSONResponse(w, http.StatusOK, stats)
	case http.MethodPost:
		// Register new resolver (for simulation)
		var req struct {
			ID           string  `json:"id"`
			Strategy     string  `json:"strategy"`
			ProfitMargin float64 `json:"profitMargin"`
		}

		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			s.writeErrorResponse(w, http.StatusBadRequest, "Invalid JSON", err)
			return
		}

		s.resolverSimulator.AddResolver(req.ID, ResolverStrategy(req.Strategy), req.ProfitMargin)

		response := map[string]string{
			"status":  "success",
			"message": "Resolver registered successfully",
		}

		s.writeJSONResponse(w, http.StatusCreated, response)
	default:
		s.methodNotAllowed(w)
	}
}

// safetyDepositHandler handles safety deposit operations
func (s *FusionAPIServer) safetyDepositHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		stats := s.safetyManager.GetDepositStats()
		s.writeJSONResponse(w, http.StatusOK, stats)
		return
	}

	s.methodNotAllowed(w)
}

// claimDepositHandler handles safety deposit claims
func (s *FusionAPIServer) claimDepositHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.methodNotAllowed(w)
		return
	}

	var req struct {
		OrderHash      string `json:"orderHash"`
		ClaimerAddress string `json:"claimerAddress"`
		TxHash         string `json:"txHash"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.writeErrorResponse(w, http.StatusBadRequest, "Invalid JSON", err)
		return
	}

	if err := s.safetyManager.ClaimDeposit(req.OrderHash, req.ClaimerAddress, req.TxHash); err != nil {
		s.writeErrorResponse(w, http.StatusBadRequest, "Failed to claim deposit", err)
		return
	}

	response := map[string]string{
		"status":  "success",
		"message": "Deposit claimed successfully",
	}

	s.writeJSONResponse(w, http.StatusOK, response)
}

// partialFillHandler handles partial fill operations
func (s *FusionAPIServer) partialFillHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet {
		stats := s.partialFillManager.GetPartialFillStats()
		s.writeJSONResponse(w, http.StatusOK, stats)
		return
	}

	s.methodNotAllowed(w)
}

// statsHandler provides comprehensive system statistics
func (s *FusionAPIServer) statsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.methodNotAllowed(w)
		return
	}

	stats := map[string]interface{}{
		"stateMachine":   s.stateMachine.GetStateMachineStats(),
		"auctions":       map[string]interface{}{"active": 0}, // Would need auction stats
		"secrets":        s.secretManager.GetSecretStats(),
		"timelocks":      s.timelockManager.GetTimelockStats(),
		"safetyDeposits": s.safetyManager.GetDepositStats(),
		"partialFills":   s.partialFillManager.GetPartialFillStats(),
		"resolvers":      s.resolverSimulator.GetResolverStats(),
		"timestamp":      time.Now().Unix(),
	}

	s.writeJSONResponse(w, http.StatusOK, stats)
}

// healthHandler provides health check
func (s *FusionAPIServer) healthHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.methodNotAllowed(w)
		return
	}

	health := map[string]interface{}{
		"status":    "healthy",
		"timestamp": time.Now().Unix(),
		"version":   "fusion-plus-1.0.0",
		"services": map[string]string{
			"relayer":     "active",
			"auction":     "active",
			"secrets":     "active",
			"timelocks":   "active",
			"safety":      "active",
			"partialFill": "active",
			"resolvers":   "active",
		},
	}

	s.writeJSONResponse(w, http.StatusOK, health)
}

// Helper methods

func (s *FusionAPIServer) methodNotAllowed(w http.ResponseWriter) {
	s.writeErrorResponse(w, http.StatusMethodNotAllowed, "Method not allowed", nil)
}

func (s *FusionAPIServer) notFoundHandler(w http.ResponseWriter, r *http.Request) {
	s.writeErrorResponse(w, http.StatusNotFound, "Endpoint not found", nil)
}

func (s *FusionAPIServer) writeJSONResponse(w http.ResponseWriter, statusCode int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

	w.WriteHeader(statusCode)

	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Printf("Failed to encode JSON response: %v", err)
	}
}

func (s *FusionAPIServer) writeErrorResponse(w http.ResponseWriter, statusCode int, message string, err error) {
	response := map[string]interface{}{
		"error":     message,
		"status":    statusCode,
		"timestamp": time.Now().Unix(),
	}

	if err != nil {
		log.Printf("API Error: %s - %v", message, err)
		response["details"] = err.Error()
	}

	s.writeJSONResponse(w, statusCode, response)
}

// Placeholder implementations for handlers that need more complex logic

func (s *FusionAPIServer) resolverDetailsHandler(w http.ResponseWriter, r *http.Request) {
	// Implementation for specific resolver details
	s.writeJSONResponse(w, http.StatusOK, map[string]string{"status": "not implemented"})
}

func (s *FusionAPIServer) safetyDepositDetailsHandler(w http.ResponseWriter, r *http.Request) {
	// Implementation for specific safety deposit details
	s.writeJSONResponse(w, http.StatusOK, map[string]string{"status": "not implemented"})
}

func (s *FusionAPIServer) partialFillDetailsHandler(w http.ResponseWriter, r *http.Request) {
	// Implementation for specific partial fill details
	s.writeJSONResponse(w, http.StatusOK, map[string]string{"status": "not implemented"})
}

func (s *FusionAPIServer) stateHandler(w http.ResponseWriter, r *http.Request) {
	// Implementation for state details
	s.writeJSONResponse(w, http.StatusOK, map[string]string{"status": "not implemented"})
}

func (s *FusionAPIServer) timelockHandler(w http.ResponseWriter, r *http.Request) {
	// Implementation for timelock details
	s.writeJSONResponse(w, http.StatusOK, map[string]string{"status": "not implemented"})
}

func (s *FusionAPIServer) eventsHandler(w http.ResponseWriter, r *http.Request) {
	// Implementation for WebSocket events
	s.writeJSONResponse(w, http.StatusOK, map[string]string{"status": "WebSocket not implemented"})
}
