const { ethers } = require('ethers');

const ERC20_ABI = [
  "function transfer(address,uint256) external returns (bool)",
  "function approve(address,uint256) external returns (bool)",
  "function balanceOf(address) external view returns (uint256)",
  "function allowance(address,address) external view returns (uint256)"
];

async function fundEscrows() {
  // Contract addresses
  const WETH = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";
  const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
  const RESOLVER = "0xE58d34F1c02CfFFE4736E6883629a95444dD87Bc";
  const SRC_ESCROW = "0xf9A9cB80330041B457364A46Dd7af5D725259E60";
  const DST_ESCROW = "0x9B52d55Cd1C1A02C798E40dDa7628263072bfE45";

  // Connect provider
  const provider = new ethers.JsonRpcProvider("https://eth-sepolia.g.alchemy.com/v2/d40IDFW5NaYldNIOSb_vuJBNF5sm1WR7");

  // Connect wallets
  const makerWallet = new ethers.Wallet("e6d18c7a6b6eec061b8ca09b533e71a3f0dedecd5b33a8d8ad20d2c2a408774c", provider);
  const botWallet = new ethers.Wallet("0xb92a8c71a5b044a7f52b5aa2dd68a32bf4be0c3c9ebf462b10db7d6ba1cb5ecb", provider);

  // Contract instances
  const weth = new ethers.Contract(WETH, ERC20_ABI, provider);
  const usdc = new ethers.Contract(USDC, ERC20_ABI, provider);

  console.log("=== Funding Escrows ===");

  // 1. Fund Source Escrow with WETH from Maker
  console.log("\n1. Funding Source Escrow with WETH");
  const wethAmount = ethers.parseEther("0.001"); // 1000000000000000 wei
  const wethWithMaker = weth.connect(makerWallet);
  
  console.log(`Transferring ${ethers.formatEther(wethAmount)} WETH to ${SRC_ESCROW}`);
  const wethTx = await wethWithMaker.transfer(SRC_ESCROW, wethAmount);
  await wethTx.wait();
  console.log(`✅ WETH transferred! Tx: ${wethTx.hash}`);

  // 2. Fund Destination Escrow with USDC from Bot
  console.log("\n2. Funding Destination Escrow with USDC");
  const usdcAmount = BigInt(997); // 997 units (6 decimals)
  const usdcWithBot = usdc.connect(botWallet);
  
  console.log(`Transferring ${usdcAmount} USDC to ${DST_ESCROW}`);
  const usdcTx = await usdcWithBot.transfer(DST_ESCROW, usdcAmount);
  await usdcTx.wait();
  console.log(`✅ USDC transferred! Tx: ${usdcTx.hash}`);

  // 3. Source Escrow approves Resolver for WETH
  console.log("\n3. Source Escrow approving Resolver for WETH");
  const wethAllowance = await weth.allowance(SRC_ESCROW, RESOLVER);
  console.log(`Current WETH allowance: ${ethers.formatEther(wethAllowance)}`);
  
  if (wethAllowance < wethAmount) {
    console.log("Approving WETH...");
    const wethApproveTx = await wethWithMaker.approve(RESOLVER, ethers.MaxUint256);
    await wethApproveTx.wait();
    console.log(`✅ WETH approved! Tx: ${wethApproveTx.hash}`);
  } else {
    console.log("✅ WETH already approved");
  }

  // 4. Destination Escrow approves Resolver for USDC
  console.log("\n4. Destination Escrow approving Resolver for USDC");
  const usdcAllowance = await usdc.allowance(DST_ESCROW, RESOLVER);
  console.log(`Current USDC allowance: ${usdcAllowance}`);
  
  if (usdcAllowance < usdcAmount) {
    console.log("Approving USDC...");
    const usdcApproveTx = await usdcWithBot.approve(RESOLVER, ethers.MaxUint256);
    await usdcApproveTx.wait();
    console.log(`✅ USDC approved! Tx: ${usdcApproveTx.hash}`);
  } else {
    console.log("✅ USDC already approved");
  }

  // 5. Verify final balances
  console.log("\n=== Final Balances ===");
  const srcWETH = await weth.balanceOf(SRC_ESCROW);
  const dstUSDC = await usdc.balanceOf(DST_ESCROW);
  console.log(`Source Escrow WETH: ${ethers.formatEther(srcWETH)}`);
  console.log(`Destination Escrow USDC: ${ethers.formatUnits(dstUSDC, 6)}`);
}

fundEscrows().catch(console.error);