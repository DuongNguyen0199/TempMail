import path from "node:path";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({
  path: [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "../.env")],
  quiet: true
});

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DB_CONNECTION_STRING: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/, "ENCRYPTION_KEY must be 64 hex characters"),
  JWT_EXPIRES_IN: z.string().default("7d"),
  SONJJ_BASE_URL: z.string().url().default("https://app.sonjj.com"),
  API_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(20000),
  CLIENT_ORIGIN: z.string().default("http://localhost:5173"),
  TRUST_PROXY: z.enum(["true", "false"]).default("false"),
  COOKIE_SECURE: z.enum(["true", "false"]).default("false")
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = {
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === "production",
  trustProxy: parsed.data.TRUST_PROXY === "true",
  cookieSecure: parsed.data.COOKIE_SECURE === "true"
};
