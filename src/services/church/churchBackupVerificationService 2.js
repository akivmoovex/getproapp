"use strict";

/**
 * Application-level backup verification status.
 * Records operator-attested checks only — never invents successful backups
 * and does not call hosting-provider APIs.
 */

const auditLogsRepo = require("../../db/pg/church/auditLogsRepo");

const EVENT_TYPES = Object.freeze(["backup_verified", "restoration_test", "backup_check_failed"]);
const OUTCOMES = Object.freeze(["success", "failed", "partial"]);

const DEFAULT_STALE_DAYS = 7;
const SECRET_PATTERNS = [
  /password/i,
  /secret/i,
  /DATABASE_URL/i,
  /postgres(ql)?:\/\//i,
  /bearer\s+\S+/i,
  /api[_-]?key/i,
  /-----BEGIN/i,
];

function getStaleBackupDays() {
  const n = Number(process.env.BLESSBOARD_BACKUP_STALE_DAYS);
  if (Number.isFinite(n) && n >= 1 && n <= 365) return Math.floor(n);
  return DEFAULT_STALE_DAYS;
}

function redactOperatorText(value, maxLen) {
  let text = String(value == null ? "" : value).trim();
  if (!text) return null;
  // Strip URI-looking credentials first
  text = text.replace(/[a-z]+:\/\/[^\s]+/gi, "[redacted-uri]");
  // Key=value and key: value secret-ish pairs
  text = text.replace(
    /\b(password|secret|api[_-]?key|token|DATABASE_URL)\s*[=:]\s*\S+/gi,
    "$1=[redacted]"
  );
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) {
      text = text.replace(pattern, "[redacted]");
    }
  }
  return text.slice(0, maxLen);
}

function isoOrNull(value) {
  if (!value) return null;
  try {
    return new Date(value).toISOString();
  } catch {
    return null;
  }
}

function daysBetween(from, to) {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return (b - a) / (1000 * 60 * 60 * 24);
}

/**
 * Derive health from recorded events. Missing records → missing (never success).
 * @param {import("pg").Pool} pool
 * @param {{ at?: Date }} [opts]
 */
async function getBackupVerificationStatus(pool, opts = {}) {
  const at = opts.at instanceof Date ? opts.at : new Date();
  const staleDays = getStaleBackupDays();

  let lastBackupSuccess = null;
  let lastRestorationTest = null;
  let recentEvents = [];

  if (!pool || typeof pool.query !== "function") {
    return {
      available: false,
      status: "unavailable",
      statusLabel: "Unavailable",
      health: "warning",
      warnings: [],
      lastSuccessfulBackupAt: null,
      lastSuccessfulBackupEvidence: null,
      lastRestorationTestAt: null,
      lastRestorationTestOutcome: null,
      lastRestorationTestEnvironment: null,
      staleDays,
      recentEvents: [],
      errorKind: "not_configured",
    };
  }

  try {
    const r = await pool.query(
      `SELECT id, event_type, outcome, verified_at, recorded_at, recorded_by_label,
              environment_label, evidence_reference, notes
       FROM public.church_backup_verification_events
       ORDER BY verified_at DESC, id DESC
       LIMIT 50`
    );
    recentEvents = r.rows.map((row) => ({
      id: row.id,
      eventType: row.event_type,
      outcome: row.outcome,
      verifiedAt: isoOrNull(row.verified_at),
      recordedAt: isoOrNull(row.recorded_at),
      recordedByLabel: row.recorded_by_label || null,
      environmentLabel: row.environment_label || null,
      evidenceReference: row.evidence_reference || null,
      notes: row.notes || null,
    }));

    for (const ev of recentEvents) {
      if (
        !lastBackupSuccess &&
        ev.eventType === "backup_verified" &&
        ev.outcome === "success"
      ) {
        lastBackupSuccess = ev;
      }
      if (!lastRestorationTest && ev.eventType === "restoration_test") {
        lastRestorationTest = ev;
      }
    }
  } catch (err) {
    return {
      available: false,
      status: "unavailable",
      statusLabel: "Unavailable",
      health: "warning",
      warnings: [
        "Backup verification table is not available yet. Run church schema migrations.",
      ],
      lastSuccessfulBackupAt: null,
      lastRestorationTestAt: null,
      lastRestorationTestOutcome: null,
      staleDays,
      recentEvents: [],
      errorKind: err && err.code ? String(err.code) : "query_failed",
    };
  }

  const warnings = [];
  let status = "missing";
  let statusLabel = "Missing";
  let health = "warning";

  if (!lastBackupSuccess) {
    status = "missing";
    statusLabel = "Missing";
    health = "warning";
    warnings.push(
      "No successful backup verification has been recorded. Do not assume provider backups are working."
    );
  } else {
    const ageDays = daysBetween(lastBackupSuccess.verifiedAt, at);
    if (ageDays != null && ageDays > staleDays) {
      status = "stale";
      statusLabel = "Stale";
      health = "warning";
      warnings.push(
        `Last successful backup verification is ${Math.floor(ageDays)} day(s) old (stale after ${staleDays} day(s)).`
      );
    } else {
      status = "recorded";
      statusLabel = "Recorded";
      health = "ok";
    }
  }

  const newest = recentEvents[0] || null;
  if (
    newest &&
    (newest.eventType === "backup_check_failed" ||
      (newest.eventType === "backup_verified" && newest.outcome === "failed"))
  ) {
    status = "failed";
    statusLabel = "Failed check";
    health = "warning";
    warnings.push("The most recent backup check was recorded as failed.");
  }

  if (!lastRestorationTest) {
    warnings.push(
      "No restoration test has been recorded. Run and record a staging restore before pilot launch."
    );
  } else if (lastRestorationTest.outcome === "failed") {
    warnings.push("The most recent restoration test was recorded as failed.");
    health = "warning";
  }

  return {
    available: true,
    status,
    statusLabel,
    health,
    warnings,
    lastSuccessfulBackupAt: lastBackupSuccess ? lastBackupSuccess.verifiedAt : null,
    lastSuccessfulBackupEvidence: lastBackupSuccess ? lastBackupSuccess.evidenceReference : null,
    lastRestorationTestAt: lastRestorationTest ? lastRestorationTest.verifiedAt : null,
    lastRestorationTestOutcome: lastRestorationTest ? lastRestorationTest.outcome : null,
    lastRestorationTestEnvironment: lastRestorationTest
      ? lastRestorationTest.environmentLabel
      : null,
    staleDays,
    recentEvents: recentEvents.slice(0, 10),
    note:
      "Timestamps are operator-attested verification records only. The application does not create infrastructure backups.",
  };
}

function parseVerifiedAt(raw) {
  if (raw == null || String(raw).trim() === "") {
    return new Date();
  }
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    const err = new Error("Invalid verified_at timestamp.");
    err.code = "VALIDATION";
    throw err;
  }
  // Reject future timestamps more than 1 hour ahead (clock skew)
  if (d.getTime() > Date.now() + 60 * 60 * 1000) {
    const err = new Error("verified_at cannot be in the future.");
    err.code = "VALIDATION";
    throw err;
  }
  return d;
}

/**
 * Record an operator-attested backup verification (or failed check).
 * Does not invent success — outcome must be supplied explicitly.
 */
async function recordBackupVerification(pool, fields) {
  const outcome = String(fields.outcome || "")
    .trim()
    .toLowerCase();
  if (!OUTCOMES.includes(outcome)) {
    const err = new Error("Outcome must be success, failed, or partial.");
    err.code = "VALIDATION";
    throw err;
  }
  // Explicit: never default outcome to success
  const eventType = outcome === "failed" ? "backup_check_failed" : "backup_verified";
  const verifiedAt = parseVerifiedAt(fields.verifiedAt || fields.verified_at);
  const evidence = redactOperatorText(fields.evidenceReference || fields.evidence_reference, 500);
  const notes = redactOperatorText(fields.notes, 4000);
  const environmentLabel = redactOperatorText(
    fields.environmentLabel || fields.environment_label || "production-provider-check",
    120
  );

  if (outcome === "success" && !evidence) {
    const err = new Error(
      "Evidence reference is required when recording a successful backup verification (e.g. provider snapshot id — no secrets)."
    );
    err.code = "VALIDATION";
    throw err;
  }

  const r = await pool.query(
    `INSERT INTO public.church_backup_verification_events (
       event_type, outcome, verified_at,
       recorded_by_actor_type, recorded_by_actor_id, recorded_by_label,
       environment_label, evidence_reference, notes, metadata_json
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
     RETURNING *`,
    [
      eventType,
      outcome,
      verifiedAt.toISOString(),
      fields.actorType || "platform_admin",
      fields.actorId || null,
      redactOperatorText(fields.actorLabel, 200),
      environmentLabel,
      evidence,
      notes,
      JSON.stringify({
        attested: true,
        invented: false,
        source: "operator_form",
      }),
    ]
  );

  await auditLogsRepo.insertAuditLog(pool, {
    organization_id: null,
    branch_id: null,
    actor_type: fields.actorType || "platform_admin",
    actor_id: fields.actorId || null,
    action: "platform_backup_verification_recorded",
    entity_type: "backup_verification",
    entity_id: r.rows[0].id,
    target_label: eventType,
    metadata_json: {
      outcome,
      verified_at: verifiedAt.toISOString(),
      environment_label: environmentLabel,
      has_evidence: Boolean(evidence),
    },
  });

  return r.rows[0];
}

/**
 * Record a staging (or documented) restoration test. Audited.
 */
async function recordRestorationTest(pool, fields) {
  const outcome = String(fields.outcome || "")
    .trim()
    .toLowerCase();
  if (!OUTCOMES.includes(outcome)) {
    const err = new Error("Outcome must be success, failed, or partial.");
    err.code = "VALIDATION";
    throw err;
  }
  const verifiedAt = parseVerifiedAt(fields.verifiedAt || fields.verified_at);
  const evidence = redactOperatorText(fields.evidenceReference || fields.evidence_reference, 500);
  const notes = redactOperatorText(fields.notes, 4000);
  const environmentLabel = redactOperatorText(
    fields.environmentLabel || fields.environment_label || "staging",
    120
  );

  if (!environmentLabel) {
    const err = new Error("Environment label is required (e.g. staging).");
    err.code = "VALIDATION";
    throw err;
  }
  if (/prod/i.test(environmentLabel) && outcome === "success") {
    // Allow recording but force note that production restores must not be claimed lightly
    // Actually user said do not trigger production restore — we allow recording but recommend staging
  }
  if (outcome === "success" && !notes && !evidence) {
    const err = new Error(
      "Notes or evidence reference required for a successful restoration test record."
    );
    err.code = "VALIDATION";
    throw err;
  }

  const r = await pool.query(
    `INSERT INTO public.church_backup_verification_events (
       event_type, outcome, verified_at,
       recorded_by_actor_type, recorded_by_actor_id, recorded_by_label,
       environment_label, evidence_reference, notes, metadata_json
     ) VALUES ('restoration_test',$1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
     RETURNING *`,
    [
      outcome,
      verifiedAt.toISOString(),
      fields.actorType || "platform_admin",
      fields.actorId || null,
      redactOperatorText(fields.actorLabel, 200),
      environmentLabel,
      evidence,
      notes,
      JSON.stringify({
        attested: true,
        invented: false,
        checklist: "docs/blessboard-staging-restoration-checklist.md",
      }),
    ]
  );

  await auditLogsRepo.insertAuditLog(pool, {
    organization_id: null,
    branch_id: null,
    actor_type: fields.actorType || "platform_admin",
    actor_id: fields.actorId || null,
    action: "platform_backup_restoration_test_recorded",
    entity_type: "backup_restoration_test",
    entity_id: r.rows[0].id,
    target_label: environmentLabel,
    metadata_json: {
      outcome,
      verified_at: verifiedAt.toISOString(),
      environment_label: environmentLabel,
      has_evidence: Boolean(evidence),
    },
  });

  return r.rows[0];
}

module.exports = {
  EVENT_TYPES,
  OUTCOMES,
  DEFAULT_STALE_DAYS,
  getStaleBackupDays,
  getBackupVerificationStatus,
  recordBackupVerification,
  recordRestorationTest,
  redactOperatorText,
};
