"use strict";

/**
 * Shared tenant Website settings presentation.
 * Product screens render this model; they must not invent View Live for unpublished sites.
 */

const { PERMISSIONS, hasWebsitePermission } = require("./permissions");
const instanceRepo = require("./instanceRepository");
const contentService = require("./contentService");
const versionService = require("./versionService");
const { POLICY_LABELS } = require("./publishPolicy");
const { LIFECYCLE_LABELS, LIFECYCLE_STATUS } = require("./lifecycleStatus");
const {
  PRODUCT_CODE,
  buildPublicOrganizationWebsitePath,
  buildPublicOrganizationWebsiteUrl,
  buildPublicWebsiteEditPath,
  buildPublicWebsitePreviewPath,
  buildPublicWebsiteHistoryPath,
  buildPublicWebsiteMediaLibraryPath,
  buildPublicWebsiteStylesPath,
  buildPublicWebsiteSeoPath,
  buildPublicWebsitePublishPath,
  buildPublicWebsiteUnpublishPath,
  buildPublicWebsiteSettingsPath,
} = require("./publicWebsiteUrl");

const PRESENTATION_STATE = Object.freeze({
  SETUP_INCOMPLETE: "setup_incomplete",
  MISSING: "missing",
  SUSPENDED: "suspended",
  HIDDEN: "hidden",
  UNPUBLISHED: "unpublished",
  COMING_SOON: "coming_soon",
  PUBLISHED: "published",
  UNPUBLISHED_CHANGES: "unpublished_changes",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function grantedList(grantedPermissions) {
  return Array.isArray(grantedPermissions) ? grantedPermissions.map(String) : [];
}

function formatTs(value) {
  if (!value) return "";
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().replace("T", " ").slice(0, 16) + " UTC";
  } catch {
    return "";
  }
}

function websiteFailedStage(failedStage) {
  const stage = String(failedStage || "").toLowerCase();
  return stage === "website_instance" || stage === "template_content";
}

/**
 * Pure presentation model for tenant Website settings.
 * @param {object} input
 */
function presentWebsiteSettingsUx(input) {
  const facts = input || {};
  const exists = facts.exists === true || facts.hasLegacyWebsite === true;
  const lifecycle = String(facts.lifecycleStatus || "");
  const productStatus = String(facts.productWebsiteStatus || "").toLowerCase();
  const availabilityPublished = facts.availabilityPublished === true;
  const unpublishedChanges = facts.unpublishedChanges === true;
  const unpublishedCount = Number(facts.unpublishedCount) || 0;
  const publishedVersionNumber = facts.publishedVersionNumber || null;
  const canView = facts.canView !== false;
  const canEdit = facts.canEdit === true;
  const canPublish = facts.canPublish === true;
  const canRestore = facts.canRestore === true;
  const publicPath = facts.publicPath || null;
  const publicUrl = facts.publicUrl || publicPath;
  const previewPath = facts.previewPath || null;
  const editPath = facts.editPath || null;
  const historyPath = facts.historyPath || null;
  const seoPath = facts.seoPath || null;
  const stylesPath = facts.stylesPath || null;
  const mediaPath = facts.mediaPath || facts.libraryPath || null;
  const publishPath = facts.publishPath || null;
  const retryPath = facts.retryPath || null;

  const blocked =
    lifecycle === LIFECYCLE_STATUS.SUSPENDED || productStatus === "suspended";
  const hidden =
    lifecycle === LIFECYCLE_STATUS.OFFLINE ||
    productStatus === "offline" ||
    productStatus === "hidden";
  const provisioningFailed =
    facts.provisioningFailed === true || websiteFailedStage(facts.failedStage);
  const setupIncomplete =
    facts.setupIncomplete === true || (!exists && provisioningFailed);
  const missing = !exists && !setupIncomplete;

  const publiclyLive =
    !blocked &&
    !hidden &&
    !setupIncomplete &&
    (availabilityPublished === true ||
      productStatus === "published" ||
      lifecycle === LIFECYCLE_STATUS.PUBLIC);
  const liveAvailable = publiclyLive === true;

  let state = PRESENTATION_STATE.UNPUBLISHED;
  if (setupIncomplete) state = PRESENTATION_STATE.SETUP_INCOMPLETE;
  else if (blocked) state = PRESENTATION_STATE.SUSPENDED;
  else if (hidden) state = PRESENTATION_STATE.HIDDEN;
  else if (missing) state = PRESENTATION_STATE.MISSING;
  else if (!liveAvailable) {
    state =
      facts.comingSoonPublic === true
        ? PRESENTATION_STATE.COMING_SOON
        : PRESENTATION_STATE.UNPUBLISHED;
  } else if (unpublishedChanges) state = PRESENTATION_STATE.UNPUBLISHED_CHANGES;
  else state = PRESENTATION_STATE.PUBLISHED;

  const versionText = publishedVersionNumber ? `Version ${publishedVersionNumber}` : "None yet";
  let statusLabel = "Website not published yet";
  let statusHint =
    "Public visitors cannot see this website yet. Preview the draft, then publish when ready.";
  if (state === PRESENTATION_STATE.SETUP_INCOMPLETE || state === PRESENTATION_STATE.MISSING) {
    statusLabel = "Website setup incomplete";
    statusHint = retryPath
      ? "Required website records are missing. Retry setup, or contact Platform Admin if this continues."
      : "Website setup did not finish. Contact Platform Admin to complete provisioning.";
  } else if (state === PRESENTATION_STATE.SUSPENDED) {
    statusLabel = "Website blocked";
    statusHint =
      "This website is blocked. Public access and publishing are disabled until Platform Admin unblocks it.";
  } else if (state === PRESENTATION_STATE.HIDDEN) {
    statusLabel = "Website hidden";
    statusHint =
      "This website is temporarily hidden from the public. Content and drafts are retained. Contact Platform Admin to unhide it.";
  } else if (state === PRESENTATION_STATE.COMING_SOON) {
    statusLabel = "Website not published yet";
    statusHint =
      "Public visitors currently see a coming-soon page. Preview the draft, then publish when ready.";
  } else if (state === PRESENTATION_STATE.UNPUBLISHED_CHANGES) {
    statusLabel = publishedVersionNumber
      ? `Published (version ${publishedVersionNumber}) · unpublished changes`
      : "Published · unpublished changes";
    statusHint = `${unpublishedCount > 0 ? unpublishedCount : "Some"} unpublished change${
      unpublishedCount === 1 ? "" : "s"
    } will not be public until you publish.`;
  } else if (state === PRESENTATION_STATE.PUBLISHED) {
    statusLabel = publishedVersionNumber
      ? `Published (version ${publishedVersionNumber})`
      : "Published";
    statusHint = "This website is live for public visitors.";
  }

  const showViewLive = liveAvailable && canView && Boolean(publicPath);
  const showPreview =
    (canView || canEdit) &&
    Boolean(previewPath) &&
    state !== PRESENTATION_STATE.SETUP_INCOMPLETE &&
    state !== PRESENTATION_STATE.MISSING;
  const showEdit =
    canEdit &&
    Boolean(editPath) &&
    state !== PRESENTATION_STATE.SUSPENDED &&
    state !== PRESENTATION_STATE.SETUP_INCOMPLETE &&
    state !== PRESENTATION_STATE.MISSING;
  const showPublish =
    canPublish &&
    Boolean(publishPath) &&
    state !== PRESENTATION_STATE.SUSPENDED &&
    state !== PRESENTATION_STATE.SETUP_INCOMPLETE &&
    state !== PRESENTATION_STATE.MISSING;
  const showHistory = canView && Boolean(historyPath) && exists;
  const showSeo = canEdit && Boolean(seoPath) && exists;
  const showStyles = canEdit && Boolean(stylesPath) && exists;
  const showMedia = canView && Boolean(mediaPath) && exists;
  const showUnpublish =
    canPublish &&
    Boolean(facts.unpublishPath) &&
    liveAvailable &&
    state !== PRESENTATION_STATE.SUSPENDED;
  const showSettings =
    canEdit &&
    Boolean(facts.settingsPath) &&
    state !== PRESENTATION_STATE.SUSPENDED &&
    state !== PRESENTATION_STATE.SETUP_INCOMPLETE &&
    state !== PRESENTATION_STATE.MISSING;
  const showBranding =
    canEdit &&
    Boolean(facts.brandingPath) &&
    state !== PRESENTATION_STATE.SUSPENDED &&
    state !== PRESENTATION_STATE.SETUP_INCOMPLETE &&
    state !== PRESENTATION_STATE.MISSING;
  const showLibrary =
    canView &&
    Boolean(facts.libraryPath) &&
    exists &&
    state !== PRESENTATION_STATE.SETUP_INCOMPLETE &&
    state !== PRESENTATION_STATE.MISSING;
  const showRetry = Boolean(retryPath) && (setupIncomplete || missing);
  const showContactPlatformAdmin =
    (setupIncomplete || missing || blocked || hidden) && !showRetry;

  return {
    state,
    statusLabel,
    statusHint,
    liveAvailable,
    comingSoon: state === PRESENTATION_STATE.COMING_SOON,
    setupIncomplete: state === PRESENTATION_STATE.SETUP_INCOMPLETE || state === PRESENTATION_STATE.MISSING,
    exists,
    publicPath,
    publicUrl,
    publicUrlLive: showViewLive,
    publishedVersionNumber,
    publishedVersionLabel: versionText,
    unpublishedChanges,
    unpublishedCount,
    lastEditor: facts.lastEditor || "—",
    lastPublishedAt: facts.lastPublishedAt || null,
    lastPublishedLabel: formatTs(facts.lastPublishedAt) || (liveAvailable ? "—" : "Not published yet"),
    lastEditedAt: facts.lastEditedAt || null,
    lastEditedLabel: formatTs(facts.lastEditedAt) || "",
    canView,
    canEdit,
    canPublish,
    canRestore,
    actions: {
      viewLive: showViewLive ? publicPath : null,
      preview: showPreview ? previewPath : null,
      editWebsite: showEdit ? editPath : null,
      publishPath: showPublish ? publishPath : null,
      unpublishPath: showUnpublish ? facts.unpublishPath : null,
      settings: showSettings ? facts.settingsPath : null,
      branding: showBranding ? facts.brandingPath : null,
      library: showLibrary ? facts.libraryPath : null,
      media: showMedia ? mediaPath : null,
      seo: showSeo ? seoPath : null,
      styles: showStyles ? stylesPath : null,
      history: showHistory ? historyPath : null,
      retry: showRetry ? retryPath : null,
      contactPlatformAdmin: showContactPlatformAdmin,
    },
  };
}

function websiteStateLabel(input) {
  return presentWebsiteSettingsUx({
    exists: input.exists,
    unpublishedChanges: input.unpublishedChanges,
    publishedVersionNumber: input.publishedVersionNumber,
    availabilityPublished: input.availabilityPublished,
    canView: true,
  }).statusLabel;
}

/**
 * Map BlessBoard HQ overview / legacy locals onto the shared Website settings UX.
 */
function presentBlessBoardHqWebsiteSettingsUx(input) {
  const facts = input || {};
  const overview = facts.overview || {};
  const readiness = facts.readiness || overview.readiness || {};
  const flags = facts.flags || {};
  const websiteStatus = String(
    (readiness && readiness.websiteStatus) || facts.productWebsiteStatus || "draft"
  ).toLowerCase();
  const needsRepair = facts.needsFoundationRepair === true;
  const publicPath = overview.publicPath || facts.publicPath || null;
  const unpublishedChanges =
    overview.hasUnpublishedChanges === true ||
    Boolean(overview.draftPanel && overview.draftPanel.hasDraft);
  const lastEditor =
    overview.lastEditor ||
    overview.lastPublishedByName ||
    (overview.draftPanel && overview.draftPanel.lastEditedBy) ||
    "—";
  const lastPublishedAt =
    overview.lastPublishedAt ||
    (overview.recentWebsiteChanges &&
      overview.recentWebsiteChanges[0] &&
      overview.recentWebsiteChanges[0].publishedAt) ||
    null;
  const publishedVersionNumber =
    overview.publishedVersionNumber ||
    (overview.currentPub && overview.currentPub.versionNumber) ||
    null;
  const canView = facts.canView !== false && flags.canViewWebsite !== false;
  const canEdit = facts.canEdit === true || flags.canEditWebsite === true || overview.canEdit === true;
  const canPublish = facts.canPublish === true || flags.canPublishWebsite === true;
  const canRestore = facts.canRestore === true || flags.canRestoreWebsite === true;
  const hasSite = Boolean(overview.ok || publicPath || facts.hasLegacyWebsite) && !needsRepair;

  return presentWebsiteSettingsUx({
    exists: hasSite,
    hasLegacyWebsite: hasSite,
    productWebsiteStatus: websiteStatus,
    availabilityPublished: websiteStatus === "published",
    unpublishedChanges,
    unpublishedCount: Number(overview.unpublishedCount) || (unpublishedChanges ? 1 : 0),
    publishedVersionNumber,
    lastEditor,
    lastPublishedAt,
    lastEditedAt: overview.draftPanel && overview.draftPanel.lastEditedAt,
    publicPath,
    publicUrl: overview.publicUrl || publicPath,
    previewPath: overview.previewPath || facts.previewPath || "/hq/content/preview/home",
    editPath: overview.inlineEditPath || overview.editPath || facts.editPath || "/hq/content",
    historyPath: facts.historyPath || "/hq/website/version-history",
    publishPath:
      overview.publishReviewPath || facts.publishPath || "/hq/website/publish/review",
    unpublishPath: facts.unpublishPath || "/hq/website/unpublish",
    settingsPath: facts.settingsPath || "/hq/website/advanced",
    brandingPath: facts.brandingPath || "/hq/website/branding",
    libraryPath: facts.libraryPath || "/hq/content/media",
    retryPath: needsRepair ? "#website-setup-retry" : facts.retryPath || null,
    canView,
    canEdit,
    canPublish,
    canRestore,
    setupIncomplete: needsRepair,
    comingSoonPublic: websiteStatus !== "published" && websiteStatus !== "suspended" && hasSite,
  });
}

async function resolveIdentityLabel(db, identityId) {
  const id = String(identityId || "");
  if (!UUID_RE.test(id)) return null;
  try {
    const rows = await db.query(
      `SELECT primary_email, email_normalized
         FROM platform.identities WHERE id = $1 LIMIT 1`,
      [id]
    );
    const row = rows.rows[0];
    if (!row) return null;
    return String(row.primary_email || row.email_normalized || "").trim() || null;
  } catch {
    return null;
  }
}

async function loadLastEditor(db, instance, organizationId) {
  if (!instance) return { id: null, at: null };
  try {
    const row = await db.query(
      `SELECT updated_by_identity_id, updated_at
         FROM platform.website_content
        WHERE instance_id = $1 AND organization_id = $2 AND updated_by_identity_id IS NOT NULL
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 1`,
      [instance.id, organizationId]
    );
    if (!row.rows[0]) return { id: null, at: null };
    return {
      id: row.rows[0].updated_by_identity_id,
      at: row.rows[0].updated_at,
    };
  } catch {
    return { id: null, at: null };
  }
}

async function loadWebsiteManagementSummary(db, input) {
  const productCode = String((input && (input.productCode || input.product)) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const organizationKey = String((input && input.organizationKey) || "").trim();
  const granted = grantedList(input && input.grantedPermissions);
  const canView =
    hasWebsitePermission(granted, PERMISSIONS.VIEW) ||
    hasWebsitePermission(granted, PERMISSIONS.EDIT);
  const canEdit = hasWebsitePermission(granted, PERMISSIONS.EDIT);
  const canPublish = hasWebsitePermission(granted, PERMISSIONS.PUBLISH);
  const canRestore =
    hasWebsitePermission(granted, PERMISSIONS.ROLLBACK) ||
    hasWebsitePermission(granted, PERMISSIONS.RESTORE);

  if (!canView) {
    return { ok: false, code: "forbidden", summary: null };
  }
  if (!organizationId || !productCode) {
    return { ok: false, code: "invalid_input", summary: null };
  }

  const instance = await instanceRepo.findWebsiteInstanceByOrgProduct(db, {
    organizationId,
    productCode,
  });
  const key = organizationKey || (instance && instance.slug) || "";
  const publicPath = buildPublicOrganizationWebsitePath({
    product: productCode,
    organizationKey: key,
  });
  const publicUrl = buildPublicOrganizationWebsiteUrl({
    product: productCode,
    organizationKey: key,
    origin: input.origin || "",
    env: input.env,
  });

  let unpublishedChanges = false;
  let unpublishedCount = 0;
  let publishedVersionNumber = null;
  let lastPublishedAt = null;
  let lastPublisherId = null;
  let availabilityPublished = false;
  let productWebsiteStatus = null;

  if (instance) {
    const rows = await contentService.listWebsiteContent(db, instance, organizationId);
    const changed = rows.filter(
      (row) => !contentService.valuesEqual(row.draftValue, row.publishedValue)
    );
    unpublishedCount = changed.length;
    unpublishedChanges = unpublishedCount > 0;
    const listed = await versionService.listWebsiteVersions(db, {
      instanceId: instance.id,
      organizationId,
    });
    const live = (listed.versions || []).find((version) => version.status === "published");
    publishedVersionNumber = live ? live.versionNumber : null;
    lastPublishedAt = live ? live.publishedAt : instance.lastPublishedAt || instance.publishedAt;
    lastPublisherId = live ? live.editorIdentityId : instance.lastEditorIdentityId;
  }

  if (productCode === PRODUCT_CODE.ACTIVECLINIC) {
    try {
      const hco = await db.query(
        `SELECT website_published FROM activeclinic.healthcare_organizations
          WHERE organization_id = $1 LIMIT 1`,
        [organizationId]
      );
      availabilityPublished = Boolean(hco.rows[0] && hco.rows[0].website_published === true);
    } catch (err) {
      const message = err && err.message ? String(err.message) : "";
      if (!/website_published/i.test(message) && err && err.code !== "42703") throw err;
    }
  }

  if (productCode === PRODUCT_CODE.BLESSBOARD) {
    try {
      const church = await db.query(
        `SELECT cs.website_status
           FROM blessboard.churches c
           LEFT JOIN blessboard.church_settings cs ON cs.church_id = c.id
          WHERE c.organization_id = $1
          LIMIT 1`,
        [organizationId]
      );
      productWebsiteStatus = church.rows[0] ? String(church.rows[0].website_status || "draft") : "draft";
      availabilityPublished = productWebsiteStatus === "published";
    } catch {
      productWebsiteStatus = null;
    }
  }

  const exists = Boolean(instance);
  const editor = await loadLastEditor(db, instance, organizationId);
  const lastEditorId = editor.id || lastPublisherId || (instance && instance.lastEditorIdentityId) || null;
  const lastEditor = (await resolveIdentityLabel(db, lastEditorId)) || (lastEditorId ? "Editor" : "—");

  const ux = presentWebsiteSettingsUx({
    exists,
    hasLegacyWebsite: exists,
    lifecycleStatus: instance ? instance.lifecycleStatus : null,
    productWebsiteStatus,
    availabilityPublished,
    unpublishedChanges,
    unpublishedCount,
    publishedVersionNumber,
    lastEditor,
    lastPublishedAt,
    lastEditedAt: editor.at,
    publicPath,
    publicUrl,
    previewPath: buildPublicWebsitePreviewPath({ product: productCode, organizationKey: key }),
    editPath: buildPublicWebsiteEditPath({ product: productCode, organizationKey: key }),
    historyPath: buildPublicWebsiteHistoryPath({ product: productCode, organizationKey: key }),
    seoPath: buildPublicWebsiteSeoPath({ product: productCode, organizationKey: key }),
    stylesPath: buildPublicWebsiteStylesPath({ product: productCode, organizationKey: key }),
    mediaPath: buildPublicWebsiteMediaLibraryPath({ product: productCode, organizationKey: key }),
    publishPath: buildPublicWebsitePublishPath({ product: productCode, organizationKey: key }),
    unpublishPath: buildPublicWebsiteUnpublishPath({ product: productCode, organizationKey: key }),
    settingsPath: buildPublicWebsiteSettingsPath({ product: productCode, organizationKey: key }),
    brandingPath:
      productCode === PRODUCT_CODE.ACTIVECLINIC
        ? "/app/settings/website/branding"
        : "/hq/website/branding",
    libraryPath:
      productCode === PRODUCT_CODE.ACTIVECLINIC
        ? "/app/settings/website/library"
        : "/hq/content/media",
    canView,
    canEdit,
    canPublish,
    canRestore,
    setupIncomplete: Boolean(input.setupIncomplete) && !exists,
    provisioningFailed: Boolean(input.provisioningFailed) && !exists,
    failedStage: input.failedStage || null,
    comingSoonPublic: productCode === PRODUCT_CODE.BLESSBOARD && !availabilityPublished && exists,
  });

  return {
    ok: true,
    code: "ok",
    summary: {
      productCode,
      organizationId,
      organizationKey: key,
      exists,
      instanceId: instance ? instance.id : null,
      slug: instance ? instance.slug : key,
      lifecycleStatus: instance ? instance.lifecycleStatus : null,
      lifecycleLabel: instance ? LIFECYCLE_LABELS[instance.lifecycleStatus] || "" : "",
      publishPolicy: instance ? instance.publishPolicy : null,
      publishPolicyLabel: instance ? POLICY_LABELS[instance.publishPolicy] || "" : "",
      statusKey: ux.state,
      statusLabel: ux.statusLabel,
      statusHint: ux.statusHint,
      draftState: unpublishedChanges ? "unpublished_changes" : exists ? "current" : "missing",
      unpublishedChanges,
      unpublishedCount,
      publishedVersionNumber,
      availabilityPublished,
      publicPath,
      publicUrl,
      lastEditor: ux.lastEditor,
      lastPublishedAt: ux.lastPublishedAt,
      lastPublishedLabel: ux.lastPublishedLabel,
      liveAvailable: ux.liveAvailable,
      canView,
      canEdit,
      canPublish,
      canRestore,
      actions: ux.actions,
      ux,
    },
  };
}

module.exports = {
  PRESENTATION_STATE,
  presentWebsiteSettingsUx,
  presentBlessBoardHqWebsiteSettingsUx,
  websiteStateLabel,
  loadWebsiteManagementSummary,
  formatTs,
};
