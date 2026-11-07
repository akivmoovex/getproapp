"use strict";

const { Pool } = require("pg");
const { createActiveClinicFoundationApp } = require("../../src/activeclinic/http/activeClinicFoundationServer");

const port = Number(process.env.PORT || 4175);
const connectionString = String(process.env.DATABASE_URL || "").trim();
if (!connectionString) throw new Error("DATABASE_URL is required for the disposable ActiveClinic CI server");

const pool = new Pool({ connectionString });
const app = createActiveClinicFoundationApp({
  getPool: () => pool,
  env: {
    ...process.env,
    NODE_ENV: "test",
    DEPLOYMENT_ENV: "testing",
    PLATFORM_DEPLOYMENT_CODE: process.env.PLATFORM_DEPLOYMENT_CODE || "activeclinic-org-v6",
    SESSION_SECRET: process.env.SESSION_SECRET || "activeclinic-ci-session-secret",
  },
});

const server = app.listen(port, "127.0.0.1", () => {
  process.stdout.write(`activeclinic CI server listening on 127.0.0.1:${port}\n`);
});

async function shutdown() {
  server.close();
  await pool.end();
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
