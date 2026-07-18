"use strict";

/**
 * Read-only platform organization directory listing with bounded pagination.
 * No process.env. No writes.
 */

const repo = require("../repositories/platformAdminRepository");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  LOOKUP_ERROR: "lookup_error",
});

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const ORG_KEY_PREFIX_RE = /^[a-z][a-z0-9_-]{0,63}$/;

/**
 * @param {object} row
 */
function mapRow(row) {
  if (!row) return null;
  return {
    organizationKey: String(row.organization_key || ""),
    displayName: String(row.display_name || ""),
    dataEnvironment: String(row.data_environment || ""),
    organizationStatus: String(row.organization_status || ""),
    enrolmentStatus: row.enrolment_status != null ? String(row.enrolment_status) : null,
    canonicalHostname: row.canonical_hostname != null ? String(row.canonical_hostname) : null,
    deploymentCode: row.deployment_code != null ? String(row.deployment_code) : null,
    churchKey: row.church_key != null ? String(row.church_key) : null,
    churchStatus: row.church_status != null ? String(row.church_status) : null,
    activeBranchCount: Number(row.active_branch_count) || 0,
  };
}

/**
 * @param {object} input
 */
function normalizeListInput(input) {
  const raw = input && typeof input === "object" ? input : {};
  let page = Number.parseInt(String(raw.page != null ? raw.page : "1"), 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  if (page > 10000) page = 10000;

  let limit = Number.parseInt(String(raw.limit != null ? raw.limit : String(DEFAULT_LIMIT)), 10);
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  let keyPrefix = null;
  if (raw.q != null && String(raw.q).trim() !== "") {
    const q = String(raw.q).trim().toLowerCase();
    // Prefix search on indexed organization_key only (no display-name scan).
    if (!ORG_KEY_PREFIX_RE.test(q)) {
      return { ok: false, reason: "q" };
    }
    keyPrefix = q;
  }

  return {
    ok: true,
    value: {
      page,
      limit,
      offset: (page - 1) * limit,
      keyPrefix,
    },
  };
}

/**
 * @param {{ query: Function }} db
 * @param {object} input
 */
async function listPlatformOrganizations(db, input) {
  const normalized = normalizeListInput(input);
  if (!normalized.ok) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      message: `invalid_input:${normalized.reason}`,
      organizations: [],
      page: 1,
      limit: DEFAULT_LIMIT,
      total: 0,
      totalPages: 0,
    };
  }
  if (!db || typeof db.query !== "function") {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      message: "database required",
      organizations: [],
      page: normalized.value.page,
      limit: normalized.value.limit,
      total: 0,
      totalPages: 0,
    };
  }

  try {
    const { page, limit, offset, keyPrefix } = normalized.value;
    const [rows, total] = await Promise.all([
      repo.listOrganizationDirectoryPage(db, { limit, offset, keyPrefix }),
      repo.countOrganizationDirectory(db, { keyPrefix }),
    ]);
    const organizations = rows.map(mapRow).filter(Boolean);
    const totalPages = total > 0 ? Math.ceil(total / limit) : 0;
    return {
      ok: true,
      status: STATUS.OK,
      message: STATUS.OK,
      organizations,
      page,
      limit,
      total,
      totalPages,
      keyPrefix,
    };
  } catch {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      message: "lookup_error",
      organizations: [],
      page: normalized.value.page,
      limit: normalized.value.limit,
      total: 0,
      totalPages: 0,
    };
  }
}

module.exports = {
  STATUS,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  normalizeListInput,
  mapRow,
  listPlatformOrganizations,
};
