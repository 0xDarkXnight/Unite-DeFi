const hre = require("hardhat");
const fs = require('fs');
const path = require('path');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // Deploy SimpleLimitOrderProtocol
  const SimpleLimitOrderProtocol = await hre.ethers.getContractFactory("SimpleLimitOrderProtocol");
  const limitOrderProtocol = await SimpleLimitOrderProtocol.deploy();
  await limitOrderProtocol.waitForDeployment();
  console.log("SimpleLimitOrderProtocol deployed to:", await limitOrderProtocol.getAddress());

  // Deploy SimpleDutchAuctionCalculator
  const SimpleDutchAuctionCalculator = await hre.ethers.getContractFactory("SimpleDutchAuctionCalculator");
  const dutchAuctionCalculator = await SimpleDutchAuctionCalculator.deploy();
  await dutchAuctionCalculator.waitForDeployment();
  console.log("SimpleDutchAuctionCalculator deployed to:", await dutchAuctionCalculator.getAddress());

  // Deploy SimpleEscrowFactory
  const SimpleEscrowFactory = await hre.ethers.getContractFactory("SimpleEscrowFactory");
  const escrowFactory = await SimpleEscrowFactory.deploy();
  await escrowFactory.waitForDeployment();
  console.log("SimpleEscrowFactory deployed to:", await escrowFactory.getAddress());

  // Deploy SimpleResolver
  const SimpleResolver = await hre.ethers.getContractFactory("SimpleResolver");
  const resolver = await SimpleResolver.deploy(
    await limitOrderProtocol.getAddress(),
    await escrowFactory.getAddress()
  );
  await resolver.waitForDeployment();
  console.log("SimpleResolver deployed to:", await resolver.getAddress());

  // Save deployment addresses
  const deploymentInfo = `SEPOLIA_LIMIT_ORDER_PROTOCOL=${await limitOrderProtocol.getAddress()}
SEPOLIA_DUTCH_AUCTION_CALCULATOR=${await dutchAuctionCalculator.getAddress()}
SEPOLIA_ESCROW_FACTORY=${await escrowFactory.getAddress()}
SEPOLIA_RESOLVER=${await resolver.getAddress()}
`;

  fs.writeFileSync(
    path.join(__dirname, '../deployed-addresses.env'),
    deploymentInfo
  );
  console.log("\nDeployment addresses saved to deployed-addresses.env");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });