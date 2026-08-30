"use strict";

const { PRODUCT_CODE } = require("./publicWebsiteUrl");
const { renderGovernanceVersionPreview } = require("./governanceVersionPreview");
const { buildVersionPreviewView } = require("./versionPreviewModel");
const {
  renderVersionPreviewBanner,
  BANNER_STYLESHEET,
} = require("./renderVersionPreviewBanner");

const GOVERNANCE_BANNER_RE =
  /<div class="bb-pa-governance-preview-banner"[^>]*>[\s\S]*?<\/div>/;
const AC_LEGACY_VERSION_BANNER_RE =
  /<div class="ac-website-preview-banner"[^>]*>[\s\S]*?<\/div>/;

/**
 * Render a tenant-scoped historical version preview (read-only).
 * @param {import('pg').Pool|{query: Function}} db
 * @param {{
 *   instance: object,
 *   organizationKey: string,
 *   productCode?: string,
 *   version: object,
 *   siteLabel?: string,
 *   historyHref?: string|null,
 *   restoreHref?: string|null,
 *   canRestore?: boolean,
 *   csrfField?: string,
 *   csrfToken?: string,
 * }} input
 */
async function renderTenantWebsiteVersionPreview(db, input) {
  const opts = input && typeof input === "object" ? input : {};
  const instance = opts.instance;
  const version = opts.version;
  if (!instance || !version) {
    return { ok: false, code: "invalid_input" };
  }
  const productCode = String(opts.productCode || instance.productCode || "").trim().toLowerCase();
  const snapshot = version.snapshot || {};
  const rendered = await renderGovernanceVersionPreview(db, {
    instance,
    organizationKey: opts.organizationKey,
    snapshot,
    version,
    label: null,
  });
  if (!rendered.ok) {
    return rendered;
  }
  const preview = buildVersionPreviewView(version, {
    productCode,
    siteLabel: opts.siteLabel,
    historyHref: opts.historyHref,
    restoreHref: opts.restoreHref,
    canRestore: opts.canRestore,
    csrfField: opts.csrfField,
    csrfToken: opts.csrfToken,
  });
  const bannerHtml = renderVersionPreviewBanner(preview);
  let html = String(rendered.html || "");
  if (GOVERNANCE_BANNER_RE.test(html)) {
    html = html.replace(GOVERNANCE_BANNER_RE, bannerHtml);
  } else if (productCode === PRODUCT_CODE.BLESSBOARD) {
    html = `${bannerHtml}${html}`;
  } else {
    html = html.replace(
      /<body([^>]*)>/i,
      `<body$1>${bannerHtml}`
    );
  }
  if (productCode === PRODUCT_CODE.ACTIVECLINIC && AC_LEGACY_VERSION_BANNER_RE.test(html)) {
    html = html.replace(AC_LEGACY_VERSION_BANNER_RE, "");
  }
  return {
    ok: true,
    mode: rendered.mode,
    html,
    preview,
    limitation: rendered.limitation || null,
    stylesheet: BANNER_STYLESHEET,
  };
}

module.exports = {
  renderTenantWebsiteVersionPreview,
};
