"use strict";

const instanceRepo = require("./instanceRepository");
const contentService = require("./contentService");
const resolver = require("./resolver");
const versionService = require("./versionService");
const { recordModerationEvent, ACTION } = require("./moderationEventService");
const { autoPublishes, PUBLISH_POLICY } = require("./publishPolicy");
const { LIFECYCLE_STATUS } = require("./lifecycleStatus");

const RESULT = Object.freeze({
  OK: "ok",
  EDIT_LOCKED: "website_edit_locked",
  PUBLISH_LOCKED: "website_publish_locked",
  POLICY_LOCKED: "website_policy_locked",
  NOT_FOUND: "website_instance_not_found",
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
  if (created.ok && input.recordModeration !== false) {
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
  if (!instance) return { ok: false, code: RESULT.NOT_FOUND, content: null };
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

  await publishDraftKey(db, instance, saved.content.contentKey);
  const version = await createPublicationVersion(db, {
    instance,
    actorIdentityId: input.actorIdentityId || null,
    changedKeys: [saved.content.contentKey],
    sourcePolicy: PUBLISH_POLICY.AUTO_PUBLISH_WITH_MODERATION,
    moderationActionKey: ACTION.AUTO_PUBLISH,
  });
  return {
    ...saved,
    published: true,
    version: version.ok ? version.version : null,
  };
}

async function restoreWebsiteVersionLive(db, input) {
  const organizationId = String((input && input.organizationId) || "");
  const instance = await instanceRepo.findWebsiteInstanceById(db, input.instanceId, organizationId);
  if (!instance) return { ok: false, code: RESULT.NOT_FOUND };
  const loaded = await versionService.getWebsiteVersion(db, {
    versionId: input.versionId,
    organizationId,
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
  });
  return { ok: created.ok, version: created.version, restoredFrom: loaded.version };
}

module.exports = {
  RESULT,
  createPublicationVersion,
  saveDraftAndMaybePublish,
  restoreWebsiteVersionLive,
  snapshotLiveContent,
};
