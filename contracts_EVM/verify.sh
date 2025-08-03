#!/bin/bash

# Contract addresses (updated with correct deployed addresses)
TEMPORARY_STORAGE="0x0B6D20cbb01f9210Ace02b15624a270FCDb3B7da"
LOP="0x584c43954CfbA4C0Cb00eECE36d1dcc249ae2dfD"
CALCULATOR="0xD3a6B3208Dc612A9EbE6fC64Ef6ec4Dafb082949"
FACTORY="0x2B3E10432b92dBe80B944A74116ada25bF9c02EE"
RESOLVER="0xE58d34F1c02CfFFE4736E6883629a95444dD87Bc"

echo "🔍 Verifying TemporaryFundStorage..."
forge verify-contract $TEMPORARY_STORAGE src/TemporaryFundStorage.sol:TemporaryFundStorage --chain-id 11155111 --watch

echo "🔍 Verifying SimpleLimitOrderProtocol..."
forge verify-contract $LOP src/SimpleLimitOrderProtocol.sol:SimpleLimitOrderProtocol --chain-id 11155111 --constructor-args $(cast abi-encode "constructor(address)" $TEMPORARY_STORAGE) --watch

echo "🔍 Verifying SimpleDutchAuctionCalculator..."
forge verify-contract $CALCULATOR src/SimpleDutchAuctionCalculator.sol:SimpleDutchAuctionCalculator --chain-id 11155111 --watch

echo "🔍 Verifying SimpleEscrowFactory..."
forge verify-contract $FACTORY src/SimpleEscrowFactory.sol:SimpleEscrowFactory --chain-id 11155111 --watch

echo "🔍 Verifying SimpleResolver..."
forge verify-contract $RESOLVER src/SimpleResolver.sol:SimpleResolver --chain-id 11155111 --constructor-args $(cast abi-encode "constructor(address,address)" $LOP $FACTORY) --watch