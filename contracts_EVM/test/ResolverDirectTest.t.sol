// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Test.sol";
import "../src/TemporaryFundStorage.sol";
import "../src/SimpleResolver.sol";
import "../src/SimpleLimitOrderProtocol.sol";
import "../src/SimpleEscrowFactory.sol";

/**
 * @title ResolverDirectTest
 * @notice Test direct interaction between Resolver and Limit Order Protocol
 */
contract ResolverDirectTest is Test {
    // Mock tokens
    ERC20Mock weth;
    ERC20Mock usdc;

    // Protocol contracts
    SimpleLimitOrderProtocol limitOrderProtocol;
    SimpleEscrowFactory escrowFactory;
    SimpleResolver resolver;

    // Users
    address maker = address(0x1);
    address taker = address(0x2);
    address resolver_owner = address(0x3);

    // Order parameters
    uint256 constant MAKING_AMOUNT = 1e15; // 0.001 WETH
    uint256 constant TAKING_AMOUNT = 997; // 0.000997 USDC

    function setUp() public {
        // Create mock tokens
        weth = new ERC20Mock("Wrapped Ether", "WETH", 18);
        usdc = new ERC20Mock("USD Coin", "USDC", 6);

        // Deploy protocol contracts
        address tempStorage = address(new TemporaryFundStorage());
        limitOrderProtocol = new SimpleLimitOrderProtocol(tempStorage);
        escrowFactory = new SimpleEscrowFactory();

        // Deploy resolver with owner
        vm.startPrank(resolver_owner);
        resolver = new SimpleResolver(
            address(limitOrderProtocol),
            address(escrowFactory)
        );
        vm.stopPrank();

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

    function testDirectCallToLimitOrderProtocol() public {
        // Create a simple order
        SimpleLimitOrderProtocol.Order memory order = SimpleLimitOrderProtocol
            .Order({
                salt: uint256(keccak256(abi.encodePacked("test_salt"))),
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

        // Sign the order
        bytes32 orderHash = limitOrderProtocol.hashOrder(order);

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

        bytes32 typedDataHash = keccak256(
            abi.encode(
                keccak256(
                    "Order(uint256 salt,address makerAsset,address takerAsset,address maker,address receiver,address allowedSender,uint256 makingAmount,uint256 takingAmount,uint256 offsets,bytes interactions)"
                ),
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

        bytes32 digest = keccak256(
            abi.encodePacked("\x19\x01", domainSeparator, typedDataHash)
        );

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(1, digest); // Maker's private key is 1
        bytes memory signature = abi.encodePacked(r, s, v);

        // Initial balances
        uint256 makerWethBefore = weth.balanceOf(maker);
        uint256 makerUsdcBefore = usdc.balanceOf(maker);
        uint256 resolverWethBefore = weth.balanceOf(address(resolver));
        uint256 resolverUsdcBefore = usdc.balanceOf(address(resolver));

        // Execute order through resolver
        vm.startPrank(resolver_owner);
        resolver.executeOrder(
            order,
            signature,
            order.makingAmount,
            order.takingAmount
        );
        vm.stopPrank();

        // Final balances
        uint256 makerWethAfter = weth.balanceOf(maker);
        uint256 makerUsdcAfter = usdc.balanceOf(maker);
        uint256 resolverWethAfter = weth.balanceOf(address(resolver));
        uint256 resolverUsdcAfter = usdc.balanceOf(address(resolver));

        // Verify token transfers
        assertEq(
            makerWethBefore - makerWethAfter,
            MAKING_AMOUNT,
            "Maker didn't send WETH"
        );
        assertEq(
            makerUsdcAfter - makerUsdcBefore,
            TAKING_AMOUNT,
            "Maker didn't receive USDC"
        );
        assertEq(
            resolverWethAfter - resolverWethBefore,
            MAKING_AMOUNT,
            "Resolver didn't receive WETH"
        );
        assertEq(
            resolverUsdcBefore - resolverUsdcAfter,
            TAKING_AMOUNT,
            "Resolver didn't send USDC"
        );
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
