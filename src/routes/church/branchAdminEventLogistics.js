"use strict";

const { getPgPool } = require("../../db/pg");
const eventRegistrationsRepo = require("../../db/pg/church/eventRegistrationsRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const { requireChurchSessionCsrf } = require("../../church/churchSessionCsrf");
const {
  loadPlanForReq,
  requirePackageFeature,
} = require("../../services/church/churchPackageFeatureGateService");
const growthAdvancedEventsService = require("../../services/church/growthAdvancedEventsService");
const {
  validateFormBody,
  validateQuestionBody,
  validateGrowthEventSettings,
} = require("../../church/growthAdvancedEventsValidation");
const { branchAdminLocals } = require("./branchAdminShared");

function ctx(req) {
  return {
    organization_id: req.churchContext.organization.id,
    branch_id: req.churchContext.branch.id,
    admin_id: req.churchBranchAdmin.admin_id,
  };
}

module.exports = function registerBranchAdminEventLogisticsRoutes(router) {
  const guard = requirePackageFeature("events_advanced_logistics", { allowGetUpgradeShell: true });

  router.get(
    "/branch/event-logistics",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    async (req, res, next) => {
      try {
        if (req.packageFeatureUi && req.packageFeatureUi.state !== "available") {
          return require("./packageFeatureGates").renderBranchFeatureGate(
            req,
            res,
            "events_advanced_logistics"
          );
        }
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        const dashboard = await growthAdvancedEventsService.loadLogisticsDashboard(
          getPgPool(),
          ctx(req),
          plan
        );
        return res.render(
          "church/branch-admin/event_logistics",
          branchAdminLocals(req, {
            navActive: "event-logistics",
            ...dashboard,
            notice: req.query.saved ? "Saved." : null,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/event-logistics",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res) => res.redirect(303, "/branch/event-logistics")
  );

  router.post(
    "/branch/event-logistics/forms",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const validated = validateFormBody(req.body);
        if (!validated.ok) return res.status(400).type("text").send(validated.error);
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        const form = await growthAdvancedEventsService.createRegistrationForm(
          getPgPool(),
          ctx(req),
          plan,
          validated.data
        );
        return res.redirect(303, `/branch/event-logistics/forms/${form.id}`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/branch/event-logistics/forms/:formId",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    async (req, res, next) => {
      try {
        const pool = getPgPool();
        const form = await eventRegistrationsRepo.findFormByIdForBranch(
          pool,
          Number(req.params.formId),
          req.churchContext.branch.id
        );
        if (!form) return res.status(404).type("text").send("Form not found.");
        const questions = await eventRegistrationsRepo.listQuestionsForForm(pool, form.id);
        return res.render(
          "church/branch-admin/event_form_builder",
          branchAdminLocals(req, {
            navActive: "event-logistics",
            form,
            questions,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/event-logistics/forms/:formId/questions",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const validated = validateQuestionBody(req.body);
        if (!validated.ok) return res.status(400).type("text").send(validated.error);
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        await growthAdvancedEventsService.addFormQuestion(
          getPgPool(),
          ctx(req),
          plan,
          Number(req.params.formId),
          validated.data
        );
        return res.redirect(303, `/branch/event-logistics/forms/${req.params.formId}`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/event-logistics/events/:eventId/configure",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const validated = validateGrowthEventSettings(req.body);
        if (!validated.ok) return res.status(400).type("text").send(validated.error);
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        await growthAdvancedEventsService.configureGrowthEvent(
          getPgPool(),
          ctx(req),
          plan,
          Number(req.params.eventId),
          validated.data
        );
        return res.redirect(303, `/branch/events/${req.params.eventId}`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/event-logistics/registrations/:registrationId/approve",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        const updated = await growthAdvancedEventsService.approveRegistration(
          getPgPool(),
          ctx(req),
          plan,
          Number(req.params.registrationId)
        );
        return res.redirect(303, `/branch/events/${updated.event_id}`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/event-logistics/registrations/:registrationId/no-show",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        const updated = await growthAdvancedEventsService.markNoShow(
          getPgPool(),
          ctx(req),
          plan,
          Number(req.params.registrationId)
        );
        return res.redirect(303, `/branch/events/${updated.event_id}`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/event-logistics/events/:eventId/volunteer-needs",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        const memberId = Number(req.body && req.body.assigned_member_id);
        await growthAdvancedEventsService.addVolunteerNeed(
          getPgPool(),
          ctx(req),
          plan,
          Number(req.params.eventId),
          {
            role_name: String((req.body && req.body.role_name) || "").trim().slice(0, 200),
            slots_needed: Number(req.body && req.body.slots_needed) || 1,
            notes: String((req.body && req.body.notes) || "").trim().slice(0, 1000),
            assigned_member_id: Number.isFinite(memberId) && memberId > 0 ? memberId : null,
          }
        );
        return res.redirect(303, `/branch/events/${req.params.eventId}`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/event-logistics/events/:eventId/visitor-follow-up",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        await growthAdvancedEventsService.createVisitorFollowUp(
          getPgPool(),
          ctx(req),
          plan,
          Number(req.params.eventId),
          {
            visitor_name: String((req.body && req.body.visitor_name) || "").trim(),
            visitor_email: String((req.body && req.body.visitor_email) || "").trim(),
            visitor_phone: String((req.body && req.body.visitor_phone) || "").trim(),
            notes: String((req.body && req.body.notes) || "").trim(),
            registration_id: Number(req.body && req.body.registration_id) || null,
          }
        );
        return res.redirect(303, `/branch/events/${req.params.eventId}`);
      } catch (e) {
        return next(e);
      }
    }
  );
};
