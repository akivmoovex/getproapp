"use strict";

const { getPgPool } = require("../../db/pg");
const auditLogsRepo = require("../../db/pg/church/auditLogsRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const { requireChurchBranchHost } = require("./auth");
const {
  AUDIT_ACTOR_TYPES,
  AUDIT_ACTION_GROUPS,
  AUDIT_EXPORT_MAX_ROWS,
  parseAuditFilters,
  actionLabel,
  actorTypeLabel,
  targetTypeLabel,
  actorDisplayFromRow,
  targetLabelFromRow,
  auditSummary,
  entityIdentifierFromRow,
  entityDisplayFromRow,
  packageChangeFromRow,
  reasonFromRow,
  resultFromRow,
  formatMetadataForDisplay,
  buildAuditExportCsv,
} = require("../../church/auditLogFormatting");
const { organisationAllowsAuditExport } = require("../../services/church/auditLogViewerService");
const { branchAdminLocals } = require("./branchAdminShared");

function auditLocals(req, extra) {
  return branchAdminLocals(req, {
    actionLabel,
    actorTypeLabel,
    targetTypeLabel,
    actorDisplayFromRow,
    targetLabelFromRow,
    auditSummary,
    entityIdentifierFromRow,
    entityDisplayFromRow,
    packageChangeFromRow,
    reasonFromRow,
    resultFromRow,
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
  if (filters.actorId) params.set("actor_id", String(filters.actorId));
  if (filters.targetType) params.set("target_type", filters.targetType);
  if (filters.dateFrom) params.set("date_from", filters.dateFrom);
  if (filters.dateTo) params.set("date_to", filters.dateTo);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

module.exports = function registerBranchAdminAuditRoutes(router) {
  router.get(
    "/branch/activity/export.csv",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const parsed = parseAuditFilters(req.query);
        if (!parsed.ok) {
          return res.status(400).type("text").send(parsed.error);
        }
        const org = req.churchContext.organization;
        const branch = req.churchContext.branch;
        const pool = getPgPool();
        const allowed = await organisationAllowsAuditExport(pool, org.id);
        if (!allowed) {
          return res.status(403).type("text").send("Audit export requires a Growth reports entitlement.");
        }
        const filters = {
          ...parsed.filters,
          limit: AUDIT_EXPORT_MAX_ROWS,
          offset: 0,
          page: 1,
        };
        const logs = await auditLogsRepo.listAuditLogsForBranch(pool, branch.id, filters);
        const csv = buildAuditExportCsv(logs);
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="activity-export.csv"');
        return res.status(200).send(csv);
      } catch (e) {
        return next(e);
      }
    }
  );

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
        const org = req.churchContext.organization;
        const pool = getPgPool();
        const filters = parsed.filters;
        const [logs, total, canExport] = await Promise.all([
          auditLogsRepo.listAuditLogsForBranch(pool, branch.id, filters),
          auditLogsRepo.countAuditLogsForBranch(pool, branch.id, filters),
          organisationAllowsAuditExport(pool, org.id),
        ]);
        const totalPages = Math.max(Math.ceil(total / filters.limit), 1);
        return res.render(
          "church/branch-admin/activity_timeline",
          auditLocals(req, {
            logs,
            filters,
            total,
            totalPages,
            canExport,
            exportUrl: canExport ? `/branch/activity/export.csv${buildFilterQuery(filters, 1)}` : null,
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
