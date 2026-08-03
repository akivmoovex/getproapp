"use strict";

/**
 * Shared GetPro product / application registry.
 * Deployment profiles reference productCode; cookie and domain specifics live on profiles.
 */

const PRODUCT_CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;

/** @typedef {"blessboard"|"activeclinic"|"getpro"|"ngo"|"platform"} ProductCode */

/**
 * @typedef {Readonly<{
 *   productCode: ProductCode,
 *   displayName: string,
 *   routeModule: "blessboard"|"activeclinic"|"platform"|"none",
 *   defaultSessionCookieName: string|null,
 *   defaultCsrfCookieName: string|null,
 *   canonicalDomainHint: string|null,
 * }>} ProductDefinition
 */

/** @type {Readonly<Record<string, ProductDefinition>>} */
const PRODUCT_REGISTRY = Object.freeze({
  blessboard: Object.freeze({
    productCode: "blessboard",
    displayName: "BlessBoard",
    routeModule: "blessboard",
    defaultSessionCookieName: "blessboard_org_sid",
    defaultCsrfCookieName: "blessboard_org_csrf",
    canonicalDomainHint: "blessboard.org",
  }),
  activeclinic: Object.freeze({
    productCode: "activeclinic",
    displayName: "ActiveClinic",
    routeModule: "activeclinic",
    defaultSessionCookieName: "activeclinic_org_sid",
    defaultCsrfCookieName: "activeclinic_org_csrf",
    canonicalDomainHint: "activeclinic.org",
  }),
  getpro: Object.freeze({
    productCode: "getpro",
    displayName: "GetPro",
    routeModule: "none",
    defaultSessionCookieName: null,
    defaultCsrfCookieName: null,
    canonicalDomainHint: null,
  }),
  ngo: Object.freeze({
    productCode: "ngo",
    displayName: "NGO",
    routeModule: "none",
    defaultSessionCookieName: null,
    defaultCsrfCookieName: null,
    canonicalDomainHint: null,
  }),
  platform: Object.freeze({
    productCode: "platform",
    displayName: "Platform",
    routeModule: "platform",
    defaultSessionCookieName: null,
    defaultCsrfCookieName: null,
    canonicalDomainHint: null,
  }),
});

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
  PRODUCT_CODE_PATTERN,
  isValidApplicationCode,
  resolveProductOrError,
  getProduct,
  requireProduct,
};
