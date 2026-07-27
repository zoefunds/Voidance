import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { env } from "../config/env.js";

// Read-only client. This backend never holds a private key and never signs
// writeContract transactions — every state-changing call (create_policy,
// accept_policy, submit_claim, evaluate_claim, withdraw, ...) is signed by
// the user's own wallet client-side (frontend, via wagmi/viem) so the
// platform never custodies GEN or private keys. The backend's job is to be
// a fast, always-on read cache/indexer over the contract's public views.
export const genlayerClient = createClient({
  chain: { ...studionet, rpcUrls: { default: { http: [env.GENLAYER_RPC_URL] } } },
});

export const CONTRACT_ADDRESS = env.VOIDANCE_CONTRACT_ADDRESS as `0x${string}`;

// Mirrors genlayer-js's CalldataEncodable union — every read arg we pass
// (policy ids, offsets, limits, status strings) fits comfortably in this.
type CalldataArg =
  | null
  | boolean
  | number
  | bigint
  | string
  | Uint8Array
  | Array<CalldataArg>
  | { [key: string]: CalldataArg };

export async function readVoidance<T = unknown>(functionName: string, args: CalldataArg[] = []): Promise<T> {
  return genlayerClient.readContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
  }) as Promise<T>;
}
