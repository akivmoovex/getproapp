"use strict";

/**
 * Attach the QA probe and a caller-supplied durable budget.
 * This does not activate OTP, read secrets, open PostgreSQL, or create a budget ledger.
 * A caller-supplied network implementation is ignored, so boot cannot install a bypass.
 */

const { isProductionSignal } = require("./otpEnvironment");
const { inspectDatabaseUrl, isLiveAttemptBudget, QA_ACTIVATION_VALUE } = require("./otpQaLiveDelivery");
const { createDatabaseIdentityProbe } = require("./otpQaIdentityProbe");
const { attachOtpQaDeliveryDependencies } = require("./otpSessionGate");

function signal(source, name) {
  return String((source && source[name]) || "")
    .trim()
    .toLowerCase();
}

function qaBootMayAttach(env) {
  const source = env || {};
  if (isProductionSignal(process.env) || isProductionSignal(source)) {
    return { ok: false, reason: "production_environment" };
  }
  if (String(source.GETPRO_OTP_QA_LIVE_DELIVERY || "").trim() !== QA_ACTIVATION_VALUE) {
    return { ok: false, reason: "qa_live_delivery_not_approved" };
  }
  if (signal(source, "DEPLOYMENT_ENV") !== "testing" || signal(source, "DATABASE_IDENTITY_ENV") !== "testing") {
    return { ok: false, reason: "testing_environment_required" };
  }
  if (!["test", "testing", "development"].includes(signal(source, "NODE_ENV"))) {
    return { ok: false, reason: "testing_environment_required" };
  }
  const url = inspectDatabaseUrl(source);
  if (!url.ok) return { ok: false, reason: url.reasons[0] || "database_identity_mismatch" };
  return { ok: true, reason: "qa_boot_attachable" };
}

function durableBudget(store) {
  return isLiveAttemptBudget(store);
}

function attachQaOtpBoot(env, deps) {
  const decision = qaBootMayAttach(env);
  if (!decision.ok) return decision;
  const options = deps || {};
  const budgetAttached = durableBudget(options.attemptBudgetStore);
  attachOtpQaDeliveryDependencies({
    env,
    databaseIdentityProbe:
      typeof options.databaseIdentityProbe === "function"
        ? options.databaseIdentityProbe
        : createDatabaseIdentityProbe({ env, query: options.query, clientFactory: options.clientFactory }),
    attemptBudgetStore: budgetAttached ? options.attemptBudgetStore : null,
  });
  return { ok: true, reason: "qa_boot_attached", budgetAttached };
}

module.exports = {
  qaBootMayAttach,
  attachQaOtpBoot,
};
