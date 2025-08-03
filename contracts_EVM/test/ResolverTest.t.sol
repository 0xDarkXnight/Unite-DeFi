// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Test.sol";
import "../src/TemporaryFundStorage.sol";
import "../src/SimpleLimitOrderProtocol.sol";
import "../src/SimpleResolver.sol";
import "../src/SimpleEscrowFactory.sol";

contract ResolverTest is Test {
    SimpleLimitOrderProtocol public limitOrderProtocol;
    SimpleEscrowFactory public escrowFactory;
    SimpleResolver public resolver;

    address public maker = address(0x6a511b93F684fA6b98859681d27DB90209f44a84);
    address public taker = address(0x888dc43F8aF62eafb2B542e309B836CA9683E410);

    // Private key for the maker address
    uint256 public makerPrivateKey =
        0xe6d18c7a6b6eec061b8ca09b533e71a3f0dedecd5b33a8d8ad20d2c2a408774c;

    function setUp() public {
        // Deploy contracts
        address tempStorage = address(new TemporaryFundStorage());
        limitOrderProtocol = new SimpleLimitOrderProtocol(tempStorage);
        escrowFactory = new SimpleEscrowFactory();
        resolver = new SimpleResolver(
            address(limitOrderProtocol),
            address(escrowFactory)
        );

        // Transfer ownership to taker
        resolver.transferOwnership(taker);
    }

    function testExecuteOrder() public {
        // Create a simple order
        SimpleLimitOrderProtocol.Order memory order = SimpleLimitOrderProtocol
            .Order({
                salt: 1234567890123456789012345678901234567890123456789012345678901234,
                makerAsset: address(0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14),
                takerAsset: address(0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14),
                maker: maker,
                receiver: address(0),
                allowedSender: address(0),
                makingAmount: 1000000000000000,
                takingAmount: 997000000000000,
                offsets: 0,
                interactions: ""
            });

        // Create a proper signature using the private key
        bytes32 orderHash = limitOrderProtocol.hashOrder(order);

        // Calculate the EIP-712 domain separator manually
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

        bytes32 typedDataHash = keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, orderHash)
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(
            makerPrivateKey,
            typedDataHash
        );

        // Convert to signature format
        bytes memory signature = abi.encodePacked(r, s, v);

        console.log("Order hash:", uint256(orderHash));
        console.log("Signature length:", signature.length);
        console.log("v:", v);
        console.log("r:", uint256(r));
        console.log("s:", uint256(s));

        // Try to execute the order
        vm.prank(taker);
        resolver.executeOrder(
            order,
            signature,
            1000000000000000,
            997000000000000
        );
    }

    function testOrderHash() public {
        // Test the order hash calculation
        SimpleLimitOrderProtocol.Order memory order = SimpleLimitOrderProtocol
            .Order({
                salt: 1234567890123456789012345678901234567890123456789012345678901234,
                makerAsset: address(0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14),
                takerAsset: address(0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14),
                maker: maker,
                receiver: address(0),
                allowedSender: address(0),
                makingAmount: 1000000000000000,
                takingAmount: 997000000000000,
                offsets: 0,
                interactions: ""
            });

        bytes32 orderHash = limitOrderProtocol.hashOrder(order);
        console.log("Order hash:", uint256(orderHash));
    }
}
