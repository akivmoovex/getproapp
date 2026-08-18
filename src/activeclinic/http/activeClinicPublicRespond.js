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
function sendClinicNotFound(res, deps) {
  const csrfToken = deps.issuePageCsrf(res, deps.env, deps.isProduction);
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
  const csrfToken = deps.issuePageCsrf(res, deps.env, deps.isProduction);
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
  const csrfToken = deps.issuePageCsrf(res, deps.env, deps.isProduction);
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
  resolveClinicOrRespond,
};
