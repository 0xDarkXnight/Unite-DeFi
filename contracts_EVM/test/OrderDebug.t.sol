// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Test.sol";
import "../src/TemporaryFundStorage.sol";
import "../src/SimpleLimitOrderProtocol.sol";
import "../src/SimpleResolver.sol";
import "../src/SimpleEscrowFactory.sol";

contract OrderDebugTest is Test {
    SimpleLimitOrderProtocol public limitOrderProtocol;
    SimpleEscrowFactory public escrowFactory;
    SimpleResolver public resolver;

    // Addresses from logs
    address public maker = address(0x6a511b93F684fA6b98859681d27DB90209f44a84);
    address public resolver_address =
        address(0x888dc43F8aF62eafb2B542e309B836CA9683E410);

    // Token addresses from logs
    address public wethToken =
        address(0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14);
    address public usdcToken =
        address(0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238);

    // Order parameters from logs
    uint256 public salt =
        36692554257037446852878762233773761141311344245443802327139933132605657038521;
    uint256 public makingAmount = 10000000000000000; // 0.01 ETH
    uint256 public takingAmount = 9970; // USDC amount

    // Signature components from logs
    bytes32 public r =
        0x95a8fa63f3364843f98a9a548aa8c8793a8b750003a4d911a5866f57c398d210;
    bytes32 public vs =
        0x56f820248bda8060788a8c1655767af70ee5c080e7f171e3996c02c1ad9309a7;

    // Private key for testing (this is a test key, not the actual maker's key)
    uint256 private testPrivateKey =
        0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    address private testSigner;

    function setUp() public {
        // Get test signer address
        testSigner = vm.addr(testPrivateKey);

        // Deploy contracts
        address tempStorage = address(new TemporaryFundStorage());
        limitOrderProtocol = new SimpleLimitOrderProtocol(tempStorage);
        escrowFactory = new SimpleEscrowFactory();
        resolver = new SimpleResolver(
            address(limitOrderProtocol),
            address(escrowFactory)
        );

        // Transfer ownership to resolver address
        resolver.transferOwnership(resolver_address);

        // Setup token mocks
        vm.label(wethToken, "WETH");
        vm.label(usdcToken, "USDC");
        vm.label(maker, "Maker");
        vm.label(resolver_address, "Resolver");
        vm.label(testSigner, "TestSigner");

        // Create mock tokens
        vm.etch(
            wethToken,
            address(new MockERC20("Wrapped ETH", "WETH", 18)).code
        );
        vm.etch(usdcToken, address(new MockERC20("USD Coin", "USDC", 6)).code);

        // Mock token balances
        deal(wethToken, maker, 1 ether);
        deal(usdcToken, resolver_address, 1000000); // 1000 USDC with 6 decimals

        // Mock approvals
        vm.prank(maker);
        MockERC20(wethToken).approve(
            address(limitOrderProtocol),
            type(uint256).max
        );

        vm.prank(resolver_address);
        MockERC20(usdcToken).approve(
            address(limitOrderProtocol),
            type(uint256).max
        );
    }

    function testOrderExecution() public {
        // Create the exact order from logs
        SimpleLimitOrderProtocol.Order memory order = SimpleLimitOrderProtocol
            .Order({
                salt: salt,
                makerAsset: wethToken,
                takerAsset: usdcToken,
                maker: maker,
                receiver: maker,
                allowedSender: address(0),
                makingAmount: makingAmount,
                takingAmount: takingAmount,
                offsets: 0,
                interactions: ""
            });

        // Combine r and vs into a signature
        bytes memory signature = abi.encodePacked(r, vs);

        console.log("Order details:");
        console.log("  Salt:", salt);
        console.log("  Maker Asset (WETH):", address(wethToken));
        console.log("  Taker Asset (USDC):", address(usdcToken));
        console.log("  Maker:", maker);
        console.log("  Making Amount:", makingAmount);
        console.log("  Taking Amount:", takingAmount);

        console.log("Signature details:");
        console.log("  Signature length:", signature.length);
        console.log("  r:", uint256(r));
        console.log("  vs:", uint256(vs));

        // Calculate order hash for verification
        bytes32 orderHash = limitOrderProtocol.hashOrder(order);
        console.log("Order hash:", uint256(orderHash));

        // Try to execute the order through the resolver
        vm.startPrank(resolver_address);
        try
            resolver.executeOrder(order, signature, makingAmount, takingAmount)
        {
            console.log("Order execution succeeded!");
        } catch Error(string memory reason) {
            console.log("Order execution failed with reason:", reason);
        } catch (bytes memory lowLevelData) {
            console.log("Order execution failed with low-level error");
            console.logBytes(lowLevelData);
        }
        vm.stopPrank();
    }

    function testSignatureValidation() public {
        // Create the exact order from logs
        SimpleLimitOrderProtocol.Order memory order = SimpleLimitOrderProtocol
            .Order({
                salt: salt,
                makerAsset: wethToken,
                takerAsset: usdcToken,
                maker: maker,
                receiver: maker,
                allowedSender: address(0),
                makingAmount: makingAmount,
                takingAmount: takingAmount,
                offsets: 0,
                interactions: ""
            });

        // Calculate the EIP-712 domain separator
        bytes32 DOMAIN_SEPARATOR = keccak256(
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

        // Calculate order hash
        bytes32 orderHash = limitOrderProtocol.hashOrder(order);

        // Calculate the typed data hash
        bytes32 typedDataHash = keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, orderHash)
        );

        // Extract v from vs (last byte)
        bytes32 s = vs &
            bytes32(
                0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff00
            );
        uint8 v = uint8(uint256(vs) & 0xff);

        // Recover signer
        address recoveredSigner = ecrecover(typedDataHash, v, r, s);

        console.log("Expected signer:", maker);
        console.log("Recovered signer:", recoveredSigner);
        console.log("Signature valid:", recoveredSigner == maker);

        // Try another approach - combine r and vs directly
        bytes memory signature = abi.encodePacked(r, vs);

        // Use the contract's verification
        vm.startPrank(resolver_address);
        try
            limitOrderProtocol.fillOrder(
                order,
                signature,
                makingAmount,
                takingAmount
            )
        {
            console.log("Signature verification passed!");
        } catch Error(string memory reason) {
            console.log("Signature verification failed with reason:", reason);
        } catch (bytes memory lowLevelData) {
            console.log("Signature verification failed with low-level error");
            console.logBytes(lowLevelData);
        }
        vm.stopPrank();
    }

    function testWithValidSignature() public {
        // Create an order with our test signer
        SimpleLimitOrderProtocol.Order memory order = SimpleLimitOrderProtocol
            .Order({
                salt: 12345,
                makerAsset: wethToken,
                takerAsset: usdcToken,
                maker: testSigner,
                receiver: testSigner,
                allowedSender: address(0),
                makingAmount: 1e16,
                takingAmount: 10000,
                offsets: 0,
                interactions: ""
            });

        // Calculate the EIP-712 domain separator
        bytes32 DOMAIN_SEPARATOR = keccak256(
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

        // Calculate order hash
        bytes32 orderHash = limitOrderProtocol.hashOrder(order);
        console.log("Test order hash:", uint256(orderHash));

        // Calculate the typed data hash
        bytes32 typedDataHash = keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, orderHash)
        );

        // Sign the order with our test private key
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            testPrivateKey,
            typedDataHash
        );

        console.log("Test signature components:");
        console.log("  v:", v);
        console.log("  r:", uint256(r));
        console.log("  s:", uint256(s));

        // Create signature in the format the contract expects
        bytes memory signature = abi.encodePacked(r, s, v);

        console.log("Test signature length:", signature.length);

        // Give test signer some WETH
        deal(wethToken, testSigner, 1 ether);

        // Approve WETH spending
        vm.prank(testSigner);
        MockERC20(wethToken).approve(
            address(limitOrderProtocol),
            type(uint256).max
        );

        // Give resolver some USDC
        deal(usdcToken, resolver_address, 1000000);

        // Approve USDC spending
        vm.prank(resolver_address);
        MockERC20(usdcToken).approve(
            address(limitOrderProtocol),
            type(uint256).max
        );

        // Try to fill the order with a valid signature
        vm.startPrank(resolver_address);
        try limitOrderProtocol.fillOrder(order, signature, 1e16, 10000) {
            console.log("Valid signature order fill succeeded!");
        } catch Error(string memory reason) {
            console.log(
                "Valid signature order fill failed with reason:",
                reason
            );
        } catch (bytes memory lowLevelData) {
            console.log(
                "Valid signature order fill failed with low-level error"
            );
            console.logBytes(lowLevelData);
        }
        vm.stopPrank();
    }

    function testSignatureFormat() public {
        // Test different signature formats to see what the contract expects

        // Create an order with our test signer
        SimpleLimitOrderProtocol.Order memory order = SimpleLimitOrderProtocol
            .Order({
                salt: 12345,
                makerAsset: wethToken,
                takerAsset: usdcToken,
                maker: testSigner,
                receiver: testSigner,
                allowedSender: address(0),
                makingAmount: 1e16,
                takingAmount: 10000,
                offsets: 0,
                interactions: ""
            });

        // Calculate the EIP-712 domain separator
        bytes32 DOMAIN_SEPARATOR = keccak256(
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

        // Calculate order hash
        bytes32 orderHash = limitOrderProtocol.hashOrder(order);

        // Calculate the typed data hash
        bytes32 typedDataHash = keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, orderHash)
        );

        // Sign the order with our test private key
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            testPrivateKey,
            typedDataHash
        );

        console.log("Signature components for test:");
        console.log("  v:", v);
        console.log("  r:", uint256(r));
        console.log("  s:", uint256(s));

        // Setup for testing
        deal(wethToken, testSigner, 1 ether);
        vm.prank(testSigner);
        MockERC20(wethToken).approve(
            address(limitOrderProtocol),
            type(uint256).max
        );

        deal(usdcToken, resolver_address, 1000000);
        vm.prank(resolver_address);
        MockERC20(usdcToken).approve(
            address(limitOrderProtocol),
            type(uint256).max
        );

        // Test format 1: r + s + v (65 bytes)
        bytes memory sig1 = abi.encodePacked(r, s, v);
        console.log("Format 1 (r+s+v) length:", sig1.length);

        vm.startPrank(resolver_address);
        try limitOrderProtocol.fillOrder(order, sig1, 1e16, 10000) {
            console.log("Format 1 (r+s+v) succeeded!");
        } catch Error(string memory reason) {
            console.log("Format 1 failed with reason:", reason);
        } catch (bytes memory lowLevelData) {
            console.log("Format 1 failed with low-level error");
            console.logBytes(lowLevelData);
        }
        vm.stopPrank();

        // Test format 2: v + r + s (65 bytes)
        bytes memory sig2 = abi.encodePacked(v, r, s);
        console.log("Format 2 (v+r+s) length:", sig2.length);

        vm.startPrank(resolver_address);
        try limitOrderProtocol.fillOrder(order, sig2, 1e16, 10000) {
            console.log("Format 2 (v+r+s) succeeded!");
        } catch Error(string memory reason) {
            console.log("Format 2 failed with reason:", reason);
        } catch (bytes memory lowLevelData) {
            console.log("Format 2 failed with low-level error");
            console.logBytes(lowLevelData);
        }
        vm.stopPrank();

        // Test format 3: r + vs (vs = s + v) (64 bytes)
        // This is the 1inch compact format
        bytes32 vs_compact = s | bytes32(uint256(v) << 255);
        bytes memory sig3 = abi.encodePacked(r, vs_compact);
        console.log("Format 3 (r+vs compact) length:", sig3.length);

        vm.startPrank(resolver_address);
        try limitOrderProtocol.fillOrder(order, sig3, 1e16, 10000) {
            console.log("Format 3 (r+vs compact) succeeded!");
        } catch Error(string memory reason) {
            console.log("Format 3 failed with reason:", reason);
        } catch (bytes memory lowLevelData) {
            console.log("Format 3 failed with low-level error");
            console.logBytes(lowLevelData);
        }
        vm.stopPrank();
    }
}

// Simple mock for ERC20 tokens
contract MockERC20 {
    string public name;
    string public symbol;
    uint8 public decimals;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
    }

    function approve(address spender, uint256 amount) public returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) public returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
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

        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        allowance[from][msg.sender] -= amount;

        return true;
    }
}
