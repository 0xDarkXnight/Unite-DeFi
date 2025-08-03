// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import "./TemporaryFundStorage.sol";

contract SimpleLimitOrderProtocol is EIP712, Ownable, Pausable {
    using SafeERC20 for IERC20;

    struct Order {
        uint256 salt;
        address makerAsset;
        address takerAsset;
        address maker;
        address receiver;
        address allowedSender;
        uint256 makingAmount;
        uint256 takingAmount;
        uint256 offsets;
        bytes interactions;
    }

    bytes32 public constant ORDER_TYPEHASH =
        keccak256(
            "Order(uint256 salt,address makerAsset,address takerAsset,address maker,address receiver,address allowedSender,uint256 makingAmount,uint256 takingAmount,uint256 offsets,bytes interactions)"
        );

    mapping(bytes32 => bool) public invalidatedOrders;
    mapping(bytes32 => uint256) public filledAmount;

    // Integration with temporary fund storage
    TemporaryFundStorage public immutable temporaryStorage;

    event OrderFilled(
        bytes32 indexed orderHash,
        address indexed maker,
        uint256 makingAmount,
        uint256 takingAmount,
        address taker
    );
    event OrderCancelled(bytes32 indexed orderHash);
    event OrderCreatedAndDeposited(
        bytes32 indexed orderHash,
        address indexed maker,
        uint256 makingAmount
    );

    constructor(
        address _temporaryStorage
    ) EIP712("1inch Limit Order Protocol", "4") Ownable(msg.sender) {
        temporaryStorage = TemporaryFundStorage(_temporaryStorage);
    }

    /**
     * @notice Create and sign an order with immediate fund deposit
     * @param order The order details
     * @param signature The maker's signature
     * @return orderHash The hash of the created order
     */
    function createAndDepositOrder(
        Order calldata order,
        bytes calldata signature
    ) external whenNotPaused returns (bytes32 orderHash) {
        orderHash = _hashTypedDataV4(hashOrder(order));

        require(!invalidatedOrders[orderHash], "Order already cancelled");
        require(filledAmount[orderHash] == 0, "Order already exists");

        // Verify signature
        address signer = ECDSA.recover(orderHash, signature);
        require(signer == order.maker, "Invalid signature");
        require(msg.sender == order.maker, "Only maker can deposit");

        // Register the deposit in temporary storage (this will handle the transfer)
        temporaryStorage.depositFunds(
            orderHash,
            order.makerAsset,
            order.makingAmount,
            order.maker
        );

        emit OrderCreatedAndDeposited(
            orderHash,
            order.maker,
            order.makingAmount
        );
    }

    function fillOrder(
        Order calldata order,
        bytes calldata signature,
        uint256 makingAmount,
        uint256 takingAmount
    ) external whenNotPaused {
        bytes32 orderHash = _hashTypedDataV4(hashOrder(order));

        require(!invalidatedOrders[orderHash], "Order already cancelled");
        require(
            filledAmount[orderHash] + makingAmount <= order.makingAmount,
            "Order overfilled"
        );
        require(
            order.allowedSender == address(0) ||
                order.allowedSender == msg.sender,
            "Private order"
        );

        address signer = ECDSA.recover(orderHash, signature);
        require(signer == order.maker, "Invalid signature");

        filledAmount[orderHash] += makingAmount;

        // NOTE: For the new flow, maker funds should come from temporary storage or escrows
        // This method is kept for backward compatibility but should not be used in the new flow
        IERC20(order.makerAsset).safeTransferFrom(
            order.maker,
            msg.sender,
            makingAmount
        );
        IERC20(order.takerAsset).safeTransferFrom(
            msg.sender,
            order.receiver,
            takingAmount
        );

        emit OrderFilled(
            orderHash,
            order.maker,
            makingAmount,
            takingAmount,
            msg.sender
        );
    }

    /**
     * @notice Fill order using funds from escrow (new atomic swap flow)
     * @param order The order to fill
     * @param signature The maker's signature
     * @param makingAmount Amount to fill
     * @param takingAmount Amount to receive
     * @param srcEscrow Source escrow containing maker funds
     */
    function fillOrderFromEscrow(
        Order calldata order,
        bytes calldata signature,
        uint256 makingAmount,
        uint256 takingAmount,
        address srcEscrow
    ) external whenNotPaused {
        bytes32 orderHash = _hashTypedDataV4(hashOrder(order));

        require(!invalidatedOrders[orderHash], "Order already cancelled");
        require(
            filledAmount[orderHash] + makingAmount <= order.makingAmount,
            "Order overfilled"
        );
        require(
            order.allowedSender == address(0) ||
                order.allowedSender == msg.sender,
            "Private order"
        );

        address signer = ECDSA.recover(orderHash, signature);
        require(signer == order.maker, "Invalid signature");

        filledAmount[orderHash] += makingAmount;

        // Get maker funds from source escrow (resolver should have withdrawn with secret)
        IERC20(order.makerAsset).safeTransferFrom(
            srcEscrow,
            msg.sender,
            makingAmount
        );

        // Resolver provides taker tokens to user
        IERC20(order.takerAsset).safeTransferFrom(
            msg.sender,
            order.receiver,
            takingAmount
        );

        emit OrderFilled(
            orderHash,
            order.maker,
            makingAmount,
            takingAmount,
            msg.sender
        );
    }

    function cancelOrder(Order calldata order) external {
        require(msg.sender == order.maker, "Only maker can cancel");

        bytes32 orderHash = _hashTypedDataV4(hashOrder(order));
        invalidatedOrders[orderHash] = true;

        emit OrderCancelled(orderHash);
    }

    function hashOrder(Order calldata order) public pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    ORDER_TYPEHASH,
                    order.salt,
                    order.makerAsset,
                    order.takerAsset,
                    order.maker,
                    order.receiver,
                    order.allowedSender,
                    order.makingAmount,
                    order.takingAmount,
                    order.offsets,
                    keccak256(order.interactions)
                )
            );
    }

    function pause() external onlyOwner {
        _pause();
    }
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @notice Fund the contract with ETH for gas fees
     */
    function fund() external payable {
        require(msg.value > 0, "Must send ETH");
        emit Funded(msg.sender, msg.value);
    }

    /**
     * @notice Withdraw ETH from the contract
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
}
