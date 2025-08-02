// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./SimpleLimitOrderProtocol.sol";
import "./SimpleEscrowFactory.sol";

/**
 * @title SimpleResolver
 * @notice Resolver contract for executing Dutch auction orders and managing escrows
 */
contract SimpleResolver is Ownable {
    using SafeERC20 for IERC20;

    SimpleLimitOrderProtocol public immutable limitOrderProtocol;
    SimpleEscrowFactory public immutable escrowFactory;

    struct ResolverConfig {
        uint256 minProfitBasisPoints; // Minimum profit in basis points (1% = 100)
        uint256 maxGasPrice; // Maximum gas price willing to pay
        bool enabled; // Whether resolver is active
    }

    ResolverConfig public config;

    event OrderExecuted(
        bytes32 indexed orderHash,
        address indexed maker,
        uint256 makingAmount,
        uint256 takingAmount,
        uint256 profit
    );

    event EscrowDeployed(
        bytes32 indexed orderId,
        address indexed srcEscrow,
        address indexed dstEscrow
    );

    constructor(
        address _limitOrderProtocol,
        address _escrowFactory
    ) Ownable(msg.sender) {
        limitOrderProtocol = SimpleLimitOrderProtocol(_limitOrderProtocol);
        escrowFactory = SimpleEscrowFactory(_escrowFactory);

        // Default configuration
        config = ResolverConfig({
            minProfitBasisPoints: 50, // 0.5% minimum profit
            maxGasPrice: 5000 gwei,
            enabled: true
        });
    }

    /**
     * @notice Execute a Dutch auction order
     * @param order The order to fill
     * @param signature The signature of the order
     * @param makingAmount Amount of maker asset to fill
     * @param takingAmount Amount of taker asset to fill
     */
    function executeOrder(
        SimpleLimitOrderProtocol.Order calldata order,
        bytes calldata signature,
        uint256 makingAmount,
        uint256 takingAmount
    ) external onlyOwner {
        require(config.enabled, "Resolver disabled");
        require(tx.gasprice <= config.maxGasPrice, "Gas price too high");

        // Execute the order without profit check
        limitOrderProtocol.fillOrder(
            order,
            signature,
            makingAmount,
            takingAmount
        );

        bytes32 orderHash = limitOrderProtocol.hashOrder(order);
        emit OrderExecuted(
            orderHash,
            order.maker,
            makingAmount,
            takingAmount,
            0 // No profit calculation needed
        );
    }

    /**
     * @notice Deploy escrow contracts for cross-chain swap
     * @param orderId Unique order identifier
     * @param srcToken Token on source chain
     * @param dstToken Token on destination chain
     * @param srcAmount Amount on source chain
     * @param dstAmount Amount on destination chain
     * @param secretHash Hash of the secret
     * @param timelock Timelock for refunds
     * @param user User address
     */
    function deployEscrows(
        bytes32 orderId,
        address srcToken,
        address dstToken,
        uint256 srcAmount,
        uint256 dstAmount,
        bytes32 secretHash,
        uint256 timelock,
        address user
    ) external onlyOwner returns (address srcEscrow, address dstEscrow) {
        // Deploy source escrow (holds user tokens)
        srcEscrow = escrowFactory.createEscrowSrc(
            orderId,
            srcToken,
            srcAmount,
            secretHash,
            timelock,
            address(this),
            user
        );

        // Deploy destination escrow (holds resolver tokens)
        dstEscrow = escrowFactory.createEscrowDst(
            orderId,
            dstToken,
            dstAmount,
            secretHash,
            timelock,
            address(this),
            user
        );

        emit EscrowDeployed(orderId, srcEscrow, dstEscrow);
    }

    /**
     * @notice Update resolver configuration
     */
    function updateConfig(
        uint256 _minProfitBasisPoints,
        uint256 _maxGasPrice,
        bool _enabled
    ) external onlyOwner {
        config = ResolverConfig({
            minProfitBasisPoints: _minProfitBasisPoints,
            maxGasPrice: _maxGasPrice,
            enabled: _enabled
        });
    }

    /**
     * @notice Emergency withdraw tokens
     */
    function emergencyWithdraw(
        address token,
        uint256 amount
    ) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }

    /**
     * @notice Fund the resolver contract with ETH for gas fees
     */
    function fund() external payable {
        require(msg.value > 0, "Must send ETH");
        emit Funded(msg.sender, msg.value);
    }

    /**
     * @notice Withdraw ETH from the resolver contract
     */
    function withdrawETH(uint256 amount) external onlyOwner {
        require(amount <= address(this).balance, "Insufficient balance");
        payable(owner()).transfer(amount);
        emit ETHWithdrawn(owner(), amount);
    }

    /**
     * @notice Get contract ETH balance
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    event Funded(address indexed sender, uint256 amount);
    event ETHWithdrawn(address indexed recipient, uint256 amount);

    /**
     * @notice Calculate expected profit from order execution
     */
    function _calculateProfit(
        SimpleLimitOrderProtocol.Order calldata order,
        uint256 makingAmount,
        uint256 takingAmount
    ) internal pure returns (uint256) {
        // Simplified profit calculation
        // In reality, this would consider gas costs, market prices, etc.
        return (takingAmount * 50) / 10000; // 0.5% default profit
    }

    /**
     * @notice Check if order is profitable
     */
    function isProfitable(
        SimpleLimitOrderProtocol.Order calldata order,
        uint256 makingAmount,
        uint256 takingAmount
    ) external view returns (bool) {
        if (!config.enabled) return false;

        uint256 profit = _calculateProfit(order, makingAmount, takingAmount);
        uint256 minProfit = (takingAmount * config.minProfitBasisPoints) /
            10000;

        return profit >= minProfit;
    }
}
