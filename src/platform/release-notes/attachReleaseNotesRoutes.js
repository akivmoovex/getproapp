"use strict";

/**
 * Release Notes Center request handler (QA hub + BlessBoard/ActiveClinic apex).
 */

const { resolveHostname } = require("../host");
const {
  listVersions,
  getVersion,
  normalizeVersion,
  filterCatalog,
  sanitizeForAudience,
  filterOptions,
  isReleaseNotesCenterAllowed,
  resolveReleaseNotesInternalAccess,
  VERSION_ORDER,
  PRODUCTS,
} = require("./releaseNotesService");
const { renderReleaseNotesView } = require("./renderReleaseNotes");

/**
 * Host-based product context for BB / AC apex Release Notes.
 * Explicit ?product= wins. ?all_products=1 clears the default on product hosts.
 * @param {import('express').Request} req
 * @returns {{ product: string, productContext: string|null, hostDefaultApplied: boolean }}
 */
function resolveRequestProductFilter(req) {
  const q = (req && req.query) || {};
  if (String(q.all_products || "") === "1") {
    return { product: "", productContext: null, hostDefaultApplied: false };
  }
  if (Object.prototype.hasOwnProperty.call(q, "product")) {
    const product = String(q.product || "").trim();
    return { product, productContext: product || null, hostDefaultApplied: false };
  }
  const host = String(resolveHostname(req) || "")
    .trim()
    .toLowerCase()
    .split(":")[0];
  if (host.startsWith("blessboard.")) {
    return {
      product: PRODUCTS.BB,
      productContext: PRODUCTS.BB,
      hostDefaultApplied: true,
    };
  }
  if (host.startsWith("activeclinic.")) {
    return {
      product: PRODUCTS.AC,
      productContext: PRODUCTS.AC,
      hostDefaultApplied: true,
    };
  }
  return { product: "", productContext: null, hostDefaultApplied: false };
}

/**
 * @param {import('express').Request} req
 * @returns {object}
 */
function parseFilters(query, req) {
  const q = query || {};
  const resolved = resolveRequestProductFilter(
    req || { query: q, get() { return ""; }, headers: {}, hostname: "" }
  );
  return {
    version: q.version || "",
    product: resolved.product,
    featureType: q.featureType || "",
    implementationStatus: q.implementationStatus || "",
    qaStatus: q.qaStatus || "",
    severity: q.severity || "",
    productContext: resolved.productContext,
    hostDefaultApplied: resolved.hostDefaultApplied,
  };
}

/**
 * @param {import('express').Request} req
 * @param {NodeJS.ProcessEnv} env
 * @param {object} [extra]
 */
function buildLocals(req, env, extra) {
  const includeInternal = Boolean(extra && extra.includeInternal);
  const accessVia = (extra && extra.accessVia) || null;
  const productContext =
    (extra && extra.productContext) ||
    (extra && extra.filters && extra.filters.productContext) ||
    null;
  return {
    title: productContext
      ? `${productContext} Release Notes`
      : "GetPro Release Notes Center",
    hubBrand: "GetPro Unified Platform",
    versionOrder: VERSION_ORDER,
    filterOptions: filterOptions(),
    filters: parseFilters(req.query, req),
    includeInternal,
    accessVia,
    audience: includeInternal ? "internal" : "public",
    productContext,
    stitchStatus:
      "DOCUMENTATION PENDING — no approved Stitch Release Notes Center project found in account inventory (2026-09-25).",
    assetVersion: "v2-02-rnc-3",
    ...(extra || {}),
  };
}

/**
 * Handle /release-notes* requests.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   getPool?: () => { query: Function }|null,
 *   platformAdminAuthorized?: boolean,
 * }} [opts]
 * @returns {Promise<boolean>} true if handled
 */
async function tryHandleReleaseNotesRequest(req, res, opts) {
  const env = (opts && opts.env) || process.env;
  const pathName = String(req.path || "");
  if (!pathName.startsWith("/release-notes")) return false;

  if (!isReleaseNotesCenterAllowed(env)) {
    res.status(404).json({ ok: false, code: "not_found" });
    return true;
  }

  const access = await resolveReleaseNotesInternalAccess(req, env, {
    getPool: opts && opts.getPool,
    platformAdminAuthorized: opts && opts.platformAdminAuthorized === true,
  });

  if (pathName === "/release-notes" || pathName === "/release-notes/") {
    const filters = parseFilters(req.query, req);
    const includeInternal = access.allowed;
    const versions = filterCatalog(filters).map((entry) =>
      sanitizeForAudience(entry, { includeInternal })
    );
    res.status(200).type("html").send(
      renderReleaseNotesView(
        "overview",
        buildLocals(req, env, {
          page: "overview",
          versionsSummary: listVersions(),
          versions,
          filters,
          includeInternal,
          accessVia: access.via,
          productContext: filters.productContext,
        })
      )
    );
    return true;
  }

  const match = pathName.match(
    /^\/release-notes\/([^/]+)(?:\/(bugs|qa|share|print))?\/?$/
  );
  if (!match) {
    res.status(404).type("html").send(
      renderReleaseNotesView(
        "not-found",
        buildLocals(req, env, {
          page: "not-found",
          message: "Unknown release notes path.",
          includeInternal: false,
        })
      )
    );
    return true;
  }

  const versionId = normalizeVersion(match[1]);
  if (!versionId) {
    res.status(404).type("html").send(
      renderReleaseNotesView(
        "not-found",
        buildLocals(req, env, {
          page: "not-found",
          message: "Unknown release version.",
          includeInternal: false,
        })
      )
    );
    return true;
  }

  const section = match[2] || String((req.query && req.query.panel) || "details");
  const panel =
    section === "bugs"
      ? "bugs"
      : section === "qa"
        ? "qa"
        : section === "share" || section === "print"
          ? "share"
          : "details";

  const forcePublic =
    panel === "share" || String((req.query && req.query.public) || "") === "1";
  const includeInternal = forcePublic ? false : access.allowed;
  const filters = { ...parseFilters(req.query, req), version: versionId };
  const filtered = filterCatalog(filters)[0];
  const entry = sanitizeForAudience(filtered || getVersion(versionId), {
    includeInternal,
  });

  res.status(200).type("html").send(
    renderReleaseNotesView(
      "version",
      buildLocals(req, env, {
        page: "version",
        panel,
        entry,
        versionId,
        filters,
        includeInternal,
        accessVia: forcePublic ? null : access.via,
        audience: includeInternal ? "internal" : "public",
        productContext: filters.productContext,
        printMode:
          section === "print" ||
          String((req.query && req.query.print) || "") === "1",
      })
    )
  );
  return true;
}

/**
 * Express middleware for BlessBoard / ActiveClinic product hosts (session available).
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   getPool?: () => { query: Function }|null,
 *   isApexHost?: (req: import('express').Request) => boolean,
 * }} [opts]
 */
function createReleaseNotesMiddleware(opts) {
  const options = opts || {};
  const env = options.env || process.env;
  return async function releaseNotesMiddleware(req, res, next) {
    try {
      if (!String(req.path || "").startsWith("/release-notes")) {
        return next();
      }
      if (typeof options.isApexHost === "function" && !options.isApexHost(req)) {
        return next();
      }
      const handled = await tryHandleReleaseNotesRequest(req, res, {
        env,
        getPool: options.getPool,
      });
      if (handled) return undefined;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = {
  tryHandleReleaseNotesRequest,
  createReleaseNotesMiddleware,
  parseFilters,
  buildLocals,
  resolveRequestProductFilter,
};
