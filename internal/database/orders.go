package database

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/1inch/fusion-relayer/internal/types"
)

// OrderRepository handles database operations for swap orders
type OrderRepository struct {
	db *sql.DB
}

// NewOrderRepository creates a new order repository
func NewOrderRepository(db *sql.DB) *OrderRepository {
	return &OrderRepository{db: db}
}

// CreateOrder creates a new swap order in the database
func (r *OrderRepository) CreateOrder(order *types.SwapOrder) error {
	query := `
		INSERT INTO swap_orders (
			order_hash, state, maker, maker_sui_address, receiver,
			maker_asset, taker_asset, making_amount, taking_amount,
			secret_hash, deadline_src, deadline_dst, original_order,
			signature, extension, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
		) RETURNING id`

	err := r.db.QueryRow(
		query,
		order.OrderHash,
		order.State,
		order.Maker,
		order.MakerSuiAddress,
		order.Receiver,
		order.MakerAsset,
		order.TakerAsset,
		order.MakingAmount.String(),
		order.TakingAmount.String(),
		order.SecretHash,
		order.DeadlineSrc,
		order.DeadlineDst,
		string(order.OriginalOrder),
		order.Signature,
		order.Extension,
		order.CreatedAt,
		order.UpdatedAt,
	).Scan(&order.ID)

	if err != nil {
		return fmt.Errorf("failed to create order: %w", err)
	}

	return nil
}

// GetOrderByHash retrieves an order by its hash
func (r *OrderRepository) GetOrderByHash(orderHash string) (*types.SwapOrder, error) {
	query := `
		SELECT id, order_hash, state, maker, maker_sui_address, receiver,
			   maker_asset, taker_asset, making_amount, taking_amount,
			   secret_hash, deadline_src, deadline_dst, escrow_src_address,
			   escrow_src_tx_hash, escrow_dst_id, escrow_dst_tx_hash,
			   original_order, signature, extension, created_at, updated_at, error_message
		FROM swap_orders WHERE order_hash = $1`

	return r.scanOrder(r.db.QueryRow(query, orderHash))
}

// GetOrderByID retrieves an order by its ID
func (r *OrderRepository) GetOrderByID(id int64) (*types.SwapOrder, error) {
	query := `
		SELECT id, order_hash, state, maker, maker_sui_address, receiver,
			   maker_asset, taker_asset, making_amount, taking_amount,
			   secret_hash, deadline_src, deadline_dst, escrow_src_address,
			   escrow_src_tx_hash, escrow_dst_id, escrow_dst_tx_hash,
			   original_order, signature, extension, created_at, updated_at, error_message
		FROM swap_orders WHERE id = $1`

	return r.scanOrder(r.db.QueryRow(query, id))
}

// UpdateOrderState updates the state of an order
func (r *OrderRepository) UpdateOrderState(id int64, state string) error {
	query := `UPDATE swap_orders SET state = $1, updated_at = $2 WHERE id = $3`

	_, err := r.db.Exec(query, state, time.Now(), id)
	if err != nil {
		return fmt.Errorf("failed to update order state: %w", err)
	}

	return nil
}

// UpdateOrderWithEscrowSrc updates order with Ethereum escrow information
func (r *OrderRepository) UpdateOrderWithEscrowSrc(id int64, txHash, escrowAddress string) error {
	query := `
		UPDATE swap_orders 
		SET escrow_src_tx_hash = $1, escrow_src_address = $2, updated_at = $3
		WHERE id = $4`

	_, err := r.db.Exec(query, txHash, escrowAddress, time.Now(), id)
	if err != nil {
		return fmt.Errorf("failed to update order with escrow src: %w", err)
	}

	return nil
}

// UpdateOrderWithEscrowDst updates order with Sui escrow information
func (r *OrderRepository) UpdateOrderWithEscrowDst(id int64, txHash, escrowID string) error {
	query := `
		UPDATE swap_orders 
		SET escrow_dst_tx_hash = $1, escrow_dst_id = $2, updated_at = $3
		WHERE id = $4`

	_, err := r.db.Exec(query, txHash, escrowID, time.Now(), id)
	if err != nil {
		return fmt.Errorf("failed to update order with escrow dst: %w", err)
	}

	return nil
}

// UpdateOrderWithSecret updates order with revealed secret
func (r *OrderRepository) UpdateOrderWithSecret(id int64, secret string) error {
	query := `UPDATE swap_orders SET secret = $1, updated_at = $2 WHERE id = $3`

	_, err := r.db.Exec(query, secret, time.Now(), id)
	if err != nil {
		return fmt.Errorf("failed to update order with secret: %w", err)
	}

	return nil
}

// GetActiveOrders returns all active orders
func (r *OrderRepository) GetActiveOrders() ([]*types.SwapOrder, error) {
	query := `
		SELECT id, order_hash, state, maker, maker_sui_address, receiver,
			   maker_asset, taker_asset, making_amount, taking_amount,
			   secret_hash, deadline_src, deadline_dst, escrow_src_address,
			   escrow_src_tx_hash, escrow_dst_id, escrow_dst_tx_hash,
			   original_order, signature, extension, created_at, updated_at, error_message
		FROM swap_orders 
		WHERE state NOT IN ('EXECUTED', 'REFUNDED', 'CANCELLED')
		ORDER BY created_at DESC`

	rows, err := r.db.Query(query)
	if err != nil {
		return nil, fmt.Errorf("failed to query active orders: %w", err)
	}
	defer rows.Close()

	var orders []*types.SwapOrder
	for rows.Next() {
		order, err := r.scanOrder(rows)
		if err != nil {
			return nil, err
		}
		orders = append(orders, order)
	}

	return orders, nil
}

// GetOrdersByMaker returns orders for a specific maker
func (r *OrderRepository) GetOrdersByMaker(maker string) ([]*types.SwapOrder, error) {
	query := `
		SELECT id, order_hash, state, maker, maker_sui_address, receiver,
			   maker_asset, taker_asset, making_amount, taking_amount,
			   secret_hash, deadline_src, deadline_dst, escrow_src_address,
			   escrow_src_tx_hash, escrow_dst_id, escrow_dst_tx_hash,
			   original_order, signature, extension, created_at, updated_at, error_message
		FROM swap_orders 
		WHERE maker = $1
		ORDER BY created_at DESC`

	rows, err := r.db.Query(query, maker)
	if err != nil {
		return nil, fmt.Errorf("failed to query orders by maker: %w", err)
	}
	defer rows.Close()

	var orders []*types.SwapOrder
	for rows.Next() {
		order, err := r.scanOrder(rows)
		if err != nil {
			return nil, err
		}
		orders = append(orders, order)
	}

	return orders, nil
}

// SetOrderError sets an error message for an order
func (r *OrderRepository) SetOrderError(id int64, errorMsg string) error {
	query := `UPDATE swap_orders SET error_message = $1, updated_at = $2 WHERE id = $3`

	_, err := r.db.Exec(query, errorMsg, time.Now(), id)
	if err != nil {
		return fmt.Errorf("failed to set order error: %w", err)
	}

	return nil
}

// scanOrder scans a database row into a SwapOrder struct
func (r *OrderRepository) scanOrder(scanner interface {
	Scan(dest ...interface{}) error
}) (*types.SwapOrder, error) {
	order := &types.SwapOrder{}
	var makingAmountStr, takingAmountStr string
	var originalOrderJSON string

	err := scanner.Scan(
		&order.ID,
		&order.OrderHash,
		&order.State,
		&order.Maker,
		&order.MakerSuiAddress,
		&order.Receiver,
		&order.MakerAsset,
		&order.TakerAsset,
		&makingAmountStr,
		&takingAmountStr,
		&order.SecretHash,
		&order.DeadlineSrc,
		&order.DeadlineDst,
		&order.EscrowSrcAddress,
		&order.EscrowSrcTxHash,
		&order.EscrowDstID,
		&order.EscrowDstTxHash,
		&originalOrderJSON,
		&order.Signature,
		&order.Extension,
		&order.CreatedAt,
		&order.UpdatedAt,
		&order.ErrorMessage,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to scan order: %w", err)
	}

	// Parse amounts from strings
	if order.MakingAmount, err = types.ParseBigInt(makingAmountStr); err != nil {
		return nil, fmt.Errorf("failed to parse making amount: %w", err)
	}

	if order.TakingAmount, err = types.ParseBigInt(takingAmountStr); err != nil {
		return nil, fmt.Errorf("failed to parse taking amount: %w", err)
	}

	// Set original order JSON
	order.OriginalOrder = []byte(originalOrderJSON)

	return order, nil
}
