"use strict";

const rateLimit = require("express-rate-limit");
const {
  CSRF_FIELD,
  issueCsrfToken,
  setCsrfCookie,
  validateCsrf,
} = require("../../platform/http/v5Csrf");
const {
  submitPublicChurchEnquiry,
} = require("../services/publicChurchContactService");

function createPublicChurchContactLimiter() {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 8,
    standardHeaders: true,
    legacyHeaders: false,
  });
}

function attachPublicChurchContactForm(req, res, model, env) {
  if (!model || model.pageKey !== "contact") return;
  const runtimeEnv = env || process.env;
  const token = issueCsrfToken(runtimeEnv);
  setCsrfCookie(res, token, {
    secure: String(runtimeEnv.NODE_ENV || "") === "production",
    env: runtimeEnv,
    req,
  });
  model.csrfToken = token;
  model.csrfField = CSRF_FIELD;
  const draft = req.publicContactDraft || null;
  model.contactSubmitted =
    !draft && String((req.query && req.query.submitted) || "") === "1";
  model.contactError = draft && draft.error ? String(draft.error) : null;
  const form = (draft && draft.form) || {};
  model.contactForm = {
    full_name: String(form.full_name || form.contact_name || ""),
    email: String(form.email || form.contact_email || ""),
    phone: String(form.phone || form.contact_phone || ""),
    message: String(form.message || form.contact_message || ""),
  };
}

async function acceptPublicChurchContact(req, res, input) {
  const source = input || {};
  const env = source.env || process.env;
  const body = req.body || {};
  if (!validateCsrf(req, body[CSRF_FIELD], env)) {
    req.publicContactDraft = {
      error: "Your session expired. Refresh the page and send the message again.",
      form: body,
    };
    req.publicContactStatus = 403;
    return { ok: false, status: 403 };
  }
  const result = await submitPublicChurchEnquiry(
    source.pool,
    {
      organizationId: source.organizationId,
      churchId: source.churchId,
      branchId: source.branchId,
    },
    body
  );
  if (!result.ok) {
    req.publicContactDraft = { error: result.error, form: body };
    req.publicContactStatus = result.status || 400;
    return { ok: false, status: result.status || 400 };
  }
  return { ok: true };
}

module.exports = {
  createPublicChurchContactLimiter,
  attachPublicChurchContactForm,
  acceptPublicChurchContact,
};
