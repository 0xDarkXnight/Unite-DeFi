package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/1inch/fusion-relayer/internal/config"
	"github.com/1inch/fusion-relayer/internal/types"
)

// OrderService interface for order operations
type OrderService interface {
	CreateOrder(orderReq *types.OrderRequest) (*types.SwapOrder, error)
	GetOrderByHash(hash string) (*types.SwapOrder, error)
	GetActiveOrders() ([]*types.SwapOrder, error)
	GetOrdersByMaker(maker string) ([]*types.SwapOrder, error)
	RevealSecret(req *types.SecretRequest) error
}

// Server represents the HTTP API server
type Server struct {
	server       *http.Server
	config       config.API
	orderService OrderService
	mux          *http.ServeMux
}

// NewServer creates a new API server
func NewServer(cfg config.API, orderService OrderService) *Server {
	mux := http.NewServeMux()

	server := &Server{
		config:       cfg,
		orderService: orderService,
		mux:          mux,
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

// Start starts the HTTP server
func (s *Server) Start(ctx context.Context) error {
	log.Printf("Starting API server on %s", s.server.Addr)

	// Start server in a goroutine
	errCh := make(chan error, 1)
	go func() {
		if err := s.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errCh <- err
		}
	}()

	// Wait for context cancellation or server error
	select {
	case <-ctx.Done():
		log.Println("Shutting down API server...")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), s.config.ShutdownTimeout)
		defer cancel()
		return s.server.Shutdown(shutdownCtx)
	case err := <-errCh:
		return err
	}
}

// setupRoutes configures the HTTP routes
func (s *Server) setupRoutes() {
	// Add CORS middleware to all routes
	s.mux.HandleFunc("/", s.corsMiddleware(s.notFoundHandler))
	s.mux.HandleFunc("/health", s.corsMiddleware(s.healthHandler))
	s.mux.HandleFunc("/orders", s.corsMiddleware(s.ordersHandler))
	s.mux.HandleFunc("/orders/", s.corsMiddleware(s.orderDetailsHandler))
	s.mux.HandleFunc("/secret", s.corsMiddleware(s.secretHandler))
}

// CORS middleware
func (s *Server) corsMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next(w, r)
	}
}

// Health check handler
func (s *Server) healthHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.methodNotAllowed(w)
		return
	}

	response := map[string]interface{}{
		"status":    "healthy",
		"timestamp": time.Now().Unix(),
		"service":   "fusion-relayer",
	}

	s.writeJSONResponse(w, http.StatusOK, response)
}

// Orders handler - handles both GET (list) and POST (create)
func (s *Server) ordersHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		s.handleGetOrders(w, r)
	case http.MethodPost:
		s.handleCreateOrder(w, r)
	default:
		s.methodNotAllowed(w)
	}
}

// Handle GET /orders - list orders with optional filters
func (s *Server) handleGetOrders(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()

	// Check for maker filter
	if maker := query.Get("maker"); maker != "" {
		orders, err := s.orderService.GetOrdersByMaker(maker)
		if err != nil {
			s.writeErrorResponse(w, http.StatusInternalServerError, "Failed to get orders", err)
			return
		}

		response := &types.ActiveOrdersResponse{
			Orders: orders,
			Count:  len(orders),
		}
		s.writeJSONResponse(w, http.StatusOK, response)
		return
	}

	// Default: get active orders
	orders, err := s.orderService.GetActiveOrders()
	if err != nil {
		s.writeErrorResponse(w, http.StatusInternalServerError, "Failed to get active orders", err)
		return
	}

	response := &types.ActiveOrdersResponse{
		Orders: orders,
		Count:  len(orders),
	}
	s.writeJSONResponse(w, http.StatusOK, response)
}

// Handle POST /orders - create new order
func (s *Server) handleCreateOrder(w http.ResponseWriter, r *http.Request) {
	var orderReq types.OrderRequest
	if err := json.NewDecoder(r.Body).Decode(&orderReq); err != nil {
		s.writeErrorResponse(w, http.StatusBadRequest, "Invalid JSON", err)
		return
	}

	order, err := s.orderService.CreateOrder(&orderReq)
	if err != nil {
		s.writeErrorResponse(w, http.StatusBadRequest, "Failed to create order", err)
		return
	}

	s.writeJSONResponse(w, http.StatusCreated, order)
}

// Order details handler - handles routes like /orders/{hash}/status and /orders/{hash}
func (s *Server) orderDetailsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.methodNotAllowed(w)
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/orders/")
	parts := strings.Split(path, "/")

	if len(parts) == 0 || parts[0] == "" {
		s.writeErrorResponse(w, http.StatusBadRequest, "Order hash required", nil)
		return
	}

	orderHash := parts[0]

	// Check if this is a status request
	if len(parts) == 2 && parts[1] == "status" {
		s.handleOrderStatus(w, r, orderHash)
		return
	}

	// Default: get full order details
	s.handleOrderDetails(w, r, orderHash)
}

// Handle GET /orders/{hash}/status
func (s *Server) handleOrderStatus(w http.ResponseWriter, r *http.Request, orderHash string) {
	order, err := s.orderService.GetOrderByHash(orderHash)
	if err != nil {
		s.writeErrorResponse(w, http.StatusNotFound, "Order not found", err)
		return
	}

	response := &types.OrderStatusResponse{
		OrderHash: order.OrderHash,
		State:     order.State,
		CreatedAt: order.CreatedAt,
		UpdatedAt: order.UpdatedAt,
	}

	s.writeJSONResponse(w, http.StatusOK, response)
}

// Handle GET /orders/{hash}
func (s *Server) handleOrderDetails(w http.ResponseWriter, r *http.Request, orderHash string) {
	order, err := s.orderService.GetOrderByHash(orderHash)
	if err != nil {
		s.writeErrorResponse(w, http.StatusNotFound, "Order not found", err)
		return
	}

	s.writeJSONResponse(w, http.StatusOK, order)
}

// Handle POST /secret - reveal secret to complete swap
func (s *Server) secretHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.methodNotAllowed(w)
		return
	}

	var secretReq types.SecretRequest
	if err := json.NewDecoder(r.Body).Decode(&secretReq); err != nil {
		s.writeErrorResponse(w, http.StatusBadRequest, "Invalid JSON", err)
		return
	}

	if err := s.orderService.RevealSecret(&secretReq); err != nil {
		s.writeErrorResponse(w, http.StatusBadRequest, "Failed to reveal secret", err)
		return
	}

	response := map[string]string{
		"status":  "success",
		"message": "Secret revealed successfully",
	}
	s.writeJSONResponse(w, http.StatusOK, response)
}

// 404 handler
func (s *Server) notFoundHandler(w http.ResponseWriter, r *http.Request) {
	s.writeErrorResponse(w, http.StatusNotFound, "Endpoint not found", nil)
}

// Helper methods
func (s *Server) methodNotAllowed(w http.ResponseWriter) {
	s.writeErrorResponse(w, http.StatusMethodNotAllowed, "Method not allowed", nil)
}

func (s *Server) writeJSONResponse(w http.ResponseWriter, statusCode int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)

	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Printf("Failed to encode JSON response: %v", err)
	}
}

func (s *Server) writeErrorResponse(w http.ResponseWriter, statusCode int, message string, err error) {
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
