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

function hasWebsitePermission(grantedKeys, needed) {
  const set = new Set((grantedKeys || []).map((k) => String(k)));
  const need = Array.isArray(needed) ? needed : [needed];
  return need.every((key) => set.has(key));
}

module.exports = {
  PERMISSIONS,
  ALL,
  EDITOR_PERMISSIONS,
  REVIEWER_PERMISSIONS,
  PLATFORM_ADMIN_PERMISSIONS: ALL,
  hasWebsitePermission,
};
