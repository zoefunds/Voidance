// Deployed on GenLayer StudioNet — see MEMORY.md for deployment details.
export const VOIDANCE_ADDRESS = (process.env.NEXT_PUBLIC_VOIDANCE_CONTRACT_ADDRESS ??
  "0x58dED66906Ceb587236591C5d9729CE89501cbC2") as `0x${string}`;

// Minimal ABI surface the frontend calls directly (writes signed by the
// user's own wallet). Reads go through the backend cache in lib/api.ts.
// GenLayer's EVM-compatibility layer accepts standard ABI-encoded calls for
// @gl.public.write / @gl.public.write.payable functions.
export const VOIDANCE_ABI = [
  {
    type: "function",
    name: "create_policy",
    stateMutability: "payable",
    inputs: [
      { name: "project_title", type: "string" },
      { name: "project_description", type: "string" },
      { name: "research_field", type: "string" },
      { name: "methodology_url", type: "string" },
      { name: "methodology_summary", type: "string" },
      { name: "milestone_description", type: "string" },
      { name: "tags_json", type: "string" },
      { name: "milestone_deadline_ts", type: "uint256" },
      { name: "now_ts", type: "uint256" },
      { name: "premium_bps", type: "uint256" },
      { name: "accept_window_seconds", type: "uint256" },
      { name: "claim_grace_seconds", type: "uint256" },
    ],
    outputs: [{ name: "policy_id", type: "uint256" }],
  },
  {
    type: "function",
    name: "accept_policy",
    stateMutability: "payable",
    inputs: [
      { name: "policy_id", type: "uint256" },
      { name: "now_ts", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "submit_claim",
    stateMutability: "nonpayable",
    inputs: [
      { name: "policy_id", type: "uint256" },
      { name: "claim_narrative", type: "string" },
      { name: "evidence_urls_json", type: "string" },
      { name: "now_ts", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "evaluate_claim",
    stateMutability: "nonpayable",
    inputs: [
      { name: "policy_id", type: "uint256" },
      { name: "now_ts", type: "uint256" },
    ],
    outputs: [{ name: "policy_view", type: "string" }],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw_all",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [{ name: "amount", type: "uint256" }],
  },
] as const;
