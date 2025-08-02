// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/utils/math/Math.sol";

contract SimpleDutchAuctionCalculator {
    using Math for uint256;
    uint256 private constant _LOW_128_BITS = 0xffffffffffffffffffffffffffffffff;

    function calculateTakingAmount(uint256 startTimeEndTime, uint256 takingAmountStart, uint256 takingAmountEnd) external view returns (uint256) {
        uint256 startTime = startTimeEndTime >> 128;
        uint256 endTime = startTimeEndTime & _LOW_128_BITS;
        
        require(startTime < endTime, "Invalid time range");
        require(block.timestamp >= startTime, "Auction not started");
        
        if (block.timestamp >= endTime) {
            return takingAmountEnd;
        }
        
        uint256 elapsed = block.timestamp - startTime;
        uint256 duration = endTime - startTime;
        
        if (takingAmountEnd > takingAmountStart) {
            return takingAmountStart + ((takingAmountEnd - takingAmountStart) * elapsed) / duration;
        } else {
            return takingAmountStart - ((takingAmountStart - takingAmountEnd) * elapsed) / duration;
        }
    }

    function packTimes(uint256 startTime, uint256 endTime) external pure returns (uint256) {
        require(startTime < endTime, "Invalid time range");
        require(startTime <= type(uint128).max, "Start time too large");
        require(endTime <= type(uint128).max, "End time too large");
        
        return (startTime << 128) | endTime;
    }
}
