"use strict";

/**
 * Shared WebsiteManagementHub (V2.05 Batch 3).
 * Canonical admin-console website module catalog + status strip.
 */

const { PRODUCT_CODE } = require("./publicWebsiteUrl");
const { presentationFamilyForThemeId, PRESENTATION_FAMILIES } = require("./themeSelector");
const { attachPublishNudgeToHub } = require("./publishNudge");
const {
  attachPublishWorkflowToHub,
  buildPublishWorkflowPaths,
  ENTRY,
} = require("./publishWorkflow");

const WEBSITE_MANAGEMENT_HUB = Object.freeze({
  pattern: "WebsiteManagementHub",
  adminRoutes: Object.freeze({
    activeclinic: "/app/settings/website",
    blessboard: "/hq/website",
  }),
  stitchScreens: Object.freeze({
    activeclinic: "AC-WEB-ADM-01",
    blessboard: "BB-WEB-ADM-01",
  }),
  themeStitchScreens: Object.freeze({
    activeclinic: "AC-WEB-THM-01",
    blessboard: "BB-WEB-THM-01",
  }),
  previewWidths: Object.freeze({ desktop: 1440, tablet: 768, mobile: 390 }),
  requiredModules: Object.freeze([
    "edit",
    "pages",
    "sections",
    "themes",
    "branding",
    "media",
    "seo",
    "history",
    "changeManager",
    "preview",
    "publish",
  ]),
});

const HUB_MODULE_DEFS = Object.freeze([
  { key: "edit", label: "Edit Website", description: "Open the visual draft editor for text, images, sections, and YouTube embeds." },
  { key: "pages", label: "Pages", description: "Manage public pages and structure." },
  { key: "sections", label: "Sections", description: "Choose homepage and page sections." },
  { key: "themes", label: "Themes", description: "Select Clarity, Editorial, or Community presentation." },
  { key: "branding", label: "Branding", description: "Logo, colours, and brand identity." },
  { key: "media", label: "Media", description: "Upload and reuse website media." },
  { key: "seo", label: "SEO", description: "Search titles, descriptions, and social share." },
  { key: "content", label: "Content", description: "Reusable content and library items." },
  { key: "history", label: "Version History", description: "Review and restore prior drafts." },
  { key: "changeManager", label: "Change Manager", description: "Review unpublished draft changes." },
  { key: "preview", label: "Preview", description: "Live draft preview at Desktop, Tablet, Mobile." },
  { key: "publish", label: "Publish", description: "Publish draft changes to the live site." },
]);

function familyLabel(themeId) {
  const key = presentationFamilyForThemeId(themeId);
  const family = PRESENTATION_FAMILIES.find((f) => f.key === key);
  return family ? family.label : null;
}

function publishReadinessLabel(input) {
  if (input.publishReadinessLabel) return String(input.publishReadinessLabel);
  if (input.publishReady === true) return "Ready to publish";
  if (input.publishReady === false) return "Not ready";
  if (input.liveAvailable && !input.unpublishedChanges) return "Live — no pending changes";
  if (input.unpublishedChanges) return "Draft changes pending publish";
  if (!input.liveAvailable) return "Not published yet";
  return "—";
}

function domainStatusLabel(input) {
  if (input.domainStatusLabel) return String(input.domainStatusLabel);
  if (input.liveAvailable) return "Site live";
  if (input.exists) return "Draft site provisioned";
  return "Site not ready";
}

/**
 * @param {object} input
 * @returns {object}
 */
function buildWebsiteManagementHub(input) {
  const opts = input && typeof input === "object" ? input : {};
  const productCode = String(opts.productCode || "").trim().toLowerCase();
  const paths = opts.paths && typeof opts.paths === "object" ? opts.paths : {};
  const caps = opts.capabilities && typeof opts.capabilities === "object" ? opts.capabilities : {};
  const stitchScreen =
    productCode === PRODUCT_CODE.ACTIVECLINIC
      ? WEBSITE_MANAGEMENT_HUB.stitchScreens.activeclinic
      : productCode === PRODUCT_CODE.BLESSBOARD
        ? WEBSITE_MANAGEMENT_HUB.stitchScreens.blessboard
        : null;

  const modules = HUB_MODULE_DEFS.map((def) => {
    const href = paths[def.key] || null;
    let visible = Boolean(href);
    if (def.key === "edit" && caps.canEdit === false) visible = false;
    // Publish authorization is separate from edit — never surface Publish without canPublish.
    if (def.key === "publish" && caps.canPublish !== true) visible = false;
    if (def.key === "themes" && caps.canEdit === false) visible = Boolean(href);
    return {
      key: def.key,
      label: def.label,
      description: def.description,
      href,
      visible,
    };
  }).filter((m) => m.visible);

  const liveThemeId = opts.liveThemeId || opts.publishedThemeId || null;
  const draftThemeId = opts.draftThemeId || liveThemeId;
  const draftChangesCount = Number(opts.draftChangesCount || opts.unpublishedCount || 0) || 0;

  const hub = {
    pattern: WEBSITE_MANAGEMENT_HUB.pattern,
    stitchScreen,
    productCode,
    modules,
    status: {
      liveThemeId,
      liveThemeLabel: opts.liveThemeLabel || familyLabel(liveThemeId) || "—",
      draftThemeId,
      draftThemeLabel: opts.draftThemeLabel || familyLabel(draftThemeId) || "—",
      draftChangesCount,
      unpublishedChangeCount: draftChangesCount,
      continuousUnpublishedCount: draftChangesCount,
      lastPublishedLabel: opts.lastPublishedLabel || "Not published yet",
      publishReadiness: publishReadinessLabel(opts),
      domainStatus: domainStatusLabel(opts),
      liveAvailable: opts.liveAvailable === true,
      unpublishedChanges: draftChangesCount > 0 || opts.unpublishedChanges === true,
      publicUrl: opts.publicUrl || opts.publicPath || null,
    },
  };

  // Shared PublishNudge — continuous Change Manager count + ≥5 reminder.
  let withNudge = attachPublishNudgeToHub(hub, {
    productCode,
    organizationId: opts.organizationId,
    instanceId: opts.instanceId,
    websiteScopeKey: opts.websiteScopeKey,
    unpublishedChangeCount: draftChangesCount,
    canPublish: caps.canPublish === true,
    previewHref: paths.preview || null,
    publishHref: caps.canPublish === true ? paths.publish || null : null,
    reviewHref: paths.changeManager || null,
  });

  // Batch 6 — unified PublishWorkflow facade (same orchestrator for hub + editor).
  return attachPublishWorkflowToHub(withNudge, {
    productCode,
    organizationKey: opts.organizationKey || opts.clinicKey,
    clinicKey: opts.clinicKey,
    branchKey: opts.branchKey,
    scope: opts.scope,
    canPublish: caps.canPublish === true,
    canEdit: caps.canEdit !== false,
    actor: opts.actor,
    previewPath: paths.preview || null,
    editPath: paths.edit || null,
    historyPath: paths.history || null,
    changeManagerPath: paths.changeManager || null,
    livePath: opts.publicUrl || opts.publicPath || null,
  });
}

function defaultAcWebsiteHubPaths(input) {
  const clinicKey = String((input && input.clinicKey) || "").trim();
  const actions = (input && input.actions) || {};
  const workflow = buildPublishWorkflowPaths({
    productCode: PRODUCT_CODE.ACTIVECLINIC,
    organizationKey: clinicKey,
    clinicKey,
    canPublish: true,
    entry: ENTRY.ADMIN_CONSOLE,
    previewPath: actions.preview || null,
    editPath: actions.editWebsite || null,
    historyPath: actions.history || null,
    // Change Manager is distinct from Edit Website (Task 7 flow blocker fix).
    changeManagerPath:
      actions.unpublishedChanges ||
      actions.changeManager ||
      (clinicKey ? `/clinics/${encodeURIComponent(clinicKey)}/website/unpublished-changes` : null),
  });
  const themesHref = clinicKey
    ? `/app/settings/website/themes`
    : actions.themes || "/app/settings/website/themes";
  return {
    edit: actions.editWebsite || workflow.editPath || null,
    pages: "/app/settings/website/pages",
    sections: "/app/settings/website/sections",
    themes: themesHref,
    branding: "/app/settings/website/branding",
    media: "/app/settings/website/media",
    seo: "/app/settings/website/seo",
    content: "/app/settings/website/library",
    history: actions.history || workflow.historyPath || null,
    // Never alias Change Manager to editWebsite — breaks Preview → Change Manager → Publish.
    changeManager:
      workflow.changeManagerPath ||
      actions.unpublishedChanges ||
      actions.changeManager ||
      "/app/settings/website/publish",
    preview: actions.preview || workflow.previewPath || null,
    // Hub Publish tile → readiness review (GET). Confirm POST uses actions.publishPath from presentation.
    publish: workflow.reviewPath || "/app/settings/website/publish",
    publishConfirm: workflow.confirmPath || actions.publishPath || null,
    unpublish: workflow.unpublishPath || actions.unpublishPath || null,
  };
}

function defaultBbWebsiteHubPaths(input) {
  const actions = (input && input.actions) || {};
  const workflow = buildPublishWorkflowPaths({
    productCode: PRODUCT_CODE.BLESSBOARD,
    organizationKey: (input && input.organizationKey) || null,
    branchKey: (input && input.branchKey) || null,
    scope: (input && input.scope) || null,
    canPublish: true,
    entry: ENTRY.ADMIN_CONSOLE,
    previewPath: actions.preview || null,
    editPath: actions.editWebsite || null,
    historyPath: actions.history || "/hq/website/publishing-history",
    changeManagerPath: "/hq/content/draft-changes",
  });
  return {
    edit: actions.editWebsite || null,
    pages: actions.editWebsite || null,
    sections: actions.styles || actions.editWebsite || null,
    themes: "/hq/website/themes",
    branding: actions.branding || "/hq/website/branding",
    media: actions.media || actions.library || null,
    seo: actions.seo || null,
    content: "/hq/content",
    history: actions.history || workflow.historyPath || "/hq/website/publishing-history",
    changeManager: workflow.changeManagerPath || "/hq/content/draft-changes",
    preview: actions.preview || workflow.previewPath || null,
    // Hub Publish tile → readiness review (GET). Confirm POST stays on confirmPath.
    publish: workflow.reviewPath || "/hq/website/publish/review",
    publishConfirm: workflow.confirmPath || "/hq/website/publish",
    unpublish: workflow.unpublishPath || actions.unpublishPath || "/hq/website/unpublish",
  };
}

module.exports = {
  WEBSITE_MANAGEMENT_HUB,
  HUB_MODULE_DEFS,
  buildWebsiteManagementHub,
  defaultAcWebsiteHubPaths,
  defaultBbWebsiteHubPaths,
};
