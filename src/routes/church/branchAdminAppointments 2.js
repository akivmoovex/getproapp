"use strict";

const { getPgPool } = require("../../db/pg");
const membersRepo = require("../../db/pg/church/membersRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const { requireChurchSessionCsrf } = require("../../church/churchSessionCsrf");
const {
  loadPlanForReq,
  requirePackageFeature,
} = require("../../services/church/churchPackageFeatureGateService");
const growthAppointmentsService = require("../../services/church/growthAppointmentsService");
const {
  validateSettingsBody,
  validateAvailabilityBody,
  validateLeaveBody,
  validateBookingBody,
  validateConfidentialNoteBody,
} = require("../../church/growthAppointmentsValidation");
const { branchAdminLocals, recordBranchAudit } = require("./branchAdminShared");

function appointmentCtx(req) {
  return {
    organization_id: req.churchContext.organization.id,
    branch_id: req.churchContext.branch.id,
    admin_id: req.churchBranchAdmin.id,
    can_access_pastoral: Boolean(req.churchBranchAdmin.can_access_pastoral),
    can_supervise_pastoral: Boolean(req.churchBranchAdmin.can_supervise_pastoral),
  };
}

module.exports = function registerBranchAdminAppointmentsRoutes(router) {
  const guard = requirePackageFeature("appointments_calendar", { allowGetUpgradeShell: true });

  router.get(
    "/branch/appointments",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    async (req, res, next) => {
      try {
        if (req.packageFeatureUi && req.packageFeatureUi.state !== "available") {
          const { renderBranchFeatureGate } = require("./packageFeatureGates");
          return renderBranchFeatureGate(req, res, "appointments_calendar");
        }
        const pool = getPgPool();
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        const dashboard = await growthAppointmentsService.loadDashboard(pool, appointmentCtx(req), plan);
        const ministers = await pool.query(
          `SELECT id, full_name FROM public.church_branch_admins
           WHERE branch_id = $1 AND status = 'active' ORDER BY full_name ASC`,
          [req.churchContext.branch.id]
        );
        const members = await membersRepo.listMembersForBranch(pool, req.churchContext.branch.id, {
          status: "verified",
          limit: 200,
        });
        return res.render(
          "church/branch-admin/appointments",
          branchAdminLocals(req, {
            navActive: "appointments",
            settings: dashboard.settings,
            availability: dashboard.availability,
            leave: dashboard.leave,
            appointments: dashboard.appointments,
            ministers: ministers.rows,
            members: members || [],
            notice: req.query.saved ? "Saved." : req.query.reminded ? "Reminders processed." : null,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/appointments",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res) => {
      return res.redirect(303, "/branch/appointments");
    }
  );

  router.post(
    "/branch/appointments/settings",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const validated = validateSettingsBody(req.body);
        if (!validated.ok) return res.status(400).type("text").send(validated.error);
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        await growthAppointmentsService.saveSettings(getPgPool(), appointmentCtx(req), plan, validated.data);
        return res.redirect(303, "/branch/appointments?saved=1");
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/appointments/availability",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const validated = validateAvailabilityBody(req.body);
        if (!validated.ok) return res.status(400).type("text").send(validated.error);
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        await growthAppointmentsService.addAvailability(getPgPool(), appointmentCtx(req), plan, validated.data);
        return res.redirect(303, "/branch/appointments?saved=1");
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/appointments/leave",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const validated = validateLeaveBody(req.body);
        if (!validated.ok) return res.status(400).type("text").send(validated.error);
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        await growthAppointmentsService.addLeave(getPgPool(), appointmentCtx(req), plan, validated.data);
        return res.redirect(303, "/branch/appointments?saved=1");
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/appointments/book",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        const settings = await require("../../db/pg/church/appointmentsRepo").getSettingsWithDefaults(
          getPgPool(),
          req.churchContext.branch.id
        );
        const validated = validateBookingBody(req.body, settings);
        if (!validated.ok) return res.status(400).type("text").send(validated.error);
        if (!validated.data.member_id) return res.status(400).type("text").send("Select a member.");
        const appointment = await growthAppointmentsService.requestAppointment(
          getPgPool(),
          appointmentCtx(req),
          plan,
          validated.data,
          { autoApprove: true }
        );
        await recordBranchAudit(getPgPool(), req, {
          action: "appointment_booked",
          entityType: "appointment",
          entityId: appointment.id,
        });
        return res.redirect(303, `/branch/appointments/${appointment.id}`);
      } catch (e) {
        if (e.code === growthAppointmentsService.APPOINTMENT_ERRORS.CONFLICT) {
          return res.status(409).type("text").send(e.message);
        }
        if (e.code === growthAppointmentsService.APPOINTMENT_ERRORS.ON_LEAVE) {
          return res.status(409).type("text").send(e.message);
        }
        return next(e);
      }
    }
  );

  router.post(
    "/branch/appointments/process-reminders",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        await growthAppointmentsService.processDueReminders(getPgPool(), appointmentCtx(req), plan);
        return res.redirect(303, "/branch/appointments?reminded=1");
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/branch/appointments/:appointmentId",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    async (req, res, next) => {
      try {
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        const detail = await growthAppointmentsService.loadAppointmentDetail(
          getPgPool(),
          appointmentCtx(req),
          plan,
          Number(req.params.appointmentId)
        );
        return res.render(
          "church/branch-admin/appointment_detail",
          branchAdminLocals(req, {
            navActive: "appointments",
            ...detail,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/appointments/:appointmentId/approve",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        const id = Number(req.params.appointmentId);
        await growthAppointmentsService.approveAppointment(getPgPool(), appointmentCtx(req), plan, id);
        return res.redirect(303, `/branch/appointments/${id}`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/appointments/:appointmentId/cancel",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        const id = Number(req.params.appointmentId);
        await growthAppointmentsService.cancelAppointment(
          getPgPool(),
          appointmentCtx(req),
          plan,
          id,
          String((req.body && req.body.cancellation_reason) || ""),
          "admin"
        );
        return res.redirect(303, `/branch/appointments/${id}`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/appointments/:appointmentId/reschedule",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        const settings = await require("../../db/pg/church/appointmentsRepo").getSettingsWithDefaults(
          getPgPool(),
          req.churchContext.branch.id
        );
        const validated = validateBookingBody(req.body, settings);
        if (!validated.ok) return res.status(400).type("text").send(validated.error);
        const replacement = await growthAppointmentsService.rescheduleAppointment(
          getPgPool(),
          appointmentCtx(req),
          plan,
          Number(req.params.appointmentId),
          validated.data,
          "admin"
        );
        return res.redirect(303, `/branch/appointments/${replacement.id}`);
      } catch (e) {
        if (
          e.code === growthAppointmentsService.APPOINTMENT_ERRORS.CONFLICT ||
          e.code === growthAppointmentsService.APPOINTMENT_ERRORS.ON_LEAVE
        ) {
          return res.status(409).type("text").send(e.message);
        }
        return next(e);
      }
    }
  );

  router.post(
    "/branch/appointments/:appointmentId/confidential-note",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const validated = validateConfidentialNoteBody(req.body);
        if (!validated.ok) return res.status(400).type("text").send(validated.error);
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        const id = Number(req.params.appointmentId);
        await growthAppointmentsService.addConfidentialNote(
          getPgPool(),
          appointmentCtx(req),
          plan,
          id,
          validated.note_body
        );
        return res.redirect(303, `/branch/appointments/${id}`);
      } catch (e) {
        if (e.code === growthAppointmentsService.APPOINTMENT_ERRORS.PERMISSION_DENIED) {
          return res.status(403).type("text").send(e.message);
        }
        return next(e);
      }
    }
  );
};
