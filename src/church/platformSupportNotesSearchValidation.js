"use strict";

const ENTITY_TYPES = ["all", "organization", "branch", "hq_admin", "branch_admin", "member", "ministry_leader"];
const FILTER_ENTITY_TYPES = ["organization", "branch", "hq_admin", "branch_admin", "member", "ministry_leader"];

const MIN_QUERY_LENGTH = 2;
const MAX_QUERY_LENGTH = 100;
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

function parseSupportNotesSearchQuery(query) {
  const q = String(query.q || "")
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
  const entityType = String(query.entity_type || "all")
    .trim()
    .toLowerCase();
  const orgParsed = parseOptionalPositiveInt(query.organization_id);
  const branchParsed = parseOptionalPositiveInt(query.branch_id);
  const adminParsed = parseOptionalPositiveInt(query.created_by_platform_admin_id);
  const dateFromParsed = parseOptionalDate(query.date_from);
  const dateToParsed = parseOptionalDate(query.date_to);

  let page = parseInt(String(query.page || DEFAULT_PAGE), 10);
  if (!Number.isFinite(page) || page < 1) page = DEFAULT_PAGE;

  let limit = parseInt(String(query.limit || DEFAULT_LIMIT), 10);
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  const errors = [];

  if (q && q.length < MIN_QUERY_LENGTH) {
    errors.push(`Search query must be at least ${MIN_QUERY_LENGTH} characters.`);
  }
  if (!ENTITY_TYPES.includes(entityType)) {
    errors.push("Invalid entity type filter.");
  }
  if (!orgParsed.ok) errors.push(orgParsed.error);
  if (!branchParsed.ok) errors.push(branchParsed.error);
  if (!adminParsed.ok) errors.push(adminParsed.error);
  if (!dateFromParsed.ok) errors.push(dateFromParsed.error);
  if (!dateToParsed.ok) errors.push(dateToParsed.error);

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
      data: null,
    };
  }

  return {
    ok: true,
    errors: [],
    data: {
      q,
      entity_type: entityType,
      organization_id: orgParsed.value,
      branch_id: branchParsed.value,
      created_by_platform_admin_id: adminParsed.value,
      date_from: dateFromParsed.value,
      date_to: dateToParsed.value,
      page,
      limit,
    },
  };
}

function shouldApplyQueryFilter(q) {
  return q.length >= MIN_QUERY_LENGTH;
}

module.exports = {
  ENTITY_TYPES,
  FILTER_ENTITY_TYPES,
  MIN_QUERY_LENGTH,
  MAX_QUERY_LENGTH,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  DEFAULT_PAGE,
  parseSupportNotesSearchQuery,
  shouldApplyQueryFilter,
};
