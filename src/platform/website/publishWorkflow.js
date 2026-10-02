"use strict";

/**
 * V2.05 Task 6 — Unified Publish Workflow (PublishWorkflow).
 *
 * Thin shared facade over the existing publicationOrchestrator / product
 * governance adapters. Does NOT create a second publishing engine.
 *
 * Canonical flow (both Admin Console Website and inline draft editor):
 *   Save Draft → Preview → Change Manager → Publish Readiness
 *   → Confirm Publish → Publish → Live Site
 *
 * Preserved: Unpublish, Version History, Historical Preview, Restore as New.
 * Publish authorization remains separate from edit authorization.
 * Branch/location scope + tenant isolation stay enforced by product routes.
 */

const publicationOrchestrator = require("./publicationOrchestrator");
const {
  PRODUCT_CODE,
  buildPublicWebsitePublishPath,
  buildPublicWebsiteUnpublishPath,
  buildPublicWebsitePreviewPath,
  buildPublicWebsiteHistoryPath,
  buildPublicWebsiteEditPath,
  buildPublicWebsiteSettingsPath,
  buildPublicOrganizationWebsitePath,
  buildPublicWebsiteUnpublishedChangesPath,
  buildPublicWebsiteInstancePath,
} = require("./publicWebsiteUrl");

const PUBLISH_WORKFLOW = Object.freeze({
  pattern: "PublishWorkflow",
  engine: "publicationOrchestrator",
  separatePublishEngine: false,
  entries: Object.freeze(["admin_console", "website_editor"]),
  publishPermissionSeparateFromEdit: true,
});

const ENTRY = Object.freeze({
  ADMIN_CONSOLE: "admin_console",
  WEBSITE_EDITOR: "website_editor",
});

/** Canonical lifecycle steps for both AC and BB (product readiness rules stay product-specific). */
const CANONICAL_FLOW = Object.freeze([
  "edit",
  "save_draft",
  "preview",
  "change_manager",
  "publish_readiness",
  "confirm_publish",
  "publish",
  "live_site",
]);

const PRESERVED_CAPABILITIES = Object.freeze([
  "unpublish",
  "version_history",
  "historical_preview",
  "restore_as_new",
]);

/**
 * Re-export orchestrator mutations — single publish engine for AC + BB.
 */
const publish = publicationOrchestrator.publish;
const unpublish = publicationOrchestrator.unpublish;
const restore = publicationOrchestrator.restore;
const PERMISSIONS = publicationOrchestrator.PERMISSIONS;

function normalizeProduct(productCode) {
  return String(productCode || "")
    .trim()
    .toLowerCase();
}

function branchKeyOf(input) {
  const scope = (input && input.scope) || {};
  return String(
    (input && input.branchKey) || scope.branchKey || (input && input.branch && input.branch.key) || ""
  ).trim();
}

/**
 * Product-specific readiness / confirm paths while sharing one mutation engine.
 * @param {object} input
 * @returns {object}
 */
function buildPublishWorkflowPaths(input) {
  const opts = input && typeof input === "object" ? input : {};
  const productCode = normalizeProduct(opts.productCode || opts.product);
  const organizationKey = String(opts.organizationKey || opts.clinicKey || "").trim();
  const branchKey = branchKeyOf(opts);
  const scope = branchKey ? { ...(opts.scope || {}), branchKey } : opts.scope || null;
  const entry = String(opts.entry || ENTRY.ADMIN_CONSOLE).trim() || ENTRY.ADMIN_CONSOLE;
  const canPublish = opts.canPublish === true;
  const canEdit = opts.canEdit === true;

  const base = {
    product: productCode,
    productCode,
    organizationKey,
    scope,
    pageKey: opts.pageKey || "home",
  };

  const settingsPath = buildPublicWebsiteSettingsPath({
    product: productCode,
    actor: opts.actor,
    scope,
  });
  const previewPath = opts.previewPath || buildPublicWebsitePreviewPath(base) || null;
  const editPath = opts.editPath || buildPublicWebsiteEditPath(base) || null;
  const historyPath = opts.historyPath || buildPublicWebsiteHistoryPath(base) || null;
  const changeManagerPath =
    opts.changeManagerPath ||
    buildPublicWebsiteUnpublishedChangesPath(base) ||
    (productCode === PRODUCT_CODE.BLESSBOARD ? "/hq/content/draft-changes" : null);
  const livePath =
    opts.livePath ||
    buildPublicOrganizationWebsitePath({
      product: productCode,
      organizationKey,
      scope,
    }) ||
    null;
  const unpublishPath = canPublish
    ? opts.unpublishPath || buildPublicWebsiteUnpublishPath(base) || null
    : null;

  let reviewPath = null;
  let confirmPath = null;
  let successPath = null;
  let readinessPath = null;

  if (productCode === PRODUCT_CODE.ACTIVECLINIC) {
    reviewPath = "/app/settings/website/publish";
    readinessPath = reviewPath;
    confirmPath =
      organizationKey
        ? buildPublicWebsitePublishPath({
            product: PRODUCT_CODE.ACTIVECLINIC,
            organizationKey,
          })
        : null;
    successPath = settingsPath;
  } else if (productCode === PRODUCT_CODE.BLESSBOARD) {
    reviewPath = branchKey
      ? `/hq/website/branches/${encodeURIComponent(branchKey)}/publish/review`
      : "/hq/website/publish/review";
    readinessPath = reviewPath;
    // Admin Console confirm POST (HQ).
    confirmPath = branchKey
      ? `/hq/website/branches/${encodeURIComponent(branchKey)}/publish`
      : "/hq/website/publish";
    successPath = "/hq/website/publish/success";
  }

  // Hub Publish module / Review CTA → readiness review (GET). Never use POST as <a href>.
  // Confirm forms → confirmPath (POST). Editor posts to product instance publish URL when available.
  // Publish authorization is separate from edit — omit mutation paths when canPublish is false.
  if (!canPublish) {
    reviewPath = null;
    readinessPath = null;
    confirmPath = null;
  }
  const publishCtaPath = canPublish ? reviewPath || confirmPath : null;
  let editorPublishPath = canPublish ? confirmPath : null;
  if (canPublish && productCode === PRODUCT_CODE.BLESSBOARD && organizationKey) {
    // Inline editor mutation stays on the public website instance route (same orchestrator).
    const instancePublish = buildPublicWebsiteInstancePath(base);
    editorPublishPath = instancePublish ? `${instancePublish}/website/publish` : confirmPath;
  }
  if (canPublish && productCode === PRODUCT_CODE.ACTIVECLINIC) {
    editorPublishPath = confirmPath;
  }

  return {
    pattern: PUBLISH_WORKFLOW.pattern,
    engine: PUBLISH_WORKFLOW.engine,
    productCode,
    entry,
    organizationKey: organizationKey || null,
    branchKey: branchKey || null,
    canPublish,
    canEdit,
    previewDoesNotPublish: true,
    editPath,
    previewPath,
    changeManagerPath,
    readinessPath,
    reviewPath,
    confirmPath,
    publishPath: publishCtaPath,
    editorPublishPath,
    successPath,
    livePath,
    openLiveWebsitePath: livePath,
    unpublishPath,
    historyPath,
    historicalPreviewPath: historyPath,
    restoreAsNewPath: historyPath,
    settingsPath,
    canonicalFlow: CANONICAL_FLOW.slice(),
    preserved: PRESERVED_CAPABILITIES.slice(),
  };
}

/**
 * Detect post-publish success query flags used by AC (`website=published`) and
 * BB editor (`website_published=1`).
 * @param {object|null|undefined} query
 */
function detectPublishSuccessFromQuery(query) {
  const q = query && typeof query === "object" ? query : {};
  const website = String(q.website || "").trim().toLowerCase();
  const publishedFlag = String(q.website_published || q.websitePublished || "").trim();
  const notice = String(q.notice || "").trim().toLowerCase();
  const ok =
    website === "published" ||
    website === "published_content" ||
    publishedFlag === "1" ||
    publishedFlag === "true" ||
    notice === "published";
  return {
    publishSuccess: ok,
    partialLive: website === "published_content",
  };
}

/**
 * Locals / shell facts after a successful publish.
 * Clears unpublished change counter presentation and exposes Open Live Website.
 * @param {object} input
 */
function buildPostPublishState(input) {
  const opts = input && typeof input === "object" ? input : {};
  const paths =
    opts.paths && typeof opts.paths === "object"
      ? opts.paths
      : buildPublishWorkflowPaths(opts);
  const livePath = opts.livePath || paths.openLiveWebsitePath || paths.livePath || null;
  return {
    pattern: PUBLISH_WORKFLOW.pattern,
    publishSuccess: true,
    publishSuccessUrl: livePath,
    openLiveWebsiteLabel: "Open Live Website",
    openLiveWebsitePath: livePath,
    unpublishedChangeCount: 0,
    draftChangesCount: 0,
    continuousUnpublishedCount: 0,
    lastPublishedLabel: opts.lastPublishedLabel || "Just now",
    versionPreserved: true,
    recalculateUnpublishedCount: true,
  };
}

/**
 * Safe HTML returnTo allow-list for post-publish redirects (tenant-scoped paths only).
 * @param {string} raw
 * @param {object} [opts]
 */
function safePublishReturnTo(raw, opts) {
  const value = String(raw || "").trim();
  if (!value || value.startsWith("//") || /[\s<>]/.test(value)) return null;
  if (!value.startsWith("/")) return null;

  const product = normalizeProduct(opts && (opts.productCode || opts.product));
  const orgKey = String((opts && (opts.organizationKey || opts.clinicKey)) || "")
    .trim()
    .toLowerCase();

  const acAdmin = new Set([
    "/app/settings",
    "/app/settings/website",
    "/app/settings/website/publish",
  ]);
  if (acAdmin.has(value.split("?")[0])) return value.split("?")[0];

  const pathOnly = value.split("?")[0];
  if (product === PRODUCT_CODE.ACTIVECLINIC && orgKey) {
    const prefix = `/clinics/${orgKey}`;
    if (pathOnly === prefix || pathOnly.startsWith(`${prefix}/`)) return value;
  }
  if (product === PRODUCT_CODE.BLESSBOARD) {
    if (pathOnly === "/hq/website" || pathOnly.startsWith("/hq/website/")) return value;
    if (orgKey) {
      const prefix = `/c/${orgKey}`;
      if (pathOnly === prefix || pathOnly.startsWith(`${prefix}/`)) return value;
    }
  }
  return null;
}

/**
 * Build redirect target after successful publish (editor prefers success banner on edit URL).
 * @param {object} input
 */
function buildPublishSuccessRedirect(input) {
  const opts = input && typeof input === "object" ? input : {};
  const paths = buildPublishWorkflowPaths(opts);
  const returnTo = safePublishReturnTo(opts.returnTo, opts);
  const entry = String(opts.entry || "").trim();

  if (returnTo) {
    const sep = returnTo.includes("?") ? "&" : "?";
    if (normalizeProduct(opts.productCode) === PRODUCT_CODE.ACTIVECLINIC) {
      return `${returnTo}${sep}website=published`;
    }
    return `${returnTo}${sep}website_published=1`;
  }

  if (entry === ENTRY.WEBSITE_EDITOR && paths.editPath) {
    const sep = paths.editPath.includes("?") ? "&" : "?";
    if (normalizeProduct(opts.productCode) === PRODUCT_CODE.ACTIVECLINIC) {
      return `${paths.editPath}${sep}website_edit=1&website_mode=draft&website=published`;
    }
    return `${paths.editPath}${sep}website_edit=1&website_mode=draft&website_published=1`;
  }

  if (paths.successPath) return paths.successPath;
  if (paths.settingsPath) {
    const sep = paths.settingsPath.includes("?") ? "&" : "?";
    return `${paths.settingsPath}${sep}website=published`;
  }
  return "/";
}

/**
 * Attach workflow path facts onto a WebsiteManagementHub model.
 * Hub Publish tile → reviewPath (GET). Confirm forms use confirmPath (POST).
 * @param {object} hub
 * @param {object} [opts]
 */
function attachPublishWorkflowToHub(hub, opts) {
  const base = hub && typeof hub === "object" ? { ...hub } : {};
  const o = opts && typeof opts === "object" ? opts : {};
  const paths = buildPublishWorkflowPaths({
    productCode: base.productCode || o.productCode,
    organizationKey: o.organizationKey || o.clinicKey,
    clinicKey: o.clinicKey,
    branchKey: o.branchKey,
    scope: o.scope,
    canPublish: o.canPublish === true,
    canEdit: o.canEdit === true,
    actor: o.actor,
    previewPath: o.previewPath,
    editPath: o.editPath,
    historyPath: o.historyPath,
    changeManagerPath: o.changeManagerPath,
    livePath: o.livePath,
    entry: ENTRY.ADMIN_CONSOLE,
  });
  base.publishWorkflow = {
    pattern: PUBLISH_WORKFLOW.pattern,
    engine: PUBLISH_WORKFLOW.engine,
    separatePublishEngine: false,
    canonicalFlow: CANONICAL_FLOW.slice(),
    preserved: PRESERVED_CAPABILITIES.slice(),
    entry: ENTRY.ADMIN_CONSOLE,
    reviewPath: paths.reviewPath,
    confirmPath: paths.confirmPath,
    previewPath: paths.previewPath,
    changeManagerPath: paths.changeManagerPath,
    readinessPath: paths.readinessPath,
    unpublishPath: paths.unpublishPath,
    historyPath: paths.historyPath,
    livePath: paths.livePath,
    openLiveWebsitePath: paths.openLiveWebsitePath,
  };
  // Hub module "publish" stays on review (GET) — never POST URL as navigation href.
  // Without canPublish, strip Publish as a navigable module (direct URL still server-gated).
  if (Array.isArray(base.modules)) {
    base.modules = base.modules
      .map((mod) => {
        if (!mod || mod.key !== "publish") return mod;
        if (!paths.canPublish) {
          return { ...mod, href: null, visible: false };
        }
        return {
          ...mod,
          href: paths.reviewPath || mod.href,
          visible: true,
        };
      })
      .filter((mod) => !(mod && mod.key === "publish" && !mod.href));
  }
  return base;
}

module.exports = {
  PUBLISH_WORKFLOW,
  ENTRY,
  CANONICAL_FLOW,
  PRESERVED_CAPABILITIES,
  publish,
  unpublish,
  restore,
  PERMISSIONS,
  buildPublishWorkflowPaths,
  detectPublishSuccessFromQuery,
  buildPostPublishState,
  safePublishReturnTo,
  buildPublishSuccessRedirect,
  attachPublishWorkflowToHub,
};
