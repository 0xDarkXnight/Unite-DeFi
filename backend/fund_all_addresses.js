const { ethers } = require('ethers');

const ERC20_ABI = [
  "function transfer(address,uint256) external returns (bool)",
  "function balanceOf(address) external view returns (uint256)"
];

async function fundAllAddresses() {
  // Addresses to fund
  const addresses = [
    {
      name: "Maker",
      address: "0x6a511b93F684fA6b98859681d27DB90209f44a84"
    },
    {
      name: "Bot",
      address: "0x888dc43F8aF62eafb2B542e309B836CA9683E410"
    },
    {
      name: "Source Escrow",
      address: "0x17d29DA6EE88C33717daE2c1D63F2cEEBbc72C98"
    },
    {
      name: "Destination Escrow",
      address: "0x0CeaA1988a2f5c0310D1a0fBBd543EDfBAE34cC5"
    }
  ];

  // Token addresses
  const WETH = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";
  const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
  
  // Connect provider
  const provider = new ethers.JsonRpcProvider("https://eth-sepolia.g.alchemy.com/v2/d40IDFW5NaYldNIOSb_vuJBNF5sm1WR7");
  
  // Connect wallets
  const makerWallet = new ethers.Wallet("e6d18c7a6b6eec061b8ca09b533e71a3f0dedecd5b33a8d8ad20d2c2a408774c", provider);
  const botWallet = new ethers.Wallet("0xb92a8c71a5b044a7f52b5aa2dd68a32bf4be0c3c9ebf462b10db7d6ba1cb5ecb", provider);
  
  // Contract instances
  const weth = new ethers.Contract(WETH, ERC20_ABI, provider);
  const usdc = new ethers.Contract(USDC, ERC20_ABI, provider);
  
  console.log("=== Funding All Addresses ===\n");
  
  // Check current balances
  console.log("=== CURRENT BALANCES ===");
  for (const addr of addresses) {
    const ethBalance = await provider.getBalance(addr.address);
    const wethBalance = await weth.balanceOf(addr.address);
    const usdcBalance = await usdc.balanceOf(addr.address);
    
    console.log(`${addr.name} (${addr.address}):`);
    console.log(`  ETH: ${ethers.formatEther(ethBalance)} ETH`);
    console.log(`  WETH: ${ethers.formatEther(wethBalance)} WETH`);
    console.log(`  USDC: ${ethers.formatUnits(usdcBalance, 6)} USDC`);
    console.log();
  }
  
  // Fund with ETH
  console.log("\n=== FUNDING WITH ETH ===");
  const ethAmount = ethers.parseEther("0.01"); // 0.01 ETH
  
  for (const addr of addresses) {
    if (addr.address !== makerWallet.address && addr.address !== botWallet.address) {
      console.log(`Sending ${ethers.formatEther(ethAmount)} ETH to ${addr.name}...`);
      
      // Send ETH from both wallets to ensure at least one succeeds
      try {
        const tx = await makerWallet.sendTransaction({
          to: addr.address,
          value: ethAmount
        });
        await tx.wait();
        console.log(`✅ Sent from Maker! Tx: ${tx.hash}`);
      } catch (error) {
        console.log(`❌ Failed from Maker: ${error.message}`);
        
        try {
          const tx = await botWallet.sendTransaction({
            to: addr.address,
            value: ethAmount
          });
          await tx.wait();
          console.log(`✅ Sent from Bot! Tx: ${tx.hash}`);
        } catch (error) {
          console.log(`❌ Failed from Bot: ${error.message}`);
        }
      }
    }
  }
  
  // Fund with WETH
  console.log("\n=== FUNDING WITH WETH ===");
  const wethAmount = ethers.parseEther("0.01"); // 0.01 WETH
  const wethWithMaker = weth.connect(makerWallet);
  
  for (const addr of addresses) {
    if (addr.address !== makerWallet.address) {
      console.log(`Sending ${ethers.formatEther(wethAmount)} WETH to ${addr.name}...`);
      
      try {
        const tx = await wethWithMaker.transfer(addr.address, wethAmount);
        await tx.wait();
        console.log(`✅ Sent! Tx: ${tx.hash}`);
      } catch (error) {
        console.log(`❌ Failed: ${error.message}`);
      }
    }
  }
  
  // Fund with USDC
  console.log("\n=== FUNDING WITH USDC ===");
  const usdcAmount = 1000000; // 1 USDC (6 decimals)
  const usdcWithBot = usdc.connect(botWallet);
  
  for (const addr of addresses) {
    if (addr.address !== botWallet.address) {
      console.log(`Sending ${ethers.formatUnits(usdcAmount, 6)} USDC to ${addr.name}...`);
      
      try {
        const tx = await usdcWithBot.transfer(addr.address, usdcAmount);
        await tx.wait();
        console.log(`✅ Sent! Tx: ${tx.hash}`);
      } catch (error) {
        console.log(`❌ Failed: ${error.message}`);
      }
    }
  }
  
  // Check final balances
  console.log("\n=== FINAL BALANCES ===");
  for (const addr of addresses) {
    const ethBalance = await provider.getBalance(addr.address);
    const wethBalance = await weth.balanceOf(addr.address);
    const usdcBalance = await usdc.balanceOf(addr.address);
    
    console.log(`${addr.name} (${addr.address}):`);
    console.log(`  ETH: ${ethers.formatEther(ethBalance)} ETH`);
    console.log(`  WETH: ${ethers.formatEther(wethBalance)} WETH`);
    console.log(`  USDC: ${ethers.formatUnits(usdcBalance, 6)} USDC`);
    console.log();
  }
}

fundAllAddresses().catch(console.error);