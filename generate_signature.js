import { ethers } from 'ethers';

// Private key for the maker address
const PRIVATE_KEY = '0xe6d18c7a6b6eec061b8ca09b533e71a3f0dedecd5b33a8d8ad20d2c2a408774c';
const wallet = new ethers.Wallet(PRIVATE_KEY);

// Create the order data
const order = {
  salt: "1234567890123456789012345678901234567890123456789012345678901234",
  maker: "0x6a511b93F684fA6b98859681d27DB90209f44a84",
      makerAsset: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
  takerAsset: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
  makingAmount: "1000000000000000",
  takingAmount: "997000000000000",
  makerTraits: "0x0000000000000000000000000000000000000000000000000000000000000000",
  receiver: "0x0000000000000000000000000000000000000000"
};

// EIP-712 domain
const domain = {
  name: '1inch Limit Order Protocol',
  version: '4',
  chainId: 11155111, // Sepolia
  verifyingContract: '0x68Ffc3d9A097a22a3C3bdd68169D09Ba4be94D28' // SEPOLIA_LIMIT_ORDER_PROTOCOL
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
const signature = await wallet._signTypedData(domain, types, orderData);

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
    startPrice: "997000000000000",
    endPrice: "1001985000000000"
  },
  crossChainData: {
    srcChainId: 11155111,
    dstChainId: 11155111,
    dstToken: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
    dstAmount: "0.000997"
  },
  secret: "e6d18c7a6b6eec061b8ca09b533e71a3f0dedecd5b33a8d8ad20d2c2a408774c"
};

console.log('\nCurl request:');
console.log('curl -X POST http://localhost:3003/api/orders \\');
console.log('  -H "Content-Type: application/json" \\');
console.log('  -d \'' + JSON.stringify(curlRequest, null, 2) + '\''); 