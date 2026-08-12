"use strict";

/**
 * P24–P26 public booking wizard and my-booking routes.
 */

const { CSRF_FIELD } = require("../../platform/http/v5Csrf");
const { generateIdempotencyKey } = require("../services/activeClinicPublicBookingService");
const {
  listPublicServices,
  getPublicService,
  listPublicStaffProfiles,
  getPublicStaffProfile,
  listPublicProcedures,
  getPublicProcedure,
} = require("../services/activeClinicPublicVisibilityService");
const {
  createConsultationBookingRequest,
  createProcedureBookingRequest,
} = require("../services/activeClinicPublicBookingService");
const {
  verifyBookingAccessToken,
  requestBookingCancellation,
  requestBookingReschedule,
} = require("../services/activeClinicPublicBookingLookupService");
const {
  CONSULTATION_WIZARD_STEPS,
  readBookingDraft,
  writeBookingDraft,
  clearBookingDraft,
  emptyConsultationDraft,
  ensureProcedureDraft,
  mergeDraft,
  procedureWizardStepsFor,
  resolvePublicSlotAvailabilityState,
  canModifyBookingStatus,
} = require("../services/activeClinicPublicBookingDraft");
const { renderPublicView } = require("./renderActiveClinicPublic");
const { resolveClinicOrRespond, sendClinicResolveFailure } = require("./activeClinicPublicRespond");

function wizardLocals(extra) {
  return {
    wizardSteps: CONSULTATION_WIZARD_STEPS,
    slotAvailabilityState: resolvePublicSlotAvailabilityState(),
    validationErrors: {},
    ...extra,
  };
}

function procedureWizardLocals(extra) {
  const wizardSteps = procedureWizardStepsFor(extra.draft || extra.procedure);
  const currentStep = wizardSteps.find((item) => item.key === extra.wizardStepKey);
  return {
    wizardSteps,
    wizardStep: currentStep ? currentStep.step : 1,
    slotAvailabilityState: resolvePublicSlotAvailabilityState(),
    validationErrors: {},
    ...extra,
  };
}

async function resolveBookableClinic(getPool, req, res, respondDeps) {
  const clinic = await resolveClinicOrRespond(getPool, req, res, respondDeps);
  if (!clinic) return { ok: false, sent: true };
  if (!clinic.publicBookingEnabled) {
    const csrfToken = respondDeps.issuePageCsrf(res, respondDeps.env, respondDeps.isProduction);
    res.status(403).type("html").send(renderPublicView("tenant/clinic-unavailable", {
      csrfToken,
      pageTitle: "Booking not available",
      shellVariant: "tenant",
      clinic,
    }));
    return { ok: false, sent: true };
  }
  if (!clinic.primaryFacilityId) {
    return { ok: false, sent: false, clinic, code: "no_facility" };
  }
  return { ok: true, clinic };
}

function validatePatientFields(body) {
  const errors = {};
  const firstName = String((body && body.patientFirstName) || "").trim();
  const lastName = String((body && body.patientLastName) || "").trim();
  const phoneNational = String((body && body.phone_national) || "").trim();
  const phone = String((body && body.patientPhone) || phoneNational || "").trim();
  const phoneCountry = String((body && body.phone_country) || "ZM")
    .trim()
    .toUpperCase();
  if (!firstName) errors.patientFirstName = "First name is required.";
  if (!lastName) errors.patientLastName = "Last name is required.";
  if (!phone) errors.patientPhone = "Phone is required.";
  return { errors, firstName, lastName, phone, phoneCountry, phoneNational };
}

/**
 * @param {import('express').Express} app
 * @param {{ getPool: Function, env: NodeJS.ProcessEnv, isProduction: boolean, respondDeps: object, issuePageCsrf: Function, validateCsrf: Function, bookingLimiter: Function, lookupLimiter: Function }} deps
 */
function registerActiveClinicPublicBookingRoutes(app, deps) {
  const { getPool, env, isProduction, respondDeps, issuePageCsrf, validateCsrf, bookingLimiter, lookupLimiter } = deps;

  // ----- P24 consultation wizard -----

  app.get("/clinics/:clinicKey/book", async (req, res, next) => {
    try {
      const clinicKey = req.params.clinicKey;
      const resolved = await resolveBookableClinic(getPool, req, res, respondDeps);
      if (!resolved.ok) {
        if (resolved.sent) return undefined;
        return res.status(400).type("html").send("<h1>Booking Not Available</h1><p>No bookable facility is configured.</p>");
      }
      const clinic = resolved.clinic;
      let draft = readBookingDraft(req, env, clinicKey) || emptyConsultationDraft(clinicKey);

      const serviceParam = String(req.query.service || "").trim();
      const doctorParam = String(req.query.doctor || "").trim();
      if (serviceParam) {
        const svc = await getPublicService(getPool(), {
          organizationId: clinic.organizationId,
          healthcareOrganizationId: clinic.healthcareOrganizationId,
          serviceKey: serviceParam,
        });
        if (svc.ok) {
          draft = mergeDraft(draft, {
            serviceKey: svc.service.serviceKey,
            serviceTypeId: svc.service.id,
            serviceDisplayName: svc.service.displayName,
          });
        }
      }
      if (doctorParam) {
        const doc = await getPublicStaffProfile(getPool(), {
          organizationId: clinic.organizationId,
          healthcareOrganizationId: clinic.healthcareOrganizationId,
          staffKey: doctorParam,
        });
        if (doc.ok) {
          draft = mergeDraft(draft, {
            staffKey: doc.profile.staffKey,
            preferredStaffId: doc.profile.id,
            staffDisplayName: doc.profile.displayName,
            anyDoctor: false,
          });
        } else if (doctorParam === "any") {
          draft = mergeDraft(draft, { anyDoctor: true, staffKey: null, preferredStaffId: null, staffDisplayName: null });
        }
      }
      writeBookingDraft(res, env, draft, { isProduction });

      const servicesResult = await listPublicServices(getPool(), {
        organizationId: clinic.organizationId,
        healthcareOrganizationId: clinic.healthcareOrganizationId,
      });
      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(200).type("html").send(renderPublicView("booking/consultation-type", wizardLocals({
        csrfToken,
        clinic,
        draft,
        services: servicesResult.services || [],
        wizardStep: 1,
      })));
    } catch (err) {
      return next(err);
    }
  });

  app.post("/clinics/:clinicKey/book", bookingLimiter, async (req, res, next) => {
    try {
      const clinicKey = req.params.clinicKey;
      const resolved = await resolveBookableClinic(getPool, req, res, respondDeps);
      if (!resolved.ok) {
        if (resolved.sent) return undefined;
        return res.status(400).type("html").send("<h1>Booking Not Available</h1><p>No bookable facility is configured.</p>");
      }
      const clinic = resolved.clinic;
      const csrfToken = issuePageCsrf(res, env, isProduction);

      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        const servicesResult = await listPublicServices(getPool(), {
          organizationId: clinic.organizationId,
          healthcareOrganizationId: clinic.healthcareOrganizationId,
        });
        return res.status(403).type("html").send(renderPublicView("booking/consultation-type", wizardLocals({
          csrfToken, clinic, draft: readBookingDraft(req, env, clinicKey) || emptyConsultationDraft(clinicKey),
          services: servicesResult.services || [], wizardStep: 1, error: "Your session expired. Please try again.",
        })));
      }

      const wizardAction = String((req.body && req.body.wizardAction) || "").trim();
      if (wizardAction === "continue") {
        let draft = readBookingDraft(req, env, clinicKey) || emptyConsultationDraft(clinicKey);
        const serviceKey = String((req.body && req.body.serviceKey) || "").trim();
        if (serviceKey) {
          const svc = await getPublicService(getPool(), {
            organizationId: clinic.organizationId,
            healthcareOrganizationId: clinic.healthcareOrganizationId,
            serviceKey,
          });
          if (svc.ok) {
            draft = mergeDraft(draft, {
              serviceKey: svc.service.serviceKey,
              serviceTypeId: svc.service.id,
              serviceDisplayName: svc.service.displayName,
            });
          }
        } else {
          draft = mergeDraft(draft, {
            serviceKey: null, serviceTypeId: null, serviceDisplayName: "General consultation",
          });
        }
        writeBookingDraft(res, env, draft, { isProduction });
        return res.redirect(303, `/clinics/${clinicKey}/book/doctor`);
      }

      // Legacy single-form shortcut
      if (!clinic.primaryFacilityId) {
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
        facilityId: clinic.primaryFacilityId,
        serviceTypeId,
        patientFirstName: req.body.patientFirstName,
        patientLastName: req.body.patientLastName,
        patientPhone: req.body.patientPhone,
        phoneCountry: req.body.phone_country || null,
        phoneNational: req.body.phone_national || null,
        patientEmail: req.body.patientEmail,
        visitReason: req.body.visitReason,
        preferredStartsAt: req.body.preferredStartsAt || null,
        timezone: clinic.timezone || "Africa/Lusaka",
        idempotencyKey: req.body.idempotencyKey || undefined,
      });
      if (!result.ok) {
        return res.status(400).type("html").send(renderPublicView("booking/appointment-entry", {
          csrfToken, clinic, error: "Unable to submit booking request. Check your details and try again.",
          formData: req.body || {},
        }));
      }
      clearBookingDraft(res, { isProduction });
      return res.status(200).type("html").send(renderPublicView("booking/request-submitted", {
        csrfToken, clinic, booking: result.booking, accessToken: result.booking.accessToken,
        pageTitle: "Request submitted", robots: "noindex",
      }));
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/book/doctor", async (req, res, next) => {
    try {
      const clinicKey = req.params.clinicKey;
      const resolved = await resolveBookableClinic(getPool, req, res, respondDeps);
      if (!resolved.ok) {
        if (resolved.sent) return undefined;
        return res.status(400).type("html").send("<h1>Booking Not Available</h1>");
      }
      const clinic = resolved.clinic;
      const draft = readBookingDraft(req, env, clinicKey);
      if (!draft) return res.redirect(303, `/clinics/${clinicKey}/book`);
      const profilesResult = await listPublicStaffProfiles(getPool(), {
        organizationId: clinic.organizationId,
        healthcareOrganizationId: clinic.healthcareOrganizationId,
      });
      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(200).type("html").send(renderPublicView("booking/consultation-doctor", wizardLocals({
        csrfToken, clinic, draft, profiles: profilesResult.profiles || [], wizardStep: 2,
      })));
    } catch (err) {
      return next(err);
    }
  });

  app.post("/clinics/:clinicKey/book/doctor", bookingLimiter, async (req, res, next) => {
    try {
      const clinicKey = req.params.clinicKey;
      const resolved = await resolveBookableClinic(getPool, req, res, respondDeps);
      if (!resolved.ok) {
        if (resolved.sent) return undefined;
        return res.status(400).type("html").send("<h1>Booking Not Available</h1>");
      }
      const clinic = resolved.clinic;
      const csrfToken = issuePageCsrf(res, env, isProduction);
      let draft = readBookingDraft(req, env, clinicKey);
      if (!draft) return res.redirect(303, `/clinics/${clinicKey}/book`);

      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        const profilesResult = await listPublicStaffProfiles(getPool(), {
          organizationId: clinic.organizationId,
          healthcareOrganizationId: clinic.healthcareOrganizationId,
        });
        return res.status(403).type("html").send(renderPublicView("booking/consultation-doctor", wizardLocals({
          csrfToken, clinic, draft, profiles: profilesResult.profiles || [], wizardStep: 2,
          error: "Your session expired. Please try again.",
        })));
      }

      const choice = String((req.body && req.body.doctorChoice) || "").trim();
      if (choice === "any" || !choice) {
        draft = mergeDraft(draft, { anyDoctor: true, staffKey: null, preferredStaffId: null, staffDisplayName: "Any available doctor" });
      } else {
        const doc = await getPublicStaffProfile(getPool(), {
          organizationId: clinic.organizationId,
          healthcareOrganizationId: clinic.healthcareOrganizationId,
          staffKey: choice,
        });
        if (!doc.ok) {
          const profilesResult = await listPublicStaffProfiles(getPool(), {
            organizationId: clinic.organizationId,
            healthcareOrganizationId: clinic.healthcareOrganizationId,
          });
          return res.status(400).type("html").send(renderPublicView("booking/consultation-doctor", wizardLocals({
            csrfToken, clinic, draft, profiles: profilesResult.profiles || [], wizardStep: 2,
            error: "Selected doctor is not available.",
          })));
        }
        draft = mergeDraft(draft, {
          anyDoctor: false,
          staffKey: doc.profile.staffKey,
          preferredStaffId: doc.profile.id,
          staffDisplayName: doc.profile.displayName,
        });
      }
      writeBookingDraft(res, env, draft, { isProduction });
      return res.redirect(303, `/clinics/${clinicKey}/book/slot`);
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/book/slot", async (req, res, next) => {
    try {
      const clinicKey = req.params.clinicKey;
      const resolved = await resolveBookableClinic(getPool, req, res, respondDeps);
      if (!resolved.ok) {
        if (resolved.sent) return undefined;
        return res.status(400).type("html").send("<h1>Booking Not Available</h1>");
      }
      const draft = readBookingDraft(req, env, clinicKey);
      if (!draft) return res.redirect(303, `/clinics/${clinicKey}/book`);
      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(200).type("html").send(renderPublicView("booking/consultation-slot", wizardLocals({
        csrfToken, clinic: resolved.clinic, draft, wizardStep: 3,
      })));
    } catch (err) {
      return next(err);
    }
  });

  app.post("/clinics/:clinicKey/book/slot", bookingLimiter, async (req, res, next) => {
    try {
      const clinicKey = req.params.clinicKey;
      const resolved = await resolveBookableClinic(getPool, req, res, respondDeps);
      if (!resolved.ok) {
        if (resolved.sent) return undefined;
        return res.status(400).type("html").send("<h1>Booking Not Available</h1>");
      }
      const clinic = resolved.clinic;
      const csrfToken = issuePageCsrf(res, env, isProduction);
      let draft = readBookingDraft(req, env, clinicKey);
      if (!draft) return res.redirect(303, `/clinics/${clinicKey}/book`);

      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.status(403).type("html").send(renderPublicView("booking/consultation-slot", wizardLocals({
          csrfToken, clinic, draft, wizardStep: 3, error: "Your session expired. Please try again.",
        })));
      }

      const preferredStartsAt = String((req.body && req.body.preferredStartsAt) || "").trim();
      if (!preferredStartsAt) {
        return res.status(400).type("html").send(renderPublicView("booking/consultation-slot", wizardLocals({
          csrfToken, clinic, draft, wizardStep: 3,
          validationErrors: { preferredStartsAt: "Preferred date and time is required." },
        })));
      }
      draft = mergeDraft(draft, { preferredStartsAt });
      writeBookingDraft(res, env, draft, { isProduction });
      return res.redirect(303, `/clinics/${clinicKey}/book/patient`);
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/book/patient", async (req, res, next) => {
    try {
      const clinicKey = req.params.clinicKey;
      const resolved = await resolveBookableClinic(getPool, req, res, respondDeps);
      if (!resolved.ok) {
        if (resolved.sent) return undefined;
        return res.status(400).type("html").send("<h1>Booking Not Available</h1>");
      }
      const draft = readBookingDraft(req, env, clinicKey);
      if (!draft || !draft.preferredStartsAt) return res.redirect(303, `/clinics/${clinicKey}/book/slot`);
      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(200).type("html").send(renderPublicView("booking/consultation-patient", wizardLocals({
        csrfToken, clinic: resolved.clinic, draft, wizardStep: 4,
      })));
    } catch (err) {
      return next(err);
    }
  });

  app.post("/clinics/:clinicKey/book/patient", bookingLimiter, async (req, res, next) => {
    try {
      const clinicKey = req.params.clinicKey;
      const resolved = await resolveBookableClinic(getPool, req, res, respondDeps);
      if (!resolved.ok) {
        if (resolved.sent) return undefined;
        return res.status(400).type("html").send("<h1>Booking Not Available</h1>");
      }
      const clinic = resolved.clinic;
      const csrfToken = issuePageCsrf(res, env, isProduction);
      let draft = readBookingDraft(req, env, clinicKey);
      if (!draft) return res.redirect(303, `/clinics/${clinicKey}/book`);

      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.status(403).type("html").send(renderPublicView("booking/consultation-patient", wizardLocals({
          csrfToken, clinic, draft, wizardStep: 4, error: "Your session expired. Please try again.",
          formData: req.body || {},
        })));
      }

      const { errors, firstName, lastName, phone, phoneCountry, phoneNational } = validatePatientFields(req.body);
      if (Object.keys(errors).length) {
        return res.status(400).type("html").send(renderPublicView("booking/consultation-patient", wizardLocals({
          csrfToken, clinic, draft, wizardStep: 4, validationErrors: errors, formData: req.body || {},
        })));
      }

      draft = mergeDraft(draft, {
        patientFirstName: firstName,
        patientLastName: lastName,
        patientPhone: phone,
        phoneCountry,
        phoneNational,
        patientEmail: String((req.body && req.body.patientEmail) || "").trim() || null,
        visitReason: String((req.body && req.body.visitReason) || "").trim().slice(0, 500) || null,
      });
      writeBookingDraft(res, env, draft, { isProduction });
      return res.redirect(303, `/clinics/${clinicKey}/book/review`);
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/book/review", async (req, res, next) => {
    try {
      const clinicKey = req.params.clinicKey;
      const resolved = await resolveBookableClinic(getPool, req, res, respondDeps);
      if (!resolved.ok) {
        if (resolved.sent) return undefined;
        return res.status(400).type("html").send("<h1>Booking Not Available</h1>");
      }
      const draft = readBookingDraft(req, env, clinicKey);
      if (!draft || !draft.patientFirstName) return res.redirect(303, `/clinics/${clinicKey}/book/patient`);
      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(200).type("html").send(renderPublicView("booking/consultation-review", wizardLocals({
        csrfToken, clinic: resolved.clinic, draft, wizardStep: 5,
      })));
    } catch (err) {
      return next(err);
    }
  });

  app.post("/clinics/:clinicKey/book/submit", bookingLimiter, async (req, res, next) => {
    try {
      const clinicKey = req.params.clinicKey;
      const resolved = await resolveBookableClinic(getPool, req, res, respondDeps);
      if (!resolved.ok) {
        if (resolved.sent) return undefined;
        return res.status(400).type("html").send("<h1>Booking Not Available</h1>");
      }
      const clinic = resolved.clinic;
      const csrfToken = issuePageCsrf(res, env, isProduction);
      const draft = readBookingDraft(req, env, clinicKey);
      if (!draft || !draft.patientFirstName) return res.redirect(303, `/clinics/${clinicKey}/book`);

      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.status(403).type("html").send(renderPublicView("booking/consultation-review", wizardLocals({
          csrfToken, clinic, draft, wizardStep: 5, error: "Your session expired. Please try again.",
        })));
      }

      const idempotencyKey = String((req.body && req.body.idempotencyKey) || draft.idempotencyKey || "").trim()
        || generateIdempotencyKey();

      const result = await createConsultationBookingRequest(getPool(), {
        organizationId: clinic.organizationId,
        healthcareOrganizationId: clinic.healthcareOrganizationId,
        facilityId: clinic.primaryFacilityId,
        serviceTypeId: draft.serviceTypeId || null,
        preferredStaffId: draft.preferredStaffId || null,
        patientFirstName: draft.patientFirstName,
        patientLastName: draft.patientLastName,
        patientPhone: draft.patientPhone,
        patientEmail: draft.patientEmail,
        visitReason: draft.visitReason,
        preferredStartsAt: draft.preferredStartsAt || null,
        timezone: clinic.timezone || "Africa/Lusaka",
        idempotencyKey,
      });

      if (!result.ok) {
        return res.status(400).type("html").send(renderPublicView("booking/consultation-review", wizardLocals({
          csrfToken, clinic, draft, wizardStep: 5,
          error: "Unable to submit booking request. Check your details and try again.",
        })));
      }

      clearBookingDraft(res, { isProduction });
      return res.status(200).type("html").send(renderPublicView("booking/request-submitted", {
        csrfToken,
        clinic,
        booking: result.booking,
        accessToken: result.booking.accessToken,
        pageTitle: "Request submitted",
        robots: "noindex",
        duplicateSubmit: result.duplicate === true,
      }));
    } catch (err) {
      return next(err);
    }
  });

  // ----- P25 procedure booking -----

  app.get("/clinics/:clinicKey/book/procedures", async (req, res, next) => {
    try {
      const clinicKey = req.params.clinicKey;
      const resolved = await resolveBookableClinic(getPool, req, res, respondDeps);
      if (!resolved.ok) {
        if (resolved.sent) return undefined;
        return res.status(400).type("html").send("<h1>Booking Not Available</h1>");
      }
      const proceduresResult = await listPublicProcedures(getPool(), {
        organizationId: resolved.clinic.organizationId,
        healthcareOrganizationId: resolved.clinic.healthcareOrganizationId,
      });
      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(200).type("html").send(renderPublicView("booking/procedures-list", {
        csrfToken,
        clinic: resolved.clinic,
        procedures: proceduresResult.procedures || [],
      }));
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/book/procedures/:procedureKey", async (req, res, next) => {
    try {
      const clinicKey = req.params.clinicKey;
      const resolved = await resolveBookableClinic(getPool, req, res, respondDeps);
      if (!resolved.ok) {
        if (resolved.sent) return undefined;
        return res.status(400).type("html").send("<h1>Booking Not Available</h1>");
      }
      const procedureResult = await getPublicProcedure(getPool(), {
        organizationId: resolved.clinic.organizationId,
        healthcareOrganizationId: resolved.clinic.healthcareOrganizationId,
        procedureKey: req.params.procedureKey,
      });
      if (!procedureResult.ok) {
        const csrfToken = issuePageCsrf(res, env, isProduction);
        return res.status(404).type("html").send(renderPublicView("booking/procedure-unavailable", {
          csrfToken, clinic: resolved.clinic,
        }));
      }
      const procedure = procedureResult.procedure;
      const draft = ensureProcedureDraft(req, env, clinicKey, procedure);
      writeBookingDraft(res, env, draft, { isProduction });
      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(200).type("html").send(renderPublicView("booking/procedure-info", procedureWizardLocals({
        csrfToken,
        clinic: resolved.clinic,
        procedure,
        draft,
        wizardStepKey: "info",
      })));
    } catch (err) {
      return next(err);
    }
  });

  app.post("/clinics/:clinicKey/book/procedures/:procedureKey", bookingLimiter, async (req, res, next) => {
    try {
      const clinicKey = req.params.clinicKey;
      const resolved = await resolveBookableClinic(getPool, req, res, respondDeps);
      if (!resolved.ok) {
        if (resolved.sent) return undefined;
        return res.status(400).type("html").send("<h1>Booking Not Available</h1>");
      }
      const clinic = resolved.clinic;
      const procedureResult = await getPublicProcedure(getPool(), {
        organizationId: clinic.organizationId,
        healthcareOrganizationId: clinic.healthcareOrganizationId,
        procedureKey: req.params.procedureKey,
      });
      if (!procedureResult.ok) {
        const csrfToken = issuePageCsrf(res, env, isProduction);
        return res.status(404).type("html").send(renderPublicView("booking/procedure-unavailable", { csrfToken, clinic }));
      }
      const procedure = procedureResult.procedure;
      const csrfToken = issuePageCsrf(res, env, isProduction);
      let draft = ensureProcedureDraft(req, env, clinicKey, procedure);
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.status(403).type("html").send(renderPublicView("booking/procedure-info", procedureWizardLocals({
          csrfToken, clinic, procedure, draft, wizardStepKey: "info",
          error: "Your session expired. Please try again.",
        })));
      }

      if (req.body.preparationAcknowledged !== "1") {
        return res.status(400).type("html").send(renderPublicView("booking/procedure-info", procedureWizardLocals({
          csrfToken, clinic, procedure, draft, wizardStepKey: "info",
          validationErrors: { preparationAcknowledged: "Confirm that you have reviewed the preparation information." },
        })));
      }

      draft = mergeDraft(draft, {
        preparationAcknowledged: true,
        referralAcknowledged: procedure.referralRequired !== true,
      });
      writeBookingDraft(res, env, draft, { isProduction });
      const nextStep = procedure.referralRequired ? "referral" : "time";
      return res.redirect(303, `/clinics/${clinicKey}/book/procedures/${procedure.procedureKey}/${nextStep}`);
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/book/procedures/:procedureKey/referral", async (req, res, next) => {
    try {
      const clinicKey = req.params.clinicKey;
      const resolved = await resolveBookableClinic(getPool, req, res, respondDeps);
      if (!resolved.ok) {
        if (resolved.sent) return undefined;
        return res.status(400).type("html").send("<h1>Booking Not Available</h1>");
      }
      const clinic = resolved.clinic;
      const procedureResult = await getPublicProcedure(getPool(), {
        organizationId: clinic.organizationId,
        healthcareOrganizationId: clinic.healthcareOrganizationId,
        procedureKey: req.params.procedureKey,
      });
      if (!procedureResult.ok) {
        const csrfToken = issuePageCsrf(res, env, isProduction);
        return res.status(404).type("html").send(renderPublicView("booking/procedure-unavailable", { csrfToken, clinic }));
      }
      const procedure = procedureResult.procedure;
      const draft = readBookingDraft(req, env, clinicKey);
      if (!draft || draft.bookingKind !== "procedure" || draft.procedureId !== procedure.id || !draft.preparationAcknowledged) {
        return res.redirect(303, `/clinics/${clinicKey}/book/procedures/${procedure.procedureKey}`);
      }
      if (!procedure.referralRequired) {
        return res.redirect(303, `/clinics/${clinicKey}/book/procedures/${procedure.procedureKey}/time`);
      }
      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(200).type("html").send(renderPublicView("booking/procedure-referral", procedureWizardLocals({
        csrfToken, clinic, procedure, draft, wizardStepKey: "referral",
      })));
    } catch (err) {
      return next(err);
    }
  });

  app.post("/clinics/:clinicKey/book/procedures/:procedureKey/referral", bookingLimiter, async (req, res, next) => {
    try {
      const clinicKey = req.params.clinicKey;
      const resolved = await resolveBookableClinic(getPool, req, res, respondDeps);
      if (!resolved.ok) {
        if (resolved.sent) return undefined;
        return res.status(400).type("html").send("<h1>Booking Not Available</h1>");
      }
      const clinic = resolved.clinic;
      const procedureResult = await getPublicProcedure(getPool(), {
        organizationId: clinic.organizationId,
        healthcareOrganizationId: clinic.healthcareOrganizationId,
        procedureKey: req.params.procedureKey,
      });
      if (!procedureResult.ok) {
        const csrfToken = issuePageCsrf(res, env, isProduction);
        return res.status(404).type("html").send(renderPublicView("booking/procedure-unavailable", { csrfToken, clinic }));
      }
      const procedure = procedureResult.procedure;
      let draft = readBookingDraft(req, env, clinicKey);
      if (!draft || draft.bookingKind !== "procedure" || draft.procedureId !== procedure.id || !draft.preparationAcknowledged) {
        return res.redirect(303, `/clinics/${clinicKey}/book/procedures/${procedure.procedureKey}`);
      }
      if (!procedure.referralRequired) {
        return res.redirect(303, `/clinics/${clinicKey}/book/procedures/${procedure.procedureKey}/time`);
      }
      const csrfToken = issuePageCsrf(res, env, isProduction);
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.status(403).type("html").send(renderPublicView("booking/procedure-referral", procedureWizardLocals({
          csrfToken, clinic, procedure, draft, wizardStepKey: "referral",
          error: "Your session expired. Please try again.",
        })));
      }
      draft = mergeDraft(draft, {
        referralAcknowledged: true,
        referralNotes: String((req.body && req.body.referralNotes) || "").trim().slice(0, 2000) || null,
      });
      writeBookingDraft(res, env, draft, { isProduction });
      return res.redirect(303, `/clinics/${clinicKey}/book/procedures/${procedure.procedureKey}/time`);
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/book/procedures/:procedureKey/time", async (req, res, next) => {
    try {
      const clinicKey = req.params.clinicKey;
      const resolved = await resolveBookableClinic(getPool, req, res, respondDeps);
      if (!resolved.ok) {
        if (resolved.sent) return undefined;
        return res.status(400).type("html").send("<h1>Booking Not Available</h1>");
      }
      const clinic = resolved.clinic;
      const procedureResult = await getPublicProcedure(getPool(), {
        organizationId: clinic.organizationId,
        healthcareOrganizationId: clinic.healthcareOrganizationId,
        procedureKey: req.params.procedureKey,
      });
      if (!procedureResult.ok) {
        const csrfToken = issuePageCsrf(res, env, isProduction);
        return res.status(404).type("html").send(renderPublicView("booking/procedure-unavailable", { csrfToken, clinic }));
      }
      const procedure = procedureResult.procedure;
      const draft = readBookingDraft(req, env, clinicKey);
      if (!draft || draft.bookingKind !== "procedure" || draft.procedureId !== procedure.id || !draft.preparationAcknowledged) {
        return res.redirect(303, `/clinics/${clinicKey}/book/procedures/${procedure.procedureKey}`);
      }
      if (procedure.referralRequired && !draft.referralAcknowledged) {
        return res.redirect(303, `/clinics/${clinicKey}/book/procedures/${procedure.procedureKey}/referral`);
      }
      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(200).type("html").send(renderPublicView("booking/procedure-time", procedureWizardLocals({
        csrfToken, clinic, procedure, draft, wizardStepKey: "time",
      })));
    } catch (err) {
      return next(err);
    }
  });

  app.post("/clinics/:clinicKey/book/procedures/:procedureKey/time", bookingLimiter, async (req, res, next) => {
    try {
      const clinicKey = req.params.clinicKey;
      const resolved = await resolveBookableClinic(getPool, req, res, respondDeps);
      if (!resolved.ok) {
        if (resolved.sent) return undefined;
        return res.status(400).type("html").send("<h1>Booking Not Available</h1>");
      }
      const clinic = resolved.clinic;
      const procedureResult = await getPublicProcedure(getPool(), {
        organizationId: clinic.organizationId,
        healthcareOrganizationId: clinic.healthcareOrganizationId,
        procedureKey: req.params.procedureKey,
      });
      if (!procedureResult.ok) {
        const csrfToken = issuePageCsrf(res, env, isProduction);
        return res.status(404).type("html").send(renderPublicView("booking/procedure-unavailable", { csrfToken, clinic }));
      }
      const procedure = procedureResult.procedure;
      let draft = readBookingDraft(req, env, clinicKey);
      if (!draft || draft.bookingKind !== "procedure" || draft.procedureId !== procedure.id || !draft.preparationAcknowledged) {
        return res.redirect(303, `/clinics/${clinicKey}/book/procedures/${procedure.procedureKey}`);
      }
      if (procedure.referralRequired && !draft.referralAcknowledged) {
        return res.redirect(303, `/clinics/${clinicKey}/book/procedures/${procedure.procedureKey}/referral`);
      }
      const csrfToken = issuePageCsrf(res, env, isProduction);
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.status(403).type("html").send(renderPublicView("booking/procedure-time", procedureWizardLocals({
          csrfToken, clinic, procedure, draft, wizardStepKey: "time",
          error: "Your session expired. Please try again.",
        })));
      }
      const preferredStartsAt = String((req.body && req.body.preferredStartsAt) || "").trim();
      if (!preferredStartsAt || Number.isNaN(new Date(preferredStartsAt).getTime())) {
        return res.status(400).type("html").send(renderPublicView("booking/procedure-time", procedureWizardLocals({
          csrfToken, clinic, procedure, draft, wizardStepKey: "time",
          validationErrors: { preferredStartsAt: "Enter a valid preferred date and time." },
        })));
      }
      draft = mergeDraft(draft, { preferredStartsAt });
      writeBookingDraft(res, env, draft, { isProduction });
      return res.redirect(303, `/clinics/${clinicKey}/book/procedures/${procedure.procedureKey}/patient`);
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/book/procedures/:procedureKey/patient", async (req, res, next) => {
    try {
      const clinicKey = req.params.clinicKey;
      const resolved = await resolveBookableClinic(getPool, req, res, respondDeps);
      if (!resolved.ok) {
        if (resolved.sent) return undefined;
        return res.status(400).type("html").send("<h1>Booking Not Available</h1>");
      }
      const clinic = resolved.clinic;
      const procedureResult = await getPublicProcedure(getPool(), {
        organizationId: clinic.organizationId,
        healthcareOrganizationId: clinic.healthcareOrganizationId,
        procedureKey: req.params.procedureKey,
      });
      if (!procedureResult.ok) {
        const csrfToken = issuePageCsrf(res, env, isProduction);
        return res.status(404).type("html").send(renderPublicView("booking/procedure-unavailable", { csrfToken, clinic }));
      }
      const procedure = procedureResult.procedure;
      const draft = readBookingDraft(req, env, clinicKey);
      if (!draft || draft.bookingKind !== "procedure" || draft.procedureId !== procedure.id || !draft.preferredStartsAt) {
        return res.redirect(303, `/clinics/${clinicKey}/book/procedures/${procedure.procedureKey}/time`);
      }
      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(200).type("html").send(renderPublicView("booking/procedure-patient", procedureWizardLocals({
        csrfToken, clinic, procedure, draft, wizardStepKey: "patient",
      })));
    } catch (err) {
      return next(err);
    }
  });

  app.post("/clinics/:clinicKey/book/procedures/:procedureKey/patient", bookingLimiter, async (req, res, next) => {
    try {
      const clinicKey = req.params.clinicKey;
      const resolved = await resolveBookableClinic(getPool, req, res, respondDeps);
      if (!resolved.ok) {
        if (resolved.sent) return undefined;
        return res.status(400).type("html").send("<h1>Booking Not Available</h1>");
      }
      const clinic = resolved.clinic;
      const procedureResult = await getPublicProcedure(getPool(), {
        organizationId: clinic.organizationId,
        healthcareOrganizationId: clinic.healthcareOrganizationId,
        procedureKey: req.params.procedureKey,
      });
      if (!procedureResult.ok) {
        const csrfToken = issuePageCsrf(res, env, isProduction);
        return res.status(404).type("html").send(renderPublicView("booking/procedure-unavailable", { csrfToken, clinic }));
      }
      const procedure = procedureResult.procedure;
      let draft = readBookingDraft(req, env, clinicKey);
      if (!draft || draft.bookingKind !== "procedure" || draft.procedureId !== procedure.id || !draft.preferredStartsAt) {
        return res.redirect(303, `/clinics/${clinicKey}/book/procedures/${procedure.procedureKey}/time`);
      }
      const csrfToken = issuePageCsrf(res, env, isProduction);
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.status(403).type("html").send(renderPublicView("booking/procedure-patient", procedureWizardLocals({
          csrfToken, clinic, procedure, draft, wizardStepKey: "patient",
          error: "Your session expired. Please try again.", formData: req.body || {},
        })));
      }
      const { errors, firstName, lastName, phone, phoneCountry, phoneNational } = validatePatientFields(req.body);
      if (Object.keys(errors).length) {
        return res.status(400).type("html").send(renderPublicView("booking/procedure-patient", procedureWizardLocals({
          csrfToken, clinic, procedure, draft, wizardStepKey: "patient",
          validationErrors: errors, formData: req.body || {},
        })));
      }
      draft = mergeDraft(draft, {
        patientFirstName: firstName,
        patientLastName: lastName,
        patientPhone: phone,
        phoneCountry,
        phoneNational,
        patientEmail: String((req.body && req.body.patientEmail) || "").trim() || null,
        visitReason: String((req.body && req.body.visitReason) || "").trim().slice(0, 500) || null,
      });
      writeBookingDraft(res, env, draft, { isProduction });
      return res.redirect(303, `/clinics/${clinicKey}/book/procedures/${procedure.procedureKey}/review`);
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/book/procedures/:procedureKey/review", async (req, res, next) => {
    try {
      const clinicKey = req.params.clinicKey;
      const resolved = await resolveBookableClinic(getPool, req, res, respondDeps);
      if (!resolved.ok) {
        if (resolved.sent) return undefined;
        return res.status(400).type("html").send("<h1>Booking Not Available</h1>");
      }
      const clinic = resolved.clinic;
      const procedureResult = await getPublicProcedure(getPool(), {
        organizationId: clinic.organizationId,
        healthcareOrganizationId: clinic.healthcareOrganizationId,
        procedureKey: req.params.procedureKey,
      });
      if (!procedureResult.ok) {
        const csrfToken = issuePageCsrf(res, env, isProduction);
        return res.status(404).type("html").send(renderPublicView("booking/procedure-unavailable", { csrfToken, clinic }));
      }
      const procedure = procedureResult.procedure;
      const draft = readBookingDraft(req, env, clinicKey);
      if (!draft || draft.bookingKind !== "procedure" || draft.procedureId !== procedure.id || !draft.patientFirstName || !draft.patientLastName || !draft.patientPhone) {
        return res.redirect(303, `/clinics/${clinicKey}/book/procedures/${procedure.procedureKey}/patient`);
      }
      const csrfToken = issuePageCsrf(res, env, isProduction);
      return res.status(200).type("html").send(renderPublicView("booking/procedure-review", procedureWizardLocals({
        csrfToken, clinic, procedure, draft, wizardStepKey: "review",
      })));
    } catch (err) {
      return next(err);
    }
  });

  app.post("/clinics/:clinicKey/book/procedures/:procedureKey/submit", bookingLimiter, async (req, res, next) => {
    try {
      const clinicKey = req.params.clinicKey;
      const resolved = await resolveBookableClinic(getPool, req, res, respondDeps);
      if (!resolved.ok) {
        if (resolved.sent) return undefined;
        return res.status(400).type("html").send("<h1>Booking Not Available</h1>");
      }
      const clinic = resolved.clinic;
      const procedureResult = await getPublicProcedure(getPool(), {
        organizationId: clinic.organizationId,
        healthcareOrganizationId: clinic.healthcareOrganizationId,
        procedureKey: req.params.procedureKey,
      });
      if (!procedureResult.ok) {
        const csrfToken = issuePageCsrf(res, env, isProduction);
        return res.status(404).type("html").send(renderPublicView("booking/procedure-unavailable", { csrfToken, clinic }));
      }
      const procedure = procedureResult.procedure;
      const draft = readBookingDraft(req, env, clinicKey);
      if (
        !draft
        || draft.bookingKind !== "procedure"
        || draft.procedureId !== procedure.id
        || !draft.preparationAcknowledged
        || (procedure.referralRequired && !draft.referralAcknowledged)
        || !draft.preferredStartsAt
        || !draft.patientFirstName
        || !draft.patientLastName
        || !draft.patientPhone
      ) {
        return res.redirect(303, `/clinics/${clinicKey}/book/procedures/${procedure.procedureKey}`);
      }
      const csrfToken = issuePageCsrf(res, env, isProduction);
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.status(403).type("html").send(renderPublicView("booking/procedure-review", procedureWizardLocals({
          csrfToken, clinic, procedure, draft, wizardStepKey: "review",
          error: "Your session expired. Please try again.",
        })));
      }
      const idempotencyKey = String((req.body && req.body.idempotencyKey) || draft.idempotencyKey || "").trim()
        || generateIdempotencyKey();
      const result = await createProcedureBookingRequest(getPool(), {
        organizationId: clinic.organizationId,
        healthcareOrganizationId: clinic.healthcareOrganizationId,
        facilityId: clinic.primaryFacilityId,
        procedureId: draft.procedureId,
        patientFirstName: draft.patientFirstName,
        patientLastName: draft.patientLastName,
        patientPhone: draft.patientPhone,
        phoneCountry: draft.phoneCountry || null,
        phoneNational: draft.phoneNational || null,
        patientEmail: draft.patientEmail,
        visitReason: draft.visitReason,
        preferredStartsAt: draft.preferredStartsAt,
        preparationAcknowledged: draft.preparationAcknowledged === true,
        referralRequired: procedure.referralRequired,
        referralNotes: draft.referralNotes || null,
        timezone: clinic.timezone || "Africa/Lusaka",
        idempotencyKey,
      });
      if (!result.ok) {
        return res.status(400).type("html").send(renderPublicView("booking/procedure-review", procedureWizardLocals({
          csrfToken, clinic, procedure, draft, wizardStepKey: "review",
          error: "Unable to submit procedure request. Check your details and try again.",
        })));
      }
      clearBookingDraft(res, { isProduction });
      return res.status(200).type("html").send(renderPublicView("booking/request-submitted", {
        csrfToken,
        clinic,
        booking: { ...result.booking, procedureDisplayName: draft.procedureDisplayName },
        accessToken: result.booking.accessToken,
        pageTitle: "Request submitted",
        robots: "noindex",
        duplicateSubmit: result.duplicate === true,
      }));
    } catch (err) {
      return next(err);
    }
  });

  // ----- P26 my booking -----

  app.get("/clinics/:clinicKey/my-booking", lookupLimiter, async (req, res, next) => {
    try {
      const clinic = await resolveClinicOrRespond(getPool, req, res, respondDeps);
      if (!clinic) return undefined;

      const token = String(req.query.token || "").trim();
      const csrfToken = issuePageCsrf(res, env, isProduction);

      if (!token) {
        return res.status(200).type("html").send(renderPublicView("booking/my-booking-lookup", {
          csrfToken, clinic, lookupState: "form", error: null,
        }));
      }

      const verifyResult = await verifyBookingAccessToken(getPool(), { token });
      if (!verifyResult.ok) {
        return res.status(200).type("html").send(renderPublicView("booking/my-booking-lookup", {
          csrfToken,
          clinic,
          lookupState: "error",
          error: "Booking not found or link expired.",
          tokenValue: token,
        }));
      }

      return res.status(200).type("html").send(renderPublicView("booking/my-booking-detail", {
        csrfToken,
        clinic,
        booking: verifyResult.booking,
        accessToken: token,
        canModifyBooking: canModifyBookingStatus(verifyResult.booking.status),
        robots: "noindex",
      }));
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/my-booking/cancel", lookupLimiter, async (req, res, next) => {
    try {
      const clinic = await resolveClinicOrRespond(getPool, req, res, respondDeps);
      if (!clinic) return undefined;
      const token = String(req.query.token || "").trim();
      if (!token) return res.redirect(303, `/clinics/${req.params.clinicKey}/my-booking`);

      const verifyResult = await verifyBookingAccessToken(getPool(), { token });
      const csrfToken = issuePageCsrf(res, env, isProduction);
      if (!verifyResult.ok) {
        return res.status(200).type("html").send(renderPublicView("booking/my-booking-lookup", {
          csrfToken, clinic, lookupState: "error",
          error: "Booking not found or link expired.", tokenValue: token,
        }));
      }
      if (!canModifyBookingStatus(verifyResult.booking.status)) {
        return res.status(200).type("html").send(renderPublicView("booking/my-booking-detail", {
          csrfToken, clinic, booking: verifyResult.booking,
          accessToken: token, canModifyBooking: false, robots: "noindex",
          error: "Cancellation is not available for this booking status.",
        }));
      }

      return res.status(200).type("html").send(renderPublicView("booking/cancellation-review", {
        csrfToken, clinic, booking: verifyResult.booking, accessToken: token, robots: "noindex",
      }));
    } catch (err) {
      return next(err);
    }
  });

  app.post("/clinics/:clinicKey/my-booking/cancel", lookupLimiter, async (req, res, next) => {
    try {
      const clinic = await resolveClinicOrRespond(getPool, req, res, respondDeps);
      if (!clinic) return undefined;
      const token = String((req.body && req.body.token) || "").trim();
      const csrfToken = issuePageCsrf(res, env, isProduction);

      const verifyResult = await verifyBookingAccessToken(getPool(), { token });
      if (!verifyResult.ok) {
        return res.status(200).type("html").send(renderPublicView("booking/my-booking-lookup", {
          csrfToken, clinic, lookupState: "error",
          error: "Booking not found or link expired.",
        }));
      }

      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.status(403).type("html").send(renderPublicView("booking/cancellation-review", {
          csrfToken, clinic, booking: verifyResult.booking, accessToken: token,
          error: "Your session expired. Please try again.", formData: req.body || {},
        }));
      }

      if (!canModifyBookingStatus(verifyResult.booking.status)) {
        return res.status(400).type("html").send(renderPublicView("booking/my-booking-detail", {
          csrfToken, clinic, booking: verifyResult.booking,
          accessToken: token, canModifyBooking: false, robots: "noindex",
          error: "Cancellation is not available for this booking status.",
        }));
      }

      const result = await requestBookingCancellation(getPool(), { token, reason: req.body.reason || null });
      if (!result.ok) {
        return res.status(400).type("html").send(renderPublicView("booking/cancellation-review", {
          csrfToken, clinic, booking: verifyResult.booking, accessToken: token,
          error: "Unable to request cancellation.", formData: req.body || {},
        }));
      }

      const updated = await verifyBookingAccessToken(getPool(), { token });
      return res.status(200).type("html").send(renderPublicView("booking/cancellation-submitted", {
        csrfToken, clinic,
        booking: updated.ok ? updated.booking : verifyResult.booking,
        accessToken: token, robots: "noindex",
      }));
    } catch (err) {
      return next(err);
    }
  });

  app.get("/clinics/:clinicKey/my-booking/reschedule", lookupLimiter, async (req, res, next) => {
    try {
      const clinic = await resolveClinicOrRespond(getPool, req, res, respondDeps);
      if (!clinic) return undefined;
      const token = String(req.query.token || "").trim();
      if (!token) return res.redirect(303, `/clinics/${req.params.clinicKey}/my-booking`);

      const verifyResult = await verifyBookingAccessToken(getPool(), { token });
      const csrfToken = issuePageCsrf(res, env, isProduction);
      if (!verifyResult.ok) {
        return res.status(200).type("html").send(renderPublicView("booking/my-booking-lookup", {
          csrfToken, clinic, lookupState: "error",
          error: "Booking not found or link expired.", tokenValue: token,
        }));
      }
      if (!canModifyBookingStatus(verifyResult.booking.status)) {
        return res.status(200).type("html").send(renderPublicView("booking/my-booking-detail", {
          csrfToken, clinic, booking: verifyResult.booking,
          accessToken: token, canModifyBooking: false, robots: "noindex",
          error: "Reschedule is not available for this booking status.",
        }));
      }

      return res.status(200).type("html").send(renderPublicView("booking/reschedule-review", {
        csrfToken, clinic, booking: verifyResult.booking, accessToken: token, robots: "noindex",
      }));
    } catch (err) {
      return next(err);
    }
  });

  app.post("/clinics/:clinicKey/my-booking/reschedule", lookupLimiter, async (req, res, next) => {
    try {
      const clinic = await resolveClinicOrRespond(getPool, req, res, respondDeps);
      if (!clinic) return undefined;
      const token = String((req.body && req.body.token) || "").trim();
      const csrfToken = issuePageCsrf(res, env, isProduction);

      const verifyResult = await verifyBookingAccessToken(getPool(), { token });
      if (!verifyResult.ok) {
        return res.status(200).type("html").send(renderPublicView("booking/my-booking-lookup", {
          csrfToken, clinic, lookupState: "error",
          error: "Booking not found or link expired.",
        }));
      }

      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.status(403).type("html").send(renderPublicView("booking/reschedule-review", {
          csrfToken, clinic, booking: verifyResult.booking, accessToken: token,
          error: "Your session expired. Please try again.", formData: req.body || {},
        }));
      }

      const preferredStartsAt = String((req.body && req.body.preferredStartsAt) || "").trim();
      if (!preferredStartsAt) {
        return res.status(400).type("html").send(renderPublicView("booking/reschedule-review", {
          csrfToken, clinic, booking: verifyResult.booking, accessToken: token,
          validationErrors: { preferredStartsAt: "Preferred date and time is required." },
          formData: req.body || {},
        }));
      }

      if (!canModifyBookingStatus(verifyResult.booking.status)) {
        return res.status(400).type("html").send(renderPublicView("booking/my-booking-detail", {
          csrfToken, clinic, booking: verifyResult.booking,
          accessToken: token, canModifyBooking: false, robots: "noindex",
          error: "Reschedule is not available for this booking status.",
        }));
      }

      const result = await requestBookingReschedule(getPool(), {
        token,
        preferredStartsAt,
        reason: req.body.reason || null,
      });
      if (!result.ok) {
        return res.status(400).type("html").send(renderPublicView("booking/reschedule-review", {
          csrfToken, clinic, booking: verifyResult.booking, accessToken: token,
          error: "Unable to request reschedule.", formData: req.body || {},
        }));
      }

      const updated = await verifyBookingAccessToken(getPool(), { token });
      return res.status(200).type("html").send(renderPublicView("booking/reschedule-submitted", {
        csrfToken, clinic,
        booking: updated.ok ? updated.booking : verifyResult.booking,
        accessToken: token, robots: "noindex",
      }));
    } catch (err) {
      return next(err);
    }
  });
}

module.exports = {
  registerActiveClinicPublicBookingRoutes,
};
