"use strict";

/**
 * Shared platform audit logging facade for BlessBoard + ActiveClinic.
 *
 * - Normalizes actor / action / product / tenant / target / outcome
 * - Reuses platform.audit_events + auditEventService redaction
 * - Critical writes skip savepoint isolation so TX rollback surfaces audit failure
 * - Read access gated by existing platform-admin / permission checks
 */

const {
  recordAuditEvent,
  recordAuditEventSafe,
  listOrganizationAuditEvents,
  sanitizeAuditMetadata,
  STATUS,
  OUTCOMES,
} = require("../services/auditEventService");
const {
  SHARED_AUDIT_ACTION,
  SHARED_AUDIT_ENTITY,
  SHARED_AUDIT_OUTCOME,
  SHARED_AUDIT_PRODUCT,
  CRITICAL_AUDIT_ACTIONS,
} = require("./sharedAuditCatalog");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const AUDIT_READ_PERMISSIONS = Object.freeze([
  "platform.audit.view",
  "organization.audit.view",
  "audit.view",
  "hq.audit.view",
]);

/**
 * Build the shared event envelope (does not write).
 * @param {object} input
 */
function buildSharedAuditEvent(input) {
  const src = input && typeof input === "object" ? input : {};
  const actionKey = String(src.actionKey || src.action || "").trim().toLowerCase();
  const outcome = String(src.outcome || SHARED_AUDIT_OUTCOME.SUCCESS)
    .trim()
    .toLowerCase();
  const productCode = String(src.productCode || src.product || "")
    .trim()
    .toLowerCase() || null;
  const organizationId = src.organizationId || src.tenantId || null;
  const target = {
    entityType: String(src.entityType || src.targetType || SHARED_AUDIT_ENTITY.ORGANIZATION)
      .trim()
      .toLowerCase(),
    entityId: src.entityId || src.targetId || null,
  };
  const actor = {
    userId: src.actorUserId || src.actorId || null,
    identityId: src.actorIdentityId || null,
    type: src.actorType || null,
  };
  const tenant = {
    organizationId,
    churchId: src.churchId || null,
    branchId: src.branchId || null,
    facilityId: src.facilityId || null,
  };
  return {
    deploymentCode: src.deploymentCode || null,
    actionKey,
    outcome: OUTCOMES.includes(outcome) ? outcome : SHARED_AUDIT_OUTCOME.SUCCESS,
    productCode,
    actor,
    tenant,
    target,
    timestamp: src.timestamp || new Date().toISOString(),
    metadata: src.metadata && typeof src.metadata === "object" ? src.metadata : {},
    critical: src.critical === true || CRITICAL_AUDIT_ACTIONS.has(actionKey),
  };
}

/**
 * Fingerprint for callers that need to avoid duplicate misleading events.
 * @param {object} event
 */
function auditEventFingerprint(event) {
  const e = event && typeof event === "object" ? event : {};
  return [
    e.actionKey || "",
    e.outcome || "",
    (e.tenant && e.tenant.organizationId) || e.organizationId || "",
    (e.target && e.target.entityType) || e.entityType || "",
    (e.target && e.target.entityId) || e.entityId || "",
    (e.actor && e.actor.userId) || e.actorUserId || "",
  ].join("|");
}

/**
 * @param {object} envelope from buildSharedAuditEvent
 */
function toRecordInput(envelope, overrides) {
  const src = overrides && typeof overrides === "object" ? overrides : {};
  const meta = {
    ...(envelope.metadata || {}),
    product_code: envelope.productCode || undefined,
    actor_type: (envelope.actor && envelope.actor.type) || undefined,
    actor_identity_id: (envelope.actor && envelope.actor.identityId) || undefined,
  };
  if (src.correlationId || src.requestId) {
    meta.request_id = String(src.correlationId || src.requestId).slice(0, 64);
  }
  return {
    deploymentCode: envelope.deploymentCode,
    organizationId: envelope.tenant.organizationId,
    churchId: envelope.tenant.churchId,
    branchId: envelope.tenant.branchId,
    facilityId: envelope.tenant.facilityId,
    productCode: envelope.productCode,
    actorUserId: envelope.actor.userId,
    actionKey: envelope.actionKey,
    entityType: envelope.target.entityType,
    entityId: envelope.target.entityId,
    outcome: envelope.outcome,
    metadata: meta,
    critical: envelope.critical === true,
  };
}

/**
 * Best-effort shared audit write (never throws).
 */
async function recordSharedPlatformAudit(db, input) {
  const envelope = buildSharedAuditEvent(input);
  if (!envelope.actionKey || !envelope.tenant.organizationId) {
    return { ok: false, status: STATUS.INVALID_INPUT, event: null, reason: "scope" };
  }
  const payload = toRecordInput(envelope, input);
  return recordAuditEventSafe(db, payload);
}

/**
 * Security-critical audit write: participates in caller's transaction (no savepoint).
 * Callers must treat ok:false as a failed security mutation path.
 */
async function recordCriticalPlatformAudit(db, input) {
  const envelope = buildSharedAuditEvent({ ...input, critical: true });
  if (!envelope.actionKey || !envelope.tenant.organizationId) {
    return { ok: false, status: STATUS.INVALID_INPUT, event: null, reason: "scope" };
  }
  const payload = toRecordInput(envelope, input);
  payload.critical = true;
  return recordAuditEvent(db, payload);
}

/**
 * Authorize audit-log read. Platform admins and holders of audit.view permissions.
 * @param {{
 *   organizationId?: string,
 *   requestedOrganizationId?: string,
 *   isPlatformAdmin?: boolean,
 *   grantedPermissions?: string[],
 * }} input
 */
function authorizeAuditLogAccess(input) {
  const src = input && typeof input === "object" ? input : {};
  if (src.isPlatformAdmin === true) {
    return { ok: true, code: "platform_admin" };
  }
  const granted = Array.isArray(src.grantedPermissions) ? src.grantedPermissions : [];
  const allowed = granted.some((p) => AUDIT_READ_PERMISSIONS.includes(String(p || "").trim()));
  if (!allowed) {
    return { ok: false, code: "forbidden" };
  }
  const org = String(src.organizationId || "").trim();
  const requested = String(src.requestedOrganizationId || org).trim();
  if (org && requested && org !== requested && !UUID_RE.test(requested)) {
    return { ok: false, code: "forbidden" };
  }
  if (org && requested && UUID_RE.test(org) && UUID_RE.test(requested) && org !== requested) {
    return { ok: false, code: "tenant_mismatch" };
  }
  return { ok: true, code: "permitted" };
}

/**
 * List audits after access check. Preserves listOrganizationAuditEvents contract.
 */
async function listSharedPlatformAuditEvents(db, input) {
  const access = authorizeAuditLogAccess(input);
  if (!access.ok) {
    return {
      ok: false,
      status: access.code === "tenant_mismatch" ? STATUS.FORBIDDEN : STATUS.FORBIDDEN,
      events: [],
      reason: access.code,
    };
  }
  return listOrganizationAuditEvents(db, input);
}

/**
 * Redact helper for unit tests / dual website+platform writers.
 */
function redactAuditMetadata(raw) {
  return sanitizeAuditMetadata(raw);
}

module.exports = {
  SHARED_AUDIT_ACTION,
  SHARED_AUDIT_ENTITY,
  SHARED_AUDIT_OUTCOME,
  SHARED_AUDIT_PRODUCT,
  CRITICAL_AUDIT_ACTIONS,
  AUDIT_READ_PERMISSIONS,
  STATUS,
  buildSharedAuditEvent,
  auditEventFingerprint,
  recordSharedPlatformAudit,
  recordCriticalPlatformAudit,
  authorizeAuditLogAccess,
  listSharedPlatformAuditEvents,
  redactAuditMetadata,
};
