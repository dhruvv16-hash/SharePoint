import "dotenv/config";

const requiredEnvNames = [
  "APP_ID",
  "APP_SECRET",
  "DATABASE_URL",
  "KIMI_AUTH_URL",
  "KIMI_OPEN_URL",
] as const;

function required(name: string): string {
  const value = process.env[name];
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value ?? "";
}

export function validateBackendEnv() {
  const missing = requiredEnvNames.filter((name) => !process.env[name]);
  if (missing.length === 0) {
    return;
  }

  const message = `Missing required environment variables: ${missing.join(", ")}`;
  if (process.env.NODE_ENV === "production") {
    throw new Error(message);
  }

  console.warn(`[env] ${message}`);
}

export const env = {
  appId: required("APP_ID"),
  appSecret: required("APP_SECRET"),
  isProduction: process.env.NODE_ENV === "production",
  databaseUrl: required("DATABASE_URL"),
  kimiAuthUrl: required("KIMI_AUTH_URL"),
  kimiOpenUrl: required("KIMI_OPEN_URL"),
  ownerUnionId: process.env.OWNER_UNION_ID ?? "",
};
