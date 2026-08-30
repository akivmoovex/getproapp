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
const seoModel = require("../../platform/website/seoModel");
const { TITLE_SUFFIX: AC_TITLE_SUFFIX } = require("../website/activeClinicPublicSeo");
const { isPublicClinicDirectoryNavEnabled } = require("../website/activeClinicPublicCapabilities");
const {
  buildRegistrationSuccessViewModel,
} = require("../../platform/registration/registrationSuccessPresentation");
const {
  BOOKING_STATUS_LABELS,
  bookingStatusLabel,
} = require("./activeClinicBookingStatusCopy");

const VIEWS_ROOT = path.join(__dirname, "..", "..", "..", "views", "activeclinic");
const ASSET_VERSION = "v7-proj106-p9";

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resolvePublicChrome(input, locals) {
  if (locals && locals.chrome) return String(locals.chrome);
  const tpl = String((input && input.contentTemplate) || "");
  if (/register-clinic/.test(tpl) && !/register-clinic-status/.test(tpl)) {
    return "mf-register";
  }
  return "platform";
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
    bookingStatusLabels: BOOKING_STATUS_LABELS,
    bookingStatusLabel,
  });
  if (typeof locals.publicClinicDirectoryNavEnabled === "undefined") {
    locals.publicClinicDirectoryNavEnabled = isPublicClinicDirectoryNavEnabled(process.env);
  }
  if (
    /register-clinic-success/.test(String(input.contentTemplate || "")) &&
    !locals.registrationSuccess
  ) {
    locals.registrationSuccess = buildRegistrationSuccessViewModel({
      productCode: "activeclinic",
      reference: locals.applicationReference,
      reviewRequired: locals.reviewRequired,
      ready: locals.ready,
      authenticated: locals.authenticated,
    });
  }

  const shellVariant = input.shellVariant || (locals.clinic ? "tenant" : "platform");
  if (shellVariant === "tenant" && locals.clinic && !locals.clinicWebsiteNav) {
    locals.clinicWebsiteNav = buildClinicWebsiteNav(locals.clinic, { env: process.env });
  }
  const chrome = resolvePublicChrome(input, locals);
  locals.chrome = chrome;
  const headerHtml = renderPartial(
    shellVariant === "tenant"
      ? "partials/public-tenant-header"
      : chrome === "mf-register"
        ? "partials/mf-register-header"
        : "partials/public-platform-header",
    locals
  );
  const footerHtml = renderPartial(
    shellVariant === "tenant"
      ? "partials/public-tenant-footer"
      : chrome === "mf-register"
        ? "partials/mf-register-footer"
        : "partials/public-platform-footer",
    locals
  );
  const bodyHtml = renderPartial(input.contentTemplate, locals);

  const ogImageUrl =
    input.ogImageUrl || (locals.ogImageUrl || (locals.clinic && locals.clinic.seoImageUrl) || "");

  // Callers that already resolved SEO through the shared engine pass `seo`.
  // Everything else gets the same shared model built from page-level locals.
  const seo =
    locals.seo && typeof locals.seo === "object"
      ? locals.seo
      : seoModel.buildWebsiteSeo({
          siteName:
            (locals.clinic && (locals.clinic.websiteDisplayName || locals.clinic.publicName)) ||
            "",
          pageLabel: input.pageTitle,
          titleSuffix: AC_TITLE_SUFFIX,
          computedUrl: input.canonicalUrl || null,
          fallbackTitle: input.pageTitle,
          fallbackDescription: input.metaDescription || "",
          ogImageUrl,
          ogImageAlt: (locals.clinic && locals.clinic.seoImageAlt) || "",
          robotsOverride: input.robots || null,
          forceNoindex: /noindex/i.test(String(input.robots || "")) ? true : null,
        });

  return renderPartial("layouts/public-shell", {
    ...locals,
    seo,
    pageId: input.pageId,
    pageTitle: input.pageTitle,
    metaDescription: input.metaDescription || "",
    canonicalUrl: input.canonicalUrl || "",
    robots: input.robots || "",
    ogImageUrl,
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
