/// Module: simple_escrow_factory
module simple_limit_order_protocol::simple_escrow_factory {
    use sui::object::{Self, ID, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;
    use simple_limit_order_protocol::simple_escrow_src::{Self, SimpleEscrowSrc};
    use simple_limit_order_protocol::simple_escrow_dst::{Self, SimpleEscrowDst};
    
    // Error codes
    const E_NOT_AUTHORIZED: u64 = 0;
    
    /// Factory for creating escrow contracts for cross-chain swaps
    public struct SimpleEscrowFactory has key {
        id: UID,
        owner: address,
    }
    
    /// Capability to create escrows
    public struct EscrowCreatorCap has key, store {
        id: UID,
    }
    
    // Events
    public struct EscrowSrcCreated<phantom T> has copy, drop {
        escrow_id: ID,
        order_id: vector<u8>,
        resolver: address,
        amount: u64,
    }
    
    public struct EscrowDstCreated<phantom T> has copy, drop {
        escrow_id: ID,
        order_id: vector<u8>,
        resolver: address,
        amount: u64,
    }
    
    /// Initialize the factory
    fun init(ctx: &mut TxContext) {
        let factory = SimpleEscrowFactory {
            id: object::new(ctx),
            owner: tx_context::sender(ctx),
        };
        
        let creator_cap = EscrowCreatorCap {
            id: object::new(ctx),
        };
        
        transfer::share_object(factory);
        transfer::transfer(creator_cap, tx_context::sender(ctx));
    }
    
    /// Create a source escrow (holds user's tokens)
    public fun create_escrow_src<T>(
        _factory: &SimpleEscrowFactory,
        _cap: &EscrowCreatorCap,
        order_id: vector<u8>,
        amount: u64,
        secret_hash: vector<u8>,
        timelock: u64,
        resolver: address,
        user: address,
        ctx: &mut TxContext
    ): SimpleEscrowSrc<T> {
        let escrow = simple_escrow_src::new<T>(
            amount,
            secret_hash,
            timelock,
            resolver,
            user,
            ctx
        );
        
        event::emit(EscrowSrcCreated<T> {
            escrow_id: object::id(&escrow),
            order_id,
            resolver,
            amount,
        });
        
        escrow
    }
    
    /// Create a destination escrow (holds resolver's tokens)
    public fun create_escrow_dst<T>(
        _factory: &SimpleEscrowFactory,
        _cap: &EscrowCreatorCap,
        order_id: vector<u8>,
        amount: u64,
        secret_hash: vector<u8>,
        timelock: u64,
        resolver: address,
        user: address,
        ctx: &mut TxContext
    ): SimpleEscrowDst<T> {
        let escrow = simple_escrow_dst::new<T>(
            amount,
            secret_hash,
            timelock,
            resolver,
            user,
            ctx
        );
        
        event::emit(EscrowDstCreated<T> {
            escrow_id: object::id(&escrow),
            order_id,
            resolver,
            amount,
        });
        
        escrow
    }
    
    /// Transfer creator capability to another address
    public fun transfer_creator_cap(cap: EscrowCreatorCap, to: address) {
        transfer::transfer(cap, to);
    }
    
    /// Get factory owner
    public fun get_owner(factory: &SimpleEscrowFactory): address {
        factory.owner
    }
}