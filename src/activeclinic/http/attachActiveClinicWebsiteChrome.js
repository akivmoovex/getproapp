"use strict";

const { CSRF_FIELD } = require("../../platform/http/v5Csrf");
const { PERMISSIONS, hasWebsitePermission } = require("../../platform/website/permissions");
const { resolveActiveClinicWebsite, MODE } = require("../website/activeClinicWebsiteResolver");
const instanceRepo = require("../../platform/website/instanceRepository");

function grantedPermissions(req) {
  const auth = req.activeClinicAuth;
  return (auth && Array.isArray(auth.permissions) ? auth.permissions : []).map(String);
}

function canEditClinicWebsite(req, clinic) {
  const auth = req.activeClinicAuth;
  if (!auth || !auth.authenticated || !clinic) return false;
  if (!auth.organization || auth.organization.id !== clinic.organizationId) return false;
  return hasWebsitePermission(grantedPermissions(req), PERMISSIONS.EDIT);
}

function canSubmitClinicWebsite(req, clinic) {
  const auth = req.activeClinicAuth;
  if (!auth || !auth.authenticated || !clinic) return false;
  if (!auth.organization || auth.organization.id !== clinic.organizationId) return false;
  return hasWebsitePermission(grantedPermissions(req), PERMISSIONS.SUBMIT);
}

function requestedMode(req, canEdit) {
  const q = String((req.query && (req.query.website_mode || req.query.websiteMode)) || "").toLowerCase();
  const edit = String((req.query && (req.query.website_edit || req.query.websiteEdit)) || "") === "1";
  if (!canEdit) return MODE.LIVE;
  if (q === "live") return MODE.LIVE;
  if (q === "draft" || edit) return MODE.DRAFT;
  return MODE.LIVE;
}

async function attachActiveClinicWebsiteLocals(db, req, clinic) {
  const canEdit = canEditClinicWebsite(req, clinic);
  const canSubmit = canSubmitClinicWebsite(req, clinic);
  const editRequested = String((req.query && (req.query.website_edit || req.query.websiteEdit)) || "") === "1";
  const mode = requestedMode(req, canEdit);
  const resolved = await resolveActiveClinicWebsite(db, { clinic, mode });
  const outClinic = resolved.ok ? resolved.clinic : clinic;
  const instance = resolved.instance || null;
  const unpublishedCount = (resolved.resolved && resolved.resolved.unpublishedCount) || 0;
  return {
    clinic: outClinic,
    instance,
    websiteEdit: canEdit && editRequested,
    websiteCanEdit: canEdit,
    websiteCanSubmit: canSubmit,
    websiteMode: mode,
    websiteUnpublishedCount: unpublishedCount,
    websiteEditQuery: "website_edit",
    websiteActorId:
      req.activeClinicAuth && req.activeClinicAuth.platformIdentity
        ? req.activeClinicAuth.platformIdentity.id
        : null,
    csrfField: CSRF_FIELD,
  };
}

async function requireClinicWebsiteInstance(db, clinic) {
  if (!clinic) return null;
  return instanceRepo.findWebsiteInstanceByOrgProduct(db, {
    organizationId: clinic.organizationId,
    productCode: "activeclinic",
  });
}

module.exports = {
  grantedPermissions,
  canEditClinicWebsite,
  canSubmitClinicWebsite,
  attachActiveClinicWebsiteLocals,
  requireClinicWebsiteInstance,
};
