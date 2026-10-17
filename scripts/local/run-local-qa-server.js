"use strict";

const { Pool } = require("pg");
const { createV5FoundationApp } = require("../../src/platform/http/v5FoundationServer");

const port = Number(process.env.PORT || 4175);
const connectionString = process.env.DATABASE_URL ||
  "postgresql:///getpro_v211_test_01?host=/tmp";
const pool = new Pool({ connectionString });
const app = createV5FoundationApp({
  getPool: () => pool,
  env: {
    ...process.env,
    NODE_ENV: "test",
    SESSION_SECRET: process.env.SESSION_SECRET || "playwright-ci-session-secret",
    PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
  },
});

const server = app.listen(port, "127.0.0.1", () => {
  process.stdout.write(`local V11 QA server listening on http://127.0.0.1:${port}\n`);
});

async function shutdown() {
  server.close();
  await pool.end();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
