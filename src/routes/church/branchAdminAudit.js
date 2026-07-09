"use strict";

const { getPgPool } = require("../../db/pg");
const auditLogsRepo = require("../../db/pg/church/auditLogsRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const {
  AUDIT_ACTOR_TYPES,
  AUDIT_ACTION_GROUPS,
  parseAuditFilters,
  actionLabel,
  actorTypeLabel,
  targetTypeLabel,
  actorDisplayFromRow,
  targetLabelFromRow,
  auditSummary,
  formatMetadataForDisplay,
} = require("../../church/auditLogFormatting");
const { branchAdminLocals } = require("./branchAdminShared");

function auditLocals(req, extra) {
  return branchAdminLocals(req, {
    actionLabel,
    actorTypeLabel,
    targetTypeLabel,
    actorDisplayFromRow,
    targetLabelFromRow,
    auditSummary,
    formatMetadataForDisplay,
    auditActorTypes: AUDIT_ACTOR_TYPES,
    auditActionGroups: AUDIT_ACTION_GROUPS,
    ...(extra || {}),
  });
}

function buildFilterQuery(filters, page) {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.action) params.set("action", filters.action);
  if (filters.actionGroup && filters.actionGroup !== "all") params.set("action_group", filters.actionGroup);
  if (filters.actorType) params.set("actor_type", filters.actorType);
  if (filters.targetType) params.set("target_type", filters.targetType);
  if (filters.dateFrom) params.set("date_from", filters.dateFrom);
  if (filters.dateTo) params.set("date_to", filters.dateTo);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

module.exports = function registerBranchAdminAuditRoutes(router) {
  router.get(
    "/branch/activity",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const parsed = parseAuditFilters(req.query);
        if (!parsed.ok) {
          return res.status(400).type("text").send(parsed.error);
        }
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const filters = parsed.filters;
        const [logs, total] = await Promise.all([
          auditLogsRepo.listAuditLogsForBranch(pool, branch.id, filters),
          auditLogsRepo.countAuditLogsForBranch(pool, branch.id, filters),
        ]);
        const totalPages = Math.max(Math.ceil(total / filters.limit), 1);
        return res.render(
          "church/branch-admin/activity_timeline",
          auditLocals(req, {
            logs,
            filters,
            total,
            totalPages,
            prevUrl: filters.page > 1 ? `/branch/activity${buildFilterQuery(filters, filters.page - 1)}` : null,
            nextUrl:
              filters.page < totalPages
                ? `/branch/activity${buildFilterQuery(filters, filters.page + 1)}`
                : null,
            error: null,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );

  router.get(
    "/branch/activity/:auditId",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const auditId = Number(req.params.auditId);
        if (!Number.isFinite(auditId) || auditId <= 0) {
          return res.status(404).type("text").send("Activity event not found.");
        }
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const log = await auditLogsRepo.findAuditLogByIdForBranch(pool, auditId, branch.id);
        if (!log) {
          return res.status(404).type("text").send("Activity event not found.");
        }
        return res.render(
          "church/branch-admin/activity_detail",
          auditLocals(req, {
            log,
            metadataDisplay: formatMetadataForDisplay(log.metadata_json),
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );
};
