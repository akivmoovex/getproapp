"use strict";

const SEARCH_TYPES = ["all", "organizations", "branches", "hq_admins", "branch_admins", "members", "ministry_leaders"];
const SEARCH_STATUSES = [
  "all",
  "active",
  "inactive",
  "suspended",
  "archived",
  "pending",
  "verified",
  "rejected",
];

const MIN_SEARCH_LENGTH = 2;
const MAX_QUERY_LENGTH = 100;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

function parseSupportSearchQuery(query) {
  const q = String(query.q || "")
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
  const type = String(query.type || "all")
    .trim()
    .toLowerCase();
  const status = String(query.status || "all")
    .trim()
    .toLowerCase();
  let limit = parseInt(String(query.limit || DEFAULT_LIMIT), 10);
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  const errors = [];
  if (!SEARCH_TYPES.includes(type)) {
    errors.push("Invalid search type.");
  }
  if (!SEARCH_STATUSES.includes(status)) {
    errors.push("Invalid status filter.");
  }

  if (errors.length > 0) {
    return { ok: false, errors, data: null };
  }

  return {
    ok: true,
    errors: [],
    data: { q, type, status, limit },
  };
}

function shouldRunSearch(q) {
  return q.length >= MIN_SEARCH_LENGTH;
}

module.exports = {
  SEARCH_TYPES,
  SEARCH_STATUSES,
  MIN_SEARCH_LENGTH,
  MAX_QUERY_LENGTH,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  parseSupportSearchQuery,
  shouldRunSearch,
};
