"use strict";

/**
 * ActiveClinic P06 diagnostics routes: laboratory/radiology fulfillment, specimens, results.
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
  loadActiveClinicLaboratoryDashboardScreen,
  loadActiveClinicLaboratoryQueueScreen,
  loadActiveClinicLaboratoryWorklistScreen,
  loadActiveClinicLaboratoryRequestDetailScreen,
  loadActiveClinicSpecimenCollectionScreen,
  loadActiveClinicSpecimenReceiptScreen,
  loadActiveClinicSpecimenRejectedScreen,
  loadActiveClinicEnterLaboratoryResultScreen,
  loadActiveClinicRadiologyDashboardScreen,
  loadActiveClinicRadiologyQueueScreen,
  loadActiveClinicEnterRadiologyReportScreen,
  loadActiveClinicCriticalResultAlertScreen,
  actorFromAuth,
} = require("../services/loadActiveClinicDiagnosticsScreens");
const {
  collectSpecimen,
  receiveSpecimen,
  rejectSpecimen,
  enterLaboratoryResult,
  enterRadiologyReport,
  verifyLaboratoryResult,
  verifyRadiologyReport,
  releaseLaboratoryResult,
  releaseRadiologyReport,
  acknowledgeCriticalResult,
  RESULT: DIAGNOSTICS_RESULT,
  PERM,
} = require("../services/activeClinicDiagnosticsService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");
const { getPlatformDeploymentCode } = require("../../platform/config/platformDeploymentCode");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapDiagnosticsError(code) {
  switch (code) {
    case DIAGNOSTICS_RESULT.ACCESS_DENIED:
      return "You do not have permission for this diagnostics action.";
    case DIAGNOSTICS_RESULT.FACILITY_NOT_FOUND:
      return "Facility not found.";
    case DIAGNOSTICS_RESULT.PATIENT_NOT_FOUND:
      return "Patient not found in this organization.";
    case DIAGNOSTICS_RESULT.REQUEST_NOT_FOUND:
      return "Request not found.";
    case DIAGNOSTICS_RESULT.SPECIMEN_NOT_FOUND:
      return "Specimen not found.";
    case DIAGNOSTICS_RESULT.RESULT_NOT_FOUND:
      return "Result not found.";
    case DIAGNOSTICS_RESULT.INVALID_STATUS:
      return "That status change is not allowed.";
    case DIAGNOSTICS_RESULT.ALREADY_VERIFIED:
      return "This result has already been verified.";
    case DIAGNOSTICS_RESULT.ALREADY_RELEASED:
      return "This result has already been released.";
    case DIAGNOSTICS_RESULT.INVALID_INPUT:
      return "Check the submitted details and try again.";
    default:
      return "Unable to complete the diagnostics request.";
  }
}

function registerActiveClinicDiagnosticsRoutes(app, deps) {
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
      assetVersion: "p06-1",
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

  // Laboratory dashboard
  app.get(
    "/app/diagnostics/laboratory",
    requireAuth,
    requirePermission(PERM.VIEW),
    async (req, res, next) => {
      try {
        const loaded = await loadActiveClinicLaboratoryDashboardScreen(getPool(), {
          auth: req.activeClinicAuth,
        });
        if (!loaded.ok) {
          return res.status(403).type("html").send(
            renderSimpleState(
              "Laboratory dashboard unavailable",
              mapDiagnosticsError(loaded.code),
              { status: 403, linkHref: "/app", linkLabel: "Back to dashboard" }
            )
          );
        }
        return renderShell(req, res, {
          activeNav: "diagnostics",
          content: "app/diagnostics-laboratory-dashboard-content.ejs",
          pageHeader: {
            title: "Laboratory dashboard",
            description: `${loaded.dashboard.facilityDisplayName}`,
            actions: [
              { href: "/app/diagnostics/laboratory/queue", label: "View queue" },
              { href: "/app/diagnostics/laboratory/worklist", label: "Worklist" },
            ],
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Diagnostics" },
            { label: "Laboratory" },
          ],
          pageData: { dashboard: loaded.dashboard },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // Laboratory request queue
  app.get(
    "/app/diagnostics/laboratory/queue",
    requireAuth,
    requirePermission(PERM.VIEW),
    async (req, res, next) => {
      try {
        const loaded = await loadActiveClinicLaboratoryQueueScreen(getPool(), {
          auth: req.activeClinicAuth,
        });
        if (!loaded.ok) {
          return res.status(403).type("html").send(
            renderSimpleState(
              "Laboratory queue unavailable",
              mapDiagnosticsError(loaded.code),
              { status: 403, linkHref: "/app", linkLabel: "Back to dashboard" }
            )
          );
        }
        return renderShell(req, res, {
          activeNav: "diagnostics",
          content: "app/diagnostics-laboratory-queue-content.ejs",
          pageHeader: {
            title: "Laboratory request queue",
            description: `Pending requests at ${loaded.queue.facilityDisplayName}`,
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Diagnostics" },
            { label: "Laboratory", href: "/app/diagnostics/laboratory" },
            { label: "Queue" },
          ],
          pageData: { queue: loaded.queue },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // Laboratory worklist (specimen processing)
  app.get(
    "/app/diagnostics/laboratory/worklist",
    requireAuth,
    requirePermission(PERM.VIEW),
    async (req, res, next) => {
      try {
        const loaded = await loadActiveClinicLaboratoryWorklistScreen(getPool(), {
          auth: req.activeClinicAuth,
        });
        if (!loaded.ok) {
          return res.status(403).type("html").send(
            renderSimpleState(
              "Laboratory worklist unavailable",
              mapDiagnosticsError(loaded.code),
              { status: 403, linkHref: "/app", linkLabel: "Back to dashboard" }
            )
          );
        }
        return renderShell(req, res, {
          activeNav: "diagnostics",
          content: "app/diagnostics-laboratory-worklist-content.ejs",
          pageHeader: {
            title: "Laboratory worklist",
            description: "Specimens in processing",
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Diagnostics" },
            { label: "Laboratory", href: "/app/diagnostics/laboratory" },
            { label: "Worklist" },
          ],
          pageData: { worklist: loaded.worklist },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // Laboratory request detail
  app.get(
    "/app/diagnostics/laboratory/request/:requestId",
    requireAuth,
    requirePermission(PERM.VIEW),
    async (req, res, next) => {
      try {
        const requestId = String(req.params.requestId || "");
        if (!UUID_RE.test(requestId)) {
          return res.status(404).type("html").send(
            renderSimpleState(
              "Request not found",
              "That request link is not valid.",
              { status: 404, linkHref: "/app/diagnostics/laboratory", linkLabel: "Back to laboratory" }
            )
          );
        }

        const loaded = await loadActiveClinicLaboratoryRequestDetailScreen(getPool(), {
          auth: req.activeClinicAuth,
          requestId,
        });

        if (!loaded.ok) {
          return res.status(loaded.code === DIAGNOSTICS_RESULT.ACCESS_DENIED ? 403 : 404).type("html").send(
            renderSimpleState(
              "Request unavailable",
              mapDiagnosticsError(loaded.code),
              { status: loaded.code === DIAGNOSTICS_RESULT.ACCESS_DENIED ? 403 : 404, linkHref: "/app/diagnostics/laboratory", linkLabel: "Back to laboratory" }
            )
          );
        }

        const flash =
          req.query.collected === "1"
            ? { type: "success", message: "Specimen collected." }
            : req.query.received === "1"
              ? { type: "success", message: "Specimen received." }
              : req.query.rejected === "1"
                ? { type: "success", message: "Specimen rejected." }
                : null;

        return renderShell(req, res, {
          activeNav: "diagnostics",
          content: "app/diagnostics-laboratory-request-detail-content.ejs",
          pageHeader: {
            title: `Request ${loaded.request.requestNumber}`,
            description: `Patient: ${loaded.request.patientDisplayName}`,
            actions: loaded.request.actions.canCollect
              ? [{ href: `/app/diagnostics/laboratory/request/${requestId}/collect`, label: "Collect specimen" }]
              : [],
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Diagnostics" },
            { label: "Laboratory", href: "/app/diagnostics/laboratory" },
            { label: "Request" },
          ],
          flash,
          pageData: { request: loaded.request },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // Specimen collection (GET form)
  app.get(
    "/app/diagnostics/laboratory/request/:requestId/collect",
    requireAuth,
    requirePermission(PERM.COLLECT),
    async (req, res, next) => {
      try {
        const requestId = String(req.params.requestId || "");
        if (!UUID_RE.test(requestId)) {
          return res.status(404).type("html").send(renderSimpleState("Not found", "Invalid request ID", { status: 404 }));
        }

        const loaded = await loadActiveClinicSpecimenCollectionScreen(getPool(), {
          auth: req.activeClinicAuth,
          requestId,
        });

        if (!loaded.ok) {
          return res.status(403).type("html").send(
            renderSimpleState("Specimen collection unavailable", mapDiagnosticsError(loaded.code), { status: 403 })
          );
        }

        return renderShell(req, res, {
          activeNav: "diagnostics",
          content: "app/diagnostics-specimen-collection-content.ejs",
          pageHeader: { title: "Collect specimen" },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Diagnostics" },
            { label: "Laboratory", href: "/app/diagnostics/laboratory" },
            { label: "Request", href: `/app/diagnostics/laboratory/request/${requestId}` },
            { label: "Collect" },
          ],
          pageData: { collection: loaded.collection },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // Specimen collection (POST)
  app.post(
    "/app/diagnostics/laboratory/request/:requestId/collect",
    requireAuth,
    requirePermission(PERM.COLLECT),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const requestId = String(req.params.requestId || "");
        const auth = req.activeClinicAuth;

        const result = await collectSpecimen(getPool(), {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          facilityId: auth.selectedFacility.id,
          laboratoryRequestId: requestId,
          specimenType: String(req.body.specimen_type || "").trim(),
          collectionMethod: String(req.body.collection_method || "").trim() || null,
          collectionSite: String(req.body.collection_site || "").trim() || null,
          actor: actor(auth),
          deploymentCode: getPlatformDeploymentCode(env) || CODE_ACTIVECLINIC_ORG_V6,
        });

        if (!result.ok) {
          return renderShell(req, res, {
            activeNav: "diagnostics",
            content: "app/diagnostics-specimen-collection-content.ejs",
            status: 400,
            pageHeader: { title: "Collect specimen" },
            pageData: {
              collection: {
                request: { id: requestId },
                values: req.body,
                error: mapDiagnosticsError(result.code),
              },
            },
          });
        }

        return res.redirect(303, `/app/diagnostics/laboratory/request/${requestId}?collected=1`);
      } catch (err) {
        return next(err);
      }
    }
  );

  // Specimen receipt (GET form)
  app.get(
    "/app/diagnostics/laboratory/specimen/:specimenId/receive",
    requireAuth,
    requirePermission(PERM.COLLECT),
    async (req, res, next) => {
      try {
        const specimenId = String(req.params.specimenId || "");
        if (!UUID_RE.test(specimenId)) {
          return res.status(404).type("html").send(renderSimpleState("Not found", "Invalid specimen ID", { status: 404 }));
        }

        const loaded = await loadActiveClinicSpecimenReceiptScreen(getPool(), {
          auth: req.activeClinicAuth,
          specimenId,
        });

        if (!loaded.ok) {
          return res.status(403).type("html").send(
            renderSimpleState("Specimen receipt unavailable", mapDiagnosticsError(loaded.code), { status: 403 })
          );
        }

        return renderShell(req, res, {
          activeNav: "diagnostics",
          content: "app/diagnostics-specimen-receipt-content.ejs",
          pageHeader: { title: "Receive specimen" },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Diagnostics" },
            { label: "Laboratory", href: "/app/diagnostics/laboratory" },
            { label: "Receive" },
          ],
          pageData: { receipt: loaded.receipt },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // Specimen receipt (POST)
  app.post(
    "/app/diagnostics/laboratory/specimen/:specimenId/receive",
    requireAuth,
    requirePermission(PERM.COLLECT),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const specimenId = String(req.params.specimenId || "");
        const auth = req.activeClinicAuth;

        const result = await receiveSpecimen(getPool(), {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          specimenId,
          eventNote: String(req.body.event_note || "").trim() || null,
          actor: actor(auth),
          deploymentCode: getPlatformDeploymentCode(env) || CODE_ACTIVECLINIC_ORG_V6,
        });

        if (!result.ok) {
          return res.status(400).type("html").send(
            renderSimpleState("Receive failed", mapDiagnosticsError(result.code), { status: 400 })
          );
        }

        return res.redirect(303, `/app/diagnostics/laboratory/worklist?received=1`);
      } catch (err) {
        return next(err);
      }
    }
  );

  // Specimen rejection (GET form)
  app.get(
    "/app/diagnostics/laboratory/specimen/:specimenId/reject",
    requireAuth,
    requirePermission(PERM.COLLECT),
    async (req, res, next) => {
      try {
        const specimenId = String(req.params.specimenId || "");
        if (!UUID_RE.test(specimenId)) {
          return res.status(404).type("html").send(renderSimpleState("Not found", "Invalid specimen ID", { status: 404 }));
        }

        const loaded = await loadActiveClinicSpecimenRejectedScreen(getPool(), {
          auth: req.activeClinicAuth,
          specimenId,
        });

        if (!loaded.ok) {
          return res.status(403).type("html").send(
            renderSimpleState("Specimen rejection unavailable", mapDiagnosticsError(loaded.code), { status: 403 })
          );
        }

        return renderShell(req, res, {
          activeNav: "diagnostics",
          content: "app/diagnostics-specimen-rejected-content.ejs",
          pageHeader: { title: "Reject specimen" },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Diagnostics" },
            { label: "Laboratory", href: "/app/diagnostics/laboratory" },
            { label: "Reject" },
          ],
          pageData: { rejection: loaded.rejection },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // Specimen rejection (POST)
  app.post(
    "/app/diagnostics/laboratory/specimen/:specimenId/reject",
    requireAuth,
    requirePermission(PERM.COLLECT),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const specimenId = String(req.params.specimenId || "");
        const auth = req.activeClinicAuth;

        const result = await rejectSpecimen(getPool(), {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          specimenId,
          rejectionReason: String(req.body.rejection_reason || "").trim(),
          actor: actor(auth),
          deploymentCode: getPlatformDeploymentCode(env) || CODE_ACTIVECLINIC_ORG_V6,
        });

        if (!result.ok) {
          return renderShell(req, res, {
            activeNav: "diagnostics",
            content: "app/diagnostics-specimen-rejected-content.ejs",
            status: 400,
            pageHeader: { title: "Reject specimen" },
            pageData: {
              rejection: {
                specimen: { id: specimenId },
                values: req.body,
                error: mapDiagnosticsError(result.code),
              },
            },
          });
        }

        return res.redirect(303, `/app/diagnostics/laboratory/worklist?rejected=1`);
      } catch (err) {
        return next(err);
      }
    }
  );

  // Enter laboratory result (GET form)
  app.get(
    "/app/diagnostics/laboratory/request/:requestId/result",
    requireAuth,
    requirePermission(PERM.RESULT),
    async (req, res, next) => {
      try {
        const requestId = String(req.params.requestId || "");
        if (!UUID_RE.test(requestId)) {
          return res.status(404).type("html").send(renderSimpleState("Not found", "Invalid request ID", { status: 404 }));
        }

        const loaded = await loadActiveClinicEnterLaboratoryResultScreen(getPool(), {
          auth: req.activeClinicAuth,
          requestId,
        });

        if (!loaded.ok) {
          return res.status(403).type("html").send(
            renderSimpleState("Result entry unavailable", mapDiagnosticsError(loaded.code), { status: 403 })
          );
        }

        return renderShell(req, res, {
          activeNav: "diagnostics",
          content: "app/diagnostics-enter-laboratory-result-content.ejs",
          pageHeader: { title: "Enter laboratory result" },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Diagnostics" },
            { label: "Laboratory", href: "/app/diagnostics/laboratory" },
            { label: "Enter result" },
          ],
          pageData: { resultEntry: loaded.resultEntry },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // Enter laboratory result (POST)
  app.post(
    "/app/diagnostics/laboratory/request/:requestId/result",
    requireAuth,
    requirePermission(PERM.RESULT),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const requestId = String(req.params.requestId || "");
        const auth = req.activeClinicAuth;

        const components = req.body.components ? JSON.parse(req.body.components) : [];

        const result = await enterLaboratoryResult(getPool(), {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          facilityId: auth.selectedFacility.id,
          laboratoryRequestId: requestId,
          resultSummary: String(req.body.result_summary || "").trim() || null,
          isCritical: req.body.is_critical === "1" || req.body.is_critical === "true",
          components,
          actor: actor(auth),
          deploymentCode: getPlatformDeploymentCode(env) || CODE_ACTIVECLINIC_ORG_V6,
        });

        if (!result.ok) {
          return renderShell(req, res, {
            activeNav: "diagnostics",
            content: "app/diagnostics-enter-laboratory-result-content.ejs",
            status: 400,
            pageHeader: { title: "Enter laboratory result" },
            pageData: {
              resultEntry: {
                request: { id: requestId },
                values: req.body,
                error: mapDiagnosticsError(result.code),
              },
            },
          });
        }

        if (result.result.isCritical) {
          return res.redirect(303, `/app/diagnostics/critical-alert/${result.result.id}?result_entered=1`);
        }

        return res.redirect(303, `/app/diagnostics/laboratory/request/${requestId}?result_entered=1`);
      } catch (err) {
        return next(err);
      }
    }
  );

  // Radiology dashboard
  app.get(
    "/app/diagnostics/radiology",
    requireAuth,
    requirePermission(PERM.VIEW),
    async (req, res, next) => {
      try {
        const loaded = await loadActiveClinicRadiologyDashboardScreen(getPool(), {
          auth: req.activeClinicAuth,
        });
        if (!loaded.ok) {
          return res.status(403).type("html").send(
            renderSimpleState(
              "Radiology dashboard unavailable",
              mapDiagnosticsError(loaded.code),
              { status: 403, linkHref: "/app", linkLabel: "Back to dashboard" }
            )
          );
        }
        return renderShell(req, res, {
          activeNav: "diagnostics",
          content: "app/diagnostics-radiology-dashboard-content.ejs",
          pageHeader: {
            title: "Radiology dashboard",
            description: `${loaded.dashboard.facilityDisplayName}`,
            actions: [
              { href: "/app/diagnostics/radiology/queue", label: "View queue" },
            ],
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Diagnostics" },
            { label: "Radiology" },
          ],
          pageData: { dashboard: loaded.dashboard },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // Radiology request queue
  app.get(
    "/app/diagnostics/radiology/queue",
    requireAuth,
    requirePermission(PERM.VIEW),
    async (req, res, next) => {
      try {
        const loaded = await loadActiveClinicRadiologyQueueScreen(getPool(), {
          auth: req.activeClinicAuth,
        });
        if (!loaded.ok) {
          return res.status(403).type("html").send(
            renderSimpleState(
              "Radiology queue unavailable",
              mapDiagnosticsError(loaded.code),
              { status: 403, linkHref: "/app", linkLabel: "Back to dashboard" }
            )
          );
        }
        return renderShell(req, res, {
          activeNav: "diagnostics",
          content: "app/diagnostics-radiology-queue-content.ejs",
          pageHeader: {
            title: "Radiology request queue",
            description: `Pending studies at ${loaded.queue.facilityDisplayName}`,
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Diagnostics" },
            { label: "Radiology", href: "/app/diagnostics/radiology" },
            { label: "Queue" },
          ],
          pageData: { queue: loaded.queue },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // Enter radiology report (GET form)
  app.get(
    "/app/diagnostics/radiology/request/:requestId/report",
    requireAuth,
    requirePermission(PERM.RESULT),
    async (req, res, next) => {
      try {
        const requestId = String(req.params.requestId || "");
        if (!UUID_RE.test(requestId)) {
          return res.status(404).type("html").send(renderSimpleState("Not found", "Invalid request ID", { status: 404 }));
        }

        const loaded = await loadActiveClinicEnterRadiologyReportScreen(getPool(), {
          auth: req.activeClinicAuth,
          requestId,
        });

        if (!loaded.ok) {
          return res.status(403).type("html").send(
            renderSimpleState("Report entry unavailable", mapDiagnosticsError(loaded.code), { status: 403 })
          );
        }

        return renderShell(req, res, {
          activeNav: "diagnostics",
          content: "app/diagnostics-enter-radiology-report-content.ejs",
          pageHeader: { title: "Enter radiology report" },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Diagnostics" },
            { label: "Radiology", href: "/app/diagnostics/radiology" },
            { label: "Enter report" },
          ],
          pageData: { reportEntry: loaded.reportEntry },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // Enter radiology report (POST)
  app.post(
    "/app/diagnostics/radiology/request/:requestId/report",
    requireAuth,
    requirePermission(PERM.RESULT),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const requestId = String(req.params.requestId || "");
        const auth = req.activeClinicAuth;

        const result = await enterRadiologyReport(getPool(), {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          facilityId: auth.selectedFacility.id,
          radiologyRequestId: requestId,
          findings: String(req.body.findings || "").trim() || null,
          impression: String(req.body.impression || "").trim() || null,
          technique: String(req.body.technique || "").trim() || null,
          isCritical: req.body.is_critical === "1" || req.body.is_critical === "true",
          actor: actor(auth),
          deploymentCode: getPlatformDeploymentCode(env) || CODE_ACTIVECLINIC_ORG_V6,
        });

        if (!result.ok) {
          return renderShell(req, res, {
            activeNav: "diagnostics",
            content: "app/diagnostics-enter-radiology-report-content.ejs",
            status: 400,
            pageHeader: { title: "Enter radiology report" },
            pageData: {
              reportEntry: {
                request: { id: requestId },
                values: req.body,
                error: mapDiagnosticsError(result.code),
              },
            },
          });
        }

        if (result.report.isCritical) {
          return res.redirect(303, `/app/diagnostics/critical-alert/${result.report.id}?report_entered=1`);
        }

        return res.redirect(303, `/app/diagnostics/radiology/queue?report_entered=1`);
      } catch (err) {
        return next(err);
      }
    }
  );

  // Critical result alert
  app.get(
    "/app/diagnostics/critical-alert/:resultId",
    requireAuth,
    requirePermission(PERM.VIEW),
    async (req, res, next) => {
      try {
        const resultId = String(req.params.resultId || "");
        if (!UUID_RE.test(resultId)) {
          return res.status(404).type("html").send(renderSimpleState("Not found", "Invalid result ID", { status: 404 }));
        }

        const loaded = await loadActiveClinicCriticalResultAlertScreen(getPool(), {
          auth: req.activeClinicAuth,
          resultId,
        });

        if (!loaded.ok) {
          return res.status(403).type("html").send(
            renderSimpleState("Critical alert unavailable", mapDiagnosticsError(loaded.code), { status: 403 })
          );
        }

        return renderShell(req, res, {
          activeNav: "diagnostics",
          content: "app/diagnostics-critical-result-alert-content.ejs",
          pageHeader: { title: "Critical result alert" },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Diagnostics" },
            { label: "Critical alert" },
          ],
          pageData: { alert: loaded.alert },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  // Acknowledge critical result (POST)
  app.post(
    "/app/diagnostics/critical-alert/:resultId/acknowledge",
    requireAuth,
    requirePermission(PERM.VIEW),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const resultId = String(req.params.resultId || "");
        const auth = req.activeClinicAuth;

        const result = await acknowledgeCriticalResult(getPool(), {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          resultId,
          recipientName: String(req.body.recipient_name || "").trim(),
          notificationMethod: String(req.body.notification_method || "").trim(),
          actor: actor(auth),
          deploymentCode: getPlatformDeploymentCode(env) || CODE_ACTIVECLINIC_ORG_V6,
        });

        if (!result.ok) {
          return res.status(400).type("html").send(
            renderSimpleState("Acknowledgment failed", mapDiagnosticsError(result.code), { status: 400 })
          );
        }

        return res.redirect(303, "/app/diagnostics/laboratory?critical_acknowledged=1");
      } catch (err) {
        return next(err);
      }
    }
  );
}

module.exports = {
  registerActiveClinicDiagnosticsRoutes,
};
