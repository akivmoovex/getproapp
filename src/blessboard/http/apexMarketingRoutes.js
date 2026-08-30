"use strict";

/**
 * Apex marketing routes (Batch 2b + BB-MT-001 register-church POST).
 * Automatic Foundation + Growth trial provisioning (default on; emergency env switch)
 * via submitChurchRegistration (shared platform.registration engine).
 * Network is support-contact only (no auto tenant). Form credential fields
 * still follow SELF_REGISTRATION_PROVISIONING_ENABLED / legacy alias.
 */

const express = require("express");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const directoryRepo = require("../repositories/publicChurchDirectoryRepository");
const {
  renderFeaturesPage,
  renderForChurchesPage,
  renderPricingPage,
  renderDirectoryPage,
  renderRegisterChurchPage,
  renderRegisterChurchSuccessPage,
  renderEmailVerificationResultPage,
} = require("./renderApexMarketing");
const { renderTermsPage, renderPrivacyPage } = require("./renderApexLegal");
const {
  CSRF_COOKIE,
  CSRF_FIELD,
  issueCsrfToken,
  setCsrfCookie,
  validateCsrf,
  getCsrfSecret,
} = require("../../platform/http/v5Csrf");
const {
  normalizeSelectedPlan,
  validatePlatformChurchRegistration,
  formFromBody,
  NETWORK_PLAN_CODE,
} = require("../services/platformChurchRegistrationValidation");
const {
  submitChurchRegistration,
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
const { logRegistrationTrace } = require("../services/registrationTraceLog");
const { mapPublicPlanToDbPlanKey } = require("../services/registrationPlanMapping");
const {
  consumeVerificationToken,
} = require("../services/registrationEmailVerificationService");
const {
  generatePublicRegistrationReference,
  buildRegistrationSuccessRedirect,
} = require("../../platform/registration/registrationSuccessPresentation");

const REGISTER_PATH = "/register-church";
const REGISTER_SUCCESS_PATH = "/register-church/success";
const ACCOUNT_PATH = "/account";
const HQ_PATH = "/hq";
const LOGIN_PATH = "/login";
/** Approved public verify path from PHASE2_033 / message builder. */
const EMAIL_VERIFY_PATH_PREFIX = "/register/email-verification";
const EMAIL_VERIFY_RESULT_PATH = "/register/email-verification/result";
/** Short-lived signed flash so `?outcome=verified` cannot be spoofed without a consume redirect. */
const EMAIL_VERIFY_FLASH_COOKIE = "bb_email_verify_flash";
const EMAIL_VERIFY_FLASH_PREFIX = "ev1";
const EMAIL_VERIFY_FLASH_TTL_MS = 5 * 60 * 1000;

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
function emailVerifyFlashSecret(env) {
  return getCsrfSecret(env);
}

/**
 * @param {"verified"|"invalid"|"rate_limited"} outcome
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
function issueEmailVerifyOutcomeFlash(outcome, env) {
  const safe =
    outcome === "verified" || outcome === "rate_limited" ? outcome : "invalid";
  const exp = String(Date.now() + EMAIL_VERIFY_FLASH_TTL_MS);
  const body = `${safe}.${exp}`;
  const secret = emailVerifyFlashSecret(env);
  const mac = crypto
    .createHmac("sha256", secret)
    .update(`${EMAIL_VERIFY_FLASH_PREFIX}.${body}`)
    .digest("base64url");
  return `${EMAIL_VERIFY_FLASH_PREFIX}.${body}.${mac}`;
}

/**
 * @param {string} token
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {"verified"|"invalid"|"rate_limited"|null}
 */
function verifyEmailVerifyOutcomeFlash(token, env) {
  const parts = String(token || "").split(".");
  if (parts.length !== 4 || parts[0] !== EMAIL_VERIFY_FLASH_PREFIX) return null;
  const [, outcome, exp, mac] = parts;
  if (!outcome || !exp || !mac) return null;
  if (outcome !== "verified" && outcome !== "invalid" && outcome !== "rate_limited") {
    return null;
  }
  const expMs = Number(exp);
  if (!Number.isFinite(expMs) || expMs < Date.now()) return null;
  const secret = emailVerifyFlashSecret(env);
  const body = `${outcome}.${exp}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${EMAIL_VERIFY_FLASH_PREFIX}.${body}`)
    .digest("base64url");
  const left = Buffer.from(mac, "utf8");
  const right = Buffer.from(expected, "utf8");
  if (left.length !== right.length) return null;
  if (!crypto.timingSafeEqual(left, right)) return null;
  return outcome;
}

/**
 * @param {import('express').Response} res
 * @param {"verified"|"invalid"|"rate_limited"} outcome
 * @param {{ env?: NodeJS.ProcessEnv, secure?: boolean }} [opts]
 */
function setEmailVerifyOutcomeFlashCookie(res, outcome, opts = {}) {
  const env = opts.env || process.env;
  const secure =
    opts.secure !== undefined
      ? opts.secure
      : String(env.NODE_ENV || "").toLowerCase() === "production";
  res.cookie(EMAIL_VERIFY_FLASH_COOKIE, issueEmailVerifyOutcomeFlash(outcome, env), {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: EMAIL_VERIFY_RESULT_PATH,
    maxAge: EMAIL_VERIFY_FLASH_TTL_MS,
  });
}

/**
 * Read + clear one-time flash. Query `outcome=verified` alone is ignored.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {"verified"|"invalid"|"rate_limited"}
 */
function resolveEmailVerifyResultOutcome(req, res, env) {
  const cookieRaw =
    (req.cookies && req.cookies[EMAIL_VERIFY_FLASH_COOKIE]) ||
    (req.signedCookies && req.signedCookies[EMAIL_VERIFY_FLASH_COOKIE]) ||
    null;
  res.clearCookie(EMAIL_VERIFY_FLASH_COOKIE, { path: EMAIL_VERIFY_RESULT_PATH });
  const fromFlash = verifyEmailVerifyOutcomeFlash(cookieRaw, env);
  if (fromFlash === "verified" || fromFlash === "rate_limited") {
    return fromFlash;
  }
  const raw = String((req.query && req.query.outcome) || "").trim().toLowerCase();
  // `verified` requires the signed flash from a successful consume redirect.
  if (raw === "rate_limited") return "rate_limited";
  return "invalid";
}

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
      sessionCookiePresent: Boolean(req.cookies && req.cookies.blessboard_org_sid),
      csrfCookiePresent: cookiePresent,
      csrfBodyFieldPresent: bodyPresent,
      csrfFieldName: CSRF_FIELD,
      outcome,
    })
  );
}

function logSessionEstablishFailure(req, errStatus, extra) {
  logRegistrationTrace(
    req,
    {
      event: "church_registration_session",
      operation: "establish_session",
      outcome: "fail",
      failureCategory: errStatus || "session_failed",
      ...(extra && typeof extra === "object" ? extra : {}),
    },
    { force: true, level: "error" }
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
 *   consumeVerificationToken?: typeof consumeVerificationToken,
 *   emailVerificationLimiter?: import('express').RequestHandler,
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
  const consumeTokenFn =
    typeof deps.consumeVerificationToken === "function"
      ? deps.consumeVerificationToken
      : consumeVerificationToken;
  const dataEnvironment = String(env.PLATFORM_DATA_ENVIRONMENT || env.DATA_ENVIRONMENT || "testing")
    .trim()
    .toLowerCase();
  const deploymentCode = String(env.PLATFORM_DEPLOYMENT_CODE || "blessboard-org-v5")
    .trim()
    .toLowerCase();

  function issueAndSetCsrf(req, res) {
    const csrfToken = issueToken(env);
    setCookie(res, csrfToken, { secure: isProduction, env, req });
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
      const csrfToken = issueAndSetCsrf(req, res);
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
        env,
      })
    );
    },
  });

  const emailVerifyWindowMs = Number(env.GETPRO_PLATFORM_FORM_RATE_WINDOW_MS) || 15 * 60 * 1000;
  const emailVerifyLimitRaw = Number(env.BLESSBOARD_EMAIL_VERIFY_RATE_LIMIT);
  const emailVerifyLimit =
    Number.isFinite(emailVerifyLimitRaw) && emailVerifyLimitRaw > 0
      ? emailVerifyLimitRaw
      : String(env.NODE_ENV || "") === "test"
        ? 1000
        : 30;

  function renderEmailVerifyRateLimited(req, res) {
    setRegisterNoStoreHeaders(res);
    const authenticated = Boolean(req.v5Session && req.v5Session.authenticated);
    const csrfToken = issueAndSetCsrf(req, res);
    return res.status(429).type("html").send(
      renderEmailVerificationResultPage({
        authenticated,
        csrfToken: authenticated ? csrfToken : null,
        outcome: "rate_limited",
      })
    );
  }

  const defaultEmailVerificationLimiter = rateLimit({
    windowMs: emailVerifyWindowMs,
    limit: emailVerifyLimit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const host = String(req.headers.host || "")
        .toLowerCase()
        .split(":")[0];
      const digest = crypto
        .createHash("sha256")
        .update(`${clientIp(req) || "unknown"}|${host}|email-verify`)
        .digest("hex")
        .slice(0, 32);
      return digest;
    },
    handler: renderEmailVerifyRateLimited,
  });

  const emailVerificationLimiter =
    typeof deps.emailVerificationLimiter === "function"
      ? deps.emailVerificationLimiter
      : defaultEmailVerificationLimiter;

  function withShell(req, res, renderFn, extra = {}) {
    if (!isApexHost(req)) {
      return res.status(404).type("text").send("Not found");
    }
    const authenticated = Boolean(req.v5Session && req.v5Session.authenticated);
    const alwaysPassCsrf = Boolean(extra.alwaysPassCsrf);
    const csrfToken = issueAndSetCsrf(req, res);
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

  router.get(REGISTER_SUCCESS_PATH, (req, res) => {
    if (String((req.query && req.query.review) || "") === "1") {
      return res.redirect(303, `${REGISTER_PATH}?review=1`);
    }
    return withShell(req, res, renderRegisterChurchSuccessPage, {
      alwaysPassCsrf: true,
      noStore: true,
      applicationReference: String((req.query && req.query.ref) || "").trim().slice(0, 64),
      ready: String((req.query && req.query.ready) || "") === "1",
    });
  });

  router.get(REGISTER_PATH, (req, res) => {
    const selectedPlan = normalizeSelectedPlan(req.query && req.query.plan);
    const submitted = String((req.query && req.query.submitted) || "") === "1";
    const review = String((req.query && req.query.review) || "") === "1";
    const submittedPlan = submitted
      ? normalizeSelectedPlan(req.query && req.query.plan) || selectedPlan
      : null;
    return withShell(req, res, renderRegisterChurchPage, {
      alwaysPassCsrf: true,
      noStore: true,
      submitted,
      submittedPlan,
      networkSupportSuccess: submitted && submittedPlan === NETWORK_PLAN_CODE,
      // Successful provision uses REGISTER_SUCCESS_PATH — never treat ?ready=1 as form success.
      workspaceReady: false,
      loginFallback: false,
      review,
      organizationKeyPreview: String((req.query && req.query.key) || "")
        .trim()
        .slice(0, 64),
      formError: null,
      form: formFromBody({}, { selectedPlanHint: selectedPlan }),
      fieldError: null,
      selectedPlan,
      showCsrfRetry: false,
      env,
    });
  });

  router.post(REGISTER_PATH, registerFormLimiter, async (req, res, next) => {
    const startedAt = Date.now();
    try {
      if (!isApexHost(req)) {
        return res.status(404).type("text").send("Not found");
      }

      setRegisterNoStoreHeaders(res);

      const authenticated = Boolean(req.v5Session && req.v5Session.authenticated);
      const selectedPlanHint = normalizeSelectedPlan(req.query && req.query.plan);
      const body = req.body || {};
      const flagOn = instantEnabled();

      logRegistrationTrace(req, {
        event: "church_registration_post",
        operation: "register_church_post",
        outcome: "started",
        publicPlanCode: normalizeSelectedPlan(body.selected_plan) || selectedPlanHint || null,
        mode: flagOn ? "instant_enabled" : "enquiry_only",
      });

      function renderForm(status, extras) {
        // Always issue a fresh cookie+field pair after failed attempts so Back/retry works.
        const csrfToken = issueAndSetCsrf(req, res);
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
            env,
            ...extras,
          })
        );
      }

      // Validate against the request cookie BEFORE rotating the CSRF cookie.
      if (!validateCsrf(req, body[CSRF_FIELD], env)) {
        logCsrfDiag(req, env, "reject");
        logRegistrationTrace(req, {
          event: "church_registration_validation",
          operation: "csrf_validate",
          outcome: "fail",
          failureCategory: "csrf_invalid",
          durationMs: Date.now() - startedAt,
        });
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
        env,
      });
      if (!validation.ok) {
        logRegistrationTrace(req, {
          event: "church_registration_validation",
          operation: "register_church_validate",
          outcome: "fail",
          failureCategory: "validation",
          field: validation.field || null,
          publicPlanCode: normalizeSelectedPlan(body.selected_plan) || selectedPlanHint || null,
          durationMs: Date.now() - startedAt,
        });
        return renderForm(400, {
          formError: validation.error,
          fieldError: validation.field || null,
        });
      }

      const publicPlanCode = validation.data.selected_plan || null;
      logRegistrationTrace(req, {
        event: "church_registration_validation",
        operation: "register_church_validate",
        outcome: "ok",
        publicPlanCode,
        canonicalPlanKey: mapPublicPlanToDbPlanKey(publicPlanCode) || null,
      });

      const result = await submitChurchRegistration(getPool(), req, validation, {
        dataEnvironment,
        deploymentCode,
        provisionFn: provisionFn || undefined,
        env,
      });

      if (result.honeypot) {
        issueAndSetCsrf(req, res);
        logRegistrationTrace(req, {
          event: "church_registration_redirect",
          operation: "register_church_redirect",
          outcome: "ok",
          redirectPath: `${REGISTER_PATH}?submitted=1`,
          failureCategory: "honeypot",
          durationMs: Date.now() - startedAt,
        });
        return res.redirect(303, `${REGISTER_PATH}?submitted=1`);
      }

      if (!result.ok) {
        if (result.review) {
          issueAndSetCsrf(req, res);
          logRegistrationTrace(req, {
            event: "church_registration_redirect",
            operation: "register_church_redirect",
            outcome: "ok",
            redirectPath: `${REGISTER_PATH}?review=1`,
            failureCategory: "review_required",
            durationMs: Date.now() - startedAt,
          });
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
          fieldError: result.field || null,
        });
      }

      const records = result.records || {};
      if (!records.organizationId && !records.administratorUserId) {
        issueAndSetCsrf(req, res);
        const planQ =
          result.networkSupportContact ||
          (validation.data && validation.data.selected_plan === NETWORK_PLAN_CODE)
            ? `&plan=${encodeURIComponent(NETWORK_PLAN_CODE)}`
            : "";
        const redirectPath = `${REGISTER_PATH}?submitted=1${planQ}`;
        logRegistrationTrace(req, {
          event: "church_registration_redirect",
          operation: "register_church_redirect",
          outcome: "ok",
          publicPlanCode,
          redirectPath,
          durationMs: Date.now() - startedAt,
        });
        return res.redirect(303, redirectPath);
      }

      // Provisioning committed — establish session (never roll back the tenant).
      // Issue a new opaque V5 session token (replaces any prior cookie value).
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
          logRegistrationTrace(req, {
            event: "church_registration_session",
            operation: "establish_session",
            outcome: "ok",
            applicationId: records.applicationId || null,
            organizationKey: orgKey || null,
            publicPlanCode,
            canonicalPlanKey: records.planKey || mapPublicPlanToDbPlanKey(publicPlanCode) || null,
          });
        } else {
          logSessionEstablishFailure(req, sessionResult && sessionResult.status, {
            applicationId: records.applicationId || null,
            organizationKey: orgKey || null,
          });
        }
      } catch (sessionErr) {
        logSessionEstablishFailure(
          req,
          sessionErr && sessionErr.message ? String(sessionErr.message).slice(0, 80) : "exception",
          {
            applicationId: records.applicationId || null,
            organizationKey: orgKey || null,
          }
        );
      }

      issueAndSetCsrf(req, res);

      const successPath = buildRegistrationSuccessRedirect({
        productCode: "blessboard",
        reference: generatePublicRegistrationReference("BB"),
        ready: true,
      });
      logRegistrationTrace(req, {
        event: "church_registration_redirect",
        operation: "register_church_redirect",
        outcome: "ok",
        redirectPath: successPath,
        ...(sessionOk ? {} : { failureCategory: "session_failed_post_commit" }),
        applicationId: records.applicationId || null,
        organizationKey: orgKey || null,
        publicPlanCode,
        canonicalPlanKey: records.planKey || null,
        durationMs: Date.now() - startedAt,
      });
      return res.redirect(303, successPath);
    } catch (err) {
      return next(err);
    }
  });

  router.get("/directory", async (req, res) => {
    if (!isApexHost(req)) {
      return res.status(404).type("text").send("Not found");
    }
    const authenticated = Boolean(req.v5Session && req.v5Session.authenticated);
    const csrfToken = issueAndSetCsrf(req, res);

    const q = directoryRepo.normalizeSearchQuery(req.query && req.query.q);
    const page = Number(req.query && req.query.page) || 1;
    let results = { items: [], total: 0, page: 1, limit: directoryRepo.DEFAULT_PAGE_SIZE, totalPages: 0, q };
    let directoryUnavailable = false;

    try {
      const pool = getPool();
      if (pool) {
        results = await directoryRepo.searchPublicOrganizations(pool, { q, page, env });
      } else {
        directoryUnavailable = true;
      }
    } catch (err) {
      // Safe visitor fallback — log code/message only (no SQL, params, or stack).
      // eslint-disable-next-line no-console
      console.error("[apex] directory lookup failed", {
        code: err && err.code ? String(err.code).slice(0, 40) : null,
        message: err && err.message ? String(err.message).slice(0, 120) : "unknown",
      });
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

  /**
   * Tokenless result page for public email verification (no auth).
   * `verified` requires a short-lived signed flash cookie from the consume redirect
   * so `?outcome=verified` cannot spoof a success UI.
   */
  router.get(EMAIL_VERIFY_RESULT_PATH, emailVerificationLimiter, (req, res) => {
    if (!isApexHost(req)) {
      return res.status(404).type("text").send("Not found");
    }
    setRegisterNoStoreHeaders(res);
    const authenticated = Boolean(req.v5Session && req.v5Session.authenticated);
    const csrfToken = issueAndSetCsrf(req, res);
    const outcome = resolveEmailVerifyResultOutcome(req, res, env);
    return res.status(200).type("html").send(
      renderEmailVerificationResultPage({
        authenticated,
        csrfToken: authenticated ? csrfToken : null,
        outcome,
      })
    );
  });

  /**
   * Public one-time email verification consume (apex only, no auth).
   * Always redirects to the tokenless result page — never keeps the token in links.
   */
  router.get(
    `${EMAIL_VERIFY_PATH_PREFIX}/:token`,
    emailVerificationLimiter,
    async (req, res) => {
      if (!isApexHost(req)) {
        return res.status(404).type("text").send("Not found");
      }
      setRegisterNoStoreHeaders(res);

      const rawToken = String((req.params && req.params.token) || "").trim();
      let outcome = "invalid";

      try {
        const pool = getPool();
        const result = await consumeTokenFn(rawToken, { client: pool });
        if (result && result.ok === true && result.code === "verified") {
          outcome = "verified";
        }
      } catch (err) {
        // Never log the token or raw error details that may include it.
        // eslint-disable-next-line no-console
        console.error("[apex] email verification consume failed", {
          outcome: "invalid",
          message: err && err.message ? String(err.message).slice(0, 120) : "unknown",
        });
        outcome = "invalid";
      }

      if (outcome === "verified") {
        setEmailVerifyOutcomeFlashCookie(res, "verified", {
          env,
          secure: isProduction,
        });
      }

      return res.redirect(
        303,
        `${EMAIL_VERIFY_RESULT_PATH}?outcome=${encodeURIComponent(outcome)}`
      );
    }
  );

  return router;
}

const IN_PROGRESS_SAFE =
  "Your registration is already being completed. Please wait a moment, then sign in if your workspace is ready.";

module.exports = {
  createApexMarketingRouter,
  REGISTER_PATH,
  REGISTER_SUCCESS_PATH,
  ACCOUNT_PATH,
  HQ_PATH,
  LOGIN_PATH,
  EMAIL_VERIFY_PATH_PREFIX,
  EMAIL_VERIFY_RESULT_PATH,
  EMAIL_VERIFY_FLASH_COOKIE,
  issueEmailVerifyOutcomeFlash,
  verifyEmailVerifyOutcomeFlash,
  resolveEmailVerifyResultOutcome,
  setEmailVerifyOutcomeFlashCookie,
  DUPLICATE_REVIEW_MESSAGE,
};
