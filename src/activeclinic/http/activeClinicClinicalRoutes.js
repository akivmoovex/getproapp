"use strict";

/**
 * ActiveClinic P04 clinical routes: encounters, triage, vitals, consultation, orders, alerts.
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
  createRequireActiveClinicDepartment,
  renderSimpleState,
} = require("./activeClinicPermissionMiddleware");
const {
  buildActiveClinicShellViewModel,
} = require("../services/buildActiveClinicShellViewModel");
const {
  renderActiveClinicAppPage,
} = require("./renderActiveClinicShell");
const {
  loadActiveClinicClinicalQueueScreen,
  loadActiveClinicConsultationWorkspaceScreen,
  loadActiveClinicTriageAssessmentScreen,
  loadActiveClinicVitalSignsEntryScreen,
  loadActiveClinicClinicalAlertScreen,
  loadActiveClinicOrderFormScreen,
  loadActiveClinicFollowUpWorklistScreen,
  loadActiveClinicReferralWorklistScreen,
  actorFromAuth,
} = require("../services/loadActiveClinicClinicalScreens");
const {
  startEncounter,
  recordTriageAssessment,
  recordVitalSignObservation,
  recordNursingIntake,
  recordConsultationNote,
  signConsultationNote,
  recordClinicalDiagnosis,
  createClinicalOrder,
  raiseClinicalAlert,
  closeEncounter,
  completeEncounterWorkspace,
  RESULT: CLINICAL_RESULT,
  PERM,
} = require("../services/activeClinicClinicalService");
const {
  updateClinicalFollowUpStatus,
} = require("../services/activeClinicClinicalFollowUpService");
const { requirePlatformDeploymentCode } = require("../../platform/config/platformDeploymentCode");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapClinicalError(code) {
  switch (code) {
    case CLINICAL_RESULT.ACCESS_DENIED:
      return "You do not have permission for this clinical action.";
    case CLINICAL_RESULT.FACILITY_NOT_FOUND:
      return "Facility not found.";
    case CLINICAL_RESULT.PATIENT_NOT_FOUND:
      return "Patient not found in this organization.";
    case CLINICAL_RESULT.ENCOUNTER_NOT_FOUND:
      return "Encounter not found.";
    case CLINICAL_RESULT.DUPLICATE_ACTIVE_ENCOUNTER:
      return "Patient already has an active encounter at this facility.";
    case CLINICAL_RESULT.INVALID_TRANSITION:
      return "That status change is not allowed.";
    case CLINICAL_RESULT.STALE_VERSION:
      return "This record was updated by someone else. Refresh and try again.";
    case CLINICAL_RESULT.CANNOT_SIGN_DRAFT:
      return "Cannot sign a draft note.";
    case CLINICAL_RESULT.CANNOT_EDIT_SIGNED:
      return "Cannot edit a signed note.";
    case CLINICAL_RESULT.INVALID_INPUT:
      return "Check the submitted details and try again.";
    default:
      return "Unable to complete the clinical request.";
  }
}

function registerActiveClinicClinicalRoutes(app, deps) {
  const getPool = deps.getPool;
  const env = deps.env;
  const isProduction = deps.isProduction;
  const requireAuth = createRequireActiveClinicAuth({ env, isProduction });
  const requirePermission = createRequireActiveClinicPermission({
    getPool,
    env,
    isProduction,
  });
  const requireDepartment = createRequireActiveClinicDepartment({ getPool, env });

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
      assetVersion: "p04-1",
    });
    if (shell.selectedFacility) {
      req.activeClinicAuth.selectedFacility = shell.selectedFacility;
    }
    const html = renderActiveClinicAppPage(options.content, shell);
    return res.status(options.status || 200).type("html").send(html);
  }

  function actor(auth) {
    return actorFromAuth(auth);
  }

  // Clinical queue (list open encounters)
  app.get(
    "/app/clinical",
    requireAuth,
    requirePermission(PERM.VIEW),
    requireDepartment("clinical"),
    async (req, res, next) => {
      try {
        const loaded = await loadActiveClinicClinicalQueueScreen(getPool(), {
          auth: req.activeClinicAuth,
        });
        if (!loaded.ok) {
          return res.status(403).type("html").send(
            renderSimpleState(
              "Clinical queue unavailable",
              mapClinicalError(loaded.code),
              { status: 403, linkHref: "/app", linkLabel: "Back to dashboard" }
            )
          );
        }
        return renderShell(req, res, {
          activeNav: "clinical",
          content: "app/clinical-queue-content.ejs",
          pageHeader: {
            title: "Practitioner worklist",
            description: `Today's patients and clinical queues at ${loaded.queue.facilityDisplayName}`,
            actions: [
              ...(loaded.queue.actions.canStartEncounter
                ? [{ href: "/app/clinical/start-encounter", label: "Start encounter" }]
                : []),
              { href: "/app/clinical/follow-up", label: "Follow-up", ghost: true },
            ],
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Clinical" },
          ],
          pageData: { queue: loaded.queue },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // Start encounter (GET form)
  app.get(
    "/app/clinical/start-encounter",
    requireAuth,
    requirePermission(PERM.MANAGE),
    requireDepartment("clinical"),
    async (req, res, next) => {
      try {
        return renderShell(req, res, {
          activeNav: "clinical",
          content: "app/clinical-start-encounter-content.ejs",
          pageHeader: {
            title: "Start encounter",
            description: "Start a new clinical encounter for a patient.",
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Clinical", href: "/app/clinical" },
            { label: "Start encounter" },
          ],
          pageData: {
            values: {
              patientId: String((req.query && req.query.patient_id) || "").trim(),
              appointmentId: String((req.query && req.query.appointment_id) || "").trim(),
            },
            error: null,
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // Start encounter (POST)
  app.post(
    "/app/clinical/start-encounter",
    requireAuth,
    requirePermission(PERM.MANAGE),
    requireDepartment("clinical"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const patientId = String(req.body.patient_id || "").trim();
        const encounterType = String(req.body.encounter_type || "outpatient").trim();
        const auth = req.activeClinicAuth;

        if (!UUID_RE.test(patientId)) {
          return renderShell(req, res, {
            activeNav: "clinical",
            content: "app/clinical-start-encounter-content.ejs",
            status: 400,
            pageHeader: { title: "Start encounter" },
            pageData: {
              values: { patientId, encounterType },
              error: "Valid patient ID is required.",
            },
          });
        }

        const result = await startEncounter(getPool(), {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          facilityId: auth.selectedFacility.id,
          patientId,
          encounterType,
          arrivalId: req.body.arrival_id || null,
          actor: actor(auth),
          deploymentCode: requirePlatformDeploymentCode(env).code,
        });

        if (!result.ok) {
          return renderShell(req, res, {
            activeNav: "clinical",
            content: "app/clinical-start-encounter-content.ejs",
            status: 400,
            pageHeader: { title: "Start encounter" },
            pageData: {
              values: { patientId, encounterType },
              error: mapClinicalError(result.code),
            },
          });
        }

        return res.redirect(303, `/app/clinical/encounter/${result.encounter.id}?started=1`);
      } catch (err) {
        return next(err);
      }
    }
  );

  // Consultation workspace
  app.get(
    "/app/clinical/encounter/:encounterId",
    requireAuth,
    requirePermission(PERM.VIEW),
    requireDepartment("clinical"),
    async (req, res, next) => {
      try {
        const encounterId = String(req.params.encounterId || "");
        if (!UUID_RE.test(encounterId)) {
          return res.status(404).type("html").send(
            renderSimpleState(
              "Encounter not found",
              "That encounter link is not valid.",
              { status: 404, linkHref: "/app/clinical", linkLabel: "Back to clinical queue" }
            )
          );
        }

        const loaded = await loadActiveClinicConsultationWorkspaceScreen(getPool(), {
          auth: req.activeClinicAuth,
          encounterId,
        });

        if (!loaded.ok) {
          return res.status(loaded.code === CLINICAL_RESULT.ACCESS_DENIED ? 403 : 404).type("html").send(
            renderSimpleState(
              "Encounter unavailable",
              mapClinicalError(loaded.code),
              { status: loaded.code === CLINICAL_RESULT.ACCESS_DENIED ? 403 : 404, linkHref: "/app/clinical", linkLabel: "Back to clinical queue" }
            )
          );
        }

        const flash =
          req.query.started === "1"
            ? { type: "success", message: "Encounter started." }
            : req.query.updated === "1"
              ? { type: "success", message: "Draft saved." }
              : req.query.completed === "1"
                ? { type: "success", message: "Encounter completed." }
                : req.query.signed === "1"
                  ? { type: "success", message: "Consultation note signed." }
                  : req.query.diagnosis_recorded === "1"
                    ? { type: "success", message: "Diagnosis recorded." }
                    : req.query.order_created === "1"
                      ? { type: "success", message: "Clinical order created." }
                      : req.query.intake_recorded === "1"
                        ? { type: "success", message: "Nursing intake recorded." }
                        : null;

        const headerActions = [];
        if (loaded.workspace.actions.canRecordTriage) {
          headerActions.push({
            href: `/app/clinical/encounter/${encounterId}/triage`,
            label: "Triage",
            ghost: true,
          });
        }
        if (loaded.workspace.actions.canRecordVitals) {
          headerActions.push({
            href: `/app/clinical/encounter/${encounterId}/vitals`,
            label: "Vitals",
            ghost: true,
          });
        }
        if (loaded.workspace.actions.canRecordDiagnosis) {
          headerActions.push({
            href: `/app/clinical/encounter/${encounterId}/diagnosis`,
            label: "Diagnosis",
            ghost: true,
          });
        }

        return renderShell(req, res, {
          activeNav: "clinical",
          content: "app/consultation-workspace-content.ejs",
          pageHeader: {
            title: `Encounter ${loaded.workspace.encounter.encounterNumber}`,
            description: `Patient: ${loaded.workspace.encounter.patientDisplayName}`,
            actions: headerActions,
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Clinical", href: "/app/clinical" },
            { label: "Encounter" },
          ],
          flash,
          pageData: { workspace: loaded.workspace },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // Triage assessment
  app.get(
    "/app/clinical/encounter/:encounterId/triage",
    requireAuth,
    requirePermission(PERM.TRIAGE),
    requireDepartment("clinical"),
    async (req, res, next) => {
      try {
        const encounterId = String(req.params.encounterId || "");
        if (!UUID_RE.test(encounterId)) {
          return res.status(404).type("html").send(renderSimpleState("Not found", "Invalid encounter ID", { status: 404 }));
        }

        const loaded = await loadActiveClinicTriageAssessmentScreen(getPool(), {
          auth: req.activeClinicAuth,
          encounterId,
        });

        if (!loaded.ok) {
          return res.status(403).type("html").send(
            renderSimpleState("Triage unavailable", mapClinicalError(loaded.code), { status: 403 })
          );
        }

        return renderShell(req, res, {
          activeNav: "clinical",
          content: "app/triage-assessment-content.ejs",
          pageHeader: { title: "Triage assessment" },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Clinical", href: "/app/clinical" },
            { label: "Encounter", href: `/app/clinical/encounter/${encounterId}` },
            { label: "Triage" },
          ],
          pageData: { triage: loaded.triage },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/clinical/encounter/:encounterId/triage",
    requireAuth,
    requirePermission(PERM.TRIAGE),
    requireDepartment("clinical"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const encounterId = String(req.params.encounterId || "");
        const auth = req.activeClinicAuth;

        const result = await recordTriageAssessment(getPool(), {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          facilityId: auth.selectedFacility.id,
          encounterId,
          triageCategory: req.body.triage_category || null,
          chiefComplaint: String(req.body.chief_complaint || "").trim(),
          presentingSymptoms: String(req.body.presenting_symptoms || "").trim() || null,
          allergiesReported: String(req.body.allergies_reported || "").trim() || null,
          currentMedicationsReported: String(req.body.current_medications_reported || "").trim() || null,
          medicalHistorySummary: String(req.body.medical_history_summary || "").trim() || null,
          painLevel: req.body.pain_level ? parseInt(req.body.pain_level, 10) : null,
          status: req.body.status || "draft",
          actor: actor(auth),
          deploymentCode: requirePlatformDeploymentCode(env).code,
        });

        if (!result.ok) {
          return renderShell(req, res, {
            activeNav: "clinical",
            content: "app/triage-assessment-content.ejs",
            status: 400,
            pageHeader: { title: "Triage assessment" },
            pageData: {
              triage: {
                encounter: { id: encounterId },
                values: req.body,
                error: mapClinicalError(result.code),
              },
            },
          });
        }

        return res.redirect(303, `/app/clinical/encounter/${encounterId}?updated=1`);
      } catch (err) {
        return next(err);
      }
    }
  );

  // Vital signs entry
  app.get(
    "/app/clinical/encounter/:encounterId/vitals",
    requireAuth,
    requirePermission(PERM.TRIAGE),
    requireDepartment("clinical"),
    async (req, res, next) => {
      try {
        const encounterId = String(req.params.encounterId || "");
        if (!UUID_RE.test(encounterId)) {
          return res.status(404).type("html").send(renderSimpleState("Not found", "Invalid encounter ID", { status: 404 }));
        }

        const loaded = await loadActiveClinicVitalSignsEntryScreen(getPool(), {
          auth: req.activeClinicAuth,
          encounterId,
        });

        if (!loaded.ok) {
          return res.status(403).type("html").send(
            renderSimpleState("Vitals unavailable", mapClinicalError(loaded.code), { status: 403 })
          );
        }

        return renderShell(req, res, {
          activeNav: "clinical",
          content: "app/vital-signs-entry-content.ejs",
          pageHeader: {
            title: "Vitals & Observations",
            description: "Record encounter vitals. One observation per save.",
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Clinical", href: "/app/clinical" },
            { label: "Encounter", href: `/app/clinical/encounter/${encounterId}` },
            { label: "Vitals" },
          ],
          flash:
            req.query && req.query.recorded === "1"
              ? { type: "success", message: "Observation recorded." }
              : null,
          pageData: { vitals: loaded.vitals },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/clinical/encounter/:encounterId/vitals",
    requireAuth,
    requirePermission(PERM.TRIAGE),
    requireDepartment("clinical"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const encounterId = String(req.params.encounterId || "");
        const auth = req.activeClinicAuth;

        const result = await recordVitalSignObservation(getPool(), {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          facilityId: auth.selectedFacility.id,
          encounterId,
          observationType: String(req.body.observation_type || "").trim(),
          valueNumeric: req.body.value_numeric ? parseFloat(req.body.value_numeric) : null,
          valueText: String(req.body.value_text || "").trim() || null,
          unit: String(req.body.unit || "").trim() || null,
          systolic: req.body.systolic ? parseInt(req.body.systolic, 10) : null,
          diastolic: req.body.diastolic ? parseInt(req.body.diastolic, 10) : null,
          actor: actor(auth),
          deploymentCode: requirePlatformDeploymentCode(env).code,
        });

        if (!result.ok) {
          const reloaded = await loadActiveClinicVitalSignsEntryScreen(getPool(), {
            auth,
            encounterId,
            values: req.body,
            error: mapClinicalError(result.code),
          });
          return renderShell(req, res, {
            activeNav: "clinical",
            content: "app/vital-signs-entry-content.ejs",
            status: 400,
            pageHeader: {
              title: "Vitals & Observations",
              description: "Record encounter vitals. One observation per save.",
            },
            breadcrumbs: [
              { label: "Home", href: "/app" },
              { label: "Clinical", href: "/app/clinical" },
              { label: "Encounter", href: `/app/clinical/encounter/${encounterId}` },
              { label: "Vitals" },
            ],
            pageData: {
              vitals: reloaded.ok
                ? reloaded.vitals
                : {
                    encounter: { id: encounterId },
                    observations: [],
                    values: req.body,
                    error: mapClinicalError(result.code),
                  },
            },
          });
        }

        return res.redirect(303, `/app/clinical/encounter/${encounterId}/vitals?recorded=1`);
      } catch (err) {
        return next(err);
      }
    }
  );

  // Nursing intake (GET form + POST)
  app.get(
    "/app/clinical/encounter/:encounterId/nursing-intake",
    requireAuth,
    requirePermission(PERM.NURSING_INTAKE),
    requireDepartment("clinical"),
    async (req, res, next) => {
      try {
        const encounterId = String(req.params.encounterId || "");
        if (!UUID_RE.test(encounterId)) {
          return res.status(404).type("html").send(renderSimpleState("Not found", "Invalid encounter ID", { status: 404 }));
        }

        const loaded = await loadActiveClinicConsultationWorkspaceScreen(getPool(), {
          auth: req.activeClinicAuth,
          encounterId,
        });

        if (!loaded.ok) {
          return res.status(loaded.code === CLINICAL_RESULT.ACCESS_DENIED ? 403 : 404).type("html").send(
            renderSimpleState("Nursing intake unavailable", mapClinicalError(loaded.code), {
              status: loaded.code === CLINICAL_RESULT.ACCESS_DENIED ? 403 : 404,
              linkHref: "/app/clinical",
              linkLabel: "Back to clinical queue",
            })
          );
        }

        return renderShell(req, res, {
          activeNav: "clinical",
          content: "app/nursing-intake-content.ejs",
          pageHeader: { title: "Nursing intake" },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Clinical", href: "/app/clinical" },
            { label: "Encounter", href: `/app/clinical/encounter/${encounterId}` },
            { label: "Nursing intake" },
          ],
          pageData: {
            intake: {
              encounter: loaded.workspace.encounter,
              values: {},
              note: null,
            },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/clinical/encounter/:encounterId/nursing-intake",
    requireAuth,
    requirePermission(PERM.NURSING_INTAKE),
    requireDepartment("clinical"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const encounterId = String(req.params.encounterId || "");
        const auth = req.activeClinicAuth;

        const result = await recordNursingIntake(getPool(), {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          facilityId: auth.selectedFacility.id,
          encounterId,
          intakeNoteText: String(req.body.intake_note_text || "").trim(),
          actor: actor(auth),
          deploymentCode: requirePlatformDeploymentCode(env).code,
        });

        if (!result.ok) {
          return res.status(400).type("html").send(
            renderSimpleState("Nursing intake failed", mapClinicalError(result.code), { status: 400 })
          );
        }

        return res.redirect(303, `/app/clinical/encounter/${encounterId}?intake_recorded=1`);
      } catch (err) {
        return next(err);
      }
    }
  );

  // Diagnosis entry (GET form + POST)
  app.get(
    "/app/clinical/encounter/:encounterId/diagnosis",
    requireAuth,
    requirePermission(PERM.DIAGNOSIS_RECORD),
    requireDepartment("clinical"),
    async (req, res, next) => {
      try {
        const encounterId = String(req.params.encounterId || "");
        if (!UUID_RE.test(encounterId)) {
          return res.status(404).type("html").send(renderSimpleState("Not found", "Invalid encounter ID", { status: 404 }));
        }

        const loaded = await loadActiveClinicConsultationWorkspaceScreen(getPool(), {
          auth: req.activeClinicAuth,
          encounterId,
        });

        if (!loaded.ok) {
          return res.status(loaded.code === CLINICAL_RESULT.ACCESS_DENIED ? 403 : 404).type("html").send(
            renderSimpleState("Diagnosis entry unavailable", mapClinicalError(loaded.code), {
              status: loaded.code === CLINICAL_RESULT.ACCESS_DENIED ? 403 : 404,
              linkHref: "/app/clinical",
              linkLabel: "Back to clinical queue",
            })
          );
        }

        return renderShell(req, res, {
          activeNav: "clinical",
          content: "app/diagnosis-entry-content.ejs",
          pageHeader: { title: "Diagnosis entry" },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Clinical", href: "/app/clinical" },
            { label: "Encounter", href: `/app/clinical/encounter/${encounterId}` },
            { label: "Diagnosis" },
          ],
          pageData: {
            diagnosis: {
              encounter: loaded.workspace.encounter,
              values: {},
            },
          },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/clinical/encounter/:encounterId/diagnosis",
    requireAuth,
    requirePermission(PERM.DIAGNOSIS_RECORD),
    requireDepartment("clinical"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const encounterId = String(req.params.encounterId || "");
        const auth = req.activeClinicAuth;

        const result = await recordClinicalDiagnosis(getPool(), {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          facilityId: auth.selectedFacility.id,
          encounterId,
          diagnosisCode: String(req.body.diagnosis_code || "").trim() || null,
          diagnosisText: String(req.body.diagnosis_text || "").trim(),
          diagnosisType: String(req.body.diagnosis_type || "primary").trim(),
          certainty: String(req.body.certainty || "").trim() || null,
          correctsDiagnosisId: req.body.corrects_diagnosis_id || null,
          actor: actor(auth),
          deploymentCode: requirePlatformDeploymentCode(env).code,
        });

        if (!result.ok) {
          return res.status(400).type("html").send(
            renderSimpleState("Diagnosis entry failed", mapClinicalError(result.code), { status: 400 })
          );
        }

        return res.redirect(303, `/app/clinical/encounter/${encounterId}?diagnosis_recorded=1`);
      } catch (err) {
        return next(err);
      }
    }
  );

  // Consultation note draft (POST)
  app.post(
    "/app/clinical/encounter/:encounterId/consultation",
    requireAuth,
    requirePermission(PERM.CONSULTATION_RECORD),
    requireDepartment("clinical"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const encounterId = String(req.params.encounterId || "");
        const auth = req.activeClinicAuth;

        const result = await recordConsultationNote(getPool(), {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          facilityId: auth.selectedFacility.id,
          encounterId,
          noteType: req.body.note_type || "consultation",
          chiefComplaint: String(req.body.chief_complaint || req.body.subjective_text || "").trim() || null,
          observations: String(req.body.observations || req.body.objective_text || "").trim() || null,
          diagnosis: String(req.body.diagnosis || req.body.assessment_text || "").trim() || null,
          treatmentPlan: String(req.body.treatment_plan || req.body.plan_text || "").trim() || null,
          historyText: String(req.body.history_text || "").trim() || null,
          medicationText: String(req.body.medication || "").trim() || null,
          followUpPlanText: String(req.body.follow_up || "").trim() || null,
          referralText: String(req.body.referral || "").trim() || null,
          additionalNotes: String(req.body.additional_notes || "").trim() || null,
          version: req.body.version ? Number(req.body.version) : undefined,
          actor: actor(auth),
          deploymentCode: requirePlatformDeploymentCode(env).code,
        });

        if (!result.ok) {
          return res.status(400).type("html").send(
            renderSimpleState("Consultation save failed", mapClinicalError(result.code), { status: 400 })
          );
        }

        return res.redirect(303, `/app/clinical/encounter/${encounterId}?updated=1`);
      } catch (err) {
        return next(err);
      }
    }
  );

  // Complete encounter (save draft + close)
  app.post(
    "/app/clinical/encounter/:encounterId/complete",
    requireAuth,
    requirePermission(PERM.MANAGE),
    requireDepartment("clinical"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const encounterId = String(req.params.encounterId || "");
        const auth = req.activeClinicAuth;
        const result = await completeEncounterWorkspace(getPool(), {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          facilityId: auth.selectedFacility.id,
          encounterId,
          noteType: "consultation",
          chiefComplaint: String(req.body.chief_complaint || "").trim() || null,
          observations: String(req.body.observations || "").trim() || null,
          diagnosis: String(req.body.diagnosis || "").trim() || null,
          treatmentPlan: String(req.body.treatment_plan || "").trim() || null,
          historyText: String(req.body.history_text || "").trim() || null,
          medicationText: String(req.body.medication || "").trim() || null,
          followUpPlanText: String(req.body.follow_up || "").trim() || null,
          referralText: String(req.body.referral || "").trim() || null,
          followUpDueAt: String(req.body.follow_up_due_at || "").trim() || null,
          createFollowUp: !!(
            String(req.body.follow_up || "").trim() ||
            String(req.body.referral || "").trim() ||
            String(req.body.follow_up_due_at || "").trim()
          ),
          version: req.body.version ? Number(req.body.version) : undefined,
          encounterVersion: req.body.encounter_version
            ? Number(req.body.encounter_version)
            : undefined,
          actor: actor(auth),
          deploymentCode: requirePlatformDeploymentCode(env).code,
        });
        if (!result.ok) {
          return res.status(400).type("html").send(
            renderSimpleState("Complete failed", mapClinicalError(result.code), { status: 400 })
          );
        }
        return res.redirect(303, "/app/clinical?completed=1");
      } catch (err) {
        return next(err);
      }
    }
  );

  // ACN16 follow-up worklist
  app.get(
    "/app/clinical/follow-up",
    requireAuth,
    requirePermission(PERM.VIEW),
    requireDepartment("clinical"),
    async (req, res, next) => {
      try {
        const loaded = await loadActiveClinicFollowUpWorklistScreen(getPool(), {
          auth: req.activeClinicAuth,
          query: req.query,
        });
        if (!loaded.ok) {
          return res.status(403).type("html").send(
            renderSimpleState(
              "Follow-up worklist unavailable",
              mapClinicalError(loaded.code),
              { status: 403, linkHref: "/app/clinical", linkLabel: "Back to clinical" }
            )
          );
        }
        return renderShell(req, res, {
          activeNav: "clinical",
          content: "app/clinical-follow-up-content.ejs",
          pageHeader: {
            title: "Follow-up worklist",
            description: `Due reviews, missed appointments, referrals, and incomplete notes at ${loaded.followUp.facilityDisplayName}`,
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Clinical", href: "/app/clinical" },
            { label: "Follow-up" },
          ],
          pageData: { followUp: loaded.followUp },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // ACN20 referral presentation — filtered view of ACN16 pending_referral items
  app.get(
    "/app/clinical/referrals",
    requireAuth,
    requirePermission(PERM.VIEW),
    requireDepartment("clinical"),
    async (req, res, next) => {
      try {
        const loaded = await loadActiveClinicReferralWorklistScreen(getPool(), {
          auth: req.activeClinicAuth,
          query: req.query,
        });
        if (!loaded.ok) {
          return res.status(403).type("html").send(
            renderSimpleState(
              "Referral worklist unavailable",
              mapClinicalError(loaded.code),
              { status: 403, linkHref: "/app/clinical/follow-up", linkLabel: "Back to follow-up" }
            )
          );
        }
        return renderShell(req, res, {
          activeNav: "clinical_follow_up",
          content: "app/clinical-referrals-content.ejs",
          pageHeader: {
            title: "Referral Management",
            description: `Pending referral follow-up items at ${loaded.referrals.facilityDisplayName}`,
            actions: [
              { href: "/app/clinical/follow-up", label: "Full follow-up", ghost: true },
              { href: "/app/clinical", label: "Clinical worklist", ghost: true },
            ],
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Clinical", href: "/app/clinical" },
            { label: "Follow-up", href: "/app/clinical/follow-up" },
            { label: "Referrals" },
          ],
          pageData: { referrals: loaded.referrals },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/clinical/follow-up/:itemId/status",
    requireAuth,
    requirePermission(PERM.CONSULTATION_RECORD),
    requireDepartment("clinical"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const auth = req.activeClinicAuth;
        const updated = await updateClinicalFollowUpStatus(getPool(), {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          facilityId: auth.selectedFacility.id,
          itemId: req.params.itemId,
          status: req.body.status,
          version: req.body.version ? Number(req.body.version) : undefined,
          note: req.body.note || null,
          actor: actor(auth),
          body: req.body,
          deploymentCode: requirePlatformDeploymentCode(env).code,
        });
        if (!updated.ok) {
          return res.status(400).type("html").send(
            renderSimpleState("Follow-up update failed", mapClinicalError(updated.code), {
              status: 400,
            })
          );
        }
        const returnTo = String((req.body && req.body.return_to) || "").trim();
        const safeReturn =
          returnTo === "/app/clinical/referrals" ? "/app/clinical/referrals?ok=1" : "/app/clinical/follow-up?ok=1";
        return res.redirect(303, safeReturn);
      } catch (err) {
        return next(err);
      }
    }
  );

  // Sign consultation note (POST)
  app.post(
    "/app/clinical/encounter/:encounterId/consultation/:consultationId/sign",
    requireAuth,
    requirePermission(PERM.CONSULTATION_SIGN),
    requireDepartment("clinical"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const encounterId = String(req.params.encounterId || "");
        const consultationId = String(req.params.consultationId || "");
        const auth = req.activeClinicAuth;

        const result = await signConsultationNote(getPool(), {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          facilityId: auth.selectedFacility.id,
          consultationNoteId: consultationId,
          actor: actor(auth),
          deploymentCode: requirePlatformDeploymentCode(env).code,
        });

        if (!result.ok) {
          return res.status(400).type("html").send(
            renderSimpleState("Sign failed", mapClinicalError(result.code), { status: 400 })
          );
        }

        return res.redirect(303, `/app/clinical/encounter/${encounterId}?signed=1`);
      } catch (err) {
        return next(err);
      }
    }
  );

  // Create clinical order (lab/prescription/radiology)
  app.get(
    "/app/clinical/encounter/:encounterId/order/:orderType",
    requireAuth,
    requirePermission(PERM.ORDER_CREATE),
    requireDepartment("clinical"),
    async (req, res, next) => {
      try {
        const encounterId = String(req.params.encounterId || "");
        const orderType = String(req.params.orderType || "");

        if (!["lab", "prescription", "radiology"].includes(orderType)) {
          return res.status(404).type("html").send(renderSimpleState("Not found", "Invalid order type", { status: 404 }));
        }

        const loaded = await loadActiveClinicOrderFormScreen(getPool(), {
          auth: req.activeClinicAuth,
          encounterId,
          orderType,
        });

        if (!loaded.ok) {
          return res.status(403).type("html").send(
            renderSimpleState("Order form unavailable", mapClinicalError(loaded.code), { status: 403 })
          );
        }

        const titles = {
          lab: "Laboratory request",
          prescription: "Prescription Editor",
          radiology: "Radiology request",
        };
        const contents = {
          lab: "app/create-laboratory-request-content.ejs",
          prescription: "app/create-prescription-content.ejs",
          radiology: "app/create-radiology-request-content.ejs",
        };

        return renderShell(req, res, {
          activeNav: "clinical",
          content: contents[orderType],
          pageHeader: {
            title: titles[orderType],
            description:
              orderType === "prescription"
                ? "Manual prescription order for pharmacy handoff."
                : undefined,
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Clinical", href: "/app/clinical" },
            { label: "Encounter", href: `/app/clinical/encounter/${encounterId}` },
            { label: titles[orderType] },
          ],
          pageData: { orderForm: loaded.orderForm },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/clinical/encounter/:encounterId/order/:orderType",
    requireAuth,
    requirePermission(PERM.ORDER_CREATE),
    requireDepartment("clinical"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const encounterId = String(req.params.encounterId || "");
        const orderType = String(req.params.orderType || "");
        const auth = req.activeClinicAuth;

        const orderTypeMap = { lab: "laboratory", prescription: "prescription", radiology: "radiology" };

        const result = await createClinicalOrder(getPool(), {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          facilityId: auth.selectedFacility.id,
          encounterId,
          orderType: orderTypeMap[orderType],
          orderDetails: req.body.order_details ? JSON.parse(req.body.order_details) : req.body,
          instructions: String(req.body.instructions || "").trim() || null,
          actor: actor(auth),
          deploymentCode: requirePlatformDeploymentCode(env).code,
        });

        if (!result.ok) {
          if (orderType === "prescription") {
            const reloaded = await loadActiveClinicOrderFormScreen(getPool(), {
              auth,
              encounterId,
              orderType,
              values: req.body,
              error: mapClinicalError(result.code),
            });
            return renderShell(req, res, {
              activeNav: "clinical",
              content: "app/create-prescription-content.ejs",
              status: 400,
              pageHeader: {
                title: "Prescription Editor",
                description: "Manual prescription order for pharmacy handoff.",
              },
              breadcrumbs: [
                { label: "Home", href: "/app" },
                { label: "Clinical", href: "/app/clinical" },
                { label: "Encounter", href: `/app/clinical/encounter/${encounterId}` },
                { label: "Prescription Editor" },
              ],
              pageData: {
                orderForm: reloaded.ok
                  ? reloaded.orderForm
                  : {
                      encounter: { id: encounterId },
                      orderType: "prescription",
                      values: req.body,
                      error: mapClinicalError(result.code),
                    },
              },
            });
          }
          return res.status(400).type("html").send(
            renderSimpleState("Order creation failed", mapClinicalError(result.code), { status: 400 })
          );
        }

        return res.redirect(303, `/app/clinical/encounter/${encounterId}?order_created=1`);
      } catch (err) {
        return next(err);
      }
    }
  );

  // Clinical alerts
  app.get(
    "/app/clinical/alerts",
    requireAuth,
    requirePermission(PERM.ALERT_VIEW),
    requireDepartment("clinical"),
    async (req, res, next) => {
      try {
        const loaded = await loadActiveClinicClinicalAlertScreen(getPool(), {
          auth: req.activeClinicAuth,
        });

        if (!loaded.ok) {
          return res.status(403).type("html").send(
            renderSimpleState("Alerts unavailable", mapClinicalError(loaded.code), { status: 403 })
          );
        }

        return renderShell(req, res, {
          activeNav: "clinical",
          content: "app/clinical-escalation-alert-content.ejs",
          pageHeader: {
            title: "Clinical escalation alerts",
            description: `Active alerts at ${loaded.alerts.facilityDisplayName}`,
            actions: loaded.alerts.actions.canRaiseAlert
              ? [{ href: "/app/clinical/alerts/raise", label: "Raise alert" }]
              : [],
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Clinical", href: "/app/clinical" },
            { label: "Alerts" },
          ],
          pageData: { alerts: loaded.alerts },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/clinical/alerts/raise",
    requireAuth,
    requirePermission(PERM.ALERT_RAISE),
    requireDepartment("clinical"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const auth = req.activeClinicAuth;

        const result = await raiseClinicalAlert(getPool(), {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          facilityId: auth.selectedFacility.id,
          encounterId: req.body.encounter_id || null,
          patientId: String(req.body.patient_id || "").trim(),
          alertType: String(req.body.alert_type || "").trim(),
          alertMessage: String(req.body.alert_message || "").trim(),
          priority: String(req.body.priority || "medium").trim(),
          actor: actor(auth),
          deploymentCode: requirePlatformDeploymentCode(env).code,
        });

        if (!result.ok) {
          return res.status(400).type("html").send(
            renderSimpleState("Alert raise failed", mapClinicalError(result.code), { status: 400 })
          );
        }

        return res.redirect(303, "/app/clinical/alerts?raised=1");
      } catch (err) {
        return next(err);
      }
    }
  );

  // Close encounter
  app.post(
    "/app/clinical/encounter/:encounterId/close",
    requireAuth,
    requirePermission(PERM.MANAGE),
    requireDepartment("clinical"),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const encounterId = String(req.params.encounterId || "");
        const auth = req.activeClinicAuth;

        const result = await closeEncounter(getPool(), {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          facilityId: auth.selectedFacility.id,
          encounterId,
          closureNote: String(req.body.closure_note || "").trim() || null,
          version: parseInt(req.body.version, 10),
          actor: actor(auth),
          deploymentCode: requirePlatformDeploymentCode(env).code,
        });

        if (!result.ok) {
          return res.status(400).type("html").send(
            renderSimpleState("Close failed", mapClinicalError(result.code), { status: 400 })
          );
        }

        return res.redirect(303, "/app/clinical?closed=1");
      } catch (err) {
        return next(err);
      }
    }
  );
}

module.exports = {
  registerActiveClinicClinicalRoutes,
};
