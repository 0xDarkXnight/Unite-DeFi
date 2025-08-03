/// Module: simple_escrow_dst
module simple_limit_order_protocol::simple_escrow_dst {
    use sui::object::{Self, ID, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::coin::{Self, Coin};
    use sui::clock::{Self, Clock};
    use sui::event;
    use std::option::{Self, Option};
    
    // Error codes
    const E_ALREADY_INITIALIZED: u64 = 0;
    const E_NOT_INITIALIZED: u64 = 1;
    const E_ONLY_RESOLVER: u64 = 2;
    const E_ONLY_USER: u64 = 3;
    const E_ALREADY_COMPLETED: u64 = 4;
    const E_INVALID_SECRET: u64 = 5;
    const E_TIMELOCK_NOT_EXPIRED: u64 = 6;
    const E_INSUFFICIENT_BALANCE: u64 = 7;
    
    /// Destination escrow for cross-chain atomic swaps (holds resolver tokens)
    public struct SimpleEscrowDst<phantom T> has key, store {
        id: UID,
        amount: u64,
        secret_hash: vector<u8>,
        timelock: u64,
        resolver: address,
        user: address,
        initialized: bool,
        withdrawn: bool,
        refunded: bool,
        balance: Option<Coin<T>>,
    }
    
    // Events
    public struct Withdrawn has copy, drop {
        escrow_id: ID,
        to: address,
        secret: vector<u8>,
    }
    
    public struct Refunded has copy, drop {
        escrow_id: ID,
        to: address,
    }
    
    public struct Deposited has copy, drop {
        escrow_id: ID,
        amount: u64,
    }
    
    /// Create a new escrow (factory function)
    public fun new<T>(
        amount: u64,
        secret_hash: vector<u8>,
        timelock: u64,
        resolver: address,
        user: address,
        ctx: &mut TxContext
    ): SimpleEscrowDst<T> {
        SimpleEscrowDst {
            id: object::new(ctx),
            amount,
            secret_hash,
            timelock,
            resolver,
            user,
            initialized: true,
            withdrawn: false,
            refunded: false,
            balance: option::none(),
        }
    }
    
    /// Deposit tokens into escrow (called by resolver after creation)
    public fun deposit<T>(
        escrow: &mut SimpleEscrowDst<T>,
        payment: Coin<T>,
        ctx: &mut TxContext
    ) {
        assert!(escrow.initialized, E_NOT_INITIALIZED);
        assert!(tx_context::sender(ctx) == escrow.resolver, E_ONLY_RESOLVER);
        assert!(!escrow.withdrawn && !escrow.refunded, E_ALREADY_COMPLETED);
        assert!(coin::value(&payment) >= escrow.amount, E_INSUFFICIENT_BALANCE);
        
        // If payment is exactly the required amount, store it
        if (coin::value(&payment) == escrow.amount) {
            option::fill(&mut escrow.balance, payment);
        } else {
            // Split the coin to get the exact amount needed
            let deposit_coin = coin::split(&mut payment, escrow.amount, ctx);
            option::fill(&mut escrow.balance, deposit_coin);
            // Return the change to the resolver
            transfer::public_transfer(payment, escrow.resolver);
        };
        
        event::emit(Deposited {
            escrow_id: object::id(escrow),
            amount: escrow.amount,
        });
    }
    
    /// Withdraw tokens with secret (called by user)
    public fun withdraw<T>(
        escrow: &mut SimpleEscrowDst<T>,
        secret: vector<u8>,
        ctx: &TxContext
    ): Coin<T> {
        assert!(escrow.initialized, E_NOT_INITIALIZED);
        assert!(tx_context::sender(ctx) == escrow.user, E_ONLY_USER);
        assert!(!escrow.withdrawn && !escrow.refunded, E_ALREADY_COMPLETED);
        
        // Verify secret
        let secret_hash = sui::hash::keccak256(&secret);
        assert!(secret_hash == escrow.secret_hash, E_INVALID_SECRET);
        
        escrow.withdrawn = true;
        let balance = option::extract(&mut escrow.balance);
        
        event::emit(Withdrawn {
            escrow_id: object::id(escrow),
            to: escrow.user,
            secret,
        });
        
        balance
    }
    
    /// Withdraw tokens with secret to user (called by resolver for automatic completion)
    public fun withdraw_to_user<T>(
        escrow: &mut SimpleEscrowDst<T>,
        secret: vector<u8>,
        ctx: &TxContext
    ): Coin<T> {
        assert!(escrow.initialized, E_NOT_INITIALIZED);
        assert!(tx_context::sender(ctx) == escrow.resolver, E_ONLY_RESOLVER);
        assert!(!escrow.withdrawn && !escrow.refunded, E_ALREADY_COMPLETED);
        
        // Verify secret
        let secret_hash = sui::hash::keccak256(&secret);
        assert!(secret_hash == escrow.secret_hash, E_INVALID_SECRET);
        
        escrow.withdrawn = true;
        let balance = option::extract(&mut escrow.balance);
        
        event::emit(Withdrawn {
            escrow_id: object::id(escrow),
            to: escrow.user,
            secret,
        });
        
        balance
    }
    
    /// Refund tokens to resolver after timelock
    public fun refund<T>(
        escrow: &mut SimpleEscrowDst<T>,
        clock: &Clock,
        ctx: &TxContext
    ): Coin<T> {
        assert!(escrow.initialized, E_NOT_INITIALIZED);
        assert!(tx_context::sender(ctx) == escrow.resolver, E_ONLY_RESOLVER);
        assert!(!escrow.withdrawn && !escrow.refunded, E_ALREADY_COMPLETED);
        assert!(clock::timestamp_ms(clock) / 1000 >= escrow.timelock, E_TIMELOCK_NOT_EXPIRED);
        
        escrow.refunded = true;
        let balance = option::extract(&mut escrow.balance);
        
        event::emit(Refunded {
            escrow_id: object::id(escrow),
            to: escrow.resolver,
        });
        
        balance
    }
    
    /// Get escrow status
    public fun get_status<T>(escrow: &SimpleEscrowDst<T>): (bool, bool, bool, u64) {
        let balance = if (option::is_some(&escrow.balance)) {
            coin::value(option::borrow(&escrow.balance))
        } else {
            0
        };
        
        (escrow.initialized, escrow.withdrawn, escrow.refunded, balance)
    }
    
    /// Get escrow details
    public fun get_details<T>(escrow: &SimpleEscrowDst<T>): (u64, vector<u8>, u64, address, address) {
        (escrow.amount, escrow.secret_hash, escrow.timelock, escrow.resolver, escrow.user)
    }
    
    /// Check if escrow has balance
    public fun has_balance<T>(escrow: &SimpleEscrowDst<T>): bool {
        option::is_some(&escrow.balance)
    }
}