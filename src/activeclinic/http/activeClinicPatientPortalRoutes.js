"use strict";

/**
 * ActiveClinic patient portal HTTP routes (AC-V6-P27).
 */

const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const { issueCsrfToken, setCsrfCookie, validateCsrf, CSRF_FIELD } = require("../../platform/http/v5Csrf");
const { setV5SessionCookie, clearV5SessionCookie } = require("../../platform/session/v5SessionCookie");
const {
  authenticatePatientIdentity,
} = require("../services/activeClinicPatientPortalAuthService");
const {
  registerPatientWithGuestToken,
  registerPatientWithPhoneMatch,
} = require("../services/activeClinicPatientPortalRegistrationService");
const {
  listPatientBookings,
  getPatientBooking,
  requestPatientBookingCancellation,
  requestPatientBookingReschedule,
} = require("../services/activeClinicPatientPortalBookingService");
const {
  getPatientProfile,
  updatePatientProfile,
} = require("../services/activeClinicPatientPortalProfileService");
const {
  requestPatientPasswordReset,
  resetPatientPassword,
} = require("../services/activeClinicPatientPortalPasswordService");
const {
  verifyPlatformIdentityPassword,
} = require("../../platform/services/platformIdentityCredentialService");
const {
  setPlatformIdentityPassword,
} = require("../../platform/services/platformIdentityCredentialService");
const { renderPatientView } = require("./renderActiveClinicPatient");
const {
  resolvePublishableClinicByKey,
} = require("../services/activeClinicPublicVisibilityService");

function clientIp(req) {
  return String(
    (req.headers && req.headers["x-forwarded-for"]) ||
      req.ip ||
      (req.socket && req.socket.remoteAddress) ||
      ""
  )
    .split(",")[0]
    .trim();
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
function registerActiveClinicPatientPortalRoutes(app, deps) {
  const getPool = deps.getPool;
  const env = deps.env;
  const isProduction = deps.isProduction;
  const deploymentCode = String(env.PLATFORM_DEPLOYMENT_CODE || "").trim().toLowerCase();

  const {
    createLoadActiveClinicPatientAuth,
    createRequireActiveClinicPatientAuth,
  } = require("./loadActiveClinicPatientAuth");

  const loadPatientAuth = createLoadActiveClinicPatientAuth({ getPool, env });
  const requirePatientAuth = createRequireActiveClinicPatientAuth({
    env,
    isProduction,
  });

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: String(env.NODE_ENV || "") === "test" ? 1000 : 10,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) =>
      sha256Hex(
        `patient-login|${req.params.clinicKey}|${
          (req.body && req.body.identifier) || ""
        }|${clientIp(req)}`
      ),
    handler: (req, res) => {
      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res
        .status(429)
        .type("html")
        .send(
          renderPatientView("patient/login", {
            csrfToken,
            csrfField: CSRF_FIELD,
            clinicKey: req.params.clinicKey,
            error: "Too many login attempts. Please try again later.",
          })
        );
    },
  });

  const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: String(env.NODE_ENV || "") === "test" ? 1000 : 5,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) =>
      sha256Hex(
        `patient-register|${req.params.clinicKey}|${
          (req.body && req.body.phone) || ""
        }|${clientIp(req)}`
      ),
    handler: (req, res) => {
      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res
        .status(429)
        .type("html")
        .send(
          renderPatientView("patient/register", {
            csrfToken,
            csrfField: CSRF_FIELD,
            clinicKey: req.params.clinicKey,
            error: "Too many registration attempts. Please try again later.",
          })
        );
    },
  });

  const passwordResetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: String(env.NODE_ENV || "") === "test" ? 1000 : 3,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) =>
      sha256Hex(
        `patient-reset|${req.params.clinicKey}|${
          (req.body && req.body.identifier) || ""
        }|${clientIp(req)}`
      ),
    handler: (req, res) => {
      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res
        .status(429)
        .type("html")
        .send(
          renderPatientView("patient/forgot-password", {
            csrfToken,
            csrfField: CSRF_FIELD,
            clinicKey: req.params.clinicKey,
            error: "Too many password reset attempts. Please try again later.",
          })
        );
    },
  });

  async function resolveClinicContext(clinicKey) {
    const resolved = await resolvePublishableClinicByKey(getPool(), { clinicKey });
    if (!resolved.ok || !resolved.clinic) {
      return null;
    }
    return {
      organizationId: resolved.clinic.organizationId,
      healthcareOrganizationId: resolved.clinic.healthcareOrganizationId,
      clinicKey: resolved.clinic.clinicKey,
      publicName: resolved.clinic.publicName,
      primaryFacilityId: resolved.clinic.primaryFacilityId,
    };
  }

  // ========== Patient Portal Routes ==========

  app.get("/clinics/:clinicKey/patient/login", async (req, res, next) => {
    try {
      const clinic = await resolveClinicContext(req.params.clinicKey);
      if (!clinic) {
        return res.status(404).type("html").send("<h1>Clinic not found</h1>");
      }

      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res
        .status(200)
        .type("html")
        .send(
          renderPatientView("patient/login", {
            csrfToken,
            csrfField: CSRF_FIELD,
            clinicKey: req.params.clinicKey,
          })
        );
    } catch (err) {
      return next(err);
    }
  });

  app.post(
    "/clinics/:clinicKey/patient/login",
    loginLimiter,
    async (req, res, next) => {
      try {
        const clinicKey = req.params.clinicKey;
        const clinic = await resolveClinicContext(clinicKey);
        if (!clinic) {
          return res.status(404).type("html").send("<h1>Clinic not found</h1>");
        }

        const csrfValid = validateCsrf(req, req.body && req.body[CSRF_FIELD], env);
        if (!csrfValid) {
          const csrfToken = issuePageCsrf(res, env, isProduction);
          return res
            .status(403)
            .type("html")
            .send(
              renderPatientView("patient/login", {
                csrfToken,
                csrfField: CSRF_FIELD,
                clinicKey,
                error: "Invalid security token. Please try again.",
              })
            );
        }

        const identifier = String((req.body && req.body.identifier) || "").trim();
        const password = String((req.body && req.body.password) || "");

        if (!identifier || !password) {
          const csrfToken = issuePageCsrf(res, env, isProduction);
          return res
            .status(403)
            .type("html")
            .send(
              renderPatientView("patient/login", {
                csrfToken,
                csrfField: CSRF_FIELD,
                clinicKey,
                error: "Please provide phone/email and password.",
              })
            );
        }

        const auth = await authenticatePatientIdentity(getPool(), {
          identifier,
          password,
          deploymentCode,
          clinicKey,
          organizationId: clinic.organizationId,
          healthcareOrganizationId: clinic.healthcareOrganizationId,
          country: "ZM",
          ip: clientIp(req),
          userAgent: req.headers["user-agent"] || null,
        });

        if (!auth.ok) {
          const csrfToken = issuePageCsrf(res, env, isProduction);
          return res
            .status(401)
            .type("html")
            .send(
              renderPatientView("patient/login", {
                csrfToken,
                csrfField: CSRF_FIELD,
                clinicKey,
                error: "Invalid credentials or access unavailable.",
              })
            );
        }

        setV5SessionCookie(res, auth.rawToken, { secure: isProduction, env });
        return res.redirect(303, `/clinics/${clinicKey}/patient`);
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post("/clinics/:clinicKey/patient/logout", async (req, res, next) => {
    try {
      const clinicKey = req.params.clinicKey;
      const clinic = await resolveClinicContext(clinicKey);
      if (!clinic) {
        return res.status(404).type("html").send("<h1>Clinic not found</h1>");
      }

      const csrfValid = validateCsrf(req, req.body && req.body[CSRF_FIELD], env);
      if (!csrfValid) {
        return res.status(403).json({ ok: false, code: "csrf_invalid" });
      }

      clearV5SessionCookie(res, { secure: isProduction, env });
      const { getCsrfCookieName } = require("../../platform/http/v5Csrf");
      res.clearCookie(getCsrfCookieName(env), { path: "/" });

      if (req.activeClinicPatientAuth && req.activeClinicPatientAuth.authenticated) {
        await getPool().query(
          `INSERT INTO activeclinic.patient_portal_link_events
            (organization_id, healthcare_organization_id, patient_id, platform_identity_id, event_type, metadata_json)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            clinic.organizationId,
            clinic.healthcareOrganizationId,
            req.activeClinicPatientAuth.patient.id,
            req.activeClinicPatientAuth.platformIdentity.id,
            "logout",
            JSON.stringify({ clinic_key: clinicKey }),
          ]
        );
      }

      return res.redirect(303, `/clinics/${clinicKey}/patient/login`);
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/patient/register", async (req, res, next) => {
    try {
      const clinic = await resolveClinicContext(req.params.clinicKey);
      if (!clinic) {
        return res.status(404).type("html").send("<h1>Clinic not found</h1>");
      }

      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res
        .status(200)
        .type("html")
        .send(
          renderPatientView("patient/register", {
            csrfToken,
            csrfField: CSRF_FIELD,
            clinicKey: req.params.clinicKey,
          })
        );
    } catch (err) {
      return next(err);
    }
  });

  app.post(
    "/clinics/:clinicKey/patient/register",
    registerLimiter,
    async (req, res, next) => {
      try {
        const clinicKey = req.params.clinicKey;
        const clinic = await resolveClinicContext(clinicKey);
        if (!clinic) {
          return res.status(404).type("html").send("<h1>Clinic not found</h1>");
        }

        const csrfValid = validateCsrf(req, req.body && req.body[CSRF_FIELD], env);
        if (!csrfValid) {
          const csrfToken = issuePageCsrf(res, env, isProduction);
          return res
            .status(403)
            .type("html")
            .send(
              renderPatientView("patient/register", {
                csrfToken,
                csrfField: CSRF_FIELD,
                clinicKey,
                error: "Invalid security token. Please try again.",
              })
            );
        }

        const guestToken = String((req.body && req.body.guestToken) || "").trim();
        const phone = String((req.body && req.body.phone) || "").trim();
        const email = String((req.body && req.body.email) || "").trim();
        const firstName = String((req.body && req.body.firstName) || "").trim();
        const lastName = String((req.body && req.body.lastName) || "").trim();
        const password = String((req.body && req.body.password) || "");

        let registered = null;

        if (guestToken) {
          registered = await registerPatientWithGuestToken(getPool(), {
            guestToken,
            password,
            phone,
            email: email || null,
            deploymentCode,
            country: "ZM",
          });
        } else {
          if (!firstName || !lastName) {
            const csrfToken = issuePageCsrf(res, env, isProduction);
            return res
              .status(400)
              .type("html")
              .send(
                renderPatientView("patient/register", {
                  csrfToken,
                  csrfField: CSRF_FIELD,
                  clinicKey,
                  error: "First and last name are required without a guest token.",
                })
              );
          }

          registered = await registerPatientWithPhoneMatch(getPool(), {
            phone,
            password,
            email: email || null,
            firstName,
            lastName,
            deploymentCode,
            organizationId: clinic.organizationId,
            healthcareOrganizationId: clinic.healthcareOrganizationId,
            country: "ZM",
          });
        }

        if (!registered.ok) {
          const csrfToken = issuePageCsrf(res, env, isProduction);
          let errorMsg = "Registration failed. Please check your details.";
          if (registered.code === "identity_already_exists") {
            errorMsg = "An account with this phone number already exists.";
          } else if (registered.code === "patient_already_linked") {
            errorMsg = "This patient is already linked to an account.";
          } else if (registered.code === "no_patient_match") {
            errorMsg = "No matching patient record found. Please contact the clinic.";
          } else if (registered.code === "ambiguous_patient_match") {
            errorMsg =
              "Multiple patient records found. Please contact the clinic to resolve.";
          }

          return res
            .status(400)
            .type("html")
            .send(
              renderPatientView("patient/register", {
                csrfToken,
                csrfField: CSRF_FIELD,
                clinicKey,
                error: errorMsg,
              })
            );
        }

        return res.redirect(303, `/clinics/${clinicKey}/patient/login`);
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get("/clinics/:clinicKey/patient/forgot-password", async (req, res, next) => {
    try {
      const clinic = await resolveClinicContext(req.params.clinicKey);
      if (!clinic) {
        return res.status(404).type("html").send("<h1>Clinic not found</h1>");
      }

      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res
        .status(200)
        .type("html")
        .send(
          renderPatientView("patient/forgot-password", {
            csrfToken,
            csrfField: CSRF_FIELD,
            clinicKey: req.params.clinicKey,
          })
        );
    } catch (err) {
      return next(err);
    }
  });

  app.post(
    "/clinics/:clinicKey/patient/forgot-password",
    passwordResetLimiter,
    async (req, res, next) => {
      try {
        const clinicKey = req.params.clinicKey;
        const clinic = await resolveClinicContext(clinicKey);
        if (!clinic) {
          return res.status(404).type("html").send("<h1>Clinic not found</h1>");
        }

        const csrfValid = validateCsrf(req, req.body && req.body[CSRF_FIELD], env);
        if (!csrfValid) {
          const csrfToken = issuePageCsrf(res, env, isProduction);
          return res
            .status(403)
            .type("html")
            .send(
              renderPatientView("patient/forgot-password", {
                csrfToken,
                csrfField: CSRF_FIELD,
                clinicKey,
                error: "Invalid security token. Please try again.",
              })
            );
        }

        const identifier = String((req.body && req.body.identifier) || "").trim();

        if (!identifier) {
          const csrfToken = issuePageCsrf(res, env, isProduction);
          return res
            .status(400)
            .type("html")
            .send(
              renderPatientView("patient/forgot-password", {
                csrfToken,
                csrfField: CSRF_FIELD,
                clinicKey,
                error: "Please provide your phone or email.",
              })
            );
        }

        const reset = await requestPatientPasswordReset(getPool(), {
          identifier,
          deploymentCode,
          organizationId: clinic.organizationId,
          country: "ZM",
          ip: clientIp(req),
        });

        const csrfToken = issuePageCsrf(res, env, isProduction);

        let successMsg =
          "If your account exists, you will receive password reset instructions. Note: Email/SMS delivery is currently unavailable - please contact the clinic directly.";

        if (reset.testToken && String(env.NODE_ENV || "") === "test") {
          successMsg += ` TEST TOKEN: ${reset.testToken}`;
        }

        return res
          .status(200)
          .type("html")
          .send(
            renderPatientView("patient/forgot-password", {
              csrfToken,
              csrfField: CSRF_FIELD,
              clinicKey,
              success: successMsg,
            })
          );
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get("/clinics/:clinicKey/patient/reset-password", async (req, res, next) => {
    try {
      const clinic = await resolveClinicContext(req.params.clinicKey);
      if (!clinic) {
        return res.status(404).type("html").send("<h1>Clinic not found</h1>");
      }

      const token = String((req.query && req.query.token) || "").trim();
      if (!token) {
        return res
          .status(400)
          .type("html")
          .send("<h1>Invalid or missing reset token</h1>");
      }

      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res
        .status(200)
        .type("html")
        .send(
          renderPatientView("patient/reset-password", {
            csrfToken,
            csrfField: CSRF_FIELD,
            clinicKey: req.params.clinicKey,
            token,
          })
        );
    } catch (err) {
      return next(err);
    }
  });

  app.post(
    "/clinics/:clinicKey/patient/reset-password",
    async (req, res, next) => {
      try {
        const clinicKey = req.params.clinicKey;
        const clinic = await resolveClinicContext(clinicKey);
        if (!clinic) {
          return res.status(404).type("html").send("<h1>Clinic not found</h1>");
        }

        const csrfValid = validateCsrf(req, req.body && req.body[CSRF_FIELD], env);
        if (!csrfValid) {
          const csrfToken = issuePageCsrf(res, env, isProduction);
          return res
            .status(403)
            .type("html")
            .send(
              renderPatientView("patient/reset-password", {
                csrfToken,
                csrfField: CSRF_FIELD,
                clinicKey,
                token: req.body && req.body.token,
                error: "Invalid security token. Please try again.",
              })
            );
        }

        const token = String((req.body && req.body.token) || "").trim();
        const newPassword = String((req.body && req.body.newPassword) || "");

        if (!token || !newPassword) {
          const csrfToken = issuePageCsrf(res, env, isProduction);
          return res
            .status(400)
            .type("html")
            .send(
              renderPatientView("patient/reset-password", {
                csrfToken,
                csrfField: CSRF_FIELD,
                clinicKey,
                token,
                error: "Please provide a new password.",
              })
            );
        }

        const reset = await resetPatientPassword(getPool(), {
          token,
          newPassword,
        });

        if (!reset.ok) {
          const csrfToken = issuePageCsrf(res, env, isProduction);
          let errorMsg = "Password reset failed. Please try again.";
          if (reset.code === "token_expired") {
            errorMsg = "Reset token has expired. Please request a new one.";
          } else if (reset.code === "token_already_used") {
            errorMsg = "This reset token has already been used.";
          }

          return res
            .status(400)
            .type("html")
            .send(
              renderPatientView("patient/reset-password", {
                csrfToken,
                csrfField: CSRF_FIELD,
                clinicKey,
                token,
                error: errorMsg,
              })
            );
        }

        const csrfToken = issuePageCsrf(res, env, isProduction);
        return res
          .status(200)
          .type("html")
          .send(
            renderPatientView("patient/password-updated", {
              csrfToken,
              csrfField: CSRF_FIELD,
              clinicKey,
            })
          );
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/clinics/:clinicKey/patient",
    loadPatientAuth,
    requirePatientAuth,
    async (req, res, next) => {
      try {
        const auth = req.activeClinicPatientAuth;
        const listed = await listPatientBookings(getPool(), {
          patientId: auth.patient.id,
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
        });
        const bookings = listed.ok ? listed.bookings : [];
        const pendingStatuses = new Set([
          "submitted_pending_confirmation",
          "cancellation_requested",
          "reschedule_requested",
          "clinic_follow_up",
        ]);
        const pastStatuses = new Set([
          "cancelled",
          "completed",
          "no_show",
          "declined",
          "expired",
        ]);
        const pending = bookings.filter((b) => pendingStatuses.has(b.status));
        const past = bookings.filter((b) => pastStatuses.has(b.status));
        const upcoming = bookings.filter(
          (b) => !pendingStatuses.has(b.status) && !pastStatuses.has(b.status)
        );

        const csrfToken = issuePageCsrf(res, env, isProduction);
        return res
          .status(200)
          .type("html")
          .send(
            renderPatientView("patient/dashboard", {
              csrfToken,
              csrfField: CSRF_FIELD,
              clinicKey: req.params.clinicKey,
              patientAuth: req.activeClinicPatientAuth,
              bookings,
              upcoming,
              pending,
              past,
            })
          );
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/clinics/:clinicKey/patient/bookings",
    loadPatientAuth,
    requirePatientAuth,
    async (req, res, next) => {
      try {
        const auth = req.activeClinicPatientAuth;
        const bookings = await listPatientBookings(getPool(), {
          patientId: auth.patient.id,
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
        });

        const csrfToken = issuePageCsrf(res, env, isProduction);
        return res
          .status(200)
          .type("html")
          .send(
            renderPatientView("patient/bookings", {
              csrfToken,
              csrfField: CSRF_FIELD,
              clinicKey: req.params.clinicKey,
              patientAuth: auth,
              bookings: bookings.bookings || [],
            })
          );
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/clinics/:clinicKey/patient/bookings/:reference",
    loadPatientAuth,
    requirePatientAuth,
    async (req, res, next) => {
      try {
        const auth = req.activeClinicPatientAuth;
        const reference = req.params.reference;

        const booking = await getPatientBooking(getPool(), {
          bookingId: reference,
          patientId: auth.patient.id,
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
        });

        if (!booking.ok) {
          return res.status(404).type("html").send("<h1>Booking not found</h1>");
        }

        const csrfToken = issuePageCsrf(res, env, isProduction);
        return res
          .status(200)
          .type("html")
          .send(
            renderPatientView("patient/booking-detail", {
              csrfToken,
              csrfField: CSRF_FIELD,
              clinicKey: req.params.clinicKey,
              patientAuth: auth,
              booking: booking.booking,
            })
          );
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/clinics/:clinicKey/patient/bookings/:reference/cancel",
    loadPatientAuth,
    requirePatientAuth,
    async (req, res, next) => {
      try {
        const csrfValid = validateCsrf(req, req.body && req.body[CSRF_FIELD], env);
        if (!csrfValid) {
          return res.status(403).json({ ok: false, code: "csrf_invalid" });
        }

        const auth = req.activeClinicPatientAuth;
        const reference = req.params.reference;

        const result = await requestPatientBookingCancellation(getPool(), {
          bookingId: reference,
          patientId: auth.patient.id,
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
        });

        if (!result.ok) {
          return res.status(403).json({ ok: false, code: result.code });
        }

        return res.redirect(
          303,
          `/clinics/${req.params.clinicKey}/patient/bookings/${reference}`
        );
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/clinics/:clinicKey/patient/bookings/:reference/reschedule",
    loadPatientAuth,
    requirePatientAuth,
    async (req, res, next) => {
      try {
        const csrfValid = validateCsrf(req, req.body && req.body[CSRF_FIELD], env);
        if (!csrfValid) {
          return res.status(403).json({ ok: false, code: "csrf_invalid" });
        }

        const auth = req.activeClinicPatientAuth;
        const reference = req.params.reference;

        const result = await requestPatientBookingReschedule(getPool(), {
          bookingId: reference,
          patientId: auth.patient.id,
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
        });

        if (!result.ok) {
          return res.status(403).json({ ok: false, code: result.code });
        }

        return res.redirect(
          303,
          `/clinics/${req.params.clinicKey}/patient/bookings/${reference}`
        );
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/clinics/:clinicKey/patient/profile",
    loadPatientAuth,
    requirePatientAuth,
    async (req, res, next) => {
      try {
        const auth = req.activeClinicPatientAuth;
        const profile = await getPatientProfile(getPool(), {
          patientId: auth.patient.id,
          organizationId: auth.organization.id,
        });

        const csrfToken = issuePageCsrf(res, env, isProduction);
        return res
          .status(200)
          .type("html")
          .send(
            renderPatientView("patient/profile", {
              csrfToken,
              csrfField: CSRF_FIELD,
              clinicKey: req.params.clinicKey,
              patientAuth: auth,
              profile: profile.profile || auth.patient,
            })
          );
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/clinics/:clinicKey/patient/profile",
    loadPatientAuth,
    requirePatientAuth,
    async (req, res, next) => {
      try {
        const csrfValid = validateCsrf(req, req.body && req.body[CSRF_FIELD], env);
        if (!csrfValid) {
          const csrfToken = issuePageCsrf(res, env, isProduction);
          return res
            .status(403)
            .type("html")
            .send(
              renderPatientView("patient/profile", {
                csrfToken,
                csrfField: CSRF_FIELD,
                clinicKey: req.params.clinicKey,
                patientAuth: req.activeClinicPatientAuth,
                error: "Invalid security token. Please try again.",
              })
            );
        }

        const auth = req.activeClinicPatientAuth;

        const updated = await updatePatientProfile(getPool(), {
          patientId: auth.patient.id,
          organizationId: auth.organization.id,
          preferredName: req.body.preferredName,
          phone: req.body.phone,
          email: req.body.email,
          addressLine1: req.body.addressLine1,
          addressLine2: req.body.addressLine2,
          addressCity: req.body.addressCity,
          addressProvince: req.body.addressProvince,
          country: "ZM",
        });

        const csrfToken = issuePageCsrf(res, env, isProduction);

        if (!updated.ok) {
          const profile = await getPatientProfile(getPool(), {
            patientId: auth.patient.id,
            organizationId: auth.organization.id,
          });

          return res
            .status(400)
            .type("html")
            .send(
              renderPatientView("patient/profile", {
                csrfToken,
                csrfField: CSRF_FIELD,
                clinicKey: req.params.clinicKey,
                patientAuth: auth,
                profile: profile.profile || auth.patient,
                error: "Profile update failed. Please check your details.",
              })
            );
        }

        const profile = await getPatientProfile(getPool(), {
          patientId: auth.patient.id,
          organizationId: auth.organization.id,
        });

        return res
          .status(200)
          .type("html")
          .send(
            renderPatientView("patient/profile", {
              csrfToken,
              csrfField: CSRF_FIELD,
              clinicKey: req.params.clinicKey,
              patientAuth: auth,
              profile: profile.profile || auth.patient,
              success: "Profile updated successfully.",
            })
          );
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/clinics/:clinicKey/patient/security",
    loadPatientAuth,
    requirePatientAuth,
    async (req, res, next) => {
      try {
        const csrfToken = issuePageCsrf(res, env, isProduction);
        return res
          .status(200)
          .type("html")
          .send(
            renderPatientView("patient/security", {
              csrfToken,
              csrfField: CSRF_FIELD,
              clinicKey: req.params.clinicKey,
              patientAuth: req.activeClinicPatientAuth,
            })
          );
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/clinics/:clinicKey/patient/security",
    loadPatientAuth,
    requirePatientAuth,
    async (req, res, next) => {
      try {
        const csrfValid = validateCsrf(req, req.body && req.body[CSRF_FIELD], env);
        if (!csrfValid) {
          const csrfToken = issuePageCsrf(res, env, isProduction);
          return res
            .status(403)
            .type("html")
            .send(
              renderPatientView("patient/security", {
                csrfToken,
                csrfField: CSRF_FIELD,
                clinicKey: req.params.clinicKey,
                patientAuth: req.activeClinicPatientAuth,
                error: "Invalid security token. Please try again.",
              })
            );
        }

        const auth = req.activeClinicPatientAuth;
        const currentPassword = String((req.body && req.body.currentPassword) || "");
        const newPassword = String((req.body && req.body.newPassword) || "");

        if (!currentPassword || !newPassword) {
          const csrfToken = issuePageCsrf(res, env, isProduction);
          return res
            .status(400)
            .type("html")
            .send(
              renderPatientView("patient/security", {
                csrfToken,
                csrfField: CSRF_FIELD,
                clinicKey: req.params.clinicKey,
                patientAuth: auth,
                error: "Please provide current and new password.",
              })
            );
        }

        if (newPassword.length < 8) {
          const csrfToken = issuePageCsrf(res, env, isProduction);
          return res
            .status(400)
            .type("html")
            .send(
              renderPatientView("patient/security", {
                csrfToken,
                csrfField: CSRF_FIELD,
                clinicKey: req.params.clinicKey,
                patientAuth: auth,
                error: "New password must be at least 8 characters.",
              })
            );
        }

        const verified = await verifyPlatformIdentityPassword(getPool(), {
          identityId: auth.platformIdentity.id,
          password: currentPassword,
          recordFailure: true,
        });

        if (!verified.ok) {
          const csrfToken = issuePageCsrf(res, env, isProduction);
          return res
            .status(401)
            .type("html")
            .send(
              renderPatientView("patient/security", {
                csrfToken,
                csrfField: CSRF_FIELD,
                clinicKey: req.params.clinicKey,
                patientAuth: auth,
                error: "Current password is incorrect.",
              })
            );
        }

        const updated = await setPlatformIdentityPassword(getPool(), {
          identityId: auth.platformIdentity.id,
          password: newPassword,
          clearMustChangePassword: true,
        });

        if (!updated.ok) {
          const csrfToken = issuePageCsrf(res, env, isProduction);
          return res
            .status(400)
            .type("html")
            .send(
              renderPatientView("patient/security", {
                csrfToken,
                csrfField: CSRF_FIELD,
                clinicKey: req.params.clinicKey,
                patientAuth: auth,
                error: "Password change failed. Please try again.",
              })
            );
        }

        const csrfToken = issuePageCsrf(res, env, isProduction);
        return res
          .status(200)
          .type("html")
          .send(
            renderPatientView("patient/security", {
              csrfToken,
              csrfField: CSRF_FIELD,
              clinicKey: req.params.clinicKey,
              patientAuth: auth,
              success: "Password changed successfully.",
            })
          );
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/clinics/:clinicKey/patient/notifications",
    loadPatientAuth,
    requirePatientAuth,
    async (req, res, next) => {
      try {
        const csrfToken = issuePageCsrf(res, env, isProduction);
        return res
          .status(200)
          .type("html")
          .send(
            renderPatientView("patient/notifications", {
              csrfToken,
              csrfField: CSRF_FIELD,
              clinicKey: req.params.clinicKey,
              patientAuth: req.activeClinicPatientAuth,
            })
          );
      } catch (err) {
        return next(err);
      }
    }
  );
}

module.exports = {
  registerActiveClinicPatientPortalRoutes,
};
