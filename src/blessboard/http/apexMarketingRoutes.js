"use strict";

/**
 * Apex marketing routes (Batch 2b + BB-MT-001 register-church POST).
 * Registration creates a pending application only — no provisioning.
 */

const express = require("express");
const rateLimit = require("express-rate-limit");
const directoryRepo = require("../../db/pg/church/publicChurchDirectoryRepo");
const {
  renderFeaturesPage,
  renderForChurchesPage,
  renderPricingPage,
  renderDirectoryPage,
  renderRegisterChurchPage,
} = require("./renderApexMarketing");
const { renderTermsPage, renderPrivacyPage } = require("./renderApexLegal");
const { CSRF_FIELD, issueCsrfToken, setCsrfCookie, validateCsrf } = require("../../platform/http/v5Csrf");
const {
  normalizeSelectedPlan,
  validatePlatformChurchRegistration,
  formFromBody,
} = require("../services/platformChurchRegistrationValidation");
const {
  submitPlatformChurchRegistration,
  GENERIC_SAVE_ERROR,
} = require("../services/platformChurchRegistrationService");

const REGISTER_PATH = "/register-church";

/**
 * @param {{
 *   getPool: () => import('pg').Pool,
 *   isApexHost: (req: import('express').Request) => boolean,
 *   issueCsrfToken: (env: object) => string,
 *   setCsrfCookie: (res: import('express').Response, token: string, opts: object) => void,
 *   env: object,
 *   isProduction: boolean,
 * }} deps
 */
function createApexMarketingRouter(deps) {
  const router = express.Router();
  const getPool = deps.getPool;
  const isApexHost = deps.isApexHost;
  const issueToken = deps.issueCsrfToken || issueCsrfToken;
  const setCookie = deps.setCsrfCookie || setCsrfCookie;
  const env = deps.env || {};
  const isProduction = Boolean(deps.isProduction);

  const registerFormLimiter = rateLimit({
    windowMs: Number(env.GETPRO_PLATFORM_FORM_RATE_WINDOW_MS) || 15 * 60 * 1000,
    limit: Number(env.GETPRO_PLATFORM_FORM_RATE_MAX) || 12,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      const csrfToken = issueToken(env);
      setCookie(res, csrfToken, { secure: isProduction });
      return res.status(429).type("html").send(
        renderRegisterChurchPage({
          authenticated: Boolean(req.v5Session && req.v5Session.authenticated),
          csrfToken,
          csrfField: CSRF_FIELD,
          submitted: false,
          formError: "Too many submissions from this network. Please wait a few minutes and try again.",
          form: formFromBody(req.body || {}),
          fieldError: null,
          selectedPlan: normalizeSelectedPlan(req.body && req.body.selected_plan),
        })
      );
    },
  });

  function withShell(req, res, renderFn, extra = {}) {
    if (!isApexHost(req)) {
      return res.status(404).type("text").send("Not found");
    }
    const authenticated = Boolean(req.v5Session && req.v5Session.authenticated);
    const csrfToken = issueToken(env);
    setCookie(res, csrfToken, { secure: isProduction });
    const alwaysPassCsrf = Boolean(extra.alwaysPassCsrf);
    return res.status(200).type("html").send(
      renderFn({
        authenticated,
        csrfToken: authenticated || alwaysPassCsrf ? csrfToken : null,
        csrfField: CSRF_FIELD,
        ...extra,
      })
    );
  }

  router.get("/features", (req, res) => withShell(req, res, renderFeaturesPage));
  router.get("/for-churches", (req, res) => withShell(req, res, renderForChurchesPage));
  router.get("/pricing", (req, res) => withShell(req, res, renderPricingPage));
  router.get("/terms", (req, res) => withShell(req, res, renderTermsPage));
  router.get("/privacy", (req, res) => withShell(req, res, renderPrivacyPage));

  router.get(REGISTER_PATH, (req, res) => {
    const selectedPlan = normalizeSelectedPlan(req.query && req.query.plan);
    const submitted = String((req.query && req.query.submitted) || "") === "1";
    return withShell(req, res, renderRegisterChurchPage, {
      alwaysPassCsrf: true,
      submitted,
      formError: null,
      form: formFromBody({}, { selectedPlanHint: selectedPlan }),
      fieldError: null,
      selectedPlan,
    });
  });

  router.post(REGISTER_PATH, registerFormLimiter, async (req, res, next) => {
    try {
      if (!isApexHost(req)) {
        return res.status(404).type("text").send("Not found");
      }

      const authenticated = Boolean(req.v5Session && req.v5Session.authenticated);
      const selectedPlanHint = normalizeSelectedPlan(req.query && req.query.plan);
      const body = req.body || {};
      const csrfToken = issueToken(env);
      setCookie(res, csrfToken, { secure: isProduction });

      function renderForm(status, extras) {
        return res.status(status).type("html").send(
          renderRegisterChurchPage({
            authenticated,
            csrfToken,
            csrfField: CSRF_FIELD,
            submitted: false,
            form: formFromBody(body, { selectedPlanHint }),
            selectedPlan:
              normalizeSelectedPlan(body.selected_plan) || selectedPlanHint || null,
            ...extras,
          })
        );
      }

      if (!validateCsrf(req, body[CSRF_FIELD], env)) {
        return renderForm(403, {
          formError: "Invalid or missing CSRF token. Please try again.",
          fieldError: null,
        });
      }

      const validation = validatePlatformChurchRegistration(body, {
        selectedPlanHint,
      });
      if (!validation.ok) {
        return renderForm(400, {
          formError: validation.error,
          fieldError: validation.field || null,
        });
      }

      const result = await submitPlatformChurchRegistration(getPool(), req, validation);
      if (!result.ok) {
        return renderForm(503, {
          formError: result.error || GENERIC_SAVE_ERROR,
          fieldError: null,
        });
      }

      return res.redirect(303, `${REGISTER_PATH}?submitted=1`);
    } catch (err) {
      return next(err);
    }
  });

  router.get("/directory", async (req, res) => {
    if (!isApexHost(req)) {
      return res.status(404).type("text").send("Not found");
    }
    const authenticated = Boolean(req.v5Session && req.v5Session.authenticated);
    const csrfToken = issueToken(env);
    setCookie(res, csrfToken, { secure: isProduction });

    const q = directoryRepo.normalizeSearchQuery(req.query && req.query.q);
    const page = Number(req.query && req.query.page) || 1;
    let results = { items: [], total: 0, page: 1, limit: directoryRepo.DEFAULT_PAGE_SIZE, totalPages: 0, q };
    let directoryUnavailable = false;

    try {
      const pool = getPool();
      if (pool) {
        results = await directoryRepo.searchPublicOrganizations(pool, { q, page });
      } else {
        directoryUnavailable = true;
      }
    } catch (_err) {
      directoryUnavailable = true;
      results = { items: [], total: 0, page: 1, limit: directoryRepo.DEFAULT_PAGE_SIZE, totalPages: 0, q };
    }

    return res.status(200).type("html").send(
      renderDirectoryPage({
        authenticated,
        csrfToken: authenticated ? csrfToken : null,
        results,
        directoryUnavailable,
      })
    );
  });

  return router;
}

module.exports = {
  createApexMarketingRouter,
  REGISTER_PATH,
};
