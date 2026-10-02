"use strict";

/**
 * Registration draft continuity vs fresh load (BlessBoard + ActiveClinic).
 * Fresh GET clears httpOnly draft cookies unless gpRegNav marks intentional return.
 */

const REGISTRATION_NAV_PARAM = "gpRegNav";

const PASSWORD_FIELDS = Object.freeze([
  "password",
  "password_confirm",
  "passwordConfirm",
]);

/**
 * @param {import('express').Request|{ query?: object }|null|undefined} reqOrQuery
 */
function isRegistrationContinuityRequest(reqOrQuery) {
  const query =
    reqOrQuery && reqOrQuery.query
      ? reqOrQuery.query
      : reqOrQuery && typeof reqOrQuery === "object"
        ? reqOrQuery
        : {};
  return String(query[REGISTRATION_NAV_PARAM] || "").trim() === "1";
}

/**
 * Append gpRegNav=1 to an internal registration href.
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
  if (!formData || typeof formData !== "object") return {};
  const out = { ...formData };
  for (const key of PASSWORD_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(out, key)) {
      delete out[key];
    }
  }
  return out;
}

/**
 * @param {{
 *   req: import('express').Request,
 *   res: import('express').Response,
 *   isProduction: boolean,
 *   clearDraft: (res: import('express').Response, opts: { isProduction: boolean }) => void,
 *   readDraft: (req: import('express').Request, env: NodeJS.ProcessEnv) => { formData?: object }|null,
 *   env: NodeJS.ProcessEnv,
 * }} input
 */
function resolveRegistrationDraftForGet(input) {
  const { req, res, isProduction, clearDraft, readDraft, env } = input;
  if (isRegistrationContinuityRequest(req)) {
    const draft = readDraft(req, env);
    return {
      restoreDraft: true,
      draft,
      formData: sanitizeRegistrationDraftFormData(draft && draft.formData),
    };
  }

  clearDraft(res, { isProduction });
  return {
    restoreDraft: false,
    draft: null,
    formData: null,
  };
}

module.exports = {
  REGISTRATION_NAV_PARAM,
  PASSWORD_FIELDS,
  isRegistrationContinuityRequest,
  withRegistrationNavParam,
  sanitizeRegistrationDraftFormData,
  resolveRegistrationDraftForGet,
};
