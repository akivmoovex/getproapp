/**
 * Field Agent analytics (read-only aggregates from submission / callback / agent tables).
 */
const { canAccessCrm, canMutateCrm, canCorrectFieldAgentSubmissions } = require("../../auth/roles");
const { getAdminTenantId } = require("./adminShared");
const { getPgPool } = require("../../db/pg");
const fieldAgentAnalyticsRepo = require("../../db/pg/fieldAgentAnalyticsRepo");
const fieldAgentSubmissionsRepo = require("../../db/pg/fieldAgentSubmissionsRepo");
const fieldAgentSubmissionAuditRepo = require("../../db/pg/fieldAgentSubmissionAuditRepo");
const analyticsPresetsRepo = require("../../db/pg/adminFieldAgentAnalyticsPresetsRepo");
const faAnalyticsObs = require("../../lib/fieldAgentAnalyticsObservability");

module.exports = function registerAdminFieldAgentAnalyticsRoutes(router) {
  // Guardrails (override via FA_ANALYTICS_* env). See docs/field-agent-analytics-runbook.md §8.
  const EXPORT_MAX_ROWS = Math.max(Number(process.env.FA_ANALYTICS_EXPORT_MAX_ROWS || 5000), 1);
  const BULK_MAX_IDS = Math.max(Number(process.env.FA_ANALYTICS_BULK_MAX_IDS || 200), 1);
  const DEFAULT_PAGE_SIZE = 50;
  const MAX_PAGE_SIZE = 100;
  const PRESET_RECORD_TYPES = ["submissions", "callback_leads"];
  router.use("/field-agent-analytics", faAnalyticsObs.endpointMiddleware());

  function requireCrmAccess(req, res, next) {
    if (!req.session.adminUser) return res.redirect("/admin/login");
    if (!canAccessCrm(req.session.adminUser.role)) {
      return res.status(403).type("text").send("CRM is not available for your role.");
    }
    return next();
  }
  function requireCrmMutate(req, res, next) {
    if (!req.session.adminUser) return res.redirect("/admin/login");
    if (!canMutateCrm(req.session.adminUser.role)) {
      return res.status(403).type("text").send("Read-only access.");
    }
    return next();
  }
  function requireSubmissionCorrection(req, res, next) {
    if (!req.session.adminUser) return res.redirect("/admin/login");
    if (!canMutateCrm(req.session.adminUser.role)) {
      return res.status(403).type("text").send("Read-only access.");
    }
    if (!canCorrectFieldAgentSubmissions(req.session.adminUser.role)) {
      return res.status(403).type("text").send("Corrections are not available for your role.");
    }
    return next();
  }

  router.get("/field-agent-analytics", requireCrmAccess, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const tid = getAdminTenantId(req);
      const q = req.query || {};
      const from = q.from != null ? String(q.from).trim() : "";
      const to = q.to != null ? String(q.to).trim() : "";
      const agentRaw = q.agent != null ? String(q.agent).trim() : "";
      const fieldAgentId = agentRaw && Number(agentRaw) > 0 ? Number(agentRaw) : null;
      const trendDays = Math.min(Math.max(Number(q.days) || 30, 7), 90);

      const dateOpts =
        from || to
          ? { from: from || null, to: to || null, fieldAgentId }
          : { fieldAgentId };

      const summary = await fieldAgentAnalyticsRepo.getSubmissionSummaryForTenant(pool, tid, dateOpts);
      const decided = summary.approved + summary.rejected;
      const summaryRates = {
        approval_rate_decided: decided > 0 ? summary.approved / decided : null,
        approval_rate_total: summary.total > 0 ? summary.approved / summary.total : null,
      };

      const agents = await fieldAgentAnalyticsRepo.listFieldAgentsForTenant(pool, tid);
      const breakdown = await fieldAgentAnalyticsRepo.getPerAgentBreakdown(pool, tid, {
        from: from || null,
        to: to || null,
      });

      const submissionsByDay = await fieldAgentAnalyticsRepo.getSubmissionsPerDay(pool, tid, trendDays, fieldAgentId);
      const callbacksByDay = await fieldAgentAnalyticsRepo.getCallbackLeadsPerDay(pool, tid, trendDays, fieldAgentId);

      return res.render("admin/field_agent_analytics", {
        activeNav: "field_agent_analytics",
        summary: { ...summary, ...summaryRates },
        agents,
        breakdown,
        submissionsByDay,
        callbacksByDay,
        filters: {
          from: from || "",
          to: to || "",
          agent: fieldAgentId,
          days: trendDays,
        },
      });
    } catch (e) {
      return next(e);
    }
  });

  const SUBMISSION_BUCKETS = {
    total_submissions: {
      status: null,
      title: "Total submissions",
    },
    pending: {
      status: "pending",
      title: "Pending submissions",
    },
    info_needed: {
      status: "info_needed",
      title: "Info needed submissions",
    },
    approved: {
      status: "approved",
      title: "Approved submissions",
    },
    rejected: {
      status: "rejected",
      title: "Rejected submissions",
    },
    appealed: {
      status: "appealed",
      title: "Appealed submissions",
    },
    total_commission_approved: {
      status: "approved",
      title: "Approved submissions (source: Total commission)",
    },
    avg_commission_approved: {
      status: "approved",
      title: "Approved submissions (source: Avg commission)",
    },
    approval_rate_decided: {
      status: null,
      decidedOnly: true,
      title: "Decided submissions (source: Approval rate decided)",
    },
    share_approved_all: {
      status: "approved",
      title: "Approved submissions (source: Share approved of all)",
    },
  };
  // Bucket → list semantics (status / decidedOnly) drive drill-down + export. KPI-mapped buckets often share the same row set; see docs/field-agent-analytics-runbook.md §4.
  const SUBMISSION_STATUSES = ["pending", "info_needed", "approved", "rejected", "appealed"];

  function csvSafeText(v) {
    const s = String(v == null ? "" : v).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    if (/^[=+\-@]/.test(s)) return `'${s}`;
    return s;
  }
  function csvCell(v, textLike) {
    let out = v;
    if (textLike) out = csvSafeText(v);
    const s = String(out == null ? "" : out);
    return `"${s.replace(/"/g, '""')}"`;
  }
  function toIso(v) {
    if (!v) return "";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString();
  }
  function csvResponse(res, filename, headers, rows) {
    const lines = [headers.map((h) => csvCell(h, true)).join(",")];
    rows.forEach((row) => {
      lines.push(
        row
          .map((cell, idx) => {
            const isNumeric = idx > -1 && typeof cell === "number" && Number.isFinite(cell);
            return csvCell(cell, !isNumeric);
          })
          .join(",")
      );
    });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.status(200).send(`\uFEFF${lines.join("\r\n")}\r\n`);
  }
  function exportUrlFor(kind, bucket, filters) {
    const path =
      kind === "callback_leads"
        ? "/admin/field-agent-analytics/drilldown/callback-leads/export.csv"
        : "/admin/field-agent-analytics/drilldown/submissions/export.csv";
    const qs = new URLSearchParams();
    if (bucket) qs.set("bucket", bucket);
    if (filters && filters.q) qs.set("q", filters.q);
    if (filters && filters.status && kind === "submissions") qs.set("status", filters.status);
    if (filters && filters.from) qs.set("from", filters.from);
    if (filters && filters.to) qs.set("to", filters.to);
    if (filters && filters.agent) qs.set("agent", String(filters.agent));
    return `${path}?${qs.toString()}`;
  }
  function reportingDatasets() {
    return [
      { record_type: "submissions", bucket: "total_submissions", label: "Submissions — Total submissions" },
      { record_type: "submissions", bucket: "pending", label: "Submissions — Pending" },
      { record_type: "submissions", bucket: "info_needed", label: "Submissions — Info needed" },
      { record_type: "submissions", bucket: "approved", label: "Submissions — Approved" },
      { record_type: "submissions", bucket: "rejected", label: "Submissions — Rejected" },
      { record_type: "submissions", bucket: "appealed", label: "Submissions — Appealed" },
      {
        record_type: "submissions",
        bucket: "approval_rate_decided",
        label: "Submissions — Decided submissions (mapped from Approval rate decided KPI)",
      },
      {
        record_type: "submissions",
        bucket: "share_approved_all",
        label: "Submissions — Approved submissions (mapped from Share approved of all KPI)",
      },
      {
        record_type: "submissions",
        bucket: "total_commission_approved",
        label: "Submissions — Approved submissions (mapped from Total commission KPI)",
      },
      {
        record_type: "submissions",
        bucket: "avg_commission_approved",
        label: "Submissions — Approved submissions (mapped from Avg commission KPI)",
      },
      { record_type: "callback_leads", bucket: "callback_leads", label: "Callback leads — Callback leads" },
    ];
  }

  function parseAnalyticsFilters(q) {
    const from = q && q.from != null ? String(q.from).trim() : "";
    const to = q && q.to != null ? String(q.to).trim() : "";
    const agentRaw = q && q.agent != null ? String(q.agent).trim() : "";
    const textRaw = q && q.q != null ? String(q.q).trim() : "";
    const statusRaw = q && q.status != null ? String(q.status).trim() : "";
    const fieldAgentId = agentRaw && Number(agentRaw) > 0 ? Number(agentRaw) : null;
    const status = SUBMISSION_STATUSES.includes(statusRaw) ? statusRaw : null;
    return {
      from: from || null,
      to: to || null,
      fieldAgentId,
      q: textRaw || "",
      status,
    };
  }
  function allowedBucketForRecordType(recordType, bucket) {
    const b = String(bucket || "").trim();
    if (recordType === "submissions") return SUBMISSION_BUCKETS[b] ? b : null;
    if (recordType === "callback_leads") return b === "callback_leads" ? b : null;
    return null;
  }
  function sanitizePresetFilters(recordType, raw) {
    const q = raw && raw.q != null ? String(raw.q).trim().slice(0, 120) : "";
    const statusRaw = raw && raw.status != null ? String(raw.status).trim() : "";
    const status = recordType === "submissions" && SUBMISSION_STATUSES.includes(statusRaw) ? statusRaw : "";
    const from = raw && raw.from != null ? String(raw.from).trim().slice(0, 20) : "";
    const to = raw && raw.to != null ? String(raw.to).trim().slice(0, 20) : "";
    const agentRaw = raw && raw.agent != null ? String(raw.agent).trim() : "";
    const agent = agentRaw && Number(agentRaw) > 0 ? String(Number(agentRaw)) : "";
    const sizeRaw = raw && raw.page_size != null ? Number(raw.page_size) : DEFAULT_PAGE_SIZE;
    const pageSize = Number.isFinite(sizeRaw)
      ? Math.min(Math.max(Math.floor(sizeRaw), 1), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;
    return {
      q,
      status,
      from,
      to,
      agent,
      page_size: pageSize,
    };
  }
  function serializePreset(row) {
    return {
      id: Number(row.id),
      name: String(row.name || ""),
      record_type: String(row.record_type || ""),
      bucket: String(row.bucket || ""),
      filters: row.filters_json || {},
    };
  }
  function parsePagination(q) {
    const pageRaw = q && q.page != null ? Number(q.page) : 1;
    const sizeRaw = q && q.page_size != null ? Number(q.page_size) : DEFAULT_PAGE_SIZE;
    const page = Number.isFinite(pageRaw) ? Math.max(Math.floor(pageRaw), 1) : 1;
    const pageSize = Number.isFinite(sizeRaw)
      ? Math.min(Math.max(Math.floor(sizeRaw), 1), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;
    return { page, pageSize, offset: (page - 1) * pageSize };
  }
  function parseReportingSelection(q) {
    const recordType = q && q.record_type != null ? String(q.record_type).trim() : "submissions";
    const bucket = q && q.bucket != null ? String(q.bucket).trim() : (recordType === "callback_leads" ? "callback_leads" : "total_submissions");
    const validRecordType = PRESET_RECORD_TYPES.includes(recordType) ? recordType : "submissions";
    const validBucket = allowedBucketForRecordType(validRecordType, bucket) || (validRecordType === "callback_leads" ? "callback_leads" : "total_submissions");
    return { recordType: validRecordType, bucket: validBucket };
  }
  function classifyHealth(counters) {
    const c = counters || {};
    const slowQueries = Number(c.slowQueries || 0);
    const slowEndpoints = Number(c.slowEndpoints || 0);
    const queryErrors = Number(c.queryErrors || 0);
    const endpointErrors = Number(c.endpointErrors || 0);
    const totalSignals = slowQueries + slowEndpoints + queryErrors + endpointErrors;
    if (totalSignals === 0) {
      return {
        label: "Unknown",
        tone: "muted",
        reason: "No performance/error signals recorded yet since process start.",
      };
    }
    if (queryErrors + endpointErrors >= 5 || slowQueries + slowEndpoints >= 50) {
      return {
        label: "Degraded",
        tone: "warning",
        reason: "High slow/error signal count since process start.",
      };
    }
    return {
      label: "Healthy",
      tone: "success",
      reason: "Signal counts are currently within expected range.",
    };
  }

  router.get("/field-agent-analytics/health", requireCrmAccess, async (req, res, next) => {
    try {
      const counters = faAnalyticsObs.getCounters();
      const cfg = faAnalyticsObs.getConfig();
      const endpointRequests = counters.endpointRequests || {};
      const totalRequests = Object.values(endpointRequests).reduce((sum, n) => sum + (Number(n) || 0), 0);
      const health = classifyHealth(counters);
      return res.render("admin/field_agent_analytics_health", {
        activeNav: "field_agent_analytics",
        health,
        thresholds: cfg,
        guardrails: {
          max_page_size: MAX_PAGE_SIZE,
          export_max_rows: EXPORT_MAX_ROWS,
          bulk_max_ids: BULK_MAX_IDS,
        },
        signals: {
          total_requests: totalRequests,
          slow_queries: Number(counters.slowQueries || 0),
          slow_endpoints: Number(counters.slowEndpoints || 0),
          query_errors: Number(counters.queryErrors || 0),
          endpoint_errors: Number(counters.endpointErrors || 0),
        },
      });
    } catch (e) {
      return next(e);
    }
  });

  router.get("/field-agent-analytics/drilldown/submissions", requireCrmAccess, async (req, res, next) => {
    try {
      const q = req.query || {};
      const bucket = q.bucket != null ? String(q.bucket).trim() : "";
      const map = SUBMISSION_BUCKETS[bucket];
      if (!map) {
        return res.status(400).type("text").send("Invalid submissions drill-down bucket.");
      }
      const pool = getPgPool();
      const tid = getAdminTenantId(req);
      const filters = parseAnalyticsFilters(q);
      const pager = parsePagination(q);
      const obs = faAnalyticsObs.queryContext(req, "/admin/field-agent-analytics/drilldown/submissions", {
        bucket,
        ...filters,
        ...pager,
      });
      const effectiveStatus = filters.status || map.status || null;
      const decidedOnly = !effectiveStatus && Boolean(map.decidedOnly);
      const totalResults = await fieldAgentAnalyticsRepo.countSubmissionDrilldownRows(pool, tid, {
        from: filters.from,
        to: filters.to,
        fieldAgentId: filters.fieldAgentId,
        status: effectiveStatus,
        decidedOnly,
        q: filters.q,
        _obs: obs,
      });
      const totalPages = Math.max(Math.ceil(totalResults / pager.pageSize), 1);
      const page = Math.min(pager.page, totalPages);
      const offset = (page - 1) * pager.pageSize;
      const rows = await fieldAgentAnalyticsRepo.listSubmissionDrilldownRows(pool, tid, {
        from: filters.from,
        to: filters.to,
        fieldAgentId: filters.fieldAgentId,
        status: effectiveStatus,
        decidedOnly,
        q: filters.q,
        limit: pager.pageSize,
        offset,
        _obs: obs,
      });
      const agents = await fieldAgentAnalyticsRepo.listFieldAgentsForTenant(pool, tid, { _obs: obs });
      const presets = await analyticsPresetsRepo.listPresets(pool, tid, req.session.adminUser.id, "submissions");
      const hasActiveFilters =
        Boolean(filters.q) ||
        Boolean(filters.from) ||
        Boolean(filters.to) ||
        Boolean(filters.fieldAgentId) ||
        Boolean(filters.status);
      return res.render("admin/field_agent_analytics_drilldown_list", {
        title: map.title,
        kind: "submissions",
        bucket,
        rows,
        agents,
        filters: {
          q: filters.q,
          status: filters.status || "",
          from: filters.from || "",
          to: filters.to || "",
          agent: filters.fieldAgentId || "",
          page,
          page_size: pager.pageSize,
        },
        exportUrl: exportUrlFor("submissions", bucket, {
          q: filters.q,
          status: filters.status || "",
          from: filters.from || "",
          to: filters.to || "",
          agent: filters.fieldAgentId || "",
        }),
        exportGuard: {
          max_rows: EXPORT_MAX_ROWS,
          too_large: totalResults > EXPORT_MAX_ROWS,
        },
        bulkGuard: {
          max_ids: BULK_MAX_IDS,
        },
        pagination: {
          page,
          page_size: pager.pageSize,
          total_results: totalResults,
          total_pages: totalPages,
          has_prev: page > 1,
          has_next: page < totalPages,
        },
        presets: presets.map(serializePreset),
        hasActiveFilters,
      });
    } catch (e) {
      return next(e);
    }
  });

  router.get("/field-agent-analytics/drilldown/callback-leads", requireCrmAccess, async (req, res, next) => {
    try {
      const q = req.query || {};
      const bucket = q.bucket != null ? String(q.bucket).trim() : "";
      if (bucket !== "callback_leads") {
        return res.status(400).type("text").send("Invalid callback leads drill-down bucket.");
      }
      const pool = getPgPool();
      const tid = getAdminTenantId(req);
      const filters = parseAnalyticsFilters(q);
      const pager = parsePagination(q);
      const obs = faAnalyticsObs.queryContext(req, "/admin/field-agent-analytics/drilldown/callback-leads", {
        bucket,
        ...filters,
        ...pager,
      });
      const totalResults = await fieldAgentAnalyticsRepo.countCallbackLeadDrilldownRows(pool, tid, {
        from: filters.from,
        to: filters.to,
        fieldAgentId: filters.fieldAgentId,
        q: filters.q,
        _obs: obs,
      });
      const totalPages = Math.max(Math.ceil(totalResults / pager.pageSize), 1);
      const page = Math.min(pager.page, totalPages);
      const offset = (page - 1) * pager.pageSize;
      const rows = await fieldAgentAnalyticsRepo.listCallbackLeadDrilldownRows(pool, tid, {
        from: filters.from,
        to: filters.to,
        fieldAgentId: filters.fieldAgentId,
        q: filters.q,
        limit: pager.pageSize,
        offset,
        _obs: obs,
      });
      const agents = await fieldAgentAnalyticsRepo.listFieldAgentsForTenant(pool, tid, { _obs: obs });
      const presets = await analyticsPresetsRepo.listPresets(pool, tid, req.session.adminUser.id, "callback_leads");
      const hasActiveFilters =
        Boolean(filters.q) ||
        Boolean(filters.from) ||
        Boolean(filters.to) ||
        Boolean(filters.fieldAgentId);
      return res.render("admin/field_agent_analytics_drilldown_list", {
        title: "Callback leads",
        kind: "callback_leads",
        bucket: "callback_leads",
        rows,
        agents,
        filters: {
          q: filters.q,
          status: "",
          from: filters.from || "",
          to: filters.to || "",
          agent: filters.fieldAgentId || "",
          page,
          page_size: pager.pageSize,
        },
        exportUrl: exportUrlFor("callback_leads", "callback_leads", {
          q: filters.q,
          from: filters.from || "",
          to: filters.to || "",
          agent: filters.fieldAgentId || "",
        }),
        exportGuard: {
          max_rows: EXPORT_MAX_ROWS,
          too_large: totalResults > EXPORT_MAX_ROWS,
        },
        bulkGuard: {
          max_ids: BULK_MAX_IDS,
        },
        pagination: {
          page,
          page_size: pager.pageSize,
          total_results: totalResults,
          total_pages: totalPages,
          has_prev: page > 1,
          has_next: page < totalPages,
        },
        presets: presets.map(serializePreset),
        hasActiveFilters,
      });
    } catch (e) {
      return next(e);
    }
  });

  router.get("/field-agent-analytics/drilldown/submissions/:id/panel", requireCrmAccess, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id < 1) {
        return res.status(404).type("text").send("Not found.");
      }
      const pool = getPgPool();
      const tid = getAdminTenantId(req);
      const row = await fieldAgentAnalyticsRepo.getSubmissionDrilldownDetailById(
        pool,
        tid,
        id,
        faAnalyticsObs.queryContext(req, "/admin/field-agent-analytics/drilldown/submissions/:id/panel")
      );
      if (!row) {
        return res.status(404).type("text").send("Not found.");
      }
      const auditHistory = await fieldAgentSubmissionAuditRepo.listAuditBySubmission(pool, tid, id);
      return res.render("admin/field_agent_analytics_drilldown_submission_panel", {
        row,
        auditHistory,
        canCorrectSubmissions: canCorrectFieldAgentSubmissions(req.session.adminUser.role),
      });
    } catch (e) {
      return next(e);
    }
  });

  router.post("/field-agent-analytics/drilldown/submissions/:id/correct", requireSubmissionCorrection, async (req, res, next) => {
    try {
      const sid = Number(req.params.id);
      if (!Number.isFinite(sid) || sid < 1) {
        return res.status(400).json({ ok: false, error: "Invalid submission id." });
      }
      const body = req.body || {};
      const targetStatus = body.target_status != null ? String(body.target_status).trim() : "";
      const reason = body.reason != null ? String(body.reason).trim() : "";
      const commissionRaw = body.commission_amount;
      const commission =
        commissionRaw != null && String(commissionRaw).trim() !== "" && Number.isFinite(Number(commissionRaw))
          ? Number(commissionRaw)
          : 0;
      if (!reason) {
        return res.status(400).json({ ok: false, error: "Correction reason is required." });
      }
      const pool = getPgPool();
      const tid = getAdminTenantId(req);
      const result = await fieldAgentSubmissionsRepo.correctFieldAgentSubmissionStatus(pool, {
        tenantId: tid,
        submissionId: sid,
        adminUserId: req.session.adminUser.id,
        targetStatus,
        correctionReason: reason,
        commissionAmount: commission,
        _obs: faAnalyticsObs.queryContext(req, "/admin/field-agent-analytics/drilldown/submissions/:id/correct", {
          target_status: targetStatus,
        }),
      });
      if (!result.ok) {
        return res.status(400).json({ ok: false, error: result.error || "Correction failed." });
      }
      return res.json({ ok: true });
    } catch (e) {
      return next(e);
    }
  });

  router.post("/field-agent-analytics/drilldown/submissions/bulk-action", requireCrmMutate, async (req, res, next) => {
    try {
      const body = req.body || {};
      const action = body.action != null ? String(body.action).trim() : "";
      const ids = Array.isArray(body.ids) ? body.ids : [];
      const reason = body.reason != null ? String(body.reason) : "";
      if (action === "reject" && String(reason || "").trim() === "") {
        return res.status(400).json({
          ok: false,
          action,
          error: "Rejection reason is required.",
          processed: 0,
          succeeded: 0,
          failed: 0,
          results: [],
        });
      }
      const pool = getPgPool();
      const tid = getAdminTenantId(req);
      const result = await fieldAgentSubmissionsRepo.applyBulkSubmissionAction(pool, {
        tenantId: tid,
        action,
        ids,
        rejectionReason: reason,
        commissionAmount: 0,
        maxIds: BULK_MAX_IDS,
        adminUserId: req.session.adminUser.id,
        _obs: faAnalyticsObs.queryContext(req, "/admin/field-agent-analytics/drilldown/submissions/bulk-action", {
          action,
          id_count: Array.isArray(ids) ? ids.length : 0,
        }),
      });
      if (!result.ok) {
        const tooMany = /Too many ids/i.test(String(result.error || ""));
        return res.status(tooMany ? 413 : 400).json(result);
      }
      return res.json(result);
    } catch (e) {
      return next(e);
    }
  });

  router.get("/field-agent-analytics/drilldown/submissions/export.csv", requireCrmAccess, async (req, res, next) => {
    try {
      const q = req.query || {};
      const bucket = q.bucket != null ? String(q.bucket).trim() : "";
      const map = SUBMISSION_BUCKETS[bucket];
      if (!map) return res.status(400).type("text").send("Invalid submissions drill-down bucket.");
      const pool = getPgPool();
      const tid = getAdminTenantId(req);
      const filters = parseAnalyticsFilters(q);
      const obs = faAnalyticsObs.queryContext(req, "/admin/field-agent-analytics/drilldown/submissions/export.csv", {
        bucket,
        ...filters,
      });
      const effectiveStatus = filters.status || map.status || null;
      const decidedOnly = !effectiveStatus && Boolean(map.decidedOnly);
      const totalResults = await fieldAgentAnalyticsRepo.countSubmissionDrilldownRows(pool, tid, {
        from: filters.from,
        to: filters.to,
        fieldAgentId: filters.fieldAgentId,
        status: effectiveStatus,
        decidedOnly,
        q: filters.q,
        _obs: obs,
      });
      if (totalResults > EXPORT_MAX_ROWS) {
        return res
          .status(413)
          .type("text")
          .send(`This export is too large to run safely (${totalResults} rows). Narrow your filters to ${EXPORT_MAX_ROWS} rows or fewer and try again.`);
      }
      const rows = await fieldAgentAnalyticsRepo.listSubmissionDrilldownRows(pool, tid, {
        from: filters.from,
        to: filters.to,
        fieldAgentId: filters.fieldAgentId,
        status: effectiveStatus,
        decidedOnly,
        q: filters.q,
        limit: EXPORT_MAX_ROWS,
        maxLimit: EXPORT_MAX_ROWS,
        _obs: obs,
      });
      const payload = rows.map((r) => [
        Number(r.id),
        toIso(r.created_at),
        toIso(r.updated_at),
        String(r.status || ""),
        String(r.field_agent_display_name || r.field_agent_username || ""),
        "",
        `${String(r.first_name || "")} ${String(r.last_name || "")}`.trim(),
        String(r.phone_raw || ""),
        String(r.whatsapp_raw || ""),
        String(r.profession || ""),
        Number(r.commission_amount || 0),
        String(r.rejection_reason || ""),
      ]);
      return csvResponse(
        res,
        `field-agent-submissions-${bucket || "export"}.csv`,
        [
          "id",
          "created_at",
          "updated_at",
          "status",
          "field_agent_name",
          "business_name",
          "contact_name",
          "phone",
          "whatsapp",
          "category_name",
          "commission_amount",
          "rejection_reason",
        ],
        payload
      );
    } catch (e) {
      return next(e);
    }
  });

  router.get("/field-agent-analytics/drilldown/callback-leads/export.csv", requireCrmAccess, async (req, res, next) => {
    try {
      const q = req.query || {};
      const bucket = q.bucket != null ? String(q.bucket).trim() : "";
      if (bucket !== "callback_leads") return res.status(400).type("text").send("Invalid callback leads drill-down bucket.");
      const pool = getPgPool();
      const tid = getAdminTenantId(req);
      const filters = parseAnalyticsFilters(q);
      const obs = faAnalyticsObs.queryContext(req, "/admin/field-agent-analytics/drilldown/callback-leads/export.csv", {
        bucket,
        ...filters,
      });
      const totalResults = await fieldAgentAnalyticsRepo.countCallbackLeadDrilldownRows(pool, tid, {
        from: filters.from,
        to: filters.to,
        fieldAgentId: filters.fieldAgentId,
        q: filters.q,
        _obs: obs,
      });
      if (totalResults > EXPORT_MAX_ROWS) {
        return res
          .status(413)
          .type("text")
          .send(`This export is too large to run safely (${totalResults} rows). Narrow your filters to ${EXPORT_MAX_ROWS} rows or fewer and try again.`);
      }
      const rows = await fieldAgentAnalyticsRepo.listCallbackLeadDrilldownRows(pool, tid, {
        from: filters.from,
        to: filters.to,
        fieldAgentId: filters.fieldAgentId,
        q: filters.q,
        limit: EXPORT_MAX_ROWS,
        maxLimit: EXPORT_MAX_ROWS,
        _obs: obs,
      });
      const payload = rows.map((r) => [
        Number(r.id),
        toIso(r.created_at),
        String(r.field_agent_display_name || r.field_agent_username || ""),
        `${String(r.first_name || "")} ${String(r.last_name || "")}`.trim(),
        String(r.phone || ""),
        String(r.email || ""),
        String(r.location_city || ""),
      ]);
      return csvResponse(
        res,
        "field-agent-callback-leads.csv",
        ["id", "created_at", "field_agent_name", "contact_name", "phone", "email", "city"],
        payload
      );
    } catch (e) {
      return next(e);
    }
  });

  router.get("/field-agent-analytics/drilldown/callback-leads/:id/panel", requireCrmAccess, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id < 1) {
        return res.status(404).type("text").send("Not found.");
      }
      const pool = getPgPool();
      const tid = getAdminTenantId(req);
      const row = await fieldAgentAnalyticsRepo.getCallbackLeadDrilldownDetailById(
        pool,
        tid,
        id,
        faAnalyticsObs.queryContext(req, "/admin/field-agent-analytics/drilldown/callback-leads/:id/panel")
      );
      if (!row) {
        return res.status(404).type("text").send("Not found.");
      }
      return res.render("admin/field_agent_analytics_drilldown_callback_lead_panel", {
        row,
      });
    } catch (e) {
      return next(e);
    }
  });

  router.get("/field-agent-analytics/presets", requireCrmAccess, async (req, res, next) => {
    try {
      const q = req.query || {};
      const recordType = String(q.record_type || "").trim();
      if (!PRESET_RECORD_TYPES.includes(recordType)) {
        return res.status(400).json({ ok: false, error: "Invalid record_type." });
      }
      const pool = getPgPool();
      const tid = getAdminTenantId(req);
      const rows = await analyticsPresetsRepo.listPresets(pool, tid, req.session.adminUser.id, recordType);
      return res.json({ ok: true, presets: rows.map(serializePreset) });
    } catch (e) {
      return next(e);
    }
  });

  router.get("/field-agent-analytics/reporting", requireCrmAccess, async (req, res, next) => {
    try {
      const pool = getPgPool();
      const tid = getAdminTenantId(req);
      const obs = faAnalyticsObs.queryContext(req, "/admin/field-agent-analytics/reporting");
      const sel = parseReportingSelection(req.query || {});
      const filters = parseAnalyticsFilters(req.query || {});
      const agents = await fieldAgentAnalyticsRepo.listFieldAgentsForTenant(pool, tid, { _obs: obs });
      const subPresets = await analyticsPresetsRepo.listPresets(pool, tid, req.session.adminUser.id, "submissions");
      const cbPresets = await analyticsPresetsRepo.listPresets(pool, tid, req.session.adminUser.id, "callback_leads");
      return res.render("admin/field_agent_analytics_reporting", {
        activeNav: "field_agent_analytics",
        datasets: reportingDatasets(),
        selected: sel,
        agents,
        filters: {
          q: filters.q || "",
          status: filters.status || "",
          from: filters.from || "",
          to: filters.to || "",
          agent: filters.fieldAgentId || "",
        },
        exportGuard: {
          max_rows: EXPORT_MAX_ROWS,
        },
        presets: [...subPresets.map(serializePreset), ...cbPresets.map(serializePreset)],
      });
    } catch (e) {
      return next(e);
    }
  });

  router.get("/field-agent-analytics/reporting/export", requireCrmAccess, async (req, res) => {
    const q = req.query || {};
    const sel = parseReportingSelection(q);
    const bucket = allowedBucketForRecordType(sel.recordType, q.bucket);
    if (!bucket) return res.status(400).type("text").send("Invalid dataset bucket.");
    const filters = parseAnalyticsFilters(q);
    const qs = new URLSearchParams();
    qs.set("bucket", bucket);
    if (filters.q) qs.set("q", filters.q);
    if (filters.from) qs.set("from", filters.from);
    if (filters.to) qs.set("to", filters.to);
    if (filters.fieldAgentId) qs.set("agent", String(filters.fieldAgentId));
    if (sel.recordType === "submissions" && filters.status) qs.set("status", filters.status);
    const target =
      sel.recordType === "callback_leads"
        ? `/admin/field-agent-analytics/drilldown/callback-leads/export.csv?${qs.toString()}`
        : `/admin/field-agent-analytics/drilldown/submissions/export.csv?${qs.toString()}`;
    return res.redirect(target);
  });

  router.post("/field-agent-analytics/presets", requireCrmAccess, async (req, res, next) => {
    try {
      const body = req.body || {};
      const name = body.name != null ? String(body.name).trim() : "";
      const recordType = body.record_type != null ? String(body.record_type).trim() : "";
      const bucketRaw = body.bucket != null ? String(body.bucket).trim() : "";
      const bucket = allowedBucketForRecordType(recordType, bucketRaw);
      if (!name) return res.status(400).json({ ok: false, error: "Preset name is required." });
      if (!PRESET_RECORD_TYPES.includes(recordType)) return res.status(400).json({ ok: false, error: "Invalid record_type." });
      if (!bucket) return res.status(400).json({ ok: false, error: "Invalid bucket." });
      const filters = sanitizePresetFilters(recordType, body.filters || {});
      const pool = getPgPool();
      const tid = getAdminTenantId(req);
      try {
        const row = await analyticsPresetsRepo.createPreset(pool, {
          tenantId: tid,
          adminUserId: req.session.adminUser.id,
          name,
          recordType,
          bucket,
          filtersJson: filters,
        });
        if (!row) return res.status(400).json({ ok: false, error: "Could not save preset." });
        return res.status(201).json({ ok: true, preset: serializePreset(row) });
      } catch (e) {
        if (String(e && e.code) === "23505") {
          return res.status(400).json({ ok: false, error: "A preset with this name already exists." });
        }
        throw e;
      }
    } catch (e) {
      return next(e);
    }
  });

  router.post("/field-agent-analytics/presets/:id", requireCrmAccess, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const name = req.body && req.body.name != null ? String(req.body.name).trim() : "";
      if (!Number.isFinite(id) || id < 1) return res.status(400).json({ ok: false, error: "Invalid id." });
      if (!name) return res.status(400).json({ ok: false, error: "Preset name is required." });
      const pool = getPgPool();
      const tid = getAdminTenantId(req);
      try {
        const row = await analyticsPresetsRepo.updatePresetName(pool, {
          tenantId: tid,
          adminUserId: req.session.adminUser.id,
          presetId: id,
          name,
        });
        if (!row) return res.status(404).json({ ok: false, error: "Preset not found." });
        return res.json({ ok: true, preset: serializePreset(row) });
      } catch (e) {
        if (String(e && e.code) === "23505") {
          return res.status(400).json({ ok: false, error: "A preset with this name already exists." });
        }
        throw e;
      }
    } catch (e) {
      return next(e);
    }
  });

  router.post("/field-agent-analytics/presets/:id/delete", requireCrmAccess, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id < 1) return res.status(400).json({ ok: false, error: "Invalid id." });
      const pool = getPgPool();
      const tid = getAdminTenantId(req);
      const ok = await analyticsPresetsRepo.deletePreset(pool, {
        tenantId: tid,
        adminUserId: req.session.adminUser.id,
        presetId: id,
      });
      if (!ok) return res.status(404).json({ ok: false, error: "Preset not found." });
      return res.json({ ok: true });
    } catch (e) {
      return next(e);
    }
  });
  router.use("/field-agent-analytics", faAnalyticsObs.errorMiddleware());
};
