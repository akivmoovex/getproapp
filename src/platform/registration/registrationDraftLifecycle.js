"use strict";

/**
 * Registration draft continuity vs fresh load (BlessBoard + ActiveClinic).
 *
 * Policy (V2.04 multi-step form state):
 * - Valid in-window draft cookies hydrate on GET (including refresh/back).
 * - gpRegNav=1 remains a compatibility marker for outbound links; not required to restore.
 * - Explicit ?fresh=1 (or action=restart) clears draft + vault (via transaction wrapper).
 */

const { stripSecretKeys, DEFAULT_SECRET_KEYS } = require("./multiStepDraftMerge");

const REGISTRATION_NAV_PARAM = "gpRegNav";
const REGISTRATION_FRESH_PARAM = "fresh";

const PASSWORD_FIELDS = Object.freeze([...DEFAULT_SECRET_KEYS]);

/**
 * @param {import('express').Request|{ query?: object }|null|undefined} reqOrQuery
 */
function queryFrom(reqOrQuery) {
  if (reqOrQuery && reqOrQuery.query) return reqOrQuery.query;
  if (reqOrQuery && typeof reqOrQuery === "object") return reqOrQuery;
  return {};
}

/**
 * @param {import('express').Request|{ query?: object }|null|undefined} reqOrQuery
 */
function isRegistrationContinuityRequest(reqOrQuery) {
  return String(queryFrom(reqOrQuery)[REGISTRATION_NAV_PARAM] || "").trim() === "1";
}

/**
 * Explicit restart — clears draft (not implied by bare GET).
 * @param {import('express').Request|{ query?: object, body?: object }|null|undefined} req
 */
function isRegistrationFreshStartRequest(req) {
  const query = queryFrom(req);
  if (String(query[REGISTRATION_FRESH_PARAM] || "").trim() === "1") return true;
  const body = req && req.body && typeof req.body === "object" ? req.body : {};
  const action = String(body.action || "")
    .trim()
    .toLowerCase();
  return action === "restart" || action === "fresh";
}

/**
 * Append gpRegNav=1 to an internal registration href (compat + outbound return links).
 * @param {string} href
 */
function withRegistrationNavParam(href) {
  const raw = String(href || "").trim();
  if (!raw || !raw.startsWith("/")) return raw || "/";
  const qIndex = raw.indexOf("?");
  const path = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
  const params = new URLSearchParams(qIndex >= 0 ? raw.slice(qIndex + 1) : "");
  params.set(REGISTRATION_NAV_PARAM, "1");
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/**
 * Strip password fields from restored draft payloads.
 * @param {object|null|undefined} formData
 */
function sanitizeRegistrationDraftFormData(formData) {
  return stripSecretKeys(formData, PASSWORD_FIELDS);
}

/**
 * @param {{
 *   req: import('express').Request,
 *   res: import('express').Response,
 *   isProduction: boolean,
 *   clearDraft: (res: import('express').Response, opts: { isProduction: boolean }) => void,
 *   readDraft: (req: import('express').Request, env: NodeJS.ProcessEnv) => object|null,
 *   env: NodeJS.ProcessEnv,
 * }} input
 */
function resolveRegistrationDraftForGet(input) {
  const { req, res, isProduction, clearDraft, readDraft, env } = input;

  if (isRegistrationFreshStartRequest(req)) {
    clearDraft(res, { isProduction });
    return {
      restoreDraft: false,
      draft: null,
      formData: null,
      cleared: true,
    };
  }

  const draft = readDraft(req, env);
  if (draft && draft.status === "completed") {
    clearDraft(res, { isProduction });
    return {
      restoreDraft: false,
      draft: null,
      formData: null,
      cleared: true,
    };
  }

  if (draft && draft.formData && typeof draft.formData === "object") {
    return {
      restoreDraft: true,
      draft,
      formData: sanitizeRegistrationDraftFormData(draft.formData),
      cleared: false,
    };
  }

  return {
    restoreDraft: false,
    draft: null,
    formData: null,
    cleared: false,
  };
}

module.exports = {
  REGISTRATION_NAV_PARAM,
  REGISTRATION_FRESH_PARAM,
  PASSWORD_FIELDS,
  isRegistrationContinuityRequest,
  isRegistrationFreshStartRequest,
  withRegistrationNavParam,
  sanitizeRegistrationDraftFormData,
  resolveRegistrationDraftForGet,
};
