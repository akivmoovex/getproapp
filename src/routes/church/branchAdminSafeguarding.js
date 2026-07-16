"use strict";

const { getPgPool } = require("../../db/pg");
const pastoralCareRepo = require("../../db/pg/church/pastoralCareRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const { requireChurchSessionCsrf } = require("../../church/churchSessionCsrf");
const { requireSafeguardingAccess } = require("../../church/foundationPastoralAccess");
const { validateSafeguardingIncidentBody } = require("../../church/pastoralCareValidation");
const foundationPastoralCareService = require("../../services/church/foundationPastoralCareService");
const {
  branchAdminLocals,
  flashFromQuery,
  SAFEGUARDING_NOTICES,
  noticeMessage,
  recordBranchAudit,
} = require("./branchAdminShared");

module.exports = function registerBranchAdminSafeguardingRoutes(router) {
  router.get(
    "/branch/safeguarding",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requireSafeguardingAccess,
    async (req, res, next) => {
      try {
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const incidents = await pastoralCareRepo.listSafeguardingIncidentsForBranch(pool, branch.id);
        return res.render(
          "church/branch-admin/safeguarding_incidents",
          branchAdminLocals(req, {
            incidents,
            form: {},
            notice: noticeMessage(flashFromQuery(req, SAFEGUARDING_NOTICES)),
            error: null,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.post(
    "/branch/safeguarding",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requireSafeguardingAccess,
    requireChurchSessionCsrf,
    async (req, res, next) => {
      try {
        const validation = validateSafeguardingIncidentBody(req.body || {});
        const pool = getPgPool();
        const branch = req.churchContext.branch;
        if (!validation.ok) {
          const incidents = await pastoralCareRepo.listSafeguardingIncidentsForBranch(pool, branch.id);
          return res.status(400).render(
            "church/branch-admin/safeguarding_incidents",
            branchAdminLocals(req, {
              incidents,
              form: req.body,
              error: validation.error,
              notice: null,
            })
          );
        }
        const result = await foundationPastoralCareService.reportSafeguardingIncident(
          pool,
          foundationPastoralCareService.trustedCtx(req),
          validation.data
        );
        await recordBranchAudit(pool, req, {
          action: "safeguarding_incident_opened",
          entityType: "safeguarding_incident",
          entityId: result.incident.id,
          metadata: { notification_subject: result.notificationSubject },
        });
        return res.redirect(303, `/branch/safeguarding/${result.incident.id}?notice=incident_opened`);
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/branch/safeguarding/:incidentId",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    requireSafeguardingAccess,
    async (req, res, next) => {
      try {
        const incidentId = Number(req.params.incidentId);
        const pool = getPgPool();
        const incident = await pastoralCareRepo.findSafeguardingIncidentByIdForBranch(
          pool,
          incidentId,
          req.churchContext.branch.id
        );
        if (!incident) return res.status(404).type("text").send("Incident not found.");
        return res.render(
          "church/branch-admin/safeguarding_incident_detail",
          branchAdminLocals(req, {
            incident,
            notice: noticeMessage(flashFromQuery(req, SAFEGUARDING_NOTICES)),
            error: null,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );
};
