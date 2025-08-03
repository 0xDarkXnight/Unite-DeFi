// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title TemporaryFundStorage
 * @notice Temporarily holds user funds after order signing until escrows are ready
 * @dev This contract acts as a bridge between order signing and escrow deployment
 */
contract TemporaryFundStorage is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct FundDeposit {
        address user;
        address token;
        uint256 amount;
        bytes32 orderId;
        uint256 timestamp;
        bool withdrawn;
    }

    mapping(bytes32 => FundDeposit) public deposits; // orderId -> deposit
    mapping(address => bytes32[]) public userDeposits; // user -> orderIds[]

    // Only authorized contracts can withdraw (escrows, emergency)
    mapping(address => bool) public authorizedWithdrawers;

    event FundsDeposited(
        bytes32 indexed orderId,
        address indexed user,
        address token,
        uint256 amount
    );

    event FundsWithdrawn(
        bytes32 indexed orderId,
        address indexed withdrawer,
        address indexed destination
    );

    event FundsRefunded(bytes32 indexed orderId, address indexed user);

    event WithdrawerAuthorized(address indexed withdrawer);
    event WithdrawerRevoked(address indexed withdrawer);

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Deposit funds for an order (called when user signs order)
     * @param orderId Unique order identifier
     * @param token Token to deposit
     * @param amount Amount to deposit
     * @param user Address of the user (for when called by trusted contracts)
     */
    function depositFunds(
        bytes32 orderId,
        address token,
        uint256 amount,
        address user
    ) external nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        require(deposits[orderId].amount == 0, "Order already has deposit");

        // Transfer tokens from user to this contract
        IERC20(token).safeTransferFrom(user, address(this), amount);

        // Store deposit information
        deposits[orderId] = FundDeposit({
            user: user,
            token: token,
            amount: amount,
            orderId: orderId,
            timestamp: block.timestamp,
            withdrawn: false
        });

        // Track user deposits
        userDeposits[user].push(orderId);

        emit FundsDeposited(orderId, user, token, amount);
    }

    /**
     * @notice Deposit funds for an order (called directly by user)
     * @param orderId Unique order identifier
     * @param token Token to deposit
     * @param amount Amount to deposit
     */
    function depositFundsFromSender(
        bytes32 orderId,
        address token,
        uint256 amount
    ) external nonReentrant {
        require(amount > 0, "Amount must be greater than 0");
        require(deposits[orderId].amount == 0, "Order already has deposit");

        // Transfer tokens from user to this contract
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        // Store deposit information
        deposits[orderId] = FundDeposit({
            user: msg.sender,
            token: token,
            amount: amount,
            orderId: orderId,
            timestamp: block.timestamp,
            withdrawn: false
        });

        // Track user deposits
        userDeposits[msg.sender].push(orderId);

        emit FundsDeposited(orderId, msg.sender, token, amount);
    }

    /**
     * @notice Withdraw funds to a destination (called by authorized contracts like escrows)
     * @param orderId Order identifier
     * @param destination Where to send the funds
     */
    function withdrawFunds(
        bytes32 orderId,
        address destination
    ) external nonReentrant {
        require(
            authorizedWithdrawers[msg.sender],
            "Not authorized to withdraw"
        );

        FundDeposit storage deposit = deposits[orderId];
        require(deposit.amount > 0, "No deposit found");
        require(!deposit.withdrawn, "Already withdrawn");

        // Mark as withdrawn
        deposit.withdrawn = true;

        // Transfer funds to destination
        IERC20(deposit.token).safeTransfer(destination, deposit.amount);

        emit FundsWithdrawn(orderId, msg.sender, destination);
    }

    /**
     * @notice Refund funds to user (in case of cancellation or expiry)
     * @param orderId Order identifier
     */
    function refundFunds(bytes32 orderId) external nonReentrant {
        FundDeposit storage deposit = deposits[orderId];
        require(deposit.amount > 0, "No deposit found");
        require(!deposit.withdrawn, "Already withdrawn");

        // Only user can refund, or after significant time has passed (48 hours)
        require(
            msg.sender == deposit.user ||
                (block.timestamp >= deposit.timestamp + 48 hours &&
                    authorizedWithdrawers[msg.sender]),
            "Not authorized to refund"
        );

        // Mark as withdrawn
        deposit.withdrawn = true;

        // Refund to user
        IERC20(deposit.token).safeTransfer(deposit.user, deposit.amount);

        emit FundsRefunded(orderId, deposit.user);
    }

    /**
     * @notice Authorize a contract to withdraw funds (for escrows)
     * @param withdrawer Address to authorize
     */
    function authorizeWithdrawer(address withdrawer) external onlyOwner {
        authorizedWithdrawers[withdrawer] = true;
        emit WithdrawerAuthorized(withdrawer);
    }

    /**
     * @notice Revoke withdrawal authorization
     * @param withdrawer Address to revoke
     */
    function revokeWithdrawer(address withdrawer) external onlyOwner {
        authorizedWithdrawers[withdrawer] = false;
        emit WithdrawerRevoked(withdrawer);
    }

    /**
     * @notice Get deposit information
     * @param orderId Order identifier
     * @return deposit information
     */
    function getDeposit(
        bytes32 orderId
    ) external view returns (FundDeposit memory) {
        return deposits[orderId];
    }

    /**
     * @notice Get user's deposit order IDs
     * @param user User address
     * @return Array of order IDs
     */
    function getUserDeposits(
        address user
    ) external view returns (bytes32[] memory) {
        return userDeposits[user];
    }

    /**
     * @notice Check if funds are available for an order
     * @param orderId Order identifier
     * @return True if funds are deposited and not withdrawn
     */
    function hasFunds(bytes32 orderId) external view returns (bool) {
        FundDeposit memory deposit = deposits[orderId];
        return deposit.amount > 0 && !deposit.withdrawn;
    }
}
