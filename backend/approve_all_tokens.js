const { ethers } = require('ethers');

async function main() {
  // Connect to Sepolia
  const provider = new ethers.JsonRpcProvider('https://eth-sepolia.g.alchemy.com/v2/d40IDFW5NaYldNIOSb_vuJBNF5sm1WR7');
  
  // Bot's wallet
  const botPrivateKey = 'b92a8c71a5b044a7f52b5aa2dd68a32bf4be0c3c9ebf462b10db7d6ba1cb5ecb';
  const botWallet = new ethers.Wallet(botPrivateKey, provider);
  
  // Maker's wallet
  const makerPrivateKey = 'e6d18c7a6b6eec061b8ca09b533e71a3f0dedecd5b33a8d8ad20d2c2a408774c';
  const makerWallet = new ethers.Wallet(makerPrivateKey, provider);

  // Contract addresses - UPDATED TO NEW DEPLOYED ADDRESSES
  const RESOLVER = '0xE58d34F1c02CfFFE4736E6883629a95444dD87Bc';
const LOP = '0x584c43954CfbA4C0Cb00eECE36d1dcc249ae2dfD';
  const TAKER_TOKEN = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238';
  const MAKER_TOKEN = '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14';

  // Maximum possible value (2^256 - 1)
  const MAX_UINT256 = "115792089237316195423570985008687907853269984665640564039457584007913129639935";

  // Token ABI for approvals
  const TOKEN_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function balanceOf(address owner) external view returns (uint256)"
  ];

  console.log('🔐 Starting comprehensive token approval process');
  console.log('==============================================');

  // 1. Bot approvals for TAKER_TOKEN
  console.log(`\n🤖 Bot wallet: ${botWallet.address}`);
  const takerToken = new ethers.Contract(TAKER_TOKEN, TOKEN_ABI, botWallet);
  
  console.log(`\n📊 Checking Bot's TAKER_TOKEN balance and allowances`);
  const botTakerBalance = await takerToken.balanceOf(botWallet.address);
  console.log(`Balance: ${botTakerBalance.toString()}`);
  
  // Approve TAKER_TOKEN for Resolver
  console.log(`\n🔐 Approving TAKER_TOKEN for Resolver`);
  let currentAllowance = await takerToken.allowance(botWallet.address, RESOLVER);
  console.log(`Current allowance: ${currentAllowance.toString()}`);
  
  if (currentAllowance.toString() !== MAX_UINT256) {
    console.log(`Setting maximum approval...`);
    const tx = await takerToken.approve(RESOLVER, MAX_UINT256);
    const receipt = await tx.wait();
    console.log(`✅ Approved! Tx: ${receipt.hash}`);
    
    currentAllowance = await takerToken.allowance(botWallet.address, RESOLVER);
    console.log(`New allowance: ${currentAllowance.toString()}`);
  } else {
    console.log(`✅ Already approved with maximum amount`);
  }
  
  // Approve TAKER_TOKEN for LOP
  console.log(`\n🔐 Approving TAKER_TOKEN for LOP`);
  currentAllowance = await takerToken.allowance(botWallet.address, LOP);
  console.log(`Current allowance: ${currentAllowance.toString()}`);
  
  if (currentAllowance.toString() !== MAX_UINT256) {
    console.log(`Setting maximum approval...`);
    const tx = await takerToken.approve(LOP, MAX_UINT256);
    const receipt = await tx.wait();
    console.log(`✅ Approved! Tx: ${receipt.hash}`);
    
    currentAllowance = await takerToken.allowance(botWallet.address, LOP);
    console.log(`New allowance: ${currentAllowance.toString()}`);
  } else {
    console.log(`✅ Already approved with maximum amount`);
  }
  
  // 2. Maker approvals for MAKER_TOKEN
  console.log(`\n👤 Maker wallet: ${makerWallet.address}`);
  const makerToken = new ethers.Contract(MAKER_TOKEN, TOKEN_ABI, makerWallet);
  
  console.log(`\n📊 Checking Maker's MAKER_TOKEN balance and allowances`);
  const makerBalance = await makerToken.balanceOf(makerWallet.address);
  console.log(`Balance: ${makerBalance.toString()}`);
  
  // Approve MAKER_TOKEN for LOP
  console.log(`\n🔐 Approving MAKER_TOKEN for LOP`);
  currentAllowance = await makerToken.allowance(makerWallet.address, LOP);
  console.log(`Current allowance: ${currentAllowance.toString()}`);
  
  if (currentAllowance.toString() !== MAX_UINT256) {
    console.log(`Setting maximum approval...`);
    const tx = await makerToken.approve(LOP, MAX_UINT256);
    const receipt = await tx.wait();
    console.log(`✅ Approved! Tx: ${receipt.hash}`);
    
    currentAllowance = await makerToken.allowance(makerWallet.address, LOP);
    console.log(`New allowance: ${currentAllowance.toString()}`);
  } else {
    console.log(`✅ Already approved with maximum amount`);
  }
  
  console.log('\n==============================================');
  console.log('✅ All approvals completed successfully');
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('❌ Error during approval process:', error);
    process.exit(1);
  });
