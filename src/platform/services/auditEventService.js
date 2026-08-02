"use strict";

/**
 * Immutable audit event recorder with metadata redaction.
 * Never stores secrets, passwords, session tokens, or full PII.
 */

const repo = require("../repositories/auditEventRepository");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  FORBIDDEN: "forbidden",
  LOOKUP_ERROR: "lookup_error",
});

const OUTCOMES = Object.freeze(["success", "failure", "denied"]);

const FORBIDDEN_METADATA_KEYS = Object.freeze([
  "password",
  "password_hash",
  "passwordhash",
  "secret",
  "token",
  "session_token",
  "sessiontoken",
  "csrf",
  "csrf_token",
  "authorization",
  "cookie",
  "raw_token",
  "redeem_code",
  "transfer_token",
  "card_number",
  "cardnumber",
  "cvv",
  "iban",
  "bank_account",
  "ssn",
  "donor_name",
  "donor_email",
  "donor_phone",
  "email",
  "phone",
  "full_name",
  "firstname",
  "lastname",
  "first_name",
  "last_name",
  "address",
  "message",
  "body",
  "notes",
  "answers",
  "answers_json",
]);

const ALLOWED_METADATA_KEYS = Object.freeze([
  "status",
  "from_status",
  "to_status",
  "category",
  "audience",
  "currency",
  "amount",
  "year_month",
  "branch_key",
  "entity_key",
  "count",
  "reason_code",
  "field_keys",
  "schema_field_count",
  "visibility",
  "title_len",
  "product_key",
  "plan_key",
  "request_id",
  "actor_type",
  "source",
  "reason_codes",
  "network_shell",
  "network_activation_required",
]);

const ACTION_KEY_RE = /^[a-z][a-z0-9_.]{1,95}$/;
const ACTION_CATEGORY_RE = /^[a-z][a-z0-9_]{0,31}$/;
const ENTITY_TYPE_RE = /^[a-z][a-z0-9_]{1,63}$/;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_METADATA_BYTES = 8192;

async function withClient(db, fn) {
  let client = null;
  let owned = false;
  try {
    // Prefer an already-checked-out pool client (has release) so nested callers stay on one connection.
    if (db && typeof db.query === "function" && typeof db.release === "function") {
      return await fn(db);
    }
    if (db && typeof db.connect === "function") {
      client = await db.connect();
      owned = true;
    } else {
      client = db;
    }
    return await fn(client);
  } finally {
    if (owned && client && typeof client.release === "function") client.release();
  }
}

/**
 * Strip secrets / PII; keep only allowlisted scalar metadata.
 * @param {unknown} raw
 * @returns {{ ok: true, metadata: object, redactedKeys: string[] } | { ok: false, reason: string }}
 */
function sanitizeAuditMetadata(raw) {
  if (raw == null) {
    return { ok: true, metadata: {}, redactedKeys: [] };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "metadata_not_object" };
  }
  const metadata = {};
  const redactedKeys = [];
  for (const [key, value] of Object.entries(raw)) {
    const k = String(key).trim().toLowerCase();
    if (!k || k.length > 64) {
      redactedKeys.push(key);
      continue;
    }
    if (FORBIDDEN_METADATA_KEYS.includes(k) || /password|token|secret|cookie|csrf/i.test(k)) {
      redactedKeys.push(k);
      continue;
    }
    if (!ALLOWED_METADATA_KEYS.includes(k)) {
      redactedKeys.push(k);
      continue;
    }
    if (value == null) continue;
    if (typeof value === "string") {
      const s = value.trim();
      if (s.length > 120) {
        redactedKeys.push(k);
        continue;
      }
      metadata[k] = s;
    } else if (typeof value === "number" && Number.isFinite(value)) {
      metadata[k] = value;
    } else if (typeof value === "boolean") {
      metadata[k] = value;
    } else if (Array.isArray(value) && (k === "field_keys" || k === "reason_codes")) {
      metadata[k] = value
        .filter((x) => typeof x === "string")
        .map((x) => String(x).slice(0, 40))
        .slice(0, 40);
    } else {
      redactedKeys.push(k);
    }
  }
  const size = Buffer.byteLength(JSON.stringify(metadata), "utf8");
  if (size > MAX_METADATA_BYTES) {
    return { ok: false, reason: "metadata_too_large" };
  }
  return { ok: true, metadata, redactedKeys };
}

/**
 * Record an append-only audit event. Failures are returned; callers may choose to ignore.
 * @param {{ query: Function, connect?: Function }} db
 * @param {object} input
 */
async function recordAuditEvent(db, input) {
  const deploymentCode = String((input && input.deploymentCode) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const actionKey = String((input && input.actionKey) || "").trim().toLowerCase();
  const entityType = String((input && input.entityType) || "").trim().toLowerCase();
  const outcome = String((input && input.outcome) || "success").trim().toLowerCase();

  if (!deploymentCode || !UUID_RE.test(organizationId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, event: null, reason: "scope" };
  }
  if (!ACTION_KEY_RE.test(actionKey)) {
    return { ok: false, status: STATUS.INVALID_INPUT, event: null, reason: "action_key" };
  }
  if (!ENTITY_TYPE_RE.test(entityType)) {
    return { ok: false, status: STATUS.INVALID_INPUT, event: null, reason: "entity_type" };
  }
  if (!OUTCOMES.includes(outcome)) {
    return { ok: false, status: STATUS.INVALID_INPUT, event: null, reason: "outcome" };
  }

  let churchId = input.churchId == null || input.churchId === "" ? null : String(input.churchId);
  let branchId = input.branchId == null || input.branchId === "" ? null : String(input.branchId);
  let actorUserId =
    input.actorUserId == null || input.actorUserId === "" ? null : String(input.actorUserId);
  let entityId = input.entityId == null || input.entityId === "" ? null : String(input.entityId);
  if (churchId && !UUID_RE.test(churchId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, event: null, reason: "church_id" };
  }
  if (branchId && !UUID_RE.test(branchId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, event: null, reason: "branch_id" };
  }
  if (actorUserId && !UUID_RE.test(actorUserId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, event: null, reason: "actor_user_id" };
  }
  if (entityId && !UUID_RE.test(entityId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, event: null, reason: "entity_id" };
  }

  const sanitized = sanitizeAuditMetadata(input.metadata);
  if (!sanitized.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, event: null, reason: sanitized.reason };
  }

  try {
    return await withClient(db, async (client) => {
      // Isolate audit failures so a best-effort write cannot abort a caller's open transaction.
      const sp = `audit_sp_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6)}`;
      let usedSavepoint = false;
      try {
        await client.query(`SAVEPOINT ${sp}`);
        usedSavepoint = true;
      } catch {
        usedSavepoint = false;
      }
      try {
        const event = await repo.insertAuditEvent(client, {
          deploymentCode,
          organizationId,
          churchId,
          branchId,
          actorUserId,
          actionKey,
          entityType,
          entityId,
          outcome,
          metadata: sanitized.metadata,
        });
        if (usedSavepoint) {
          await client.query(`RELEASE SAVEPOINT ${sp}`);
        }
        return {
          ok: true,
          status: STATUS.OK,
          event,
          redactedKeys: sanitized.redactedKeys,
        };
      } catch {
        if (usedSavepoint) {
          try {
            await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
            await client.query(`RELEASE SAVEPOINT ${sp}`);
          } catch {
            /* ignore nested rollback failures */
          }
        }
        return {
          ok: false,
          status: STATUS.LOOKUP_ERROR,
          event: null,
          reason: "db_error",
          redactedKeys: sanitized.redactedKeys,
        };
      }
    });
  } catch {
    // Never surface SQL / driver payloads to callers (may be logged or rendered).
    return { ok: false, status: STATUS.LOOKUP_ERROR, event: null, reason: "db_error" };
  }
}

/**
 * Best-effort audit write — never throws; never blocks caller success path semantics.
 */
async function recordAuditEventSafe(db, input) {
  try {
    return await recordAuditEvent(db, input);
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, event: null, reason: "audit_failed" };
  }
}

async function listOrganizationAuditEvents(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  if (!UUID_RE.test(organizationId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, events: [], reason: "organization_id" };
  }
  let churchId = input.churchId == null || input.churchId === "" ? null : String(input.churchId);
  if (churchId && !UUID_RE.test(churchId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, events: [], reason: "church_id" };
  }
  let branchId = input.branchId == null || input.branchId === "" ? null : String(input.branchId);
  if (branchId && !UUID_RE.test(branchId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, events: [], reason: "branch_id" };
  }
  let actorUserId =
    input.actorUserId == null || input.actorUserId === "" ? null : String(input.actorUserId);
  if (actorUserId && !UUID_RE.test(actorUserId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, events: [], reason: "actor_user_id" };
  }
  let actionKey =
    input.actionKey == null || input.actionKey === ""
      ? null
      : String(input.actionKey).trim().toLowerCase();
  if (actionKey && !ACTION_KEY_RE.test(actionKey)) {
    return { ok: false, status: STATUS.INVALID_INPUT, events: [], reason: "action_key" };
  }
  let actionCategory =
    input.actionCategory == null || input.actionCategory === ""
      ? null
      : String(input.actionCategory).trim().toLowerCase();
  if (actionCategory && !ACTION_CATEGORY_RE.test(actionCategory)) {
    return { ok: false, status: STATUS.INVALID_INPUT, events: [], reason: "action_category" };
  }
  if (actionKey && actionCategory) {
    actionCategory = null;
  }
  let entityType =
    input.entityType == null || input.entityType === ""
      ? null
      : String(input.entityType).trim().toLowerCase();
  if (entityType && !ENTITY_TYPE_RE.test(entityType)) {
    return { ok: false, status: STATUS.INVALID_INPUT, events: [], reason: "entity_type" };
  }
  let outcome =
    input.outcome == null || input.outcome === ""
      ? null
      : String(input.outcome).trim().toLowerCase();
  if (outcome && !OUTCOMES.includes(outcome)) {
    return { ok: false, status: STATUS.INVALID_INPUT, events: [], reason: "outcome" };
  }
  let createdOnOrAfter =
    input.createdOnOrAfter == null || input.createdOnOrAfter === ""
      ? null
      : String(input.createdOnOrAfter).trim();
  if (createdOnOrAfter && !DATE_RE.test(createdOnOrAfter)) {
    return { ok: false, status: STATUS.INVALID_INPUT, events: [], reason: "created_on_or_after" };
  }
  let createdToDate =
    input.createdToDate == null || input.createdToDate === ""
      ? null
      : String(input.createdToDate).trim();
  if (createdToDate && !DATE_RE.test(createdToDate)) {
    return { ok: false, status: STATUS.INVALID_INPUT, events: [], reason: "created_to_date" };
  }
  let createdBeforeExclusive = null;
  if (createdOnOrAfter) {
    createdOnOrAfter = `${createdOnOrAfter}T00:00:00.000Z`;
  }
  if (createdToDate) {
    const d = new Date(`${createdToDate}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) {
      return { ok: false, status: STATUS.INVALID_INPUT, events: [], reason: "created_to_date" };
    }
    d.setUTCDate(d.getUTCDate() + 1);
    createdBeforeExclusive = d.toISOString();
  }
  try {
    return await withClient(db, async (client) => {
      const page = await repo.listAuditEvents(client, {
        organizationId,
        churchId,
        branchId,
        actorUserId,
        actionKey,
        actionCategory,
        entityType,
        outcome,
        createdOnOrAfter,
        createdBeforeExclusive,
        before: input.before || null,
        limit: input.limit,
      });
      return {
        ok: true,
        status: STATUS.OK,
        events: page.events,
        hasMore: page.hasMore,
        nextBefore: page.nextBefore,
      };
    });
  } catch {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      events: [],
      reason: "db_error",
    };
  }
}

module.exports = {
  STATUS,
  OUTCOMES,
  FORBIDDEN_METADATA_KEYS,
  ALLOWED_METADATA_KEYS,
  sanitizeAuditMetadata,
  recordAuditEvent,
  recordAuditEventSafe,
  listOrganizationAuditEvents,
};
