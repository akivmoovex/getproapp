"use strict";

const PERMISSIONS = Object.freeze({
  VIEW: "website.view",
  EDIT: "website.edit",
  MEDIA_UPLOAD: "website.media.upload",
  SUBMIT: "website.submit",
  REVIEW: "website.review",
  PUBLISH: "website.publish",
  ROLLBACK: "website.rollback",
  MANAGE_TEMPLATE: "website.manage_template",
  MODERATE: "website.moderate",
  TAKE_OFFLINE: "website.take_offline",
  SUSPEND: "website.suspend",
  RESTORE: "website.restore",
  MANAGE_POLICY: "website.manage_policy",
  APPROVE: "website.approve",
});

const ALL = Object.freeze(Object.values(PERMISSIONS));

const EDITOR_PERMISSIONS = Object.freeze([
  PERMISSIONS.VIEW,
  PERMISSIONS.EDIT,
  PERMISSIONS.MEDIA_UPLOAD,
  PERMISSIONS.SUBMIT,
]);

const REVIEWER_PERMISSIONS = Object.freeze([
  PERMISSIONS.VIEW,
  PERMISSIONS.REVIEW,
  PERMISSIONS.PUBLISH,
]);

const MODERATOR_PERMISSIONS = Object.freeze([
  PERMISSIONS.VIEW,
  PERMISSIONS.REVIEW,
  PERMISSIONS.PUBLISH,
  PERMISSIONS.MODERATE,
]);

function hasWebsitePermission(grantedKeys, needed) {
  const set = new Set((grantedKeys || []).map((k) => String(k)));
  const need = Array.isArray(needed) ? needed : [needed];
  return need.every((key) => set.has(key));
}

function canViewWebsiteAdmin(grantedKeys) {
  return (
    hasWebsitePermission(grantedKeys, PERMISSIONS.VIEW) ||
    hasWebsitePermission(grantedKeys, PERMISSIONS.EDIT) ||
    hasWebsitePermission(grantedKeys, PERMISSIONS.PUBLISH)
  );
}

function canRestoreWebsite(grantedKeys) {
  return (
    hasWebsitePermission(grantedKeys, PERMISSIONS.ROLLBACK) ||
    hasWebsitePermission(grantedKeys, PERMISSIONS.RESTORE)
  );
}

module.exports = {
  PERMISSIONS,
  ALL,
  EDITOR_PERMISSIONS,
  REVIEWER_PERMISSIONS,
  MODERATOR_PERMISSIONS,
  PLATFORM_ADMIN_PERMISSIONS: ALL,
  hasWebsitePermission,
  canViewWebsiteAdmin,
  canRestoreWebsite,
};
