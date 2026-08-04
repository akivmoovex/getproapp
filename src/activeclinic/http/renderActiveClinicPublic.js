"use strict";

/**
 * Render ActiveClinic public views (P20–P26) inside public-shell.
 */

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const { CSRF_FIELD } = require("../../platform/http/v5Csrf");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "activeclinic");
const ASSET_VERSION = "p20-1";

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderPartial(relativePath, data) {
  const templatePath = relativePath.endsWith(".ejs") ? relativePath : `${relativePath}.ejs`;
  const absolute = path.join(VIEWS_ROOT, templatePath);
  if (!fs.existsSync(absolute)) {
    throw new Error(`ActiveClinic public template missing: ${relativePath}`);
  }
  const source = fs.readFileSync(absolute, "utf8");
  return ejs.render(source, { ...(data || {}), escapeHtml, csrfField: CSRF_FIELD }, {
    filename: absolute,
    root: VIEWS_ROOT,
    views: [VIEWS_ROOT],
  });
}

/**
 * @param {object} input
 * @param {string} input.pageId
 * @param {string} input.pageTitle
 * @param {string} input.contentTemplate e.g. public/home
 * @param {object} [input.locals]
 * @param {'platform'|'tenant'} [input.shellVariant]
 * @param {string} [input.metaDescription]
 * @param {string} [input.canonicalUrl]
 * @param {string} [input.robots]
 */
function renderPublicPage(input) {
  const locals = {
    assetVersion: ASSET_VERSION,
    csrfField: CSRF_FIELD,
    csrfToken: (input.locals && input.locals.csrfToken) || "",
    clinic: (input.locals && input.locals.clinic) || null,
    formData: {},
    error: null,
    clinics: [],
    services: [],
    procedures: [],
    profiles: [],
    ...(input.locals || {}),
    escapeHtml,
  };

  const shellVariant = input.shellVariant || (locals.clinic ? "tenant" : "platform");
  const headerHtml = renderPartial(
    shellVariant === "tenant"
      ? "partials/public-tenant-header"
      : "partials/public-platform-header",
    locals
  );
  const footerHtml = renderPartial(
    shellVariant === "tenant"
      ? "partials/public-tenant-footer"
      : "partials/public-platform-footer",
    locals
  );
  const bodyHtml = renderPartial(input.contentTemplate, locals);

  return renderPartial("layouts/public-shell", {
    ...locals,
    pageId: input.pageId,
    pageTitle: input.pageTitle,
    metaDescription: input.metaDescription || "",
    canonicalUrl: input.canonicalUrl || "",
    robots: input.robots || "",
    shellVariant,
    headerHtml,
    footerHtml,
    bodyHtml,
  });
}

/** @deprecated prefer renderPublicPage */
function renderPublicView(relativePath, data) {
  const pageIdGuess = String(relativePath).replace(/[\\/]/g, "-");
  return renderPublicPage({
    pageId: (data && data.pageId) || pageIdGuess,
    pageTitle: (data && data.pageTitle) || "ActiveClinic",
    contentTemplate: relativePath,
    locals: data || {},
    shellVariant: data && data.clinic ? "tenant" : "platform",
    metaDescription: data && data.metaDescription,
  });
}

module.exports = {
  renderPublicPage,
  renderPublicView,
  VIEWS_ROOT,
  ASSET_VERSION,
  CSRF_FIELD,
};
