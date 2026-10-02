"use strict";

const { getPgPool } = require("../../db/pg");
const surveysRepo = require("../../db/pg/church/surveysRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const { requireChurchSessionCsrf } = require("../../church/churchSessionCsrf");
const {
  loadPlanForReq,
  requirePackageFeature,
} = require("../../services/church/churchPackageFeatureGateService");
const growthSurveysService = require("../../services/church/growthSurveysService");
const {
  validateSurveyBody,
  validateQuestionBody,
} = require("../../church/growthSurveysValidation");
const { branchAdminLocals, recordBranchAudit } = require("./branchAdminShared");

function surveyCtx(req) {
  return {
    organization_id: req.churchContext.organization.id,
    branch_id: req.churchContext.branch.id,
    admin_id: req.churchBranchAdmin.id,
    can_access_pastoral: Boolean(req.churchBranchAdmin.can_access_pastoral),
    can_supervise_pastoral: Boolean(req.churchBranchAdmin.can_supervise_pastoral),
  };
}

module.exports = function registerBranchAdminSurveysRoutes(router) {
  const guard = requirePackageFeature("surveys_custom", { allowGetUpgradeShell: true });

  router.get(
    "/branch/surveys",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    async (req, res, next) => {
      try {
        if (req.packageFeatureUi && req.packageFeatureUi.state !== "available") {
          const { renderBranchFeatureGate } = require("./packageFeatureGates");
          return renderBranchFeatureGate(req, res, "surveys_custom");
        }
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        const dashboard = await growthSurveysService.loadDashboard(getPgPool(), surveyCtx(req), plan);
        return res.render(
          "church/branch-admin/surveys",
          branchAdminLocals(req, {
            navActive: "surveys",
            surveys: dashboard.surveys,
            notice: req.query.saved ? "Saved." : null,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/surveys",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        // Creating a survey requires a title; empty POST is package-gated then validated.
        const validated = validateSurveyBody(req.body);
        if (!validated.ok) return res.status(400).type("text").send(validated.error);
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        const survey = await growthSurveysService.createSurvey(
          getPgPool(),
          surveyCtx(req),
          plan,
          validated.data
        );
        await recordBranchAudit(getPgPool(), req, {
          action: "survey_created",
          entityType: "survey",
          entityId: survey.id,
        });
        return res.redirect(303, `/branch/surveys/${survey.id}`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/surveys/process-recurring",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        await growthSurveysService.processRecurringSurveys(getPgPool(), plan);
        return res.redirect(303, "/branch/surveys?saved=1");
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/branch/surveys/responses/:sessionId",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    async (req, res, next) => {
      try {
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        const detail = await growthSurveysService.loadResponseForAdmin(
          getPgPool(),
          surveyCtx(req),
          plan,
          Number(req.params.sessionId)
        );
        return res.render(
          "church/branch-admin/survey_response",
          branchAdminLocals(req, {
            navActive: "surveys",
            ...detail,
          })
        );
      } catch (e) {
        if (e.code === growthSurveysService.SURVEY_ERRORS.PERMISSION_DENIED) {
          return res.status(403).type("text").send(e.message);
        }
        return next(e);
      }
    }
  );

  router.get(
    "/branch/surveys/:surveyId",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    async (req, res, next) => {
      try {
        const pool = getPgPool();
        const survey = await surveysRepo.findSurveyByIdForBranch(
          pool,
          Number(req.params.surveyId),
          req.churchContext.branch.id
        );
        if (!survey) return res.status(404).type("text").send("Survey not found.");
        const questions = await surveysRepo.listQuestionsForSurvey(pool, survey.id);
        const responses = await surveysRepo.listSubmittedSessionsForSurvey(
          pool,
          survey.id,
          req.churchContext.branch.id
        );
        return res.render(
          "church/branch-admin/survey_detail",
          branchAdminLocals(req, {
            navActive: "surveys",
            survey,
            questions,
            responses,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/surveys/:surveyId/questions",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const validated = validateQuestionBody(req.body);
        if (!validated.ok) return res.status(400).type("text").send(validated.error);
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        const surveyId = Number(req.params.surveyId);
        await growthSurveysService.addQuestion(getPgPool(), surveyCtx(req), plan, surveyId, validated.data);
        return res.redirect(303, `/branch/surveys/${surveyId}`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/surveys/:surveyId/activate",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    guard,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const plan = req.churchPackagePlan || (await loadPlanForReq(req));
        const surveyId = Number(req.params.surveyId);
        await growthSurveysService.activateSurvey(getPgPool(), surveyCtx(req), plan, surveyId);
        return res.redirect(303, `/branch/surveys/${surveyId}`);
      } catch (e) {
        return next(e);
      }
    }
  );
};
