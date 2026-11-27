"use strict";

/**
 * Run-scoped BlessBoard QA Resend attempt ledger.
 * Each attempt is an exclusive slot file. Creating the file is the reservation.
 * An empty or unconfirmed slot still counts, including after a crash.
 * This module does not create the live ledger, call Resend, or store secrets.
 */

const fs = require("fs");
const path = require("path");
const {
  QA_HTTP_ATTEMPT_LIMIT,
  QA_PRODUCT,
  QA_PURPOSE,
  QA_SENDER_EMAIL,
} = require("./otpQaLiveDelivery");

const LIVE_QA_ATTEMPT_BUDGET_DIRECTORY = path.resolve(__dirname, "..", "..", "..", ".v13-qa-otp-budget");
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");
const RUN_FILE = "run-id";
const RUN_ID_RE = /^[a-z0-9][a-z0-9._-]{7,63}$/;
const FORBIDDEN_RECORD = /"(?:otp|code|pepper|api_key|apiKey|secret|password|authorization|bearer)"/i;

function slotName(slot) {
  return `attempt-${String(slot).padStart(2, "0")}`;
}

function failure(reason) {
  return {
    ok: false,
    confirmed: false,
    reason,
    limit: QA_HTTP_ATTEMPT_LIMIT,
  };
}

function inside(root, candidate) {
  const base = path.resolve(root);
  const target = path.resolve(candidate);
  return target === base || target.startsWith(`${base}${path.sep}`);
}

function ownerOnly(stat, directory) {
  if (!stat || stat.isSymbolicLink()) return "budget_storage_corrupt";
  if (directory ? !stat.isDirectory() : !stat.isFile()) return "budget_storage_corrupt";
  if (typeof process.getuid === "function" && stat.uid !== process.getuid()) return "budget_permission_denied";
  const mode = stat.mode & 0o777;
  if (mode !== (directory ? 0o700 : 0o600)) return "budget_permission_denied";
  return "";
}

function classifyIo(error) {
  if (error && (error.code === "ENOENT" || error.code === "ENOTDIR")) return "budget_storage_missing";
  if (error && (error.code === "EACCES" || error.code === "EPERM")) return "budget_permission_denied";
  return "budget_storage_unavailable";
}

function fsyncDirectory(directory) {
  const fd = fs.openSync(directory, "r");
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function readRunFile(directory) {
  let text;
  try {
    text = fs.readFileSync(path.join(directory, RUN_FILE), "utf8");
  } catch (error) {
    return { reason: classifyIo(error) };
  }
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length !== 1 || !RUN_ID_RE.test(lines[0]) || FORBIDDEN_RECORD.test(lines[0])) {
    return { reason: "budget_storage_corrupt" };
  }
  return { runId: lines[0] };
}

function inspectLedger(directory, expectedRunId) {
  if (!RUN_ID_RE.test(expectedRunId)) return { reason: "budget_run_mismatch" };
  let dirStat;
  try {
    dirStat = fs.lstatSync(directory);
  } catch (error) {
    return { reason: classifyIo(error) };
  }
  const dirProblem = ownerOnly(dirStat, true);
  if (dirProblem) return { reason: dirProblem };
  let runStat;
  try {
    runStat = fs.lstatSync(path.join(directory, RUN_FILE));
  } catch (error) {
    return { reason: classifyIo(error) };
  }
  const runProblem = ownerOnly(runStat, false);
  if (runProblem) return { reason: runProblem };
  const identity = readRunFile(directory);
  if (identity.reason) return identity;
  if (identity.runId !== expectedRunId) return { reason: "budget_run_mismatch" };
  let names;
  try {
    names = fs.readdirSync(directory);
  } catch (error) {
    return { reason: classifyIo(error) };
  }
  const allowed = new Set([RUN_FILE]);
  for (let slot = 1; slot <= QA_HTTP_ATTEMPT_LIMIT; slot += 1) allowed.add(slotName(slot));
  const slots = [];
  for (const name of names) {
    if (!allowed.has(name)) return { reason: "budget_storage_corrupt" };
    if (name === RUN_FILE) continue;
    const full = path.join(directory, name);
    let stat;
    try {
      stat = fs.lstatSync(full);
    } catch (error) {
      return { reason: classifyIo(error) };
    }
    const problem = ownerOnly(stat, false);
    if (problem) return { reason: problem };
    let body = "";
    try {
      body = fs.readFileSync(full, "utf8");
    } catch (error) {
      return { reason: classifyIo(error) };
    }
    const slot = Number(name.slice("attempt-".length));
    if (!body) {
      slots.push({ slot, confirmed: false });
      continue;
    }
    if (FORBIDDEN_RECORD.test(body)) return { reason: "budget_storage_corrupt" };
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      return { reason: "budget_storage_corrupt" };
    }
    if (
      !parsed ||
      parsed.runId !== expectedRunId ||
      parsed.slot !== slot ||
      parsed.product !== QA_PRODUCT ||
      parsed.purpose !== QA_PURPOSE ||
      parsed.sender !== QA_SENDER_EMAIL ||
      Object.keys(parsed).some((key) => !["runId", "slot", "product", "purpose", "sender", "confirmed"].includes(key))
    ) {
      return { reason: "budget_storage_corrupt" };
    }
    slots.push({ slot, confirmed: parsed.confirmed === true });
  }
  slots.sort((left, right) => left.slot - right.slot);
  return { slots, used: slots.length };
}

function openDurableQaAttemptBudget(options) {
  const directory = path.resolve(String((options && options.directory) || ""));
  const runId = String((options && options.runId) || "").trim();
  return {
    durable: true,
    restartSafe: true,
    crashSafe: true,
    backend: "exclusive-slot-file",
    limit: QA_HTTP_ATTEMPT_LIMIT,
    directory,
    runId,
    tryReserve() {
      const inspected = inspectLedger(directory, runId);
      if (inspected.reason) return failure(inspected.reason);
      if (inspected.used >= QA_HTTP_ATTEMPT_LIMIT) return failure("provider_budget_exhausted");
      let fd = 0;
      let slot = 0;
      try {
        for (let candidate = 1; candidate <= QA_HTTP_ATTEMPT_LIMIT; candidate += 1) {
          try {
            fd = fs.openSync(path.join(directory, slotName(candidate)), "wx", 0o600);
            slot = candidate;
            break;
          } catch (error) {
            if (error && error.code === "EEXIST") continue;
            return failure(classifyIo(error));
          }
        }
        if (!fd) return failure("provider_budget_exhausted");
        fs.chmodSync(path.join(directory, slotName(slot)), 0o600);
        const pending = {
          runId,
          slot,
          product: QA_PRODUCT,
          purpose: QA_PURPOSE,
          sender: QA_SENDER_EMAIL,
          confirmed: false,
        };
        fs.writeFileSync(fd, JSON.stringify(pending), "utf8");
        fs.fsyncSync(fd);
        fs.closeSync(fd);
        fd = 0;
        fsyncDirectory(directory);
        const confirmedFd = fs.openSync(path.join(directory, slotName(slot)), "r+");
        try {
          const confirmed = { ...pending, confirmed: true };
          fs.ftruncateSync(confirmedFd, 0);
          fs.writeSync(confirmedFd, JSON.stringify(confirmed), 0, "utf8");
          fs.fsyncSync(confirmedFd);
        } finally {
          fs.closeSync(confirmedFd);
        }
        fsyncDirectory(directory);
      } catch {
        if (fd) {
          try {
            fs.closeSync(fd);
          } catch {
            /* The slot file already exists, so the attempt stays consumed. */
          }
        }
        return failure("budget_reservation_unconfirmed");
      }
      const check = inspectLedger(directory, runId);
      if (check.reason || !check.slots.some((item) => item.slot === slot && item.confirmed === true)) {
        return failure(check.reason || "budget_reservation_unconfirmed");
      }
      return {
        ok: true,
        confirmed: true,
        reason: "reserved",
        slot,
        used: check.used,
        limit: QA_HTTP_ATTEMPT_LIMIT,
        remaining: QA_HTTP_ATTEMPT_LIMIT - check.used,
      };
    },
    snapshot() {
      const inspected = inspectLedger(directory, runId);
      if (inspected.reason) {
        return {
          durable: true,
          restartSafe: true,
          crashSafe: true,
          limit: QA_HTTP_ATTEMPT_LIMIT,
          used: null,
          reason: inspected.reason,
        };
      }
      return {
        durable: true,
        restartSafe: true,
        crashSafe: true,
        limit: QA_HTTP_ATTEMPT_LIMIT,
        used: inspected.used,
        confirmed: inspected.slots.filter((item) => item.confirmed).length,
      };
    },
  };
}

function provisionIsolatedQaAttemptBudget(options) {
  const directory = path.resolve(String((options && options.directory) || ""));
  const runId = String((options && options.runId) || "").trim();
  if (!RUN_ID_RE.test(runId)) {
    const error = new Error("budget_run_mismatch");
    error.code = "budget_run_mismatch";
    throw error;
  }
  if (inside(LIVE_QA_ATTEMPT_BUDGET_DIRECTORY, directory) || inside(REPO_ROOT, directory)) {
    const error = new Error("live_budget_forbidden");
    error.code = "live_budget_forbidden";
    throw error;
  }
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
  const runFile = path.join(directory, RUN_FILE);
  const fd = fs.openSync(runFile, "wx", 0o600);
  try {
    fs.writeFileSync(fd, `${runId}\n`, "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.chmodSync(runFile, 0o600);
  fsyncDirectory(directory);
  return openDurableQaAttemptBudget({ directory, runId });
}

module.exports = {
  LIVE_QA_ATTEMPT_BUDGET_DIRECTORY,
  openDurableQaAttemptBudget,
  provisionIsolatedQaAttemptBudget,
};
