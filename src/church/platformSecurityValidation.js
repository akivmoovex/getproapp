"use strict";

const ACCOUNT_TYPES = ["all", "member", "branch_admin", "hq_admin", "ministry_leader"];
const FILTER_ACCOUNT_TYPES = ["member", "branch_admin", "hq_admin", "ministry_leader"];
const SUCCESS_FILTERS = ["all", "success", "failure"];
const FAILURE_REASONS = [
  "invalid_identifier",
  "invalid_password",
  "locked",
  "locked_after_failure",
  "account_status",
];

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

function parseSecurityFiltersQuery(query) {
  const accountType = String(query.account_type || "all")
    .trim()
    .toLowerCase();
  const success = String(query.success || "all")
    .trim()
    .toLowerCase();
  const failureReason = String(query.failure_reason || "")
    .trim()
    .toLowerCase()
    .slice(0, 50);
  const orgParsed = parseOptionalPositiveInt(query.organization_id);
  const branchParsed = parseOptionalPositiveInt(query.branch_id);
  const dateFromParsed = parseOptionalDate(query.date_from);
  const dateToParsed = parseOptionalDate(query.date_to);

  let page = parseInt(String(query.page || DEFAULT_PAGE), 10);
  if (!Number.isFinite(page) || page < 1) page = DEFAULT_PAGE;

  let limit = parseInt(String(query.limit || DEFAULT_LIMIT), 10);
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  const errors = [];
  if (!ACCOUNT_TYPES.includes(accountType)) {
    errors.push("Invalid account type filter.");
  }
  if (!SUCCESS_FILTERS.includes(success)) {
    errors.push("Invalid success filter.");
  }
  if (failureReason && !FAILURE_REASONS.includes(failureReason)) {
    errors.push("Invalid failure reason filter.");
  }
  if (!orgParsed.ok) errors.push(orgParsed.error);
  if (!branchParsed.ok) errors.push(branchParsed.error);
  if (!dateFromParsed.ok) errors.push(dateFromParsed.error);
  if (!dateToParsed.ok) errors.push(dateToParsed.error);

  if (errors.length > 0) {
    return { ok: false, errors, data: null };
  }

  return {
    ok: true,
    errors: [],
    data: {
      account_type: accountType,
      organization_id: orgParsed.value,
      branch_id: branchParsed.value,
      success,
      failure_reason: failureReason || null,
      date_from: dateFromParsed.value,
      date_to: dateToParsed.value,
      page,
      limit,
    },
  };
}

function validateUnlockAccountBody(body) {
  const accountType = String((body && body.account_type) || "")
    .trim()
    .toLowerCase();
  const accountIdRaw = String((body && body.account_id) || "").trim();
  const reason = String((body && body.reason) || "")
    .trim()
    .slice(0, 500);

  const errors = [];
  if (!FILTER_ACCOUNT_TYPES.includes(accountType)) {
    errors.push("Account type is required.");
  }
  const accountId = Number(accountIdRaw);
  if (!Number.isFinite(accountId) || accountId <= 0) {
    errors.push("Account ID is required.");
  }

  if (errors.length > 0) {
    return { ok: false, errors, data: null };
  }

  return {
    ok: true,
    errors: [],
    data: {
      account_type: accountType,
      account_id: Math.floor(accountId),
      reason: reason || null,
    },
  };
}

module.exports = {
  ACCOUNT_TYPES,
  FILTER_ACCOUNT_TYPES,
  SUCCESS_FILTERS,
  FAILURE_REASONS,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  parseSecurityFiltersQuery,
  validateUnlockAccountBody,
};
