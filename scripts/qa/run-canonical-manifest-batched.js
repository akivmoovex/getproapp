#!/usr/bin/env node
"use strict";

/**
 * V2.03 canonical 865-file manifest runner (batched, no coverage).
 *
 * Single-process 865-file argv runs are unstable on local Postgres.app
 * (trust/auth noise + open-handle hangs). Batches preserve deterministic
 * --test-concurrency=1 ordering while isolating process footprint.
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const MANIFEST = path.join(ROOT, "docs/qa/manifests/V2_03_CANONICAL_TEST_MANIFEST.txt");
const OUT_DIR = process.env.V203_PHASE_B_OUT || "/tmp/v203-canonical-phase-b";
const BATCH_SIZE = Math.max(1, Number(process.env.BATCH_SIZE || 25));
const WATCHDOG_MS = Math.max(60_000, Number(process.env.BATCH_WATCHDOG_MS || 12 * 60 * 1000));

function readManifest() {
  const files = fs
    .readFileSync(MANIFEST, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (files.length !== 865) {
    throw new Error(`EXPECTED_865_GOT_${files.length}`);
  }
  for (const rel of files) {
    if (!fs.existsSync(path.join(ROOT, rel))) {
      throw new Error(`MISSING ${rel}`);
    }
  }
  return files;
}

function runBatch(files, batchIdx, logPath, baseEnv) {
  return new Promise((resolve) => {
    const started = Date.now();
    const header = `\n===== BATCH ${batchIdx} files=${files.length} start=${new Date().toISOString()} =====\n`;
    fs.appendFileSync(logPath, header);
    process.stdout.write(header);

    const env = { ...baseEnv };
    // Never inherit a stale TCP admin URL from the parent shell.
    if (!process.env.FOUNDATION_ADMIN_DATABASE_URL) {
      delete env.FOUNDATION_ADMIN_DATABASE_URL;
      delete env.DATABASE_URL_ADMIN;
    }

    const child = spawn(
      process.execPath,
      ["--test", "--test-concurrency=1", "--test-reporter=tap", ...files],
      {
        cwd: ROOT,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    const onChunk = (chunk) => {
      const s = chunk.toString("utf8");
      fs.appendFileSync(logPath, s);
      process.stdout.write(s);
    };
    child.stdout.on("data", onChunk);
    child.stderr.on("data", onChunk);

    const watchdog = setTimeout(() => {
      fs.appendFileSync(logPath, `\n[watchdog] killing batch ${batchIdx}\n`);
      try {
        child.kill("SIGTERM");
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }, 5000);
    }, WATCHDOG_MS);

    child.on("close", (code, signal) => {
      clearTimeout(watchdog);
      const entry = {
        batchIdx,
        files: files.length,
        code,
        signal,
        durationMs: Date.now() - started,
        first: files[0],
        last: files[files.length - 1],
      };
      fs.appendFileSync(
        logPath,
        `\n===== BATCH ${batchIdx} END code=${code} signal=${signal} durationMs=${entry.durationMs} =====\n`
      );
      resolve(entry);
    });
  });
}

function waitForAdminReady(env, logPath) {
  return new Promise((resolve) => {
    const started = Date.now();
    const probe = `
      const { Client } = require('pg');
      const { resolveLocalAdminConnectionString } = require('./tests/helpers/localPostgresAdmin');
      (async () => {
        const url = resolveLocalAdminConnectionString();
        let last = null;
        for (let i = 0; i < 20; i++) {
          const c = new Client({ connectionString: url });
          try {
            await c.connect();
            await c.query('SELECT 1');
            await c.end();
            process.exit(0);
          } catch (e) {
            last = e;
            try { await c.end(); } catch {}
            await new Promise((r) => setTimeout(r, Math.min(2000, 100 * 2 ** i)));
          }
        }
        console.error('ADMIN_NOT_READY', last && last.message);
        process.exit(2);
      })();
    `;
    const child = spawn(process.execPath, ["-e", probe], {
      cwd: ROOT,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let err = "";
    child.stderr.on("data", (c) => {
      err += c.toString("utf8");
    });
    child.on("close", (code) => {
      const line = `[phase-b] admin_ready code=${code} waitMs=${Date.now() - started} ${err.trim()}\n`;
      fs.appendFileSync(logPath, line);
      resolve(code === 0);
    });
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const files = readManifest();
  const logPath = path.join(OUT_DIR, "canonical-batched.log");
  const metaPath = path.join(OUT_DIR, "canonical-batched-meta.json");
  fs.writeFileSync(logPath, "");
  const meta = {
    startedAt: new Date().toISOString(),
    testFiles: files.length,
    batchSize: BATCH_SIZE,
    coverage: false,
    batches: [],
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  fs.appendFileSync(
    logPath,
    `[phase-b] START ${meta.startedAt} files=${files.length} batchSize=${BATCH_SIZE} coverage=NO\n`
  );

  const baseEnv = {
    ...process.env,
    NODE_ENV: "test",
    USER: process.env.USER || require("os").userInfo().username,
    LOGNAME: process.env.LOGNAME || process.env.USER,
    DB_HOST: process.env.DB_HOST || "127.0.0.1",
    DB_PORT: process.env.DB_PORT || "5432",
    DB_SSL: process.env.DB_SSL || "false",
    ALLOW_PROD_DB: "",
    FORCE_COLOR: "0",
  };
  if (!process.env.FOUNDATION_ADMIN_DATABASE_URL) {
    delete baseEnv.FOUNDATION_ADMIN_DATABASE_URL;
  }

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const ready = await waitForAdminReady(baseEnv, logPath);
    if (!ready) {
      fs.appendFileSync(logPath, `[phase-b] BLOCKED admin not ready before batch ${Math.floor(i / BATCH_SIZE) + 1}\n`);
      meta.blockedAt = new Date().toISOString();
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
      process.exit(3);
    }
    const slice = files.slice(i, i + BATCH_SIZE);
    const entry = await runBatch(slice, Math.floor(i / BATCH_SIZE) + 1, logPath, baseEnv);
    meta.batches.push(entry);
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    // Brief pause so Postgres.app can release sockets between process batches.
    if (i + BATCH_SIZE < files.length) {
      await new Promise((r) => setTimeout(r, Number(process.env.BATCH_PAUSE_MS || 400)));
    }
  }

  meta.finishedAt = new Date().toISOString();
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
  fs.appendFileSync(logPath, `\n[phase-b] ALL_BATCHES_DONE ${meta.finishedAt}\n`);
  console.log("[phase-b] ALL_BATCHES_DONE");
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
