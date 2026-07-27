import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { VOIDANCE_ADDRESS } from "./contract";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://studio.genlayer.com/api";

// Read-only client — no account/provider needed, GenLayer views don't
// require a signature. Used for admin-gate checks and any other direct
// contract read the frontend needs without going through the backend cache
// (e.g. checking is_admin before rendering admin controls at all).
const readClient = createClient({
  chain: { ...studionet, rpcUrls: { default: { http: [RPC_URL] } } },
});

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
  return readClient.readContract({
    address: VOIDANCE_ADDRESS,
    functionName,
    args,
  }) as Promise<T>;
}
