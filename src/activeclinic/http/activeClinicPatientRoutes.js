"use strict";

/**
 * ActiveClinic patient search / registration / profile routes (AC-V6-C02).
 */

const {
  issueCsrfToken,
  setCsrfCookie,
  validateCsrf,
  CSRF_FIELD,
} = require("../../platform/http/v5Csrf");
const {
  createRequireActiveClinicAuth,
} = require("./loadActiveClinicAuth");
const {
  createRequireActiveClinicPermission,
  renderSimpleState,
} = require("./activeClinicPermissionMiddleware");
const {
  buildActiveClinicShellViewModel,
} = require("../services/buildActiveClinicShellViewModel");
const {
  renderActiveClinicAppPage,
} = require("./renderActiveClinicShell");
const {
  parsePatientFormBody,
  buildRegistrationPayload,
  patientFormFromPatient,
  loadActiveClinicPatientListScreen,
  loadActiveClinicPatientFormScreen,
  loadActiveClinicPatientProfileScreen,
} = require("../services/loadActiveClinicPatientScreens");
const {
  registerActiveClinicPatient,
  updateActiveClinicPatient,
  setPatientStatus,
  addPatientIdentifier,
  addEmergencyContact,
  resolvePatientForActor,
  RESULT: PATIENT_RESULT,
  PERM,
} = require("../services/activeClinicPatientService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");
const { getPlatformDeploymentCode } = require("../../platform/config/platformDeploymentCode");

function mapPatientError(code) {
  switch (code) {
    case PATIENT_RESULT.ACCESS_DENIED:
      return "You do not have permission for this patient action.";
    case PATIENT_RESULT.DUPLICATE_WARNING:
      return "Possible duplicate patients were found. Review matches before continuing.";
    case PATIENT_RESULT.OVERRIDE_DENIED:
      return "You do not have permission to override duplicate warnings.";
    case PATIENT_RESULT.IDENTIFIER_CONFLICT:
      return "That identifier is already registered for another patient in this organization.";
    case "name_required":
      return "First and last name are required.";
    case "date_of_birth_future":
      return "Date of birth cannot be in the future.";
    case "phone_must_be_e164":
    case "phone_invalid":
      return "Phone must be in international E.164 format (for example +260…).";
    case "email_invalid":
      return "Email address is not valid.";
    case "query_too_short":
      return "Enter at least two characters for a name search.";
    default:
      return "Unable to complete the patient request.";
  }
}

function registerActiveClinicPatientRoutes(app, deps) {
  const getPool = deps.getPool;
  const env = deps.env;
  const isProduction = deps.isProduction;
  const requireAuth = createRequireActiveClinicAuth({ env, isProduction });
  const requirePermission = createRequireActiveClinicPermission({
    getPool,
    env,
    isProduction,
  });

  function issuePageCsrf(res) {
    const token = issueCsrfToken(env);
    setCsrfCookie(res, token, { secure: isProduction, env });
    return token;
  }

  async function renderShell(req, res, options) {
    const csrfToken = issuePageCsrf(res);
    const shell = await buildActiveClinicShellViewModel(getPool(), {
      req,
      auth: req.activeClinicAuth,
      csrfToken,
      activeNav: options.activeNav,
      pageHeader: options.pageHeader,
      breadcrumbs: options.breadcrumbs,
      flash: options.flash || null,
      pageData: options.pageData || {},
    });
    if (shell.selectedFacility) {
      req.activeClinicAuth.selectedFacility = shell.selectedFacility;
    }
    const html = renderActiveClinicAppPage(options.content, shell);
    return res.status(options.status || 200).type("html").send(html);
  }

  function actor(auth) {
    return {
      staffMemberId: auth.staffMember.id,
      platformIdentityId: auth.platformIdentity && auth.platformIdentity.id,
      organizationId: auth.organization.id,
    };
  }

  app.get(
    "/app/patients",
    requireAuth,
    requirePermission(PERM.SEARCH),
    async (req, res, next) => {
      try {
        const loaded = await loadActiveClinicPatientListScreen(getPool(), {
          auth: req.activeClinicAuth,
          query: req.query || {},
        });
        if (!loaded.ok) {
          return res.status(403).type("html").send(
            renderSimpleState(
              "Access Restricted",
              "You do not have permission to search patients.",
              { status: 403 }
            )
          );
        }
        return await renderShell(req, res, {
          activeNav: "patients",
          content: "app/patients-list-content.ejs",
          pageHeader: {
            title: "Patients",
            description: "Search and register patients in this healthcare organization.",
            actions: loaded.list.actions.canCreate
              ? [{ href: "/app/patients/new", label: "Register patient", primary: true }]
              : [],
          },
          breadcrumbs: [{ label: "Patients" }],
          pageData: { list: loaded.list },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/patients/new",
    requireAuth,
    requirePermission(PERM.CREATE),
    async (req, res, next) => {
      try {
        const form = await loadActiveClinicPatientFormScreen(getPool(), {
          auth: req.activeClinicAuth,
          mode: "create",
        });
        if (!form.ok) {
          return res.status(403).type("html").send(
            renderSimpleState("Access Restricted", "You cannot register patients.", {
              status: 403,
            })
          );
        }
        return await renderShell(req, res, {
          activeNav: "patients",
          content: "app/patient-form-content.ejs",
          pageHeader: {
            title: "Register patient",
            description: "Capture administrative identity and contact details.",
          },
          breadcrumbs: [
            { label: "Patients", href: "/app/patients" },
            { label: "Register" },
          ],
          pageData: { form: form.form },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post("/app/patients", requireAuth, requirePermission(PERM.CREATE), async (req, res, next) => {
    try {
      const auth = req.activeClinicAuth;
      if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
        return res.status(403).type("html").send("CSRF validation failed");
      }
      const values = parsePatientFormBody(req.body);
      const deployment = getPlatformDeploymentCode(env) || {};

      if (values.step === "edit") {
        const form = await loadActiveClinicPatientFormScreen(getPool(), {
          auth,
          mode: "create",
          values: { ...values, step: "edit" },
        });
        return await renderShell(req, res, {
          activeNav: "patients",
          content: "app/patient-form-content.ejs",
          pageHeader: {
            title: "Register patient",
            description: "Capture administrative identity and contact details.",
          },
          breadcrumbs: [
            { label: "Patients", href: "/app/patients" },
            { label: "Register" },
          ],
          pageData: { form: form.form },
        });
      }

      if (values.step === "review") {
        const form = await loadActiveClinicPatientFormScreen(getPool(), {
          auth,
          mode: "create",
          values: { ...values, step: "review" },
        });
        return await renderShell(req, res, {
          activeNav: "patients",
          content: "app/patient-form-content.ejs",
          pageHeader: {
            title: "Review registration",
            description: "Confirm details before creating the patient record.",
          },
          breadcrumbs: [
            { label: "Patients", href: "/app/patients" },
            { label: "Register" },
          ],
          pageData: { form: form.form },
        });
      }

      const payload = buildRegistrationPayload(values, auth);
      payload.deploymentCode = deployment.code || CODE_ACTIVECLINIC_ORG_V6;
      const created = await registerActiveClinicPatient(getPool(), payload);

      if (!created.ok && created.code === PATIENT_RESULT.DUPLICATE_WARNING) {
        const form = await loadActiveClinicPatientFormScreen(getPool(), {
          auth,
          mode: "create",
          values: { ...values, step: "edit" },
          errors: [mapPatientError(created.code)],
          duplicateMatches: created.matches || [],
        });
        return await renderShell(req, res, {
          activeNav: "patients",
          content: "app/patient-form-content.ejs",
          pageHeader: {
            title: "Possible duplicate",
            description: "Review matches before continuing with registration.",
          },
          breadcrumbs: [
            { label: "Patients", href: "/app/patients" },
            { label: "Register" },
          ],
          pageData: { form: form.form },
          status: 200,
        });
      }

      if (!created.ok) {
        const form = await loadActiveClinicPatientFormScreen(getPool(), {
          auth,
          mode: "create",
          values,
          errors: [mapPatientError(created.code)],
        });
        return await renderShell(req, res, {
          activeNav: "patients",
          content: "app/patient-form-content.ejs",
          pageHeader: { title: "Register patient" },
          breadcrumbs: [
            { label: "Patients", href: "/app/patients" },
            { label: "Register" },
          ],
          pageData: { form: form.form },
          status: 400,
        });
      }

      return await renderShell(req, res, {
        activeNav: "patients",
        content: "app/patient-success-content.ejs",
        pageHeader: {
          title: "Patient registered",
          description: "Administrative registration completed successfully.",
        },
        breadcrumbs: [
          { label: "Patients", href: "/app/patients" },
          { label: "Success" },
        ],
        pageData: {
          success: {
            patient: created.patient,
            profileHref: `/app/patients/${encodeURIComponent(created.patient.patientNumber)}`,
            stitch: {
              desktop: "cd688e761cca43a1af299769014cb5f0",
              mobile: "b9615559155d41d591dbb91e18c6a090",
            },
          },
        },
      });
    } catch (err) {
      return next(err);
    }
  });

  app.get(
    "/app/patients/:patientNumber",
    requireAuth,
    requirePermission(PERM.VIEW),
    async (req, res, next) => {
      try {
        const loaded = await loadActiveClinicPatientProfileScreen(getPool(), {
          auth: req.activeClinicAuth,
          patientNumber: req.params.patientNumber,
        });
        if (!loaded.ok) {
          const status = loaded.code === PATIENT_RESULT.ACCESS_DENIED ? 403 : 404;
          return res.status(status).type("html").send(
            renderSimpleState(
              status === 403 ? "Access Restricted" : "Not found",
              status === 403
                ? "You do not have permission to view this patient."
                : "That patient is not available.",
              { status }
            )
          );
        }
        const flash =
          req.query.ok === "1"
            ? { type: "success", message: "Patient details saved." }
            : req.query.archived === "1"
              ? { type: "success", message: "Patient archived." }
              : req.query.deceased === "1"
                ? { type: "success", message: "Patient marked deceased." }
                : req.query.id_error === "1"
                  ? {
                      type: "error",
                      message:
                        "Unable to add that identifier. Check the type and value, or a conflict may already exist.",
                    }
                  : req.query.ec_error === "1"
                    ? {
                        type: "error",
                        message:
                          "Unable to save the emergency contact. Check the name and phone format.",
                      }
                    : req.query.status_error === "1"
                      ? {
                          type: "error",
                          message:
                            "Unable to update patient status. Refresh and try again, or check your permissions.",
                        }
                      : null;
        return await renderShell(req, res, {
          activeNav: "patients",
          content: "app/patient-profile-content.ejs",
          pageHeader: {
            title: loaded.profile.patient.displayName,
            description: loaded.profile.patient.patientNumber,
            actions: loaded.profile.actions.canEdit
              ? [
                  {
                    href: loaded.profile.actions.editHref,
                    label: "Edit details",
                    primary: true,
                  },
                ]
              : [],
          },
          breadcrumbs: [
            { label: "Patients", href: "/app/patients" },
            { label: loaded.profile.patient.patientNumber },
          ],
          flash,
          pageData: { profile: loaded.profile },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/patients/:patientNumber/edit",
    requireAuth,
    requirePermission(PERM.UPDATE),
    async (req, res, next) => {
      try {
        const profile = await loadActiveClinicPatientProfileScreen(getPool(), {
          auth: req.activeClinicAuth,
          patientNumber: req.params.patientNumber,
        });
        if (!profile.ok) {
          return res.status(404).type("html").send(
            renderSimpleState("Not found", "That patient is not available.", {
              status: 404,
            })
          );
        }
        const form = await loadActiveClinicPatientFormScreen(getPool(), {
          auth: req.activeClinicAuth,
          mode: "edit",
          patientNumber: req.params.patientNumber,
          values: patientFormFromPatient(profile.profile.patient),
        });
        return await renderShell(req, res, {
          activeNav: "patients",
          content: "app/patient-form-content.ejs",
          pageHeader: {
            title: "Edit patient",
            description: profile.profile.patient.patientNumber,
          },
          breadcrumbs: [
            { label: "Patients", href: "/app/patients" },
            {
              label: profile.profile.patient.patientNumber,
              href: `/app/patients/${encodeURIComponent(req.params.patientNumber)}`,
            },
            { label: "Edit" },
          ],
          pageData: { form: form.form },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/patients/:patientNumber",
    requireAuth,
    requirePermission(PERM.UPDATE),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const auth = req.activeClinicAuth;
        const values = parsePatientFormBody(req.body);
        const existing = await resolvePatientForActor(getPool(), {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          patientNumber: req.params.patientNumber,
          facilityId: auth.selectedFacility && auth.selectedFacility.id,
          actor: actor(auth),
        });
        if (!existing.ok) {
          return res.status(404).type("html").send(
            renderSimpleState("Not found", "That patient is not available.", {
              status: 404,
            })
          );
        }

        const updated = await updateActiveClinicPatient(getPool(), {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          patientId: existing.patient.id,
          facilityId: auth.selectedFacility && auth.selectedFacility.id,
          actor: actor(auth),
          demographics: {
            firstName: values.firstName,
            middleName: values.middleName || null,
            lastName: values.lastName,
            preferredName: values.preferredName || null,
            dateOfBirth: values.dateOfBirth || null,
            estimatedDateOfBirth: values.estimatedDateOfBirth,
            sexAtRegistration: values.sexAtRegistration || null,
            nationalityCountryCode: values.nationalityCountryCode || null,
            primaryLanguage: values.primaryLanguage || null,
          },
          contacts: {
            phone: values.phone || null,
            email: values.email || null,
            preferredContactMethod: values.preferredContactMethod || null,
            allowAdminReminders:
              values.allowAdminReminders === "" ? null : values.allowAdminReminders,
          },
          address: {
            addressLine1: values.addressLine1 || null,
            addressLine2: values.addressLine2 || null,
            city: values.city || null,
            district: values.district || null,
            province: values.province || null,
            countryCode: values.countryCode || null,
            postalCode: values.postalCode || null,
          },
          deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
        });

        if (!updated.ok) {
          const form = await loadActiveClinicPatientFormScreen(getPool(), {
            auth,
            mode: "edit",
            patientNumber: req.params.patientNumber,
            values,
            errors: [mapPatientError(updated.code)],
          });
          return await renderShell(req, res, {
            activeNav: "patients",
            content: "app/patient-form-content.ejs",
            pageHeader: { title: "Edit patient" },
            pageData: { form: form.form },
            status: 400,
          });
        }

        return res.redirect(
          303,
          `/app/patients/${encodeURIComponent(req.params.patientNumber)}?ok=1`
        );
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/patients/:patientNumber/identifiers",
    requireAuth,
    requirePermission(PERM.MANAGE_IDENTIFIERS),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const auth = req.activeClinicAuth;
        const existing = await resolvePatientForActor(getPool(), {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          patientNumber: req.params.patientNumber,
          facilityId: auth.selectedFacility && auth.selectedFacility.id,
          actor: actor(auth),
        });
        if (!existing.ok) {
          return res.status(404).send("Not found");
        }
        const added = await addPatientIdentifier(getPool(), {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          patientId: existing.patient.id,
          facilityId: auth.selectedFacility && auth.selectedFacility.id,
          actor: actor(auth),
          identifierType: String(req.body.identifier_type || "").trim(),
          identifierValue: String(req.body.identifier_value || "").trim(),
          isPrimary: req.body.is_primary === "1" || req.body.is_primary === "on",
          deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
        });
        if (!added.ok) {
          return res.redirect(
            303,
            `/app/patients/${encodeURIComponent(req.params.patientNumber)}?id_error=1`
          );
        }
        return res.redirect(
          303,
          `/app/patients/${encodeURIComponent(req.params.patientNumber)}?ok=1`
        );
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/patients/:patientNumber/emergency-contacts",
    requireAuth,
    requirePermission(PERM.UPDATE),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const auth = req.activeClinicAuth;
        const existing = await resolvePatientForActor(getPool(), {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          patientNumber: req.params.patientNumber,
          facilityId: auth.selectedFacility && auth.selectedFacility.id,
          actor: actor(auth),
        });
        if (!existing.ok) return res.status(404).send("Not found");
        const added = await addEmergencyContact(getPool(), {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          patientId: existing.patient.id,
          facilityId: auth.selectedFacility && auth.selectedFacility.id,
          actor: actor(auth),
          fullName: String(req.body.full_name || "").trim(),
          relationship: String(req.body.relationship || "").trim(),
          phone: String(req.body.phone || "").trim(),
          email: String(req.body.email || "").trim(),
          isPrimary: true,
          deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
        });
        if (!added.ok) {
          return res.redirect(
            303,
            `/app/patients/${encodeURIComponent(req.params.patientNumber)}?ec_error=1`
          );
        }
        return res.redirect(
          303,
          `/app/patients/${encodeURIComponent(req.params.patientNumber)}?ok=1`
        );
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/patients/:patientNumber/archive",
    requireAuth,
    requirePermission(PERM.ARCHIVE),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const auth = req.activeClinicAuth;
        const existing = await resolvePatientForActor(getPool(), {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          patientNumber: req.params.patientNumber,
          facilityId: auth.selectedFacility && auth.selectedFacility.id,
          actor: actor(auth),
        });
        if (!existing.ok) return res.status(404).send("Not found");
        const updated = await setPatientStatus(getPool(), {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          patientId: existing.patient.id,
          facilityId: auth.selectedFacility && auth.selectedFacility.id,
          actor: actor(auth),
          status: "archived",
          reason: String(req.body.reason || "archived").slice(0, 200),
          deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
        });
        if (!updated.ok) {
          return res.redirect(
            303,
            `/app/patients/${encodeURIComponent(req.params.patientNumber)}?status_error=1`
          );
        }
        return res.redirect(
          303,
          `/app/patients/${encodeURIComponent(req.params.patientNumber)}?archived=1`
        );
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/patients/:patientNumber/mark-deceased",
    requireAuth,
    requirePermission(PERM.ARCHIVE),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body && req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const auth = req.activeClinicAuth;
        const existing = await resolvePatientForActor(getPool(), {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          patientNumber: req.params.patientNumber,
          facilityId: auth.selectedFacility && auth.selectedFacility.id,
          actor: actor(auth),
        });
        if (!existing.ok) return res.status(404).send("Not found");
        const updated = await setPatientStatus(getPool(), {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          patientId: existing.patient.id,
          facilityId: auth.selectedFacility && auth.selectedFacility.id,
          actor: actor(auth),
          status: "deceased",
          deceasedAt: new Date(),
          reason: "marked_deceased",
          deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
        });
        if (!updated.ok) {
          return res.redirect(
            303,
            `/app/patients/${encodeURIComponent(req.params.patientNumber)}?status_error=1`
          );
        }
        return res.redirect(
          303,
          `/app/patients/${encodeURIComponent(req.params.patientNumber)}?deceased=1`
        );
      } catch (err) {
        return next(err);
      }
    }
  );
}

module.exports = {
  registerActiveClinicPatientRoutes,
  CSRF_FIELD,
};
