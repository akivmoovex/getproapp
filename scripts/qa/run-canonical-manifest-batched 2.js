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

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const files = readManifest();
  const logPath = path.join(OUT_DIR, "canonical-batched.log");
  const metaPath = path.join(OUT_DIR, "canonical-batched-meta.json");
  const resumeFrom = Math.max(1, Number(process.env.BATCH_RESUME_FROM || 1));
  const append = resumeFrom > 1 || process.env.BATCH_APPEND === "1";

  let meta;
  if (append && fs.existsSync(metaPath)) {
    meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    meta.resumedAt = new Date().toISOString();
    meta.resumeFrom = resumeFrom;
    fs.appendFileSync(
      logPath,
      `\n[phase-b] RESUME ${meta.resumedAt} from_batch=${resumeFrom} files=${files.length} batchSize=${BATCH_SIZE} coverage=NO\n`
    );
  } else {
    fs.writeFileSync(logPath, "");
    meta = {
      startedAt: new Date().toISOString(),
      testFiles: files.length,
      batchSize: BATCH_SIZE,
      coverage: false,
      batches: [],
    };
    fs.appendFileSync(
      logPath,
      `[phase-b] START ${meta.startedAt} files=${files.length} batchSize=${BATCH_SIZE} coverage=NO\n`
    );
  }
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

  const startDelay = Number(process.env.BATCH_START_DELAY_MS || 0);
  if (startDelay > 0) {
    fs.appendFileSync(logPath, `[phase-b] start_delay_ms=${startDelay}\n`);
    await new Promise((r) => setTimeout(r, startDelay));
  }

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

  const startOffset = (resumeFrom - 1) * BATCH_SIZE;
  for (let i = startOffset; i < files.length; i += BATCH_SIZE) {
    const batchIdx = Math.floor(i / BATCH_SIZE) + 1;
    const slice = files.slice(i, i + BATCH_SIZE);
    const entry = await runBatch(slice, batchIdx, logPath, baseEnv);
    meta.batches = (meta.batches || []).filter((b) => b.batchIdx !== batchIdx);
    meta.batches.push(entry);
    meta.batches.sort((a, b) => a.batchIdx - b.batchIdx);
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
