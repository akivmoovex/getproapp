"use strict";

/**
 * ActiveClinic public HTTP routes (P20–P26).
 * Platform public, tenant public, booking flows, my-booking lookup.
 */

const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const { issueCsrfToken, setCsrfCookie, validateCsrf, CSRF_FIELD } = require("../../platform/http/v5Csrf");
const {
  resolvePublishableClinicByKey,
  listPublishableClinics,
  listPublicStaffProfiles,
  getPublicStaffProfile,
  listPublicServices,
  getPublicService,
  listPublicProcedures,
  getPublicProcedure,
  listPublicPricePatterns,
} = require("../services/activeClinicPublicVisibilityService");
const {
  validateClinicRegistrationInput,
} = require("../services/activeClinicPublicOnboardingService");
const {
  submitAndProvisionClinicRegistration,
  RESULT: SUBMIT_RESULT,
} = require("../services/submitClinicRegistrationService");
const {
  authenticateActiveClinicIdentity,
} = require("../services/authenticateActiveClinicIdentity");
const { setV5SessionCookie } = require("../../platform/session/v5SessionCookie");
const { requirePlatformDeploymentCode } = require("../../platform/config/platformDeploymentCode");
const { getDeploymentEnvMode } = require("../../church/blessBoardEnv");
const { resolveHostname } = require("../../platform/host");
const {
  lookupClinicRegistrationApplicantStatus,
  GENERIC_NOT_FOUND,
} = require("../services/clinicRegistrationApplicantStatusService");
const {
  createPublicContactInquiry,
} = require("../services/activeClinicPublicContactService");
const {
  newRegistrationRequestId,
  classifyRegistrationError,
  logClinicApplicationFailed,
  logClinicApplicationCreated,
} = require("../services/activeClinicPublicRegistrationLog");
const {
  newDirectoryRequestId,
  classifyDirectoryError,
  logDirectoryLoadFailed,
  logDirectoryLoaded,
} = require("../services/activeClinicPublicDirectoryLog");
const { resolveDeploymentConfiguration } = require("../../platform/config/deploymentProfiles");
const { renderPublicView } = require("./renderActiveClinicPublic");
const { buildTermsOfServiceContent } = require("../legal/termsOfServiceContent");
const { buildPrivacyPolicyContent } = require("../legal/privacyPolicyContent");
const { registerActiveClinicPublicBookingRoutes } = require("./activeClinicPublicBookingRoutes");
const {
  sendClinicResolveFailure,
  resolveClinicOrRespond,
} = require("./activeClinicPublicRespond");
const { attachActiveClinicWebsiteLocals } = require("./attachActiveClinicWebsiteChrome");
const { resolvePublicPricingDisplay } = require("../website/publicPricingDisplay");
const {
  PRODUCT_CODE,
  sendCanonicalPublicWebsiteRedirect,
  buildPublicOrganizationWebsitePath,
} = require("../../platform/website/publicWebsiteUrl");

function clientIp(req) {
  return String((req.headers && req.headers["x-forwarded-for"]) || req.ip || (req.socket && req.socket.remoteAddress) || "").split(",")[0].trim();
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function issuePageCsrf(res, env, isProduction, req) {
  const token = issueCsrfToken(env);
  setCsrfCookie(res, token, { secure: isProduction, env, req });
  return token;
}

function resolveDirectorySearchQuery(req) {
  const q = req.query.q != null ? String(req.query.q) : "";
  const search = req.query.search != null ? String(req.query.search) : "";
  return (q || search || "").trim();
}

function statusFormDataFrom(body, query) {
  const fd = body || {};
  const q = query || {};
  return {
    applicationNumber: String(fd.applicationNumber || q.ref || q.applicationNumber || "").trim(),
    contactEmail: String(fd.contactEmail || "").trim(),
    contactPhone: String(fd.contactPhone || "").trim(),
    phoneCountry: String(fd.phone_country || fd.phoneCountry || "").trim(),
    phoneNational: String(fd.phone_national || fd.phoneNational || "").trim(),
  };
}

function registerFormDataFromBody(body) {
  const fd = body || {};
  return {
    clinicName: fd.clinicName || "",
    contactName: fd.contactName || "",
    contactEmail: fd.contactEmail || "",
    contactPhone: fd.contactPhone || "",
    phoneCountry: fd.phone_country || fd.phoneCountry || "",
    phoneNational: fd.phone_national || fd.phoneNational || "",
    province: fd.province || "",
    city: fd.city || "",
    address: fd.address || "",
    countryCode: fd.countryCode || fd.phone_country || "ZM",
    notes: fd.notes || "",
    password: fd.password || "",
    passwordConfirm: fd.passwordConfirm || fd.password_confirm || "",
    acceptTerms: fd.acceptTerms || fd.accept_terms || "",
  };
}

async function fetchDirectoryClinics(getPoolFn, env, req, filters) {
  if (String(env.NODE_ENV || "") === "test" && req.query._directoryError === "1") {
    throw new Error("directory_unavailable");
  }
  return listPublishableClinics(getPoolFn(), filters);
}

/**
 * @param {import('express').Express} app
 * @param {{ getPool: Function, env: NodeJS.ProcessEnv, isProduction: boolean }} deps
 */
function registerActiveClinicPublicRoutes(app, deps) {
  const getPool = deps.getPool;
  const env = deps.env;
  const isProduction = deps.isProduction;
  const respondDeps = { env, isProduction, issuePageCsrf };

  async function renderTenantView(req, res, clinic, template, extra) {
    const csrfToken = issuePageCsrf(res, env, isProduction);
    const website = await attachActiveClinicWebsiteLocals(getPool(), req, clinic);
    const extras = extra || {};
    if (template === "tenant/pricing") {
      extras.pricingDisplay = resolvePublicPricingDisplay({
        patterns: extras.pricePatterns || [],
        insuranceIntro:
          website.clinic && website.clinic.websiteContent
            ? website.clinic.websiteContent["insurance.intro"]
            : null,
        pageVisible: website.clinic ? website.clinic.showPricing !== false : true,
      });
    }
    return res.status(200).type("html").send(renderPublicView(template, {
      csrfToken,
      ...website,
      clinic: website.clinic,
      ...extras,
    }));
  }

  // Rate limiters
  const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: String(env.NODE_ENV || "") === "test" ? 1000 : 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => sha256Hex(`register|${req.body && req.body.contactEmail}|${clientIp(req)}`),
    handler: (req, res) => {
      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(429).type("html").send(renderPublicView("public/register-clinic", {
        csrfToken,
        error: "Too many requests. Please try again later.",
        formState: "form",
        validationErrors: {},
        formData: registerFormDataFromBody(req.body),
      }));
    },
  });

  const bookingLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: String(env.NODE_ENV || "") === "test" ? 1000 : 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => sha256Hex(`booking|${req.params.clinicKey}|${req.body && req.body.patientPhone}|${clientIp(req)}`),
    handler: (req, res) => {
      return res.status(429).json({ ok: false, code: "rate_limit_exceeded" });
    },
  });

  const lookupLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: String(env.NODE_ENV || "") === "test" ? 1000 : 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => sha256Hex(`lookup|${req.query.token || ""}|${clientIp(req)}`),
    handler: (req, res) => {
      return res.status(429).json({ ok: false, code: "rate_limit_exceeded" });
    },
  });

  const statusLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: String(env.NODE_ENV || "") === "test" ? 1000 : 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => sha256Hex(`clinic-status|${clientIp(req)}`),
    handler: (req, res) => {
      const csrfToken = issuePageCsrf(res, env, isProduction, req);
      return res.status(429).type("html").send(renderPublicView("public/register-clinic-status", {
        csrfToken,
        pageTitle: "Registration status",
        robots: "noindex, nofollow",
        lookupState: "form",
        error: "Too many requests. Please try again later.",
        validationErrors: {},
        formData: statusFormDataFrom(req.body, req.query),
        projection: null,
      }));
    },
  });

  // ========== Platform Public Routes ==========

  app.get("/", (req, res) => {
    // Auth redirect to /app
    if (req.activeClinicAuth && req.activeClinicAuth.authenticated) {
      if (req.activeClinicAuth.mustChangePassword) {
        return res.redirect(303, "/account/change-password");
      }
      return res.redirect(303, "/app");
    }
    const csrfToken = issuePageCsrf(res, env, isProduction);
    return res.status(200).type("html").send(renderPublicView("public/home", { csrfToken }));
  });

  app.get("/about", (req, res) => {
    const csrfToken = issuePageCsrf(res, env, isProduction);
    return res.status(200).type("html").send(renderPublicView("public/about", { csrfToken }));
  });

  app.get("/terms", (req, res) => {
    const csrfToken = issuePageCsrf(res, env, isProduction);
    return res.status(200).type("html").send(renderPublicView("public/legal-page", {
      csrfToken,
      pageTitle: "Terms of Service",
      pageId: "public-terms",
      activeNav: "terms",
      legalDoc: buildTermsOfServiceContent(),
    }));
  });

  app.get("/privacy", (req, res) => {
    const csrfToken = issuePageCsrf(res, env, isProduction);
    return res.status(200).type("html").send(renderPublicView("public/legal-page", {
      csrfToken,
      pageTitle: "Privacy Policy",
      pageId: "public-privacy",
      activeNav: "privacy",
      legalDoc: buildPrivacyPolicyContent(),
    }));
  });

  app.get("/solutions", (req, res) => {
    const csrfToken = issuePageCsrf(res, env, isProduction);
    return res.status(200).type("html").send(renderPublicView("public/solutions", { csrfToken }));
  });

  app.get("/clinics", async (req, res) => {
    const search = resolveDirectorySearchQuery(req);
    const province = req.query.province || null;
    const city = req.query.city || null;
    const csrfToken = issuePageCsrf(res, env, isProduction);
    const filtersPresent = Boolean(search || province || city);
    const requestId = newDirectoryRequestId();
    const deployment = resolveDeploymentConfiguration(env);

    if (req.query._directoryLoading === "1" && String(env.NODE_ENV || "") === "test") {
      return res.status(200).type("html").send(renderPublicView("public/clinics-directory", {
        csrfToken,
        clinics: [],
        search,
        province,
        city,
        directoryState: "loading",
        requestId,
      }));
    }

    try {
      const result = await fetchDirectoryClinics(getPool, env, req, { search, province, city });
      const clinics = result.clinics || [];
      logDirectoryLoaded({
        requestId,
        resultCount: clinics.length,
        filtersPresent,
        page: 1,
      });

      return res.status(200).type("html").send(renderPublicView("public/clinics-directory", {
        csrfToken,
        clinics,
        search,
        province,
        city,
        directoryState: "ready",
        directoryEmpty: clinics.length === 0,
        requestId,
      }));
    } catch (err) {
      const classified = classifyDirectoryError(err);
      logDirectoryLoadFailed({
        requestId,
        deploymentCode: deployment.code || null,
        environmentCode: deployment.environment || null,
        category: classified.category,
        safeDatabaseErrorCode: classified.safeDatabaseErrorCode,
        exceptionClass: err && err.name ? err.name : "Error",
        repositoryFunction: classified.repositoryFunction,
        stage: classified.stage,
        filtersPresent,
        includeStack: true,
        err,
      });
      return res.status(503).type("html").send(renderPublicView("public/clinics-directory", {
        csrfToken,
        clinics: [],
        search,
        province,
        city,
        directoryState: "error",
        requestId,
        schemaHint: classified.category === "schema_missing" || classified.category === "schema_column_missing",
      }));
    }
  });

  app.get("/clinics/search", async (req, res) => {
    const search = resolveDirectorySearchQuery(req);
    const province = req.query.province || null;
    const city = req.query.city || null;
    const csrfToken = issuePageCsrf(res, env, isProduction);
    const filtersPresent = Boolean(search || province || city);
    const requestId = newDirectoryRequestId();
    const deployment = resolveDeploymentConfiguration(env);

    try {
      const result = await fetchDirectoryClinics(getPool, env, req, { search, province, city });
      const clinics = result.clinics || [];
      logDirectoryLoaded({
        requestId,
        resultCount: clinics.length,
        filtersPresent,
        page: 1,
      });

      return res.status(200).type("html").send(renderPublicView("public/clinics-search", {
        csrfToken,
        clinics,
        search,
        province,
        city,
        directoryState: "ready",
        directoryEmpty: clinics.length === 0,
        requestId,
      }));
    } catch (err) {
      const classified = classifyDirectoryError(err);
      logDirectoryLoadFailed({
        requestId,
        deploymentCode: deployment.code || null,
        environmentCode: deployment.environment || null,
        category: classified.category,
        safeDatabaseErrorCode: classified.safeDatabaseErrorCode,
        exceptionClass: err && err.name ? err.name : "Error",
        repositoryFunction: classified.repositoryFunction,
        stage: classified.stage,
        filtersPresent,
        includeStack: true,
        err,
      });
      return res.status(503).type("html").send(renderPublicView("public/clinics-search", {
        csrfToken,
        clinics: [],
        search,
        province,
        city,
        directoryState: "error",
        requestId,
        schemaHint: classified.category === "schema_missing" || classified.category === "schema_column_missing",
      }));
    }
  });

  app.get("/register-clinic", (req, res) => {
    const csrfToken = issuePageCsrf(res, env, isProduction, req);
    return res.status(200).type("html").send(renderPublicView("public/register-clinic", {
      csrfToken,
      error: null,
      formState: "form",
      validationErrors: {},
      formData: {},
    }));
  });

  app.post("/register-clinic", registerLimiter, async (req, res) => {
    const formData = registerFormDataFromBody(req.body);
    const action = String((req.body && req.body.action) || "").trim().toLowerCase();

    if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
      const csrfToken = issuePageCsrf(res, env, isProduction, req);
      return res.status(403).type("html").send(renderPublicView("public/register-clinic", {
        csrfToken,
        error: "Your session expired. Please try again.",
        formState: "form",
        validationErrors: {},
        formData,
      }));
    }

    if (action === "confirm") {
      const requestId = newRegistrationRequestId();
      const deployment = resolveDeploymentConfiguration(env);
      try {
        const deploymentCode = requirePlatformDeploymentCode(env);
        const mode = getDeploymentEnvMode(env);
        const result = await submitAndProvisionClinicRegistration(getPool(), {
          ...formData,
          deploymentCode: deploymentCode.ok ? deploymentCode.code : deployment.code,
          dataEnvironment: mode === "production" ? "production" : "testing",
          env,
        });

        if (!result.ok) {
          const csrfToken = issuePageCsrf(res, env, isProduction, req);
          if (result.code === "duplicate_application") {
            logClinicApplicationFailed({
              requestId,
              deploymentCode: deployment.code || null,
              environmentCode: deployment.environment || null,
              validationCategory: "duplicate_application",
              category: "duplicate_application",
              failingOperation: "create_clinic_registration_application",
              transactionStage: "duplicate_check",
            });
            const existingStatus = result.application && result.application.status;
            const dupMessage =
              existingStatus === "approved"
                ? "A clinic is already registered with this email or phone."
                : "An application with this email or phone was recently submitted. A second copy was not created.";
            return res.status(400).type("html").send(renderPublicView("public/register-clinic", {
              csrfToken,
              error: dupMessage,
              formState: "form",
              validationErrors: {},
              formData,
            }));
          }
          if (result.errors && Object.keys(result.errors).length) {
            logClinicApplicationFailed({
              requestId,
              deploymentCode: deployment.code || null,
              environmentCode: deployment.environment || null,
              validationCategory: "invalid_input",
              category: "validation",
              failingOperation: "validate_clinic_registration_input",
              transactionStage: "validate",
            });
            if (result.errors.acceptTerms) {
              return res.status(400).type("html").send(renderPublicView("public/register-clinic-review", {
                csrfToken,
                error: result.errors.acceptTerms,
                validationErrors: result.errors,
                formData,
              }));
            }
            return res.status(400).type("html").send(renderPublicView("public/register-clinic", {
              csrfToken,
              error: null,
              formState: "validation_error",
              validationErrors: result.errors,
              formData,
            }));
          }
          if (result.code === "schema_mismatch") {
            logClinicApplicationFailed({
              requestId,
              deploymentCode: deployment.code || null,
              environmentCode: deployment.environment || null,
              validationCategory: "schema_mismatch",
              category: "schema_mismatch",
              failingOperation: "schema_compatibility_guard",
              transactionStage: "pre_persist",
            });
            return res.status(503).type("html").send(renderPublicView("public/register-clinic", {
              csrfToken,
              error:
                "Clinic registration is temporarily unavailable because this deployment’s database schema is incomplete. No application was created.",
              formState: "form",
              validationErrors: {},
              formData,
            }));
          }
          logClinicApplicationFailed({
            requestId,
            deploymentCode: deployment.code || null,
            environmentCode: deployment.environment || null,
            validationCategory: result.code || "rejected",
            category: "rejected",
            failingOperation: "create_clinic_registration_application",
            transactionStage: "service",
          });
          return res.status(400).type("html").send(renderPublicView("public/register-clinic", {
            csrfToken,
            error: "Please check your information and try again.",
            formState: "form",
            validationErrors: {},
            formData,
          }));
        }

        logClinicApplicationCreated({
          requestId,
          deploymentCode: deployment.code || null,
          environmentCode: deployment.environment || null,
          applicationReference: result.application && result.application.applicationNumber,
        });
        const ref = result.application && result.application.applicationNumber
          ? encodeURIComponent(result.application.applicationNumber)
          : "";
        if (result.reviewRequired || result.code === SUBMIT_RESULT.REVIEW_REQUIRED) {
          return res.redirect(303, `/register-clinic/success?ref=${ref}&review=1`);
        }
        if (result.ok && result.code === SUBMIT_RESULT.OK && formData.password) {
          try {
            const auth = await authenticateActiveClinicIdentity(getPool(), {
              identifier: formData.contactEmail,
              password: formData.password,
              deploymentCode: deploymentCode.ok ? deploymentCode.code : String(deployment.code || ""),
              hostname: resolveHostname(req) || "activeclinic.org",
              country: formData.countryCode || "ZM",
              ip: clientIp(req),
              userAgent: req.headers["user-agent"] || null,
            });
            if (auth && auth.ok && auth.rawToken) {
              setV5SessionCookie(res, auth.rawToken, { secure: isProduction, env, req });
            }
          } catch {
            /* session is optional; administrator can still sign in */
          }
        }
        return res.redirect(303, `/register-clinic/success?ref=${ref}&ready=1`);
      } catch (err) {
        const classified = classifyRegistrationError(err);
        logClinicApplicationFailed({
          requestId,
          deploymentCode: deployment.code || null,
          environmentCode: deployment.environment || null,
          category: classified.category,
          safeDatabaseErrorCode: classified.safeDatabaseErrorCode,
          exceptionClass: err && err.name ? err.name : "Error",
          failingOperation: classified.failingOperation,
          transactionStage: classified.transactionStage,
          includeStack: true,
          err,
        });
        const csrfToken = issuePageCsrf(res, env, isProduction, req);
        return res.status(500).type("html").send(renderPublicView("public/register-clinic-server-error", {
          csrfToken,
          formData,
          requestId,
          schemaHint: classified.category === "schema_missing" || classified.category === "schema_column_missing",
        }));
      }
    }

    const validated = validateClinicRegistrationInput(formData);
    const csrfToken = issuePageCsrf(res, env, isProduction, req);

    if (!validated.ok) {
      return res.status(400).type("html").send(renderPublicView("public/register-clinic", {
        csrfToken,
        error: null,
        formState: "validation_error",
        validationErrors: validated.errors,
        formData,
      }));
    }

    return res.status(200).type("html").send(renderPublicView("public/register-clinic-review", {
      csrfToken,
      formData: {
        clinicName: validated.normalized.clinicName,
        contactName: validated.normalized.contactName,
        contactEmail: validated.normalized.contactEmailDisplay || formData.contactEmail,
        contactPhone: validated.normalized.contactPhoneDisplay || formData.contactPhone,
        province: validated.normalized.province || "",
        city: validated.normalized.city || "",
        address: validated.normalized.address || "",
        countryCode: validated.normalized.countryCode,
        notes: validated.normalized.notes || "",
        phoneCountry: formData.phoneCountry || "",
        phoneNational: formData.phoneNational || "",
        password: formData.password || "",
        passwordConfirm: formData.passwordConfirm || "",
      },
    }));
  });

  app.get("/register-clinic/success", (req, res) => {
    const csrfToken = issuePageCsrf(res, env, isProduction, req);
    const applicationReference = String(req.query.ref || "").trim().slice(0, 64);
    const reviewRequired = String(req.query.review || "") === "1";
    const ready = String(req.query.ready || "") === "1";
    return res.status(200).type("html").send(renderPublicView("public/register-clinic-success", {
      csrfToken,
      applicationReference: applicationReference || null,
      reviewRequired,
      ready: ready && !reviewRequired,
    }));
  });

  app.get("/register-clinic/status", (req, res) => {
    const csrfToken = issuePageCsrf(res, env, isProduction, req);
    return res.status(200).type("html").send(renderPublicView("public/register-clinic-status", {
      csrfToken,
      pageTitle: "Registration status",
      robots: "noindex, nofollow",
      lookupState: "form",
      error: null,
      validationErrors: {},
      formData: statusFormDataFrom({}, req.query),
      projection: null,
    }));
  });

  app.post("/register-clinic/status", statusLimiter, async (req, res, next) => {
    const formData = statusFormDataFrom(req.body, req.query);
    if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
      const csrfToken = issuePageCsrf(res, env, isProduction, req);
      return res.status(403).type("html").send(renderPublicView("public/register-clinic-status", {
        csrfToken,
        pageTitle: "Registration status",
        robots: "noindex, nofollow",
        lookupState: "form",
        error: "Your session expired. Please try again.",
        validationErrors: {},
        formData,
        projection: null,
      }));
    }
    try {
      const result = await lookupClinicRegistrationApplicantStatus(getPool(), {
        applicationNumber: formData.applicationNumber,
        contactEmail: formData.contactEmail,
        contactPhone: formData.contactPhone,
        phoneCountry: formData.phoneCountry,
        phoneNational: formData.phoneNational,
      });
      const csrfToken = issuePageCsrf(res, env, isProduction, req);
      if (!result.ok) {
        const invalid = result.code === "invalid_input";
        return res.status(200).type("html").send(renderPublicView("public/register-clinic-status", {
          csrfToken,
          pageTitle: "Registration status",
          robots: "noindex, nofollow",
          lookupState: "form",
          error: invalid ? result.message : GENERIC_NOT_FOUND,
          validationErrors: result.errors || {},
          formData,
          projection: null,
        }));
      }
      return res.status(200).type("html").send(renderPublicView("public/register-clinic-status", {
        csrfToken,
        pageTitle: "Registration status",
        robots: "noindex, nofollow",
        lookupState: "result",
        error: null,
        validationErrors: {},
        formData,
        projection: result.projection,
      }));
    } catch (err) {
      return next(err);
    }
  });

  // ========== Tenant Public Routes ==========
  // Canonical ActiveClinic public path is /clinics/:clinicKey.
  // /c/:clinicKey is a compatibility alias using the shared URL template.
  // GET/HEAD only — never redirect POST website/booking writes.

  function redirectIfNotCanonical(req, res, next) {
    const key = String(req.params.clinicKey || "").trim();
    if (!key) return next();
    if (
      sendCanonicalPublicWebsiteRedirect(req, res, PRODUCT_CODE.ACTIVECLINIC, {
        canonicalOrganizationKey: key,
      })
    ) {
      return undefined;
    }
    return next();
  }

  app.use("/c/:clinicKey", redirectIfNotCanonical);
  app.use("/clinics/:clinicKey", redirectIfNotCanonical);

  app.get("/clinics/:clinicKey", async (req, res, next) => {
    try {
      const clinic = await resolveClinicOrRespond(getPool, req, res, respondDeps);
      if (!clinic) return undefined;
      return renderTenantView(req, res, clinic, "tenant/home");
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/about", async (req, res, next) => {
    try {
      const clinic = await resolveClinicOrRespond(getPool, req, res, respondDeps);
      if (!clinic) return undefined;
      return renderTenantView(req, res, clinic, "tenant/about");
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/contact", async (req, res, next) => {
    try {
      const clinic = await resolveClinicOrRespond(getPool, req, res, respondDeps);
      if (!clinic) return undefined;

      if (req.query.submitted === "1") {
        return renderTenantView(req, res, clinic, "tenant/contact-success");
      }

      return renderTenantView(req, res, clinic, "tenant/contact", {
        error: null,
        formData: {},
      });
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/contact/success", async (req, res, next) => {
    try {
      const clinic = await resolveClinicOrRespond(getPool, req, res, respondDeps);
      if (!clinic) return undefined;

      return renderTenantView(req, res, clinic, "tenant/contact-success");
    } catch (err) {
      return next(err);
    }
  });

  app.post("/clinics/:clinicKey/contact", async (req, res, next) => {
    try {
      const clinicResult = await resolvePublishableClinicByKey(getPool(), { clinicKey: req.params.clinicKey });
      if (!clinicResult.ok) {
        return sendClinicResolveFailure(res, clinicResult, respondDeps);
      }

      const clinic = clinicResult.clinic;

      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        const csrfToken = issuePageCsrf(res, env, isProduction);
        return res.status(403).type("html").send(renderPublicView("tenant/contact", {
          csrfToken,
          clinic,
          error: "Your session expired. Please try again.",
          formData: req.body || {},
        }));
      }

      const result = await createPublicContactInquiry(getPool(), {
        organizationId: clinic.organizationId,
        healthcareOrganizationId: clinic.healthcareOrganizationId,
        facilityId: null,
        senderName: req.body.senderName,
        senderEmail: req.body.senderEmail,
        senderPhone: req.body.senderPhone || null,
        phoneCountry: req.body.phone_country || null,
        phoneNational: req.body.phone_national || null,
        clinicDefaultCountry: clinic.countryCode || null,
        message: req.body.message,
      });

      if (!result.ok) {
        const csrfToken = issuePageCsrf(res, env, isProduction);
        return res.status(400).type("html").send(renderPublicView("tenant/contact", {
          csrfToken,
          clinic,
          error: "Please check your information and try again.",
          formData: req.body || {},
        }));
      }

      return res.redirect(
        303,
        buildPublicOrganizationWebsitePath({
          product: PRODUCT_CODE.ACTIVECLINIC,
          organizationKey: req.params.clinicKey,
          suffix: "contact/success",
        })
      );
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/pricing", async (req, res, next) => {
    try {
      const clinic = await resolveClinicOrRespond(getPool, req, res, respondDeps);
      if (!clinic) return undefined;

      const priceResult = await listPublicPricePatterns(getPool(), {
        organizationId: clinic.organizationId,
        healthcareOrganizationId: clinic.healthcareOrganizationId,
      });

      return renderTenantView(req, res, clinic, "tenant/pricing", {
        pricePatterns: priceResult.patterns || [],
      });
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/location", async (req, res, next) => {
    try {
      const clinic = await resolveClinicOrRespond(getPool, req, res, respondDeps);
      if (!clinic) return undefined;

      return renderTenantView(req, res, clinic, "tenant/location");
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/patient-information", async (req, res, next) => {
    try {
      const clinic = await resolveClinicOrRespond(getPool, req, res, respondDeps);
      if (!clinic) return undefined;

      return renderTenantView(req, res, clinic, "tenant/patient-information");
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/privacy", async (req, res, next) => {
    try {
      const clinic = await resolveClinicOrRespond(getPool, req, res, respondDeps);
      if (!clinic) return undefined;

      return renderTenantView(req, res, clinic, "tenant/privacy");
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/terms", async (req, res, next) => {
    try {
      const clinic = await resolveClinicOrRespond(getPool, req, res, respondDeps);
      if (!clinic) return undefined;

      return renderTenantView(req, res, clinic, "tenant/terms");
    } catch (err) {
      return next(err);
    }
  });

  // P23: Services & Doctors
  app.get("/clinics/:clinicKey/services", async (req, res, next) => {
    try {
      const clinic = await resolveClinicOrRespond(getPool, req, res, respondDeps);
      if (!clinic) return undefined;

      const servicesResult = await listPublicServices(getPool(), {
        organizationId: clinic.organizationId,
        healthcareOrganizationId: clinic.healthcareOrganizationId,
      });

      const proceduresResult = await listPublicProcedures(getPool(), {
        organizationId: clinic.organizationId,
        healthcareOrganizationId: clinic.healthcareOrganizationId,
      });

      return renderTenantView(req, res, clinic, "tenant/services", {
        services: servicesResult.services || [],
        procedures: proceduresResult.procedures || [],
      });
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/services/:serviceKey", async (req, res, next) => {
    try {
      const clinic = await resolveClinicOrRespond(getPool, req, res, respondDeps);
      if (!clinic) return undefined;

      const serviceResult = await getPublicService(getPool(), {
        organizationId: clinic.organizationId,
        healthcareOrganizationId: clinic.healthcareOrganizationId,
        serviceKey: req.params.serviceKey,
      });

      if (!serviceResult.ok) {
        return res.status(404).type("html").send(renderPublicView("tenant/clinic-not-found", {
          csrfToken: issuePageCsrf(res, env, isProduction),
          pageTitle: "Service not found",
          shellVariant: "tenant",
          clinic,
        }));
      }

      const serviceKind = clinic.publicBookingEnabled ? "consultation" : "informational";
      return renderTenantView(req, res, clinic, "tenant/service-detail", {
        service: serviceResult.service,
        serviceKind,
      });
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/procedures/:procedureKey", async (req, res, next) => {
    try {
      const clinic = await resolveClinicOrRespond(getPool, req, res, respondDeps);
      if (!clinic) return undefined;

      const procedureResult = await getPublicProcedure(getPool(), {
        organizationId: clinic.organizationId,
        healthcareOrganizationId: clinic.healthcareOrganizationId,
        procedureKey: req.params.procedureKey,
      });

      if (!procedureResult.ok) {
        return res.status(404).type("html").send(renderPublicView("tenant/clinic-not-found", {
          csrfToken: issuePageCsrf(res, env, isProduction),
          pageTitle: "Procedure not found",
          shellVariant: "tenant",
          clinic,
        }));
      }

      return renderTenantView(req, res, clinic, "tenant/procedure-detail", {
        procedure: procedureResult.procedure,
      });
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/doctors", async (req, res, next) => {
    try {
      const clinic = await resolveClinicOrRespond(getPool, req, res, respondDeps);
      if (!clinic) return undefined;

      const profilesResult = await listPublicStaffProfiles(getPool(), {
        organizationId: clinic.organizationId,
        healthcareOrganizationId: clinic.healthcareOrganizationId,
      });

      return renderTenantView(req, res, clinic, "tenant/doctors", {
        profiles: profilesResult.profiles || [],
      });
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/doctors/:staffKey", async (req, res, next) => {
    try {
      const clinic = await resolveClinicOrRespond(getPool, req, res, respondDeps);
      if (!clinic) return undefined;

      const profileResult = await getPublicStaffProfile(getPool(), {
        organizationId: clinic.organizationId,
        healthcareOrganizationId: clinic.healthcareOrganizationId,
        staffKey: req.params.staffKey,
      });

      if (!profileResult.ok) {
        return res.status(404).type("html").send(renderPublicView("tenant/clinic-not-found", {
          csrfToken: issuePageCsrf(res, env, isProduction),
          pageTitle: "Doctor not found",
          shellVariant: "tenant",
          clinic,
        }));
      }

      return renderTenantView(req, res, clinic, "tenant/doctor-profile", {
        profile: profileResult.profile,
      });
    } catch (err) {
      return next(err);
    }
  });

  // P24–P26: Booking wizard, procedure booking, my-booking
  registerActiveClinicPublicBookingRoutes(app, {
    getPool,
    env,
    isProduction,
    respondDeps,
    issuePageCsrf,
    validateCsrf,
    bookingLimiter,
    lookupLimiter,
  });
}

module.exports = {
  registerActiveClinicPublicRoutes,
};
