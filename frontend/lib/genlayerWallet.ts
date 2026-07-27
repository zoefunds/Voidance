"use client";

import { useCallback } from "react";
import { useAccount } from "wagmi";
import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { VOIDANCE_ADDRESS } from "./contract";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://studio.genlayer.com/api";

type CalldataArg =
  | null
  | boolean
  | number
  | bigint
  | string
  | Uint8Array
  | Array<CalldataArg>
  | { [key: string]: CalldataArg };

interface EIP1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
}

/**
 * A wallet-signed GenLayer client, built directly from the connected
 * wallet's own EIP-1193 provider — this is genlayer-js's documented pattern
 * for browser wallet signing: `createClient({ chain, account, provider })`
 * (confirmed against genlayer-js 1.2.0's real type definitions), NOT a
 * plain EVM ABI call through wagmi's `useWriteContract`. GenLayer
 * Intelligent Contract writes carry calldata for a Python contract method
 * plus nondet execution parameters — they are not standard EVM
 * transactions, so viem/wagmi's generic ABI-based `writeContract` has no
 * way to encode them correctly. See MEMORY.md for the (now-resolved)
 * history of this integration risk.
 *
 * `connector.getProvider()` is wagmi's own documented escape hatch for
 * handing a connected wallet's raw EIP-1193 provider to a third-party
 * library — it works uniformly across injected wallets (MetaMask, Rainbow)
 * and WalletConnect-style connectors, unlike reaching into transport
 * internals.
 */
export function useVoidanceWallet() {
  const { address, connector, isConnected } = useAccount();

  const write = useCallback(
    async (functionName: string, args: CalldataArg[], value?: bigint): Promise<string> => {
      if (!address || !connector) throw new Error("connect a wallet first");
      const provider = (await connector.getProvider()) as EIP1193Provider;
      const client = createClient({
        chain: { ...studionet, rpcUrls: { default: { http: [RPC_URL] } } },
        account: address,
        provider,
      });
      const txHash = await client.writeContract({
        address: VOIDANCE_ADDRESS,
        functionName,
        args,
        value: value ?? 0n,
      });
      return txHash as unknown as string;
    },
    [address, connector]
  );

  return { address, connected: isConnected, write, connectorName: connector?.name };
}
