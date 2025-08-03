// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {SimpleResolver} from "../src/SimpleResolver.sol";

contract DeployNewResolver is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        address limitOrderProtocol = 0x584c43954CfbA4C0Cb00eECE36d1dcc249ae2dfD;
        address escrowFactory = 0x2B3E10432b92dBe80B944A74116ada25bF9c02EE;

        console.log("Deploying SimpleResolver...");
        SimpleResolver resolver = new SimpleResolver(limitOrderProtocol, escrowFactory);
        console.log("SimpleResolver deployed at:", address(resolver));

        vm.stopBroadcast();
    }
}
