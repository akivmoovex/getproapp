"use strict";

/**
 * BlessBoard publication governance adapter (V2.04 Phase 5).
 *
 * BB owns HQ/branch readiness + public_pages projection semantics.
 * Platform owns draft/publish/version/restore engines.
 *
 * `churchWebsitePublishService` now mints versions via
 * `publicationService.publishWebsiteDraft` (not BB version engine / publishFromLegacy).
 */

const { PRODUCT } = require("../../platform/registration/constants");
const publicationService = require("../../platform/website/publicationService");
const { PERMISSIONS } = require("../../platform/website/permissions");
const churchWebsitePublishService = require("../services/churchWebsitePublishService");
const {
  ensureBlessBoardWebsiteInstance,
} = require("./blessboardWebsiteAdapter");

const PRODUCT_CODE = PRODUCT.BLESSBOARD;

/**
 * @param {object} db
 * @param {object} request — churchId, confirmPublish, actorUserId, …
 */
async function publish(db, request) {
  const result = await churchWebsitePublishService.publishChurchWebsite(db, request);
  return {
    ...(result && typeof result === "object" ? result : { ok: false }),
    runtimePath: "PLATFORM",
  };
}

/**
 * @param {object} db
 * @param {object} request
 */
async function unpublish(db, request) {
  const result = await churchWebsitePublishService.unpublishChurchWebsite(db, request);
  return {
    ...(result && typeof result === "object" ? result : { ok: false }),
    runtimePath: "PLATFORM",
  };
}

/**
 * Restore → draft via platform version engine (not BB createRestoredDraft).
 * @param {object} db
 * @param {object} request
 */
async function restore(db, request) {
  const organizationId = String((request && request.organizationId) || "");
  const versionId =
    (request && (request.versionId || request.publicationVersionId || request.targetVersionId)) ||
    null;
  if (!organizationId || !versionId) {
    return { ok: false, status: "invalid_input", reason: "organization_id_or_version" };
  }

  const ensured = await ensureBlessBoardWebsiteInstance(db, {
    organizationId,
    slug: request.slug || request.organizationKey || undefined,
    branchId: request.branchId || null,
    actorIdentityId: request.actorUserId || request.actorIdentityId || null,
  });
  if (!ensured || !ensured.ok || !ensured.instance) {
    return { ok: false, status: "invalid_input", reason: "website_instance_not_found" };
  }

  const restored = await publicationService.restoreWebsiteVersionToDraft(db, {
    organizationId,
    instanceId: ensured.instance.id,
    versionId,
    actorIdentityId: request.actorUserId || request.actorIdentityId || null,
    grantedPermissions: request.grantedPermissions || [
      PERMISSIONS.RESTORE,
      PERMISSIONS.ROLLBACK,
    ],
  });

  return {
    ...restored,
    runtimePath: "PLATFORM",
  };
}

function lifecycleHandlers() {
  return {
    publish,
    unpublish,
    restore,
  };
}

module.exports = {
  PRODUCT_CODE,
  publish,
  unpublish,
  restore,
  lifecycleHandlers,
  publishChurchWebsite: churchWebsitePublishService.publishChurchWebsite,
  unpublishChurchWebsite: churchWebsitePublishService.unpublishChurchWebsite,
  createRestoredDraft: restore,
};
