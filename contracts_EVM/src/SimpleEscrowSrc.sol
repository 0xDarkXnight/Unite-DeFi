// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title SimpleEscrowSrc
 * @notice Source escrow for cross-chain atomic swaps (holds user tokens)
 */
contract SimpleEscrowSrc {
    using SafeERC20 for IERC20;

    address public token;
    uint256 public amount;
    bytes32 public secretHash;
    uint256 public timelock;
    address public resolver;
    address public user;
    bool public initialized;
    bool public withdrawn;
    bool public refunded;

    event Withdrawn(address indexed to, bytes32 secret);
    event Refunded(address indexed to);

    modifier onlyInitialized() {
        require(initialized, "Not initialized");
        _;
    }

    modifier onlyResolver() {
        require(msg.sender == resolver, "Only resolver");
        _;
    }

    modifier onlyUser() {
        require(msg.sender == user, "Only user");
        _;
    }

    /**
     * @notice Initialize the escrow (called by factory)
     */
    function initialize(
        address _token,
        uint256 _amount,
        bytes32 _secretHash,
        uint256 _timelock,
        address _resolver,
        address _user
    ) external {
        require(!initialized, "Already initialized");
        
        token = _token;
        amount = _amount;
        secretHash = _secretHash;
        timelock = _timelock;
        resolver = _resolver;
        user = _user;
        initialized = true;
    }

    /**
     * @notice Deposit tokens into escrow (called by user after creation)
     */
    function deposit() external onlyInitialized onlyUser {
        require(!withdrawn && !refunded, "Already completed");
        IERC20(token).safeTransferFrom(user, address(this), amount);
    }

    /**
     * @notice Withdraw tokens with secret (called by resolver)
     * @param secret The preimage of secretHash
     */
    function withdraw(bytes32 secret) external onlyInitialized onlyResolver {
        require(!withdrawn && !refunded, "Already completed");
        require(keccak256(abi.encodePacked(secret)) == secretHash, "Invalid secret");
        
        withdrawn = true;
        IERC20(token).safeTransfer(resolver, amount);
        
        emit Withdrawn(resolver, secret);
    }

    /**
     * @notice Refund tokens to user after timelock
     */
    function refund() external onlyInitialized onlyUser {
        require(!withdrawn && !refunded, "Already completed");
        require(block.timestamp >= timelock, "Timelock not expired");
        
        refunded = true;
        IERC20(token).safeTransfer(user, amount);
        
        emit Refunded(user);
    }

    /**
     * @notice Get escrow status
     */
    function getStatus() external view returns (
        bool _initialized,
        bool _withdrawn,
        bool _refunded,
        uint256 _balance
    ) {
        return (
            initialized,
            withdrawn,
            refunded,
            initialized ? IERC20(token).balanceOf(address(this)) : 0
        );
    }
}