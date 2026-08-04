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
function sendClinicResolveFailure(res, result, deps) {
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
  const result = await resolvePublishableClinicByKey(getPool(), {
    clinicKey: req.params.clinicKey,
  });
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
