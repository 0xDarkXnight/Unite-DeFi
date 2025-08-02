import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatNumber(num: number, decimals: number = 2): string {
  if (num >= 1e9) {
    return (num / 1e9).toFixed(decimals) + 'B';
  }
  if (num >= 1e6) {
    return (num / 1e6).toFixed(decimals) + 'M';
  }
  if (num >= 1e3) {
    return (num / 1e3).toFixed(decimals) + 'K';
  }
  return num.toFixed(decimals);
}

export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format token amount with correct decimals
 */
export function formatTokenAmount(amount: string | number, tokenSymbol: string): string {
  const tokenDecimals: Record<string, number> = {
    'WETH': 18,
    'ETH': 18,
    'USDC': 6,
    'USDT': 6,
    'BTC': 8,
    'MATIC': 18,
    'SOL': 9
  };
  
  const decimals = tokenDecimals[tokenSymbol];
  if (decimals === undefined) {
    // Default to 18 decimals if token not found
    return '0';
  }
  
  // Convert to string first to handle both number and string inputs
  const amountStr = amount.toString();
  
  // Check if the amount contains a decimal point
  if (amountStr.includes('.')) {
    const [whole, fraction] = amountStr.split('.');
    // Truncate to the correct number of decimals without rounding
    const truncatedFraction = fraction.slice(0, decimals).padEnd(decimals, '0');
    return `${whole}.${truncatedFraction}`;
  } else {
    // If no decimal point, add the appropriate number of zeros
    return `${amountStr}.${'0'.repeat(decimals)}`;
  }
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
} 