"use strict";

/**
 * Phase2 Prompt 052 — record a duplicate-match review decision.
 * Writes the match ledger decision only. Does not merge, reject, approve, or provision.
 */

const repo = require("../repositories/platformChurchRegistrationRepository");
const { recordAuditEventSafe } = require("../../platform/services/auditEventService");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  INVALID_DECISION: "invalid_decision",
  REASON_REQUIRED: "reason_required",
  NOT_FOUND: "not_found",
  LOOKUP_ERROR: "lookup_error",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const REVIEW_DECISIONS = repo.DUPLICATE_MATCH_REVIEW_DECISIONS;

/** Decisions that always require an operator reason. */
const ALWAYS_REQUIRE_REASON = Object.freeze([
  "impersonation_concern",
  "confirmed_duplicate",
]);

/**
 * Strong/confirmed match overrides that require a reason
 * (includes different_church on a strong match).
 */
const STRONG_OVERRIDE_DECISIONS = Object.freeze([
  "different_church",
  "clarification_required",
  "senior_review",
  "additional_branch_request",
]);

const DEFAULT_REASON_WHEN_OPTIONAL = "Decision recorded.";

/** Operator-facing decision options for the comparison form (Prompt 053). */
const DECISION_OPTIONS = Object.freeze([
  { value: "different_church", label: "Different church" },
  { value: "link_existing_church", label: "Link existing church" },
  { value: "additional_branch_request", label: "Additional branch request" },
  { value: "clarification_required", label: "Request clarification" },
  { value: "senior_review", label: "Senior review" },
  { value: "impersonation_concern", label: "Impersonation concern" },
  { value: "confirmed_duplicate", label: "Confirmed duplicate" },
]);

/**
 * @param {unknown} value
 * @returns {string}
 */
function trimStr(value) {
  if (value == null) return "";
  return String(value).trim();
}

/**
 * @param {string} decision
 * @param {string} riskLevel
 * @returns {boolean}
 */
function isReasonRequired(decision, riskLevel) {
  const d = trimStr(decision).toLowerCase();
  const risk = trimStr(riskLevel).toLowerCase();
  if (ALWAYS_REQUIRE_REASON.includes(d)) return true;
  if (d === "different_church" && (risk === "strong" || risk === "confirmed")) {
    return true;
  }
  if (
    (risk === "strong" || risk === "confirmed") &&
    STRONG_OVERRIDE_DECISIONS.includes(d)
  ) {
    return true;
  }
  return false;
}

/**
 * @param {{ query: Function, connect?: Function }} db
 * @param {Function} fn
 */
async function withOwnedClient(db, fn) {
  if (db && typeof db.connect === "function") {
    const client = await db.connect();
    try {
      return await fn(client);
    } finally {
      if (typeof client.release === "function") client.release();
    }
  }
  return fn(db);
}

/**
 * Record an allowlisted duplicate-match review decision.
 *
 * @param {{ query: Function, connect?: Function }} db
 * @param {{
 *   applicationId: string,
 *   matchId: string,
 *   decision: string,
 *   reason?: string|null,
 *   actorUserId: string,
 *   deploymentCode?: string,
 *   now?: Date|string,
 * }} input
 * @param {{
 *   getRegistrationDuplicateMatchById?: Function,
 *   recordRegistrationDuplicateMatchDecision?: Function,
 *   updateApplicationSupportFollowUp?: Function,
 *   getRegistrationApplicationById?: Function,
 *   recordAuditEventSafe?: Function,
 * }} [deps]
 */
async function recordDuplicateMatchReviewDecision(db, input = {}, deps = {}) {
  const applicationId = trimStr(input.applicationId);
  const matchId = trimStr(input.matchId);
  const actorUserId = trimStr(input.actorUserId);
  const decision = trimStr(input.decision).toLowerCase();
  const rawReason = trimStr(input.reason);

  if (!UUID_RE.test(applicationId) || !UUID_RE.test(matchId) || !UUID_RE.test(actorUserId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_ids" };
  }
  if (!decision || !REVIEW_DECISIONS.includes(decision)) {
    return { ok: false, status: STATUS.INVALID_DECISION, message: "invalid_decision" };
  }

  const getMatch =
    typeof deps.getRegistrationDuplicateMatchById === "function"
      ? deps.getRegistrationDuplicateMatchById
      : repo.getRegistrationDuplicateMatchById;
  const writeDecision =
    typeof deps.recordRegistrationDuplicateMatchDecision === "function"
      ? deps.recordRegistrationDuplicateMatchDecision
      : repo.recordRegistrationDuplicateMatchDecision;
  const appendFollowUp =
    typeof deps.updateApplicationSupportFollowUp === "function"
      ? deps.updateApplicationSupportFollowUp
      : repo.updateApplicationSupportFollowUp;
  const getApp =
    typeof deps.getRegistrationApplicationById === "function"
      ? deps.getRegistrationApplicationById
      : repo.getRegistrationApplicationById;
  const auditSafe =
    typeof deps.recordAuditEventSafe === "function"
      ? deps.recordAuditEventSafe
      : recordAuditEventSafe;

  try {
    return await withOwnedClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const match = await getMatch(client, matchId, { applicationId });
        if (!match) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, message: "match_not_found" };
        }

        const riskLevel = trimStr(match.risk_level || match.riskLevel).toLowerCase() || "none";
        if (isReasonRequired(decision, riskLevel) && rawReason.length < 3) {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.REASON_REQUIRED,
            message: "reason_required",
            riskLevel,
            decision,
          };
        }

        const reviewReason =
          rawReason.length > 0
            ? rawReason.slice(0, 2000)
            : DEFAULT_REASON_WHEN_OPTIONAL;
        if (reviewReason.length > 2000) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.INVALID_INPUT, message: "invalid_reason" };
        }

        const nowIso =
          input.now != null ? new Date(input.now).toISOString() : new Date().toISOString();

        const saved = await writeDecision(client, matchId, {
          applicationId,
          reviewDecision: decision,
          reviewReason,
          reviewedByUserId: actorUserId,
          reviewedAt: nowIso,
        });
        if (!saved) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, message: "match_not_found" };
        }

        // Application review_events trail (safe for unprovisioned apps). No status/gate changes.
        await appendFollowUp(client, applicationId, {
          reviewEvent: {
            at: nowIso,
            action: "duplicate_match_decision",
            actor_user_id: actorUserId,
            reason_codes: [decision],
            match_id: matchId,
            matched_record_type: String(saved.matched_record_type || ""),
            risk_level: riskLevel,
            note_len: reviewReason.length,
          },
        });

        // Org-scoped audit only when an organization already exists (never invents org).
        const app = await getApp(client, applicationId);
        const organizationId =
          app && app.organization_id != null ? String(app.organization_id) : null;
        if (organizationId && UUID_RE.test(organizationId)) {
          await auditSafe(client, {
            deploymentCode: input.deploymentCode || "blessboard-org-v5",
            organizationId,
            actorUserId,
            outcome: "success",
            actionKey: "registration.duplicate_match_decision",
            entityType: "registration_duplicate_match",
            entityId: matchId,
            metadata: {
              category: "registration",
              reason_code: decision,
              reason_codes: [decision],
              actor_type: "platform_admin",
              source: "admin_registration_duplicates",
              status: riskLevel,
            },
          });
        }

        await client.query("COMMIT");
        return {
          ok: true,
          status: STATUS.OK,
          applicationId,
          matchId,
          decision,
          riskLevel,
          reviewedAt: nowIso,
          autoMerge: false,
          autoReject: false,
          autoApprove: false,
          provisioned: false,
          approvalGateUnchanged: true,
        };
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw err;
      }
    });
  } catch (err) {
    const msg = err && err.message ? String(err.message) : "";
    if (
      msg === "invalid_review_decision" ||
      msg === "invalid_review_reason" ||
      msg === "invalid_reviewed_by_user_id" ||
      msg === "invalid_match_id" ||
      msg === "invalid_application_id"
    ) {
      return {
        ok: false,
        status: msg === "invalid_review_decision" ? STATUS.INVALID_DECISION : STATUS.INVALID_INPUT,
        message: msg,
      };
    }
    return { ok: false, status: STATUS.LOOKUP_ERROR, message: "lookup_error" };
  }
}

module.exports = {
  STATUS,
  REVIEW_DECISIONS,
  ALWAYS_REQUIRE_REASON,
  STRONG_OVERRIDE_DECISIONS,
  DEFAULT_REASON_WHEN_OPTIONAL,
  DECISION_OPTIONS,
  isReasonRequired,
  recordDuplicateMatchReviewDecision,
};
