"use strict";

/**
 * Platform plans / subscriptions / entitlement overrides (SQL only).
 */

const PLAN_COLS = `id, product_key, plan_key, display_name, description, sort_order, status,
  created_at, updated_at`;

const FEATURE_COLS = `id, plan_id, feature_key, feature_kind, boolean_value, limit_value,
  created_at, updated_at`;

const SUB_COLS = `id, organization_id, product_key, plan_id, status, starts_at, ends_at, notes,
  created_at, updated_at`;

const OVERRIDE_COLS = `id, organization_id, product_key, feature_key, feature_kind, boolean_value,
  limit_value, reason, starts_at, ends_at, created_by_user_id, created_at, updated_at`;

function mapPlan(row) {
  if (!row) return null;
  return {
    id: row.id,
    productKey: row.product_key,
    planKey: row.plan_key,
    displayName: row.display_name,
    description: row.description || null,
    sortOrder: Number(row.sort_order) || 0,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapFeature(row) {
  if (!row) return null;
  return {
    id: row.id,
    planId: row.plan_id,
    featureKey: row.feature_key,
    featureKind: row.feature_kind,
    booleanValue: row.boolean_value == null ? null : Boolean(row.boolean_value),
    limitValue: row.limit_value == null ? null : Number(row.limit_value),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSubscription(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    productKey: row.product_key,
    planId: row.plan_id,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at || null,
    notes: row.notes || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapOverride(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    productKey: row.product_key,
    featureKey: row.feature_key,
    featureKind: row.feature_kind,
    booleanValue: row.boolean_value == null ? null : Boolean(row.boolean_value),
    limitValue: row.limit_value == null ? null : Number(row.limit_value),
    reason: row.reason,
    startsAt: row.starts_at,
    endsAt: row.ends_at || null,
    createdByUserId: row.created_by_user_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listActivePlans(client, productKey) {
  const { rows } = await client.query(
    `SELECT ${PLAN_COLS}
       FROM platform.plans
      WHERE product_key = $1
        AND status = 'active'
      ORDER BY sort_order ASC, plan_key ASC`,
    [productKey]
  );
  return rows.map(mapPlan);
}

/**
 * All catalogue rows for a product (active + inactive). Read-only directory use.
 * Does not change assignability — callers that assign must still use listActivePlans / status checks.
 */
async function listPlansForProduct(client, productKey) {
  const { rows } = await client.query(
    `SELECT ${PLAN_COLS}
       FROM platform.plans
      WHERE product_key = $1
      ORDER BY sort_order ASC, plan_key ASC`,
    [productKey]
  );
  return rows.map(mapPlan);
}

async function findPlanByKey(client, planKey) {
  const { rows } = await client.query(
    `SELECT ${PLAN_COLS} FROM platform.plans WHERE plan_key = $1`,
    [planKey]
  );
  return mapPlan(rows[0] || null);
}

async function findPlanById(client, planId) {
  const { rows } = await client.query(
    `SELECT ${PLAN_COLS} FROM platform.plans WHERE id = $1`,
    [planId]
  );
  return mapPlan(rows[0] || null);
}

async function listPlanFeatures(client, planId) {
  const { rows } = await client.query(
    `SELECT ${FEATURE_COLS}
       FROM platform.plan_features
      WHERE plan_id = $1
      ORDER BY feature_key ASC`,
    [planId]
  );
  return rows.map(mapFeature);
}

async function findCurrentSubscription(client, organizationId, productKey, at) {
  const { rows } = await client.query(
    `SELECT ${SUB_COLS}
       FROM platform.organization_subscriptions
      WHERE organization_id = $1
        AND product_key = $2
        AND status IN ('active', 'trialing', 'past_due')
        AND starts_at <= $3::timestamptz
        AND (ends_at IS NULL OR ends_at > $3::timestamptz)
      ORDER BY starts_at DESC
      LIMIT 1`,
    [organizationId, productKey, at]
  );
  return mapSubscription(rows[0] || null);
}

async function insertSubscription(client, fields) {
  const { rows } = await client.query(
    `INSERT INTO platform.organization_subscriptions
       (organization_id, product_key, plan_id, status, starts_at, ends_at, notes)
     VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7)
     RETURNING ${SUB_COLS}`,
    [
      fields.organizationId,
      fields.productKey,
      fields.planId,
      fields.status || "active",
      fields.startsAt || new Date().toISOString(),
      fields.endsAt || null,
      fields.notes || null,
    ]
  );
  return mapSubscription(rows[0]);
}

async function updateSubscription(client, id, patch) {
  const { rows } = await client.query(
    `UPDATE platform.organization_subscriptions
        SET plan_id = COALESCE($2, plan_id),
            status = COALESCE($3, status),
            ends_at = CASE
              WHEN $4::boolean THEN NULL
              WHEN $5::timestamptz IS NOT NULL THEN $5::timestamptz
              ELSE ends_at
            END,
            notes = COALESCE($6, notes),
            updated_at = now()
      WHERE id = $1
      RETURNING ${SUB_COLS}`,
    [
      id,
      patch.planId || null,
      patch.status || null,
      patch.clearEndsAt === true,
      patch.endsAt || null,
      patch.notes != null ? patch.notes : null,
    ]
  );
  return mapSubscription(rows[0] || null);
}

async function listActiveOverrides(client, organizationId, productKey, at) {
  const { rows } = await client.query(
    `SELECT ${OVERRIDE_COLS}
       FROM platform.organization_entitlements
      WHERE organization_id = $1
        AND product_key = $2
        AND starts_at <= $3::timestamptz
        AND (ends_at IS NULL OR ends_at > $3::timestamptz)
      ORDER BY created_at DESC`,
    [organizationId, productKey, at]
  );
  return rows.map(mapOverride);
}

async function insertOverride(client, fields) {
  const { rows } = await client.query(
    `INSERT INTO platform.organization_entitlements
       (organization_id, product_key, feature_key, feature_kind, boolean_value, limit_value,
        reason, starts_at, ends_at, created_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz, $10)
     RETURNING ${OVERRIDE_COLS}`,
    [
      fields.organizationId,
      fields.productKey,
      fields.featureKey,
      fields.featureKind,
      fields.booleanValue != null ? fields.booleanValue : null,
      fields.limitValue != null ? fields.limitValue : null,
      fields.reason,
      fields.startsAt || new Date().toISOString(),
      fields.endsAt || null,
      fields.createdByUserId || null,
    ]
  );
  return mapOverride(rows[0]);
}

async function countActiveBranchesForOrganization(client, organizationId) {
  const { rows } = await client.query(
    `SELECT COUNT(b.id)::int AS n
       FROM blessboard.branches b
       INNER JOIN blessboard.churches c ON c.id = b.church_id
      WHERE c.organization_id = $1
        AND b.status = 'active'
        AND c.status = 'active'`,
    [organizationId]
  );
  return Number(rows[0].n) || 0;
}

async function countStaffAccountsForOrganization(client, organizationId) {
  const { rows } = await client.query(
    `SELECT COUNT(DISTINCT ur.user_id)::int AS n
       FROM blessboard.user_roles ur
      WHERE ur.organization_id = $1
        AND ur.status = 'active'
        AND ur.role_key IN ('platform_admin', 'church_hq_admin', 'branch_admin')`,
    [organizationId]
  );
  return Number(rows[0].n) || 0;
}

async function countUsersForOrganization(client, organizationId) {
  const { rows } = await client.query(
    `SELECT COUNT(DISTINCT ur.user_id)::int AS n
       FROM blessboard.user_roles ur
      WHERE ur.organization_id = $1
        AND ur.status = 'active'`,
    [organizationId]
  );
  return Number(rows[0].n) || 0;
}

module.exports = {
  mapPlan,
  mapFeature,
  mapSubscription,
  mapOverride,
  listActivePlans,
  listPlansForProduct,
  findPlanByKey,
  findPlanById,
  listPlanFeatures,
  findCurrentSubscription,
  insertSubscription,
  updateSubscription,
  listActiveOverrides,
  insertOverride,
  countActiveBranchesForOrganization,
  countStaffAccountsForOrganization,
  countUsersForOrganization,
};
