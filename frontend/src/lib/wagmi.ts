import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import {
  arbitrum,
  mainnet,
  optimism,
  polygon,
  sepolia,
} from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'Unite DeFi',
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || 'demo-project-id',
  chains: [
    mainnet,     // 1
    polygon,     // 137
    optimism,    // 10
    arbitrum,    // 42161
    ...(process.env.NODE_ENV === 'development' ? [sepolia] : []), // 11155111
  ],
  ssr: true,
}); 