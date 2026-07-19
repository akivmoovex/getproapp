"use strict";

/**
 * Apex marketing routes (Batch 2b + BB-MT-001 register-church POST).
 * Flag-gated instant Free provisioning via provisionRegisteredBlessBoardChurch.
 */

const express = require("express");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const directoryRepo = require("../../db/pg/church/publicChurchDirectoryRepo");
const {
  renderFeaturesPage,
  renderForChurchesPage,
  renderPricingPage,
  renderDirectoryPage,
  renderRegisterChurchPage,
} = require("./renderApexMarketing");
const { renderTermsPage, renderPrivacyPage } = require("./renderApexLegal");
const {
  CSRF_COOKIE,
  CSRF_FIELD,
  issueCsrfToken,
  setCsrfCookie,
  validateCsrf,
} = require("../../platform/http/v5Csrf");
const {
  normalizeSelectedPlan,
  validatePlatformChurchRegistration,
  formFromBody,
  FREE_PLAN_CODE,
} = require("../services/platformChurchRegistrationValidation");
const {
  submitPlatformChurchRegistration,
  submitInstantFreeChurchRegistration,
  GENERIC_SAVE_ERROR,
  DUPLICATE_REVIEW_MESSAGE,
} = require("../services/platformChurchRegistrationService");
const {
  isInstantFreeProvisioningEnabled,
} = require("../config/instantFreeProvisioningEnabled");
const { establishBlessBoardSession } = require("../services/establishBlessBoardSession");
const {
  setV5SessionCookie,
} = require("../../platform/session/v5SessionCookie");
const { resolveHostname } = require("../../platform/host");

const REGISTER_PATH = "/register-church";
const ACCOUNT_PATH = "/account";
const LOGIN_PATH = "/login";

const CSRF_FORM_ERROR =
  "Invalid or missing security token. Reload the registration form and try again.";

/**
 * Prevent CDN/browser from caching HTML that embeds a one-time CSRF token.
 * @param {import('express').Response} res
 */
function setRegisterNoStoreHeaders(res) {
  res.setHeader("Cache-Control", "private, no-store, no-cache, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Surrogate-Control", "no-store");
  res.setHeader("Vary", "Cookie");
}

/**
 * Safe CSRF diagnostics — enabled only when BLESSBOARD_CSRF_DIAG=1.
 * Never logs secrets, tokens, cookies, or form payloads.
 * @param {import('express').Request} req
 * @param {object} env
 * @param {string} outcome
 */
function logCsrfDiag(req, env, outcome) {
  if (String((env && env.BLESSBOARD_CSRF_DIAG) || "") !== "1") return;
  const host = String(resolveHostname(req) || "")
    .trim()
    .toLowerCase()
    .split(":")[0];
  const cookiePresent = Boolean(req.cookies && req.cookies[CSRF_COOKIE]);
  const bodyPresent = Boolean(req.body && req.body[CSRF_FIELD]);
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      event: "blessboard_csrf_diag",
      requestId: req.requestId || null,
      method: req.method,
      path: REGISTER_PATH,
      host,
      secure: Boolean(req.secure),
      sessionCookiePresent: Boolean(req.cookies && req.cookies.blessboard_org_v5_sid),
      csrfCookiePresent: cookiePresent,
      csrfBodyFieldPresent: bodyPresent,
      csrfFieldName: CSRF_FIELD,
      outcome,
    })
  );
}

function logSessionEstablishFailure(req, errStatus) {
  // eslint-disable-next-line no-console
  console.error(
    "[blessboard-church-registration]",
    JSON.stringify({
      event: "instant_free_session_establish_failed",
      requestId: (req && req.requestId) || null,
      status: errStatus || "session_failed",
    })
  );
}

function clientIp(req) {
  return String((req && (req.ip || (req.connection && req.connection.remoteAddress))) || "").slice(
    0,
    64
  );
}

function rateLimitKey(req) {
  const ip = clientIp(req) || "unknown";
  const email = String((req.body && req.body.email) || "")
    .trim()
    .toLowerCase()
    .slice(0, 254);
  if (!email) return ip;
  const digest = crypto.createHash("sha256").update(`${ip}|${email}`).digest("hex").slice(0, 32);
  return digest;
}

/**
 * @param {{
 *   getPool: () => import('pg').Pool,
 *   isApexHost: (req: import('express').Request) => boolean,
 *   issueCsrfToken: (env: object) => string,
 *   setCsrfCookie: (res: import('express').Response, token: string, opts: object) => void,
 *   env: object,
 *   isProduction: boolean,
 *   establishSession?: typeof establishBlessBoardSession,
 *   provisionFn?: Function,
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
  const establishSession = deps.establishSession || establishBlessBoardSession;
  const provisionFn = deps.provisionFn || null;
  const dataEnvironment = String(env.PLATFORM_DATA_ENVIRONMENT || env.DATA_ENVIRONMENT || "testing")
    .trim()
    .toLowerCase();
  const deploymentCode = String(env.PLATFORM_DEPLOYMENT_CODE || "blessboard-org-v5")
    .trim()
    .toLowerCase();

  function issueAndSetCsrf(res) {
    const csrfToken = issueToken(env);
    setCookie(res, csrfToken, { secure: isProduction });
    return csrfToken;
  }

  function instantEnabled() {
    // Server flag only — ignore query/body overrides.
    return isInstantFreeProvisioningEnabled(env);
  }

  const registerFormLimiter = rateLimit({
    windowMs: Number(env.GETPRO_PLATFORM_FORM_RATE_WINDOW_MS) || 15 * 60 * 1000,
    limit: Number(env.GETPRO_PLATFORM_FORM_RATE_MAX) || 12,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: rateLimitKey,
    handler: (req, res) => {
      setRegisterNoStoreHeaders(res);
      const csrfToken = issueAndSetCsrf(res);
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
          showCsrfRetry: false,
          instantFreeEnabled: instantEnabled(),
        })
      );
    },
  });

  function withShell(req, res, renderFn, extra = {}) {
    if (!isApexHost(req)) {
      return res.status(404).type("text").send("Not found");
    }
    const authenticated = Boolean(req.v5Session && req.v5Session.authenticated);
    const alwaysPassCsrf = Boolean(extra.alwaysPassCsrf);
    const csrfToken = issueAndSetCsrf(res);
    const passCsrf = authenticated || alwaysPassCsrf;
    if (extra.noStore) {
      setRegisterNoStoreHeaders(res);
    }
    // Apply csrfToken after ...extra so callers cannot overwrite it with null.
    const { alwaysPassCsrf: _drop, noStore: _dropStore, ...renderExtra } = extra;
    return res.status(200).type("html").send(
      renderFn({
        authenticated,
        csrfField: CSRF_FIELD,
        instantFreeEnabled: instantEnabled(),
        ...renderExtra,
        csrfToken: passCsrf ? csrfToken : null,
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
    const workspaceReady = String((req.query && req.query.ready) || "") === "1";
    const loginFallback = String((req.query && req.query.login) || "") === "1";
    const review = String((req.query && req.query.review) || "") === "1";
    return withShell(req, res, renderRegisterChurchPage, {
      alwaysPassCsrf: true,
      noStore: true,
      submitted,
      workspaceReady,
      loginFallback,
      review,
      organizationKeyPreview: String((req.query && req.query.key) || "")
        .trim()
        .slice(0, 64),
      formError: null,
      form: formFromBody({}, { selectedPlanHint: selectedPlan }),
      fieldError: null,
      selectedPlan,
      showCsrfRetry: false,
    });
  });

  router.post(REGISTER_PATH, registerFormLimiter, async (req, res, next) => {
    try {
      if (!isApexHost(req)) {
        return res.status(404).type("text").send("Not found");
      }

      setRegisterNoStoreHeaders(res);

      const authenticated = Boolean(req.v5Session && req.v5Session.authenticated);
      const selectedPlanHint = normalizeSelectedPlan(req.query && req.query.plan);
      const body = req.body || {};
      const flagOn = instantEnabled();

      function renderForm(status, extras) {
        // Always issue a fresh cookie+field pair after failed attempts so Back/retry works.
        const csrfToken = issueAndSetCsrf(res);
        return res.status(status).type("html").send(
          renderRegisterChurchPage({
            authenticated,
            csrfToken,
            csrfField: CSRF_FIELD,
            submitted: false,
            form: formFromBody(body, { selectedPlanHint }),
            selectedPlan:
              normalizeSelectedPlan(body.selected_plan) || selectedPlanHint || null,
            showCsrfRetry: false,
            instantFreeEnabled: flagOn,
            ...extras,
          })
        );
      }

      // Validate against the request cookie BEFORE rotating the CSRF cookie.
      if (!validateCsrf(req, body[CSRF_FIELD], env)) {
        logCsrfDiag(req, env, "reject");
        return renderForm(403, {
          formError: CSRF_FORM_ERROR,
          fieldError: null,
          showCsrfRetry: true,
        });
      }
      logCsrfDiag(req, env, "accept");

      const validation = validatePlatformChurchRegistration(body, {
        selectedPlanHint,
        instantFreeEnabled: flagOn,
      });
      if (!validation.ok) {
        return renderForm(400, {
          formError: validation.error,
          fieldError: validation.field || null,
        });
      }

      const wantsInstant =
        flagOn &&
        validation.data &&
        validation.data.wants_instant_free &&
        validation.data.selected_plan === FREE_PLAN_CODE;

      if (!wantsInstant) {
        const result = await submitPlatformChurchRegistration(getPool(), req, validation);
        if (!result.ok) {
          return renderForm(503, {
            formError: result.error || GENERIC_SAVE_ERROR,
            fieldError: null,
          });
        }
        issueAndSetCsrf(res);
        return res.redirect(303, `${REGISTER_PATH}?submitted=1`);
      }

      const result = await submitInstantFreeChurchRegistration(getPool(), req, validation, {
        dataEnvironment,
        deploymentCode,
        provisionFn: provisionFn || undefined,
      });

      if (result.honeypot) {
        issueAndSetCsrf(res);
        return res.redirect(303, `${REGISTER_PATH}?submitted=1`);
      }

      if (!result.ok) {
        if (result.review) {
          issueAndSetCsrf(res);
          return res.redirect(303, `${REGISTER_PATH}?review=1`);
        }
        if (result.inProgress) {
          return renderForm(200, {
            formError: result.error || IN_PROGRESS_SAFE,
            fieldError: null,
          });
        }
        if (result.field) {
          return renderForm(result.httpStatus || 400, {
            formError: result.error,
            fieldError: result.field,
          });
        }
        return renderForm(result.httpStatus || 503, {
          formError: result.error || GENERIC_SAVE_ERROR,
          fieldError: null,
        });
      }

      // Provisioning committed — establish session (never roll back the tenant).
      // Issue a new opaque V5 session token (replaces any prior cookie value).
      const records = result.records || {};
      const orgKey = records.organizationKey || validation.data.organization_key || "";
      let sessionOk = false;
      try {
        const sessionResult = await establishSession(getPool(), {
          userId: records.administratorUserId,
          deploymentCode,
          organizationId: records.organizationId,
          churchId: records.churchId,
          branchId: records.branchId,
          ip: clientIp(req),
          userAgent: (req.get && req.get("user-agent")) || null,
        });
        if (sessionResult.ok && sessionResult.rawToken) {
          setV5SessionCookie(res, sessionResult.rawToken, { secure: isProduction, env });
          sessionOk = true;
        } else {
          logSessionEstablishFailure(req, sessionResult && sessionResult.status);
        }
      } catch (sessionErr) {
        logSessionEstablishFailure(
          req,
          sessionErr && sessionErr.message ? String(sessionErr.message).slice(0, 80) : "exception"
        );
      }

      issueAndSetCsrf(res);

      if (sessionOk) {
        // Interim destination until Phase 7 /portal/:organizationKey resolver.
        return res.redirect(303, ACCOUNT_PATH);
      }

      const keyQ = orgKey ? `&key=${encodeURIComponent(orgKey)}` : "";
      return res.redirect(
        303,
        `${REGISTER_PATH}?ready=1&login=1${keyQ}&next=${encodeURIComponent(ACCOUNT_PATH)}`
      );
    } catch (err) {
      return next(err);
    }
  });

  router.get("/directory", async (req, res) => {
    if (!isApexHost(req)) {
      return res.status(404).type("text").send("Not found");
    }
    const authenticated = Boolean(req.v5Session && req.v5Session.authenticated);
    const csrfToken = issueAndSetCsrf(res);

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

const IN_PROGRESS_SAFE =
  "Your registration is already being completed. Please wait a moment, then sign in if your workspace is ready.";

module.exports = {
  createApexMarketingRouter,
  REGISTER_PATH,
  ACCOUNT_PATH,
  LOGIN_PATH,
  DUPLICATE_REVIEW_MESSAGE,
};
