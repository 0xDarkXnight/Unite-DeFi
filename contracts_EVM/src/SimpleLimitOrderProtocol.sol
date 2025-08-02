// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

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

    event OrderFilled(
        bytes32 indexed orderHash,
        address indexed maker,
        uint256 makingAmount,
        uint256 takingAmount,
        address taker
    );
    event OrderCancelled(bytes32 indexed orderHash);

    constructor()
        EIP712("1inch Limit Order Protocol", "4")
        Ownable(msg.sender)
    {}

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
