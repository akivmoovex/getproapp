"use strict";

/**
 * Release Notes Center request handler (QA hub + BlessBoard apex).
 */

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
} = require("./releaseNotesService");
const { renderReleaseNotesView } = require("./renderReleaseNotes");

/**
 * @param {import('express').Request} req
 * @returns {object}
 */
function parseFilters(query) {
  const q = query || {};
  return {
    version: q.version || "",
    product: q.product || "",
    featureType: q.featureType || "",
    implementationStatus: q.implementationStatus || "",
    qaStatus: q.qaStatus || "",
    severity: q.severity || "",
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
  return {
    title: "GetPro Release Notes Center",
    hubBrand: "GetPro Unified Platform",
    versionOrder: VERSION_ORDER,
    filterOptions: filterOptions(),
    filters: parseFilters(req.query),
    includeInternal,
    accessVia,
    audience: includeInternal ? "internal" : "public",
    stitchStatus:
      "DOCUMENTATION PENDING — no approved Stitch Release Notes Center project found in account inventory (2026-09-25).",
    assetVersion: "v2-01-rnc-2",
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
    const filters = parseFilters(req.query);
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
          includeInternal,
          accessVia: access.via,
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
  const filters = { ...parseFilters(req.query), version: versionId };
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
        includeInternal,
        accessVia: forcePublic ? null : access.via,
        audience: includeInternal ? "internal" : "public",
        printMode:
          section === "print" ||
          String((req.query && req.query.print) || "") === "1",
      })
    )
  );
  return true;
}

/**
 * Express middleware for BlessBoard apex (session available).
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
};
