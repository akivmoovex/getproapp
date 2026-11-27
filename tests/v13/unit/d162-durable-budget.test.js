"use strict";

/**
 * D162 durable BlessBoard QA attempt budget.
 * Uses an isolated temporary directory. No PostgreSQL, Resend, or secret reads.
 */

const { describe, it, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const {
  LIVE_QA_ATTEMPT_BUDGET_DIRECTORY,
  openDurableQaAttemptBudget,
  provisionIsolatedQaAttemptBudget,
} = require("../../../src/platform/otp/otpQaAttemptBudget");
const {
  bindDurableAttemptBudget,
  evaluateQaLiveDelivery,
  QA_HTTP_ATTEMPT_LIMIT,
} = require("../../../src/platform/otp/otpQaLiveDelivery");
const { createResendOtpEmailTransport } = require("../../../src/platform/email/resendOtpTransport");
const { resolveServerLoginBinding } = require("../../../src/blessboard/services/blessBoardMemberLoginOtp");
const { approvedQaEnv, authorizedProbe, jsonResponse, RECIPIENT } = require("../helpers/qaDeliveryFixture");

const RUN = "d162-run-isolated";
const ROOT = path.resolve(__dirname, "..", "..", "..");
const ledgers = [];

function ledgerPath(name) {
  const directory = path.join(os.tmpdir(), `d162-${process.pid}-${name}-${Date.now()}`);
  ledgers.push(directory);
  return directory;
}

function removeLedger(directory) {
  try {
    fs.chmodSync(directory, 0o700);
  } catch {
    /* already gone */
  }
  let names = [];
  try {
    names = fs.readdirSync(directory);
  } catch {
    names = [];
  }
  for (const name of names) {
    try {
      fs.chmodSync(path.join(directory, name), 0o600);
    } catch {
      /* unreadable entry */
    }
  }
  fs.rmSync(directory, { recursive: true, force: true });
}

function reserveInChild(directory) {
  const code = `
    const { openDurableQaAttemptBudget } = require(${JSON.stringify(require.resolve("../../../src/platform/otp/otpQaAttemptBudget"))});
    const budget = openDurableQaAttemptBudget({
      directory: process.env.D162_BUDGET_DIR,
      runId: process.env.D162_BUDGET_RUN,
    });
    let accepted = 0;
    let reason = "";
    for (let n = 0; n < 5; n += 1) {
      const result = budget.tryReserve();
      if (!result || result.ok !== true || result.confirmed !== true) {
        reason = (result && result.reason) || "missing";
        break;
      }
      accepted += 1;
    }
    process.stdout.write(JSON.stringify({ accepted, reason }));
  `;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["-e", code], {
      env: {
        PATH: process.env.PATH || "",
        D162_BUDGET_DIR: directory,
        D162_BUDGET_RUN: RUN,
      },
    });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => {
      out += chunk;
    });
    child.stderr.on("data", (chunk) => {
      err += chunk;
    });
    child.on("exit", (status) => {
      if (status !== 0) {
        reject(new Error(err || out || `child ${status}`));
        return;
      }
      resolve(JSON.parse(out));
    });
  });
}

after(() => {
  for (const directory of ledgers) removeLedger(directory);
});

describe("D162 durable QA attempt budget", () => {
  it("accepts three attempts, rejects the fourth, and keeps them after restart", () => {
    const directory = ledgerPath("restart");
    const first = provisionIsolatedQaAttemptBudget({ directory, runId: RUN });
    assert.equal(first.tryReserve().ok, true);
    assert.equal(first.tryReserve().ok, true);
    assert.equal(first.tryReserve().ok, true);
    assert.equal(first.tryReserve().reason, "provider_budget_exhausted");
    const restarted = openDurableQaAttemptBudget({ directory, runId: RUN });
    assert.equal(restarted.restartSafe, true);
    assert.equal(restarted.snapshot().used, QA_HTTP_ATTEMPT_LIMIT);
    assert.equal(restarted.tryReserve().reason, "provider_budget_exhausted");
    const records = fs.readdirSync(directory).filter((name) => name.startsWith("attempt-"));
    assert.equal(records.length, 3);
    for (const name of records) {
      const body = fs.readFileSync(path.join(directory, name), "utf8");
      assert.equal(/otp|pepper|api_key|password/i.test(body), false);
      assert.equal(body.includes("1234"), false);
    }
  });

  it("keeps concurrent processes inside the three-attempt cap", async () => {
    const directory = ledgerPath("concurrent");
    provisionIsolatedQaAttemptBudget({ directory, runId: RUN });
    const [left, right] = await Promise.all([reserveInChild(directory), reserveInChild(directory)]);
    assert.equal(left.accepted + right.accepted, QA_HTTP_ATTEMPT_LIMIT);
    assert.equal(fs.readdirSync(directory).filter((name) => name.startsWith("attempt-")).length, 3);
    const reopened = openDurableQaAttemptBudget({ directory, runId: RUN });
    assert.equal(reopened.snapshot().used, 3);
    assert.equal(reopened.tryReserve().ok, false);
  });

  it("counts an interrupted reservation and does not replenish it", () => {
    const directory = ledgerPath("interrupted");
    provisionIsolatedQaAttemptBudget({ directory, runId: RUN });
    fs.writeFileSync(path.join(directory, "attempt-01"), "", { mode: 0o600 });
    fs.chmodSync(path.join(directory, "attempt-01"), 0o600);
    const budget = openDurableQaAttemptBudget({ directory, runId: RUN });
    assert.equal(budget.snapshot().used, 1);
    assert.equal(budget.tryReserve().slot, 2);
    assert.equal(budget.tryReserve().slot, 3);
    assert.equal(budget.tryReserve().reason, "provider_budget_exhausted");
    assert.equal(fs.readFileSync(path.join(directory, "attempt-01"), "utf8"), "");
  });

  it("fails closed for a missing, corrupt, mismatched, or unsafe ledger", () => {
    const missing = openDurableQaAttemptBudget({ directory: ledgerPath("missing"), runId: RUN });
    assert.equal(missing.tryReserve().reason, "budget_storage_missing");
    assert.equal(fs.existsSync(missing.directory), false);

    const corrupt = ledgerPath("corrupt");
    provisionIsolatedQaAttemptBudget({ directory: corrupt, runId: RUN });
    fs.writeFileSync(path.join(corrupt, "attempt-01"), '{"otp":"1234"}', { mode: 0o600 });
    fs.chmodSync(path.join(corrupt, "attempt-01"), 0o600);
    const corruptBudget = openDurableQaAttemptBudget({ directory: corrupt, runId: RUN });
    assert.equal(corruptBudget.tryReserve().reason, "budget_storage_corrupt");
    assert.equal(fs.readdirSync(corrupt).filter((name) => name.startsWith("attempt-")).length, 1);

    const mismatched = openDurableQaAttemptBudget({ directory: corrupt, runId: "d162-other-run" });
    assert.equal(mismatched.tryReserve().reason, "budget_run_mismatch");

    const unsafe = ledgerPath("unsafe");
    provisionIsolatedQaAttemptBudget({ directory: unsafe, runId: RUN });
    fs.chmodSync(unsafe, 0o755);
    const denied = openDurableQaAttemptBudget({ directory: unsafe, runId: RUN });
    assert.equal(denied.tryReserve().reason, "budget_permission_denied");
    fs.chmodSync(unsafe, 0o000);
    assert.equal(openDurableQaAttemptBudget({ directory: unsafe, runId: RUN }).snapshot().reason, "budget_permission_denied");
  });

  it("does not create the live ledger or a ledger inside the repository", () => {
    assert.equal(fs.existsSync(LIVE_QA_ATTEMPT_BUDGET_DIRECTORY), false);
    assert.throws(
      () => provisionIsolatedQaAttemptBudget({ directory: LIVE_QA_ATTEMPT_BUDGET_DIRECTORY, runId: RUN }),
      (error) => error.code === "live_budget_forbidden"
    );
    assert.throws(
      () => provisionIsolatedQaAttemptBudget({ directory: path.join(ROOT, ".d162-budget"), runId: RUN }),
      (error) => error.code === "live_budget_forbidden"
    );
    assert.equal(fs.existsSync(LIVE_QA_ATTEMPT_BUDGET_DIRECTORY), false);
    assert.equal(fs.existsSync(path.join(ROOT, ".d162-budget")), false);
  });

  it("reserves before a mocked timeout and does not fetch after exhaustion", async () => {
    const directory = ledgerPath("transport");
    const store = provisionIsolatedQaAttemptBudget({ directory, runId: RUN });
    let fetches = 0;
    const transport = createResendOtpEmailTransport(approvedQaEnv(), {
      databaseIdentityProbe: authorizedProbe(),
      attemptBudgetStore: store,
      fetchImpl: async () => {
        fetches += 1;
        const error = new Error("timed out");
        error.name = "TimeoutError";
        throw error;
      },
    });
    const timedOut = await transport({
      productCode: "blessboard",
      purpose: "login",
      destination: RECIPIENT,
      text: "synthetic verification message",
      idempotencyKey: "d162-timeout",
    });
    assert.equal(timedOut.ok, false);
    assert.equal(fetches, QA_HTTP_ATTEMPT_LIMIT);
    assert.equal(store.snapshot().used, QA_HTTP_ATTEMPT_LIMIT);
    const blocked = await transport({
      productCode: "blessboard",
      purpose: "login",
      destination: RECIPIENT,
      text: "synthetic verification message",
      idempotencyKey: "d162-after-cap",
    });
    assert.equal(blocked.reason, "provider_budget_exhausted");
    assert.equal(fetches, QA_HTTP_ATTEMPT_LIMIT);
  });

  it("does not reserve for the wrong recipient, sender, or a production signal", async () => {
    const directory = ledgerPath("scope");
    const store = provisionIsolatedQaAttemptBudget({ directory, runId: RUN });
    let fetches = 0;
    const deps = {
      databaseIdentityProbe: authorizedProbe(),
      attemptBudgetStore: store,
      fetchImpl: async () => {
        fetches += 1;
        return jsonResponse(200, { id: "not-sent" });
      },
    };
    const recipient = await createResendOtpEmailTransport(approvedQaEnv(), deps)({
      productCode: "blessboard",
      purpose: "login",
      destination: "other.person@pronline.org",
      text: "synthetic verification message",
      idempotencyKey: "d162-recipient",
    });
    assert.equal(recipient.ok, false);
    const sender = await createResendOtpEmailTransport(approvedQaEnv(), deps)({
      productCode: "activeclinic",
      purpose: "login",
      destination: RECIPIENT,
      text: "synthetic verification message",
      idempotencyKey: "d162-sender",
    });
    assert.equal(sender.ok, false);
    const production = await createResendOtpEmailTransport(approvedQaEnv({ NODE_ENV: "production" }), deps)({
      productCode: "blessboard",
      purpose: "login",
      destination: RECIPIENT,
      text: "synthetic verification message",
      idempotencyKey: "d162-production",
    });
    assert.equal(production.ok, false);
    assert.equal(store.snapshot().used, 0);
    assert.equal(fetches, 0);
    const decision = await evaluateQaLiveDelivery(approvedQaEnv({ NODE_ENV: "production" }), {
      productCode: "blessboard",
      purpose: "login",
      destination: RECIPIENT,
      attemptBudgetStore: store,
      databaseIdentityProbe: () => {
        throw new Error("probe_not_allowed");
      },
    });
    assert.equal(decision.authorized, false);
    assert.ok(decision.reasons.includes("production_environment"));
  });

  it("lets a healthy ledger reach the QA gate and leaves D161 login binding unchanged", async () => {
    const directory = ledgerPath("gate");
    const store = provisionIsolatedQaAttemptBudget({ directory, runId: RUN });
    const decision = await evaluateQaLiveDelivery(approvedQaEnv(), {
      productCode: "blessboard",
      purpose: "login",
      destination: RECIPIENT,
      attemptBudgetStore: store,
      databaseIdentityProbe: authorizedProbe(),
    });
    assert.equal(decision.authorized, true);
    assert.equal(store.snapshot().used, 0);
    const route = fs.readFileSync(path.join(ROOT, "src/blessboard/http/memberPortalAuthRoutes.js"), "utf8");
    assert.match(route, /establishSession: !otpActive/);
    assert.match(route, /protectedActionCompleted: true/);
    assert.match(route, /otpWorkflow: "blessboard.member_login"/);
    const bound = resolveServerLoginBinding({
      organizationId: "11111111-1111-4111-8111-111111111111",
      accountId: "22222222-2222-4222-8222-222222222222",
      churchId: "church-d162",
      memberId: "member-d162",
      verifiedEmail: "member.d162@pronline.org",
      destination: "forged.d162@example.test",
    });
    assert.equal(bound.destination, "member.d162@pronline.org");
  });

  it("denies a process-local budget, a missing identity, and a retried failure", async () => {
    const directory = ledgerPath("fallback");
    const store = provisionIsolatedQaAttemptBudget({ directory, runId: RUN });
    const memory = bindDurableAttemptBudget({ durable: true, restartSafe: true, used: 0 });
    let fetches = 0;
    const local = await createResendOtpEmailTransport(approvedQaEnv(), {
      databaseIdentityProbe: () => {
        throw new Error("probe_not_allowed");
      },
      attemptBudgetStore: memory,
      fetchImpl: async () => {
        fetches += 1;
        return jsonResponse(200, { id: "local" });
      },
    })({
      productCode: "blessboard",
      purpose: "login",
      destination: RECIPIENT,
      text: "synthetic verification message",
      idempotencyKey: "d162-local",
    });
    assert.equal(local.ok, false);
    assert.equal(local.reason, "provider_budget_not_durable");
    assert.equal(fetches, 0);
    assert.equal(memory.snapshot().used, 0);

    const missingIdentity = await evaluateQaLiveDelivery(approvedQaEnv(), {
      productCode: "blessboard",
      purpose: "login",
      destination: RECIPIENT,
      attemptBudgetStore: store,
    });
    assert.equal(missingIdentity.authorized, false);
    assert.ok(missingIdentity.reasons.includes("database_identity_unverified"));
    assert.equal(store.snapshot().used, 0);

    const retried = await createResendOtpEmailTransport(approvedQaEnv(), {
      databaseIdentityProbe: authorizedProbe(),
      attemptBudgetStore: store,
      fetchImpl: async () => {
        fetches += 1;
        return jsonResponse(503, { name: "provider_unavailable" });
      },
    })({
      productCode: "blessboard",
      purpose: "login",
      destination: RECIPIENT,
      text: "synthetic verification message",
      idempotencyKey: "d162-retry",
    });
    assert.equal(retried.ok, false);
    assert.equal(fetches, QA_HTTP_ATTEMPT_LIMIT);
    assert.equal(store.snapshot().used, QA_HTTP_ATTEMPT_LIMIT);
  });
});
