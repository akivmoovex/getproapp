"use strict";

const instanceRepo = require("./instanceRepository");
const contentService = require("./contentService");
const resolver = require("./resolver");
const versionService = require("./versionService");
const { recordModerationEvent, ACTION } = require("./moderationEventService");
const { autoPublishes, PUBLISH_POLICY } = require("./publishPolicy");
const { LIFECYCLE_STATUS } = require("./lifecycleStatus");
const editSessionService = require("./editSessionService");
const { assertWebsiteInstanceScope } = require("./authorizeWebsite");
const { hasWebsitePermission, PERMISSIONS } = require("./permissions");
const lifecycleService = require("./lifecycleService");

const RESULT = Object.freeze({
  OK: "ok",
  EDIT_LOCKED: "website_edit_locked",
  PUBLISH_LOCKED: "website_publish_locked",
  POLICY_LOCKED: "website_policy_locked",
  NOT_FOUND: "website_instance_not_found",
  FORBIDDEN: "forbidden",
});

async function currentPublishedVersionId(db, instance) {
  const listed = await versionService.listWebsiteVersions(db, {
    instanceId: instance.id,
    organizationId: instance.organizationId,
  });
  const live = (listed.versions || []).find((v) => v.status === "published");
  return live ? live.id : null;
}

async function snapshotLiveContent(db, instance) {
  const resolved = await resolver.resolveWebsiteContent(db, {
    organizationId: instance.organizationId,
    instance,
    mode: resolver.MODE.LIVE,
  });
  return resolver.snapshotFromResolved(resolved);
}

async function createPublicationVersion(db, input) {
  const instance = input.instance;
  const previousVersionId =
    input.previousVersionId || (await currentPublishedVersionId(db, instance));
  const snapshot = input.snapshot || (await snapshotLiveContent(db, instance));
  const created = await versionService.createWebsiteVersion(db, {
    instance,
    snapshot,
    submissionId: input.submissionId || null,
    submitterIdentityId: input.actorIdentityId || null,
    reviewerIdentityId: input.reviewerIdentityId || null,
    editorIdentityId: input.actorIdentityId || null,
    changeCount: (input.changedKeys || []).length,
    changedKeys: input.changedKeys || [],
    sourcePolicy: input.sourcePolicy || instance.publishPolicy,
    previousVersionId,
    moderationStatus: input.moderationStatus || "published",
    auditActionKey: input.auditActionKey || "website.publish",
  });
  if (created.ok && input.recordModeration === true) {
    await recordModerationEvent(db, {
      organizationId: instance.organizationId,
      instanceId: instance.id,
      productCode: instance.productCode,
      actorIdentityId: input.actorIdentityId || null,
      actionKey: input.moderationActionKey || ACTION.AUTO_PUBLISH,
      previousState: previousVersionId,
      newState: created.version && created.version.id,
      targetVersionId: created.version && created.version.id,
      metadata: {
        changed_keys: input.changedKeys || [],
        source_policy: input.sourcePolicy || instance.publishPolicy,
      },
    });
  }
  if (
    created.ok &&
    instance.lifecycleStatus === LIFECYCLE_STATUS.PROVISIONAL &&
    instance.adapterMode === "shared_engine"
  ) {
    await instanceRepo.updateWebsiteInstance(db, {
      instanceId: instance.id,
      organizationId: instance.organizationId,
      status: instance.status === "draft" ? "coming_soon" : instance.status,
    });
  }
  return created;
}

async function publishDraftKey(db, instance, contentKey) {
  await db.query(
    `UPDATE platform.website_content
        SET published_value = draft_value,
            updated_at = now()
      WHERE instance_id = $1 AND organization_id = $2 AND content_key = $3`,
    [instance.id, instance.organizationId, contentKey]
  );
}

async function saveDraftAndMaybePublish(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  const instance = await instanceRepo.findWebsiteInstanceById(db, input.instanceId, organizationId);
  const scoped = assertWebsiteInstanceScope(instance, input);
  if (!scoped.ok) {
    return { ok: false, code: scoped.code === "tenant_mismatch" ? scoped.code : RESULT.NOT_FOUND, content: null };
  }
  if (instance.editLocked === true) {
    return { ok: false, code: RESULT.EDIT_LOCKED, content: null };
  }
  const saved = await contentService.saveWebsiteDraft(db, input);
  if (!saved.ok) return saved;

  if (instance.publishPolicy === PUBLISH_POLICY.PLATFORM_LOCKED || instance.publishLocked === true) {
    return { ...saved, published: false, version: null };
  }
  if (!autoPublishes(instance.publishPolicy, instance.publishLocked)) {
    return { ...saved, published: false, version: null };
  }

  const oldPublished =
    saved.content && Object.prototype.hasOwnProperty.call(saved.content, "publishedValue")
      ? saved.content.publishedValue
      : null;
  await publishDraftKey(db, instance, saved.content.contentKey);
  await recordModerationEvent(db, {
    organizationId: instance.organizationId,
    instanceId: instance.id,
    productCode: instance.productCode,
    actorIdentityId: input.actorIdentityId || null,
    actionKey: ACTION.AUTO_PUBLISH,
    notesTenantVisible: false,
    metadata: {
      content_key: saved.content.contentKey,
      old_summary: String(oldPublished == null ? "" : JSON.stringify(oldPublished)).slice(0, 180),
      new_summary: String(
        saved.content.draftValue == null ? "" : JSON.stringify(saved.content.draftValue)
      ).slice(0, 180),
    },
  });
  const batched = await editSessionService.recordAutoPublishSave(db, {
    instance,
    actorIdentityId: input.actorIdentityId || null,
    contentKey: saved.content.contentKey,
    sourcePolicy: PUBLISH_POLICY.AUTO_PUBLISH_WITH_MODERATION,
    inactivityMs: input.inactivityMs,
  });
  if (
    batched.ok &&
    instance.lifecycleStatus === LIFECYCLE_STATUS.PROVISIONAL &&
    instance.adapterMode === "shared_engine"
  ) {
    await instanceRepo.updateWebsiteInstance(db, {
      instanceId: instance.id,
      organizationId: instance.organizationId,
      status: instance.status === "draft" ? "coming_soon" : instance.status,
    });
  }
  return {
    ...saved,
    published: true,
    version: batched.version || null,
    session: batched.session || null,
  };
}

async function publishWebsiteDraft(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  const instance = await instanceRepo.findWebsiteInstanceById(db, input.instanceId, organizationId);
  const scoped = assertWebsiteInstanceScope(instance, input);
  if (!scoped.ok) return { ok: false, code: scoped.code === "tenant_mismatch" ? scoped.code : RESULT.NOT_FOUND, version: null };
  if (instance.publishLocked === true || instance.publishPolicy === PUBLISH_POLICY.PLATFORM_LOCKED) {
    return { ok: false, code: RESULT.PUBLISH_LOCKED, version: null };
  }
  if (instance.publishPolicy === PUBLISH_POLICY.REVIEW_BEFORE_PUBLISH && input.forceTenantPublish !== true) {
    return { ok: false, code: RESULT.POLICY_LOCKED, version: null };
  }

  const rows = await contentService.listWebsiteContent(db, instance, organizationId);
  const changedKeys = [];
  for (const row of rows) {
    if (!contentService.valuesEqual(row.draftValue, row.publishedValue)) {
      await publishDraftKey(db, instance, row.contentKey);
      changedKeys.push(row.contentKey);
    }
  }

  const listed = await versionService.listWebsiteVersions(db, {
    instanceId: instance.id,
    organizationId,
  });
  const current = (listed.versions || []).find((v) => v.status === "published") || null;
  if (!changedKeys.length && current && input.allowEmpty !== true) {
    return {
      ok: true,
      code: "already_current",
      published: false,
      version: current,
      changedKeys: [],
    };
  }

  await editSessionService.closeOpenSessionsForInstance(db, {
    organizationId,
    instanceId: instance.id,
    editorIdentityId: input.actorIdentityId || null,
    reason: editSessionService.CLOSE_REASON.FINISH,
  });

  const created = await createPublicationVersion(db, {
    instance,
    actorIdentityId: input.actorIdentityId || null,
    reviewerIdentityId: input.actorIdentityId || null,
    changedKeys,
    sourcePolicy: instance.publishPolicy,
    moderationStatus: "published",
    auditActionKey: "website.publish",
    moderationActionKey: ACTION.TENANT_PUBLISH,
    recordModeration: true,
  });
  return {
    ok: created.ok,
    code: created.ok ? RESULT.OK : created.code,
    published: Boolean(created.ok),
    version: created.version || null,
    changedKeys,
  };
}

async function restoreWebsiteVersionLive(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  const instance = await instanceRepo.findWebsiteInstanceById(db, input.instanceId, organizationId);
  const scoped = assertWebsiteInstanceScope(instance, input);
  if (!scoped.ok) return { ok: false, code: scoped.code === "tenant_mismatch" ? scoped.code : RESULT.NOT_FOUND };
  await editSessionService.closeOpenSessionsForInstance(db, {
    organizationId,
    instanceId: instance.id,
    reason: editSessionService.CLOSE_REASON.RESTORE,
  });
  const loaded = await versionService.getWebsiteVersion(db, {
    versionId: input.versionId,
    organizationId,
    instanceId: instance.id,
  });
  if (!loaded.ok) return loaded;
  if (loaded.version.instanceId !== instance.id) {
    return { ok: false, code: versionService.RESULT.TENANT_MISMATCH };
  }
  await contentService.applyPublishedSnapshot(
    db,
    instance,
    loaded.version.snapshot || {},
    input.actorIdentityId || null
  );
  const created = await createPublicationVersion(db, {
    instance,
    actorIdentityId: input.actorIdentityId || null,
    reviewerIdentityId: input.actorIdentityId || null,
    snapshot: loaded.version.snapshot,
    changedKeys: loaded.version.changedKeys || [],
    sourcePolicy: "RESTORE",
    previousVersionId: loaded.version.id,
    moderationStatus: "restored",
    auditActionKey: "website.rollback",
    moderationActionKey: ACTION.RESTORE_VERSION,
    recordModeration: true,
  });
  return { ok: created.ok, version: created.version, restoredFrom: loaded.version };
}

/**
 * Copy a historical version into the current draft. Does not publish.
 */
async function restoreWebsiteVersionToDraft(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  const instance = await instanceRepo.findWebsiteInstanceById(db, input.instanceId, organizationId);
  const scoped = assertWebsiteInstanceScope(instance, input);
  if (!scoped.ok) return { ok: false, code: scoped.code === "tenant_mismatch" ? scoped.code : RESULT.NOT_FOUND };
  return versionService.restoreWebsiteVersionToDraft(db, {
    ...input,
    instanceId: instance.id,
    organizationId,
  });
}

async function unpublishWebsite(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  const instance = await instanceRepo.findWebsiteInstanceById(db, input.instanceId, organizationId);
  const scoped = assertWebsiteInstanceScope(instance, input);
  if (!scoped.ok) {
    return {
      ok: false,
      code: scoped.code === "tenant_mismatch" ? scoped.code : RESULT.NOT_FOUND,
      instance: null,
    };
  }
  if (Array.isArray(input.grantedPermissions)) {
    const allowed =
      hasWebsitePermission(input.grantedPermissions, PERMISSIONS.PUBLISH) ||
      hasWebsitePermission(input.grantedPermissions, PERMISSIONS.TAKE_OFFLINE);
    if (!allowed) return { ok: false, code: RESULT.FORBIDDEN, instance };
  }
  const unpublished = await lifecycleService.applyLifecycle(db, {
    organizationId,
    instanceId: instance.id,
    actorIdentityId: input.actorIdentityId || null,
    lifecycleStatus: LIFECYCLE_STATUS.PROVISIONAL,
    auditActionKey: "website.unpublish",
    moderationActionKey: ACTION.TENANT_UNPUBLISH,
    reason: input.reason || "tenant_unpublish",
    notesTenantVisible: false,
    syncProductAvailability: input.syncProductAvailability !== false,
  });
  return {
    ok: unpublished.ok,
    code: unpublished.code,
    instance: unpublished.instance || instance,
    publishedUnchanged: true,
  };
}

module.exports = {
  RESULT,
  createPublicationVersion,
  saveDraftAndMaybePublish,
  publishWebsiteDraft,
  unpublishWebsite,
  restoreWebsiteVersionLive,
  restoreWebsiteVersionToDraft,
  snapshotLiveContent,
};
