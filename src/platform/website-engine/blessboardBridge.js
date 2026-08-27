"use strict";

/**
 * BlessBoard adapter onto the shared website engine.
 * Church/branch public_pages remain the product content store.
 * Draft / publish / version / restore lifecycle is owned by the engine.
 */

const instanceRepo = require("../website/instanceRepository");
const contentService = require("../website/contentService");
const publicationService = require("../website/publicationService");
const { SNAPSHOT_KEY } = require("./productSchemaRegistry");
const {
  ensureBlessBoardWebsiteInstance,
  findBlessBoardWebsiteInstance,
} = require("../../blessboard/website/blessboardWebsiteAdapter");
const {
  registerBlessBoardWebsiteTemplate,
} = require("../../blessboard/website/blessboardChurchTemplate");

const CMS_SNAPSHOT = SNAPSHOT_KEY;

function snapshotFromLegacy(raw) {
  const snap = raw && typeof raw === "object" ? raw : {};
  return {
    themeKey: snap.themeKey || "default",
    branchId: snap.branchId || null,
    pageKeys: Array.isArray(snap.pageKeys) ? snap.pageKeys : [],
    pages: Array.isArray(snap.pages) ? snap.pages : [],
    navigation: Array.isArray(snap.navigation) ? snap.navigation : [],
    entities: snap.entities && typeof snap.entities === "object" ? snap.entities : {},
  };
}

async function resolveInstance(db, input) {
  registerBlessBoardWebsiteTemplate();
  const organizationId = String((input && input.organizationId) || "");
  const branchId = input && input.branchId ? String(input.branchId) : null;
  const ensured = await ensureBlessBoardWebsiteInstance(db, {
    organizationId,
    slug: input && input.slug,
    branchId,
    actorIdentityId: input && input.actorIdentityId,
    lifecycleStatus: input && input.lifecycleStatus,
    status: input && input.status,
  });
  if (ensured && ensured.ok && ensured.instance) return ensured;
  const found = await findBlessBoardWebsiteInstance(db, organizationId, branchId);
  if (found) return { ok: true, instance: found, created: false };
  return { ok: false, instance: null };
}

async function loadLegacySnapshot(db, input) {
  const { buildPublicationSnapshot } = require("../../blessboard/services/websitePublicationVersionService");
  const churchId = String((input && input.churchId) || "");
  const branchId = input && input.branchId ? String(input.branchId) : null;
  const raw = await buildPublicationSnapshot(db, churchId, branchId);
  return snapshotFromLegacy(raw);
}

async function saveEngineDraft(db, instance, snapshot, actorIdentityId) {
  return contentService.saveWebsiteDraft(db, {
    organizationId: instance.organizationId,
    instanceId: instance.id,
    expectedProductCode: "blessboard",
    contentKey: CMS_SNAPSHOT,
    value: snapshotFromLegacy(snapshot),
    actorIdentityId: actorIdentityId || null,
  });
}

async function syncDraftToEngine(db, input) {
  const resolved = await resolveInstance(db, input);
  if (!resolved.ok || !resolved.instance) return { ok: false, code: "website_instance_not_found" };
  if (!input.churchId) return { ok: false, code: "invalid_input" };
  const snapshot = await loadLegacySnapshot(db, input);
  const saved = await saveEngineDraft(db, resolved.instance, snapshot, input.actorIdentityId);
  return {
    ok: Boolean(saved && saved.ok),
    code: saved && saved.code,
    instance: resolved.instance,
    published: false,
    content: saved && saved.content,
  };
}

async function ensureEngineContent(db, input) {
  const resolved = await resolveInstance(db, input);
  if (!resolved.ok || !resolved.instance) return resolved;
  const instance = resolved.instance;
  const existing = await contentService.getWebsiteContentRow(
    db,
    instance.id,
    instance.organizationId,
    CMS_SNAPSHOT
  );
  if (existing && (existing.draftValue != null || existing.publishedValue != null)) {
    return { ok: true, instance, seeded: false };
  }
  if (!input.churchId) return { ok: true, instance, seeded: false };
  const snapshot = await loadLegacySnapshot(db, input);
  const seedPublished = input.websiteStatus === "published" || input.seedPublished === true;
  await contentService.seedWebsiteContent(
    db,
    instance,
    [
      {
        contentKey: CMS_SNAPSHOT,
        value: snapshot,
        publish: seedPublished,
      },
    ],
    input.actorIdentityId || null
  );
  return { ok: true, instance, seeded: true };
}

async function publishFromLegacy(db, input) {
  const resolved = await resolveInstance(db, input);
  if (!resolved.ok || !resolved.instance) {
    return { ok: false, code: "website_instance_not_found", version: null };
  }
  const snapshot = input.snapshot || (await loadLegacySnapshot(db, input));
  const saved = await saveEngineDraft(db, resolved.instance, snapshot, input.actorIdentityId);
  if (!saved.ok) return { ok: false, code: saved.code, version: null };
  const published = await publicationService.publishWebsiteDraft(db, {
    organizationId: resolved.instance.organizationId,
    instanceId: resolved.instance.id,
    expectedProductCode: "blessboard",
    actorIdentityId: input.actorIdentityId || null,
    forceTenantPublish: true,
    allowEmpty: true,
  });
  return {
    ok: Boolean(published && published.ok),
    code: published && published.code,
    version: published && published.version,
    instance: resolved.instance,
    changedKeys: published && published.changedKeys,
  };
}

async function restoreDraftFromLegacy(db, input) {
  const resolved = await resolveInstance(db, input);
  if (!resolved.ok || !resolved.instance) {
    return { ok: false, code: "website_instance_not_found" };
  }
  const snapshot = input.snapshot || (await loadLegacySnapshot(db, input));
  const saved = await saveEngineDraft(db, resolved.instance, snapshot, input.actorIdentityId);
  return {
    ok: Boolean(saved && saved.ok),
    publishedUnchanged: true,
    instance: resolved.instance,
    content: saved && saved.content,
  };
}

async function unpublishFromLegacy(db, input) {
  const resolved = await resolveInstance(db, input);
  if (!resolved.ok || !resolved.instance) {
    return { ok: false, code: "website_instance_not_found" };
  }
  return publicationService.unpublishWebsite(db, {
    organizationId: resolved.instance.organizationId,
    instanceId: resolved.instance.id,
    expectedProductCode: "blessboard",
    actorIdentityId: input.actorIdentityId || null,
    grantedPermissions: input.grantedPermissions || ["website.publish"],
    syncProductAvailability: input.syncProductAvailability === true,
    reason: input.reason || "tenant_unpublish",
  });
}

module.exports = {
  CMS_SNAPSHOT,
  snapshotFromLegacy,
  resolveInstance,
  syncDraftToEngine,
  ensureEngineContent,
  publishFromLegacy,
  restoreDraftFromLegacy,
  unpublishFromLegacy,
  findBlessBoardWebsiteInstance,
  instanceRepo,
};
