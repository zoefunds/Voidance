import { getDefaultConfig } from "@rainbow-me/rainbowkit";

// GenLayer StudioNet — chain id / RPC filled in once the deployed contract
// address is provided. Kept as env vars so this never needs a code change
// to point at a different network.
const studionet = {
  id: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 61999),
  name: "GenLayer StudioNet",
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_RPC_URL ?? "https://studio.genlayer.com/api"] },
  },
} as const;

export const wagmiConfig = getDefaultConfig({
  appName: "Voidance",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "voidance-dev",
  chains: [studionet],
  ssr: true,
});
