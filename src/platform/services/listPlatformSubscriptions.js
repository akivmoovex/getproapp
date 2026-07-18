"use strict";

/**
 * Read-only platform-admin subscription directory.
 * Uses live organization_subscriptions only — no billing, invoices, or payments.
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
const ORG_KEY_PREFIX_RE = /^[a-z][a-z0-9_-]{0,63}$/;
const ALLOWED_STATUSES = Object.freeze([
  "active",
  "trialing",
  "past_due",
  "canceled",
  "expired",
  "inactive",
]);

/**
 * @param {object} row
 */
function mapRow(row) {
  if (!row) return null;
  return {
    organizationKey: String(row.organization_key || ""),
    organizationDisplayName: String(row.organization_display_name || ""),
    organizationStatus: String(row.organization_status || ""),
    productKey: String(row.product_key || ""),
    subscriptionStatus: String(row.subscription_status || ""),
    startsAt: row.starts_at ? new Date(row.starts_at).toISOString() : null,
    endsAt: row.ends_at ? new Date(row.ends_at).toISOString() : null,
    notes: row.notes != null ? String(row.notes) : null,
    planKey: String(row.plan_key || ""),
    planDisplayName: String(row.plan_display_name || ""),
    planStatus: String(row.plan_status || ""),
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

  let keyPrefix = null;
  if (raw.q != null && String(raw.q).trim() !== "") {
    const q = String(raw.q).trim().toLowerCase();
    if (!ORG_KEY_PREFIX_RE.test(q)) {
      return { ok: false, reason: "q" };
    }
    keyPrefix = q;
  }

  let status = null;
  if (raw.status != null && String(raw.status).trim() !== "") {
    const s = String(raw.status).trim().toLowerCase();
    if (!ALLOWED_STATUSES.includes(s)) {
      return { ok: false, reason: "status" };
    }
    status = s;
  }

  return {
    ok: true,
    value: {
      page,
      limit,
      keyPrefix,
      status,
      productKey: PRODUCT_KEY_DEFAULT,
    },
  };
}

/**
 * @param {{ query: Function }} db
 * @param {object} [input]
 */
async function listPlatformSubscriptions(db, input) {
  const normalized = normalizeListInput(input);
  if (!normalized.ok) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      subscriptions: [],
      page: 1,
      limit: DEFAULT_LIMIT,
      total: 0,
      totalPages: 0,
      keyPrefix: "",
      statusFilter: "",
    };
  }
  if (!db || typeof db.query !== "function") {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      subscriptions: [],
      page: normalized.value.page,
      limit: normalized.value.limit,
      total: 0,
      totalPages: 0,
      keyPrefix: normalized.value.keyPrefix || "",
      statusFilter: normalized.value.status || "",
    };
  }

  const { page, limit, keyPrefix, status, productKey } = normalized.value;
  const offset = (page - 1) * limit;
  try {
    const [rows, total] = await Promise.all([
      repo.listSubscriptionsDirectoryPage(db, {
        limit,
        offset,
        keyPrefix,
        status,
        productKey,
      }),
      repo.countSubscriptionsDirectory(db, { keyPrefix, status, productKey }),
    ]);
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    return {
      ok: true,
      status: STATUS.OK,
      subscriptions: (rows || []).map(mapRow).filter(Boolean),
      page,
      limit,
      total,
      totalPages,
      keyPrefix: keyPrefix || "",
      statusFilter: status || "",
    };
  } catch {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      subscriptions: [],
      page,
      limit,
      total: 0,
      totalPages: 0,
      keyPrefix: keyPrefix || "",
      statusFilter: status || "",
    };
  }
}

module.exports = {
  STATUS,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  ALLOWED_LIMITS,
  ALLOWED_STATUSES,
  normalizeListInput,
  mapRow,
  listPlatformSubscriptions,
};
