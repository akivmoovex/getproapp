"use strict";

const { getPgPool } = require("../../db/pg");
const branchResetRequestsInboxRepo = require("../../db/pg/church/branchResetRequestsInboxRepo");
const { requireChurchBranchAdminSession } = require("../../church/branchAdminAuth");
const {
  REQUEST_TYPES,
  RESET_STATUSES,
  passwordResetStatusLabel,
  requestTypeLabel,
  parseBranchResetInboxFilters,
} = require("../../church/branchResetRequestsInboxValidation");
const {
  getResetRequestStatusLabel,
  getResetRequestStatusClass,
  getResetRequestTypeLabel,
  getResetRequestTypeClass,
} = require("../../church/resetRequestFormatting");
const { requireChurchBranchHost } = require("./auth");
const { branchAdminLocals } = require("./branchAdminShared");

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
  if (filters.date_from) params.set("date_from", filters.date_from);
  if (filters.date_to) params.set("date_to", filters.date_to);
  if (filters.q) params.set("q", filters.q);
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  if (filters.limit && filters.limit !== 50) params.set("limit", String(filters.limit));
  const qs = params.toString();
  return qs ? `/branch/reset-requests?${qs}` : "/branch/reset-requests";
}

module.exports = function registerBranchAdminResetRequestsInboxRoutes(router) {
  router.get(
    "/branch/reset-requests",
    requireChurchBranchHost,
    requireChurchBranchAdminSession,
    async (req, res, next) => {
      try {
        const parsed = parseBranchResetInboxFilters(req.query);
        const org = req.churchContext.organization;
        const branch = req.churchContext.branch;
        const pool = getPgPool();

        const filters = parsed.ok
          ? {
              ...parsed.data,
              organization_id: org.id,
              branch_id: branch.id,
            }
          : {
              request_type: "all",
              status: "all",
              date_from: null,
              date_to: null,
              q: "",
              page: 1,
              limit: 50,
              organization_id: org.id,
              branch_id: branch.id,
            };

        const [summary, results] = await Promise.all([
          branchResetRequestsInboxRepo.getUnifiedBranchResetRequestSummary(pool, org.id, branch.id),
          branchResetRequestsInboxRepo.listUnifiedBranchResetRequests(pool, filters),
        ]);

        return res.render(
          "church/branch-admin/reset_requests_inbox",
          branchAdminLocals(req, {
            summary,
            results,
            filters,
            validationErrors: parsed.ok ? [] : parsed.errors,
            requestTypes: REQUEST_TYPES,
            resetStatuses: RESET_STATUSES,
            passwordResetStatusLabel,
            requestTypeLabel,
            getResetRequestStatusLabel,
            getResetRequestStatusClass,
            getResetRequestTypeLabel,
            getResetRequestTypeClass,
            formatDate,
            formatDateTime,
            buildInboxQueryString,
          })
        );
      } catch (e) {
        return next(e);
      }
    }
  );
};
