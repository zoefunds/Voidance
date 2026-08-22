// Deployed on GenLayer StudioNet — see MEMORY.md for deployment details.
// Writes go through genlayer-js directly (see lib/genlayerWallet.ts), not a
// standard EVM ABI — a plain ABI has no way to represent an Intelligent
// Contract call's nondet execution parameters.
export const VOIDANCE_ADDRESS = (process.env.NEXT_PUBLIC_VOIDANCE_CONTRACT_ADDRESS ??
  "0x9a6bCe6a759c6E9ca20d90ca593B759CfC5E4f77") as `0x${string}`;
