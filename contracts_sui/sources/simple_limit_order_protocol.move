/// Module: simple_limit_order_protocol
module simple_limit_order_protocol::simple_limit_order_protocol {
    use sui::object::{Self, ID, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::coin::{Self, Coin};
    use sui::event;
    use sui::table::{Self, Table};
    use sui::bcs;
    use std::vector;
    use simple_limit_order_protocol::temporary_fund_storage::{Self, TemporaryFundStorage, DepositRegistry};
    
    // Error codes
    const E_ORDER_CANCELLED: u64 = 0;
    const E_ORDER_OVERFILLED: u64 = 1;
    const E_PRIVATE_ORDER: u64 = 2;
    const E_INVALID_SIGNATURE: u64 = 3;
    const E_PROTOCOL_PAUSED: u64 = 4;
    const E_ORDER_ALREADY_EXISTS: u64 = 5;
    const E_ONLY_MAKER_CAN_DEPOSIT: u64 = 6;
    const E_ONLY_MAKER_CAN_CANCEL: u64 = 7;
    const E_NOT_OWNER: u64 = 8;
    const E_INSUFFICIENT_BALANCE: u64 = 9;
    
    /// Order structure
    public struct Order has copy, drop, store {
        salt: u256,
        maker_asset_type: vector<u8>, // Type name as bytes
        taker_asset_type: vector<u8>, // Type name as bytes
        maker: address,
        receiver: address,
        allowed_sender: address, // address(0) means anyone can fill
        making_amount: u64,
        taking_amount: u64,
        offsets: u256,
        interactions: vector<u8>,
    }
    
    /// Protocol state
    public struct SimpleLimitOrderProtocol has key {
        id: UID,
        owner: address,
        paused: bool,
        invalidated_orders: Table<vector<u8>, bool>, // order_hash -> bool
        filled_amounts: Table<vector<u8>, u64>, // order_hash -> amount
        temporary_storage_id: Option<ID>,
    }
    
    /// Protocol admin capability
    public struct ProtocolAdminCap has key, store {
        id: UID,
    }
    
    // Events
    public struct OrderFilled has copy, drop {
        order_hash: vector<u8>,
        maker: address,
        making_amount: u64,
        taking_amount: u64,
        taker: address,
    }
    
    public struct OrderCancelled has copy, drop {
        order_hash: vector<u8>,
    }
    
    public struct OrderCreatedAndDeposited has copy, drop {
        order_hash: vector<u8>,
        maker: address,
        making_amount: u64,
    }
    
    public struct ProtocolPaused has copy, drop {
        paused: bool,
    }
    
    /// Initialize the protocol
    fun init(ctx: &mut TxContext) {
        let protocol = SimpleLimitOrderProtocol {
            id: object::new(ctx),
            owner: tx_context::sender(ctx),
            paused: false,
            invalidated_orders: table::new(ctx),
            filled_amounts: table::new(ctx),
            temporary_storage_id: option::none(),
        };
        
        let admin_cap = ProtocolAdminCap {
            id: object::new(ctx),
        };
        
        transfer::share_object(protocol);
        transfer::transfer(admin_cap, tx_context::sender(ctx));
    }
    
    /// Set temporary storage reference
    public fun set_temporary_storage(
        protocol: &mut SimpleLimitOrderProtocol,
        _cap: &ProtocolAdminCap,
        storage: &TemporaryFundStorage,
        ctx: &TxContext
    ) {
        assert!(tx_context::sender(ctx) == protocol.owner, E_NOT_OWNER);
        protocol.temporary_storage_id = option::some(object::id(storage));
    }
    
    /// Create and sign an order with immediate fund deposit
    public fun create_and_deposit_order<MakerAsset>(
        protocol: &mut SimpleLimitOrderProtocol,
        registry: &mut DepositRegistry<MakerAsset>,
        order: Order,
        signature: vector<u8>, // In real implementation, this would be verified
        payment: Coin<MakerAsset>,
        clock: &sui::clock::Clock,
        ctx: &mut TxContext
    ): vector<u8> {
        assert!(!protocol.paused, E_PROTOCOL_PAUSED);
        
        let order_hash = hash_order(&order);
        
        assert!(!table::contains(&protocol.invalidated_orders, order_hash), E_ORDER_CANCELLED);
        assert!(!table::contains(&protocol.filled_amounts, order_hash), E_ORDER_ALREADY_EXISTS);
        assert!(tx_context::sender(ctx) == order.maker, E_ONLY_MAKER_CAN_DEPOSIT);
        assert!(coin::value(&payment) >= order.making_amount, E_INSUFFICIENT_BALANCE);
        
        // Verify signature (simplified - in real implementation would use cryptographic verification)
        // For now, we just check that signature is not empty
        assert!(!vector::is_empty(&signature), E_INVALID_SIGNATURE);
        
        // Initialize filled amount to 0
        table::add(&mut protocol.filled_amounts, order_hash, 0);
        
        // If payment is more than needed, split it
        let deposit_coin = if (coin::value(&payment) == order.making_amount) {
            payment
        } else {
            coin::split(&mut payment, order.making_amount, ctx)
        };
        
        // Deposit funds in temporary storage
        temporary_fund_storage::deposit_funds(
            registry,
            order_hash,
            deposit_coin,
            clock,
            ctx
        );
        
        // Return change if any
        if (coin::value(&payment) > 0) {
            transfer::public_transfer(payment, order.maker);
        };
        
        event::emit(OrderCreatedAndDeposited {
            order_hash,
            maker: order.maker,
            making_amount: order.making_amount,
        });
        
        order_hash
    }
    
    /// Fill an order (traditional method - backward compatibility)
    public fun fill_order<MakerAsset, TakerAsset>(
        protocol: &mut SimpleLimitOrderProtocol,
        order: Order,
        signature: vector<u8>,
        making_amount: u64,
        taking_amount: u64,
        maker_payment: Coin<MakerAsset>,
        taker_payment: Coin<TakerAsset>,
        ctx: &mut TxContext
    ): (Coin<MakerAsset>, Coin<TakerAsset>) {
        assert!(!protocol.paused, E_PROTOCOL_PAUSED);
        
        let order_hash = hash_order(&order);
        
        assert!(!table::contains(&protocol.invalidated_orders, order_hash), E_ORDER_CANCELLED);
        
        let current_filled = if (table::contains(&protocol.filled_amounts, order_hash)) {
            *table::borrow(&protocol.filled_amounts, order_hash)
        } else {
            0
        };
        
        assert!(current_filled + making_amount <= order.making_amount, E_ORDER_OVERFILLED);
        assert!(
            order.allowed_sender == @0x0 || order.allowed_sender == tx_context::sender(ctx),
            E_PRIVATE_ORDER
        );
        
        // Verify signature (simplified)
        assert!(!vector::is_empty(&signature), E_INVALID_SIGNATURE);
        
        // Update filled amount
        if (table::contains(&protocol.filled_amounts, order_hash)) {
            let filled_ref = table::borrow_mut(&mut protocol.filled_amounts, order_hash);
            *filled_ref = *filled_ref + making_amount;
        } else {
            table::add(&mut protocol.filled_amounts, order_hash, making_amount);
        };
        
        // Verify payment amounts
        assert!(coin::value(&maker_payment) >= making_amount, E_INSUFFICIENT_BALANCE);
        assert!(coin::value(&taker_payment) >= taking_amount, E_INSUFFICIENT_BALANCE);
        
        // Split coins to exact amounts
        let maker_coin = if (coin::value(&maker_payment) == making_amount) {
            maker_payment
        } else {
            coin::split(&mut maker_payment, making_amount, ctx)
        };
        
        let taker_coin = if (coin::value(&taker_payment) == taking_amount) {
            taker_payment
        } else {
            coin::split(&mut taker_payment, taking_amount, ctx)
        };
        
        // Return any change
        if (coin::value(&maker_payment) > 0) {
            transfer::public_transfer(maker_payment, order.maker);
        };
        if (coin::value(&taker_payment) > 0) {
            transfer::public_transfer(taker_payment, tx_context::sender(ctx));
        };
        
        event::emit(OrderFilled {
            order_hash,
            maker: order.maker,
            making_amount,
            taking_amount,
            taker: tx_context::sender(ctx),
        });
        
        // Return coins for the parties (taker gets maker coins, maker gets taker coins)
        (maker_coin, taker_coin)
    }
    
    /// Cancel an order
    public fun cancel_order(
        protocol: &mut SimpleLimitOrderProtocol,
        order: Order,
        ctx: &TxContext
    ) {
        assert!(tx_context::sender(ctx) == order.maker, E_ONLY_MAKER_CAN_CANCEL);
        
        let order_hash = hash_order(&order);
        
        if (table::contains(&protocol.invalidated_orders, order_hash)) {
            *table::borrow_mut(&mut protocol.invalidated_orders, order_hash) = true;
        } else {
            table::add(&mut protocol.invalidated_orders, order_hash, true);
        };
        
        event::emit(OrderCancelled { order_hash });
    }
    
    /// Hash an order
    public fun hash_order(order: &Order): vector<u8> {
        let order_bytes = bcs::to_bytes(order);
        sui::hash::keccak256(&order_bytes)
    }
    
    /// Pause the protocol
    public fun pause(
        protocol: &mut SimpleLimitOrderProtocol,
        _cap: &ProtocolAdminCap,
        ctx: &TxContext
    ) {
        assert!(tx_context::sender(ctx) == protocol.owner, E_NOT_OWNER);
        protocol.paused = true;
        event::emit(ProtocolPaused { paused: true });
    }
    
    /// Unpause the protocol
    public fun unpause(
        protocol: &mut SimpleLimitOrderProtocol,
        _cap: &ProtocolAdminCap,
        ctx: &TxContext
    ) {
        assert!(tx_context::sender(ctx) == protocol.owner, E_NOT_OWNER);
        protocol.paused = false;
        event::emit(ProtocolPaused { paused: false });
    }
    
    /// Check if order is cancelled
    public fun is_order_cancelled(protocol: &SimpleLimitOrderProtocol, order_hash: vector<u8>): bool {
        table::contains(&protocol.invalidated_orders, order_hash) &&
        *table::borrow(&protocol.invalidated_orders, order_hash)
    }
    
    /// Get filled amount for an order
    public fun get_filled_amount(protocol: &SimpleLimitOrderProtocol, order_hash: vector<u8>): u64 {
        if (table::contains(&protocol.filled_amounts, order_hash)) {
            *table::borrow(&protocol.filled_amounts, order_hash)
        } else {
            0
        }
    }
    
    /// Check if protocol is paused
    public fun is_paused(protocol: &SimpleLimitOrderProtocol): bool {
        protocol.paused
    }
    
    /// Get protocol owner
    public fun get_owner(protocol: &SimpleLimitOrderProtocol): address {
        protocol.owner
    }
    
    /// Get order maker (public accessor function)
    public fun get_order_maker(order: &Order): address {
        order.maker
    }
    
    /// Transfer admin capability
    public fun transfer_admin_cap(cap: ProtocolAdminCap, to: address) {
        transfer::transfer(cap, to);
    }
    
    /// Create order struct
    public fun create_order(
        salt: u256,
        maker_asset_type: vector<u8>,
        taker_asset_type: vector<u8>,
        maker: address,
        receiver: address,
        allowed_sender: address,
        making_amount: u64,
        taking_amount: u64,
        offsets: u256,
        interactions: vector<u8>,
    ): Order {
        Order {
            salt,
            maker_asset_type,
            taker_asset_type,
            maker,
            receiver,
            allowed_sender,
            making_amount,
            taking_amount,
            offsets,
            interactions,
        }
    }
}