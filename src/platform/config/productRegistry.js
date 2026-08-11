"use strict";

/**
 * Shared GetPro product / application registry.
 * Deployment profiles reference productCode; cookie and domain specifics live on profiles.
 *
 * Product keys are stable internal identifiers. Brand names may differ (e.g. ngo → Netraz).
 */

const PRODUCT_CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

/** @typedef {"blessboard"|"activeclinic"|"getpro"|"ngo"|"platform"} ProductCode */

/**
 * @typedef {Readonly<{
 *   productCode: ProductCode,
 *   displayName: string,
 *   brandName: string,
 *   routeModule: "blessboard"|"activeclinic"|"getpro"|"ngo"|"platform"|"none",
 *   siteType: "product"|"platform",
 *   defaultSessionCookieName: string|null,
 *   defaultCsrfCookieName: string|null,
 *   canonicalDomainHint: string|null,
 *   testingDomainHint: string|null,
 * }} ProductDefinition
 */

/** @type {Readonly<Record<string, ProductDefinition>>} */
const PRODUCT_REGISTRY = Object.freeze({
  blessboard: Object.freeze({
    productCode: "blessboard",
    displayName: "BlessBoard",
    brandName: "BlessBoard",
    routeModule: "blessboard",
    siteType: "product",
    defaultSessionCookieName: "blessboard_org_sid",
    defaultCsrfCookieName: "blessboard_org_csrf",
    canonicalDomainHint: "blessboard.com",
    testingDomainHint: "blessboard.pronline.org",
  }),
  activeclinic: Object.freeze({
    productCode: "activeclinic",
    displayName: "ActiveClinic",
    brandName: "ActiveClinic",
    routeModule: "activeclinic",
    siteType: "product",
    defaultSessionCookieName: "activeclinic_org_sid",
    defaultCsrfCookieName: "activeclinic_org_csrf",
    canonicalDomainHint: "activeclinic.org",
    testingDomainHint: "activeclinic.pronline.org",
  }),
  getpro: Object.freeze({
    productCode: "getpro",
    displayName: "GetPro",
    brandName: "GetPro",
    routeModule: "getpro",
    siteType: "product",
    defaultSessionCookieName: "getproapp_org_sid",
    defaultCsrfCookieName: "getproapp_org_csrf",
    canonicalDomainHint: "getproapp.org",
    testingDomainHint: "getpro.pronline.org",
  }),
  ngo: Object.freeze({
    productCode: "ngo",
    displayName: "Netraz",
    brandName: "Netraz",
    routeModule: "ngo",
    siteType: "product",
    defaultSessionCookieName: "netraz_org_sid",
    defaultCsrfCookieName: "netraz_org_csrf",
    canonicalDomainHint: "netraz.org",
    testingDomainHint: "netraz.pronline.org",
  }),
  platform: Object.freeze({
    productCode: "platform",
    displayName: "Platform",
    brandName: "Moovex Platform",
    routeModule: "platform",
    siteType: "platform",
    defaultSessionCookieName: null,
    defaultCsrfCookieName: null,
    canonicalDomainHint: null,
    testingDomainHint: null,
  }),
});

/** Business product keys (excludes platform application_code). */
const BUSINESS_PRODUCT_CODES = Object.freeze([
  "blessboard",
  "activeclinic",
  "getpro",
  "ngo",
]);

/** Allowed values for platform.deployments.application_code (DB CHECK + runtime). */
const APPLICATION_CODES = Object.freeze([
  "blessboard",
  "getpro",
  "ngo",
  "platform",
  "activeclinic",
]);

/**
 * @param {string} code
 * @returns {boolean}
 */
function isValidApplicationCode(code) {
  const raw = String(code || "")
    .trim()
    .toLowerCase();
  return APPLICATION_CODES.includes(raw);
}

/**
 * @param {string} code
 * @returns {boolean}
 */
function isBusinessProductCode(code) {
  const raw = String(code || "")
    .trim()
    .toLowerCase();
  return BUSINESS_PRODUCT_CODES.includes(raw);
}

/**
 * @param {string} code
 * @returns {{ ok: true, product: ProductDefinition } | { ok: false, code: string, message: string }}
 */
function resolveProductOrError(code) {
  const raw = String(code || "")
    .trim()
    .toLowerCase();
  if (!raw) {
    return {
      ok: false,
      code: "missing_product_code",
      message: "Product/application code is required.",
    };
  }
  if (!PRODUCT_CODE_PATTERN.test(raw) || !isValidApplicationCode(raw)) {
    return {
      ok: false,
      code: "unknown_product_code",
      message:
        `Unknown product/application code ${JSON.stringify(raw)}. ` +
        `Known codes: ${APPLICATION_CODES.join(", ")}.`,
    };
  }
  const product = PRODUCT_REGISTRY[raw];
  if (!product) {
    return {
      ok: false,
      code: "unknown_product_code",
      message:
        `Unknown product/application code ${JSON.stringify(raw)}. ` +
        `Known codes: ${APPLICATION_CODES.join(", ")}.`,
    };
  }
  return { ok: true, product };
}

/**
 * @param {string} code
 * @returns {ProductDefinition|null}
 */
function getProduct(code) {
  const resolved = resolveProductOrError(code);
  return resolved.ok ? resolved.product : null;
}

/**
 * @param {string} code
 * @returns {ProductDefinition}
 */
function requireProduct(code) {
  const resolved = resolveProductOrError(code);
  if (!resolved.ok) {
    const err = new Error(resolved.message);
    err.code = resolved.code;
    throw err;
  }
  return resolved.product;
}

module.exports = {
  PRODUCT_REGISTRY,
  APPLICATION_CODES,
  BUSINESS_PRODUCT_CODES,
  PRODUCT_CODE_PATTERN,
  isValidApplicationCode,
  isBusinessProductCode,
  resolveProductOrError,
  getProduct,
  requireProduct,
};
