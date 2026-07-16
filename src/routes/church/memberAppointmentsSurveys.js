"use strict";

const { getPgPool } = require("../../db/pg");
const appointmentsRepo = require("../../db/pg/church/appointmentsRepo");
const surveysRepo = require("../../db/pg/church/surveysRepo");
const {
  requireVerifiedMemberSession,
  ensureMemberAccountActive,
} = require("../../church/memberAuth");
const { requireChurchBranchHost } = require("./auth");
const { requireChurchSessionCsrf } = require("../../church/churchSessionCsrf");
const { getOrganisationPlan } = require("../../services/church/churchEntitlementService");
const growthAppointmentsService = require("../../services/church/growthAppointmentsService");
const growthSurveysService = require("../../services/church/growthSurveysService");
const { validateBookingBody } = require("../../church/growthAppointmentsValidation");
const { validateAnswerBody } = require("../../church/growthSurveysValidation");
const { churchSessionCsrfLocals } = require("../../church/churchSessionCsrf");

function memberCtx(req) {
  return {
    organization_id: req.churchContext.organization.id,
    branch_id: req.churchContext.branch.id,
    member_id: req.churchMember.member_id,
  };
}

function memberLocals(req, extra) {
  const name = (req.churchMember && req.churchMember.full_name) || "Member";
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return {
    pageTitle: extra.pageTitle || "Member",
    churchName:
      (req.churchContext.branch && req.churchContext.branch.name) ||
      req.churchContext.organization.name,
    branchName: req.churchContext.branch.name,
    memberName: name,
    memberInitials: initials,
    memberAvatarUrl: "/church/images/member/avatar-member.jpg",
    navActive: extra.navActive || "",
    shellTitle: extra.pageTitle || "Member Portal",
    ...churchSessionCsrfLocals(req),
    ...extra,
  };
}

module.exports = function registerMemberAppointmentsSurveysRoutes(router) {
  router.get(
    "/member/appointments",
    requireChurchBranchHost,
    requireVerifiedMemberSession,
    ensureMemberAccountActive,
    async (req, res, next) => {
      try {
        const pool = getPgPool();
        const plan = await getOrganisationPlan(pool, req.churchContext.organization.id);
        if (!plan || !require("../../services/church/churchEntitlementService").hasEntitlement(plan, "appointments.calendar")) {
          return res.status(403).type("text").send("Appointment booking requires Growth.");
        }
        const appointments = await appointmentsRepo.listAppointmentsForMember(pool, req.churchMember.member_id);
        const availability = await appointmentsRepo.listAvailabilityForBranch(pool, req.churchContext.branch.id);
        const settings = await appointmentsRepo.getSettingsWithDefaults(pool, req.churchContext.branch.id);
        return res.render(
          "church/member/appointments",
          memberLocals(req, {
            pageTitle: "Appointments",
            navActive: "requests",
            appointments,
            availability,
            settings,
            notice: req.query.booked ? "Request submitted." : req.query.cancelled ? "Cancelled." : null,
            error: null,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/member/appointments/request",
    requireChurchBranchHost,
    requireVerifiedMemberSession,
    ensureMemberAccountActive,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const pool = getPgPool();
        const plan = await getOrganisationPlan(pool, req.churchContext.organization.id);
        const settings = await appointmentsRepo.getSettingsWithDefaults(pool, req.churchContext.branch.id);
        const validated = validateBookingBody(req.body, settings);
        if (!validated.ok) return res.status(400).type("text").send(validated.error);
        validated.data.member_id = req.churchMember.member_id;
        await growthAppointmentsService.requestAppointment(pool, memberCtx(req), plan, validated.data);
        return res.redirect(303, "/member/appointments?booked=1");
      } catch (e) {
        if (
          e.code === growthAppointmentsService.APPOINTMENT_ERRORS.CONFLICT ||
          e.code === growthAppointmentsService.APPOINTMENT_ERRORS.ON_LEAVE ||
          e.code === growthAppointmentsService.APPOINTMENT_ERRORS.PACKAGE_REQUIRED
        ) {
          return res.status(409).type("text").send(e.message);
        }
        return next(e);
      }
    }
  );

  router.post(
    "/member/appointments/:appointmentId/cancel",
    requireChurchBranchHost,
    requireVerifiedMemberSession,
    ensureMemberAccountActive,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const pool = getPgPool();
        const plan = await getOrganisationPlan(pool, req.churchContext.organization.id);
        await growthAppointmentsService.cancelAppointment(
          pool,
          memberCtx(req),
          plan,
          Number(req.params.appointmentId),
          String((req.body && req.body.cancellation_reason) || ""),
          "member"
        );
        return res.redirect(303, "/member/appointments?cancelled=1");
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/member/surveys",
    requireChurchBranchHost,
    requireVerifiedMemberSession,
    ensureMemberAccountActive,
    async (req, res, next) => {
      try {
        const pool = getPgPool();
        const surveys = await surveysRepo.listActiveSurveysForMember(pool, req.churchContext.branch.id);
        return res.render(
          "church/member/surveys",
          memberLocals(req, {
            pageTitle: "Surveys",
            navActive: "forms",
            surveys,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/member/surveys/:surveyId/start",
    requireChurchBranchHost,
    requireVerifiedMemberSession,
    ensureMemberAccountActive,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const pool = getPgPool();
        const plan = await getOrganisationPlan(pool, req.churchContext.organization.id);
        const consentAccepted = String((req.body && req.body.consent_accepted) || "") === "1";
        const session = await growthSurveysService.startOrResumeSession(
          pool,
          memberCtx(req),
          plan,
          Number(req.params.surveyId),
          consentAccepted
        );
        return res.redirect(303, `/member/surveys/sessions/${session.id}`);
      } catch (e) {
        if (e.code === growthSurveysService.SURVEY_ERRORS.CONSENT_REQUIRED) {
          return res.status(400).type("text").send(e.message);
        }
        return next(e);
      }
    }
  );

  router.get(
    "/member/surveys/sessions/:sessionId",
    requireChurchBranchHost,
    requireVerifiedMemberSession,
    ensureMemberAccountActive,
    async (req, res, next) => {
      try {
        const detail = await growthSurveysService.loadSessionForMember(
          getPgPool(),
          memberCtx(req),
          Number(req.params.sessionId)
        );
        return res.render(
          "church/member/survey_session",
          memberLocals(req, {
            pageTitle: detail.session.survey_title || "Survey",
            navActive: "forms",
            ...detail,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/member/surveys/sessions/:sessionId/answer",
    requireChurchBranchHost,
    requireVerifiedMemberSession,
    ensureMemberAccountActive,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const pool = getPgPool();
        const plan = await getOrganisationPlan(pool, req.churchContext.organization.id);
        const validated = validateAnswerBody(req.body);
        if (!validated.ok) return res.status(400).type("text").send(validated.error);
        await growthSurveysService.saveAnswer(
          pool,
          memberCtx(req),
          plan,
          Number(req.params.sessionId),
          validated.data
        );
        return res.redirect(303, `/member/surveys/sessions/${req.params.sessionId}`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/member/surveys/sessions/:sessionId/submit",
    requireChurchBranchHost,
    requireVerifiedMemberSession,
    ensureMemberAccountActive,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const pool = getPgPool();
        const plan = await getOrganisationPlan(pool, req.churchContext.organization.id);
        await growthSurveysService.submitSession(pool, memberCtx(req), plan, Number(req.params.sessionId));
        return res.redirect(303, "/member/surveys?submitted=1");
      } catch (e) {
        return next(e);
      }
    }
  );
};
