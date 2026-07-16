"use strict";

const { getPgPool } = require("../../db/pg");
const auditLogsRepo = require("../../db/pg/church/auditLogsRepo");
const { requireChurchHqAdminSession } = require("../../church/hqAuth");
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
const branchesRepo = require("../../db/pg/church/branchesRepo");
const { organisationAllowsAuditExport } = require("../../services/church/auditLogViewerService");
const { hqAdminLocals } = require("./hqAdminShared");

function auditLocals(req, extra) {
  return hqAdminLocals(req, {
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
  if (filters.branchId) params.set("branch_id", String(filters.branchId));
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

async function validateBranchFilter(pool, organizationId, branchId) {
  if (!branchId) return { ok: true, branchId: null };
  const branches = await branchesRepo.listBranchesForOrganization(pool, organizationId);
  const valid = branches.some((b) => Number(b.id) === Number(branchId));
  if (!valid) {
    return { ok: false, error: "Invalid branch filter." };
  }
  return { ok: true, branchId };
}

module.exports = function registerHqAdminAuditRoutes(router) {
  router.get("/hq/audit/export.csv", requireChurchBranchHost, requireChurchHqAdminSession, async (req, res, next) => {
    try {
      const parsed = parseAuditFilters(req.query);
      if (!parsed.ok) {
        return res.status(400).type("text").send(parsed.error);
      }
      const org = req.churchContext.organization;
      const pool = getPgPool();
      const allowed = await organisationAllowsAuditExport(pool, org.id);
      if (!allowed) {
        return res.status(403).type("text").send("Audit export requires a Growth reports entitlement.");
      }
      const branchCheck = await validateBranchFilter(pool, org.id, parsed.filters.branchId);
      if (!branchCheck.ok) {
        return res.status(400).type("text").send(branchCheck.error);
      }
      const filters = {
        ...parsed.filters,
        branchId: branchCheck.branchId,
        limit: AUDIT_EXPORT_MAX_ROWS,
        offset: 0,
        page: 1,
      };
      const logs = await auditLogsRepo.listAuditLogsForOrganization(pool, org.id, filters);
      const csv = buildAuditExportCsv(logs);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="audit-export.csv"');
      return res.status(200).send(csv);
    } catch (e) {
      return next(e);
    }
  });

  router.get("/hq/audit", requireChurchBranchHost, requireChurchHqAdminSession, async (req, res, next) => {
    try {
      const parsed = parseAuditFilters(req.query);
      if (!parsed.ok) {
        return res.status(400).type("text").send(parsed.error);
      }
      const org = req.churchContext.organization;
      const pool = getPgPool();
      const branchCheck = await validateBranchFilter(pool, org.id, parsed.filters.branchId);
      if (!branchCheck.ok) {
        return res.status(400).type("text").send(branchCheck.error);
      }
      const filters = { ...parsed.filters, branchId: branchCheck.branchId };
      const branches = await branchesRepo.listBranchesForOrganization(pool, org.id);
      const [logs, total, canExport] = await Promise.all([
        auditLogsRepo.listAuditLogsForOrganization(pool, org.id, filters),
        auditLogsRepo.countAuditLogsForOrganization(pool, org.id, filters),
        organisationAllowsAuditExport(pool, org.id),
      ]);
      const totalPages = Math.max(Math.ceil(total / filters.limit), 1);
      return res.render(
        "church/hq/audit_trail",
        auditLocals(req, {
          logs,
          filters,
          branches,
          total,
          totalPages,
          canExport,
          exportUrl: canExport ? `/hq/audit/export.csv${buildFilterQuery(filters, 1)}` : null,
          prevUrl: filters.page > 1 ? `/hq/audit${buildFilterQuery(filters, filters.page - 1)}` : null,
          nextUrl:
            filters.page < totalPages ? `/hq/audit${buildFilterQuery(filters, filters.page + 1)}` : null,
          error: null,
        })
      );
    } catch (e) {
      return next(e);
    }
  });

  router.get(
    "/hq/audit/:auditId",
    requireChurchBranchHost,
    requireChurchHqAdminSession,
    async (req, res, next) => {
      try {
        const auditId = Number(req.params.auditId);
        if (!Number.isFinite(auditId) || auditId <= 0) {
          return res.status(404).type("text").send("Audit event not found.");
        }
        const org = req.churchContext.organization;
        const pool = getPgPool();
        const log = await auditLogsRepo.findAuditLogByIdForOrganization(pool, auditId, org.id);
        if (!log) {
          return res.status(404).type("text").send("Audit event not found.");
        }
        return res.render(
          "church/hq/audit_detail",
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
