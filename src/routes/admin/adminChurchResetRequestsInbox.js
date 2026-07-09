"use strict";

const { requireSuperAdmin } = require("../../auth");
const { getPgPool } = require("../../db/pg");
const platformResetRequestsInboxRepo = require("../../db/pg/church/platformResetRequestsInboxRepo");
const {
  REQUEST_TYPES,
  RESET_STATUSES,
  passwordResetStatusLabel,
  requestTypeLabel,
  parseResetInboxFilters,
} = require("../../church/platformResetRequestsInboxValidation");

function formatDate(value) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toISOString().slice(0, 10);
}

function formatDateTime(value) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", { hour12: false });
}

function buildInboxQueryString(filters) {
  const params = new URLSearchParams();
  if (filters.request_type && filters.request_type !== "all") {
    params.set("request_type", filters.request_type);
  }
  if (filters.status && filters.status !== "all") {
    params.set("status", filters.status);
  }
  if (filters.organization_id) params.set("organization_id", String(filters.organization_id));
  if (filters.branch_id) params.set("branch_id", String(filters.branch_id));
  if (filters.date_from) params.set("date_from", filters.date_from);
  if (filters.date_to) params.set("date_to", filters.date_to);
  if (filters.q) params.set("q", filters.q);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  if (filters.limit && filters.limit !== 50) params.set("limit", String(filters.limit));
  const qs = params.toString();
  return qs ? `/admin/church/reset-requests?${qs}` : "/admin/church/reset-requests";
}

module.exports = function registerAdminChurchResetRequestsInboxRoutes(router) {
  router.get("/church/reset-requests", requireSuperAdmin, async (req, res, next) => {
    try {
      const parsed = parseResetInboxFilters(req.query);
      const pool = getPgPool();
      const filters = parsed.ok
        ? parsed.data
        : {
            request_type: "all",
            status: "all",
            organization_id: null,
            branch_id: null,
            date_from: null,
            date_to: null,
            q: "",
            page: 1,
            limit: 50,
          };

      const [summary, results] = await Promise.all([
        platformResetRequestsInboxRepo.getUnifiedResetRequestSummary(pool),
        platformResetRequestsInboxRepo.listUnifiedResetRequests(pool, filters),
      ]);

      return res.render("admin/church/reset_requests_inbox", {
        summary,
        results,
        filters,
        validationErrors: parsed.ok ? [] : parsed.errors,
        requestTypes: REQUEST_TYPES,
        resetStatuses: RESET_STATUSES,
        passwordResetStatusLabel,
        requestTypeLabel,
        formatDate,
        formatDateTime,
        buildInboxQueryString,
        activeNav: "church_platform_reset_requests",
      });
    } catch (e) {
      return next(e);
    }
  });
};
