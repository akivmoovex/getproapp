"use strict";

/**
 * Read-only platform organization directory listing with bounded pagination.
 * Optional allowlisted filters for BlessBoard onboarding ops (same canonical route).
 * No process.env. No writes.
 */

const repo = require("../repositories/platformAdminRepository");
const {
  derivePublicationStatus,
} = require("../../blessboard/services/organizationOnboardingSummaryService");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  LOOKUP_ERROR: "lookup_error",
});

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const ALLOWED_LIMITS = Object.freeze([10, 25, 50, 100]);
const ORG_KEY_PREFIX_RE = /^[a-z][a-z0-9_-]{0,63}$/;

const ALLOWED_PRODUCTS = Object.freeze(["blessboard"]);
const ALLOWED_ONBOARDING = Object.freeze(["incomplete"]);
const ALLOWED_FOLLOW_UP = Object.freeze([
  "new",
  "call_pending",
  "contacted",
  "needs_help",
  "self_onboarding",
  "completed",
  "unreachable",
  "not_interested",
]);
const ALLOWED_PUBLICATION = Object.freeze(["unpublished"]);
const ALLOWED_PLANS = Object.freeze(["free", "growth", "network"]);

/**
 * Compact DTO for platform-admin HTML — keys and labels only.
 * @param {object} row
 */
function mapRow(row) {
  if (!row) return null;
  const publishedPages = Number(row.published_pages) || 0;
  const draftPages = Number(row.draft_pages) || 0;
  const hasChurch = row.church_key != null;
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
    onboardingStatus: row.onboarding_status != null ? String(row.onboarding_status) : null,
    followUpStatus: row.follow_up_status != null ? String(row.follow_up_status) : null,
    supportRequested: Boolean(row.support_requested),
    nextFollowUpAt: row.next_follow_up_at || null,
    planKey: row.plan_key != null ? String(row.plan_key) : null,
    publicationStatus: hasChurch
      ? derivePublicationStatus({ draftPages, publishedPages })
      : null,
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
    // Prefix search on indexed organization_key only (no display-name scan).
    if (!ORG_KEY_PREFIX_RE.test(q)) {
      return { ok: false, reason: "q" };
    }
    keyPrefix = q;
  }

  let product = null;
  const productRaw = String(raw.product || "")
    .trim()
    .toLowerCase();
  if (productRaw) {
    if (!ALLOWED_PRODUCTS.includes(productRaw)) {
      return { ok: false, reason: "product" };
    }
    product = productRaw;
  }

  let onboarding = null;
  const onboardingRaw = String(raw.onboarding || "")
    .trim()
    .toLowerCase();
  if (onboardingRaw) {
    if (!ALLOWED_ONBOARDING.includes(onboardingRaw)) {
      return { ok: false, reason: "onboarding" };
    }
    onboarding = onboardingRaw;
  }

  let followUp = null;
  const followRaw = String(raw.follow_up || raw.followUp || "")
    .trim()
    .toLowerCase();
  if (followRaw) {
    if (!ALLOWED_FOLLOW_UP.includes(followRaw)) {
      return { ok: false, reason: "follow_up" };
    }
    followUp = followRaw;
  }

  let supportRequested = null;
  const supportRaw = String(raw.support_requested || raw.supportRequested || "")
    .trim()
    .toLowerCase();
  if (supportRaw) {
    if (supportRaw === "true" || supportRaw === "1") supportRequested = true;
    else if (supportRaw === "false" || supportRaw === "0") supportRequested = false;
    else return { ok: false, reason: "support_requested" };
  }

  let publication = null;
  const pubRaw = String(raw.publication || "")
    .trim()
    .toLowerCase();
  if (pubRaw) {
    if (!ALLOWED_PUBLICATION.includes(pubRaw)) {
      return { ok: false, reason: "publication" };
    }
    publication = pubRaw;
  }

  let plan = null;
  const planRaw = String(raw.plan || "")
    .trim()
    .toLowerCase();
  if (planRaw) {
    if (!ALLOWED_PLANS.includes(planRaw)) {
      return { ok: false, reason: "plan" };
    }
    plan = planRaw;
  }

  return {
    ok: true,
    value: {
      page,
      limit,
      offset: (page - 1) * limit,
      keyPrefix,
      product,
      onboarding,
      followUp,
      supportRequested,
      publication,
      plan,
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
      filters: {},
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
      filters: {},
    };
  }

  try {
    const {
      page,
      limit,
      offset,
      keyPrefix,
      product,
      onboarding,
      followUp,
      supportRequested,
      publication,
      plan,
    } = normalized.value;
    const listOpts = {
      limit,
      offset,
      keyPrefix,
      product,
      onboarding,
      followUp,
      supportRequested: supportRequested === true ? true : null,
      publication,
      plan,
    };
    const [rows, total] = await Promise.all([
      repo.listOrganizationDirectoryPage(db, listOpts),
      repo.countOrganizationDirectory(db, listOpts),
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
      filters: {
        product: product || "",
        onboarding: onboarding || "",
        follow_up: followUp || "",
        support_requested: supportRequested === true ? "true" : "",
        publication: publication || "",
        plan: plan || "",
        q: keyPrefix || "",
      },
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
      filters: {},
    };
  }
}

/**
 * Live dashboard totals only — organizations and churches already provisioned.
 * @param {{ query: Function }} db
 */
async function getPlatformAdminDashboardStats(db) {
  if (!db || typeof db.query !== "function") {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      stats: null,
      reason: "database required",
    };
  }
  try {
    const stats = await repo.countOrganizationDirectoryStats(db);
    return { ok: true, status: STATUS.OK, stats };
  } catch {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      stats: null,
      reason: "lookup_error",
    };
  }
}

module.exports = {
  STATUS,
  DEFAULT_LIMIT,
  MAX_LIMIT,
  ALLOWED_LIMITS,
  ALLOWED_PRODUCTS,
  ALLOWED_ONBOARDING,
  ALLOWED_FOLLOW_UP,
  ALLOWED_PUBLICATION,
  ALLOWED_PLANS,
  normalizeListInput,
  mapRow,
  listPlatformOrganizations,
  getPlatformAdminDashboardStats,
};
