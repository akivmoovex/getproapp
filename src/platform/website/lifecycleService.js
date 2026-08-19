"use strict";

const instanceRepo = require("./instanceRepository");
const { recordWebsiteAudit } = require("./auditService");
const { recordModerationEvent, ACTION } = require("./moderationEventService");
const { isLifecycleStatus, LIFECYCLE_STATUS } = require("./lifecycleStatus");
const { isPublishPolicy } = require("./publishPolicy");
const editSessionService = require("./editSessionService");
const settingsRepo = require("../../blessboard/repositories/blessBoardSettingsRepository");

const RESULT = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "website_instance_not_found",
  TENANT_MISMATCH: "tenant_mismatch",
  NOOP: "already_in_state",
});

function blessBoardWebsiteStatusForLifecycle(lifecycleStatus) {
  if (lifecycleStatus === LIFECYCLE_STATUS.PUBLIC) return "published";
  if (lifecycleStatus === LIFECYCLE_STATUS.SUSPENDED) return "suspended";
  return "draft";
}

async function syncActiveClinicAvailabilityFlag(db, instance, lifecycleStatus) {
  if (!instance || instance.productCode !== "activeclinic") return;
  const wantPublic = lifecycleStatus === LIFECYCLE_STATUS.PUBLIC;
  await db.query(
    `UPDATE activeclinic.healthcare_organizations
        SET website_published = $2, updated_at = now()
      WHERE organization_id = $1`,
    [instance.organizationId, wantPublic]
  );
}

async function syncBlessBoardWebsiteStatus(db, instance, lifecycleStatus) {
  if (!instance || instance.productCode !== "blessboard") return;
  const church = await db.query(
    `SELECT id FROM blessboard.churches WHERE organization_id = $1 LIMIT 1`,
    [instance.organizationId]
  );
  if (!church.rows[0]) return;
  const existing = await settingsRepo.findChurchSettings(db, church.rows[0].id);
  if (!existing) return;
  const next = blessBoardWebsiteStatusForLifecycle(lifecycleStatus);
  if (String(existing.websiteStatus || "") === next) return;
  await settingsRepo.upsertChurchSettings(db, church.rows[0].id, {
    publicName: existing.publicName,
    denomination: existing.denomination,
    primaryEmail: existing.primaryEmail,
    primaryPhone: existing.primaryPhone,
    defaultTimezone: existing.defaultTimezone,
    defaultCountryCode: existing.defaultCountryCode,
    websiteStatus: next,
  });
}

async function syncProductWebsiteAvailability(db, instance, lifecycleStatus) {
  await syncActiveClinicAvailabilityFlag(db, instance, lifecycleStatus);
  await syncBlessBoardWebsiteStatus(db, instance, lifecycleStatus);
}

async function applyLifecycle(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  const instance = await instanceRepo.findWebsiteInstanceById(db, input.instanceId, organizationId);
  if (!instance) return { ok: false, code: RESULT.NOT_FOUND, instance: null };
  if (instance.organizationId !== organizationId) {
    return { ok: false, code: RESULT.TENANT_MISMATCH, instance: null };
  }
  const nextStatus = String(input.lifecycleStatus || instance.lifecycleStatus || "");
  if (!isLifecycleStatus(nextStatus)) return { ok: false, code: RESULT.INVALID_INPUT, instance };
  const nextPolicy =
    input.publishPolicy != null ? String(input.publishPolicy) : instance.publishPolicy;
  if (input.publishPolicy != null && !isPublishPolicy(nextPolicy)) {
    return { ok: false, code: RESULT.INVALID_INPUT, instance };
  }

  const editLocked =
    input.editLocked == null ? instance.editLocked === true : input.editLocked === true;
  const publishLocked =
    input.publishLocked == null ? instance.publishLocked === true : input.publishLocked === true;

  const unchanged =
    instance.lifecycleStatus === nextStatus &&
    instance.publishPolicy === nextPolicy &&
    instance.editLocked === editLocked &&
    instance.publishLocked === publishLocked &&
    input.force !== true;
  if (unchanged) {
    return { ok: true, code: RESULT.NOOP, instance };
  }

  const rows = await db.query(
    `UPDATE platform.website_instances
        SET previous_lifecycle_status = lifecycle_status,
            lifecycle_status = $2,
            publish_policy = $3,
            lifecycle_reason = $4,
            lifecycle_note_public = $5,
            lifecycle_note_internal = $6,
            lifecycle_changed_at = now(),
            lifecycle_changed_by = $7,
            edit_locked = $8,
            publish_locked = $9,
            updated_at = now()
      WHERE id = $1 AND organization_id = $10
      RETURNING *`,
    [
      instance.id,
      nextStatus,
      nextPolicy,
      input.reason ? String(input.reason).slice(0, 500) : null,
      input.notePublic ? String(input.notePublic).slice(0, 2000) : null,
      input.noteInternal ? String(input.noteInternal).slice(0, 2000) : null,
      input.actorIdentityId || null,
      editLocked,
      publishLocked,
      organizationId,
    ]
  );
  const updated = instanceRepo.mapInstance(rows.rows[0]);
  if (input.syncProductAvailability !== false) {
    await syncProductWebsiteAvailability(db, updated, nextStatus);
  }
  await recordWebsiteAudit(db, {
    organizationId,
    instanceId: instance.id,
    actorIdentityId: input.actorIdentityId || null,
    actionKey: input.auditActionKey || "website.lifecycle.change",
    versionId: input.targetVersionId || null,
    metadata: {
      from_status: instance.lifecycleStatus,
      to_status: nextStatus,
      policy: nextPolicy,
      reason_code: input.reason ? String(input.reason).slice(0, 120) : null,
    },
  });
  await recordModerationEvent(db, {
    organizationId,
    instanceId: instance.id,
    productCode: instance.productCode,
    actorIdentityId: input.actorIdentityId || null,
    actionKey: input.moderationActionKey || ACTION.FLAGGED,
    reason: input.reason || null,
    notes: input.notes || input.notePublic || null,
    notesTenantVisible: input.notesTenantVisible === true || Boolean(input.notePublic),
    previousState: input.previousStateOverride || instance.lifecycleStatus,
    newState: input.newStateOverride || nextStatus,
    targetVersionId: input.targetVersionId || null,
    metadata: { policy: nextPolicy, edit_locked: editLocked, publish_locked: publishLocked },
  });
  if (
    nextStatus === LIFECYCLE_STATUS.OFFLINE ||
    nextStatus === LIFECYCLE_STATUS.SUSPENDED
  ) {
    await editSessionService.closeOpenSessionsForInstance(db, {
      organizationId,
      instanceId: instance.id,
      reason: editSessionService.CLOSE_REASON.LIFECYCLE,
    });
  }
  return { ok: true, code: RESULT.OK, instance: updated, previous: instance };
}

async function takeWebsiteOffline(db, input) {
  return applyLifecycle(db, {
    ...input,
    lifecycleStatus: LIFECYCLE_STATUS.OFFLINE,
    editLocked: false,
    publishLocked: input.publishLocked === true,
    auditActionKey: "website.lifecycle.offline",
    moderationActionKey: ACTION.TAKE_OFFLINE,
    notesTenantVisible: true,
  });
}

async function suspendWebsite(db, input) {
  return applyLifecycle(db, {
    ...input,
    lifecycleStatus: LIFECYCLE_STATUS.SUSPENDED,
    editLocked: input.editLocked !== false,
    publishLocked: input.publishLocked !== false,
    auditActionKey: "website.lifecycle.suspend",
    moderationActionKey: ACTION.SUSPEND,
    notesTenantVisible: true,
  });
}

async function restoreWebsiteAvailability(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  const instance = await instanceRepo.findWebsiteInstanceById(db, input.instanceId, organizationId);
  if (!instance) return { ok: false, code: RESULT.NOT_FOUND, instance: null };
  const fallback =
    instance.previousLifecycleStatus &&
    instance.previousLifecycleStatus !== LIFECYCLE_STATUS.OFFLINE &&
    instance.previousLifecycleStatus !== LIFECYCLE_STATUS.SUSPENDED
      ? instance.previousLifecycleStatus
      : LIFECYCLE_STATUS.PROVISIONAL;
  const nextStatus = isLifecycleStatus(input.lifecycleStatus) ? input.lifecycleStatus : fallback;
  return applyLifecycle(db, {
    ...input,
    lifecycleStatus: nextStatus,
    editLocked: false,
    publishLocked: false,
    auditActionKey: "website.lifecycle.restore",
    moderationActionKey: ACTION.RESTORE_SITE,
    notesTenantVisible: true,
  });
}

async function setWebsitePublishPolicy(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  const instance = await instanceRepo.findWebsiteInstanceById(db, input.instanceId, organizationId);
  if (!instance) return { ok: false, code: RESULT.NOT_FOUND, instance: null };
  if (!isPublishPolicy(input.publishPolicy)) {
    return { ok: false, code: RESULT.INVALID_INPUT, instance };
  }
  return applyLifecycle(db, {
    ...input,
    lifecycleStatus: instance.lifecycleStatus,
    publishPolicy: input.publishPolicy,
    force: true,
    auditActionKey: "website.policy.change",
    moderationActionKey: ACTION.POLICY_CHANGED,
    notesTenantVisible: false,
    previousStateOverride: instance.publishPolicy,
  });
}

async function requestLiveWebsiteChanges(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  const instance = await instanceRepo.findWebsiteInstanceById(db, input.instanceId, organizationId);
  if (!instance) return { ok: false, code: RESULT.NOT_FOUND, instance: null };
  const keepLive = input.takeOffline !== true && input.restoreVersionId == null;
  const nextStatus = input.takeOffline
    ? LIFECYCLE_STATUS.OFFLINE
    : instance.lifecycleStatus === LIFECYCLE_STATUS.PUBLIC
      ? LIFECYCLE_STATUS.PUBLIC
      : instance.lifecycleStatus;
  return applyLifecycle(db, {
    ...input,
    lifecycleStatus: nextStatus,
    force: true,
    notePublic: input.notePublic || input.notes || null,
    notes: input.notes || input.notePublic || null,
    notesTenantVisible: true,
    auditActionKey: "website.moderation.request_changes",
    moderationActionKey: ACTION.REQUEST_CHANGES,
    targetVersionId: input.targetVersionId || null,
  }).then((result) => ({ ...result, leftLive: keepLive && nextStatus === LIFECYCLE_STATUS.PUBLIC }));
}

async function flagWebsiteContent(db, input) {
  return applyLifecycle(db, {
    ...input,
    lifecycleStatus: input.lifecycleStatus || undefined,
    force: true,
    auditActionKey: "website.moderation.flagged",
    moderationActionKey: ACTION.FLAGGED,
    notesTenantVisible: input.notesTenantVisible === true,
  });
}

module.exports = {
  RESULT,
  applyLifecycle,
  takeWebsiteOffline,
  suspendWebsite,
  restoreWebsiteAvailability,
  setWebsitePublishPolicy,
  requestLiveWebsiteChanges,
  flagWebsiteContent,
  syncActiveClinicAvailabilityFlag,
  syncBlessBoardWebsiteStatus,
  syncProductWebsiteAvailability,
};
