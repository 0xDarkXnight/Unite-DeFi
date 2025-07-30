import type { Metadata } from "next";
import { Unbounded, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";
import '@rainbow-me/rainbowkit/styles.css';
import { Providers } from '../components/Providers';

const unbounded = Unbounded({
  variable: "--font-unbounded",
  subsets: ["latin"],
  display: 'swap',
});

const splineSansMono = Spline_Sans_Mono({
  variable: "--font-spline-sans-mono",
  subsets: ["latin"],
  display: 'swap',
});

export const metadata: Metadata = {
  title: "Unite DeFi - Next-Gen Cross-Chain Swap Protocol",
  description: "Experience seamless cross-chain swaps across EVM and non-EVM chains including Sui, Aptos, Solana, and more. Built on 1inch Fusion+ with enhanced security and efficiency.",
  keywords: ["DeFi", "Cross-chain", "Swap", "1inch", "Fusion", "Sui", "Aptos", "Solana", "Blockchain"],
  authors: [{ name: "Unite DeFi Team" }],
  creator: "Unite DeFi",
  publisher: "Unite DeFi",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL('https://unite-defi.com'),
  openGraph: {
    title: "Unite DeFi - Next-Gen Cross-Chain Swap Protocol",
    description: "Experience seamless cross-chain swaps across EVM and non-EVM chains including Sui, Aptos, Solana, and more.",
    url: 'https://unite-defi.com',
    siteName: 'Unite DeFi',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Unite DeFi - Cross-Chain Swap Protocol',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Unite DeFi - Next-Gen Cross-Chain Swap Protocol',
    description: 'Experience seamless cross-chain swaps across EVM and non-EVM chains.',
    images: ['/twitter-image.jpg'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="manifest" href="/site.webmanifest" />
        <meta name="theme-color" content="#0a0a0f" />
      </head>
      <body
        className={`${unbounded.variable} ${splineSansMono.variable} antialiased`}
      >
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
