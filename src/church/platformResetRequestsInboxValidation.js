"use strict";

const REQUEST_TYPES = ["all", "member", "branch_admin", "hq_admin"];
const RESET_STATUSES = ["all", "submitted", "reviewed", "reset_completed", "rejected"];
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const DEFAULT_PAGE = 1;

function parseOptionalDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return { ok: true, value: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { ok: false, error: "Date must be YYYY-MM-DD." };
  }
  const d = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(d.getTime())) {
    return { ok: false, error: "Invalid date." };
  }
  return { ok: true, value: raw };
}

function parseOptionalPositiveInt(value) {
  const raw = String(value || "").trim();
  if (!raw) return { ok: true, value: null };
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, error: "ID must be a positive integer." };
  }
  return { ok: true, value: Math.floor(n) };
}

function passwordResetStatusLabel(status) {
  const map = {
    submitted: "Submitted",
    reviewed: "Reviewed",
    reset_completed: "Reset completed",
    rejected: "Rejected",
  };
  return map[String(status || "")] || String(status || "");
}

function requestTypeLabel(requestType) {
  const map = {
    member: "Member",
    branch_admin: "Branch Admin",
    hq_admin: "HQ Admin",
  };
  return map[String(requestType || "")] || String(requestType || "");
}

function parseResetInboxFilters(query) {
  const errors = [];
  const requestType = String((query && query.request_type) || "all")
    .trim()
    .toLowerCase();
  const status = String((query && query.status) || "all")
    .trim()
    .toLowerCase();

  if (!REQUEST_TYPES.includes(requestType)) {
    errors.push("Invalid request type filter.");
  }
  if (!RESET_STATUSES.includes(status)) {
    errors.push("Invalid status filter.");
  }

  const orgParsed = parseOptionalPositiveInt(query && query.organization_id);
  if (!orgParsed.ok) errors.push(orgParsed.error);
  const branchParsed = parseOptionalPositiveInt(query && query.branch_id);
  if (!branchParsed.ok) errors.push(branchParsed.error);

  const dateFromParsed = parseOptionalDate(query && query.date_from);
  if (!dateFromParsed.ok) errors.push(dateFromParsed.error);
  const dateToParsed = parseOptionalDate(query && query.date_to);
  if (!dateToParsed.ok) errors.push(dateToParsed.error);

  const q = String((query && query.q) || "").trim().slice(0, 100);
  const page = Math.max(Number(query && query.page) || DEFAULT_PAGE, 1);
  let limit = Number(query && query.limit) || DEFAULT_LIMIT;
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  if (errors.length) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      request_type: requestType,
      status,
      organization_id: orgParsed.value,
      branch_id: branchParsed.value,
      date_from: dateFromParsed.value,
      date_to: dateToParsed.value,
      q,
      page: Math.floor(page),
      limit: Math.floor(limit),
    },
  };
}

module.exports = {
  REQUEST_TYPES,
  RESET_STATUSES,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  passwordResetStatusLabel,
  requestTypeLabel,
  parseResetInboxFilters,
};
