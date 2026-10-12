"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const dotenv = require("dotenv");
const { Client } = require("pg");

const ROOT = path.resolve(__dirname, "../..");
const ENV_FILE = path.join(ROOT, ".env.test.local");
const DB_NAME = "getpro_v209_unified_e2e_test";
const PROFILE = "moovex-platform-testing";
const PORT = String(process.env.PORT || "4319");

function fail(message) {
  console.error(`[local-qa] ${message}`);
  process.exit(2);
}

if (!fs.existsSync(ENV_FILE)) fail("missing .env.test.local");
const local = dotenv.parse(fs.readFileSync(ENV_FILE));
const env = { ...process.env, ...local, NODE_ENV: "test", PORT, HOST: "127.0.0.1" };
if (env.PLATFORM_DEPLOYMENT_CODE !== PROFILE) fail("wrong PLATFORM_DEPLOYMENT_CODE");
if (env.DEPLOYMENT_ENV !== "testing") fail("wrong DEPLOYMENT_ENV");
if (env.DATABASE_IDENTITY_EXPECTED !== "moovex-platform-v7") fail("wrong database identity");
if (!env.SESSION_SECRET) fail("missing SESSION_SECRET");

let parsed;
try {
  parsed = new URL(env.DATABASE_URL || "");
} catch {
  fail("invalid DATABASE_URL");
}
if (!["127.0.0.1", "localhost"].includes(parsed.hostname)) fail("database host is not local");
if (parsed.pathname.slice(1) !== DB_NAME) fail("wrong database name");

function waitHealth() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 120000;
    const poll = () => {
      const req = http.get(`http://127.0.0.1:${PORT}/healthz`, (res) => {
        res.resume();
        if (res.statusCode === 200) return resolve();
        retry();
      });
      req.on("error", retry);
      req.setTimeout(1000, () => req.destroy());
    };
    const retry = () => (Date.now() < deadline ? setTimeout(poll, 200) : reject(new Error("health timeout")));
    poll();
  });
}

(async () => {
  const client = new Client({ connectionString: env.DATABASE_URL, ssl: false });
  await client.connect();
  const row = (await client.query(
    "select identity_key, environment_code from platform.database_identity"
  )).rows[0];
  await client.end();
  if (!row || row.identity_key !== "moovex-platform-v7" || row.environment_code !== "testing") {
    fail("database identity mismatch");
  }

  const child = spawn(process.execPath, ["index.js"], { cwd: ROOT, env, stdio: "inherit" });
  const stop = (signal) => child.kill(signal);
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));
  child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
  try {
    await waitHealth();
  } catch (error) {
    child.kill("SIGTERM");
    fail(error.message);
  }
})().catch((error) => fail(error.message));
