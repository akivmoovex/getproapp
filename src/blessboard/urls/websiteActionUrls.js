"use strict";

/**
 * Role-aware website action URLs.
 * Platform admin must use org-key-scoped routes (never accidental /hq session tenant).
 * HQ / branch use session-scoped tenant admin surfaces.
 */

const { normalizeOrganizationKey } = require("../services/organizationKey");
const {
  publicChurchHomePath,
  hqPreviewPagePath,
  hqContentPagePath,
  hqWebsitePath,
} = require("./churchUrlHelper");

/**
 * @param {string|null|undefined} organizationKey
 * @returns {string|null}
 */
function platformAdminOrgPath(organizationKey) {
  const norm = normalizeOrganizationKey(organizationKey);
  if (!norm.ok) return null;
  return `/admin/organizations/${encodeURIComponent(norm.key)}`;
}

/**
 * @param {string|null|undefined} organizationKey
 * @returns {string|null}
 */
function platformAdminWebsitePreviewPath(organizationKey) {
  const base = platformAdminOrgPath(organizationKey);
  return base ? `${base}/website-preview` : null;
}

/**
 * @param {{
 *   actor: 'platform_admin'|'hq'|'branch_admin'|'public',
 *   organizationKey?: string|null,
 * }} input
 * @returns {{
 *   serviceTimesUrl: string|null,
 *   serviceTimesLabel: string|null,
 *   editWebsiteUrl: string|null,
 *   editWebsiteLabel: string|null,
 *   previewUrl: string|null,
 *   previewLabel: string|null,
 *   publishedWebsiteUrl: string|null,
 *   publishedWebsiteLabel: string|null,
 *   publishWorkflowUrl: string|null,
 *   publishWorkflowLabel: string|null,
 * }}
 */
function resolveWebsiteActionUrls(input) {
  const actor = String((input && input.actor) || "").trim();
  const key = input && input.organizationKey;
  const publicPath = publicChurchHomePath(key);
  const orgPath = platformAdminOrgPath(key);
  const paPreview = platformAdminWebsitePreviewPath(key);

  if (actor === "platform_admin") {
    return {
      // Cross-tenant editing via /hq is unsupported without secure impersonation.
      serviceTimesUrl: null,
      serviceTimesLabel: null,
      editWebsiteUrl: null,
      editWebsiteLabel: null,
      previewUrl: paPreview,
      previewLabel: paPreview ? "Open website preview" : null,
      publishedWebsiteUrl: publicPath,
      publishedWebsiteLabel: publicPath ? "View published website" : null,
      publishWorkflowUrl: orgPath ? `${orgPath}#bb-pa-org-onboarding` : null,
      publishWorkflowLabel: "Publish website",
    };
  }

  if (actor === "hq") {
    return {
      serviceTimesUrl: hqContentPagePath("home"),
      serviceTimesLabel: "Edit church-wide service times",
      editWebsiteUrl: hqContentPagePath("home"),
      editWebsiteLabel: "Edit website",
      previewUrl: hqPreviewPagePath("home"),
      previewLabel: "Open website preview",
      publishedWebsiteUrl: publicPath,
      publishedWebsiteLabel: publicPath ? "View published website" : null,
      publishWorkflowUrl: hqWebsitePath(),
      publishWorkflowLabel: "Publish website",
    };
  }

  if (actor === "branch_admin") {
    const visualEdit =
      publicPath && publicPath !== "/"
        ? `${publicPath}?website_edit=1`
        : "/branch-admin/website";
    return {
      serviceTimesUrl: "/branch-admin/website/service-times",
      serviceTimesLabel: "Edit service times",
      editWebsiteUrl: "/branch-admin/website",
      editWebsiteLabel: "Edit website",
      previewUrl: visualEdit,
      previewLabel: "Open website editor",
      publishedWebsiteUrl: publicPath,
      publishedWebsiteLabel: publicPath ? "View published website" : null,
      publishWorkflowUrl: "/branch-admin/website/submit",
      publishWorkflowLabel: "Submit website update",
    };
  }

  return {
    serviceTimesUrl: null,
    serviceTimesLabel: null,
    editWebsiteUrl: null,
    editWebsiteLabel: null,
    previewUrl: null,
    previewLabel: null,
    publishedWebsiteUrl: publicPath,
    publishedWebsiteLabel: publicPath ? "View published website" : null,
    publishWorkflowUrl: null,
    publishWorkflowLabel: null,
  };
}

module.exports = {
  platformAdminOrgPath,
  platformAdminWebsitePreviewPath,
  resolveWebsiteActionUrls,
};
