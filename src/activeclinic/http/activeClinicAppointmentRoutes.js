"use strict";

/**
 * ActiveClinic appointment list / calendar / book / detail routes (AC-V6-C04).
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
  parseAppointmentFormBody,
  buildStartsEnds,
  emptyFormValues,
  actorFromAuth,
  loadActiveClinicAppointmentListScreen,
  loadActiveClinicAppointmentCalendarScreen,
  loadActiveClinicAppointmentFormScreen,
  loadActiveClinicAppointmentDetailScreen,
  listAvailableAppointmentSlots,
} = require("../services/loadActiveClinicAppointmentScreens");
const {
  createAppointment,
  updateAppointment,
  rescheduleAppointment,
  cancelAppointment,
  checkInAppointment,
  markNoShowAppointment,
  RESULT: APPT_RESULT,
  PERM,
} = require("../services/activeClinicAppointmentService");
const {
  getPatientByOrgAndNumber,
  getPatientByOrgAndId,
} = require("../services/activeClinicPatientService");
const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");
const { getPlatformDeploymentCode } = require("../../platform/config/platformDeploymentCode");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapApptError(code) {
  switch (code) {
    case APPT_RESULT.ACCESS_DENIED:
      return "You do not have permission for this appointment action.";
    case APPT_RESULT.COLLISION:
      return "That time conflicts with another appointment for the assigned staff.";
    case APPT_RESULT.STAFF_REQUIRED:
      return "This service requires an assigned staff member.";
    case APPT_RESULT.PATIENT_NOT_FOUND:
      return "Patient was not found in this organization.";
    case APPT_RESULT.SERVICE_NOT_FOUND:
      return "Service type was not found.";
    case APPT_RESULT.INVALID_TRANSITION:
      return "That status change is not allowed for this appointment.";
    case APPT_RESULT.STALE_VERSION:
      return "This appointment was updated by someone else. Refresh and try again.";
    case APPT_RESULT.INVALID_INPUT:
      return "Check the appointment details and try again.";
    default:
      return "Unable to complete the appointment request.";
  }
}

function registerActiveClinicAppointmentRoutes(app, deps) {
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
      assetVersion: "c04-1",
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

  async function resolvePatientId(db, auth, values) {
    if (values.patientId && UUID_RE.test(values.patientId)) {
      const byId = await getPatientByOrgAndId(db, {
        organizationId: auth.organization.id,
        healthcareOrganizationId: auth.healthcareOrganization.id,
        patientId: values.patientId,
      });
      if (byId.ok) return { ok: true, patientId: byId.patient.id };
    }
    if (values.patientNumber) {
      const byNumber = await getPatientByOrgAndNumber(db, {
        organizationId: auth.organization.id,
        healthcareOrganizationId: auth.healthcareOrganization.id,
        patientNumber: values.patientNumber,
      });
      if (byNumber.ok) return { ok: true, patientId: byNumber.patient.id };
    }
    return { ok: false, code: APPT_RESULT.PATIENT_NOT_FOUND };
  }

  app.get(
    "/app/appointments",
    requireAuth,
    requirePermission(PERM.VIEW),
    async (req, res, next) => {
      try {
        const loaded = await loadActiveClinicAppointmentListScreen(getPool(), {
          auth: req.activeClinicAuth,
          query: req.query,
        });
        if (!loaded.ok) {
          return res.status(403).type("html").send(
            renderSimpleState(
              "Appointments unavailable",
              mapApptError(loaded.code),
              { status: 403, linkHref: "/app/appointments", linkLabel: "Back to appointments" }
            )
          )
        }
        return renderShell(req, res, {
          activeNav: "appointments",
          content: "app/appointments-list-content.ejs",
          pageHeader: {
            title: "Appointments",
            description: "Scheduled visits for your authorized facilities.",
            actions: loaded.list.actions.canCreate
              ? [{ href: "/app/appointments/new", label: "Book appointment" }]
              : [],
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Appointments" },
          ],
          pageData: { list: loaded.list },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/appointments/calendar",
    requireAuth,
    requirePermission(PERM.VIEW),
    async (req, res, next) => {
      try {
        const loaded = await loadActiveClinicAppointmentCalendarScreen(getPool(), {
          auth: req.activeClinicAuth,
          query: req.query,
        });
        if (!loaded.ok) {
          return res.status(403).type("html").send(
            renderSimpleState(
              "Calendar unavailable",
              mapApptError(loaded.code),
              { status: 403, linkHref: "/app/appointments", linkLabel: "Back to appointments" }
            )
          )
        }
        return renderShell(req, res, {
          activeNav: "appointments",
          content: "app/appointments-calendar-content.ejs",
          pageHeader: {
            title: "Appointment calendar",
            description: "Real appointments by day. Use the list view on small screens.",
            actions: [
              { href: "/app/appointments", label: "List view" },
              ...(loaded.calendar.actions.canCreate
                ? [{ href: "/app/appointments/new", label: "Book appointment" }]
                : []),
            ],
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Appointments", href: "/app/appointments" },
            { label: "Calendar" },
          ],
          pageData: { calendar: loaded.calendar },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/appointments/new",
    requireAuth,
    requirePermission(PERM.CREATE),
    async (req, res, next) => {
      try {
        const values = emptyFormValues(req.activeClinicAuth);
        if (req.query.patient_number) {
          values.patientNumber = String(req.query.patient_number);
        }
        if (req.query.patient_id) values.patientId = String(req.query.patient_id);
        const loaded = await loadActiveClinicAppointmentFormScreen(getPool(), {
          auth: req.activeClinicAuth,
          values,
          mode: "create",
        });
        return renderShell(req, res, {
          activeNav: "appointments",
          content: "app/appointment-form-content.ejs",
          pageHeader: {
            title: "Book appointment",
            description: "Administrative scheduling only — no clinical encounter is created.",
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Appointments", href: "/app/appointments" },
            { label: "New" },
          ],
          pageData: { form: loaded.form },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/appointments",
    requireAuth,
    requirePermission(PERM.CREATE),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const values = parseAppointmentFormBody(req.body);
        const { startsAt, endsAt } = buildStartsEnds(values);
        const auth = req.activeClinicAuth;
        const pool = getPool();

        if (!values.confirm) {
          const patient = await resolvePatientId(pool, auth, values);
          let slotCheck = null;
          if (values.assignedStaffId && !Number.isNaN(startsAt.getTime())) {
            slotCheck = await listAvailableAppointmentSlots(pool, {
              organizationId: auth.organization.id,
              healthcareOrganizationId: auth.healthcareOrganization.id,
              facilityId: values.facilityId,
              assignedStaffId: values.assignedStaffId,
              startsAt,
              endsAt,
              actor: actor(auth),
            });
          }
          const loaded = await loadActiveClinicAppointmentFormScreen(pool, {
            auth,
            values,
            mode: "create",
            review: true,
            error: patient.ok ? null : mapApptError(patient.code),
            slotCheck,
          });
          return renderShell(req, res, {
            activeNav: "appointments",
            content: "app/appointment-form-content.ejs",
            pageHeader: { title: "Review appointment" },
            breadcrumbs: [
              { label: "Appointments", href: "/app/appointments" },
              { label: "Review" },
            ],
            pageData: { form: loaded.form },
          });
        }

        const patient = await resolvePatientId(pool, auth, values);
        if (!patient.ok) {
          const loaded = await loadActiveClinicAppointmentFormScreen(pool, {
            auth,
            values,
            mode: "create",
            error: mapApptError(patient.code),
          });
          return renderShell(req, res, {
            activeNav: "appointments",
            content: "app/appointment-form-content.ejs",
            status: 400,
            pageHeader: { title: "Book appointment" },
            pageData: { form: loaded.form },
          });
        }

        // Server-side slot revalidation before create
        if (values.assignedStaffId) {
          const slots = await listAvailableAppointmentSlots(pool, {
            organizationId: auth.organization.id,
            healthcareOrganizationId: auth.healthcareOrganization.id,
            facilityId: values.facilityId,
            assignedStaffId: values.assignedStaffId,
            startsAt,
            endsAt,
            actor: actor(auth),
          });
          if (slots.ok && !(slots.slots || []).length) {
            const loaded = await loadActiveClinicAppointmentFormScreen(pool, {
              auth,
              values,
              mode: "create",
              review: true,
              error: mapApptError(APPT_RESULT.COLLISION),
              slotCheck: slots,
            });
            return renderShell(req, res, {
              activeNav: "appointments",
              content: "app/appointment-form-content.ejs",
              status: 409,
              pageHeader: { title: "Review appointment" },
              pageData: { form: loaded.form },
            });
          }
        }

        const created = await createAppointment(pool, {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          facilityId: values.facilityId,
          patientId: patient.patientId,
          serviceTypeId: values.serviceTypeId,
          assignedStaffId: values.assignedStaffId || null,
          startsAt,
          endsAt,
          timezone: values.timezone,
          schedulingNote: values.schedulingNote || null,
          reminderChannel: values.reminderChannel,
          actor: actor(auth),
          deploymentCode: getPlatformDeploymentCode(env) || CODE_ACTIVECLINIC_ORG_V6,
        });
        if (!created.ok) {
          const loaded = await loadActiveClinicAppointmentFormScreen(pool, {
            auth,
            values,
            mode: "create",
            review: true,
            error: mapApptError(created.code),
          });
          return renderShell(req, res, {
            activeNav: "appointments",
            content: "app/appointment-form-content.ejs",
            status: 400,
            pageHeader: { title: "Review appointment" },
            pageData: { form: loaded.form },
          });
        }
        return res.redirect(303, `/app/appointments/${created.appointment.id}?booked=1`);
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/appointments/:appointmentId",
    requireAuth,
    requirePermission(PERM.VIEW),
    async (req, res, next) => {
      try {
        const appointmentId = String(req.params.appointmentId || "");
        if (!UUID_RE.test(appointmentId)) {
          return res.status(404).type("html").send(
            renderSimpleState(
              "Appointment not found",
              "That appointment link is not valid.",
              { status: 404, linkHref: "/app/appointments", linkLabel: "Back to appointments" }
            )
          )
        }
        const loaded = await loadActiveClinicAppointmentDetailScreen(getPool(), {
          auth: req.activeClinicAuth,
          appointmentId,
        });
        if (!loaded.ok) {
          return res.status(loaded.code === APPT_RESULT.ACCESS_DENIED ? 403 : 404).type("html").send(
            renderSimpleState(
              "Appointment unavailable",
              mapApptError(loaded.code),
              { status: loaded.code === APPT_RESULT.ACCESS_DENIED ? 403 : 404, linkHref: "/app/appointments", linkLabel: "Back to appointments" }
            )
          )
        }
        const flash =
          req.query.booked === "1"
            ? { type: "success", message: "Appointment booked." }
            : req.query.updated === "1"
              ? { type: "success", message: "Appointment updated." }
              : null;
        return renderShell(req, res, {
          activeNav: "appointments",
          content: "app/appointment-detail-content.ejs",
          pageHeader: {
            title: "Appointment",
            description: loaded.detail.appointment.statusLabel,
          },
          breadcrumbs: [
            { label: "Home", href: "/app" },
            { label: "Appointments", href: "/app/appointments" },
            { label: "Detail" },
          ],
          flash,
          pageData: { detail: loaded.detail },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.get(
    "/app/appointments/:appointmentId/edit",
    requireAuth,
    requirePermission(PERM.UPDATE),
    async (req, res, next) => {
      try {
        const appointmentId = String(req.params.appointmentId || "");
        const detail = await loadActiveClinicAppointmentDetailScreen(getPool(), {
          auth: req.activeClinicAuth,
          appointmentId,
        });
        if (!detail.ok) {
          return res.status(404).type("html").send(
            renderSimpleState(
              "Appointment unavailable",
              mapApptError(detail.code),
              { status: 404, linkHref: "/app/appointments", linkLabel: "Back to appointments" }
            )
          )
        }
        const a = detail.detail.appointment;
        const values = {
          ...emptyFormValues(req.activeClinicAuth),
          patientId: a.patientId,
          patientNumber: (a.patient && a.patient.patientNumber) || "",
          facilityId: a.facilityId,
          serviceTypeId: a.serviceTypeId,
          assignedStaffId: a.assignedStaffId || "",
          startsDate: a.when.dateLabel,
          startsTime: new Date(a.startsAt).toISOString().slice(11, 16),
          endsTime: new Date(a.endsAt).toISOString().slice(11, 16),
          timezone: a.timezone,
          schedulingNote: a.schedulingNote || "",
          reminderChannel: "none",
        };
        const loaded = await loadActiveClinicAppointmentFormScreen(getPool(), {
          auth: req.activeClinicAuth,
          values,
          mode: "edit",
          appointment: a,
        });
        return renderShell(req, res, {
          activeNav: "appointments",
          content: "app/appointment-form-content.ejs",
          pageHeader: {
            title: "Reschedule appointment",
            description: "Creates a replacement booking and marks the prior appointment rescheduled.",
          },
          pageData: { form: loaded.form },
        });
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/appointments/:appointmentId",
    requireAuth,
    requirePermission(PERM.UPDATE),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const appointmentId = String(req.params.appointmentId || "");
        const values = parseAppointmentFormBody(req.body);
        const { startsAt, endsAt } = buildStartsEnds(values);
        const auth = req.activeClinicAuth;
        const updated = await updateAppointment(getPool(), {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          appointmentId,
          startsAt,
          endsAt,
          timezone: values.timezone,
          assignedStaffId: values.assignedStaffId || null,
          schedulingNote: values.schedulingNote || null,
          actor: actor(auth),
          deploymentCode: getPlatformDeploymentCode(env) || CODE_ACTIVECLINIC_ORG_V6,
        });
        if (!updated.ok) {
          return res.status(400).type("html").send(
            renderSimpleState(
              "Update failed",
              mapApptError(updated.code),
              { status: 400, linkHref: "/app/appointments", linkLabel: "Back to appointments" }
            )
          )
        }
        return res.redirect(303, `/app/appointments/${appointmentId}?updated=1`);
      } catch (err) {
        return next(err);
      }
    }
  );

  app.post(
    "/app/appointments/:appointmentId/reschedule",
    requireAuth,
    requirePermission(PERM.UPDATE),
    async (req, res, next) => {
      try {
        if (!validateCsrf(req, req.body[CSRF_FIELD], env)) {
          return res.status(403).type("html").send("CSRF validation failed");
        }
        const appointmentId = String(req.params.appointmentId || "");
        const values = parseAppointmentFormBody(req.body);
        const { startsAt, endsAt } = buildStartsEnds(values);
        const auth = req.activeClinicAuth;
        const result = await rescheduleAppointment(getPool(), {
          organizationId: auth.organization.id,
          healthcareOrganizationId: auth.healthcareOrganization.id,
          appointmentId,
          facilityId: values.facilityId || undefined,
          assignedStaffId: values.assignedStaffId || undefined,
          startsAt,
          endsAt,
          timezone: values.timezone,
          schedulingNote: values.schedulingNote || undefined,
          actor: actor(auth),
          deploymentCode: getPlatformDeploymentCode(env) || CODE_ACTIVECLINIC_ORG_V6,
        });
        if (!result.ok) {
          return res.status(400).type("html").send(
            renderSimpleState(
              "Reschedule failed",
              mapApptError(result.code),
              { status: 400, linkHref: "/app/appointments", linkLabel: "Back to appointments" }
            )
          )
        }
        return res.redirect(303, `/app/appointments/${result.appointment.id}?updated=1`);
      } catch (err) {
        return next(err);
      }
    }
  );

  async function postStatusAction(req, res, next, fn) {
    try {
      if (!validateCsrf(req, req.body[CSRF_FIELD], env)) {
        return res.status(403).type("html").send("CSRF validation failed");
      }
      const appointmentId = String(req.params.appointmentId || "");
      const auth = req.activeClinicAuth;
      const result = await fn(getPool(), {
        organizationId: auth.organization.id,
        healthcareOrganizationId: auth.healthcareOrganization.id,
        appointmentId,
        actor: actor(auth),
        reason: String(req.body.reason || "").trim() || undefined,
        deploymentCode: getPlatformDeploymentCode(env) || CODE_ACTIVECLINIC_ORG_V6,
      });
      if (!result.ok) {
        return res.status(400).type("html").send(
            renderSimpleState(
              "Action failed",
              mapApptError(result.code),
              { status: 400, linkHref: "/app/appointments", linkLabel: "Back to appointments" }
            )
          )
      }
      return res.redirect(303, `/app/appointments/${appointmentId}?updated=1`);
    } catch (err) {
      return next(err);
    }
  }

  app.post(
    "/app/appointments/:appointmentId/cancel",
    requireAuth,
    requirePermission(PERM.CANCEL),
    (req, res, next) => postStatusAction(req, res, next, cancelAppointment)
  );

  app.post(
    "/app/appointments/:appointmentId/check-in",
    requireAuth,
    requirePermission(PERM.CHECK_IN),
    (req, res, next) => postStatusAction(req, res, next, checkInAppointment)
  );

  app.post(
    "/app/appointments/:appointmentId/no-show",
    requireAuth,
    requirePermission(PERM.UPDATE),
    (req, res, next) => postStatusAction(req, res, next, markNoShowAppointment)
  );
}

module.exports = {
  registerActiveClinicAppointmentRoutes,
};
