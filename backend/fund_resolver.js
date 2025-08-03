const { ethers } = require('ethers');

// Configuration
const RESOLVER_PRIVATE_KEY = '0xb92a8c71a5b044a7f52b5aa2dd68a32bf4be0c3c9ebf462b10db7d6ba1cb5ecb';
const RESOLVER_CONTRACT = '0xE58d34F1c02CfFFE4736E6883629a95444dD87Bc';
const USDC_ADDRESS = '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238'; // Sepolia USDC
const LOP_ADDRESS = '0x584c43954CfbA4C0Cb00eECE36d1dcc249ae2dfD'; // New LimitOrderProtocol

async function fundResolver() {
  try {
    // Setup provider and wallet
    const provider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com');
    const wallet = new ethers.Wallet(RESOLVER_PRIVATE_KEY, provider);
    
    console.log('🏦 Funding Resolver Contract...');
    console.log('Resolver Bot Address:', wallet.address);
    console.log('Resolver Contract:', RESOLVER_CONTRACT);
    
    // Setup USDC contract
    const usdcContract = new ethers.Contract(USDC_ADDRESS, [
      "function transfer(address to, uint256 amount) external returns (bool)",
      "function balanceOf(address owner) external view returns (uint256)",
      "function approve(address spender, uint256 amount) external returns (bool)"
    ], wallet);
    
    // Check current USDC balance
    const botBalance = await usdcContract.balanceOf(wallet.address);
    console.log(`💰 ResolverBot USDC balance: ${botBalance.toString()}`);
    
    if (botBalance < 1000n) {
      throw new Error('Insufficient USDC balance in ResolverBot');
    }
    
    // Transfer USDC to Resolver contract (1000 USDC)
    const transferAmount = 1000n * 1000000n; // 1000 USDC (6 decimals)
    console.log(`📤 Transferring ${transferAmount.toString()} USDC to Resolver contract...`);
    
    const transferTx = await usdcContract.transfer(RESOLVER_CONTRACT, transferAmount);
    console.log('📝 Transfer transaction:', transferTx.hash);
    
    const transferReceipt = await transferTx.wait();
    console.log('✅ USDC transferred successfully!');
    
    // Check Resolver contract balance
    const resolverBalance = await usdcContract.balanceOf(RESOLVER_CONTRACT);
    console.log(`💰 Resolver contract USDC balance: ${resolverBalance.toString()}`);
    
    // Setup Resolver contract for approvals
    const resolverContract = new ethers.Contract(RESOLVER_CONTRACT, [
      "function approveToken(address token, address spender, uint256 amount) external",
      "function owner() external view returns (address)"
    ], wallet);
    
    // Check ownership
    const owner = await resolverContract.owner();
    console.log('👑 Resolver contract owner:', owner);
    console.log('🔑 ResolverBot address:', wallet.address);
    
    if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
      throw new Error('ResolverBot is not the owner of Resolver contract');
    }
    
    // Approve USDC to LimitOrderProtocol
    console.log('🔓 Approving USDC to LimitOrderProtocol...');
    const maxAmount = ethers.MaxUint256;
    const approveTx = await resolverContract.approveToken(USDC_ADDRESS, LOP_ADDRESS, maxAmount);
    console.log('📝 Approval transaction:', approveTx.hash);
    
    const approveReceipt = await approveTx.wait();
    console.log('✅ USDC approved to LimitOrderProtocol successfully!');
    
    console.log('\n🎉 Resolver contract is now funded and ready for escrow-based order execution!');
    
  } catch (error) {
    console.error('❌ Error funding resolver:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  fundResolver();
}

module.exports = { fundResolver };