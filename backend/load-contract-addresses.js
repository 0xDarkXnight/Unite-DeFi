/**
 * Load contract addresses from deployed-addresses.env
 * This script loads the contract addresses and sets them as environment variables
 */

const fs = require('fs');
const path = require('path');

function loadContractAddresses() {
  try {
    const envPath = path.join(__dirname, '../contracts_EVM/deployed-addresses.env');
    
    if (!fs.existsSync(envPath)) {
      console.warn('⚠️ deployed-addresses.env not found, using default addresses');
      return;
    }
    
    const envContent = fs.readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n').filter(line => line.trim() && !line.startsWith('#'));
    
    lines.forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) {
        process.env[key.trim()] = value.trim();
        console.log(`✅ Loaded ${key.trim()}: ${value.trim()}`);
      }
    });
    
    console.log('✅ Contract addresses loaded successfully');
    
  } catch (error) {
    console.error('❌ Error loading contract addresses:', error.message);
  }
}

module.exports = { loadContractAddresses };

// Auto-load when this module is imported
loadContractAddresses();