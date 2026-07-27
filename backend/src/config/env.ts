import "dotenv/config";
import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  PORT: z.coerce.number().default(4000),
  LOG_LEVEL: z.string().default("info"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().optional(),
  GENLAYER_RPC_URL: z.string().url(),
  GENLAYER_CHAIN_ID: z.coerce.number().default(61999),
  VOIDANCE_CONTRACT_ADDRESS: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "VOIDANCE_CONTRACT_ADDRESS must be a 20-byte hex address"),
  SYNC_INTERVAL_MS: z.coerce.number().default(15000),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .transform((s) => s.split(",").map((o) => o.trim()).filter(Boolean)),
});

export const env = EnvSchema.parse(process.env);
