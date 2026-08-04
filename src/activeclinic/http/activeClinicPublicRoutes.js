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
  createClinicRegistrationApplication,
} = require("../services/activeClinicPublicOnboardingService");
const {
  createPublicContactInquiry,
} = require("../services/activeClinicPublicContactService");
const {
  newRegistrationRequestId,
  classifyRegistrationError,
  logClinicApplicationFailed,
  logClinicApplicationCreated,
} = require("../services/activeClinicPublicRegistrationLog");
const { resolveDeploymentConfiguration } = require("../../platform/config/deploymentProfiles");
const { renderPublicView } = require("./renderActiveClinicPublic");
const { registerActiveClinicPublicBookingRoutes } = require("./activeClinicPublicBookingRoutes");
const {
  sendClinicResolveFailure,
  resolveClinicOrRespond,
} = require("./activeClinicPublicRespond");

function clientIp(req) {
  return String((req.headers && req.headers["x-forwarded-for"]) || req.ip || (req.socket && req.socket.remoteAddress) || "").split(",")[0].trim();
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function issuePageCsrf(res, env, isProduction) {
  const token = issueCsrfToken(env);
  setCsrfCookie(res, token, { secure: isProduction, env });
  return token;
}

function resolveDirectorySearchQuery(req) {
  const q = req.query.q != null ? String(req.query.q) : "";
  const search = req.query.search != null ? String(req.query.search) : "";
  return (q || search || "").trim();
}

function registerFormDataFromBody(body) {
  const fd = body || {};
  return {
    clinicName: fd.clinicName || "",
    contactName: fd.contactName || "",
    contactEmail: fd.contactEmail || "",
    contactPhone: fd.contactPhone || "",
    province: fd.province || "",
    city: fd.city || "",
    countryCode: fd.countryCode || "ZM",
    notes: fd.notes || "",
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

  app.get("/solutions", (req, res) => {
    const csrfToken = issuePageCsrf(res, env, isProduction);
    return res.status(200).type("html").send(renderPublicView("public/solutions", { csrfToken }));
  });

  app.get("/clinics", async (req, res) => {
    const search = resolveDirectorySearchQuery(req);
    const province = req.query.province || null;
    const city = req.query.city || null;
    const csrfToken = issuePageCsrf(res, env, isProduction);

    if (req.query._directoryLoading === "1" && String(env.NODE_ENV || "") === "test") {
      return res.status(200).type("html").send(renderPublicView("public/clinics-directory", {
        csrfToken,
        clinics: [],
        search,
        province,
        city,
        directoryState: "loading",
      }));
    }

    try {
      const result = await fetchDirectoryClinics(getPool, env, req, { search, province, city });
      const clinics = result.clinics || [];

      return res.status(200).type("html").send(renderPublicView("public/clinics-directory", {
        csrfToken,
        clinics,
        search,
        province,
        city,
        directoryState: "ready",
        directoryEmpty: clinics.length === 0,
      }));
    } catch (err) {
      return res.status(503).type("html").send(renderPublicView("public/clinics-directory", {
        csrfToken,
        clinics: [],
        search,
        province,
        city,
        directoryState: "error",
      }));
    }
  });

  app.get("/clinics/search", async (req, res) => {
    const search = resolveDirectorySearchQuery(req);
    const province = req.query.province || null;
    const city = req.query.city || null;
    const csrfToken = issuePageCsrf(res, env, isProduction);

    try {
      const result = await fetchDirectoryClinics(getPool, env, req, { search, province, city });
      const clinics = result.clinics || [];

      return res.status(200).type("html").send(renderPublicView("public/clinics-search", {
        csrfToken,
        clinics,
        search,
        province,
        city,
        directoryState: "ready",
        directoryEmpty: clinics.length === 0,
      }));
    } catch (err) {
      return res.status(503).type("html").send(renderPublicView("public/clinics-search", {
        csrfToken,
        clinics: [],
        search,
        province,
        city,
        directoryState: "error",
      }));
    }
  });

  app.get("/register-clinic", (req, res) => {
    const csrfToken = issuePageCsrf(res, env, isProduction);
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
      const csrfToken = issuePageCsrf(res, env, isProduction);
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
        const result = await createClinicRegistrationApplication(getPool(), formData);

        if (!result.ok) {
          const csrfToken = issuePageCsrf(res, env, isProduction);
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
            return res.status(400).type("html").send(renderPublicView("public/register-clinic", {
              csrfToken,
              error: "An application with this email was recently submitted. It remains pending review — a second copy was not created.",
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
            return res.status(400).type("html").send(renderPublicView("public/register-clinic", {
              csrfToken,
              error: null,
              formState: "validation_error",
              validationErrors: result.errors,
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
        return res.redirect(303, `/register-clinic/success?ref=${encodeURIComponent(result.application.applicationNumber)}`);
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
        const csrfToken = issuePageCsrf(res, env, isProduction);
        return res.status(500).type("html").send(renderPublicView("public/register-clinic-server-error", {
          csrfToken,
          formData,
          requestId,
          schemaHint: classified.category === "schema_missing" || classified.category === "schema_column_missing",
        }));
      }
    }

    const validated = validateClinicRegistrationInput(formData);
    const csrfToken = issuePageCsrf(res, env, isProduction);

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
        countryCode: validated.normalized.countryCode,
        notes: validated.normalized.notes || "",
      },
    }));
  });

  app.get("/register-clinic/success", (req, res) => {
    const csrfToken = issuePageCsrf(res, env, isProduction);
    const applicationReference = String(req.query.ref || "").trim().slice(0, 64);
    return res.status(200).type("html").send(renderPublicView("public/register-clinic-success", {
      csrfToken,
      applicationReference: applicationReference || null,
    }));
  });

  // ========== Tenant Public Routes ==========

  app.get("/clinics/:clinicKey", async (req, res, next) => {
    try {
      const clinic = await resolveClinicOrRespond(getPool, req, res, respondDeps);
      if (!clinic) return undefined;

      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(200).type("html").send(renderPublicView("tenant/home", {
        csrfToken,
        clinic,
      }));
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/about", async (req, res, next) => {
    try {
      const clinic = await resolveClinicOrRespond(getPool, req, res, respondDeps);
      if (!clinic) return undefined;

      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(200).type("html").send(renderPublicView("tenant/about", {
        csrfToken,
        clinic,
      }));
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/contact", async (req, res, next) => {
    try {
      const clinic = await resolveClinicOrRespond(getPool, req, res, respondDeps);
      if (!clinic) return undefined;

      const csrfToken = issuePageCsrf(res, env, isProduction);
      if (req.query.submitted === "1") {
        return res.status(200).type("html").send(renderPublicView("tenant/contact-success", {
          csrfToken,
          clinic,
        }));
      }

      return res.status(200).type("html").send(renderPublicView("tenant/contact", {
        csrfToken,
        clinic,
        error: null,
        formData: {},
      }));
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/contact/success", async (req, res, next) => {
    try {
      const clinic = await resolveClinicOrRespond(getPool, req, res, respondDeps);
      if (!clinic) return undefined;

      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(200).type("html").send(renderPublicView("tenant/contact-success", {
        csrfToken,
        clinic,
      }));
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

      return res.redirect(303, `/clinics/${req.params.clinicKey}/contact/success`);
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

      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(200).type("html").send(renderPublicView("tenant/pricing", {
        csrfToken,
        clinic,
        pricePatterns: priceResult.patterns || [],
      }));
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/location", async (req, res, next) => {
    try {
      const clinic = await resolveClinicOrRespond(getPool, req, res, respondDeps);
      if (!clinic) return undefined;

      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(200).type("html").send(renderPublicView("tenant/location", {
        csrfToken,
        clinic,
      }));
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/patient-information", async (req, res, next) => {
    try {
      const clinic = await resolveClinicOrRespond(getPool, req, res, respondDeps);
      if (!clinic) return undefined;

      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(200).type("html").send(renderPublicView("tenant/patient-information", {
        csrfToken,
        clinic,
      }));
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/privacy", async (req, res, next) => {
    try {
      const clinic = await resolveClinicOrRespond(getPool, req, res, respondDeps);
      if (!clinic) return undefined;

      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(200).type("html").send(renderPublicView("tenant/privacy", {
        csrfToken,
        clinic,
      }));
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/terms", async (req, res, next) => {
    try {
      const clinic = await resolveClinicOrRespond(getPool, req, res, respondDeps);
      if (!clinic) return undefined;

      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(200).type("html").send(renderPublicView("tenant/terms", {
        csrfToken,
        clinic,
      }));
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

      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(200).type("html").send(renderPublicView("tenant/services", {
        csrfToken,
        clinic,
        services: servicesResult.services || [],
        procedures: proceduresResult.procedures || [],
      }));
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
      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(200).type("html").send(renderPublicView("tenant/service-detail", {
        csrfToken,
        clinic,
        service: serviceResult.service,
        serviceKind,
      }));
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

      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(200).type("html").send(renderPublicView("tenant/procedure-detail", {
        csrfToken,
        clinic,
        procedure: procedureResult.procedure,
      }));
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

      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(200).type("html").send(renderPublicView("tenant/doctors", {
        csrfToken,
        clinic,
        profiles: profilesResult.profiles || [],
      }));
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

      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(200).type("html").send(renderPublicView("tenant/doctor-profile", {
        csrfToken,
        clinic,
        profile: profileResult.profile,
      }));
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
