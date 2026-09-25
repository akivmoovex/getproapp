"use strict";

/**
 * Release Notes Center request handler for the platform QA hub.
 */

const {
  listVersions,
  getVersion,
  normalizeVersion,
  filterCatalog,
  sanitizeForAudience,
  filterOptions,
  isReleaseNotesCenterAllowed,
  canAccessInternalReleaseNotes,
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
  const includeInternal = canAccessInternalReleaseNotes(req, env);
  return {
    title: "GetPro Release Notes Center",
    hubBrand: "GetPro Unified Platform",
    versionOrder: VERSION_ORDER,
    filterOptions: filterOptions(),
    filters: parseFilters(req.query),
    includeInternal,
    audience: includeInternal ? "internal" : "public",
    stitchStatus:
      "DOCUMENTATION PENDING — no approved Stitch Release Notes Center project found in account inventory (2026-09-25).",
    assetVersion: "v2-01-rnc-1",
    ...(extra || {}),
  };
}

/**
 * Handle /release-notes* on the platform QA hub.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{ env?: NodeJS.ProcessEnv }} [opts]
 * @returns {boolean} true if handled
 */
function tryHandleReleaseNotesRequest(req, res, opts) {
  const env = (opts && opts.env) || process.env;
  const pathName = String(req.path || "");
  if (!pathName.startsWith("/release-notes")) return false;

  if (!isReleaseNotesCenterAllowed(env)) {
    res.status(404).json({ ok: false, code: "not_found" });
    return true;
  }

  if (pathName === "/release-notes" || pathName === "/release-notes/") {
    const filters = parseFilters(req.query);
    const includeInternal = canAccessInternalReleaseNotes(req, env);
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
  const includeInternal = forcePublic
    ? false
    : canAccessInternalReleaseNotes(req, env);
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
        audience: includeInternal ? "internal" : "public",
        printMode:
          section === "print" ||
          String((req.query && req.query.print) || "") === "1",
      })
    )
  );
  return true;
}

module.exports = {
  tryHandleReleaseNotesRequest,
  parseFilters,
  buildLocals,
};
