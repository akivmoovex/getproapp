"use strict";

const { spawn } = require("child_process");
const { Pool } = require("pg");

const expectedDb = "getpro_v210_foundation_test_01";
const required = [
  "TEST_DATABASE_URL",
  "SESSION_SECRET",
  "CSRF_SECRET",
];
const env = {
  ...process.env,
  NODE_ENV: "testing",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: "moovex-platform-testing",
  DATABASE_IDENTITY_ENV: "testing",
  DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
  BASE_DOMAIN: "pronline.org",
  BLESSBOARD_TENANT_ROUTING_MODE: "authoritative",
  BLESSBOARD_AUTHORITATIVE_HOST_ALLOWLIST:
    "v210-bb-foundation-01-v10.blessboard.org",
  PORT: process.env.PORT || "4195",
};

for (const key of required) {
  if (!String(env[key] || "").trim()) {
    throw new Error(`Missing required isolated QA configuration: ${key}`);
  }
}

const databaseUrl = String(env.TEST_DATABASE_URL);
if (!databaseUrl.includes(expectedDb)) {
  throw new Error("TEST_DATABASE_URL must target the isolated V10 QA database.");
}
env.DATABASE_URL = databaseUrl;

async function main() {
  const pool = new Pool({ connectionString: databaseUrl });
  const identity = await pool.query(
    `SELECT current_database() AS database_name,
            environment_code,
            identity_key
       FROM platform.database_identity
      LIMIT 1`
  );
  const row = identity.rows[0];
  if (
    !row ||
    row.database_name !== expectedDb ||
    row.environment_code !== "testing" ||
    row.identity_key !== "moovex-platform-v7"
  ) {
    throw new Error("Isolated QA database identity verification failed.");
  }
  await pool.end();

  const child = spawn(process.execPath, ["index.js"], {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
  });
  const shutdown = (signal) => {
    if (!child.killed) child.kill(signal);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  child.on("exit", (code, signal) => {
    process.exit(signal ? 1 : code || 0);
  });
}

main().catch((error) => {
  console.error(`[v10-qa-launcher] ${error.message}`);
  process.exit(1);
});
