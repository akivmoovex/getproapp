"use strict";

/**
 * Render helpers for ActiveClinic public tenant resolve failures (P22).
 */

const {
  resolvePublishableClinicByKey,
  RESULT,
} = require("../services/activeClinicPublicVisibilityService");
const { renderPublicPage } = require("./renderActiveClinicPublic");

/**
 * @param {import('express').Response} res
 * @param {{ env: NodeJS.ProcessEnv, isProduction: boolean, issuePageCsrf: Function }} deps
 */
function pageCsrfToken(res, deps) {
  if (deps && typeof deps.issuePageCsrf === "function") {
    return deps.issuePageCsrf(res, deps.env, deps.isProduction);
  }
  return "";
}

function clinicResolveFailurePayload(result) {
  const code = result && result.code ? String(result.code) : RESULT.NOT_FOUND;
  if (code === RESULT.WEBSITE_OFFLINE) {
    return { status: 403, code: RESULT.WEBSITE_OFFLINE };
  }
  if (code === RESULT.WEBSITE_SUSPENDED) {
    return { status: 403, code: RESULT.WEBSITE_SUSPENDED };
  }
  if (code === RESULT.NOT_PUBLISHED) {
    return { status: 403, code: RESULT.NOT_PUBLISHED };
  }
  return { status: 404, code: RESULT.NOT_FOUND };
}

function sendClinicNotFound(res, deps) {
  const csrfToken = pageCsrfToken(res, deps);
  return res.status(404).type("html").send(renderPublicPage({
    pageId: "tenant-clinic-not-found",
    pageTitle: "Clinic not found",
    contentTemplate: "tenant/clinic-not-found",
    shellVariant: "platform",
    locals: { csrfToken },
  }));
}

/**
 * @param {import('express').Response} res
 * @param {{ env: NodeJS.ProcessEnv, isProduction: boolean, issuePageCsrf: Function }} deps
 */
function sendClinicUnavailable(res, deps) {
  const csrfToken = pageCsrfToken(res, deps);
  return res.status(403).type("html").send(renderPublicPage({
    pageId: "tenant-clinic-unavailable",
    pageTitle: "Clinic unavailable",
    contentTemplate: "tenant/clinic-unavailable",
    shellVariant: "platform",
    locals: { csrfToken },
  }));
}

/**
 * @param {import('express').Response} res
 * @param {{ ok: boolean, code: string }} result
 * @param {{ env: NodeJS.ProcessEnv, isProduction: boolean, issuePageCsrf: Function }} deps
 */
function sendClinicWebsiteOffline(res, deps, kind) {
  const csrfToken = pageCsrfToken(res, deps);
  const suspended = kind === "suspended";
  return res.status(403).type("html").send(renderPublicPage({
    pageId: suspended ? "tenant-clinic-website-suspended" : "tenant-clinic-website-offline",
    pageTitle: suspended ? "Website suspended" : "Website offline",
    contentTemplate: suspended ? "tenant/clinic-website-suspended" : "tenant/clinic-website-offline",
    shellVariant: "platform",
    locals: { csrfToken },
  }));
}

function sendClinicResolveFailure(res, result, deps) {
  if (result.code === RESULT.WEBSITE_OFFLINE) {
    return sendClinicWebsiteOffline(res, deps, "offline");
  }
  if (result.code === RESULT.WEBSITE_SUSPENDED) {
    return sendClinicWebsiteOffline(res, deps, "suspended");
  }
  if (result.code === RESULT.NOT_PUBLISHED) {
    return sendClinicUnavailable(res, deps);
  }
  return sendClinicNotFound(res, deps);
}

/**
 * JSON/API clinic resolve failure. Does not require page CSRF helpers.
 * Maps to the same status/code policy as the HTML public pages.
 */
function sendClinicResolveFailureJson(res, result) {
  const mapped = clinicResolveFailurePayload(result);
  return res.status(mapped.status).json({ ok: false, code: mapped.code });
}

function isWebsiteApiRequest(req) {
  const path = String((req && (req.path || req.originalUrl)) || "");
  if (req && req.method === "GET" && /\/website\/preview\/?$/.test(path.split("?")[0])) {
    return false;
  }
  return /\/website\//.test(path);
}

/**
 * Resolve publishable clinic or send not-found / unavailable response.
 * @returns {Promise<object|null>} clinic DTO or null when response already sent
 */
async function resolveClinicOrRespond(getPool, req, res, deps) {
  const pool = getPool();
  let result = await resolvePublishableClinicByKey(pool, {
    clinicKey: req.params.clinicKey,
  });
  if (
    !result.ok &&
    (result.code === RESULT.NOT_PUBLISHED ||
      result.code === RESULT.WEBSITE_OFFLINE ||
      result.code === RESULT.WEBSITE_SUSPENDED)
  ) {
    const unpublished = await resolvePublishableClinicByKey(pool, {
      clinicKey: req.params.clinicKey,
      allowUnpublished: true,
    });
    if (unpublished.ok) {
      const { canEditClinicWebsite } = require("./attachActiveClinicWebsiteChrome");
      if (canEditClinicWebsite(req, unpublished.clinic)) {
        result = unpublished;
      }
    }
  }
  if (!result.ok) {
    sendClinicResolveFailure(res, result, deps);
    return null;
  }
  return result.clinic;
}

module.exports = {
  RESULT,
  sendClinicNotFound,
  sendClinicUnavailable,
  sendClinicResolveFailure,
  sendClinicResolveFailureJson,
  clinicResolveFailurePayload,
  isWebsiteApiRequest,
  resolveClinicOrRespond,
};
