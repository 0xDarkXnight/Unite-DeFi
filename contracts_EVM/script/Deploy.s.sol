// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import "forge-std/Script.sol";
import "../src/SimpleLimitOrderProtocol.sol";
import "../src/SimpleDutchAuctionCalculator.sol";
import "../src/SimpleEscrowFactory.sol";
import "../src/SimpleResolver.sol";

contract Deploy is Script {
    function run() external {
        // Get private key from environment
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        console.log("Deploying contracts with address:", deployer);
        console.log("Deployer balance:", deployer.balance);

        // Start broadcasting transactions
        vm.startBroadcast(deployerPrivateKey);

        // Deploy SimpleLimitOrderProtocol
        console.log("Deploying SimpleLimitOrderProtocol...");
        SimpleLimitOrderProtocol limitOrderProtocol = new SimpleLimitOrderProtocol();
        console.log(
            "SimpleLimitOrderProtocol deployed at:",
            address(limitOrderProtocol)
        );

        // Deploy SimpleDutchAuctionCalculator
        console.log("Deploying SimpleDutchAuctionCalculator...");
        SimpleDutchAuctionCalculator dutchAuctionCalculator = new SimpleDutchAuctionCalculator();
        console.log(
            "SimpleDutchAuctionCalculator deployed at:",
            address(dutchAuctionCalculator)
        );

        // Deploy SimpleEscrowFactory
        console.log("Deploying SimpleEscrowFactory...");
        SimpleEscrowFactory escrowFactory = new SimpleEscrowFactory();
        console.log("SimpleEscrowFactory deployed at:", address(escrowFactory));

        // Deploy SimpleResolver
        console.log("Deploying SimpleResolver...");
        SimpleResolver resolver = new SimpleResolver(
            address(limitOrderProtocol),
            address(escrowFactory)
        );
        console.log("SimpleResolver deployed at:", address(resolver));

        vm.stopBroadcast();

        // Log deployment summary
        console.log("\n=== DEPLOYMENT SUCCESSFUL ===");
        console.log("Network: Sepolia");
        console.log("Deployer:", deployer);
        console.log("SimpleLimitOrderProtocol:", address(limitOrderProtocol));
        console.log(
            "SimpleDutchAuctionCalculator:",
            address(dutchAuctionCalculator)
        );
        console.log("SimpleEscrowFactory:", address(escrowFactory));
        console.log("SimpleResolver:", address(resolver));
        console.log("===============================\n");

        // Write deployment addresses (with proper permissions now)
        try
            vm.writeFile(
                "./deployed-addresses.env",
                string(
                    abi.encodePacked(
                        "SEPOLIA_LIMIT_ORDER_PROTOCOL=",
                        vm.toString(address(limitOrderProtocol)),
                        "\n",
                        "SEPOLIA_DUTCH_AUCTION_CALCULATOR=",
                        vm.toString(address(dutchAuctionCalculator)),
                        "\n",
                        "SEPOLIA_ESCROW_FACTORY=",
                        vm.toString(address(escrowFactory)),
                        "\n",
                        "SEPOLIA_RESOLVER=",
                        vm.toString(address(resolver)),
                        "\n"
                    )
                )
            )
        {
            console.log("Deployed addresses saved to deployed-addresses.env");
        } catch {
            console.log(
                "Could not write to file, but deployment was successful!"
            );
            console.log("Copy these addresses manually:");
            console.log(
                "SEPOLIA_LIMIT_ORDER_PROTOCOL=%s",
                vm.toString(address(limitOrderProtocol))
            );
            console.log(
                "SEPOLIA_DUTCH_AUCTION_CALCULATOR=%s",
                vm.toString(address(dutchAuctionCalculator))
            );
            console.log(
                "SEPOLIA_ESCROW_FACTORY=%s",
                vm.toString(address(escrowFactory))
            );
            console.log("SEPOLIA_RESOLVER=%s", vm.toString(address(resolver)));
        }
    }
}
