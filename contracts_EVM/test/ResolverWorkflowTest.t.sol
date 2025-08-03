// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/TemporaryFundStorage.sol";
import "../src/SimpleResolver.sol";
import "../src/SimpleLimitOrderProtocol.sol";
import "../src/SimpleEscrowFactory.sol";
import "../src/SimpleEscrowSrc.sol";
import "../src/SimpleEscrowDst.sol";
import "../src/SimpleDutchAuctionCalculator.sol";

/**
 * @title ResolverWorkflowTest
 * @notice Test the complete cross-chain swap workflow through the Resolver
 */
contract ResolverWorkflowTest is Test {
    // Mock tokens
    ERC20Mock weth;
    ERC20Mock usdc;

    // Protocol contracts
    SimpleLimitOrderProtocol limitOrderProtocol;
    SimpleEscrowFactory escrowFactory;
    SimpleResolver resolver;
    SimpleDutchAuctionCalculator calculator;

    // Users
    address maker = address(0x1);
    address taker = address(0x2);
    address resolver_owner = address(0x3);

    // Chain IDs
    uint256 constant SRC_CHAIN_ID = 11155111; // Sepolia
    uint256 constant DST_CHAIN_ID = 80001; // Mumbai

    // Order parameters
    uint256 constant MAKING_AMOUNT = 1e15; // 0.001 WETH
    uint256 constant TAKING_AMOUNT = 997; // 0.000997 USDC (simplified for test)
    uint256 constant ORDER_SALT = 123456789;

    // EIP-712 type hash
    bytes32 constant ORDER_TYPEHASH =
        keccak256(
            "Order(uint256 salt,address makerAsset,address takerAsset,address maker,address receiver,address allowedSender,uint256 makingAmount,uint256 takingAmount,uint256 offsets,bytes interactions)"
        );

    function setUp() public {
        // Create mock tokens
        weth = new ERC20Mock("Wrapped Ether", "WETH", 18);
        usdc = new ERC20Mock("USD Coin", "USDC", 6);

        // Deploy protocol contracts
        address tempStorage = address(new TemporaryFundStorage());
        limitOrderProtocol = new SimpleLimitOrderProtocol(tempStorage);
        calculator = new SimpleDutchAuctionCalculator();
        escrowFactory = new SimpleEscrowFactory();

        // Deploy resolver with owner
        vm.startPrank(resolver_owner);
        resolver = new SimpleResolver(
            address(limitOrderProtocol),
            address(escrowFactory)
        );
        vm.stopPrank();

        // Domain separator will be created dynamically during signing

        // Fund accounts
        weth.mint(maker, 10 ether);
        usdc.mint(taker, 10000 * 10 ** 6);

        // Fund resolver
        weth.mint(address(resolver), 1 ether);
        usdc.mint(address(resolver), 1000 * 10 ** 6);

        // Approve tokens
        vm.startPrank(maker);
        weth.approve(address(limitOrderProtocol), type(uint256).max);
        vm.stopPrank();

        vm.startPrank(taker);
        usdc.approve(address(limitOrderProtocol), type(uint256).max);
        vm.stopPrank();

        vm.startPrank(address(resolver));
        weth.approve(address(limitOrderProtocol), type(uint256).max);
        usdc.approve(address(limitOrderProtocol), type(uint256).max);
        vm.stopPrank();
    }

    function testCompleteSwapWorkflow() public {
        // Create order
        SimpleLimitOrderProtocol.Order memory order = SimpleLimitOrderProtocol
            .Order({
                salt: ORDER_SALT,
                makerAsset: address(weth),
                takerAsset: address(usdc),
                maker: maker,
                receiver: maker,
                allowedSender: address(0),
                makingAmount: MAKING_AMOUNT,
                takingAmount: TAKING_AMOUNT,
                offsets: 0,
                interactions: ""
            });

        // Sign order - we need to use the correct EIP-712 domain
        bytes32 orderHash = limitOrderProtocol.hashOrder(order);

        // Create EIP-712 domain separator for the current chain
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256("1inch Limit Order Protocol"),
                keccak256("4"),
                block.chainid,
                address(limitOrderProtocol)
            )
        );

        // Create the digest for signing
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                domainSeparator,
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
                )
            )
        );

        // Sign the digest with the maker's private key
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(uint256(1), digest); // Maker's private key is 1
        bytes memory signature = abi.encodePacked(r, s, v);

        // Verify initial balances
        assertEq(weth.balanceOf(maker), 10 ether);
        assertEq(usdc.balanceOf(maker), 0);
        assertEq(weth.balanceOf(address(resolver)), 1 ether);
        assertEq(usdc.balanceOf(address(resolver)), 1000 * 10 ** 6);

        // Simulate being on source chain (Sepolia)
        vm.chainId(SRC_CHAIN_ID);

        // Execute order through resolver
        vm.startPrank(resolver_owner);
        resolver.executeOrder(
            order,
            signature,
            order.makingAmount,
            order.takingAmount
        );
        vm.stopPrank();

        // Verify WETH was transferred from maker to resolver
        assertEq(
            weth.balanceOf(maker),
            10 ether - MAKING_AMOUNT,
            "WETH not transferred from maker"
        );
        assertEq(
            weth.balanceOf(address(resolver)),
            1 ether + MAKING_AMOUNT,
            "WETH not received by resolver"
        );

        // Now let's test the cross-chain escrow functionality

        // Create a secret for HTLC
        bytes32 secret = keccak256("test_secret");
        bytes32 secretHash = keccak256(abi.encodePacked(secret));
        uint256 timelock = block.timestamp + 1 hours;

        // Deploy escrows through resolver
        vm.startPrank(resolver_owner);
        (address srcEscrowAddr, address dstEscrowAddr) = resolver.deployEscrows(
            orderHash,
            address(weth),
            address(usdc),
            MAKING_AMOUNT,
            TAKING_AMOUNT,
            secretHash,
            timelock,
            maker
        );
        vm.stopPrank();

        SimpleEscrowSrc srcEscrow = SimpleEscrowSrc(srcEscrowAddr);
        SimpleEscrowDst dstEscrow = SimpleEscrowDst(dstEscrowAddr);

        // Fund escrows
        vm.startPrank(address(resolver));
        weth.transfer(srcEscrowAddr, MAKING_AMOUNT);
        usdc.transfer(dstEscrowAddr, TAKING_AMOUNT);
        vm.stopPrank();

        // Verify escrow balances
        assertEq(
            weth.balanceOf(srcEscrowAddr),
            MAKING_AMOUNT,
            "WETH not transferred to source escrow"
        );
        assertEq(
            usdc.balanceOf(dstEscrowAddr),
            TAKING_AMOUNT,
            "USDC not transferred to destination escrow"
        );

        // Simulate user claiming from destination escrow (revealing secret)
        vm.startPrank(maker);
        dstEscrow.withdraw(secret);
        vm.stopPrank();

        // Verify USDC was transferred to maker
        assertEq(
            usdc.balanceOf(maker),
            TAKING_AMOUNT,
            "USDC not transferred to maker"
        );

        // Simulate resolver claiming from source escrow (using the now-revealed secret)
        vm.startPrank(resolver_owner);
        srcEscrow.withdraw(secret);
        vm.stopPrank();

        // Verify WETH was transferred back to resolver
        assertEq(
            weth.balanceOf(address(resolver)),
            1 ether + MAKING_AMOUNT,
            "WETH not claimed by resolver"
        );
        assertEq(
            weth.balanceOf(srcEscrowAddr),
            0,
            "WETH not drained from source escrow"
        );
    }

    function testDirectFillReverts() public {
        // Create order
        SimpleLimitOrderProtocol.Order memory order = SimpleLimitOrderProtocol
            .Order({
                salt: ORDER_SALT,
                makerAsset: address(weth),
                takerAsset: address(usdc),
                maker: maker,
                receiver: maker,
                allowedSender: address(0),
                makingAmount: MAKING_AMOUNT,
                takingAmount: TAKING_AMOUNT,
                offsets: 0,
                interactions: ""
            });

        // Sign order - we need to use the correct EIP-712 domain
        bytes32 orderHash = limitOrderProtocol.hashOrder(order);

        // Create EIP-712 domain separator for the current chain
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256("1inch Limit Order Protocol"),
                keccak256("4"),
                block.chainid,
                address(limitOrderProtocol)
            )
        );

        // Create the digest for signing
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                domainSeparator,
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
                )
            )
        );

        // Sign the digest with the maker's private key
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(uint256(1), digest); // Maker's private key is 1
        bytes memory signature = abi.encodePacked(r, s, v);

        // Try to fill order directly from resolver (should revert)
        vm.startPrank(address(resolver));
        vm.expectRevert(); // Should revert because cross-chain orders must go through executeOrder
        limitOrderProtocol.fillOrder(
            order,
            signature,
            order.makingAmount,
            order.takingAmount
        );
        vm.stopPrank();
    }
}

// Mock ERC20 token for testing
contract ERC20Mock {
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(
        address indexed owner,
        address indexed spender,
        uint256 value
    );

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }

    function mint(address to, uint256 amount) public {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function transfer(address to, uint256 amount) public returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) public returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) public returns (bool) {
        require(balanceOf[from] >= amount, "Insufficient balance");
        require(
            allowance[from][msg.sender] >= amount,
            "Insufficient allowance"
        );

        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;

        emit Transfer(from, to, amount);
        return true;
    }
}
