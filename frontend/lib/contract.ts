// Deployed on GenLayer StudioNet — see MEMORY.md for deployment details.
// Writes go through genlayer-js directly (see lib/genlayerWallet.ts), not a
// standard EVM ABI — a plain ABI has no way to represent an Intelligent
// Contract call's nondet execution parameters.
export const VOIDANCE_ADDRESS = (process.env.NEXT_PUBLIC_VOIDANCE_CONTRACT_ADDRESS ??
  "0x58dED66906Ceb587236591C5d9729CE89501cbC2") as `0x${string}`;
