/// Module: temporary_fund_storage
module simple_limit_order_protocol::temporary_fund_storage {
    use sui::object::{Self, ID, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::coin::{Self, Coin};
    use sui::clock::{Self, Clock};
    use sui::event;
    use sui::table::{Self, Table};
    use std::option::{Self, Option};
    use std::vector;
    
    // Error codes
    const E_AMOUNT_ZERO: u64 = 0;
    const E_ORDER_ALREADY_HAS_DEPOSIT: u64 = 1;
    const E_NOT_AUTHORIZED_WITHDRAWER: u64 = 2;
    const E_NO_DEPOSIT_FOUND: u64 = 3;
    const E_ALREADY_WITHDRAWN: u64 = 4;
    const E_NOT_AUTHORIZED_TO_REFUND: u64 = 5;
    const E_INSUFFICIENT_BALANCE: u64 = 6;
    const E_NOT_OWNER: u64 = 7;
    
    // Constants
    const REFUND_TIMEOUT_MS: u64 = 172800000; // 48 hours in milliseconds
    
    /// Fund deposit information
    public struct FundDeposit<phantom T> has store {
        user: address,
        amount: u64,
        order_id: vector<u8>,
        timestamp: u64,
        withdrawn: bool,
        balance: Option<Coin<T>>,
    }
    
    /// Temporarily holds user funds after order signing until escrows are ready
    public struct TemporaryFundStorage has key {
        id: UID,
        owner: address,
        authorized_withdrawers: Table<address, bool>,
    }
    
    /// Capability to manage the storage
    public struct StorageAdminCap has key, store {
        id: UID,
    }
    
    /// A generic deposit registry to track deposits by order ID
    public struct DepositRegistry<phantom T> has key {
        id: UID,
        deposits: Table<vector<u8>, FundDeposit<T>>, // order_id -> deposit
        user_deposits: Table<address, vector<vector<u8>>>, // user -> order_ids[]
    }
    
    // Events
    public struct FundsDeposited has copy, drop {
        order_id: vector<u8>,
        user: address,
        amount: u64,
    }
    
    public struct FundsWithdrawn has copy, drop {
        order_id: vector<u8>,
        withdrawer: address,
        destination: address,
    }
    
    public struct FundsRefunded has copy, drop {
        order_id: vector<u8>,
        user: address,
    }
    
    public struct WithdrawerAuthorized has copy, drop {
        withdrawer: address,
    }
    
    public struct WithdrawerRevoked has copy, drop {
        withdrawer: address,
    }
    
    /// Initialize the temporary fund storage
    fun init(ctx: &mut TxContext) {
        let storage = TemporaryFundStorage {
            id: object::new(ctx),
            owner: tx_context::sender(ctx),
            authorized_withdrawers: table::new(ctx),
        };
        
        let admin_cap = StorageAdminCap {
            id: object::new(ctx),
        };
        
        transfer::share_object(storage);
        transfer::transfer(admin_cap, tx_context::sender(ctx));
    }
    
    /// Create a deposit registry for a specific token type
    public fun create_deposit_registry<T>(ctx: &mut TxContext): DepositRegistry<T> {
        DepositRegistry {
            id: object::new(ctx),
            deposits: table::new(ctx),
            user_deposits: table::new(ctx),
        }
    }
    
    /// Deposit funds for an order (called directly by user)
    public fun deposit_funds<T>(
        registry: &mut DepositRegistry<T>,
        order_id: vector<u8>,
        payment: Coin<T>,
        clock: &Clock,
        ctx: &TxContext
    ) {
        let amount = coin::value(&payment);
        assert!(amount > 0, E_AMOUNT_ZERO);
        assert!(!table::contains(&registry.deposits, order_id), E_ORDER_ALREADY_HAS_DEPOSIT);
        
        let user = tx_context::sender(ctx);
        let timestamp = clock::timestamp_ms(clock);
        
        // Create deposit
        let deposit = FundDeposit {
            user,
            amount,
            order_id: order_id,
            timestamp,
            withdrawn: false,
            balance: option::some(payment),
        };
        
        // Store deposit
        table::add(&mut registry.deposits, order_id, deposit);
        
        // Track user deposits
        if (!table::contains(&registry.user_deposits, user)) {
            table::add(&mut registry.user_deposits, user, vector::empty());
        };
        let user_orders = table::borrow_mut(&mut registry.user_deposits, user);
        vector::push_back(user_orders, order_id);
        
        event::emit(FundsDeposited {
            order_id,
            user,
            amount,
        });
    }
    
    /// Withdraw funds to a destination (called by authorized contracts like escrows)
    public fun withdraw_funds<T>(
        storage: &TemporaryFundStorage,
        registry: &mut DepositRegistry<T>,
        order_id: vector<u8>,
        destination: address,
        ctx: &TxContext
    ): Coin<T> {
        assert!(
            table::contains(&storage.authorized_withdrawers, tx_context::sender(ctx)) &&
            *table::borrow(&storage.authorized_withdrawers, tx_context::sender(ctx)),
            E_NOT_AUTHORIZED_WITHDRAWER
        );
        
        assert!(table::contains(&registry.deposits, order_id), E_NO_DEPOSIT_FOUND);
        let deposit = table::borrow_mut(&mut registry.deposits, order_id);
        assert!(!deposit.withdrawn, E_ALREADY_WITHDRAWN);
        
        // Mark as withdrawn
        deposit.withdrawn = true;
        let balance = option::extract(&mut deposit.balance);
        
        event::emit(FundsWithdrawn {
            order_id,
            withdrawer: tx_context::sender(ctx),
            destination,
        });
        
        balance
    }
    
    /// Refund funds to user (in case of cancellation or expiry)
    public fun refund_funds<T>(
        storage: &TemporaryFundStorage,
        registry: &mut DepositRegistry<T>,
        order_id: vector<u8>,
        clock: &Clock,
        ctx: &TxContext
    ): Coin<T> {
        assert!(table::contains(&registry.deposits, order_id), E_NO_DEPOSIT_FOUND);
        let deposit = table::borrow_mut(&mut registry.deposits, order_id);
        assert!(!deposit.withdrawn, E_ALREADY_WITHDRAWN);
        
        let sender = tx_context::sender(ctx);
        let current_time = clock::timestamp_ms(clock);
        
        // Only user can refund, or authorized withdrawer after timeout
        let can_refund = (sender == deposit.user) || 
            (current_time >= deposit.timestamp + REFUND_TIMEOUT_MS &&
             table::contains(&storage.authorized_withdrawers, sender) &&
             *table::borrow(&storage.authorized_withdrawers, sender));
        
        assert!(can_refund, E_NOT_AUTHORIZED_TO_REFUND);
        
        // Mark as withdrawn
        deposit.withdrawn = true;
        let balance = option::extract(&mut deposit.balance);
        
        event::emit(FundsRefunded {
            order_id,
            user: deposit.user,
        });
        
        balance
    }
    
    /// Authorize a contract to withdraw funds (for escrows)
    public fun authorize_withdrawer(
        storage: &mut TemporaryFundStorage,
        _cap: &StorageAdminCap,
        withdrawer: address,
        ctx: &TxContext
    ) {
        assert!(tx_context::sender(ctx) == storage.owner, E_NOT_OWNER);
        
        if (table::contains(&storage.authorized_withdrawers, withdrawer)) {
            *table::borrow_mut(&mut storage.authorized_withdrawers, withdrawer) = true;
        } else {
            table::add(&mut storage.authorized_withdrawers, withdrawer, true);
        };
        
        event::emit(WithdrawerAuthorized { withdrawer });
    }
    
    /// Revoke withdrawal authorization
    public fun revoke_withdrawer(
        storage: &mut TemporaryFundStorage,
        _cap: &StorageAdminCap,
        withdrawer: address,
        ctx: &TxContext
    ) {
        assert!(tx_context::sender(ctx) == storage.owner, E_NOT_OWNER);
        
        if (table::contains(&storage.authorized_withdrawers, withdrawer)) {
            *table::borrow_mut(&mut storage.authorized_withdrawers, withdrawer) = false;
        };
        
        event::emit(WithdrawerRevoked { withdrawer });
    }
    
    /// Get deposit information
    public fun get_deposit<T>(
        registry: &DepositRegistry<T>,
        order_id: vector<u8>
    ): (address, u64, vector<u8>, u64, bool) {
        assert!(table::contains(&registry.deposits, order_id), E_NO_DEPOSIT_FOUND);
        let deposit = table::borrow(&registry.deposits, order_id);
        (deposit.user, deposit.amount, deposit.order_id, deposit.timestamp, deposit.withdrawn)
    }
    
    /// Get user's deposit order IDs
    public fun get_user_deposits<T>(
        registry: &DepositRegistry<T>,
        user: address
    ): vector<vector<u8>> {
        if (table::contains(&registry.user_deposits, user)) {
            *table::borrow(&registry.user_deposits, user)
        } else {
            vector::empty()
        }
    }
    
    /// Check if funds are available for an order
    public fun has_funds<T>(
        registry: &DepositRegistry<T>,
        order_id: vector<u8>
    ): bool {
        if (!table::contains(&registry.deposits, order_id)) {
            return false
        };
        
        let deposit = table::borrow(&registry.deposits, order_id);
        option::is_some(&deposit.balance) && !deposit.withdrawn
    }
    
    /// Check if address is authorized withdrawer
    public fun is_authorized_withdrawer(
        storage: &TemporaryFundStorage,
        withdrawer: address
    ): bool {
        table::contains(&storage.authorized_withdrawers, withdrawer) &&
        *table::borrow(&storage.authorized_withdrawers, withdrawer)
    }
    
    /// Get storage owner
    public fun get_owner(storage: &TemporaryFundStorage): address {
        storage.owner
    }
    
    /// Transfer admin capability
    public fun transfer_admin_cap(cap: StorageAdminCap, to: address) {
        transfer::transfer(cap, to);
    }
}