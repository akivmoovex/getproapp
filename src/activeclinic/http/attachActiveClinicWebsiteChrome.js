"use strict";

const { CSRF_FIELD } = require("../../platform/http/v5Csrf");
const {
  PERMISSIONS,
  hasWebsitePermission,
  canViewWebsiteAdmin,
} = require("../../platform/website/permissions");
const {
  assertWebsiteAction,
} = require("../../platform/website-engine/permissionHooks");
const { resolveActiveClinicWebsite, MODE } = require("../website/activeClinicWebsiteResolver");
const instanceRepo = require("../../platform/website/instanceRepository");
const versionService = require("../../platform/website/versionService");
const {
  PRODUCT_CODE,
  buildPublicOrganizationWebsitePath,
  buildPublicWebsiteEditPath,
  buildPublicWebsitePreviewPath,
  buildPublicWebsiteHistoryPath,
  buildPublicWebsitePublishPath,
  appendQuery,
} = require("../../platform/website/publicWebsiteUrl");
const {
  buildClinicWebsiteNav,
  clinicWebsiteLinkQuery,
} = require("../website/activeClinicClinicWebsiteNav");
const submissionService = require("../../platform/website/submissionService");
const { latestTenantVisibleNote } = require("../../platform/website/moderationEventService");
const { LIFECYCLE_LABELS } = require("../../platform/website/lifecycleStatus");
const { POLICY_LABELS } = require("../../platform/website/publishPolicy");
const { listProductPageTypes } = require("../../platform/website-engine/productSchemaRegistry");

function grantedPermissions(req) {
  const auth = req.activeClinicAuth;
  return (auth && Array.isArray(auth.permissions) ? auth.permissions : []).map(String);
}

function sameClinicOrganization(req, clinic) {
  const auth = req.activeClinicAuth;
  if (!auth || !auth.authenticated || !clinic) return false;
  return Boolean(auth.organization && auth.organization.id === clinic.organizationId);
}

function canViewClinicWebsite(req, clinic) {
  if (!sameClinicOrganization(req, clinic)) return false;
  return canViewWebsiteAdmin(grantedPermissions(req));
}

/**
 * Lifecycle authorization goes through the shared engine hook; this adapter only
 * adds the ActiveClinic tenant-isolation rule.
 * @param {import('express').Request} req
 * @param {object} clinic
 * @param {string} action
 */
function allowsClinicWebsiteAction(req, clinic, action) {
  if (!sameClinicOrganization(req, clinic)) return false;
  return assertWebsiteAction(grantedPermissions(req), action).ok === true;
}

function canEditClinicWebsite(req, clinic) {
  return allowsClinicWebsiteAction(req, clinic, "edit");
}

function canSubmitClinicWebsite(req, clinic) {
  if (!sameClinicOrganization(req, clinic)) return false;
  return hasWebsitePermission(grantedPermissions(req), PERMISSIONS.SUBMIT);
}

function canPublishClinicWebsite(req, clinic) {
  return allowsClinicWebsiteAction(req, clinic, "publish");
}

function canRestoreClinicWebsite(req, clinic) {
  return allowsClinicWebsiteAction(req, clinic, "restore");
}

function canAccessClinicWebsiteAdmin(req, clinic) {
  return (
    canViewClinicWebsite(req, clinic) ||
    canEditClinicWebsite(req, clinic) ||
    canPublishClinicWebsite(req, clinic) ||
    canRestoreClinicWebsite(req, clinic)
  );
}

function clinicWebsiteActionUrls(clinicKey) {
  const base = {
    product: PRODUCT_CODE.ACTIVECLINIC,
    organizationKey: clinicKey,
  };
  return {
    websiteSaveUrl: buildPublicOrganizationWebsitePath({ ...base, suffix: "website/drafts" }),
    websiteMediaUrl: buildPublicOrganizationWebsitePath({ ...base, suffix: "website/media" }),
    websitePreviewUrl: buildPublicWebsitePreviewPath(base),
    websiteEditUrl: buildPublicWebsiteEditPath(base),
    websiteHistoryUrl: buildPublicWebsiteHistoryPath(base),
    websitePublishUrl: buildPublicWebsitePublishPath(base),
    websiteSubmitUrl: buildPublicOrganizationWebsitePath({ ...base, suffix: "website/submit" }),
    websiteFinishEditUrl: buildPublicOrganizationWebsitePath({
      ...base,
      suffix: "website/edit-session/finish",
    }),
  };
}

function websiteEditorPageKeyFromRequest(req, clinicKey) {
  const pathName = String((req && req.path) || "");
  const prefix = `/clinics/${clinicKey}`;
  let rest = pathName.startsWith(prefix) ? pathName.slice(prefix.length) : pathName;
  rest = rest.replace(/^\//, "").split("/")[0] || "";
  if (!rest) return "home";
  const pages = listProductPageTypes(PRODUCT_CODE.ACTIVECLINIC);
  const match = pages.find((page) => page.path === rest || page.key === rest);
  return match ? match.key : "home";
}

function websiteEditorPagesForClinic(clinicKey, currentKey) {
  const base = `/clinics/${encodeURIComponent(clinicKey)}`;
  return listProductPageTypes(PRODUCT_CODE.ACTIVECLINIC).map((page) => {
    const href = page.path ? `${base}/${page.path}` : base;
    const sep = href.indexOf("?") >= 0 ? "&" : "?";
    return {
      key: page.key,
      label: page.label || page.key,
      path: page.path,
      editHref: `${href}${sep}website_edit=1&website_mode=draft`,
      current: page.key === currentKey,
    };
  });
}

function requestedMode(req, canEdit) {
  const q = String((req.query && (req.query.website_mode || req.query.websiteMode)) || "").toLowerCase();
  const edit = String((req.query && (req.query.website_edit || req.query.websiteEdit)) || "") === "1";
  if (!canEdit) return MODE.LIVE;
  if (q === "live") return MODE.LIVE;
  if (q === "draft" || edit) return MODE.DRAFT;
  return MODE.LIVE;
}

function previewVersionIdFromRequest(req, options) {
  if (options && options.previewVersionId) return String(options.previewVersionId);
  const q = req && req.query ? req.query : {};
  return String(q.website_preview_version || q.websitePreviewVersion || "").trim();
}

function applyWebsiteLinkQuery(clinic, query) {
  if (!clinic || !clinic.publicPagePaths || !query || !Object.keys(query).length) return clinic;
  const next = {};
  for (const [key, href] of Object.entries(clinic.publicPagePaths)) {
    next[key] = appendQuery(href, query);
  }
  return {
    ...clinic,
    publicPagePaths: next,
    publicBasePath: appendQuery(clinic.publicBasePath || next.home, query),
  };
}

async function attachActiveClinicWebsiteLocals(db, req, clinic, options) {
  const opts = options && typeof options === "object" ? options : {};
  const canEdit = canEditClinicWebsite(req, clinic);
  const canSubmit = canSubmitClinicWebsite(req, clinic);
  const canPublish = canPublishClinicWebsite(req, clinic);
  const canRestore = canRestoreClinicWebsite(req, clinic);
  const canView = canViewClinicWebsite(req, clinic);
  const previewVersionId = previewVersionIdFromRequest(req, opts);
  let previewVersion = opts.previewVersion || null;
  let snapshot = opts.snapshot || null;
  if (previewVersionId && !snapshot && (canView || canEdit || canPublish)) {
    const instanceForPreview = await instanceRepo.findWebsiteInstanceByOrgProduct(db, {
      organizationId: clinic.organizationId,
      productCode: "activeclinic",
    });
    if (instanceForPreview) {
      const loaded = await versionService.getWebsiteVersion(db, {
        versionId: previewVersionId,
        organizationId: clinic.organizationId,
        instanceId: instanceForPreview.id,
      });
      if (loaded.ok) {
        previewVersion = loaded.version;
        snapshot = loaded.version.snapshot || {};
      }
    }
  }
  const isVersionPreview = Boolean(snapshot);
  const editRequested =
    !isVersionPreview &&
    String((req.query && (req.query.website_edit || req.query.websiteEdit)) || "") === "1";
  const mode = isVersionPreview ? MODE.LIVE : requestedMode(req, canEdit);
  const resolved = await resolveActiveClinicWebsite(db, {
    clinic,
    mode,
    snapshot: snapshot || undefined,
  });
  let outClinic = resolved.ok ? resolved.clinic : clinic;
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
  const websiteEdit = !isVersionPreview && canEdit && editRequested && !websiteEditLocked;
  const linkQuery = clinicWebsiteLinkQuery({
    websiteEdit,
    previewVersionId: isVersionPreview && previewVersion ? previewVersion.id : "",
  });
  outClinic = applyWebsiteLinkQuery(outClinic, linkQuery);
  const clinicWebsiteNav = buildClinicWebsiteNav(outClinic, {
    env: req && req.app && req.app.get && req.app.get("env") ? process.env : process.env,
    linkQuery,
  });
  const restoreUrl =
    isVersionPreview && previewVersion
      ? buildPublicOrganizationWebsitePath({
          product: PRODUCT_CODE.ACTIVECLINIC,
          organizationKey: outClinic.clinicKey,
          suffix: `website/versions/${previewVersion.id}/restore`,
        })
      : "";
  return {
    clinic: outClinic,
    instance,
    clinicWebsiteNav,
    websiteVersionPreview: isVersionPreview,
    websitePreviewVersion: previewVersion,
    websitePreviewRestoreUrl: restoreUrl,
    websiteEdit,
    websiteCanEdit: canEdit,
    websiteCanSubmit: canSubmit && !websitePublishLocked,
    websiteCanPublish: canPublish && !websitePublishLocked,
    websiteCanRestore: canRestore && !websitePublishLocked,
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
    websiteEditorPageKey: websiteEditorPageKeyFromRequest(req, outClinic && outClinic.clinicKey),
    websiteEditorPages: websiteEditorPagesForClinic(
      outClinic && outClinic.clinicKey,
      websiteEditorPageKeyFromRequest(req, outClinic && outClinic.clinicKey)
    ),
    ...clinicWebsiteActionUrls(outClinic && outClinic.clinicKey),
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
  canViewClinicWebsite,
  canEditClinicWebsite,
  canSubmitClinicWebsite,
  canPublishClinicWebsite,
  canRestoreClinicWebsite,
  canAccessClinicWebsiteAdmin,
  attachActiveClinicWebsiteLocals,
  requireClinicWebsiteInstance,
};
