"use strict";

/**
 * Render ActiveClinic public views (P20–P26) inside public-shell.
 */

const fs = require("fs");
const path = require("path");
const ejs = require("ejs");
const { CSRF_FIELD } = require("../../platform/http/v5Csrf");
const {
  buildPhoneFieldLocals,
} = require("../services/activeClinicPhoneFieldLocals");
const {
  enrichPublicLocals,
} = require("../services/activeClinicPublicMediaService");
const { buildClinicWebsiteNav } = require("../website/activeClinicClinicWebsiteNav");
const { isPublicClinicDirectoryNavEnabled } = require("../website/activeClinicPublicCapabilities");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "activeclinic");
const ASSET_VERSION = "v7-acw-15";

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
  const phoneLocals = buildPhoneFieldLocals({
    clinicDefaultCountry:
      (input.locals &&
        input.locals.clinic &&
        (input.locals.clinic.countryCode || input.locals.clinic.defaultCountry)) ||
      null,
    selectedCountry:
      (input.locals &&
        input.locals.formData &&
        (input.locals.formData.phoneCountry || input.locals.formData.countryCode)) ||
      null,
  });
  const locals = enrichPublicLocals({
    assetVersion: ASSET_VERSION,
    csrfField: CSRF_FIELD,
    csrfToken: (input.locals && input.locals.csrfToken) || "",
    clinic: (input.locals && input.locals.clinic) || null,
    formData: {},
    error: null,
    validationErrors: {},
    clinics: [],
    services: [],
    procedures: [],
    profiles: [],
    pageId: input.pageId,
    ...phoneLocals,
    ...(input.locals || {}),
    escapeHtml,
  });
  if (typeof locals.publicClinicDirectoryNavEnabled === "undefined") {
    locals.publicClinicDirectoryNavEnabled = isPublicClinicDirectoryNavEnabled(process.env);
  }

  const shellVariant = input.shellVariant || (locals.clinic ? "tenant" : "platform");
  if (shellVariant === "tenant" && locals.clinic && !locals.clinicWebsiteNav) {
    locals.clinicWebsiteNav = buildClinicWebsiteNav(locals.clinic, { env: process.env });
  }
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
    ogImageUrl: input.ogImageUrl || (locals.ogImageUrl || (locals.clinic && locals.clinic.seoImageUrl) || ""),
    shellVariant,
    headerHtml,
    footerHtml,
    bodyHtml,
  });
}

function renderPublicSystemStatePage(input) {
  const src = input && typeof input === "object" ? input : {};
  const actions = Array.isArray(src.actions) ? src.actions : [];
  return renderPublicPage({
    pageId: src.pageId || "public-system-state",
    pageTitle: src.pageTitle || "ActiveClinic",
    contentTemplate: "public/system-state",
    shellVariant: "platform",
    robots: "noindex, nofollow",
    locals: {
      acwScreen: src.acwScreen || "ACW11",
      statePageId: src.statePageId || "error",
      stateKey: src.stateKey || "",
      heading: src.heading || "Something went wrong",
      message: src.message || "Please try again.",
      supportReference: src.supportReference || null,
      actions,
    },
  });
}

/** @deprecated prefer renderPublicPage */
function renderPublicView(relativePath, data) {
  const pageIdGuess = String(relativePath).replace(/[\\/]/g, "-");
  return renderPublicPage({
    pageId: (data && data.pageId) || pageIdGuess,
    pageTitle: (data && data.pageTitle) || "ActiveClinic",
    metaDescription: (data && data.metaDescription) || "",
    ogImageUrl: (data && data.ogImageUrl) || "",
    contentTemplate: relativePath,
    locals: data || {},
    shellVariant: (data && data.shellVariant) || (data && data.clinic ? "tenant" : "platform"),
    robots: data && data.robots,
  });
}

module.exports = {
  renderPublicPage,
  renderPublicView,
  renderPublicSystemStatePage,
  VIEWS_ROOT,
  ASSET_VERSION,
  CSRF_FIELD,
};
