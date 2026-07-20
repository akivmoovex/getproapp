"use strict";

/**
 * Platform-admin organization entitlements / domains view + confirmed writes.
 * Resolves organizations by organization_key; UUIDs stay server-side only.
 * Plan changes never delete branches/users. No billing or DNS automation.
 */

const platformRepo = require("../repositories/platformAdminRepository");
const entitlementRepo = require("../repositories/entitlementRepository");
const { findOrganizationByKey } = require("../repositories/platformProvisioningRepository");
const {
  STATUS: ENTITLEMENT_STATUS,
  FEATURE_KEYS,
  PRODUCT_KEY_DEFAULT,
  resolveOrganizationEntitlements,
  assignOrganizationPlan,
  setOrganizationEntitlementOverride,
  getLimit,
  hasFeature,
} = require("./entitlementService");
const { listPlatformPlansCatalogue } = require("./listPlatformPlansCatalogue");
const { dbPlanDisplayLabel } = require("../../blessboard/services/registrationPlanMapping");
const { presentSubscriptionTiming } = require("./presentSubscriptionTiming");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  LOOKUP_ERROR: "lookup_error",
  CONFIRMATION_REQUIRED: "confirmation_required",
  FORBIDDEN: "forbidden",
  LIMIT_EXCEEDED: "limit_exceeded",
});

const ORG_KEY_RE = /^[a-z][a-z0-9_-]{0,63}$/;

const FEATURE_KEY_SET = new Set(Object.values(FEATURE_KEYS));

/**
 * @param {string} featureKey
 */
function inferFeatureKind(featureKey) {
  const key = String(featureKey || "").trim().toLowerCase();
  if (key.startsWith("max_")) return "limit";
  return "boolean";
}

/**
 * @param {object} entitlements
 */
function presentEntitlements(entitlements) {
  if (!entitlements) {
    return {
      planKey: null,
      planDisplayName: null,
      subscriptionActive: false,
      subscriptionStatus: null,
      subscriptionStartsAt: null,
      subscriptionEndsAt: null,
      reason: "unavailable",
      features: [],
      planInherited: [],
      overrides: [],
    };
  }
  const plan = entitlements.plan || null;
  const subscription = entitlements.subscription || null;
  const featureRows = [];
  const features = entitlements.features || {};
  for (const key of Object.keys(features).sort()) {
    const f = features[key];
    featureRows.push({
      featureKey: f.featureKey,
      featureKind: f.featureKind,
      booleanValue: f.booleanValue == null ? null : Boolean(f.booleanValue),
      limitValue: f.limitValue == null ? null : Number(f.limitValue),
      source: f.source || "plan",
      reason: f.reason != null ? String(f.reason) : null,
    });
  }
  const overrides = featureRows.filter((f) => f.source === "override");
  const planInherited = featureRows.filter((f) => f.source !== "override");
  const planKey = entitlements.planKey || (plan && plan.planKey) || null;
  const subscriptionStatus = subscription && subscription.status ? String(subscription.status) : null;
  const timing = presentSubscriptionTiming({
    status: subscriptionStatus,
    planKey,
    endsAt: subscription && subscription.endsAt,
    startsAt: subscription && subscription.startsAt,
  });
  return {
    planKey,
    planDisplayName:
      (planKey && dbPlanDisplayLabel(planKey)) ||
      (plan && plan.displayName ? String(plan.displayName) : null),
    subscriptionActive: Boolean(entitlements.subscriptionActive),
    subscriptionStatus,
    subscriptionStatusLabel: timing.statusLabel,
    subscriptionStartsAt: timing.startsAt,
    subscriptionEndsAt: timing.endsAt,
    subscriptionTimingKind: timing.timingKind,
    subscriptionTimingLabel: timing.timingLabel,
    graceDeadline: timing.timingKind === "grace" ? timing.timingEndsAt : null,
    trialEndsAt: timing.timingKind === "trial" ? timing.timingEndsAt : null,
    entitlementState: timing.entitlementState,
    reason: entitlements.reason || null,
    features: featureRows,
    planInherited,
    overrides,
  };
}

/**
 * @param {object} row
 */
function presentDomain(row) {
  if (!row) return null;
  return {
    hostname: String(row.hostname || ""),
    domainType: String(row.domain_type || ""),
    status: String(row.status || ""),
    isPrimary: Boolean(row.is_primary),
    deploymentCode: row.deployment_code != null ? String(row.deployment_code) : null,
    isVerified: Boolean(row.is_verified),
  };
}

/**
 * @param {{ query: Function }} db
 * @param {string} organizationKeyRaw
 */
async function getPlatformOrganizationEntitlementsView(db, organizationKeyRaw) {
  const organizationKey = String(organizationKeyRaw || "")
    .trim()
    .toLowerCase();
  if (!organizationKey || !ORG_KEY_RE.test(organizationKey)) {
    return {
      ok: false,
      status: STATUS.INVALID_INPUT,
      organizationKey: null,
      entitlements: null,
      usage: null,
      domains: [],
      plans: [],
      featureKeys: [],
    };
  }
  if (!db || typeof db.query !== "function") {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      organizationKey,
      entitlements: null,
      usage: null,
      domains: [],
      plans: [],
      featureKeys: [],
    };
  }

  try {
    const org = await findOrganizationByKey(db, organizationKey);
    if (!org) {
      return {
        ok: false,
        status: STATUS.NOT_FOUND,
        organizationKey,
        entitlements: null,
        usage: null,
        domains: [],
        plans: [],
        featureKeys: [],
      };
    }

    const resolved = await resolveOrganizationEntitlements(db, {
      organizationId: org.id,
      productKey: PRODUCT_KEY_DEFAULT,
    });
    if (!resolved.ok) {
      return {
        ok: false,
        status: STATUS.LOOKUP_ERROR,
        organizationKey,
        entitlements: null,
        usage: null,
        domains: [],
        plans: [],
        featureKeys: [],
      };
    }

    const [branchCount, staffCount, userCount, domainRows, catalogue] = await Promise.all([
      entitlementRepo.countActiveBranchesForOrganization(db, org.id),
      entitlementRepo.countStaffAccountsForOrganization(db, org.id),
      entitlementRepo.countUsersForOrganization(db, org.id),
      platformRepo.listDomainsForOrganizationKey(db, organizationKey),
      listPlatformPlansCatalogue(db, { productKey: PRODUCT_KEY_DEFAULT }),
    ]);

    const ent = resolved.entitlements;
    return {
      ok: true,
      status: STATUS.OK,
      organizationKey,
      displayName: org.display_name || organizationKey,
      entitlements: presentEntitlements(ent),
      usage: {
        branches: Number(branchCount) || 0,
        branchLimit: getLimit(ent, FEATURE_KEYS.MAX_BRANCHES),
        staffAccounts: Number(staffCount) || 0,
        staffLimit: getLimit(ent, FEATURE_KEYS.MAX_STAFF_ACCOUNTS),
        users: Number(userCount) || 0,
        userLimit: getLimit(ent, FEATURE_KEYS.MAX_USERS),
        mailboxLimit: getLimit(ent, FEATURE_KEYS.MAX_MAILBOXES_PER_BRANCH),
        customDomain: hasFeature(ent, FEATURE_KEYS.CUSTOM_DOMAIN),
        customEmail: hasFeature(ent, FEATURE_KEYS.CUSTOM_EMAIL),
        advancedReports: hasFeature(ent, FEATURE_KEYS.ADVANCED_REPORTS),
        advancedRoles: hasFeature(ent, FEATURE_KEYS.ADVANCED_ROLES),
        executiveReports: hasFeature(ent, FEATURE_KEYS.EXECUTIVE_REPORTS),
        reportTemplates: hasFeature(ent, FEATURE_KEYS.REPORT_TEMPLATES),
        apiAccess: hasFeature(ent, FEATURE_KEYS.API_ACCESS),
        webhooks: hasFeature(ent, FEATURE_KEYS.WEBHOOKS),
        integrations: hasFeature(ent, FEATURE_KEYS.INTEGRATIONS),
        advancedAudit: hasFeature(ent, FEATURE_KEYS.ADVANCED_AUDIT),
      },
      domains: (domainRows || []).map(presentDomain).filter(Boolean),
      plans: catalogue.ok ? catalogue.plans : [],
      featureKeys: Object.values(FEATURE_KEYS).slice().sort(),
    };
  } catch {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      organizationKey,
      entitlements: null,
      usage: null,
      domains: [],
      plans: [],
      featureKeys: [],
    };
  }
}

/**
 * @param {{ query: Function }} db
 * @param {{
 *   organizationKey: string,
 *   planKey: string,
 *   notes?: string | null,
 *   confirmed: boolean,
 * }} input
 */
async function assignOrganizationPlanByKey(db, input) {
  const organizationKey = String((input && input.organizationKey) || "")
    .trim()
    .toLowerCase();
  const planKey = String((input && input.planKey) || "")
    .trim()
    .toLowerCase();
  if (!organizationKey || !ORG_KEY_RE.test(organizationKey) || !planKey) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "scope" };
  }
  if (!input || input.confirmed !== true) {
    return { ok: false, status: STATUS.CONFIRMATION_REQUIRED, reason: "confirm_plan_change" };
  }
  try {
    const org = await findOrganizationByKey(db, organizationKey);
    if (!org) {
      return { ok: false, status: STATUS.NOT_FOUND, reason: "organization" };
    }
    const notes =
      input.notes != null && String(input.notes).trim()
        ? String(input.notes).trim().slice(0, 2000)
        : null;
    const result = await assignOrganizationPlan(db, {
      organizationId: org.id,
      planKey,
      notes,
      status: "active",
      clearEndsAt: true,
    });
    if (!result.ok) {
      if (result.status === ENTITLEMENT_STATUS.NOT_FOUND) {
        return { ok: false, status: STATUS.NOT_FOUND, reason: result.reason || "plan" };
      }
      if (result.status === ENTITLEMENT_STATUS.INVALID_INPUT) {
        return { ok: false, status: STATUS.INVALID_INPUT, reason: result.reason || "scope" };
      }
      if (result.status === ENTITLEMENT_STATUS.LIMIT_EXCEEDED) {
        return {
          ok: false,
          status: STATUS.LIMIT_EXCEEDED,
          reason: result.reason || "max_branches",
          current: result.current,
          limit: result.limit,
        };
      }
      return { ok: false, status: STATUS.LOOKUP_ERROR, reason: result.reason || "error" };
    }
    return {
      ok: true,
      status: STATUS.OK,
      planKey: result.plan && result.plan.planKey ? result.plan.planKey : planKey,
      changed: Boolean(result.changed),
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "error" };
  }
}

/**
 * @param {{ query: Function }} db
 * @param {{
 *   organizationKey: string,
 *   featureKey: string,
 *   featureKind?: string,
 *   booleanValue?: boolean,
 *   limitValue?: number | null,
 *   reason: string,
 *   confirmed: boolean,
 *   createdByUserId?: string | null,
 * }} input
 */
async function setOrganizationEntitlementOverrideByKey(db, input) {
  const organizationKey = String((input && input.organizationKey) || "")
    .trim()
    .toLowerCase();
  const featureKey = String((input && input.featureKey) || "")
    .trim()
    .toLowerCase();
  const reason = String((input && input.reason) || "").trim();
  if (!organizationKey || !ORG_KEY_RE.test(organizationKey) || !featureKey || !reason) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "scope" };
  }
  if (!FEATURE_KEY_SET.has(featureKey)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "feature_key" };
  }
  if (!input || input.confirmed !== true) {
    return { ok: false, status: STATUS.CONFIRMATION_REQUIRED, reason: "confirm_override" };
  }
  const featureKind = String((input && input.featureKind) || inferFeatureKind(featureKey))
    .trim()
    .toLowerCase();
  if (featureKind !== "boolean" && featureKind !== "limit") {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "feature_kind" };
  }
  try {
    const org = await findOrganizationByKey(db, organizationKey);
    if (!org) {
      return { ok: false, status: STATUS.NOT_FOUND, reason: "organization" };
    }
    const payload = {
      organizationId: org.id,
      featureKey,
      featureKind,
      reason: reason.slice(0, 2000),
      createdByUserId: input.createdByUserId || null,
    };
    if (featureKind === "boolean") {
      payload.booleanValue = Boolean(input.booleanValue);
    } else {
      const raw = input.limitValue;
      if (raw === "" || raw == null || String(raw).toLowerCase() === "unlimited") {
        payload.limitValue = null;
      } else {
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) {
          return { ok: false, status: STATUS.INVALID_INPUT, reason: "limit_value" };
        }
        payload.limitValue = Math.floor(n);
      }
    }
    const result = await setOrganizationEntitlementOverride(db, payload);
    if (!result.ok) {
      if (result.status === ENTITLEMENT_STATUS.INVALID_INPUT) {
        return { ok: false, status: STATUS.INVALID_INPUT, reason: result.reason || "scope" };
      }
      return { ok: false, status: STATUS.LOOKUP_ERROR, reason: result.reason || "error" };
    }
    return { ok: true, status: STATUS.OK, featureKey };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "error" };
  }
}

module.exports = {
  STATUS,
  FEATURE_KEYS,
  inferFeatureKind,
  presentEntitlements,
  presentDomain,
  getPlatformOrganizationEntitlementsView,
  assignOrganizationPlanByKey,
  setOrganizationEntitlementOverrideByKey,
};
