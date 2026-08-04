"use strict";

/**
 * ActiveClinic reception/queue routes (AC-V6-C05).
 * P03 Stitch screens.
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
  loadActiveClinicReceptionQueueScreen,
  loadActiveClinicReceptionCheckInScreen,
  loadActiveClinicReceptionWalkInScreen,
  loadActiveClinicReceptionQueueDetailScreen,
  loadActiveClinicReceptionCallBoardScreen,
  actorFromAuth,
} = require("../services/loadActiveClinicReceptionScreens");
const {
  checkInScheduledPatient,
  checkInWalkInPatient,
  createQueueEntry,
  callNextQueueEntry,
  startServingQueueEntry,
  completeQueueEntry,
  pauseQueueEntry,
  transferQueueEntry,
  cancelQueueEntry,
  markLeftBeforeService,
  assignQueueEntryRoom,
  appendQueueStatusEvent,
  RESULT: QUEUE_RESULT,
  PERM,
} = require("../services/activeClinicReceptionService");
const {
  getPatientByOrgAndNumber,
} = require("../services/activeClinicPatientService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");
const { getPlatformDeploymentCode } = require("../../platform/config/platformDeploymentCode");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapReceptionError(code) {
  switch (code) {
    case QUEUE_RESULT.ACCESS_DENIED:
      return "You do not have permission for this reception action.";
    case QUEUE_RESULT.FACILITY_NOT_FOUND:
      return "Facility not found.";
    case QUEUE_RESULT.PATIENT_NOT_FOUND:
      return "Patient not found in this organization.";
    case QUEUE_RESULT.APPOINTMENT_NOT_FOUND:
      return "Appointment not found.";
    case QUEUE_RESULT.SERVICE_POINT_NOT_FOUND:
      return "Service point not found.";
    case QUEUE_RESULT.QUEUE_ENTRY_NOT_FOUND:
      return "Queue entry not found.";
    case QUEUE_RESULT.DUPLICATE_ACTIVE_ENTRY:
      return "Patient already has an active queue entry for this service point.";
    case QUEUE_RESULT.INVALID_TRANSITION:
      return "That status change is not allowed.";
    case QUEUE_RESULT.STALE_VERSION:
      return "This queue entry was updated by someone else. Refresh and try again.";
    case QUEUE_RESULT.CAPACITY_EXCEEDED:
      return "Queue is at capacity.";
    case QUEUE_RESULT.INVALID_STATUS:
      return "Invalid status for this action.";
    case QUEUE_RESULT.INVALID_INPUT:
      return "Check the submitted reception details and try again.";
    default:
      return "Unable to complete the reception request.";
  }
}

function registerActiveClinicReceptionRoutes(app, deps) {
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
      assetVersion: "c05-1",
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

  app.get(
    "/app/reception",
    requireAuth,
    requirePermission(PERM.VIEW),
    async (req, res, next) => {
      try {
        const loaded = await loadActiveClinicReceptionQueueScreen(getPool(), {
          auth: req.activeClinicAuth,
          query: req.query,
        });
        if (!loaded.ok) {
          return res.status(403).type("html").send(
            renderSimpleState(
              "Reception queue unavailable",
              mapReceptionError(loaded.code),
              { status: 403, linkHref: "/app", linkLabel: "Back to dashboard" }
            )
          );
        }
        const staleWarning = req.query.stale === "1"
          ? "This queue was updated by someone else. Please refresh."
          : null;
        return renderShell(req, res, {
          activeNav: "reception",
          content: "app/reception-queue-content.ejs",
          pageHeader: {
            title: "Reception queue",
            description: "Active queue for the selected facility.",
            actions: loaded.queue.actions.canCheckIn
              ? [
                  { href: "/app/reception/check-in", label: "Check in scheduled" },
                  { href: "/app/reception/walk-in", label: "Walk-in check-in" },
                ]
              : [],
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Reception" },
          ],
          flash: staleWarning
            ? {
                type: "warning",
                message: staleWarning,
                stitchId: "bf9b846da6174bf995793b09e869cd30",
              }
            : null,
          pageData: { queue: loaded.queue, stale: req.query.stale === "1" },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/reception/call-board",
    requireAuth,
    requirePermission(PERM.VIEW),
    async (req, res, next) => {
      try {
        const loaded = await loadActiveClinicReceptionCallBoardScreen(getPool(), {
          auth: req.activeClinicAuth,
        });
        if (!loaded.ok) {
          return res.status(403).type("html").send(
            renderSimpleState(
              "Call board unavailable",
              mapReceptionError(loaded.code),
              { status: 403, linkHref: "/app/reception", linkLabel: "Back to reception" }
            )
          );
        }
        return renderShell(req, res, {
          activeNav: "reception",
          content: "app/reception-call-board-content.ejs",
          pageHeader: {
            title: "Call board",
            description: "Public display of patients being called or served.",
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Reception", href: "/app/reception" },
            { label: "Call board" },
          ],
          pageData: { callBoard: loaded.callBoard },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/reception/check-in",
    requireAuth,
    requirePermission(PERM.CHECK_IN),
    async (req, res, next) => {
      try {
        const appointmentId = req.query.appointment_id || null;
        const loaded = await loadActiveClinicReceptionCheckInScreen(getPool(), {
          auth: req.activeClinicAuth,
          appointmentId,
        });
        if (!loaded.ok) {
          return res.status(403).type("html").send(
            renderSimpleState(
              "Check-in unavailable",
              mapReceptionError(loaded.code),
              { status: 403, linkHref: "/app/reception", linkLabel: "Back to reception" }
            )
          );
        }
        return renderShell(req, res, {
          activeNav: "reception",
          content: "app/reception-check-in-content.ejs",
          pageHeader: {
            title: "Check in scheduled patient",
            description: "Check in a patient with an appointment.",
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Reception", href: "/app/reception" },
            { label: "Check in" },
          ],
          pageData: { checkIn: loaded.checkIn },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/reception/check-in",
    requireAuth,
    requirePermission(PERM.CHECK_IN),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const appointmentId = String(req.body.appointment_id || "").trim();
        const servicePointId = String(req.body.service_point_id || "").trim();
        const checkInNote = String(req.body.check_in_note || "").trim();
        const auth = req.activeClinicAuth;
        const pool = getPool();

        if (!UUID_RE.test(appointmentId) || !UUID_RE.test(servicePointId)) {
          const loaded = await loadActiveClinicReceptionCheckInScreen(pool, {
            auth,
            appointmentId,
            error: "Invalid appointment or service point.",
          });
          return renderShell(req, res, {
            activeNav: "reception",
            content: "app/reception-check-in-content.ejs",
            status: 400,
            pageHeader: { title: "Check in scheduled patient" },
            pageData: { checkIn: loaded.checkIn },
          });
        }

        const arrival = await checkInScheduledPatient(pool, {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          facilityId: auth.selectedFacility.id,
          appointmentId,
          checkInNote: checkInNote || null,
          actor: actor(auth),
          deploymentCode: getPlatformDeploymentCode(env) || CODE_ACTIVECLINIC_ORG_V6,
        });
        if (!arrival.ok) {
          const loaded = await loadActiveClinicReceptionCheckInScreen(pool, {
            auth,
            appointmentId,
            error: mapReceptionError(arrival.code),
          });
          return renderShell(req, res, {
            activeNav: "reception",
            content: "app/reception-check-in-content.ejs",
            status: 400,
            pageHeader: { title: "Check in scheduled patient" },
            pageData: { checkIn: loaded.checkIn },
          });
        }

        const queue = await createQueueEntry(pool, {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          facilityId: auth.selectedFacility.id,
          servicePointId,
          arrivalId: arrival.arrival.id,
          actor: actor(auth),
          deploymentCode: getPlatformDeploymentCode(env) || CODE_ACTIVECLINIC_ORG_V6,
        });
        if (!queue.ok) {
          return res.status(400).type("html").send(
            renderSimpleState(
              "Queue entry failed",
              mapReceptionError(queue.code),
              { status: 400, linkHref: "/app/reception", linkLabel: "Back to reception" }
            )
          );
        }

        return res.redirect(303, `/app/reception/queue/${queue.queueEntry.id}?checked_in=1`);
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/reception/walk-in",
    requireAuth,
    requirePermission(PERM.CHECK_IN),
    async (req, res, next) => {
      try {
        const loaded = await loadActiveClinicReceptionWalkInScreen(getPool(), {
          auth: req.activeClinicAuth,
        });
        if (!loaded.ok) {
          return res.status(403).type("html").send(
            renderSimpleState(
              "Walk-in check-in unavailable",
              mapReceptionError(loaded.code),
              { status: 403, linkHref: "/app/reception", linkLabel: "Back to reception" }
            )
          );
        }
        return renderShell(req, res, {
          activeNav: "reception",
          content: "app/reception-walk-in-content.ejs",
          pageHeader: {
            title: "Walk-in check-in",
            description: "Register a walk-in patient arrival and add to queue.",
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Reception", href: "/app/reception" },
            { label: "Walk-in" },
          ],
          pageData: { walkIn: loaded.walkIn },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/reception/walk-in",
    requireAuth,
    requirePermission(PERM.CHECK_IN),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const patientNumber = String(req.body.patient_number || "").trim();
        const servicePointId = String(req.body.service_point_id || "").trim();
        const checkInNote = String(req.body.check_in_note || "").trim();
        const auth = req.activeClinicAuth;
        const pool = getPool();

        if (!patientNumber || !UUID_RE.test(servicePointId)) {
          const loaded = await loadActiveClinicReceptionWalkInScreen(pool, {
            auth,
            values: { patientNumber, servicePointId, checkInNote },
            error: "Patient number and service point are required.",
          });
          return renderShell(req, res, {
            activeNav: "reception",
            content: "app/reception-walk-in-content.ejs",
            status: 400,
            pageHeader: { title: "Walk-in check-in" },
            pageData: { walkIn: loaded.walkIn },
          });
        }

        const patient = await getPatientByOrgAndNumber(pool, {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          patientNumber,
        });
        if (!patient.ok) {
          const loaded = await loadActiveClinicReceptionWalkInScreen(pool, {
            auth,
            values: { patientNumber, servicePointId, checkInNote },
            error: "Patient not found.",
          });
          return renderShell(req, res, {
            activeNav: "reception",
            content: "app/reception-walk-in-content.ejs",
            status: 400,
            pageHeader: { title: "Walk-in check-in" },
            pageData: { walkIn: loaded.walkIn },
          });
        }

        const arrival = await checkInWalkInPatient(pool, {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          facilityId: auth.selectedFacility.id,
          patientId: patient.patient.id,
          checkInNote: checkInNote || null,
          actor: actor(auth),
          deploymentCode: getPlatformDeploymentCode(env) || CODE_ACTIVECLINIC_ORG_V6,
        });
        if (!arrival.ok) {
          const loaded = await loadActiveClinicReceptionWalkInScreen(pool, {
            auth,
            values: { patientNumber, servicePointId, checkInNote },
            error: mapReceptionError(arrival.code),
          });
          return renderShell(req, res, {
            activeNav: "reception",
            content: "app/reception-walk-in-content.ejs",
            status: 400,
            pageHeader: { title: "Walk-in check-in" },
            pageData: { walkIn: loaded.walkIn },
          });
        }

        const queue = await createQueueEntry(pool, {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          facilityId: auth.selectedFacility.id,
          servicePointId,
          arrivalId: arrival.arrival.id,
          actor: actor(auth),
          deploymentCode: getPlatformDeploymentCode(env) || CODE_ACTIVECLINIC_ORG_V6,
        });
        if (!queue.ok) {
          return res.status(400).type("html").send(
            renderSimpleState(
              "Queue entry failed",
              mapReceptionError(queue.code),
              { status: 400, linkHref: "/app/reception", linkLabel: "Back to reception" }
            )
          );
        }

        return res.redirect(303, `/app/reception/queue/${queue.queueEntry.id}?checked_in=1`);
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/reception/queue/:entryId",
    requireAuth,
    requirePermission(PERM.VIEW),
    async (req, res, next) => {
      try {
        const entryId = String(req.params.entryId || "");
        if (!UUID_RE.test(entryId)) {
          return res.status(404).type("html").send(
            renderSimpleState(
              "Queue entry not found",
              "That queue entry link is not valid.",
              { status: 404, linkHref: "/app/reception", linkLabel: "Back to reception" }
            )
          );
        }
        const loaded = await loadActiveClinicReceptionQueueDetailScreen(getPool(), {
          auth: req.activeClinicAuth,
          queueEntryId: entryId,
        });
        if (!loaded.ok) {
          return res.status(loaded.code === QUEUE_RESULT.ACCESS_DENIED ? 403 : 404).type("html").send(
            renderSimpleState(
              "Queue entry unavailable",
              mapReceptionError(loaded.code),
              { status: loaded.code === QUEUE_RESULT.ACCESS_DENIED ? 403 : 404, linkHref: "/app/reception", linkLabel: "Back to reception" }
            )
          );
        }
        const flash =
          req.query.checked_in === "1"
            ? { type: "success", message: "Patient checked in and added to queue." }
            : req.query.updated === "1"
              ? { type: "success", message: "Queue entry updated." }
              : null;
        return renderShell(req, res, {
          activeNav: "reception",
          content: "app/reception-queue-detail-content.ejs",
          pageHeader: {
            title: "Queue entry",
            description: loaded.detail.queueEntry.statusLabel,
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Reception", href: "/app/reception" },
            { label: "Queue entry" },
          ],
          flash,
          pageData: { detail: loaded.detail },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  async function postQueueAction(req, res, next, fn) {
    try {
      if (!validateCsrf(req, req.body[CSRF_FIELD], env)) {
        return res.status(403).type("html").send("CSRF validation failed");
      }
      const entryId = String(req.params.entryId || "");
      const auth = req.activeClinicAuth;
      const result = await fn(getPool(), {
        organizationId: auth.organization.id,
        healthcareOrganizationId: auth.healthcareOrganization.id,
        queueEntryId: entryId,
        actor: actor(auth),
        reason: String(req.body.reason || "").trim() || undefined,
        assignedRoom: String(req.body.assigned_room || "").trim() || undefined,
        deploymentCode: getPlatformDeploymentCode(env) || CODE_ACTIVECLINIC_ORG_V6,
      });
      if (!result.ok) {
        if (result.code === QUEUE_RESULT.STALE_VERSION) {
          return res.redirect(303, `/app/reception?stale=1`);
        }
        return res.status(400).type("html").send(
          renderSimpleState(
            "Action failed",
            mapReceptionError(result.code),
            { status: 400, linkHref: "/app/reception", linkLabel: "Back to reception" }
          )
        );
      }
      return res.redirect(303, `/app/reception/queue/${entryId}?updated=1`);
    } catch (err) {
      return next(err);
    }
  }

  app.post(
    "/app/reception/queue/:entryId/call",
    requireAuth,
    requirePermission(PERM.CALL_NEXT),
    (req, res, next) => postQueueAction(req, res, next, callNextQueueEntry)
  );

  app.post(
    "/app/reception/queue/:entryId/start-serving",
    requireAuth,
    requirePermission(PERM.MANAGE_QUEUE),
    (req, res, next) => postQueueAction(req, res, next, startServingQueueEntry)
  );

  app.post(
    "/app/reception/queue/:entryId/complete",
    requireAuth,
    requirePermission(PERM.MANAGE_QUEUE),
    (req, res, next) => postQueueAction(req, res, next, completeQueueEntry)
  );

  app.post(
    "/app/reception/queue/:entryId/pause",
    requireAuth,
    requirePermission(PERM.MANAGE_QUEUE),
    (req, res, next) => postQueueAction(req, res, next, pauseQueueEntry)
  );

  app.post(
    "/app/reception/queue/:entryId/requeue",
    requireAuth,
    requirePermission(PERM.MANAGE_QUEUE),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const entryId = String(req.params.entryId || "");
        const auth = req.activeClinicAuth;
        const result = await appendQueueStatusEvent(getPool(), {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          queueEntryId: entryId,
          toStatus: "waiting",
          reason: String(req.body.reason || "").trim() || "requeued",
          actor: actor(auth),
          deploymentCode: getPlatformDeploymentCode(env) || CODE_ACTIVECLINIC_ORG_V6,
        });
        if (!result.ok) {
          if (result.code === QUEUE_RESULT.STALE_VERSION) {
            return res.redirect(303, `/app/reception?stale=1`);
          }
          return res.status(400).type("html").send(
            renderSimpleState(
              "Requeue failed",
              mapReceptionError(result.code),
              { status: 400, linkHref: "/app/reception", linkLabel: "Back to reception" }
            )
          );
        }
        return res.redirect(303, `/app/reception/queue/${entryId}?updated=1`);
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/reception/queue/:entryId/cancel",
    requireAuth,
    requirePermission(PERM.CANCEL),
    (req, res, next) => postQueueAction(req, res, next, cancelQueueEntry)
  );

  app.post(
    "/app/reception/queue/:entryId/left",
    requireAuth,
    requirePermission(PERM.CANCEL),
    (req, res, next) => postQueueAction(req, res, next, markLeftBeforeService)
  );

  app.post(
    "/app/reception/queue/:entryId/transfer",
    requireAuth,
    requirePermission(PERM.TRANSFER),
    (req, res, next) => postQueueAction(req, res, next, transferQueueEntry)
  );

  app.post(
    "/app/reception/queue/:entryId/assign",
    requireAuth,
    requirePermission(PERM.MANAGE_QUEUE),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const entryId = String(req.params.entryId || "");
        const auth = req.activeClinicAuth;
        const result = await assignQueueEntryRoom(getPool(), {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          queueEntryId: entryId,
          assignedRoom: String(req.body.assigned_room || "").trim() || null,
          actor: actor(auth),
          deploymentCode: getPlatformDeploymentCode(env) || CODE_ACTIVECLINIC_ORG_V6,
        });
        if (!result.ok) {
          if (result.code === QUEUE_RESULT.STALE_VERSION) {
            return res.redirect(303, `/app/reception?stale=1`);
          }
          return res.status(400).type("html").send(
            renderSimpleState(
              "Assignment failed",
              mapReceptionError(result.code),
              { status: 400, linkHref: `/app/reception/queue/${entryId}`, linkLabel: "Back to queue entry" }
            )
          );
        }
        return res.redirect(303, `/app/reception/queue/${entryId}?updated=1`);
      } catch (err) {
        return next(err);
      }
    }
  );
}

module.exports = {
  registerActiveClinicReceptionRoutes,
};
