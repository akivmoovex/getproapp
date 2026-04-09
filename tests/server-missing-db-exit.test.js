"use strict";

const path = require("path");
const { spawnSync } = require("child_process");
const test = require("node:test");
const assert = require("node:assert/strict");

test("server.js fails fast (exit 1) when DATABASE_URL and GETPRO_DATABASE_URL are absent", () => {
  const serverJs = path.join(__dirname, "..", "server.js");
  const env = {
    ...process.env,
    NODE_ENV: "development",
    GETPRO_DB_MISSING_EXIT_DELAY_MS: "0",
    // Ignore repo .env so this test always hits the missing-URL path (not a live DB connect).
    GETPRO_SKIP_DOTENV: "1",
  };
  delete env.DATABASE_URL;
  delete env.GETPRO_DATABASE_URL;
  const r = spawnSync(process.execPath, [serverJs], { env, encoding: "utf8", maxBuffer: 2 * 1024 * 1024 });
  assert.equal(r.status, 1, `expected exit 1; stderr:\n${r.stderr}\nstdout:\n${r.stdout}`);
  assert.match(r.stderr || r.stdout, /FATAL|configuration missing|PostgreSQL/i);
});
