/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: false },
  webpack: (config) => {
    // RainbowKit's default wallet list pulls in wagmi's Coinbase "Base
    // Account" connector, which optionally supports x402 micropayments via
    // @coinbase/cdp-sdk. Those @x402/* packages are optional peer deps we
    // don't install (Voidance has nothing to do with x402 payments) —
    // stub them out so webpack doesn't fail the build trying to resolve
    // code paths that are never exercised at runtime.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@x402/evm/upto/client": false,
      "@x402/evm/exact/client": false,
      "@x402/core/client": false,
      "@x402/svm/exact/client": false,
      "@x402/evm": false,
    };
    // WalletConnect's optional React Native storage backend and pino's
    // optional pretty-printer are never used in a browser bundle — silence
    // the otherwise-harmless "module not found" build warnings for them.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      "@react-native-async-storage/async-storage": false,
      "pino-pretty": false,
    };
    return config;
  },
};

export default nextConfig;
