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
} = require("../services/activeClinicPublicVisibilityService");
const {
  createClinicRegistrationApplication,
} = require("../services/activeClinicPublicOnboardingService");
const {
  createPublicContactInquiry,
} = require("../services/activeClinicPublicContactService");
const {
  createConsultationBookingRequest,
  createProcedureBookingRequest,
} = require("../services/activeClinicPublicBookingService");
const {
  verifyBookingAccessToken,
  requestBookingCancellation,
  requestBookingReschedule,
} = require("../services/activeClinicPublicBookingLookupService");
const { renderPublicView } = require("./renderActiveClinicPublic");

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

/**
 * @param {import('express').Express} app
 * @param {{ getPool: Function, env: NodeJS.ProcessEnv, isProduction: boolean }} deps
 */
function registerActiveClinicPublicRoutes(app, deps) {
  const getPool = deps.getPool;
  const env = deps.env;
  const isProduction = deps.isProduction;

  // Rate limiters
  const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: String(env.NODE_ENV || "") === "test" ? 1000 : 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => sha256Hex(`register|${req.body && req.body.contactEmail}|${clientIp(req)}`),
    handler: (req, res) => {
      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(429).type("html").send(renderPublicView("public/register-clinic", { csrfToken, error: "Too many requests. Please try again later." }));
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

  app.get("/clinics", async (req, res, next) => {
    try {
      const search = req.query.search || "";
      const province = req.query.province || null;
      const city = req.query.city || null;

      const result = await listPublishableClinics(getPool(), { search, province, city });
      const csrfToken = issuePageCsrf(res, env, isProduction);

      return res.status(200).type("html").send(renderPublicView("public/clinics-directory", {
        csrfToken,
        clinics: result.clinics || [],
        search,
        province,
        city,
      }));
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/search", async (req, res, next) => {
    try {
      const search = req.query.q || "";
      const province = req.query.province || null;
      const city = req.query.city || null;

      const result = await listPublishableClinics(getPool(), { search, province, city });
      const csrfToken = issuePageCsrf(res, env, isProduction);

      return res.status(200).type("html").send(renderPublicView("public/clinics-search", {
        csrfToken,
        clinics: result.clinics || [],
        search,
        province,
        city,
      }));
    } catch (err) {
      return next(err);
    }
  });

  app.get("/register-clinic", (req, res) => {
    const csrfToken = issuePageCsrf(res, env, isProduction);
    return res.status(200).type("html").send(renderPublicView("public/register-clinic", {
      csrfToken,
      error: null,
      formData: {},
    }));
  });

  app.post("/register-clinic", registerLimiter, async (req, res, next) => {
    try {
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        const csrfToken = issuePageCsrf(res, env, isProduction);
        return res.status(403).type("html").send(renderPublicView("public/register-clinic", {
          csrfToken,
          error: "Your session expired. Please try again.",
          formData: req.body || {},
        }));
      }

      const result = await createClinicRegistrationApplication(getPool(), {
        clinicName: req.body.clinicName,
        contactName: req.body.contactName,
        contactEmail: req.body.contactEmail,
        contactPhone: req.body.contactPhone,
        province: req.body.province || null,
        city: req.body.city || null,
        countryCode: req.body.countryCode || "ZM",
        notes: req.body.notes || null,
      });

      if (!result.ok) {
        const csrfToken = issuePageCsrf(res, env, isProduction);
        return res.status(400).type("html").send(renderPublicView("public/register-clinic", {
          csrfToken,
          error: result.code === "duplicate_application" ? "An application with this email was recently submitted." : "Please check your information and try again.",
          formData: req.body || {},
        }));
      }

      return res.redirect(303, "/register-clinic/success");
    } catch (err) {
      return next(err);
    }
  });

  app.get("/register-clinic/success", (req, res) => {
    const csrfToken = issuePageCsrf(res, env, isProduction);
    return res.status(200).type("html").send(renderPublicView("public/register-clinic-success", { csrfToken }));
  });

  // ========== Tenant Public Routes ==========

  app.get("/clinics/:clinicKey", async (req, res, next) => {
    try {
      const result = await resolvePublishableClinicByKey(getPool(), { clinicKey: req.params.clinicKey });
      if (!result.ok) {
        return res.status(404).type("html").send("<h1>Clinic Not Found</h1><p>This clinic is not available.</p>");
      }

      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(200).type("html").send(renderPublicView("tenant/home", {
        csrfToken,
        clinic: result.clinic,
      }));
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/about", async (req, res, next) => {
    try {
      const result = await resolvePublishableClinicByKey(getPool(), { clinicKey: req.params.clinicKey });
      if (!result.ok) {
        return res.status(404).type("html").send("<h1>Clinic Not Found</h1>");
      }

      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(200).type("html").send(renderPublicView("tenant/about", {
        csrfToken,
        clinic: result.clinic,
      }));
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/contact", async (req, res, next) => {
    try {
      const result = await resolvePublishableClinicByKey(getPool(), { clinicKey: req.params.clinicKey });
      if (!result.ok) {
        return res.status(404).type("html").send("<h1>Clinic Not Found</h1>");
      }

      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(200).type("html").send(renderPublicView("tenant/contact", {
        csrfToken,
        clinic: result.clinic,
        error: null,
        formData: {},
      }));
    } catch (err) {
      return next(err);
    }
  });

  app.post("/clinics/:clinicKey/contact", async (req, res, next) => {
    try {
      const clinicResult = await resolvePublishableClinicByKey(getPool(), { clinicKey: req.params.clinicKey });
      if (!clinicResult.ok) {
        return res.status(404).type("html").send("<h1>Clinic Not Found</h1>");
      }

      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        const csrfToken = issuePageCsrf(res, env, isProduction);
        return res.status(403).type("html").send(renderPublicView("tenant/contact", {
          csrfToken,
          clinic: clinicResult.clinic,
          error: "Your session expired. Please try again.",
          formData: req.body || {},
        }));
      }

      const result = await createPublicContactInquiry(getPool(), {
        organizationId: clinicResult.clinic.organizationId,
        healthcareOrganizationId: clinicResult.clinic.healthcareOrganizationId,
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
          clinic: clinicResult.clinic,
          error: "Please check your information and try again.",
          formData: req.body || {},
        }));
      }

      return res.redirect(303, `/clinics/${req.params.clinicKey}/contact?submitted=1`);
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/patient-information", async (req, res, next) => {
    try {
      const result = await resolvePublishableClinicByKey(getPool(), { clinicKey: req.params.clinicKey });
      if (!result.ok) {
        return res.status(404).type("html").send("<h1>Clinic Not Found</h1>");
      }

      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(200).type("html").send(renderPublicView("tenant/patient-information", {
        csrfToken,
        clinic: result.clinic,
      }));
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/privacy", async (req, res, next) => {
    try {
      const result = await resolvePublishableClinicByKey(getPool(), { clinicKey: req.params.clinicKey });
      if (!result.ok) {
        return res.status(404).type("html").send("<h1>Clinic Not Found</h1>");
      }

      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(200).type("html").send(renderPublicView("tenant/privacy", {
        csrfToken,
        clinic: result.clinic,
      }));
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/terms", async (req, res, next) => {
    try {
      const result = await resolvePublishableClinicByKey(getPool(), { clinicKey: req.params.clinicKey });
      if (!result.ok) {
        return res.status(404).type("html").send("<h1>Clinic Not Found</h1>");
      }

      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(200).type("html").send(renderPublicView("tenant/terms", {
        csrfToken,
        clinic: result.clinic,
      }));
    } catch (err) {
      return next(err);
    }
  });

  // P23: Services & Doctors
  app.get("/clinics/:clinicKey/services", async (req, res, next) => {
    try {
      const clinicResult = await resolvePublishableClinicByKey(getPool(), { clinicKey: req.params.clinicKey });
      if (!clinicResult.ok) {
        return res.status(404).type("html").send("<h1>Clinic Not Found</h1>");
      }

      const servicesResult = await listPublicServices(getPool(), {
        organizationId: clinicResult.clinic.organizationId,
        healthcareOrganizationId: clinicResult.clinic.healthcareOrganizationId,
      });

      const proceduresResult = await listPublicProcedures(getPool(), {
        organizationId: clinicResult.clinic.organizationId,
        healthcareOrganizationId: clinicResult.clinic.healthcareOrganizationId,
      });

      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(200).type("html").send(renderPublicView("tenant/services", {
        csrfToken,
        clinic: clinicResult.clinic,
        services: servicesResult.services || [],
        procedures: proceduresResult.procedures || [],
      }));
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/services/:serviceKey", async (req, res, next) => {
    try {
      const clinicResult = await resolvePublishableClinicByKey(getPool(), { clinicKey: req.params.clinicKey });
      if (!clinicResult.ok) {
        return res.status(404).type("html").send("<h1>Clinic Not Found</h1>");
      }

      const serviceResult = await getPublicService(getPool(), {
        organizationId: clinicResult.clinic.organizationId,
        healthcareOrganizationId: clinicResult.clinic.healthcareOrganizationId,
        serviceKey: req.params.serviceKey,
      });

      if (!serviceResult.ok) {
        return res.status(404).type("html").send("<h1>Service Not Found</h1>");
      }

      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(200).type("html").send(renderPublicView("tenant/service-detail", {
        csrfToken,
        clinic: clinicResult.clinic,
        service: serviceResult.service,
      }));
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/doctors", async (req, res, next) => {
    try {
      const clinicResult = await resolvePublishableClinicByKey(getPool(), { clinicKey: req.params.clinicKey });
      if (!clinicResult.ok) {
        return res.status(404).type("html").send("<h1>Clinic Not Found</h1>");
      }

      const profilesResult = await listPublicStaffProfiles(getPool(), {
        organizationId: clinicResult.clinic.organizationId,
        healthcareOrganizationId: clinicResult.clinic.healthcareOrganizationId,
      });

      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(200).type("html").send(renderPublicView("tenant/doctors", {
        csrfToken,
        clinic: clinicResult.clinic,
        profiles: profilesResult.profiles || [],
      }));
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/doctors/:staffKey", async (req, res, next) => {
    try {
      const clinicResult = await resolvePublishableClinicByKey(getPool(), { clinicKey: req.params.clinicKey });
      if (!clinicResult.ok) {
        return res.status(404).type("html").send("<h1>Clinic Not Found</h1>");
      }

      const profileResult = await getPublicStaffProfile(getPool(), {
        organizationId: clinicResult.clinic.organizationId,
        healthcareOrganizationId: clinicResult.clinic.healthcareOrganizationId,
        staffKey: req.params.staffKey,
      });

      if (!profileResult.ok) {
        return res.status(404).type("html").send("<h1>Doctor Not Found</h1>");
      }

      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(200).type("html").send(renderPublicView("tenant/doctor-profile", {
        csrfToken,
        clinic: clinicResult.clinic,
        profile: profileResult.profile,
      }));
    } catch (err) {
      return next(err);
    }
  });

  // P24: Booking (simplified stub — full wizard requires session state)
  app.get("/clinics/:clinicKey/book", async (req, res, next) => {
    try {
      const clinicResult = await resolvePublishableClinicByKey(getPool(), { clinicKey: req.params.clinicKey });
      if (!clinicResult.ok) {
        return res.status(404).type("html").send("<h1>Clinic Not Found</h1>");
      }

      if (!clinicResult.clinic.publicBookingEnabled) {
        return res.status(403).type("html").send("<h1>Booking Not Available</h1><p>Online booking is not enabled for this clinic.</p>");
      }

      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(200).type("html").send(renderPublicView("booking/appointment-entry", {
        csrfToken,
        clinic: clinicResult.clinic,
      }));
    } catch (err) {
      return next(err);
    }
  });


  app.post("/clinics/:clinicKey/book", bookingLimiter, async (req, res, next) => {
    try {
      const clinicResult = await resolvePublishableClinicByKey(getPool(), { clinicKey: req.params.clinicKey });
      if (!clinicResult.ok) {
        return res.status(404).type("html").send(renderPublicView("public/home", { csrfToken: issuePageCsrf(res, env, isProduction), pageTitle: "Not found" }));
      }
      const clinic = clinicResult.clinic;
      if (!clinic.publicBookingEnabled) {
        return res.status(403).type("html").send("<h1>Booking Not Available</h1>");
      }
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        const csrfToken = issuePageCsrf(res, env, isProduction);
        return res.status(403).type("html").send(renderPublicView("booking/appointment-entry", {
          csrfToken, clinic, error: "Your session expired. Please try again.", formData: req.body || {},
        }));
      }
      const facilityId = clinic.primaryFacilityId;
      if (!facilityId) {
        const csrfToken = issuePageCsrf(res, env, isProduction);
        return res.status(400).type("html").send(renderPublicView("booking/appointment-entry", {
          csrfToken, clinic, error: "No bookable facility is available.", formData: req.body || {},
        }));
      }

      let serviceTypeId = null;
      const serviceKey = String((req.body && req.body.serviceKey) || "").trim();
      if (serviceKey) {
        const service = await getPublicService(getPool(), {
          organizationId: clinic.organizationId,
          healthcareOrganizationId: clinic.healthcareOrganizationId,
          serviceKey,
        });
        if (service.ok) serviceTypeId = service.service.id;
      }

      const result = await createConsultationBookingRequest(getPool(), {
        organizationId: clinic.organizationId,
        healthcareOrganizationId: clinic.healthcareOrganizationId,
        facilityId,
        serviceTypeId,
        patientFirstName: req.body.patientFirstName,
        patientLastName: req.body.patientLastName,
        patientPhone: req.body.patientPhone,
        patientEmail: req.body.patientEmail,
        visitReason: req.body.visitReason,
        preferredStartsAt: req.body.preferredStartsAt || null,
        timezone: clinic.timezone || "Africa/Lusaka",
        idempotencyKey: req.body.idempotencyKey || undefined,
      });

      if (!result.ok) {
        const csrfToken = issuePageCsrf(res, env, isProduction);
        return res.status(400).type("html").send(renderPublicView("booking/appointment-entry", {
          csrfToken, clinic, error: "Unable to submit booking request. Check your details and try again.",
          formData: req.body || {},
        }));
      }

      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(200).type("html").send(renderPublicView("booking/request-submitted", {
        csrfToken,
        clinic,
        booking: result.booking,
        accessToken: result.booking.accessToken,
        pageTitle: "Request submitted",
        robots: "noindex",
      }));
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/book/procedures/:procedureKey", async (req, res, next) => {
    try {
      const clinicResult = await resolvePublishableClinicByKey(getPool(), { clinicKey: req.params.clinicKey });
      if (!clinicResult.ok) return res.status(404).type("html").send("<h1>Clinic Not Found</h1>");
      if (!clinicResult.clinic.publicBookingEnabled) return res.status(403).type("html").send("<h1>Booking Not Available</h1>");
      const procedureResult = await getPublicProcedure(getPool(), {
        organizationId: clinicResult.clinic.organizationId,
        healthcareOrganizationId: clinicResult.clinic.healthcareOrganizationId,
        procedureKey: req.params.procedureKey,
      });
      if (!procedureResult.ok) return res.status(404).type("html").send("<h1>Procedure Not Found</h1>");
      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(200).type("html").send(renderPublicView("booking/procedure-entry", {
        csrfToken,
        clinic: clinicResult.clinic,
        procedure: procedureResult.procedure,
      }));
    } catch (err) {
      return next(err);
    }
  });

  app.post("/clinics/:clinicKey/book/procedures/:procedureKey", bookingLimiter, async (req, res, next) => {
    try {
      const clinicResult = await resolvePublishableClinicByKey(getPool(), { clinicKey: req.params.clinicKey });
      if (!clinicResult.ok) return res.status(404).type("html").send("<h1>Clinic Not Found</h1>");
      const clinic = clinicResult.clinic;
      if (!clinic.publicBookingEnabled) return res.status(403).type("html").send("<h1>Booking Not Available</h1>");
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.status(403).type("html").send("CSRF invalid");
      }
      const procedureResult = await getPublicProcedure(getPool(), {
        organizationId: clinic.organizationId,
        healthcareOrganizationId: clinic.healthcareOrganizationId,
        procedureKey: req.params.procedureKey,
      });
      if (!procedureResult.ok) return res.status(404).type("html").send("<h1>Procedure Not Found</h1>");
      const result = await createProcedureBookingRequest(getPool(), {
        organizationId: clinic.organizationId,
        healthcareOrganizationId: clinic.healthcareOrganizationId,
        facilityId: clinic.primaryFacilityId,
        procedureId: procedureResult.procedure.id,
        patientFirstName: req.body.patientFirstName,
        patientLastName: req.body.patientLastName,
        patientPhone: req.body.patientPhone,
        patientEmail: req.body.patientEmail,
        preferredStartsAt: req.body.preferredStartsAt || null,
        preparationAcknowledged: req.body.preparationAcknowledged === "1",
        timezone: clinic.timezone || "Africa/Lusaka",
      });
      if (!result.ok) {
        const csrfToken = issuePageCsrf(res, env, isProduction);
        return res.status(400).type("html").send(renderPublicView("booking/procedure-entry", {
          csrfToken, clinic, procedure: procedureResult.procedure,
          error: "Unable to submit procedure request.", formData: req.body || {},
        }));
      }
      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(200).type("html").send(renderPublicView("booking/request-submitted", {
        csrfToken, clinic, booking: result.booking, accessToken: result.booking.accessToken, robots: "noindex",
      }));
    } catch (err) {
      return next(err);
    }
  });

  app.post("/clinics/:clinicKey/my-booking/cancel", lookupLimiter, async (req, res, next) => {
    try {
      const clinicResult = await resolvePublishableClinicByKey(getPool(), { clinicKey: req.params.clinicKey });
      if (!clinicResult.ok) return res.status(404).type("html").send("<h1>Clinic Not Found</h1>");
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.status(403).type("html").send("CSRF invalid");
      }
      const token = String((req.body && req.body.token) || "");
      const result = await requestBookingCancellation(getPool(), { token, reason: req.body.reason || null });
      const csrfToken = issuePageCsrf(res, env, isProduction);
      if (!result.ok) {
        return res.status(400).type("html").send(renderPublicView("booking/my-booking-lookup", {
          csrfToken, clinic: clinicResult.clinic, error: "Unable to request cancellation.",
        }));
      }
      return res.redirect(303, `/clinics/${req.params.clinicKey}/my-booking?token=${encodeURIComponent(token)}`);
    } catch (err) {
      return next(err);
    }
  });

  app.post("/clinics/:clinicKey/my-booking/reschedule", lookupLimiter, async (req, res, next) => {
    try {
      const clinicResult = await resolvePublishableClinicByKey(getPool(), { clinicKey: req.params.clinicKey });
      if (!clinicResult.ok) return res.status(404).type("html").send("<h1>Clinic Not Found</h1>");
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.status(403).type("html").send("CSRF invalid");
      }
      const token = String((req.body && req.body.token) || "");
      const result = await requestBookingReschedule(getPool(), {
        token,
        preferredStartsAt: req.body.preferredStartsAt,
        reason: req.body.reason || null,
      });
      if (!result.ok) {
        const csrfToken = issuePageCsrf(res, env, isProduction);
        return res.status(400).type("html").send(renderPublicView("booking/my-booking-lookup", {
          csrfToken, clinic: clinicResult.clinic, error: "Unable to request reschedule.",
        }));
      }
      return res.redirect(303, `/clinics/${req.params.clinicKey}/my-booking?token=${encodeURIComponent(token)}`);
    } catch (err) {
      return next(err);
    }
  });

  // P26: My Booking lookup
  app.get("/clinics/:clinicKey/my-booking", lookupLimiter, async (req, res, next) => {
    try {
      const clinicResult = await resolvePublishableClinicByKey(getPool(), { clinicKey: req.params.clinicKey });
      if (!clinicResult.ok) {
        return res.status(404).type("html").send("<h1>Clinic Not Found</h1>");
      }

      const token = req.query.token || "";
      if (!token) {
        const csrfToken = issuePageCsrf(res, env, isProduction);
        return res.status(200).type("html").send(renderPublicView("booking/my-booking-lookup", {
          csrfToken,
          clinic: clinicResult.clinic,
          booking: null,
          error: null,
        }));
      }

      const verifyResult = await verifyBookingAccessToken(getPool(), { token });
      if (!verifyResult.ok) {
        const csrfToken = issuePageCsrf(res, env, isProduction);
        return res.status(200).type("html").send(renderPublicView("booking/my-booking-lookup", {
          csrfToken,
          clinic: clinicResult.clinic,
          booking: null,
          error: "Booking not found or link expired.",
        }));
      }

      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(200).type("html").send(renderPublicView("booking/my-booking-detail", {
        csrfToken,
        clinic: clinicResult.clinic,
        booking: verifyResult.booking,
        accessToken: token,
        robots: "noindex",
      }));
    } catch (err) {
      return next(err);
    }
  });
}

module.exports = {
  registerActiveClinicPublicRoutes,
};
