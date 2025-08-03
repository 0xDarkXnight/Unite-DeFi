/// Module: simple_dutch_auction_calculator
module simple_limit_order_protocol::simple_dutch_auction_calculator {
    use sui::clock::{Self, Clock};
    
    // Constants
    const LOW_128_BITS: u256 = 0xffffffffffffffffffffffffffffffff;
    
    // Error codes
    const E_INVALID_TIME_RANGE: u64 = 0;
    const E_AUCTION_NOT_STARTED: u64 = 1;
    const E_START_TIME_TOO_LARGE: u64 = 2;
    const E_END_TIME_TOO_LARGE: u64 = 3;
    
    /// Calculate the taking amount for a Dutch auction based on current time
    public fun calculate_taking_amount(
        start_time_end_time: u256,
        taking_amount_start: u256,
        taking_amount_end: u256,
        clock: &Clock
    ): u256 {
        let start_time = start_time_end_time >> 128;
        let end_time = start_time_end_time & LOW_128_BITS;
        
        assert!(start_time < end_time, E_INVALID_TIME_RANGE);
        
        let current_time = (clock::timestamp_ms(clock) / 1000) as u256; // Convert to seconds
        assert!(current_time >= start_time, E_AUCTION_NOT_STARTED);
        
        if (current_time >= end_time) {
            return taking_amount_end
        };
        
        let elapsed = current_time - start_time;
        let duration = end_time - start_time;
        
        if (taking_amount_end > taking_amount_start) {
            taking_amount_start + ((taking_amount_end - taking_amount_start) * elapsed) / duration
        } else {
            taking_amount_start - ((taking_amount_start - taking_amount_end) * elapsed) / duration
        }
    }
    
    /// Pack start and end times into a single u256
    public fun pack_times(start_time: u256, end_time: u256): u256 {
        assert!(start_time < end_time, E_INVALID_TIME_RANGE);
        assert!(start_time <= 340282366920938463463374607431768211455u256, E_START_TIME_TOO_LARGE);
        assert!(end_time <= 340282366920938463463374607431768211455u256, E_END_TIME_TOO_LARGE);
        
        (start_time << 128) | end_time
    }
    
    /// Unpack times from a single u256
    public fun unpack_times(start_time_end_time: u256): (u256, u256) {
        let start_time = start_time_end_time >> 128;
        let end_time = start_time_end_time & LOW_128_BITS;
        (start_time, end_time)
    }
}