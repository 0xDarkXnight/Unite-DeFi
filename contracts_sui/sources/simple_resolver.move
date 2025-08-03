/// Module: simple_resolver
module simple_limit_order_protocol::simple_resolver {
    use sui::object::{Self, ID, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::coin::{Self, Coin};
    use sui::clock::{Self, Clock};
    use sui::event;
    use sui::balance::{Self, Balance};
    use std::option::{Self, Option};
    use simple_limit_order_protocol::simple_limit_order_protocol::{Self, SimpleLimitOrderProtocol, Order};
    use simple_limit_order_protocol::simple_escrow_factory::{Self, SimpleEscrowFactory, EscrowCreatorCap};
    use simple_limit_order_protocol::simple_escrow_src::{Self, SimpleEscrowSrc};
    use simple_limit_order_protocol::simple_escrow_dst::{Self, SimpleEscrowDst};
    use simple_limit_order_protocol::temporary_fund_storage::{Self, TemporaryFundStorage, DepositRegistry};
    
    // Error codes
    const E_RESOLVER_DISABLED: u64 = 0;
    const E_GAS_PRICE_TOO_HIGH: u64 = 1;
    const E_NOT_OWNER: u64 = 2;
    const E_INSUFFICIENT_BALANCE: u64 = 3;
    const E_ORDER_NOT_PROFITABLE: u64 = 4;
    const E_MUST_SEND_SUI: u64 = 5;
    
    /// Resolver configuration
    public struct ResolverConfig has store, drop {
        min_profit_basis_points: u64, // Minimum profit in basis points (1% = 100)
        max_gas_price: u64, // Maximum gas price willing to pay
        enabled: bool, // Whether resolver is active
    }
    
    /// Resolver contract for executing Dutch auction orders and managing escrows
    public struct SimpleResolver has key {
        id: UID,
        owner: address,
        config: ResolverConfig,
        sui_balance: Balance<sui::sui::SUI>,
    }
    
    /// Resolver admin capability
    public struct ResolverAdminCap has key, store {
        id: UID,
    }
    
    // Events
    public struct OrderExecuted has copy, drop {
        order_hash: vector<u8>,
        maker: address,
        making_amount: u64,
        taking_amount: u64,
        profit: u64,
    }
    
    public struct EscrowDeployed has copy, drop {
        order_id: vector<u8>,
        src_escrow_id: ID,
        dst_escrow_id: ID,
    }
    
    public struct AtomicSwapCompleted has copy, drop {
        src_escrow_id: ID,
        secret: vector<u8>,
    }
    
    public struct Funded has copy, drop {
        sender: address,
        amount: u64,
    }
    
    public struct SUIWithdrawn has copy, drop {
        recipient: address,
        amount: u64,
    }
    
    /// Initialize the resolver
    fun init(ctx: &mut TxContext) {
        let resolver = SimpleResolver {
            id: object::new(ctx),
            owner: tx_context::sender(ctx),
            config: ResolverConfig {
                min_profit_basis_points: 50, // 0.5% minimum profit
                max_gas_price: 5000, // 5000 MIST per gas unit
                enabled: true,
            },
            sui_balance: balance::zero(),
        };
        
        let admin_cap = ResolverAdminCap {
            id: object::new(ctx),
        };
        
        transfer::share_object(resolver);
        transfer::transfer(admin_cap, tx_context::sender(ctx));
    }
    
    /// Execute a Dutch auction order
    public fun execute_order<MakerAsset, TakerAsset>(
        resolver: &SimpleResolver,
        _cap: &ResolverAdminCap,
        protocol: &mut SimpleLimitOrderProtocol,
        order: Order,
        signature: vector<u8>,
        making_amount: u64,
        taking_amount: u64,
        maker_payment: Coin<MakerAsset>,
        taker_payment: Coin<TakerAsset>,
        ctx: &TxContext
    ): (Coin<MakerAsset>, Coin<TakerAsset>) {
        assert!(resolver.config.enabled, E_RESOLVER_DISABLED);
        assert!(tx_context::sender(ctx) == resolver.owner, E_NOT_OWNER);
        
        // Execute the order
        let (maker_coin, taker_coin) = simple_limit_order_protocol::fill_order(
            protocol,
            order,
            signature,
            making_amount,
            taking_amount,
            maker_payment,
            taker_payment,
            ctx
        );
        
        let order_hash = simple_limit_order_protocol::hash_order(&order);
        event::emit(OrderExecuted {
            order_hash,
            maker: simple_limit_order_protocol::get_order_maker(&order),
            making_amount,
            taking_amount,
            profit: 0, // No profit calculation in this simplified version
        });
        
        (maker_coin, taker_coin)
    }
    
    /// Deploy escrow contracts for cross-chain swap
    public fun deploy_escrows<SrcAsset, DstAsset>(
        resolver: &SimpleResolver,
        _cap: &ResolverAdminCap,
        factory: &SimpleEscrowFactory,
        creator_cap: &EscrowCreatorCap,
        order_id: vector<u8>,
        src_amount: u64,
        dst_amount: u64,
        secret_hash: vector<u8>,
        timelock: u64,
        user: address,
        ctx: &mut TxContext
    ): (SimpleEscrowSrc<SrcAsset>, SimpleEscrowDst<DstAsset>) {
        assert!(tx_context::sender(ctx) == resolver.owner, E_NOT_OWNER);
        
        // Deploy source escrow (holds user tokens)
        let src_escrow = simple_escrow_factory::create_escrow_src<SrcAsset>(
            factory,
            creator_cap,
            order_id,
            src_amount,
            secret_hash,
            timelock,
            resolver.owner,
            user,
            ctx
        );
        
        // Deploy destination escrow (holds resolver tokens)
        let dst_escrow = simple_escrow_factory::create_escrow_dst<DstAsset>(
            factory,
            creator_cap,
            order_id,
            dst_amount,
            secret_hash,
            timelock,
            resolver.owner,
            user,
            ctx
        );
        
        event::emit(EscrowDeployed {
            order_id,
            src_escrow_id: object::id(&src_escrow),
            dst_escrow_id: object::id(&dst_escrow),
        });
        
        (src_escrow, dst_escrow)
    }
    
    /// Complete atomic swap after user reveals secret
    public fun complete_atomic_swap<T>(
        resolver: &SimpleResolver,
        _cap: &ResolverAdminCap,
        src_escrow: &mut SimpleEscrowSrc<T>,
        secret: vector<u8>,
        ctx: &TxContext
    ): Coin<T> {
        assert!(tx_context::sender(ctx) == resolver.owner, E_NOT_OWNER);
        
        // Use the revealed secret to withdraw from source escrow
        let withdrawn_coin = simple_escrow_src::withdraw(src_escrow, secret, ctx);
        
        event::emit(AtomicSwapCompleted {
            src_escrow_id: object::id(src_escrow),
            secret,
        });
        
        withdrawn_coin
    }
    
    /// Fund destination escrow with tokens for atomic swap
    public fun fund_destination_escrow<T>(
        resolver: &SimpleResolver,
        _cap: &ResolverAdminCap,
        dst_escrow: &mut SimpleEscrowDst<T>,
        payment: Coin<T>,
        ctx: &TxContext
    ) {
        assert!(tx_context::sender(ctx) == resolver.owner, E_NOT_OWNER);
        
        // Deposit into the escrow
        simple_escrow_dst::deposit(dst_escrow, payment, ctx);
    }
    
    /// Withdraw user funds from TemporaryFundStorage
    public fun withdraw_from_temporary_storage<T>(
        resolver: &SimpleResolver,
        _cap: &ResolverAdminCap,
        storage: &TemporaryFundStorage,
        registry: &mut DepositRegistry<T>,
        order_hash: vector<u8>,
        destination: address,
        ctx: &TxContext
    ): Coin<T> {
        assert!(tx_context::sender(ctx) == resolver.owner, E_NOT_OWNER);
        
        temporary_fund_storage::withdraw_funds(
            storage,
            registry,
            order_hash,
            destination,
            ctx
        )
    }
    
    /// Withdraw tokens to user from destination escrow (for automatic completion)
    public fun withdraw_to_user_from_destination_escrow<T>(
        resolver: &SimpleResolver,
        _cap: &ResolverAdminCap,
        dst_escrow: &mut SimpleEscrowDst<T>,
        secret: vector<u8>,
        ctx: &TxContext
    ): Coin<T> {
        assert!(tx_context::sender(ctx) == resolver.owner, E_NOT_OWNER);
        
        simple_escrow_dst::withdraw_to_user(dst_escrow, secret, ctx)
    }
    
    /// Update resolver configuration
    public fun update_config(
        resolver: &mut SimpleResolver,
        _cap: &ResolverAdminCap,
        min_profit_basis_points: u64,
        max_gas_price: u64,
        enabled: bool,
        ctx: &TxContext
    ) {
        assert!(tx_context::sender(ctx) == resolver.owner, E_NOT_OWNER);
        
        resolver.config = ResolverConfig {
            min_profit_basis_points,
            max_gas_price,
            enabled,
        };
    }
    
    /// Fund the resolver contract with SUI for gas fees
    public fun fund(
        resolver: &mut SimpleResolver,
        payment: Coin<sui::sui::SUI>,
        ctx: &TxContext
    ) {
        let amount = coin::value(&payment);
        assert!(amount > 0, E_MUST_SEND_SUI);
        
        balance::join(&mut resolver.sui_balance, coin::into_balance(payment));
        
        event::emit(Funded {
            sender: tx_context::sender(ctx),
            amount,
        });
    }
    
    /// Withdraw SUI from the resolver contract
    public fun withdraw_sui(
        resolver: &mut SimpleResolver,
        _cap: &ResolverAdminCap,
        amount: u64,
        ctx: &mut TxContext
    ): Coin<sui::sui::SUI> {
        assert!(tx_context::sender(ctx) == resolver.owner, E_NOT_OWNER);
        assert!(balance::value(&resolver.sui_balance) >= amount, E_INSUFFICIENT_BALANCE);
        
        let withdrawn_balance = balance::split(&mut resolver.sui_balance, amount);
        let coin = coin::from_balance(withdrawn_balance, ctx);
        
        event::emit(SUIWithdrawn {
            recipient: resolver.owner,
            amount,
        });
        
        coin
    }
    
    /// Get contract SUI balance
    public fun get_balance(resolver: &SimpleResolver): u64 {
        balance::value(&resolver.sui_balance)
    }
    
    /// Calculate expected profit from order execution
    fun calculate_profit(
        _order: &Order,
        _making_amount: u64,
        taking_amount: u64
    ): u64 {
        // Simplified profit calculation
        // In reality, this would consider gas costs, market prices, etc.
        (taking_amount * 50) / 10000 // 0.5% default profit
    }
    
    /// Check if order is profitable
    public fun is_profitable(
        resolver: &SimpleResolver,
        order: Order,
        making_amount: u64,
        taking_amount: u64
    ): bool {
        if (!resolver.config.enabled) {
            return false
        };
        
        let profit = calculate_profit(&order, making_amount, taking_amount);
        let min_profit = (taking_amount * resolver.config.min_profit_basis_points) / 10000;
        
        profit >= min_profit
    }
    
    /// Get resolver configuration
    public fun get_config(resolver: &SimpleResolver): (u64, u64, bool) {
        (
            resolver.config.min_profit_basis_points,
            resolver.config.max_gas_price,
            resolver.config.enabled
        )
    }
    
    /// Get resolver owner
    public fun get_owner(resolver: &SimpleResolver): address {
        resolver.owner
    }
    
    /// Transfer admin capability
    public fun transfer_admin_cap(cap: ResolverAdminCap, to: address) {
        transfer::transfer(cap, to);
    }
    
    /// Emergency withdraw any token type
    public fun emergency_withdraw<T>(
        resolver: &SimpleResolver,
        _cap: &ResolverAdminCap,
        coin: Coin<T>,
        ctx: &TxContext
    ): Coin<T> {
        assert!(tx_context::sender(ctx) == resolver.owner, E_NOT_OWNER);
        coin
    }
}