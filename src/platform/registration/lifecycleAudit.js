"use strict";

/**
 * Canonical organization-lifecycle audit writes for ActiveClinic and BlessBoard.
 * Uses platform.audit_events (requires an organization UUID). Pre-organization
 * submitted / review_required / rejection stay in product review history until
 * an organization exists.
 */

const { recordAuditEventSafe } = require("../services/auditEventService");

const ACTION = Object.freeze({
  SUBMITTED: "registration.submitted",
  REVIEW_REQUIRED: "registration.review_required",
  APPROVED: "registration.approved",
  REJECTED: "registration.rejected",
  PROVISIONING_STARTED: "registration.provisioning_started",
  ORGANIZATION_CREATED: "registration.organization_created",
  ADMIN_ROLE_ASSIGNED: "registration.admin_role_assigned",
  WEBSITE_INITIALIZED: "website.initialized",
  PROVISIONING_RETRY: "registration.provisioning_retry",
  PROVISIONING_FAILED: "registration.provisioning_failed",
  PROVISIONING_COMPLETED: "registration.provisioning_completed",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function compact(value) {
  if (value == null) return undefined;
  const s = String(value).trim();
  if (!s) return undefined;
  return s.slice(0, 120);
}

/**
 * Best-effort lifecycle audit. Never throws. Skips when organizationId is missing.
 * @param {{ query: Function, connect?: Function }} db
 * @param {object} input
 */
async function recordLifecycleAudit(db, input) {
  const organizationId = compact(input && input.organizationId);
  if (!organizationId || !UUID_RE.test(organizationId)) {
    return { recorded: false, reason: "no_organization" };
  }
  const actionKey = String((input && input.actionKey) || "").trim().toLowerCase();
  if (!actionKey) return { recorded: false, reason: "action_key" };

  const metadata = {
    category: compact(input.category) || "registration",
    product_code: compact(input.productCode || input.product_code),
    product_key: compact(input.productCode || input.product_key),
    actor_type: compact(input.actorType || input.actor_type || input.actorKind),
    actor_identity_id: compact(input.actorIdentityId),
    application_id: compact(input.applicationId),
    instance_id: compact(input.instanceId),
    version_id: compact(input.versionId),
    media_id: compact(input.mediaId),
    content_key: compact(input.contentKey),
    failed_stage: compact(input.failedStage || input.failed_stage),
    provisioning_status: compact(input.provisioningStatus || input.provisioning_status),
    reason_code: compact(input.reasonCode || input.reason_code),
    status: compact(input.status),
    from_status: compact(input.fromStatus || input.from_status),
    to_status: compact(input.toStatus || input.to_status),
    source: compact(input.source),
    entity_key: compact(input.entityKey || input.entity_key),
  };
  if (input.retry === true) metadata.retry = true;
  if (input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)) {
    Object.assign(metadata, input.metadata);
  }

  const result = await recordAuditEventSafe(db, {
    deploymentCode: (input && input.deploymentCode) || "moovex-platform-testing",
    organizationId,
    churchId: input.churchId || null,
    branchId: input.branchId || null,
    actorUserId: input.actorUserId || null,
    actionKey,
    entityType: input.entityType || "registration_application",
    entityId: input.entityId || input.applicationId || null,
    outcome: input.outcome || "success",
    metadata,
  });
  return { recorded: Boolean(result && result.ok), result };
}

module.exports = {
  ACTION,
  recordLifecycleAudit,
};
