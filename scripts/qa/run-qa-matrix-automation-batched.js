#!/usr/bin/env node
"use strict";

/**
 * Phase C: execute unique test files cited by V2_03_QA_AUTOMATION_MATRIX
 * and emit per-file + per-QA_ID EXECUTED/PASSED results.
 */

const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const OUT_DIR = process.env.V203_PHASE_C_OUT || "/tmp/v203-phase-c";
const FILE_LIST = process.env.MATRIX_FILE_LIST || path.join(OUT_DIR, "matrix-files.txt");
const LEDGER_PATH = path.join(OUT_DIR, "execution-ledger.json");
const BATCH_SIZE = Math.max(1, Number(process.env.BATCH_SIZE || 10));
const WATCHDOG_MS = Math.max(60_000, Number(process.env.BATCH_WATCHDOG_MS || 12 * 60 * 1000));

function readFiles() {
  const files = fs
    .readFileSync(FILE_LIST, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const rel of files) {
    if (!fs.existsSync(path.join(ROOT, rel))) {
      throw new Error(`MISSING ${rel}`);
    }
  }
  return files;
}

function parseTapFileResults(tapText) {
  /** @type {Record<string, { pass: number, fail: number, skip: number, cancelled: number }>} */
  const byFile = {};
  let currentFile = null;

  const ensure = (f) => {
    if (!byFile[f]) byFile[f] = { pass: 0, fail: 0, skip: 0, cancelled: 0 };
    return byFile[f];
  };

  for (const line of tapText.split(/\r?\n/)) {
    // node --test tap: "# Subtest: tests/foo.test.js" for file suites
    const sub = line.match(/^# Subtest:\s+(tests\/\S+\.test\.js)\s*$/);
    if (sub) {
      currentFile = sub[1];
      ensure(currentFile);
      continue;
    }
    // Some reporters nest; also catch absolute paths
    const subAbs = line.match(/^# Subtest:\s+(\S+\/tests\/\S+\.test\.js)\s*$/);
    if (subAbs) {
      const rel = subAbs[1].replace(/^.*?(tests\/)/, "tests/");
      currentFile = rel;
      ensure(currentFile);
      continue;
    }
    if (!currentFile) continue;
    if (/^ok \d+/.test(line) && !/# SKIP/.test(line)) {
      ensure(currentFile).pass += 1;
    } else if (/^not ok \d+/.test(line)) {
      ensure(currentFile).fail += 1;
    } else if (/^ok \d+.*# SKIP/.test(line) || /# SKIP/.test(line) && /^ok /.test(line)) {
      ensure(currentFile).skip += 1;
    } else if (/# CANCELLED/.test(line)) {
      ensure(currentFile).cancelled += 1;
    }
  }

  // Fallback: if a file was listed in argv but never appeared, mark unknown
  return byFile;
}

function runBatch(files, batchIdx, logPath, baseEnv) {
  return new Promise((resolve) => {
    const started = Date.now();
    const header = `\n===== BATCH ${batchIdx} files=${files.length} start=${new Date().toISOString()} =====\n`;
    fs.appendFileSync(logPath, header);
    process.stdout.write(header);

    const env = { ...baseEnv };
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

    let buf = "";
    const onChunk = (chunk) => {
      const s = chunk.toString("utf8");
      buf += s;
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
      const parsed = parseTapFileResults(buf);
      // Files with no tap subtest still ran — use batch exit if missing
      const fileResults = {};
      for (const f of files) {
        const stats = parsed[f] || { pass: 0, fail: 0, skip: 0, cancelled: 0 };
        const executed = true;
        const passed = stats.fail === 0 && stats.cancelled === 0 && code === 0;
        // If parser missed file but batch failed, mark fail; if batch ok and no fails, pass
        let status;
        if (stats.fail > 0 || stats.cancelled > 0) status = "FAIL";
        else if (code !== 0 && !(f in parsed)) status = "FAIL_BATCH";
        else if (code !== 0 && stats.fail === 0 && f in parsed) {
          // file had only passes but sibling failed
          status = "PASS";
        } else if (code === 0) status = "PASS";
        else status = "FAIL";
        fileResults[f] = { ...stats, executed, status, batchCode: code };
      }
      resolve({
        batchIdx,
        files,
        code,
        signal,
        durationMs: Date.now() - started,
        fileResults,
      });
    });
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const files = readFiles();
  const logPath = path.join(OUT_DIR, "matrix-batched.log");
  const metaPath = path.join(OUT_DIR, "matrix-batched-meta.json");
  const resultsPath = path.join(OUT_DIR, "file-results.json");
  const qaResultsPath = path.join(OUT_DIR, "qa-id-results.json");

  const resumeFrom = Math.max(1, Number(process.env.BATCH_RESUME_FROM || 1));
  const append = resumeFrom > 1 || process.env.BATCH_APPEND === "1";

  let meta;
  let allFileResults = {};
  if (append && fs.existsSync(metaPath)) {
    meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    meta.resumedAt = new Date().toISOString();
    meta.resumeFrom = resumeFrom;
    if (fs.existsSync(resultsPath)) {
      allFileResults = JSON.parse(fs.readFileSync(resultsPath, "utf8"));
    }
    fs.appendFileSync(logPath, `\n===== RESUME batch>=${resumeFrom} =====\n`);
  } else {
    fs.writeFileSync(logPath, "");
    meta = {
      startedAt: new Date().toISOString(),
      testFiles: files.length,
      batchSize: BATCH_SIZE,
      coverage: false,
      batches: [],
    };
  }

  const baseEnv = {
    ...process.env,
    NODE_ENV: "test",
    DB_HOST: process.env.DB_HOST || "127.0.0.1",
    DB_PORT: process.env.DB_PORT || "5432",
    DB_SSL: process.env.DB_SSL || "false",
  };
  delete baseEnv.ALLOW_PROD_DB;

  const totalBatches = Math.ceil(files.length / BATCH_SIZE);
  for (let i = resumeFrom - 1; i < totalBatches; i++) {
    const batchFiles = files.slice(i * BATCH_SIZE, (i + 1) * BATCH_SIZE);
    const entry = await runBatch(batchFiles, i + 1, logPath, baseEnv);
    Object.assign(allFileResults, entry.fileResults);
    meta.batches = (meta.batches || []).filter((b) => b.batchIdx !== entry.batchIdx);
    meta.batches.push({
      batchIdx: entry.batchIdx,
      files: entry.files.length,
      code: entry.code,
      signal: entry.signal,
      durationMs: entry.durationMs,
      first: entry.files[0],
      last: entry.files[entry.files.length - 1],
    });
    meta.finishedAt = new Date().toISOString();
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
    fs.writeFileSync(resultsPath, JSON.stringify(allFileResults, null, 2));

    if (process.env.BATCH_PAUSE_MS) {
      await new Promise((r) => setTimeout(r, Number(process.env.BATCH_PAUSE_MS)));
    }
  }

  // Map to QA_IDs
  const ledger = JSON.parse(fs.readFileSync(LEDGER_PATH, "utf8")).ledger;
  const qaResults = ledger.map((row) => {
    const fileStatuses = row.files.map((f) => {
      const fr = allFileResults[f];
      return {
        file: f,
        executed: Boolean(fr && fr.executed),
        status: fr ? fr.status : "NOT_RUN",
        pass: fr ? fr.pass : 0,
        fail: fr ? fr.fail : 0,
        skip: fr ? fr.skip : 0,
      };
    });
    const executed = fileStatuses.length > 0 && fileStatuses.every((s) => s.executed);
    const passed =
      executed && fileStatuses.every((s) => s.status === "PASS" || (s.fail === 0 && s.status !== "FAIL" && s.status !== "FAIL_BATCH" && s.status !== "NOT_RUN"));
    const strictPass = executed && fileStatuses.every((s) => s.status === "PASS");
    return {
      QA_ID: row.QA_ID,
      PRODUCT: row.PRODUCT,
      FUNCTION: row.FUNCTION,
      TEST_FILE: row.TEST_FILE,
      TEST_CASE: row.TEST_CASE,
      AUTOMATION_EXISTS: row.AUTOMATION_EXISTS,
      EXECUTED: executed ? "YES" : "NO",
      PASSED: strictPass ? "YES" : "NO",
      POSITIVE_PATH: row.POSITIVE_PATH,
      NEGATIVE_PATH: row.NEGATIVE_PATH,
      PERSISTENCE: row.PERSISTENCE,
      TENANT_BOUNDARY: row.TENANT_BOUNDARY,
      files: fileStatuses,
    };
  });

  const summary = {
    QA_TOTAL: qaResults.length,
    QA_AUTOMATION_EXISTS: qaResults.filter((r) => r.AUTOMATION_EXISTS === "YES").length,
    QA_EXECUTED: qaResults.filter((r) => r.EXECUTED === "YES").length,
    QA_PASSING: qaResults.filter((r) => r.PASSED === "YES").length,
    uniqueFiles: files.length,
    filesPass: Object.values(allFileResults).filter((f) => f.status === "PASS").length,
    filesFail: Object.values(allFileResults).filter((f) => f.status !== "PASS").length,
  };

  fs.writeFileSync(qaResultsPath, JSON.stringify({ summary, qaResults }, null, 2));
  meta.summary = summary;
  meta.finishedAt = new Date().toISOString();
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

  console.log("\n===== PHASE_C_SUMMARY =====");
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.QA_PASSING === 98 && summary.QA_EXECUTED === 98 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
