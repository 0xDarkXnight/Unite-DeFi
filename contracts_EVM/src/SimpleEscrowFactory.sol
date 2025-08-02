// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./SimpleEscrowSrc.sol";
import "./SimpleEscrowDst.sol";

/**
 * @title SimpleEscrowFactory
 * @notice Factory for creating escrow contracts for cross-chain swaps
 */
contract SimpleEscrowFactory is Ownable {
    using Clones for address;

    address public immutable escrowSrcImplementation;
    address public immutable escrowDstImplementation;

    event EscrowSrcCreated(
        address indexed escrow,
        bytes32 indexed orderId,
        address indexed resolver,
        address token,
        uint256 amount
    );

    event EscrowDstCreated(
        address indexed escrow,
        bytes32 indexed orderId,
        address indexed resolver,
        address token,
        uint256 amount
    );

    constructor() Ownable(msg.sender) {
        escrowSrcImplementation = address(new SimpleEscrowSrc());
        escrowDstImplementation = address(new SimpleEscrowDst());
    }

    /**
     * @notice Create a source escrow (holds user's tokens)
     * @param orderId Unique order identifier
     * @param token Token to escrow
     * @param amount Amount to escrow
     * @param secretHash Hash of the secret for atomic swap
     * @param timelock Time after which refund is allowed
     * @param resolver Address of the resolver
     * @param user Address of the user
     * @return escrow Address of created escrow
     */
    function createEscrowSrc(
        bytes32 orderId,
        address token,
        uint256 amount,
        bytes32 secretHash,
        uint256 timelock,
        address resolver,
        address user
    ) external returns (address escrow) {
        bytes32 salt = keccak256(abi.encodePacked(orderId, "src"));
        escrow = escrowSrcImplementation.cloneDeterministic(salt);
        
        SimpleEscrowSrc(escrow).initialize(
            token,
            amount,
            secretHash,
            timelock,
            resolver,
            user
        );

        emit EscrowSrcCreated(escrow, orderId, resolver, token, amount);
    }

    /**
     * @notice Create a destination escrow (holds resolver's tokens)
     * @param orderId Unique order identifier
     * @param token Token to escrow
     * @param amount Amount to escrow
     * @param secretHash Hash of the secret for atomic swap
     * @param timelock Time after which refund is allowed
     * @param resolver Address of the resolver
     * @param user Address of the user
     * @return escrow Address of created escrow
     */
    function createEscrowDst(
        bytes32 orderId,
        address token,
        uint256 amount,
        bytes32 secretHash,
        uint256 timelock,
        address resolver,
        address user
    ) external returns (address escrow) {
        bytes32 salt = keccak256(abi.encodePacked(orderId, "dst"));
        escrow = escrowDstImplementation.cloneDeterministic(salt);
        
        SimpleEscrowDst(escrow).initialize(
            token,
            amount,
            secretHash,
            timelock,
            resolver,
            user
        );

        emit EscrowDstCreated(escrow, orderId, resolver, token, amount);
    }

    /**
     * @notice Predict the address of a source escrow
     * @param orderId Order identifier
     * @return Predicted escrow address
     */
    function predictEscrowSrcAddress(bytes32 orderId) external view returns (address) {
        bytes32 salt = keccak256(abi.encodePacked(orderId, "src"));
        return escrowSrcImplementation.predictDeterministicAddress(salt);
    }

    /**
     * @notice Predict the address of a destination escrow
     * @param orderId Order identifier
     * @return Predicted escrow address
     */
    function predictEscrowDstAddress(bytes32 orderId) external view returns (address) {
        bytes32 salt = keccak256(abi.encodePacked(orderId, "dst"));
        return escrowDstImplementation.predictDeterministicAddress(salt);
    }
}