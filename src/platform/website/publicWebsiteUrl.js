"use strict";

/**
 * Shared public organization website URL construction.
 * Product path prefixes stay distinct (ActiveClinic /clinics vs BlessBoard /c),
 * but callers must not assemble these strings independently.
 */

const { DOMAIN_MATRIX } = require("../config/domainMatrix");

const PRODUCT_CODE = Object.freeze({
  ACTIVECLINIC: "activeclinic",
  BLESSBOARD: "blessboard",
});

const PRODUCT_PUBLIC_PREFIX = Object.freeze({
  [PRODUCT_CODE.ACTIVECLINIC]: "/clinics",
  [PRODUCT_CODE.BLESSBOARD]: "/c",
});

const PRODUCT_PUBLIC_ALIAS_PREFIX = Object.freeze({
  [PRODUCT_CODE.ACTIVECLINIC]: "/c",
});

const PRODUCT_WEBSITE_SETTINGS_PATH = Object.freeze({
  [PRODUCT_CODE.ACTIVECLINIC]: "/app/settings/website",
  [PRODUCT_CODE.BLESSBOARD]: "/hq/website",
});

function normalizeProduct(product) {
  return String(product || "").trim().toLowerCase();
}

function normalizeOrganizationKey(organizationKey) {
  return String(organizationKey == null ? "" : organizationKey)
    .trim()
    .toLowerCase();
}

function publicWebsitePathPrefix(product) {
  return PRODUCT_PUBLIC_PREFIX[normalizeProduct(product)] || null;
}

function publicWebsiteAliasPathPrefix(product) {
  return PRODUCT_PUBLIC_ALIAS_PREFIX[normalizeProduct(product)] || null;
}

function envMode(env) {
  const source = env || process.env || {};
  const mode = String(
    source.DEPLOYMENT_ENV || source.DATABASE_IDENTITY_ENV || source.NODE_ENV || ""
  ).toLowerCase();
  return mode === "production" ? "production" : "testing";
}

function publicOriginForProduct(product, env) {
  if (env && env.origin) return String(env.origin).replace(/\/$/, "");
  const productKey = normalizeProduct(product);
  const type = envMode(env);
  const row = DOMAIN_MATRIX.find(
    (entry) => entry.productKey === productKey && entry.type === type && entry.domain
  );
  return row && row.domain ? `https://${row.domain}` : "";
}

function splitPathAndSearch(raw) {
  const value = String(raw == null ? "" : raw);
  const q = value.indexOf("?");
  if (q === -1) return { pathname: value, search: "" };
  return { pathname: value.slice(0, q), search: value.slice(q) };
}

function serializeQuery(query) {
  if (query == null || query === false || query === "") return "";
  if (typeof query === "string") return query.replace(/^\?/, "");
  if (typeof URLSearchParams === "function" && query instanceof URLSearchParams) {
    return query.toString();
  }
  if (typeof query === "object") {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === false) continue;
      if (Array.isArray(value)) {
        value.forEach((item) => params.append(key, String(item)));
        continue;
      }
      params.set(key, value === true ? "1" : String(value));
    }
    return params.toString();
  }
  return "";
}

/**
 * Append or merge query parameters onto a path. Preserves an existing query string.
 * @param {string|null|undefined} path
 * @param {string|URLSearchParams|Record<string, unknown>|null|undefined} query
 * @returns {string|null}
 */
function appendQuery(path, query) {
  if (path == null || path === "") return path == null ? null : "";
  const extra = serializeQuery(query);
  const { pathname, search } = splitPathAndSearch(path);
  if (!extra) return search ? `${pathname}${search}` : pathname;
  if (!search) return `${pathname}?${extra}`;
  const merged = new URLSearchParams(search.slice(1));
  const incoming = new URLSearchParams(extra);
  incoming.forEach((value, key) => {
    merged.set(key, value);
  });
  const serialized = merged.toString();
  return serialized ? `${pathname}?${serialized}` : pathname;
}

function searchFromRequest(req) {
  const original = String((req && (req.originalUrl || req.url)) || "");
  const q = original.indexOf("?");
  return q >= 0 ? original.slice(q + 1) : "";
}

function normalizeSuffix(suffix) {
  const raw = String(suffix == null ? "" : suffix).trim();
  if (!raw || raw === "/") return "";
  return `/${raw.replace(/^\/+/, "").replace(/\/+$/, "")}`;
}

function appendPage(path, pageKey) {
  const key = String(pageKey == null ? "home" : pageKey)
    .trim()
    .toLowerCase();
  if (!key || key === "home") return path;
  return `${path}/${encodeURIComponent(key)}`;
}

function pathHasPrefix(pathname, prefix) {
  const p = String(prefix || "");
  const path = String(pathname || "");
  if (!p || !path) return false;
  return path === p || path.startsWith(`${p}/`);
}

/**
 * @param {{
 *   product?: string,
 *   productCode?: string,
 *   organizationKey?: string,
 *   pageKey?: string,
 *   suffix?: string,
 *   query?: string|URLSearchParams|Record<string, unknown>,
 *   scope?: { kind?: string, branchKey?: string } | null,
 * }} input
 * @returns {string|null}
 */
function buildPublicOrganizationWebsitePath(input) {
  const product = normalizeProduct((input && (input.product || input.productCode)) || "");
  const organizationKey = normalizeOrganizationKey(input && input.organizationKey);
  const prefix = publicWebsitePathPrefix(product);
  if (!prefix || !organizationKey) return null;

  const scope = input && input.scope;
  const branchKey =
    scope && (scope.kind === "branch" || scope.branchKey)
      ? String(scope.branchKey || "").trim()
      : "";
  let path = `${prefix}/${encodeURIComponent(organizationKey)}`;
  if (product === PRODUCT_CODE.BLESSBOARD && branchKey) {
    path = `${path}/branches/${encodeURIComponent(branchKey)}`;
  }
  path = appendPage(path, input && input.pageKey);
  path = `${path}${normalizeSuffix(input && input.suffix)}`;
  return appendQuery(path, input && input.query);
}

/**
 * @param {{
 *   product?: string,
 *   productCode?: string,
 *   organizationKey?: string,
 *   pageKey?: string,
 *   suffix?: string,
 *   query?: string|URLSearchParams|Record<string, unknown>,
 *   scope?: object,
 *   origin?: string,
 *   env?: NodeJS.ProcessEnv,
 * }} input
 * @returns {string|null}
 */
function buildPublicOrganizationWebsiteUrl(input) {
  const path = buildPublicOrganizationWebsitePath(input);
  if (!path) return null;
  const origin = String(
    (input && input.origin) ||
      publicOriginForProduct(input && (input.product || input.productCode), input && input.env) ||
      ""
  ).replace(/\/$/, "");
  return origin ? `${origin}${path}` : path;
}

function buildPublicWebsiteEditPath(input) {
  const path = buildPublicOrganizationWebsitePath({
    ...(input || {}),
    query: undefined,
  });
  if (!path) return null;
  const product = normalizeProduct((input && (input.product || input.productCode)) || "");
  const editQuery =
    product === PRODUCT_CODE.ACTIVECLINIC
      ? { website_edit: "1", website_mode: "draft" }
      : { website_edit: "1" };
  return appendQuery(appendQuery(path, editQuery), input && input.query);
}

function buildPublicWebsitePreviewPath(input) {
  const path = buildPublicOrganizationWebsitePath({
    ...(input || {}),
    query: undefined,
    suffix: undefined,
  });
  if (!path) return null;
  const product = normalizeProduct((input && (input.product || input.productCode)) || "");
  if (product === PRODUCT_CODE.ACTIVECLINIC) {
    return appendQuery(`${path}/website/preview`, input && input.query);
  }
  return appendQuery(appendQuery(path, { website_mode: "draft" }), input && input.query);
}

function buildPublicWebsiteHistoryPath(input) {
  const path = buildPublicOrganizationWebsitePath({
    ...(input || {}),
    query: undefined,
    suffix: undefined,
  });
  if (!path) return null;
  const product = normalizeProduct((input && (input.product || input.productCode)) || "");
  if (product === PRODUCT_CODE.ACTIVECLINIC) {
    return appendQuery(`${path}/website/history`, input && input.query);
  }
  return appendQuery("/hq/website/version-history", input && input.query);
}

function buildPublicWebsiteSettingsPath(input) {
  const product = normalizeProduct((input && (input.product || input.productCode)) || "");
  const actor = String((input && input.actor) || "").trim();
  const scope = input && input.scope;
  if (product === PRODUCT_CODE.ACTIVECLINIC) {
    return PRODUCT_WEBSITE_SETTINGS_PATH[PRODUCT_CODE.ACTIVECLINIC];
  }
  if (product !== PRODUCT_CODE.BLESSBOARD) return null;
  if (actor === "branch_admin" || (scope && (scope.kind === "branch" || scope.branchKey))) {
    return "/branch-admin/website";
  }
  return PRODUCT_WEBSITE_SETTINGS_PATH[PRODUCT_CODE.BLESSBOARD];
}

function buildPublicWebsiteUnpublishPath(input) {
  const product = normalizeProduct((input && (input.product || input.productCode)) || "");
  if (product === PRODUCT_CODE.ACTIVECLINIC) {
    const path = buildPublicOrganizationWebsitePath({
      ...(input || {}),
      query: undefined,
      suffix: undefined,
      pageKey: undefined,
    });
    return path ? appendQuery(`${path}/website/unpublish`, input && input.query) : null;
  }
  if (product !== PRODUCT_CODE.BLESSBOARD) return null;
  return appendQuery("/hq/website/unpublish", input && input.query);
}

function buildPublicWebsitePublishPath(input) {
  const product = normalizeProduct((input && (input.product || input.productCode)) || "");
  if (product === PRODUCT_CODE.ACTIVECLINIC) {
    const path = buildPublicOrganizationWebsitePath({
      ...(input || {}),
      query: undefined,
      suffix: undefined,
      pageKey: undefined,
    });
    return path ? appendQuery(`${path}/website/publish`, input && input.query) : null;
  }
  if (product !== PRODUCT_CODE.BLESSBOARD) return null;
  const branchKey = String((input && input.scope && input.scope.branchKey) || "").trim();
  const reviewPath = branchKey
    ? `/hq/website/branches/${encodeURIComponent(branchKey)}/publish/review`
    : "/hq/website/publish/review";
  return appendQuery(reviewPath, input && input.query);
}

function buildPublicWebsiteAdminPath(input) {
  const organizationKey = normalizeOrganizationKey(input && input.organizationKey);
  if (!organizationKey) return null;
  const base = `/admin/organizations/${encodeURIComponent(organizationKey)}`;
  const surface = String((input && input.surface) || "").trim().toLowerCase();
  if (surface === "website-preview" || (input && input.preview === true)) {
    return `${base}/website-preview`;
  }
  if (surface === "website") {
    return `${base}/website`;
  }
  return base;
}

/**
 * Map a legacy alias request onto the canonical public path.
 * Returns null when the request is already canonical (no redirect / no loop).
 * Query strings are preserved.
 * @param {string} product
 * @param {string} reqPath
 * @returns {string|null}
 */
function canonicalRedirectFromAlias(product, reqPath) {
  return canonicalPublicWebsiteRedirect(product, reqPath);
}

/**
 * 301 target when a public website request is not canonical.
 * Handles product alias prefixes, trailing slashes, organization-key case,
 * optional slug remaps, and query preservation. Returns null when already
 * canonical so callers never loop.
 *
 * @param {string} product
 * @param {string} reqPath
 * @param {{
 *   canonicalOrganizationKey?: string,
 *   canonicalBranchKey?: string,
 *   remapOrganizationKey?: (key: string) => string|null|undefined,
 *   remapBranchKey?: (organizationKey: string, branchKey: string) => string|null|undefined,
 *   query?: string|URLSearchParams|Record<string, unknown>,
 * } | null} [options]
 * @returns {string|null}
 */
function canonicalPublicWebsiteRedirect(product, reqPath, options) {
  const productCode = normalizeProduct(product);
  const prefix = publicWebsitePathPrefix(productCode);
  const alias = publicWebsiteAliasPathPrefix(productCode);
  if (!prefix) return null;

  const { pathname, search } = splitPathAndSearch(reqPath);
  if (!pathname || pathname === "/") return null;

  let path = String(pathname).replace(/\/{2,}/g, "/");
  if (path.length > 1) path = path.replace(/\/+$/, "");

  if (alias && pathHasPrefix(path, alias) && !pathHasPrefix(path, prefix)) {
    path = `${prefix}${path.slice(alias.length)}`;
  }
  if (!pathHasPrefix(path, prefix)) return null;

  const rest = path.slice(prefix.length);
  const segments = rest.split("/").filter((part) => part !== "");
  if (!segments.length) return null;

  let organizationKey = normalizeOrganizationKey(decodeURIComponent(segments[0] || ""));
  if (options && options.canonicalOrganizationKey) {
    organizationKey = normalizeOrganizationKey(options.canonicalOrganizationKey) || organizationKey;
  }
  if (options && typeof options.remapOrganizationKey === "function") {
    const mapped = options.remapOrganizationKey(organizationKey);
    if (mapped) organizationKey = normalizeOrganizationKey(mapped) || organizationKey;
  }
  if (!organizationKey) return null;
  segments[0] = encodeURIComponent(organizationKey);

  if (productCode === PRODUCT_CODE.BLESSBOARD && segments[1] === "branches" && segments[2]) {
    let branchKey = String(decodeURIComponent(segments[2]) || "")
      .trim()
      .toLowerCase();
    if (options && options.canonicalBranchKey) {
      branchKey = String(options.canonicalBranchKey).trim().toLowerCase() || branchKey;
    }
    if (options && typeof options.remapBranchKey === "function") {
      const mappedBranch = options.remapBranchKey(organizationKey, branchKey);
      if (mappedBranch) branchKey = String(mappedBranch).trim().toLowerCase() || branchKey;
    }
    if (branchKey) segments[2] = encodeURIComponent(branchKey);
  }

  const rebuilt = `${prefix}/${segments.join("/")}`;
  const dest = options && options.query != null
    ? appendQuery(`${rebuilt}${search}`, options.query)
    : `${rebuilt}${search}`;
  const original = `${pathname}${search}`;
  if (dest === original || dest === String(reqPath || "")) return null;
  return dest;
}

/**
 * GET/HEAD-only 301. Returns true when a redirect was sent.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {string} product
 * @param {object} [options]
 */
function sendCanonicalPublicWebsiteRedirect(req, res, product, options) {
  const method = String((req && req.method) || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") return false;
  const dest = canonicalPublicWebsiteRedirect(
    product,
    (req && (req.originalUrl || req.url)) || "",
    options
  );
  if (!dest) return false;
  res.redirect(301, dest);
  return true;
}

const ACTIVECLINIC_PUBLIC_PAGE_KEYS = Object.freeze([
  "about",
  "doctors",
  "services",
  "pricing",
  "contact",
  "location",
  "book",
]);

/**
 * Nav paths for a tenant public website, always via the shared builder.
 * @param {{ product?: string, productCode?: string, organizationKey?: string, scope?: object }} input
 * @returns {Record<string, string>|null}
 */
function buildPublicWebsitePagePaths(input) {
  const home = buildPublicOrganizationWebsitePath({
    ...(input || {}),
    pageKey: undefined,
    suffix: undefined,
    query: undefined,
  });
  if (!home) return null;
  const product = normalizeProduct((input && (input.product || input.productCode)) || "");
  const keys =
    product === PRODUCT_CODE.ACTIVECLINIC ? ACTIVECLINIC_PUBLIC_PAGE_KEYS : [];
  /** @type {Record<string, string>} */
  const paths = { home };
  for (const pageKey of keys) {
    const path = buildPublicOrganizationWebsitePath({
      ...(input || {}),
      pageKey,
      suffix: undefined,
      query: undefined,
    });
    if (path) paths[pageKey] = path;
  }
  if (product !== PRODUCT_CODE.ACTIVECLINIC) return paths;
  paths.privacy = buildPublicOrganizationWebsitePath({
    ...(input || {}),
    suffix: "privacy",
    pageKey: undefined,
    query: undefined,
  }) || `${home}/privacy`;
  paths.terms = buildPublicOrganizationWebsitePath({
    ...(input || {}),
    suffix: "terms",
    pageKey: undefined,
    query: undefined,
  }) || `${home}/terms`;
  paths.patientLogin = buildPublicOrganizationWebsitePath({
    ...(input || {}),
    suffix: "patient/login",
    pageKey: undefined,
    query: undefined,
  }) || `${home}/patient/login`;
  paths.myBooking = buildPublicOrganizationWebsitePath({
    ...(input || {}),
    suffix: "my-booking",
    pageKey: undefined,
    query: undefined,
  }) || `${home}/my-booking`;
  paths.patientInformation = buildPublicOrganizationWebsitePath({
    ...(input || {}),
    suffix: "patient-information",
    pageKey: undefined,
    query: undefined,
  }) || `${home}/patient-information`;
  return paths;
}

/**
 * Attach canonical nav paths onto an ActiveClinic clinic DTO.
 * @param {object|null|undefined} clinic
 * @returns {object|null|undefined}
 */
function attachClinicPublicWebsitePaths(clinic) {
  if (!clinic || typeof clinic !== "object") return clinic;
  const organizationKey = String(clinic.clinicKey || clinic.organizationKey || "").trim();
  if (!organizationKey) return clinic;
  const publicPagePaths =
    clinic.publicPagePaths ||
    buildPublicWebsitePagePaths({
      product: PRODUCT_CODE.ACTIVECLINIC,
      organizationKey,
    });
  if (!publicPagePaths) return clinic;
  return {
    ...clinic,
    publicBasePath: clinic.publicBasePath || publicPagePaths.home,
    publicPagePaths,
  };
}

module.exports = {
  PRODUCT_CODE,
  PRODUCT_PUBLIC_PREFIX,
  PRODUCT_PUBLIC_ALIAS_PREFIX,
  PRODUCT_WEBSITE_SETTINGS_PATH,
  normalizeOrganizationKey,
  publicWebsitePathPrefix,
  publicWebsiteAliasPathPrefix,
  publicOriginForProduct,
  splitPathAndSearch,
  appendQuery,
  searchFromRequest,
  buildPublicOrganizationWebsitePath,
  buildPublicOrganizationWebsiteUrl,
  buildPublicWebsiteEditPath,
  buildPublicWebsitePreviewPath,
  buildPublicWebsiteHistoryPath,
  buildPublicWebsiteSettingsPath,
  buildPublicWebsitePublishPath,
  buildPublicWebsiteUnpublishPath,
  buildPublicWebsiteAdminPath,
  buildPublicWebsitePagePaths,
  attachClinicPublicWebsitePaths,
  canonicalRedirectFromAlias,
  canonicalPublicWebsiteRedirect,
  sendCanonicalPublicWebsiteRedirect,
};
