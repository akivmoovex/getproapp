"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const runtime = require("./runtime/qaDockerRuntime");

const QA_ROOT = path.resolve(__dirname, "..");
const EXPECTED_SHA = "1c79bd77bd76a968fe69aff678e0380e2a5be463";
const LOCK_ROOT = path.join(QA_ROOT, "locks");
const BB_BROWSER = process.env.DAILY_QA_BB_BROWSER || "d124-bb-playwright-20261031-2202z";
const AC_BROWSER = process.env.DAILY_QA_AC_BROWSER || "d125-ac-playwright-20261031-2205z";
const BB_APP = "d115b-ac-runner";
const RUN_ID = `combined-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const RUN_ROOT = path.join(QA_ROOT, "runs", RUN_ID);

function fail(message) { throw new Error(message); }
function exists(file) { return fs.existsSync(file); }
function docker(args, options = {}) {
  const result = spawnSync("docker", args, { encoding: "utf8", timeout: options.timeout || 120000 });
  if (result.error || result.status !== 0) fail(`docker ${args[0]} failed: ${String(result.stderr || result.error || "").slice(0, 500)}`);
  return result.stdout.trim();
}
function assertContainer(name) {
  const inspect = docker(["inspect", name]);
  const state = JSON.parse(inspect)[0].State;
  if (!state || !state.Running) fail(`required browser runner is not running: ${name}`);
}
function runSuite(container, config, env) {
  const result = spawnSync("docker", ["exec", "-e", "NODE_PATH=/qa/node_modules", ...Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]), container, "sh", "-lc", `/usr/local/bin/node /qa/node_modules/playwright/cli.js test --config=${config}`], { encoding: "utf8", timeout: 180000 });
  return { exitCode: result.status === null ? 1 : result.status, output: `${result.stdout || ""}\n${result.stderr || ""}` };
}

function run() {
  fs.mkdirSync(LOCK_ROOT, { recursive: true });
  const lock = path.join(LOCK_ROOT, "combined-nightly.lock");
  try {
    fs.mkdirSync(lock);
  } catch (error) {
    if (error.code === "EEXIST") { console.error("ALREADY_RUNNING"); return 3; }
    throw error;
  }
  fs.mkdirSync(path.join(RUN_ROOT, "BB"), { recursive: true });
  fs.mkdirSync(path.join(RUN_ROOT, "AC"), { recursive: true });
  fs.mkdirSync(path.join(RUN_ROOT, "combined"), { recursive: true });
  const report = { runId: RUN_ID, sourceSha: EXPECTED_SHA, startedAt: new Date().toISOString(), bb: {}, ac: {}, ac07: "NOT_COVERED" };
  try {
    const source = JSON.parse(fs.readFileSync(path.join(QA_ROOT, "contracts", "V12_SOURCE_IDENTITY_D121.json"), "utf8"));
    if (source.expected.commit !== EXPECTED_SHA || source.archive_verification.content_mismatches !== 0) fail("source identity gate failed");
    runtime.verifySourceIdentity({ source_sha: source.expected.commit, source_tree: source.expected.tree });
    assertContainer(BB_BROWSER);
    assertContainer(AC_BROWSER);
    const bb = runSuite(BB_BROWSER, "/qa-scratch/d101-config.cjs", { D101_PASSWORD: process.env.D101_PASSWORD || "" });
    fs.writeFileSync(path.join(RUN_ROOT, "BB", "playwright.log"), bb.output);
    report.bb = { executed: true, exitCode: bb.exitCode, passed: bb.exitCode === 0 };
    const ac = runSuite(AC_BROWSER, "/qa/suite/playwright.config.cjs", {
      AC_ADMIN_EMAIL: process.env.AC_ADMIN_EMAIL || "",
      AC_ADMIN_PASSWORD: process.env.AC_ADMIN_PASSWORD || "",
      AC_STAFF_EMAIL: process.env.AC_STAFF_EMAIL || "",
      AC_STAFF_PASSWORD: process.env.AC_STAFF_PASSWORD || "",
    });
    fs.writeFileSync(path.join(RUN_ROOT, "AC", "playwright.log"), ac.output);
    report.ac = { executed: true, exitCode: ac.exitCode, passed: ac.exitCode === 0 };
    report.status = report.bb.passed && report.ac.passed ? "PASS" : "FAIL";
    report.completedAt = new Date().toISOString();
    fs.writeFileSync(path.join(RUN_ROOT, "combined", "combined-report.json"), JSON.stringify(report, null, 2));
    return report.status === "PASS" ? 0 : 1;
  } catch (error) {
    report.status = "BLOCKED";
    report.error = error.message;
    report.completedAt = new Date().toISOString();
    fs.writeFileSync(path.join(RUN_ROOT, "combined", "combined-report.json"), JSON.stringify(report, null, 2));
    return 2;
  } finally {
    fs.rmSync(lock, { recursive: true, force: true });
  }
}

function runTestable(options = {}) {
  const source = options.source || { sha: EXPECTED_SHA, tree: "2ab57811f443dfe32e04b95a48b0c7567b1b6815" };
  if (source.sha !== EXPECTED_SHA || source.tree !== "2ab57811f443dfe32e04b95a48b0c7567b1b6815") throw new Error("source identity gate failed");
  if (options.database && (!options.database.bb || !options.database.ac)) throw new Error("database identity gate failed");
  if (options.network && (options.network.bb !== "d57a-20261031-1455z-bb-internal" || options.network.ac !== "d57a-20261031-1455z-ac-internal")) throw new Error("network isolation gate failed");
  if (options.credentials && (!options.credentials.bb || !options.credentials.ac)) throw new Error("credential gate failed");
  if (options.locked) return { exitCode: 3, status: "ALREADY_RUNNING" };
  if (options.isolationViolation) throw new Error("cross-product isolation violation");
  const report = { bb: null, ac: null };
  report.bb = (options.runStage || (() => ({ exitCode: 0 })))("bb");
  report.ac = (options.runStage || (() => ({ exitCode: 0 })))("ac");
  if (options.writeReport) options.writeReport(report);
  return { exitCode: report.bb.exitCode === 0 && report.ac.exitCode === 0 ? 0 : 1, report };
}

module.exports = { run, runTestable };

if (require.main === module) process.exitCode = run();
