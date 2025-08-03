const { ethers } = require('ethers');

// Private key for the maker address
const PRIVATE_KEY = '0xe6d18c7a6b6eec061b8ca09b533e71a3f0dedecd5b33a8d8ad20d2c2a408774c';
const wallet = new ethers.Wallet(PRIVATE_KEY);

// Create the order data - USDC for WETH swap
const order = {
  salt: Date.now().toString() + Math.floor(Math.random() * 1000000).toString().padStart(6, '0'),
  maker: "0x6a511b93F684fA6b98859681d27DB90209f44a84",
  makerAsset: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", // WETH (maker is giving WETH)
  takerAsset: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", // USDC (taker is giving USDC)
  makingAmount: "100000000000000", // 0.0001 WETH (18 decimals)
  takingAmount: "99", // 99 USDC (6 decimals for USDC)
  makerTraits: "0x0000000000000000000000000000000000000000000000000000000000000000",
  receiver: "0x6a511b93F684fA6b98859681d27DB90209f44a84", // Receiver is the maker
  allowedSender: "0x0000000000000000000000000000000000000000", // Anyone can fill
  offsets: "0", // No extension
  interactions: "0x" // No interactions
};

// EIP-712 domain
const domain = {
  name: '1inch Limit Order Protocol',
  version: '4',
  chainId: 11155111, // Sepolia
      verifyingContract: '0x584c43954CfbA4C0Cb00eECE36d1dcc249ae2dfD' // SEPOLIA_LIMIT_ORDER_PROTOCOL
};

// EIP-712 types
const types = {
  Order: [
    { name: 'salt', type: 'uint256' },
    { name: 'makerAsset', type: 'address' },
    { name: 'takerAsset', type: 'address' },
    { name: 'maker', type: 'address' },
    { name: 'receiver', type: 'address' },
    { name: 'allowedSender', type: 'address' },
    { name: 'makingAmount', type: 'uint256' },
    { name: 'takingAmount', type: 'uint256' },
    { name: 'offsets', type: 'uint256' },
    { name: 'interactions', type: 'bytes' }
  ]
};

// Create the order data for signing
const orderData = {
  salt: order.salt,
  makerAsset: order.makerAsset,
  takerAsset: order.takerAsset,
  maker: order.maker,
  receiver: order.receiver,
  allowedSender: "0x0000000000000000000000000000000000000000",
  makingAmount: order.makingAmount,
  takingAmount: order.takingAmount,
  offsets: "0",
  interactions: "0x"
};

// Sign the order
async function generateSignature() {
  const signature = await wallet.signTypedData(domain, types, orderData);

  console.log('Order:', order);
  console.log('Signature:', signature);
  console.log('R:', signature.slice(0, 66));
  console.log('VS:', signature.slice(66));

  // Create the curl request
  const curlRequest = {
    order: {
      salt: order.salt,
      maker: order.maker,
      makerAsset: order.makerAsset,
      takerAsset: order.takerAsset,
      makingAmount: order.makingAmount,
      takingAmount: order.takingAmount,
      makerTraits: order.makerTraits,
      receiver: order.receiver
    },
    signature: {
      r: signature.slice(0, 66),
      vs: signature.slice(66)
    },
    auctionParams: {
      startTime: Math.floor(Date.now() / 1000) + 60,
      endTime: Math.floor(Date.now() / 1000) + 360,
      startPrice: "99", // Starting at 99 USDC
      endPrice: "100" // Ending at 100 USDC (with slippage)
    },
    crossChainData: {
      srcChainId: 11155111,
      dstChainId: 11155111,
      dstToken: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", // WETH
      dstAmount: "0.0001" // 0.0001 WETH
    },
    secret: "e6d18c7a6b6eec061b8ca09b533e71a3f0dedecd5b33a8d8ad20d2c2a408774c"
  };

  console.log('\nCurl request:');
  console.log('curl -X POST http://localhost:3003/api/orders \\');
  console.log('  -H "Content-Type: application/json" \\');
  console.log('  -d \'' + JSON.stringify(curlRequest, null, 2) + '\'');
}

generateSignature().catch(console.error); 