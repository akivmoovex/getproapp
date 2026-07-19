"use strict";

/**
 * Central platform entitlement resolver and limit enforcement.
 * Plans are data-driven (platform.plans / plan_features) — not hardcoded in routes.
 * Fail closed for premium writes. Soft-safe for public reads.
 * Plan changes never delete existing branches/users (no destructive downgrade).
 */

const repo = require("../repositories/entitlementRepository");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  FORBIDDEN: "forbidden",
  LIMIT_EXCEEDED: "limit_exceeded",
  SUBSCRIPTION_INACTIVE: "subscription_inactive",
  LOOKUP_ERROR: "lookup_error",
  CONFLICT: "conflict",
});

const PRODUCT_KEY_DEFAULT = "blessboard";
const ACTIVE_SUB_STATUSES = Object.freeze(["active", "trialing", "past_due"]);

/**
 * Runtime platform.plan_features keys (snake_case).
 * Network-only booleans stay false until a V5 backend can enforce them —
 * commercial catalogue capacity is not a substitute for FEATURE_KEYS=true.
 */
const FEATURE_KEYS = Object.freeze({
  MAX_BRANCHES: "max_branches",
  MAX_USERS: "max_users",
  MAX_STAFF_ACCOUNTS: "max_staff_accounts",
  MAX_MAILBOXES_PER_BRANCH: "max_mailboxes_per_branch",
  BASIC_REPORTS: "basic_reports",
  ADVANCED_REPORTS: "advanced_reports",
  CUSTOM_DOMAIN: "custom_domain",
  CUSTOM_EMAIL: "custom_email",
  ADVANCED_ROLES: "advanced_roles",
  EXECUTIVE_REPORTS: "executive_reports",
  REPORT_TEMPLATES: "report_templates",
  API_ACCESS: "api_access",
  WEBHOOKS: "webhooks",
  INTEGRATIONS: "integrations",
  ADVANCED_AUDIT: "advanced_audit",
});

/** Network-only capability keys (boolean or mailbox limit). Growth must stay false/0. */
const NETWORK_ONLY_FEATURE_KEYS = Object.freeze([
  FEATURE_KEYS.CUSTOM_DOMAIN,
  FEATURE_KEYS.CUSTOM_EMAIL,
  FEATURE_KEYS.MAX_MAILBOXES_PER_BRANCH,
  FEATURE_KEYS.ADVANCED_ROLES,
  FEATURE_KEYS.EXECUTIVE_REPORTS,
  FEATURE_KEYS.REPORT_TEMPLATES,
  FEATURE_KEYS.API_ACCESS,
  FEATURE_KEYS.WEBHOOKS,
  FEATURE_KEYS.INTEGRATIONS,
  FEATURE_KEYS.ADVANCED_AUDIT,
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function withClient(db, fn) {
  let client = null;
  let owned = false;
  try {
    // Prefer an already-checked-out pool client (has release) so nested callers stay on one connection.
    if (db && typeof db.query === "function" && typeof db.release === "function") {
      return await fn(db);
    }
    if (db && typeof db.connect === "function") {
      client = await db.connect();
      owned = true;
    } else {
      client = db;
    }
    return await fn(client);
  } finally {
    if (owned && client && typeof client.release === "function") client.release();
  }
}

function clockAt(input) {
  if (input && input.at instanceof Date && !Number.isNaN(input.at.getTime())) {
    return input.at.toISOString();
  }
  return new Date().toISOString();
}

function mergeFeatures(planFeatures, overrides) {
  const map = {};
  for (const f of planFeatures || []) {
    map[f.featureKey] = {
      featureKey: f.featureKey,
      featureKind: f.featureKind,
      booleanValue: f.booleanValue,
      limitValue: f.limitValue,
      source: "plan",
    };
  }
  // Latest override wins per feature (repo returns newest first)
  const seen = new Set();
  for (const o of overrides || []) {
    if (seen.has(o.featureKey)) continue;
    seen.add(o.featureKey);
    map[o.featureKey] = {
      featureKey: o.featureKey,
      featureKind: o.featureKind,
      booleanValue: o.booleanValue,
      limitValue: o.limitValue,
      source: "override",
      reason: o.reason,
    };
  }
  return map;
}

/**
 * Resolve effective entitlements for an organization.
 * Fail-closed semantics: missing/expired subscription → entitled=false for premium features.
 */
async function resolveOrganizationEntitlements(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const productKey = String((input && input.productKey) || PRODUCT_KEY_DEFAULT)
    .trim()
    .toLowerCase();
  if (!UUID_RE.test(organizationId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, entitlements: null, reason: "organization_id" };
  }
  const at = clockAt(input);

  try {
    return await withClient(db, async (client) => {
      const subscription = await repo.findCurrentSubscription(
        client,
        organizationId,
        productKey,
        at
      );
      if (!subscription) {
        return {
          ok: true,
          status: STATUS.OK,
          entitlements: {
            organizationId,
            productKey,
            subscriptionActive: false,
            subscription: null,
            plan: null,
            planKey: null,
            features: {},
            reason: "no_active_subscription",
          },
        };
      }

      const plan = await repo.findPlanById(client, subscription.planId);
      if (!plan || plan.status !== "active") {
        return {
          ok: true,
          status: STATUS.OK,
          entitlements: {
            organizationId,
            productKey,
            subscriptionActive: false,
            subscription,
            plan,
            planKey: plan ? plan.planKey : null,
            features: {},
            reason: "plan_inactive",
          },
        };
      }

      const planFeatures = await repo.listPlanFeatures(client, plan.id);
      const overrides = await repo.listActiveOverrides(client, organizationId, productKey, at);
      const features = mergeFeatures(planFeatures, overrides);

      return {
        ok: true,
        status: STATUS.OK,
        entitlements: {
          organizationId,
          productKey,
          subscriptionActive: ACTIVE_SUB_STATUSES.includes(subscription.status),
          subscription,
          plan,
          planKey: plan.planKey,
          features,
          reason: null,
        },
      };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      entitlements: null,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

/**
 * Soft resolver for public/read paths — never throws; unavailable data → empty soft result.
 */
async function resolveOrganizationEntitlementsSafe(db, input) {
  try {
    const resolved = await resolveOrganizationEntitlements(db, input);
    if (resolved.ok && resolved.entitlements) {
      return { ok: true, soft: false, entitlements: resolved.entitlements };
    }
    return {
      ok: true,
      soft: true,
      entitlements: {
        organizationId: String((input && input.organizationId) || ""),
        productKey: String((input && input.productKey) || PRODUCT_KEY_DEFAULT),
        subscriptionActive: false,
        subscription: null,
        plan: null,
        planKey: null,
        features: {},
        reason: "unavailable",
      },
    };
  } catch {
    return {
      ok: true,
      soft: true,
      entitlements: {
        organizationId: String((input && input.organizationId) || ""),
        productKey: String((input && input.productKey) || PRODUCT_KEY_DEFAULT),
        subscriptionActive: false,
        subscription: null,
        plan: null,
        planKey: null,
        features: {},
        reason: "unavailable",
      },
    };
  }
}

function readFeature(entitlements, featureKey) {
  if (!entitlements || !entitlements.features) return null;
  return entitlements.features[featureKey] || null;
}

/**
 * Boolean feature check. Fail closed when subscription inactive or feature missing/false.
 */
function hasFeature(entitlements, featureKey) {
  if (!entitlements || !entitlements.subscriptionActive) return false;
  const f = readFeature(entitlements, featureKey);
  if (!f || f.featureKind !== "boolean") return false;
  return f.booleanValue === true;
}

/**
 * Limit value; null means unlimited. Missing/inactive → 0 (fail closed).
 */
function getLimit(entitlements, featureKey) {
  if (!entitlements || !entitlements.subscriptionActive) return 0;
  const f = readFeature(entitlements, featureKey);
  if (!f || f.featureKind !== "limit") return 0;
  return f.limitValue; // null = unlimited
}

function isWithinLimit(entitlements, featureKey, currentCount, additional = 1) {
  const limit = getLimit(entitlements, featureKey);
  if (limit == null) return true; // unlimited
  return Number(currentCount) + Number(additional) <= Number(limit);
}

/**
 * Fail-closed boolean feature assert for premium writes.
 */
async function assertFeature(db, input) {
  const featureKey = String((input && input.featureKey) || "").trim();
  if (!featureKey) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "feature_key" };
  }
  const resolved = await resolveOrganizationEntitlements(db, input);
  if (!resolved.ok) return { ok: false, status: resolved.status, reason: resolved.reason };
  const ent = resolved.entitlements;
  if (!ent.subscriptionActive) {
    return { ok: false, status: STATUS.SUBSCRIPTION_INACTIVE, reason: "subscription_inactive", entitlements: ent };
  }
  if (!hasFeature(ent, featureKey)) {
    return { ok: false, status: STATUS.FORBIDDEN, reason: "feature_not_entitled", entitlements: ent };
  }
  return { ok: true, status: STATUS.OK, entitlements: ent };
}

/**
 * Evaluate branch create allowance on an existing client (caller owns transaction).
 */
async function evaluateBranchCreateLimit(client, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  if (!UUID_RE.test(organizationId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "organization_id" };
  }
  await client.query(
    `SELECT id FROM platform.organization_subscriptions
      WHERE organization_id = $1 AND product_key = $2
        AND status IN ('active', 'trialing', 'past_due')
      FOR UPDATE`,
    [organizationId, input.productKey || PRODUCT_KEY_DEFAULT]
  );
  const resolved = await resolveOrganizationEntitlements(client, {
    organizationId,
    productKey: input.productKey,
    at: input.at,
  });
  if (!resolved.ok) {
    return { ok: false, status: resolved.status, reason: resolved.reason };
  }
  const ent = resolved.entitlements;
  if (!ent.subscriptionActive) {
    return {
      ok: false,
      status: STATUS.SUBSCRIPTION_INACTIVE,
      reason: "subscription_inactive",
      entitlements: ent,
    };
  }
  const excludeBranchId =
    input && input.excludeBranchId != null ? String(input.excludeBranchId).trim() : "";
  const current = await repo.countActiveBranchesForOrganization(
    client,
    organizationId,
    excludeBranchId ? { excludeBranchId } : undefined
  );
  if (!isWithinLimit(ent, FEATURE_KEYS.MAX_BRANCHES, current, 1)) {
    return {
      ok: false,
      status: STATUS.LIMIT_EXCEEDED,
      reason: "max_branches",
      current,
      limit: getLimit(ent, FEATURE_KEYS.MAX_BRANCHES),
      entitlements: ent,
    };
  }
  return {
    ok: true,
    status: STATUS.OK,
    current,
    limit: getLimit(ent, FEATURE_KEYS.MAX_BRANCHES),
    entitlements: ent,
  };
}

/**
 * Whether assigning `plan` would leave active branch count within that plan's
 * effective max_branches (plan features + active overrides). Never auto-deactivates.
 */
async function evaluateTargetPlanBranchCapacity(client, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const productKey = String((input && input.productKey) || PRODUCT_KEY_DEFAULT)
    .trim()
    .toLowerCase();
  const plan = input && input.plan;
  if (!UUID_RE.test(organizationId) || !plan || !plan.id) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "scope" };
  }
  const at = clockAt(input);
  const planFeatures = await repo.listPlanFeatures(client, plan.id);
  const overrides = await repo.listActiveOverrides(client, organizationId, productKey, at);
  const features = mergeFeatures(planFeatures, overrides);
  const synthetic = { subscriptionActive: true, features };
  const limit = getLimit(synthetic, FEATURE_KEYS.MAX_BRANCHES);
  const current = await repo.countActiveBranchesForOrganization(client, organizationId);
  if (limit != null && current > Number(limit)) {
    return {
      ok: false,
      status: STATUS.LIMIT_EXCEEDED,
      reason: "max_branches",
      current,
      limit,
    };
  }
  return { ok: true, status: STATUS.OK, current, limit };
}

/**
 * Transactional limit check for branch create. Does not delete excess on downgrade.
 */
async function assertCanCreateBranch(db, input) {
  try {
    return await withClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const result = await evaluateBranchCreateLimit(client, input);
        if (!result.ok) {
          await client.query("ROLLBACK");
          return result;
        }
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function evaluateStaffAccountLimit(client, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  if (!UUID_RE.test(organizationId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "organization_id" };
  }
  await client.query(
    `SELECT id FROM platform.organization_subscriptions
      WHERE organization_id = $1 AND product_key = $2
        AND status IN ('active', 'trialing', 'past_due')
      FOR UPDATE`,
    [organizationId, input.productKey || PRODUCT_KEY_DEFAULT]
  );
  const resolved = await resolveOrganizationEntitlements(client, {
    organizationId,
    productKey: input.productKey,
    at: input.at,
  });
  if (!resolved.ok) {
    return { ok: false, status: resolved.status, reason: resolved.reason };
  }
  const ent = resolved.entitlements;
  if (!ent.subscriptionActive) {
    return {
      ok: false,
      status: STATUS.SUBSCRIPTION_INACTIVE,
      reason: "subscription_inactive",
      entitlements: ent,
    };
  }
  const staffCount = await repo.countStaffAccountsForOrganization(client, organizationId);
  const userCount = await repo.countUsersForOrganization(client, organizationId);
  const additionalStaff = input.countsAsNewStaff === false ? 0 : 1;
  const additionalUser = input.countsAsNewUser === false ? 0 : 1;
  if (!isWithinLimit(ent, FEATURE_KEYS.MAX_STAFF_ACCOUNTS, staffCount, additionalStaff)) {
    return {
      ok: false,
      status: STATUS.LIMIT_EXCEEDED,
      reason: "max_staff_accounts",
      current: staffCount,
      limit: getLimit(ent, FEATURE_KEYS.MAX_STAFF_ACCOUNTS),
      entitlements: ent,
    };
  }
  if (!isWithinLimit(ent, FEATURE_KEYS.MAX_USERS, userCount, additionalUser)) {
    return {
      ok: false,
      status: STATUS.LIMIT_EXCEEDED,
      reason: "max_users",
      current: userCount,
      limit: getLimit(ent, FEATURE_KEYS.MAX_USERS),
      entitlements: ent,
    };
  }
  return {
    ok: true,
    status: STATUS.OK,
    staffCount,
    userCount,
    entitlements: ent,
  };
}

async function assertCanCreateStaffAccount(db, input) {
  try {
    return await withClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const result = await evaluateStaffAccountLimit(client, input);
        if (!result.ok) {
          await client.query("ROLLBACK");
          return result;
        }
        await client.query("COMMIT");
        return result;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function assignOrganizationPlan(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const planKey = String((input && input.planKey) || "").trim().toLowerCase();
  const productKey = String((input && input.productKey) || PRODUCT_KEY_DEFAULT)
    .trim()
    .toLowerCase();
  if (!UUID_RE.test(organizationId) || !planKey) {
    return { ok: false, status: STATUS.INVALID_INPUT, subscription: null, reason: "scope" };
  }
  try {
    return await withClient(db, async (client) => {
      const plan = await repo.findPlanByKey(client, planKey);
      if (!plan || plan.productKey !== productKey || plan.status !== "active") {
        return { ok: false, status: STATUS.NOT_FOUND, subscription: null, reason: "plan" };
      }
      const at = clockAt(input);
      const current = await repo.findCurrentSubscription(client, organizationId, productKey, at);
      if (current) {
        await client.query(
          `SELECT id FROM platform.organization_subscriptions WHERE id = $1 FOR UPDATE`,
          [current.id]
        );
      } else {
        await client.query(
          `SELECT id FROM platform.organization_subscriptions
            WHERE organization_id = $1 AND product_key = $2
            FOR UPDATE`,
          [organizationId, productKey]
        );
      }
      const capacity = await evaluateTargetPlanBranchCapacity(client, {
        organizationId,
        productKey,
        plan,
        at: input && input.at,
      });
      if (!capacity.ok) {
        return {
          ok: false,
          status: capacity.status,
          subscription: null,
          reason: capacity.reason,
          current: capacity.current,
          limit: capacity.limit,
          plan,
        };
      }
      if (current) {
        // Plan change: update plan_id only — never delete branches/users.
        const updated = await repo.updateSubscription(client, current.id, {
          planId: plan.id,
          status: input.status || current.status,
          endsAt: input.endsAt,
          clearEndsAt: input.clearEndsAt === true,
          notes: input.notes,
        });
        return { ok: true, status: STATUS.OK, subscription: updated, plan, changed: true };
      }
      const created = await repo.insertSubscription(client, {
        organizationId,
        productKey,
        planId: plan.id,
        status: input.status || "active",
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        notes: input.notes,
      });
      return { ok: true, status: STATUS.OK, subscription: created, plan, changed: false };
    });
  } catch (err) {
    const msg = err && err.message ? String(err.message) : "";
    if (/unique|duplicate/i.test(msg)) {
      return { ok: false, status: STATUS.CONFLICT, subscription: null, reason: "duplicate" };
    }
    return { ok: false, status: STATUS.LOOKUP_ERROR, subscription: null, reason: msg };
  }
}

async function setOrganizationEntitlementOverride(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const featureKey = String((input && input.featureKey) || "").trim().toLowerCase();
  const featureKind = String((input && input.featureKind) || "").trim().toLowerCase();
  const reason = String((input && input.reason) || "").trim();
  const productKey = String((input && input.productKey) || PRODUCT_KEY_DEFAULT)
    .trim()
    .toLowerCase();
  if (!UUID_RE.test(organizationId) || !featureKey || !reason) {
    return { ok: false, status: STATUS.INVALID_INPUT, override: null, reason: "scope" };
  }
  if (featureKind !== "boolean" && featureKind !== "limit") {
    return { ok: false, status: STATUS.INVALID_INPUT, override: null, reason: "feature_kind" };
  }
  try {
    return await withClient(db, async (client) => {
      const override = await repo.insertOverride(client, {
        organizationId,
        productKey,
        featureKey,
        featureKind,
        booleanValue: featureKind === "boolean" ? Boolean(input.booleanValue) : null,
        limitValue: featureKind === "limit" ? (input.limitValue == null ? null : Number(input.limitValue)) : null,
        reason,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        createdByUserId: input.createdByUserId,
      });
      return { ok: true, status: STATUS.OK, override };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      override: null,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

module.exports = {
  STATUS,
  FEATURE_KEYS,
  NETWORK_ONLY_FEATURE_KEYS,
  PRODUCT_KEY_DEFAULT,
  resolveOrganizationEntitlements,
  resolveOrganizationEntitlementsSafe,
  hasFeature,
  getLimit,
  isWithinLimit,
  assertFeature,
  evaluateBranchCreateLimit,
  assertCanCreateBranch,
  evaluateTargetPlanBranchCapacity,
  evaluateStaffAccountLimit,
  assertCanCreateStaffAccount,
  assignOrganizationPlan,
  setOrganizationEntitlementOverride,
};
