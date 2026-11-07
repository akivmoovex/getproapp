"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "../../..");
const LOCK = path.join(ROOT, "locks", "daily-master.lock");
const OFFLINE = process.env.QA_OFFLINE_RUNNER || "";
const BROWSER = path.join(__dirname, "combinedNightlyCoordinator.js");

function runStage(label, command, args, env, timeout) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: "utf8",
    timeout,
  });
  return {
    label,
    exitCode: result.error && result.error.code === "ETIMEDOUT" ? 124 : (result.status ?? 1),
    timedOut: Boolean(result.error && result.error.code === "ETIMEDOUT"),
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function main(deps = {}) {
  const mkdir = deps.mkdir || fs.mkdirSync;
  const remove = deps.remove || fs.rmSync;
  const spawn = deps.runStage || runStage;
  const now = new Date().toISOString();
  mkdir(path.dirname(LOCK), { recursive: true });
  try {
    mkdir(LOCK);
  } catch (error) {
    if (error.code === "EEXIST") return { status: "ALREADY_RUNNING", exitCode: 3 };
    throw error;
  }
  const root = path.join(ROOT, "runs", `master-${now.replace(/[:.]/g, "-")}`);
  mkdir(path.join(root, "offline"), { recursive: true });
  mkdir(path.join(root, "browser"), { recursive: true });
  const report = { startedAt: now, offline: null, browser: null };
  try {
    report.offline = deps.runStage
      ? spawn("offline", process.execPath, [OFFLINE], { QA_ROOT: ROOT }, 10 * 60 * 1000)
      : (OFFLINE
        ? spawn("offline", process.execPath, [OFFLINE], { QA_ROOT: ROOT }, 10 * 60 * 1000)
        : { label: "offline", exitCode: 3, blocked: true, stderr: "QA_OFFLINE_RUNNER not configured" });
    report.browser = spawn("browser", process.execPath, [BROWSER], { QA_ROOT: ROOT }, 15 * 60 * 1000);
    report.status = report.offline.exitCode === 0 && report.browser.exitCode === 0 ? "PASS" : "FAIL";
    report.completedAt = new Date().toISOString();
    fs.writeFileSync(path.join(root, "master-report.json"), JSON.stringify(report, null, 2));
    return { status: report.status, exitCode: report.status === "PASS" ? 0 : 1, report };
  } finally {
    remove(LOCK, { recursive: true, force: true });
  }
}

if (require.main === module) process.exitCode = main().exitCode;
module.exports = { main, runStage };
