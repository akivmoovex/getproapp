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
  RESULT: CLINICAL_RESULT,
  PERM,
} = require("../services/activeClinicClinicalService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");
const { getPlatformDeploymentCode } = require("../../platform/config/platformDeploymentCode");

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
            title: "Clinical queue",
            description: `Open encounters at ${loaded.queue.facilityDisplayName}`,
            actions: loaded.queue.actions.canStartEncounter
              ? [{ href: "/app/clinical/start-encounter", label: "Start encounter" }]
              : [],
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
          pageData: { values: {}, error: null },
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
          deploymentCode: getPlatformDeploymentCode(env) || CODE_ACTIVECLINIC_ORG_V6,
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
              ? { type: "success", message: "Encounter updated." }
              : null;

        return renderShell(req, res, {
          activeNav: "clinical",
          content: "app/consultation-workspace-content.ejs",
          pageHeader: {
            title: `Encounter ${loaded.workspace.encounter.encounterNumber}`,
            description: `Patient: ${loaded.workspace.encounter.patientDisplayName}`,
            actions: [
              { href: `/app/clinical/encounter/${encounterId}/triage`, label: "Triage" },
              { href: `/app/clinical/encounter/${encounterId}/vitals`, label: "Vitals" },
              { href: `/app/clinical/encounter/${encounterId}/order/prescription`, label: "New prescription", ghost: true },
              { href: `/app/clinical/encounter/${encounterId}/order/lab`, label: "Lab order", ghost: true },
            ],
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
          deploymentCode: getPlatformDeploymentCode(env) || CODE_ACTIVECLINIC_ORG_V6,
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
          pageHeader: { title: "Vital signs entry" },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Clinical", href: "/app/clinical" },
            { label: "Encounter", href: `/app/clinical/encounter/${encounterId}` },
            { label: "Vitals" },
          ],
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
          deploymentCode: getPlatformDeploymentCode(env) || CODE_ACTIVECLINIC_ORG_V6,
        });

        if (!result.ok) {
          return renderShell(req, res, {
            activeNav: "clinical",
            content: "app/vital-signs-entry-content.ejs",
            status: 400,
            pageHeader: { title: "Vital signs entry" },
            pageData: {
              vitals: {
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

  // Nursing intake (POST)
  app.post(
    "/app/clinical/encounter/:encounterId/nursing-intake",
    requireAuth,
    requirePermission(PERM.NURSING_INTAKE),
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
          deploymentCode: getPlatformDeploymentCode(env) || CODE_ACTIVECLINIC_ORG_V6,
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

  // Diagnosis entry (POST)
  app.post(
    "/app/clinical/encounter/:encounterId/diagnosis",
    requireAuth,
    requirePermission(PERM.DIAGNOSIS_RECORD),
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
          deploymentCode: getPlatformDeploymentCode(env) || CODE_ACTIVECLINIC_ORG_V6,
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
          subjectiveText: String(req.body.subjective_text || "").trim() || null,
          objectiveText: String(req.body.objective_text || "").trim() || null,
          assessmentText: String(req.body.assessment_text || "").trim() || null,
          planText: String(req.body.plan_text || "").trim() || null,
          additionalNotes: String(req.body.additional_notes || "").trim() || null,
          actor: actor(auth),
          deploymentCode: getPlatformDeploymentCode(env) || CODE_ACTIVECLINIC_ORG_V6,
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

  // Sign consultation note (POST)
  app.post(
    "/app/clinical/encounter/:encounterId/consultation/:consultationId/sign",
    requireAuth,
    requirePermission(PERM.CONSULTATION_SIGN),
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
          deploymentCode: getPlatformDeploymentCode(env) || CODE_ACTIVECLINIC_ORG_V6,
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

        const titles = { lab: "Laboratory request", prescription: "Prescription", radiology: "Radiology request" };
        const contents = {
          lab: "app/create-laboratory-request-content.ejs",
          prescription: "app/create-prescription-content.ejs",
          radiology: "app/create-radiology-request-content.ejs",
        };

        return renderShell(req, res, {
          activeNav: "clinical",
          content: contents[orderType],
          pageHeader: { title: titles[orderType] },
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
          deploymentCode: getPlatformDeploymentCode(env) || CODE_ACTIVECLINIC_ORG_V6,
        });

        if (!result.ok) {
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
          deploymentCode: getPlatformDeploymentCode(env) || CODE_ACTIVECLINIC_ORG_V6,
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
          deploymentCode: getPlatformDeploymentCode(env) || CODE_ACTIVECLINIC_ORG_V6,
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
