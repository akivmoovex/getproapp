"use strict";

/**
 * Read-only platform-admin domains directory.
 * Live platform.domains rows only — no DNS lookup, certificates, or verification automation.
 */

const repo = require("../repositories/platformAdminRepository");
const { PRODUCT_KEY_DEFAULT } = require("./entitlementService");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  LOOKUP_ERROR: "lookup_error",
});

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const ALLOWED_LIMITS = Object.freeze([10, 25, 50, 100]);
const ALLOWED_STATUSES = Object.freeze(["active", "inactive"]);
const ALLOWED_DOMAIN_TYPES = Object.freeze(["apex", "canonical", "custom", "alias"]);
const ORG_KEY_PREFIX_RE = /^[a-z][a-z0-9_-]{0,63}$/;
const HOSTNAME_PREFIX_RE = /^[a-z0-9][a-z0-9._-]{0,252}$/;

/**
 * @param {object} row
 */
function mapRow(row) {
  if (!row) return null;
  return {
    hostname: String(row.hostname || ""),
    domainType: String(row.domain_type || ""),
    status: String(row.status || ""),
    isPrimary: Boolean(row.is_primary),
    isVerified: Boolean(row.is_verified),
    deploymentCode: String(row.deployment_code || ""),
    productKey: String(row.product_key || ""),
    productDisplayName: String(row.product_display_name || ""),
    organizationKey: row.organization_key != null ? String(row.organization_key) : null,
    organizationDisplayName:
      row.organization_display_name != null ? String(row.organization_display_name) : null,
    organizationStatus: row.organization_status != null ? String(row.organization_status) : null,
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
  if (limit > MAX_LIMIT) {
    limit = MAX_LIMIT;
  } else if (!ALLOWED_LIMITS.includes(limit)) {
    let best = ALLOWED_LIMITS[0];
    let bestDist = Math.abs(limit - best);
    for (const allowed of ALLOWED_LIMITS) {
      const dist = Math.abs(limit - allowed);
      if (dist < bestDist) {
        best = allowed;
        bestDist = dist;
      }
    }
    limit = best;
  }

  let hostnamePrefix = null;
  if (raw.q != null && String(raw.q).trim() !== "") {
    const q = String(raw.q).trim().toLowerCase();
    if (!HOSTNAME_PREFIX_RE.test(q)) {
      return { ok: false, reason: "q" };
    }
    hostnamePrefix = q;
  }

  let orgKeyPrefix = null;
  if (raw.org != null && String(raw.org).trim() !== "") {
    const org = String(raw.org).trim().toLowerCase();
    if (!ORG_KEY_PREFIX_RE.test(org)) {
      return { ok: false, reason: "org" };
    }
    orgKeyPrefix = org;
  }

  let status = null;
  if (raw.status != null && String(raw.status).trim() !== "") {
    const s = String(raw.status).trim().toLowerCase();
    if (!ALLOWED_STATUSES.includes(s)) {
      return { ok: false, reason: "status" };
    }
    status = s;
  }

  let domainType = null;
  if (raw.type != null && String(raw.type).trim() !== "") {
    const t = String(raw.type).trim().toLowerCase();
    if (!ALLOWED_DOMAIN_TYPES.includes(t)) {
      return { ok: false, reason: "type" };
    }
    domainType = t;
  }

  let verified = null;
  if (raw.verified != null && String(raw.verified).trim() !== "") {
    const v = String(raw.verified).trim().toLowerCase();
    if (v === "1" || v === "yes" || v === "true" || v === "verified") {
      verified = true;
    } else if (v === "0" || v === "no" || v === "false" || v === "unverified") {
      verified = false;
    } else {
      return { ok: false, reason: "verified" };
    }
  }

  return {
    ok: true,
    value: {
      page,
      limit,
      hostnamePrefix,
      orgKeyPrefix,
      status,
      domainType,
      verified,
      productKey: PRODUCT_KEY_DEFAULT,
    },
  };
}

/**
 * @param {{ query: Function }} db
 * @param {object} [input]
 */
async function listPlatformDomains(db, input) {
  const normalized = normalizeListInput(input);
  if (!normalized.ok) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      domains: [],
      page: 1,
      limit: DEFAULT_LIMIT,
      total: 0,
      totalPages: 0,
      hostnamePrefix: "",
      orgKeyPrefix: "",
      statusFilter: "",
      typeFilter: "",
      verifiedFilter: "",
    };
  }
  if (!db || typeof db.query !== "function") {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      domains: [],
      page: normalized.value.page,
      limit: normalized.value.limit,
      total: 0,
      totalPages: 0,
      hostnamePrefix: normalized.value.hostnamePrefix || "",
      orgKeyPrefix: normalized.value.orgKeyPrefix || "",
      statusFilter: normalized.value.status || "",
      typeFilter: normalized.value.domainType || "",
      verifiedFilter:
        normalized.value.verified == null ? "" : normalized.value.verified ? "yes" : "no",
    };
  }

  const {
    page,
    limit,
    hostnamePrefix,
    orgKeyPrefix,
    status,
    domainType,
    verified,
    productKey,
  } = normalized.value;
  const offset = (page - 1) * limit;
  try {
    const [rows, total] = await Promise.all([
      repo.listDomainsDirectoryPage(db, {
        limit,
        offset,
        hostnamePrefix,
        orgKeyPrefix,
        status,
        domainType,
        verified,
        productKey,
      }),
      repo.countDomainsDirectory(db, {
        hostnamePrefix,
        orgKeyPrefix,
        status,
        domainType,
        verified,
        productKey,
      }),
    ]);
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    return {
      ok: true,
      status: STATUS.OK,
      domains: (rows || []).map(mapRow).filter(Boolean),
      page,
      limit,
      total,
      totalPages,
      hostnamePrefix: hostnamePrefix || "",
      orgKeyPrefix: orgKeyPrefix || "",
      statusFilter: status || "",
      typeFilter: domainType || "",
      verifiedFilter: verified == null ? "" : verified ? "yes" : "no",
    };
  } catch {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      domains: [],
      page,
      limit,
      total: 0,
      totalPages: 0,
      hostnamePrefix: hostnamePrefix || "",
      orgKeyPrefix: orgKeyPrefix || "",
      statusFilter: status || "",
      typeFilter: domainType || "",
      verifiedFilter: verified == null ? "" : verified ? "yes" : "no",
    };
  }
}

module.exports = {
  STATUS,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  ALLOWED_LIMITS,
  ALLOWED_STATUSES,
  ALLOWED_DOMAIN_TYPES,
  normalizeListInput,
  mapRow,
  listPlatformDomains,
};
