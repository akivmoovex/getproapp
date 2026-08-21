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
  listWebsiteServices,
  getWebsiteService,
  listPublicProcedures,
  getPublicProcedure,
  listPublicPricePatterns,
} = require("../services/activeClinicPublicVisibilityService");
const {
  validateClinicRegistrationInput,
  listClinicTypeOptions,
  clinicTypeLabel,
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
  applyLibraryPresentation,
  libraryItemIsHidden,
} = require("../website/clinicWebsiteCms");
const {
  createPublicContactInquiry,
  createPlatformContactInquiry,
  describePlatformContactErrors,
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
const { attachActiveClinicWebsiteLocals, canEditClinicWebsite } = require("./attachActiveClinicWebsiteChrome");
const { resolvePublicPricingDisplay } = require("../website/publicPricingDisplay");
const cmsService = require("../website/clinicWebsiteCmsService");
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

function resolveDirectoryFilters(req) {
  const search = resolveDirectorySearchQuery(req);
  const province = req.query.province ? String(req.query.province).trim() : null;
  const city = req.query.city ? String(req.query.city).trim() : null;
  const location = req.query.location ? String(req.query.location).trim() : null;
  const service = req.query.service ? String(req.query.service).trim() : null;
  return { search, province, city, location, service };
}

const PLATFORM_CONTACT_OK_COOKIE = "ac_platform_contact_ok";

function setPlatformContactOkCookie(res, isProduction) {
  res.cookie(PLATFORM_CONTACT_OK_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: Boolean(isProduction),
    maxAge: 10 * 60 * 1000,
    path: "/contact",
  });
}

function clearPlatformContactOkCookie(res, isProduction) {
  res.cookie(PLATFORM_CONTACT_OK_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: Boolean(isProduction),
    maxAge: 0,
    path: "/contact",
  });
}

function hasPlatformContactOkCookie(req) {
  const raw = req.headers && req.headers.cookie ? String(req.headers.cookie) : "";
  return raw.split(";").some((part) => part.trim().startsWith(`${PLATFORM_CONTACT_OK_COOKIE}=1`));
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
    clinicType: fd.clinicType || fd.facilityType || "",
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

function inferRegisterAction(action, formData) {
  const value = String(action || "").trim().toLowerCase();
  if (value) return value;
  if (formData.password || formData.contactName || formData.contactEmail) return "next-admin";
  return "next-clinic";
}

function registerReviewFormData(formData, validated) {
  const n = (validated && validated.normalized) || {};
  const clinicType = n.clinicType || formData.clinicType || "clinic";
  return {
    clinicName: n.clinicName || formData.clinicName || "",
    clinicType,
    clinicTypeLabel: clinicTypeLabel(clinicType),
    contactName: n.contactName || formData.contactName || "",
    contactEmail: n.contactEmailDisplay || formData.contactEmail || "",
    contactPhone: n.contactPhoneDisplay || formData.contactPhone || "",
    province: n.province || formData.province || "",
    city: n.city || formData.city || "",
    address: n.address || formData.address || "",
    countryCode: n.countryCode || formData.countryCode || "ZM",
    notes: n.notes || formData.notes || "",
    phoneCountry: formData.phoneCountry || "",
    phoneNational: formData.phoneNational || "",
    password: formData.password || "",
    passwordConfirm: formData.passwordConfirm || "",
  };
}

function registerPageLocals(extra) {
  const step = extra.wizardStep || "clinic";
  const titles = {
    clinic: "Register your clinic",
    administrator: "Administrator details",
    review: "Review your details",
    success: "Clinic created",
    error: "Registration unavailable",
  };
  return {
    pageTitle: extra.pageTitle || titles[step] || "Register your clinic",
    pageId: extra.pageId || "public-register-clinic",
    chrome: extra.chrome || "mf-register",
    clinicTypeOptions: listClinicTypeOptions(),
    wizardStep: step,
    formState: extra.formState || "form",
    validationErrors: extra.validationErrors || {},
    formData: extra.formData || {},
    error: extra.error || null,
    ...extra,
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
    const presented = website.clinic || clinic;
    const library = presented && presented.cmsLibrary;
    if (template === "tenant/doctors") {
      extras.profiles = applyLibraryPresentation(
        extras.profiles || presented.doctors || [],
        library,
        "doctor",
        "staffKey"
      );
    }
    if (template === "tenant/services") {
      extras.services = applyLibraryPresentation(
        extras.services || presented.services || [],
        library,
        "service",
        "serviceKey"
      );
    }
    if (template === "tenant/pricing") {
      extras.pricingDisplay = resolvePublicPricingDisplay({
        patterns: extras.pricePatterns || [],
        insuranceIntro:
          presented && presented.websiteContent ? presented.websiteContent["insurance.intro"] : null,
        pageVisible: presented ? presented.showPricing !== false : true,
      });
    }
    return res.status(200).type("html").send(renderPublicView(template, {
      csrfToken,
      ...website,
      clinic: presented,
      pageTitle: extras.pageTitle || (presented && (presented.seoTitle || presented.websiteDisplayName || presented.publicName)) || "ActiveClinic",
      metaDescription: extras.metaDescription || (presented && presented.seoDescription) || "",
      ogImageUrl: extras.ogImageUrl || (presented && presented.seoImageUrl) || "",
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
      return res.status(429).type("html").send(renderPublicView("public/register-clinic", registerPageLocals({
        csrfToken,
        error: "Too many requests. Please try again later.",
        formState: "form",
        validationErrors: {},
        formData: registerFormDataFromBody(req.body),
        wizardStep: "clinic",
      })));
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
    // Public ACW01 homepage for the ActiveClinic product host. Do not send
    // visitors (anonymous or signed-in) to /login or /app from `/`.
    const csrfToken = issuePageCsrf(res, env, isProduction, req);
    return res.status(200).type("html").send(renderPublicView("public/home", {
      csrfToken,
      pageTitle: "ActiveClinic",
      pageId: "public-home",
    }));
  });

  app.get("/about", (req, res) => {
    const csrfToken = issuePageCsrf(res, env, isProduction);
    return res.status(200).type("html").send(renderPublicView("public/about", {
      csrfToken,
      pageTitle: "About ActiveClinic",
      pageId: "public-about",
    }));
  });

  app.get("/for-clinics", (req, res) => {
    const csrfToken = issuePageCsrf(res, env, isProduction);
    return res.status(200).type("html").send(renderPublicView("public/for-clinics", {
      csrfToken,
      pageTitle: "For Clinics",
      pageId: "public-for-clinics",
    }));
  });

  app.get("/features", (req, res) => {
    const csrfToken = issuePageCsrf(res, env, isProduction);
    return res.status(200).type("html").send(renderPublicView("public/features", {
      csrfToken,
      pageTitle: "Platform features",
      pageId: "public-features",
    }));
  });

  app.get("/clinic-website", (req, res) => {
    const csrfToken = issuePageCsrf(res, env, isProduction);
    return res.status(200).type("html").send(renderPublicView("public/clinic-website", {
      csrfToken,
      pageTitle: "Clinic websites",
      pageId: "public-clinic-website",
    }));
  });

  app.get("/for-patients", (req, res) => {
    const csrfToken = issuePageCsrf(res, env, isProduction);
    return res.status(200).type("html").send(renderPublicView("public/for-patients", {
      csrfToken,
      pageTitle: "For Patients",
      pageId: "public-for-patients",
    }));
  });

  const contactLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: String(env.NODE_ENV || "") === "test" ? 1000 : 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => sha256Hex(`platform-contact|${clientIp(req)}`),
    handler: (req, res) => {
      const csrfToken = issuePageCsrf(res, env, isProduction, req);
      return res.status(429).type("html").send(renderPublicView("public/contact", {
        csrfToken,
        pageTitle: "Contact",
        pageId: "public-contact",
        error: "Too many requests. Please try again later.",
        validationErrors: {},
        formData: req.body || {},
      }));
    },
  });

  app.get("/contact", (req, res) => {
    const csrfToken = issuePageCsrf(res, env, isProduction, req);
    return res.status(200).type("html").send(renderPublicView("public/contact", {
      csrfToken,
      pageTitle: "Contact",
      pageId: "public-contact",
      error: null,
      validationErrors: {},
      formData: {},
    }));
  });

  app.get("/contact/success", (req, res) => {
    if (!hasPlatformContactOkCookie(req)) {
      return res.redirect(303, "/contact");
    }
    clearPlatformContactOkCookie(res, isProduction);
    const csrfToken = issuePageCsrf(res, env, isProduction, req);
    return res.status(200).type("html").send(renderPublicView("public/contact-success", {
      csrfToken,
      pageTitle: "Message received",
      pageId: "public-contact-success",
      robots: "noindex, nofollow",
    }));
  });

  app.post("/contact", contactLimiter, async (req, res, next) => {
    try {
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        const csrfToken = issuePageCsrf(res, env, isProduction, req);
        return res.status(403).type("html").send(renderPublicView("public/contact", {
          csrfToken,
          pageTitle: "Contact",
          pageId: "public-contact",
          error: "Your session expired. Please try again.",
          validationErrors: {},
          formData: req.body || {},
        }));
      }

      const result = await createPlatformContactInquiry(getPool(), {
        senderName: req.body && req.body.senderName,
        senderEmail: req.body && req.body.senderEmail,
        senderPhone: req.body && req.body.senderPhone,
        phoneCountry: req.body && (req.body.phone_country || req.body.phoneCountry),
        phoneNational: req.body && (req.body.phone_national || req.body.phoneNational),
        message: req.body && req.body.message,
      });

      if (!result.ok) {
        const csrfToken = issuePageCsrf(res, env, isProduction, req);
        return res.status(400).type("html").send(renderPublicView("public/contact", {
          csrfToken,
          pageTitle: "Contact",
          pageId: "public-contact",
          error: "Please check your information and try again.",
          validationErrors: describePlatformContactErrors(result.code),
          formData: req.body || {},
        }));
      }

      setPlatformContactOkCookie(res, isProduction);
      return res.redirect(303, "/contact/success");
    } catch (err) {
      return next(err);
    }
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
    return res.status(200).type("html").send(renderPublicView("public/for-clinics", {
      csrfToken,
      pageTitle: "For Clinics",
      pageId: "public-solutions",
    }));
  });

  app.get("/clinics", async (req, res) => {
    const filters = resolveDirectoryFilters(req);
    const csrfToken = issuePageCsrf(res, env, isProduction);
    const filtersPresent = Boolean(filters.search || filters.province || filters.city || filters.location || filters.service);
    const requestId = newDirectoryRequestId();
    const deployment = resolveDeploymentConfiguration(env);

    if (req.query._directoryLoading === "1" && String(env.NODE_ENV || "") === "test") {
      return res.status(200).type("html").send(renderPublicView("public/clinics-directory", {
        csrfToken,
        clinics: [],
        ...filters,
        directoryState: "loading",
        requestId,
        pageTitle: "Find a Clinic",
        pageId: "public-clinics-directory",
      }));
    }

    try {
      const result = await fetchDirectoryClinics(getPool, env, req, filters);
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
        ...filters,
        directoryState: "ready",
        directoryEmpty: clinics.length === 0,
        requestId,
        pageTitle: "Find a Clinic",
        pageId: "public-clinics-directory",
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
        ...filters,
        directoryState: "error",
        requestId,
        schemaHint: classified.category === "schema_missing" || classified.category === "schema_column_missing",
        pageTitle: "Find a Clinic",
        pageId: "public-clinics-directory",
      }));
    }
  });

  app.get("/clinics/search", async (req, res) => {
    const filters = resolveDirectoryFilters(req);
    const csrfToken = issuePageCsrf(res, env, isProduction);
    const filtersPresent = Boolean(filters.search || filters.province || filters.city || filters.location || filters.service);
    const requestId = newDirectoryRequestId();
    const deployment = resolveDeploymentConfiguration(env);

    try {
      const result = await fetchDirectoryClinics(getPool, env, req, filters);
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
        ...filters,
        directoryState: "ready",
        directoryEmpty: clinics.length === 0,
        requestId,
        pageTitle: "Search clinics",
        pageId: "public-clinics-search",
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
        ...filters,
        directoryState: "error",
        requestId,
        schemaHint: classified.category === "schema_missing" || classified.category === "schema_column_missing",
        pageTitle: "Search clinics",
        pageId: "public-clinics-search",
      }));
    }
  });

  app.get("/register-clinic", (req, res) => {
    const csrfToken = issuePageCsrf(res, env, isProduction, req);
    return res.status(200).type("html").send(renderPublicView("public/register-clinic", registerPageLocals({
      csrfToken,
      wizardStep: "clinic",
      formData: { countryCode: "ZM", clinicType: "clinic" },
    })));
  });

  app.post("/register-clinic", registerLimiter, async (req, res) => {
    const formData = registerFormDataFromBody(req.body);
    const action = inferRegisterAction(req.body && req.body.action, formData);

    if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
      const csrfToken = issuePageCsrf(res, env, isProduction, req);
      return res.status(403).type("html").send(renderPublicView("public/register-clinic", registerPageLocals({
        csrfToken,
        error: "Your session expired. Please try again.",
        formData,
        wizardStep: action === "next-admin" || action === "edit-admin" ? "administrator" : "clinic",
      })));
    }

    if (action === "edit-clinic") {
      const csrfToken = issuePageCsrf(res, env, isProduction, req);
      return res.status(200).type("html").send(renderPublicView("public/register-clinic", registerPageLocals({
        csrfToken,
        formData,
        wizardStep: "clinic",
      })));
    }

    if (action === "edit-admin") {
      const csrfToken = issuePageCsrf(res, env, isProduction, req);
      return res.status(200).type("html").send(renderPublicView("public/register-clinic", registerPageLocals({
        csrfToken,
        formData,
        wizardStep: "administrator",
      })));
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
            return res.status(400).type("html").send(renderPublicView("public/register-clinic", registerPageLocals({
              csrfToken,
              error: dupMessage,
              formData,
              wizardStep: "administrator",
            })));
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
              return res.status(400).type("html").send(renderPublicView("public/register-clinic-review", registerPageLocals({
                csrfToken,
                error: result.errors.acceptTerms,
                validationErrors: result.errors,
                formData: registerReviewFormData(formData),
                wizardStep: "review",
              })));
            }
            const adminError = result.errors.contactName
              || result.errors.contactEmail
              || result.errors.contactPhone
              || result.errors.password
              || result.errors.passwordConfirm;
            return res.status(400).type("html").send(renderPublicView("public/register-clinic", registerPageLocals({
              csrfToken,
              formState: "validation_error",
              validationErrors: result.errors,
              formData,
              wizardStep: adminError ? "administrator" : "clinic",
            })));
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
            return res.status(503).type("html").send(renderPublicView("public/register-clinic", registerPageLocals({
              csrfToken,
              error:
                "Clinic registration is temporarily unavailable because this deployment’s database schema is incomplete. No application was created.",
              formData,
              wizardStep: "clinic",
            })));
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
          return res.status(400).type("html").send(renderPublicView("public/register-clinic", registerPageLocals({
            csrfToken,
            error: "Please check your information and try again.",
            formData,
            wizardStep: "clinic",
          })));
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
        return res.status(500).type("html").send(renderPublicView("public/register-clinic-server-error", registerPageLocals({
          csrfToken,
          formData,
          requestId,
          schemaHint: classified.category === "schema_missing" || classified.category === "schema_column_missing",
          wizardStep: "error",
          pageId: "public-register-clinic-server-error",
        })));
      }
    }

    const csrfToken = issuePageCsrf(res, env, isProduction, req);

    if (action === "next-clinic") {
      const validated = validateClinicRegistrationInput(formData, { step: "clinic" });
      if (!validated.ok) {
        return res.status(400).type("html").send(renderPublicView("public/register-clinic", registerPageLocals({
          csrfToken,
          formState: "validation_error",
          validationErrors: validated.errors,
          formData,
          wizardStep: "clinic",
        })));
      }
      return res.status(200).type("html").send(renderPublicView("public/register-clinic", registerPageLocals({
        csrfToken,
        formData: {
          ...formData,
          clinicName: validated.normalized.clinicName,
          clinicType: validated.normalized.clinicType,
          countryCode: validated.normalized.countryCode,
          province: validated.normalized.province || "",
          city: validated.normalized.city || "",
          address: validated.normalized.address || "",
          notes: validated.normalized.notes || "",
        },
        wizardStep: "administrator",
      })));
    }

    const validated = validateClinicRegistrationInput(formData);
    if (!validated.ok) {
      const adminError = validated.errors.contactName
        || validated.errors.contactEmail
        || validated.errors.contactPhone
        || validated.errors.password
        || validated.errors.passwordConfirm;
      return res.status(400).type("html").send(renderPublicView("public/register-clinic", registerPageLocals({
        csrfToken,
        formState: "validation_error",
        validationErrors: validated.errors,
        formData,
        wizardStep: adminError ? "administrator" : "clinic",
      })));
    }

    return res.status(200).type("html").send(renderPublicView("public/register-clinic-review", registerPageLocals({
      csrfToken,
      formData: registerReviewFormData(formData, validated),
      wizardStep: "review",
    })));
  });

  app.get("/register-clinic/success", (req, res) => {
    const csrfToken = issuePageCsrf(res, env, isProduction, req);
    const applicationReference = String(req.query.ref || "").trim().slice(0, 64);
    const reviewRequired = String(req.query.review || "") === "1";
    const ready = String(req.query.ready || "") === "1";
    return res.status(200).type("html").send(renderPublicView("public/register-clinic-success", registerPageLocals({
      csrfToken,
      applicationReference: applicationReference || null,
      reviewRequired,
      ready: ready && !reviewRequired,
      wizardStep: "success",
      pageId: "public-register-clinic-success",
    })));
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

      const servicesResult = await listWebsiteServices(getPool(), {
        organizationId: clinic.organizationId,
        healthcareOrganizationId: clinic.healthcareOrganizationId,
      });

      const proceduresResult = await listPublicProcedures(getPool(), {
        organizationId: clinic.organizationId,
        healthcareOrganizationId: clinic.healthcareOrganizationId,
      });

      return renderTenantView(req, res, clinic, "tenant/services", {
        services: applyLibraryPresentation(
          servicesResult.services || [],
          clinic.cmsLibrary,
          "service",
          "serviceKey"
        ),
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

      const serviceResult = await getWebsiteService(getPool(), {
        organizationId: clinic.organizationId,
        healthcareOrganizationId: clinic.healthcareOrganizationId,
        serviceKey: req.params.serviceKey,
      });

      const presentedClinic = (await attachActiveClinicWebsiteLocals(getPool(), req, clinic)).clinic || clinic;
      if (!serviceResult.ok || libraryItemIsHidden(presentedClinic.cmsLibrary, "service", req.params.serviceKey)) {
        return res.status(404).type("html").send(renderPublicView("tenant/clinic-not-found", {
          csrfToken: issuePageCsrf(res, env, isProduction),
          pageTitle: "Service not found",
          shellVariant: "tenant",
          clinic,
        }));
      }

      const serviceKind =
        clinic.publicBookingEnabled && serviceResult.service && serviceResult.service.bookable
          ? "consultation"
          : "informational";
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
        profiles: applyLibraryPresentation(
          profilesResult.profiles || [],
          clinic.cmsLibrary,
          "doctor",
          "staffKey"
        ),
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

      const presentedClinic = (await attachActiveClinicWebsiteLocals(getPool(), req, clinic)).clinic || clinic;
      if (!profileResult.ok || libraryItemIsHidden(presentedClinic.cmsLibrary, "doctor", req.params.staffKey)) {
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

  app.get("/clinics/:clinicKey/p/:pageSlug", async (req, res, next) => {
    try {
      const clinic = await resolveClinicOrRespond(getPool, req, res, respondDeps);
      if (!clinic) return undefined;
      const website = await attachActiveClinicWebsiteLocals(getPool(), req, clinic);
      const pages = (website.clinic && website.clinic.cmsPages) || [];
      const blocks = (website.clinic && website.clinic.cmsBlocks) || [];
      const allowDraft =
        canEditClinicWebsite(req, clinic) &&
        (String(req.query.website_mode || "") === "draft" || String(req.query.website_edit || "") === "1");
      const page = allowDraft
        ? cmsService.findDraftCustomPageBySlug(pages, req.params.pageSlug)
        : cmsService.findCustomPageBySlug(pages, req.params.pageSlug);
      if (!page) {
        return res.status(404).type("html").send(
          renderPublicView("tenant/clinic-not-found", {
            csrfToken: issuePageCsrf(res, env, isProduction),
            pageTitle: "Page not found",
            shellVariant: "tenant",
            clinic: website.clinic || clinic,
          })
        );
      }
      const pageBlocks = blocks.filter((block) => block && block.page_id === page.id);
      return renderTenantView(req, res, clinic, "tenant/custom-page", {
        customPage: page,
        pageBlocks,
        pageTitle: page.meta_title || page.title || clinic.publicName,
        metaDescription: page.meta_description || "",
      });
    } catch (err) {
      return next(err);
    }
  });
}

module.exports = {
  registerActiveClinicPublicRoutes,
};
