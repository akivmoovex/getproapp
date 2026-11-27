"use strict";

/**
 * Fail-closed gate for a future BlessBoard login QA email.
 * A live send requires a freshly invoked identity probe and a durable
 * attempt budget. This module does not open PostgreSQL, call Resend,
 * or read secret values. Caller-supplied attestation objects are ignored.
 *
 * A future probe must query the approved cluster and return observations:
 * current_database(), inet_server_port(), current_user, connection host,
 * platform.database_identity identity_key and environment_code, and
 * cluster instance id. Data-directory and socket-directory evidence comes
 * from the listener postmaster.pid, not from current_setting(). The gate
 * compares those observations with the constants below. It does not treat
 * DATABASE_URL or DATABASE_IDENTITY_EXPECTED as identity evidence.
 */

const crypto = require("crypto");
const path = require("path");
const { isProductionSignal, PUBLISHED_TESTING_PEPPER } = require("./otpEnvironment");

const QA_DATABASE_NAME = "getpro_v13_e2e_g78d2301";
const LISTENER_PATH_EVIDENCE = "listener_postmaster_pid";
const QA_DATABASE_HOST = "127.0.0.1";
const QA_DATABASE_PORT = "55432";
const QA_DATABASE_ROLE = "v13_regression_213101";
const QA_CURRENT_USER = QA_DATABASE_ROLE;
const QA_SHARED_PORT = "5432";
const QA_VERIFIED_DOMAIN = "pronline.org";
const QA_SENDER_PROFILE = "hosted-qa";
const QA_SENDER_EMAIL = "qa-blessboard@pronline.org";
const QA_ACTIVATION_VALUE = "owner-approved";
const QA_PRODUCT = "blessboard";
const QA_PURPOSE = "login";
const QA_IDENTITY_KEY = "moovex-platform-v7";
const QA_INSTANCE_ID = "v13-regression-213101";
const QA_HTTP_ATTEMPT_LIMIT = 3;
const QA_MAX_RECIPIENTS = 1;
const QA_MAX_SENDERS = 1;
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
const APPROVED_QA_DATA_DIRECTORY = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  ".v13-isolated-pg",
  "data"
);
const APPROVED_QA_SOCKET_DIRECTORY = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  ".v13-isolated-pg",
  "run"
);

function signal(source, name) {
  return String((source && source[name]) || "")
    .trim()
    .toLowerCase();
}

function push(reasons, reason) {
  if (reason && !reasons.includes(reason)) reasons.push(reason);
}

function normalizeProduct(productCode) {
  const value = String(productCode || "")
    .trim()
    .toLowerCase();
  if (value === "bb") return "blessboard";
  if (value === "ac") return "activeclinic";
  return value;
}

function classifyQaRecipientAllowlist(env) {
  const raw = String((env && env.GETPRO_RESEND_QA_RECIPIENTS) || "");
  if (!raw.trim()) {
    return { ok: false, reason: "qa_recipient_allowlist_missing", allow: new Set() };
  }
  const tokens = raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
  if (tokens.length === 0) {
    return { ok: false, reason: "qa_recipient_allowlist_missing", allow: new Set() };
  }
  const allow = new Set();
  for (const token of tokens) {
    if (token.includes("*") || token.includes("?") || !EMAIL_RE.test(token)) {
      return { ok: false, reason: "qa_recipient_allowlist_rejected", allow: new Set() };
    }
    allow.add(token);
  }
  if (allow.size !== QA_MAX_RECIPIENTS) {
    return { ok: false, reason: "qa_recipient_allowlist_rejected", allow: new Set() };
  }
  return { ok: true, reason: "allowlisted", allow };
}

function qaRecipientAllowlist(env) {
  return classifyQaRecipientAllowlist(env).allow;
}

function assertQaRecipientMembership(env, destination) {
  const classified = classifyQaRecipientAllowlist(env);
  if (!classified.ok) return { ok: false, reason: classified.reason };
  const email = String(destination || "")
    .trim()
    .toLowerCase();
  if (!EMAIL_RE.test(email) || !classified.allow.has(email)) {
    return { ok: false, reason: "qa_recipient_not_allowlisted" };
  }
  return { ok: true, reason: "allowlisted" };
}

function isLiveAttemptBudget(store) {
  if (!store || typeof store.tryReserve !== "function") return false;
  if (store.backend !== "exclusive-slot-file") return false;
  if (store.durable !== true || store.restartSafe !== true || store.crashSafe !== true) return false;
  if (store.limit !== QA_HTTP_ATTEMPT_LIMIT) return false;
  if (typeof store.snapshot !== "function") return false;
  let snap;
  try {
    snap = store.snapshot();
  } catch {
    return false;
  }
  if (!snap || snap.reason || snap.restartSafe !== true || snap.crashSafe !== true) return false;
  const used = Number(snap.used);
  return Number.isInteger(used) && used >= 0 && used <= QA_HTTP_ATTEMPT_LIMIT;
}

function budgetConfigurationReason(env) {
  const raw = env && env.GETPRO_OTP_QA_PROVIDER_BUDGET;
  if (raw == null || String(raw).trim() === "") return "provider_budget_missing";
  if (String(raw).trim() !== String(QA_HTTP_ATTEMPT_LIMIT)) return "provider_budget_rejected";
  return null;
}

function createProbeRequest() {
  return Object.freeze({
    nonce: crypto.randomBytes(16).toString("hex"),
    connect: Object.freeze({
      host: QA_DATABASE_HOST,
      port: QA_DATABASE_PORT,
      database: QA_DATABASE_NAME,
      username: QA_CURRENT_USER,
    }),
  });
}

function validateIdentityObservation(request, report) {
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    return "database_identity_malformed";
  }
  if (!request || report.nonce !== request.nonce) return "database_identity_stale";
  if (report.ok !== true || report.evidence !== "postgresql_observation") {
    return "database_identity_unverified";
  }
  if (report.pathEvidence !== LISTENER_PATH_EVIDENCE) {
    return "database_identity_unverified";
  }
  const port = String(report.inetServerPort != null ? report.inetServerPort : report.port || "");
  const required = [
    report.currentDatabase,
    port,
    report.host,
    report.currentUser,
    report.identityKey,
    report.identityEnv,
    report.instanceId,
    report.dataDirectory,
    report.socketDirectory,
  ];
  if (required.some((value) => String(value || "").trim() === "")) {
    return "database_identity_malformed";
  }
  let dataDirectory = "";
  let socketDirectory = "";
  try {
    dataDirectory = path.resolve(String(report.dataDirectory));
    socketDirectory = path.resolve(String(report.socketDirectory).split(",")[0].trim());
  } catch {
    return "database_identity_malformed";
  }
  if (
    report.currentDatabase !== QA_DATABASE_NAME ||
    port !== QA_DATABASE_PORT ||
    String(report.host) !== QA_DATABASE_HOST ||
    String(report.currentUser) !== QA_CURRENT_USER ||
    String(report.identityKey) !== QA_IDENTITY_KEY ||
    String(report.identityEnv).trim().toLowerCase() !== "testing" ||
    String(report.instanceId) !== QA_INSTANCE_ID ||
    dataDirectory !== APPROVED_QA_DATA_DIRECTORY ||
    socketDirectory !== APPROVED_QA_SOCKET_DIRECTORY
  ) {
    return "database_identity_mismatch";
  }
  return null;
}

function inspectDatabaseUrl(env) {
  const reasons = [];
  const raw = String((env && env.DATABASE_URL) || "").trim();
  if (!raw) return { ok: false, reasons: ["database_url_missing"], target: null };
  if (/[?&](?:database|db)=/i.test(raw)) {
    return { ok: false, reasons: ["database_identity_mismatch"], target: null };
  }
  let parsed;
  try {
    parsed = new URL(raw.replace(/^postgresql:/i, "postgres:"));
  } catch {
    return { ok: false, reasons: ["database_identity_mismatch"], target: null };
  }
  if (parsed.protocol !== "postgres:") {
    return { ok: false, reasons: ["database_identity_mismatch"], target: null };
  }
  const host = String(parsed.hostname || "").toLowerCase();
  const port = parsed.port || QA_SHARED_PORT;
  let database = "";
  let username = "";
  try {
    database = decodeURIComponent(String(parsed.pathname || "").replace(/^\//, ""));
    username = decodeURIComponent(parsed.username || "");
  } catch {
    return { ok: false, reasons: ["database_identity_mismatch"], target: null };
  }
  if (host !== QA_DATABASE_HOST) push(reasons, "database_host_not_loopback");
  if (port === QA_SHARED_PORT) push(reasons, "database_port_shared");
  else if (port !== QA_DATABASE_PORT) push(reasons, "database_port_not_isolated");
  if (database !== QA_DATABASE_NAME || username !== QA_DATABASE_ROLE) {
    push(reasons, "database_identity_mismatch");
  }
  const target =
    reasons.length === 0 ? Object.freeze({ host, port, database, username }) : null;
  return { ok: reasons.length === 0, reasons, target };
}

function collectConfigurationReasons(env, deps) {
  const source = env || {};
  const options = deps || {};
  const reasons = [];
  if (
    isProductionSignal(source) ||
    signal(source, "NODE_ENV") === "production" ||
    signal(source, "DEPLOYMENT_ENV") === "production" ||
    signal(source, "DATABASE_IDENTITY_ENV") === "production"
  ) {
    push(reasons, "production_environment");
  } else if (
    signal(source, "DEPLOYMENT_ENV") !== "testing" ||
    signal(source, "DATABASE_IDENTITY_ENV") !== "testing" ||
    !["test", "testing", "development"].includes(signal(source, "NODE_ENV"))
  ) {
    push(reasons, "testing_environment_required");
  }
  if (String(source.GETPRO_OTP_QA_LIVE_DELIVERY || "").trim() !== QA_ACTIVATION_VALUE) {
    push(reasons, "qa_live_delivery_not_approved");
  }
  if (signal(source, "GETPRO_RESEND_SENDER_PROFILE") !== QA_SENDER_PROFILE) {
    push(reasons, "sender_profile_not_approved");
  }
  const domains = String(source.GETPRO_RESEND_VERIFIED_DOMAINS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  if (!String(source.GETPRO_RESEND_VERIFIED_DOMAINS || "").trim() || domains.length === 0) {
    push(reasons, "verified_domain_missing");
  } else if (domains.length !== 1 || domains[0] !== QA_VERIFIED_DOMAIN) {
    push(reasons, "verified_domain_not_exact");
  }
  const recipients = classifyQaRecipientAllowlist(source);
  if (!recipients.ok) push(reasons, recipients.reason);
  if (options.destination != null && recipients.ok) {
    const membership = assertQaRecipientMembership(source, options.destination);
    if (!membership.ok) push(reasons, membership.reason);
  }
  if (!String(source.RESEND_API_KEY || "").trim()) push(reasons, "missing_api_key");
  const pepper = String(source.GETPRO_OTP_PEPPER || "").trim();
  const sessionSecret = String(source.SESSION_SECRET || "").trim();
  if (!pepper) push(reasons, "otp_pepper_missing");
  else if (
    pepper.length < 32 ||
    pepper === PUBLISHED_TESTING_PEPPER ||
    (sessionSecret && pepper === sessionSecret)
  ) {
    push(reasons, "otp_pepper_rejected");
  }
  if (normalizeProduct(options.productCode) !== QA_PRODUCT) push(reasons, "unauthorized_product");
  if (String(options.purpose || "").trim().toLowerCase() !== QA_PURPOSE) {
    push(reasons, "unauthorized_purpose");
  }
  const budgetReason = budgetConfigurationReason(source);
  if (budgetReason) push(reasons, budgetReason);
  const store = options.attemptBudgetStore;
  if (!budgetReason) {
    if (!store || typeof store.tryReserve !== "function") push(reasons, "provider_budget_missing");
    else if (!isLiveAttemptBudget(store)) {
      let reason = "provider_budget_not_durable";
      if (store.backend === "exclusive-slot-file" && typeof store.snapshot === "function") {
        try {
          const snap = store.snapshot();
          if (snap && snap.reason) reason = snap.reason;
        } catch {
          reason = "budget_storage_unavailable";
        }
      }
      push(reasons, reason);
    }
  }
  if (source.GETPRO_V13_APPROVED_DB_TARGET !== QA_DATABASE_NAME) {
    push(reasons, "database_identity_mismatch");
  }
  const url = inspectDatabaseUrl(source);
  for (const reason of url.reasons) push(reasons, reason);
  return { reasons, url };
}

function freezeDecision(reasons) {
  return Object.freeze({
    authorized: reasons.length === 0,
    liveSendAuthorized: reasons.length === 0,
    reasons: Object.freeze(reasons.slice()),
    budget: null,
  });
}

/**
 * Static diagnostics cannot authorize a send. Identity requires a fresh probe.
 */
function evaluateQaLiveDeliveryConfiguration() {
  return freezeDecision(["database_identity_unverified"]);
}

async function readIdentityProbe(probe, request) {
  try {
    const report = await probe(request);
    if (!report || typeof report !== "object" || Array.isArray(report)) {
      return { reason: "database_identity_malformed" };
    }
    return { report };
  } catch {
    return { reason: "database_identity_unverified" };
  }
}

/**
 * Authorize one QA decision. A caller-supplied databaseIdentity object is ignored.
 * The probe runs only after every configuration check has passed.
 */
async function evaluateQaLiveDelivery(env, deps) {
  const options = deps || {};
  const collected = collectConfigurationReasons(env, options);
  const reasons = collected.reasons.slice();
  if (reasons.includes("production_environment") || collected.url.ok !== true) {
    return freezeDecision(reasons);
  }
  if (typeof options.databaseIdentityProbe !== "function") {
    push(reasons, "database_identity_unverified");
    return freezeDecision(reasons);
  }
  if (reasons.length > 0) return freezeDecision(reasons);
  const request = createProbeRequest();
  const read = await readIdentityProbe(options.databaseIdentityProbe, request);
  if (read.reason) {
    push(reasons, read.reason);
    return freezeDecision(reasons);
  }
  const identity = validateIdentityObservation(request, read.report);
  if (identity) push(reasons, identity);
  return freezeDecision(reasons);
}

/**
 * In-process counter. A new object starts at zero, including after a process
 * restart. This is not a durable cross-process cap.
 */
function createInProcessAttemptBudget() {
  let used = 0;
  return {
    durable: false,
    restartSafe: false,
    limit: QA_HTTP_ATTEMPT_LIMIT,
    tryReserve() {
      if (used >= QA_HTTP_ATTEMPT_LIMIT) {
        return { ok: false, reason: "provider_budget_exhausted", used, limit: QA_HTTP_ATTEMPT_LIMIT };
      }
      used += 1;
      return { ok: true, used, limit: QA_HTTP_ATTEMPT_LIMIT, remaining: QA_HTTP_ATTEMPT_LIMIT - used };
    },
    snapshot() {
      return { used, limit: QA_HTTP_ATTEMPT_LIMIT, durable: false, restartSafe: false };
    },
  };
}

/**
 * Shared-state budget contract. restartSafe is taken from the supplied state.
 * A new in-memory object does not survive a process restart. This function
 * does not open a database or write a file.
 */
function bindDurableAttemptBudget(state) {
  if (!state || state.durable !== true || state.restartSafe !== true) {
    return createInProcessAttemptBudget();
  }
  if (typeof state.tryReserve !== "function") {
    state.tryReserve = function reserveShared() {
      const used = Number(state.used) || 0;
      if (used >= QA_HTTP_ATTEMPT_LIMIT) {
        return { ok: false, reason: "provider_budget_exhausted", used, limit: QA_HTTP_ATTEMPT_LIMIT };
      }
      state.used = used + 1;
      return { ok: true, used: state.used, limit: QA_HTTP_ATTEMPT_LIMIT };
    };
  }
  return createAttemptBudget({
    durable: true,
    restartSafe: true,
    tryReserve() {
      return state.tryReserve();
    },
    snapshot() {
      return {
        used: Number(state.used) || 0,
        limit: QA_HTTP_ATTEMPT_LIMIT,
        durable: true,
        restartSafe: true,
      };
    },
  });
}

function createAttemptBudget(backend) {
  const external = backend && typeof backend.tryReserve === "function" && backend.durable === true;
  if (!external) return createInProcessAttemptBudget();
  return {
    durable: true,
    restartSafe: backend.restartSafe === true,
    limit: QA_HTTP_ATTEMPT_LIMIT,
    tryReserve() {
      const result = backend.tryReserve();
      if (!result || result.ok !== true) {
        return { ok: false, reason: "provider_budget_exhausted", limit: QA_HTTP_ATTEMPT_LIMIT };
      }
      return { ok: true, limit: QA_HTTP_ATTEMPT_LIMIT };
    },
    snapshot() {
      return typeof backend.snapshot === "function"
        ? backend.snapshot()
        : { durable: true, restartSafe: backend.restartSafe === true, limit: QA_HTTP_ATTEMPT_LIMIT };
    },
  };
}

module.exports = {
  QA_DATABASE_NAME,
  LISTENER_PATH_EVIDENCE,
  QA_DATABASE_HOST,
  QA_DATABASE_PORT,
  QA_SHARED_PORT,
  QA_DATABASE_ROLE,
  QA_CURRENT_USER,
  QA_VERIFIED_DOMAIN,
  QA_SENDER_PROFILE,
  QA_SENDER_EMAIL,
  QA_ACTIVATION_VALUE,
  QA_PRODUCT,
  QA_PURPOSE,
  QA_IDENTITY_KEY,
  QA_INSTANCE_ID,
  QA_HTTP_ATTEMPT_LIMIT,
  QA_MAX_RECIPIENTS,
  QA_MAX_SENDERS,
  APPROVED_QA_DATA_DIRECTORY,
  APPROVED_QA_SOCKET_DIRECTORY,
  classifyQaRecipientAllowlist,
  qaRecipientAllowlist,
  assertQaRecipientMembership,
  inspectDatabaseUrl,
  validateIdentityObservation,
  createProbeRequest,
  evaluateQaLiveDeliveryConfiguration,
  evaluateQaLiveDelivery,
  isLiveAttemptBudget,
  createInProcessAttemptBudget,
  createAttemptBudget,
  bindDurableAttemptBudget,
};
