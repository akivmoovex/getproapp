"use strict";

/**
 * Shared website-engine permission keys. Product roles map onto these hooks;
 * route handlers must not duplicate publish authorization.
 */

const { PERMISSIONS, hasWebsitePermission } = require("../website/permissions");

const PRODUCT_ROLE_GRANTS = Object.freeze({
  activeclinic: Object.freeze({
    activeclinic_website_editor: Object.freeze([
      PERMISSIONS.VIEW,
      PERMISSIONS.EDIT,
      PERMISSIONS.MEDIA_UPLOAD,
      PERMISSIONS.SUBMIT,
    ]),
    activeclinic_organization_admin: Object.freeze([
      PERMISSIONS.VIEW,
      PERMISSIONS.EDIT,
      PERMISSIONS.MEDIA_UPLOAD,
      PERMISSIONS.SUBMIT,
      PERMISSIONS.PUBLISH,
      PERMISSIONS.ROLLBACK,
      PERMISSIONS.RESTORE,
    ]),
  }),
  blessboard: Object.freeze({
    website_editor: Object.freeze([
      PERMISSIONS.VIEW,
      PERMISSIONS.EDIT,
      PERMISSIONS.MEDIA_UPLOAD,
      PERMISSIONS.SUBMIT,
    ]),
    website_publisher: Object.freeze([
      PERMISSIONS.VIEW,
      PERMISSIONS.PUBLISH,
      PERMISSIONS.REVIEW,
      PERMISSIONS.ROLLBACK,
    ]),
    church_hq_admin: Object.freeze([
      PERMISSIONS.VIEW,
      PERMISSIONS.EDIT,
      PERMISSIONS.MEDIA_UPLOAD,
      PERMISSIONS.SUBMIT,
      PERMISSIONS.PUBLISH,
      PERMISSIONS.REVIEW,
      PERMISSIONS.ROLLBACK,
      PERMISSIONS.RESTORE,
    ]),
    branch_admin: Object.freeze([
      PERMISSIONS.VIEW,
      PERMISSIONS.EDIT,
      PERMISSIONS.MEDIA_UPLOAD,
      PERMISSIONS.SUBMIT,
    ]),
  }),
});

function grantsForProductRole(productCode, roleKey) {
  const product = PRODUCT_ROLE_GRANTS[String(productCode || "").trim()] || {};
  return product[String(roleKey || "").trim()] || [];
}

function canPublishWebsite(grantedKeys) {
  return hasWebsitePermission(grantedKeys, PERMISSIONS.PUBLISH);
}

function canUnpublishWebsite(grantedKeys) {
  return (
    hasWebsitePermission(grantedKeys, PERMISSIONS.PUBLISH) ||
    hasWebsitePermission(grantedKeys, PERMISSIONS.TAKE_OFFLINE)
  );
}

function canEditWebsite(grantedKeys) {
  return hasWebsitePermission(grantedKeys, PERMISSIONS.EDIT);
}

function canRestoreWebsiteVersion(grantedKeys) {
  return (
    hasWebsitePermission(grantedKeys, PERMISSIONS.ROLLBACK) ||
    hasWebsitePermission(grantedKeys, PERMISSIONS.RESTORE)
  );
}

function assertWebsiteAction(grantedKeys, action) {
  const need =
    action === "publish" || action === "unpublish"
      ? action === "unpublish"
        ? canUnpublishWebsite
        : canPublishWebsite
      : action === "restore"
        ? canRestoreWebsiteVersion
        : action === "edit"
          ? canEditWebsite
          : null;
  if (!need) return { ok: false, code: "unknown_action" };
  if (!need(grantedKeys)) return { ok: false, code: "forbidden" };
  return { ok: true };
}

module.exports = {
  PERMISSIONS,
  PRODUCT_ROLE_GRANTS,
  grantsForProductRole,
  canPublishWebsite,
  canUnpublishWebsite,
  canEditWebsite,
  canRestoreWebsiteVersion,
  assertWebsiteAction,
  hasWebsitePermission,
};
