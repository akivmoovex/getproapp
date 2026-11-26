"use strict";

/**
 * Operator-safe OTP readiness diagnostics.
 * Never returns API keys, peppers, OTP codes, destinations, or mailbox credentials.
 * Does not invent Resend dashboard verification — only reports configured allowlists.
 */

const fs = require("fs");
const path = require("path");
const { resolveOtpActivation } = require("./otpActivation");
const { isProductionSignal, isFixedOtpPermitted } = require("./otpEnvironment");
const { resolveOtpProvider } = require("./otpProviders");
const { resolveProductSender, senderProfile } = require("../email/resendSenderCatalog");

const MIGRATION_048 = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "db",
  "migrations",
  "platform",
  "048_otp_challenges.sql"
);

function hasNonEmpty(env, key) {
  return String((env && env[key]) || "").trim().length > 0;
}

function configuredVerifiedDomains(env) {
  return String((env && env.GETPRO_RESEND_VERIFIED_DOMAINS) || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 32);
}

function storeMode(options) {
  const opts = options || {};
  if (opts.pool && typeof opts.pool.query === "function") return "postgres";
  if (isProductionSignal(opts.env)) return "unavailable_without_pool";
  return "memory_or_unattached";
}

function recoveryMode(activationStatus) {
  return activationStatus === "ACTIVE" ? "code_otp_required" : "password_reset_link";
}

function migration048Present() {
  try {
    return fs.existsSync(MIGRATION_048);
  } catch {
    return false;
  }
}

/**
 * Synchronous configuration snapshot. Table presence requires diagnoseOtpReadinessAsync.
 */
function diagnoseOtpReadiness(env, options) {
  const source = env || {};
  const opts = options || {};
  const activation = resolveOtpActivation(source, opts.activation);
  const provider = resolveOtpProvider(source, opts);
  const domains = configuredVerifiedDomains(source);
  const apiKeyConfigured = hasNonEmpty(source, "RESEND_API_KEY");
  const pepperConfigured = hasNonEmpty(source, "GETPRO_OTP_PEPPER");
  const senderProfileName = senderProfile(source);
  const products = ["activeclinic", "blessboard", "pronline"].map((productCode) => {
    const routed = resolveProductSender(productCode, source);
    return {
      productCode,
      senderOk: routed.ok === true,
      reason: routed.reason || "unknown",
      profile: routed.profile || senderProfileName,
      domain: routed.sender ? routed.sender.domain : null,
    };
  });
  const blockers = [];
  if (activation.status !== "ACTIVE") blockers.push("activation_blocked");
  if (!pepperConfigured) blockers.push("pepper_missing");
  if (storeMode({ env: source, pool: opts.pool }) === "unavailable_without_pool") {
    blockers.push("store_unavailable_without_pool");
  }
  if (migration048Present()) blockers.push("unexpected_migration_048_present");
  if (String(source.GETPRO_OTP_PROVIDER || "").trim().toLowerCase() === "resend") {
    if (!apiKeyConfigured) blockers.push("resend_api_key_missing");
    if (domains.length === 0) blockers.push("resend_verified_domains_unconfigured");
    const anySender = products.some((row) => row.senderOk);
    if (!anySender) blockers.push("resend_sender_not_verified_in_config");
  }
  if (provider.deliveryActivated === true) blockers.push("delivery_activated_forbidden");

  return Object.freeze({
    activation: activation.status,
    activationReasons: activation.reasons.slice(),
    productionSignal: isProductionSignal(source),
    fixedCodePermitted: isFixedOtpPermitted(source),
    storeMode: storeMode({ env: source, pool: opts.pool }),
    pepperConfigured,
    providerName: provider.name || "inactive",
    emailProviderName: provider.emailName || null,
    deliveryActivated: provider.deliveryActivated === true,
    contactsNetwork: provider.contactsNetwork === true,
    resendApiKeyConfigured: apiKeyConfigured,
    resendVerifiedDomainsConfigured: domains.slice(),
    resendSenderProfile: senderProfileName,
    productSenders: Object.freeze(products),
    recoveryMode: recoveryMode(activation.status),
    migration048Present: migration048Present(),
    schemaTables: Object.freeze({
      otpChallenges: opts.tablePresence && opts.tablePresence.otpChallenges === true,
      otpRateBuckets: opts.tablePresence && opts.tablePresence.otpRateBuckets === true,
      probed: Boolean(opts.tablePresence),
    }),
    liveMailboxAuthorized: false,
    blockers: Object.freeze(blockers),
    emailOtpQaGoNoGo: "NO-GO",
  });
}

async function probeOtpTables(pool) {
  if (!pool || typeof pool.query !== "function") {
    return { otpChallenges: false, otpRateBuckets: false, probed: false, error: "no_pool" };
  }
  try {
    const result = await pool.query(
      `SELECT
         to_regclass('platform.otp_challenges') IS NOT NULL AS otp_challenges,
         to_regclass('platform.otp_rate_buckets') IS NOT NULL AS otp_rate_buckets`
    );
    const row = result.rows[0] || {};
    return {
      otpChallenges: row.otp_challenges === true,
      otpRateBuckets: row.otp_rate_buckets === true,
      probed: true,
      error: null,
    };
  } catch (error) {
    return {
      otpChallenges: false,
      otpRateBuckets: false,
      probed: true,
      error: String((error && error.code) || "probe_failed").slice(0, 64),
    };
  }
}

async function diagnoseOtpReadinessAsync(env, options) {
  const opts = options || {};
  const tablePresence = await probeOtpTables(opts.pool);
  const base = diagnoseOtpReadiness(env, { ...opts, tablePresence });
  const blockers = base.blockers.slice();
  if (tablePresence.probed && (!tablePresence.otpChallenges || !tablePresence.otpRateBuckets)) {
    blockers.push("otp_schema_tables_absent");
  }
  return Object.freeze({
    ...base,
    schemaTables: Object.freeze({
      otpChallenges: tablePresence.otpChallenges === true,
      otpRateBuckets: tablePresence.otpRateBuckets === true,
      probed: tablePresence.probed === true,
      probeError: tablePresence.error,
    }),
    blockers: Object.freeze(blockers),
  });
}

module.exports = {
  diagnoseOtpReadiness,
  diagnoseOtpReadinessAsync,
  probeOtpTables,
};
