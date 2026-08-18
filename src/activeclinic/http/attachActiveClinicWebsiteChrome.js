"use strict";

const { CSRF_FIELD } = require("../../platform/http/v5Csrf");
const { PERMISSIONS, hasWebsitePermission } = require("../../platform/website/permissions");
const { resolveActiveClinicWebsite, MODE } = require("../website/activeClinicWebsiteResolver");
const instanceRepo = require("../../platform/website/instanceRepository");
const submissionService = require("../../platform/website/submissionService");
const { latestTenantVisibleNote } = require("../../platform/website/moderationEventService");
const { LIFECYCLE_LABELS } = require("../../platform/website/lifecycleStatus");
const { POLICY_LABELS } = require("../../platform/website/publishPolicy");

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
  let websiteWorkflowStatus = unpublishedCount > 0 ? "draft" : "live";
  let websiteReviewNote = "";
  let websiteSubmittedAtLabel = "";
  if (instance) {
    const listed = await submissionService.listWebsiteSubmissions(db, {
      organizationId: clinic.organizationId,
      instanceId: instance.id,
      limit: 1,
    });
    const latest = listed.submissions && listed.submissions[0];
    if (latest) {
      if (latest.status === "submitted") websiteWorkflowStatus = "submitted";
      else if (latest.status === "changes_requested") websiteWorkflowStatus = "changes_requested";
      else if (latest.status === "approved" && unpublishedCount === 0) websiteWorkflowStatus = "published";
      else if (unpublishedCount > 0) websiteWorkflowStatus = "draft";
      if (latest.status === "changes_requested" && latest.reviewNote) {
        websiteReviewNote = String(latest.reviewNote);
      }
      if (
        latest.submittedAt &&
        (latest.status === "submitted" || latest.status === "changes_requested")
      ) {
        const when = new Date(latest.submittedAt);
        if (!Number.isNaN(when.getTime())) {
          websiteSubmittedAtLabel = `${when.toISOString().slice(0, 16).replace("T", " ")} UTC`;
        }
      }
    }
  }
  let websiteLifecycleStatus = instance && instance.lifecycleStatus ? instance.lifecycleStatus : "";
  let websitePublishPolicy = instance && instance.publishPolicy ? instance.publishPolicy : "";
  let websiteEditLocked = Boolean(instance && instance.editLocked);
  let websitePublishLocked = Boolean(instance && instance.publishLocked);
  let websiteModerationNote = "";
  if (instance) {
    const note = await latestTenantVisibleNote(db, instance.id, clinic.organizationId);
    if (note && note.notes) websiteModerationNote = String(note.notes);
  }
  if (!websiteReviewNote && websiteModerationNote) websiteReviewNote = websiteModerationNote;
  return {
    clinic: outClinic,
    instance,
    websiteEdit: canEdit && editRequested && !websiteEditLocked,
    websiteCanEdit: canEdit,
    websiteCanSubmit: canSubmit && !websitePublishLocked,
    websiteMode: mode,
    websiteUnpublishedCount: unpublishedCount,
    websiteWorkflowStatus,
    websiteReviewNote,
    websiteSubmittedAtLabel,
    websiteLifecycleStatus,
    websiteLifecycleLabel: LIFECYCLE_LABELS[websiteLifecycleStatus] || "",
    websitePublishPolicy,
    websitePublishPolicyLabel: POLICY_LABELS[websitePublishPolicy] || "",
    websiteEditLocked,
    websitePublishLocked,
    websiteModerationNote,
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
