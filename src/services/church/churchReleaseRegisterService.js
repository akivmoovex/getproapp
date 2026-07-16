"use strict";

/**
 * Lightweight BlessBoard release / migration register.
 * Platform-admin only. Never stores secrets or claims tests passed without evidence.
 */

const fs = require("fs");
const path = require("path");
const { isSuperAdmin, normalizeRole, ROLES } = require("../../auth/roles");
const { CHURCH_SCHEMA_MIGRATION_FILES } = require("../../db/pg/ensureChurchSchema");
const { PACKAGE_FEATURES } = require("../../church/blessBoardPackageFeatures");
const auditLogsRepo = require("../../db/pg/church/auditLogsRepo");

const TEST_STATUSES = Object.freeze(["not_run", "partial", "failed", "passed"]);
const KNOWN_FEATURE_IDS = Object.freeze(new Set(PACKAGE_FEATURES.map((f) => f.id)));
const KNOWN_MIGRATIONS = Object.freeze(new Set(CHURCH_SCHEMA_MIGRATION_FILES));

const SECRET_PATTERNS = [
  /password/i,
  /secret/i,
  /DATABASE_URL/i,
  /postgres(ql)?:\/\//i,
  /bearer\s+\S+/i,
  /api[_-]?key/i,
  /-----BEGIN/i,
];

function canViewReleaseRegister(role) {
  const n = normalizeRole(role);
  // Ordinary platform support (CSR / tenant manager) may read; edits stay super-admin only.
  return n === ROLES.SUPER_ADMIN || n === ROLES.CSR || n === ROLES.TENANT_MANAGER;
}

function canEditReleaseRegister(role) {
  return isSuperAdmin(role);
}

function redactOperatorText(value, maxLen) {
  let text = String(value == null ? "" : value).trim();
  if (!text) return null;
  text = text.replace(/[a-z]+:\/\/[^\s]+/gi, "[redacted-uri]");
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

function parseStringList(raw, { maxItems = 40, maxItemLen = 120 } = {}) {
  let items = [];
  if (Array.isArray(raw)) {
    items = raw;
  } else if (raw != null && String(raw).trim()) {
    items = String(raw)
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const cleaned = String(item).trim().slice(0, maxItemLen);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
    if (out.length >= maxItems) break;
  }
  return out;
}

function migrationFileExistsOnDisk(filename) {
  const base = path.join(__dirname, "../../../db/postgres");
  try {
    return fs.existsSync(path.join(base, filename));
  } catch {
    return false;
  }
}

function isKnownMigrationId(filename) {
  const name = String(filename || "").trim();
  if (!name || !/^\d{3}_[a-z0-9_]+\.sql$/i.test(name)) return false;
  if (KNOWN_MIGRATIONS.has(name)) return true;
  // Allow identifiers that exist on disk even if ensureChurchSchema list lags in tests.
  return migrationFileExistsOnDisk(name);
}

function validateMigrations(list) {
  const missing = [];
  const valid = [];
  for (const name of list) {
    if (!isKnownMigrationId(name)) {
      missing.push(name);
    } else {
      valid.push(name);
    }
  }
  return { valid, missing };
}

function validatePackageFeatures(list) {
  const unknown = [];
  const valid = [];
  for (const id of list) {
    if (!KNOWN_FEATURE_IDS.has(id)) unknown.push(id);
    else valid.push(id);
  }
  return { valid, unknown };
}

function validateEnvVarNames(list) {
  const invalid = [];
  const valid = [];
  for (const name of list) {
    // Names only — reject anything that looks like an assignment or secret value.
    if (!/^[A-Z][A-Z0-9_]{0,118}$/.test(name) || /[=:]/.test(name)) {
      invalid.push(name);
    } else {
      valid.push(name);
    }
  }
  return { valid, invalid };
}

function parseReleaseDate(raw) {
  const s = String(raw || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return { ok: false, error: "Release date must be YYYY-MM-DD." };
  }
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    return { ok: false, error: "Invalid release date." };
  }
  return { ok: true, value: s };
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    applicationVersion: row.application_version,
    releaseDate: row.release_date
      ? String(row.release_date).slice(0, 10)
      : null,
    releaseSummary: row.release_summary,
    migrations: Array.isArray(row.migrations_json) ? row.migrations_json : [],
    rollbackNotes: row.rollback_notes || null,
    knownLimitations: row.known_limitations || null,
    packageFeaturesAffected: Array.isArray(row.package_features_affected_json)
      ? row.package_features_affected_json
      : [],
    requiredEnvVars: Array.isArray(row.required_env_vars_json)
      ? row.required_env_vars_json
      : [],
    testStatus: row.test_status,
    testEvidence: row.test_evidence || null,
    deployedByLabel: row.deployed_by_label,
    deployedByActorId: row.deployed_by_actor_id != null ? Number(row.deployed_by_actor_id) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByActorId: row.created_by_actor_id != null ? Number(row.created_by_actor_id) : null,
    updatedByActorId: row.updated_by_actor_id != null ? Number(row.updated_by_actor_id) : null,
  };
}

function validateReleaseInput(body, opts = {}) {
  const errors = [];
  const version = String((body && body.application_version) || "").trim().slice(0, 64);
  if (!version) errors.push("Application version is required.");
  else if (!/^[0-9A-Za-z][0-9A-Za-z._+-]{0,63}$/.test(version)) {
    errors.push("Application version contains invalid characters.");
  }

  const dateParsed = parseReleaseDate(body && body.release_date);
  if (!dateParsed.ok) errors.push(dateParsed.error);

  const summary = redactOperatorText(body && body.release_summary, 4000);
  if (!summary) errors.push("Release summary is required.");

  const migrations = parseStringList(body && (body.migrations || body.migrations_text), {
    maxItems: 80,
    maxItemLen: 120,
  });
  const mig = validateMigrations(migrations);
  if (mig.missing.length) {
    errors.push(
      `Unknown migration reference(s): ${mig.missing.slice(0, 5).join(", ")}. Must match files under db/postgres.`
    );
  }

  const features = parseStringList(
    body && (body.package_features_affected || body.package_features_text),
    { maxItems: 40, maxItemLen: 80 }
  );
  const feat = validatePackageFeatures(features);
  if (feat.unknown.length) {
    errors.push(`Unknown package feature id(s): ${feat.unknown.slice(0, 5).join(", ")}.`);
  }

  const envVars = parseStringList(body && (body.required_env_vars || body.required_env_vars_text), {
    maxItems: 40,
    maxItemLen: 120,
  });
  const env = validateEnvVarNames(envVars);
  if (env.invalid.length) {
    errors.push(
      `Invalid environment variable name(s) (names only, no values): ${env.invalid.slice(0, 5).join(", ")}.`
    );
  }

  const testStatus = String((body && body.test_status) || "not_run").trim();
  if (!TEST_STATUSES.includes(testStatus)) {
    errors.push("Invalid test status.");
  }

  let testEvidence = redactOperatorText(body && body.test_evidence, 2000);
  if (testStatus === "passed" && !testEvidence) {
    errors.push("Test status \"passed\" requires stored evidence (run id, CI URL path, or checklist reference).");
  }
  if (testStatus !== "passed") {
    // Allow optional notes for other statuses; do not invent a pass claim.
    testEvidence = testEvidence || null;
  }

  const deployedBy =
    redactOperatorText(body && body.deployed_by, 200) ||
    redactOperatorText(opts.defaultDeployedBy, 200);
  if (!deployedBy) errors.push("Deployed by is required.");

  const rollbackNotes = redactOperatorText(body && body.rollback_notes, 4000);
  const knownLimitations = redactOperatorText(body && body.known_limitations, 4000);

  if (errors.length) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      applicationVersion: version,
      releaseDate: dateParsed.value,
      releaseSummary: summary,
      migrations: mig.valid,
      rollbackNotes,
      knownLimitations,
      packageFeaturesAffected: feat.valid,
      requiredEnvVars: env.valid,
      testStatus,
      testEvidence,
      deployedByLabel: deployedBy,
    },
  };
}

async function listReleaseRecords(pool, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 100);
  const r = await pool.query(
    `SELECT * FROM public.church_release_records
     ORDER BY release_date DESC, id DESC
     LIMIT $1`,
    [limit]
  );
  return r.rows.map(mapRow);
}

async function findReleaseRecordById(pool, id) {
  const r = await pool.query(
    `SELECT * FROM public.church_release_records WHERE id = $1 LIMIT 1`,
    [id]
  );
  return mapRow(r.rows[0] || null);
}

async function findReleaseRecordByVersion(pool, version) {
  const r = await pool.query(
    `SELECT * FROM public.church_release_records WHERE application_version = $1 LIMIT 1`,
    [String(version || "").trim()]
  );
  return mapRow(r.rows[0] || null);
}

async function createReleaseRecord(pool, input, actor = {}) {
  if (!canEditReleaseRegister(actor.role)) {
    const err = new Error("Only authorised platform administrators can create release records.");
    err.code = "FORBIDDEN";
    throw err;
  }
  const validated = validateReleaseInput(input, {
    defaultDeployedBy: actor.label || actor.username || null,
  });
  if (!validated.ok) {
    const err = new Error(validated.errors.join(" "));
    err.code = "VALIDATION";
    err.errors = validated.errors;
    throw err;
  }
  const v = validated.value;
  const actorId = actor.id != null ? Number(actor.id) : null;

  let row;
  try {
    const r = await pool.query(
      `INSERT INTO public.church_release_records (
         application_version, release_date, release_summary, migrations_json,
         rollback_notes, known_limitations, package_features_affected_json,
         required_env_vars_json, test_status, test_evidence,
         deployed_by_label, deployed_by_actor_id,
         created_by_actor_id, updated_by_actor_id
       ) VALUES (
         $1, $2::date, $3, $4::jsonb, $5, $6, $7::jsonb, $8::jsonb, $9, $10,
         $11, $12, $12, $12
       )
       RETURNING *`,
      [
        v.applicationVersion,
        v.releaseDate,
        v.releaseSummary,
        JSON.stringify(v.migrations),
        v.rollbackNotes,
        v.knownLimitations,
        JSON.stringify(v.packageFeaturesAffected),
        JSON.stringify(v.requiredEnvVars),
        v.testStatus,
        v.testEvidence,
        v.deployedByLabel,
        actorId,
      ]
    );
    row = r.rows[0];
  } catch (e) {
    if (e && e.code === "23505") {
      const err = new Error(`A release record for version ${v.applicationVersion} already exists.`);
      err.code = "DUPLICATE_VERSION";
      throw err;
    }
    throw e;
  }

  const record = mapRow(row);
  try {
    await auditLogsRepo.insertAuditLog(pool, {
      organization_id: null,
      branch_id: null,
      actor_type: "platform_admin",
      actor_id: actorId,
      action: "platform_release_record_created",
      entity_type: "church_release_record",
      entity_id: record.id,
      target_label: record.applicationVersion,
      metadata_json: {
        application_version: record.applicationVersion,
        release_date: record.releaseDate,
        migrations: record.migrations,
        test_status: record.testStatus,
        // Never store evidence body in audit if it could contain ops paths — keep status only
        has_test_evidence: Boolean(record.testEvidence),
      },
    });
  } catch {
    /* audit must not break create */
  }
  return record;
}

async function updateReleaseRecord(pool, id, input, actor = {}) {
  if (!canEditReleaseRegister(actor.role)) {
    const err = new Error("Only authorised platform administrators can edit release records.");
    err.code = "FORBIDDEN";
    throw err;
  }
  const existing = await findReleaseRecordById(pool, id);
  if (!existing) {
    const err = new Error("Release record not found.");
    err.code = "NOT_FOUND";
    throw err;
  }

  const validated = validateReleaseInput(
    {
      ...input,
      application_version: input.application_version || existing.applicationVersion,
    },
    { defaultDeployedBy: actor.label || actor.username || existing.deployedByLabel }
  );
  if (!validated.ok) {
    const err = new Error(validated.errors.join(" "));
    err.code = "VALIDATION";
    err.errors = validated.errors;
    throw err;
  }
  const v = validated.value;
  const actorId = actor.id != null ? Number(actor.id) : null;

  let row;
  try {
    const r = await pool.query(
      `UPDATE public.church_release_records
       SET application_version = $2,
           release_date = $3::date,
           release_summary = $4,
           migrations_json = $5::jsonb,
           rollback_notes = $6,
           known_limitations = $7,
           package_features_affected_json = $8::jsonb,
           required_env_vars_json = $9::jsonb,
           test_status = $10,
           test_evidence = $11,
           deployed_by_label = $12,
           deployed_by_actor_id = COALESCE($13, deployed_by_actor_id),
           updated_by_actor_id = $13,
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        v.applicationVersion,
        v.releaseDate,
        v.releaseSummary,
        JSON.stringify(v.migrations),
        v.rollbackNotes,
        v.knownLimitations,
        JSON.stringify(v.packageFeaturesAffected),
        JSON.stringify(v.requiredEnvVars),
        v.testStatus,
        v.testEvidence,
        v.deployedByLabel,
        actorId,
      ]
    );
    row = r.rows[0];
  } catch (e) {
    if (e && e.code === "23505") {
      const err = new Error(`A release record for version ${v.applicationVersion} already exists.`);
      err.code = "DUPLICATE_VERSION";
      throw err;
    }
    throw e;
  }

  const record = mapRow(row);
  try {
    await auditLogsRepo.insertAuditLog(pool, {
      organization_id: null,
      branch_id: null,
      actor_type: "platform_admin",
      actor_id: actorId,
      action: "platform_release_record_updated",
      entity_type: "church_release_record",
      entity_id: record.id,
      target_label: record.applicationVersion,
      metadata_json: {
        application_version: record.applicationVersion,
        test_status: record.testStatus,
        has_test_evidence: Boolean(record.testEvidence),
      },
    });
  } catch {
    /* ignore */
  }
  return record;
}

function testStatusLabel(status) {
  const map = {
    not_run: "Not run",
    partial: "Partial",
    failed: "Failed",
    passed: "Passed (evidence on file)",
  };
  return map[status] || status || "—";
}

function knownMigrationChoices() {
  return CHURCH_SCHEMA_MIGRATION_FILES.slice().reverse();
}

function knownPackageFeatureChoices() {
  return PACKAGE_FEATURES.map((f) => ({ id: f.id, name: f.name, portal: f.portal }));
}

module.exports = {
  TEST_STATUSES,
  canViewReleaseRegister,
  canEditReleaseRegister,
  redactOperatorText,
  validateReleaseInput,
  isKnownMigrationId,
  listReleaseRecords,
  findReleaseRecordById,
  findReleaseRecordByVersion,
  createReleaseRecord,
  updateReleaseRecord,
  testStatusLabel,
  knownMigrationChoices,
  knownPackageFeatureChoices,
};
