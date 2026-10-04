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

  const churchId = String(request.churchId || "");
  const branchId = request.branchId || null;
  const church = await db.query(
    `SELECT id, organization_id FROM blessboard.churches WHERE id = $1 LIMIT 1`,
    [churchId]
  );
  if (!church.rows[0] || String(church.rows[0].organization_id) !== organizationId) {
    return { ok: false, status: "forbidden", reason: "church_scope" };
  }
  if (branchId) {
    const branch = await db.query(
      `SELECT id FROM blessboard.branches WHERE id = $1 AND church_id = $2 LIMIT 1`,
      [branchId, churchId]
    );
    if (!branch.rows[0]) return { ok: false, status: "forbidden", reason: "branch_scope" };
  }
  const sourceVersion = await db.query(
    `SELECT instance_id, organization_id
       FROM platform.website_versions
      WHERE id = $1 AND organization_id = $2
      LIMIT 1`,
    [versionId, organizationId]
  );
  if (!sourceVersion.rows[0]) {
    return { ok: false, status: "not_found", reason: "version_scope" };
  }
  const instanceResult = await db.query(
    `SELECT *
       FROM platform.website_instances
      WHERE id = $1 AND organization_id = $2
        AND product_code = $3
        AND status <> 'archived'
      LIMIT 1`,
    [sourceVersion.rows[0].instance_id, organizationId, PRODUCT_CODE]
  );
  const instance = instanceResult.rows[0] || null;
  if (!instance) {
    return { ok: false, status: "not_found", reason: "website_instance_not_found" };
  }
  if (branchId) {
    if (
      instance.scope_kind !== "branch" ||
      String(instance.scope_ref || "") !== String(branchId)
    ) {
      return { ok: false, status: "not_found", reason: "version_scope" };
    }
  } else if (instance.scope_kind !== "church_wide") {
    return { ok: false, status: "not_found", reason: "version_scope" };
  }

  const restored = await publicationService.restoreWebsiteVersionToDraft(db, {
    organizationId,
    churchId: request.churchId || null,
    branchId: request.branchId || null,
    instanceId: instance.id,
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
