"use strict";

const ejs = require("ejs");
const fs = require("fs");
const path = require("path");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "platform");
const TEMPLATE = path.join(VIEWS_ROOT, "website", "management-page.ejs");

const INLINE_EDIT_STYLESHEET = "/platform/website-inline-edit.css?v=v7-we-4b1";

let cachedSource = null;

function templateSource() {
  if (cachedSource && process.env.NODE_ENV === "production") return cachedSource;
  cachedSource = fs.readFileSync(TEMPLATE, "utf8");
  return cachedSource;
}

/**
 * Standalone management surface (BlessBoard tenant editor tools).
 * @param {{
 *   pageTitle: string,
 *   productCode?: string,
 *   siteLabel?: string,
 *   backHref?: string|null,
 *   backLabel?: string|null,
 *   bodyHtml: string,
 *   stylesheets?: string[],
 *   scripts?: string[],
 *   csrfToken?: string,
 * }} input
 */
function renderWebsiteManagementPage(input) {
  const opts = input && typeof input === "object" ? input : {};
  const productCode = String(opts.productCode || "").trim().toLowerCase();
  const bodyClass =
    productCode === "activeclinic"
      ? "ac-public-body gp-website-tool-page"
      : "church-body church-body--tenant gp-website-tool-page";
  return ejs.render(
    templateSource(),
    {
      pageTitle: String(opts.pageTitle || "Website"),
      siteLabel: String(opts.siteLabel || ""),
      backHref: opts.backHref || null,
      backLabel: opts.backLabel || "Back to editor",
      bodyHtml: String(opts.bodyHtml || ""),
      bodyClass,
      inlineEditStylesheet: INLINE_EDIT_STYLESHEET,
      stylesheets: Array.isArray(opts.stylesheets) ? opts.stylesheets.filter(Boolean) : [],
      scripts: Array.isArray(opts.scripts) ? opts.scripts.filter(Boolean) : [],
      csrfToken: String(opts.csrfToken || ""),
    },
    { filename: TEMPLATE, root: VIEWS_ROOT, views: [VIEWS_ROOT] }
  );
}

module.exports = {
  VIEWS_ROOT,
  TEMPLATE,
  INLINE_EDIT_STYLESHEET,
  renderWebsiteManagementPage,
};
