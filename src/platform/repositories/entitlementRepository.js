"use strict";

/**
 * Platform plans / subscriptions / entitlement overrides (SQL only).
 */

const PLAN_COLS = `id, product_key, plan_key, display_name, description, sort_order, status,
  created_at, updated_at`;

const FEATURE_COLS = `id, plan_id, feature_key, feature_kind, boolean_value, limit_value,
  created_at, updated_at`;

const SUB_COLS = `id, organization_id, product_key, plan_id, status, starts_at, ends_at, notes,
  trial_source,
  billing_provider, billing_customer_ref, billing_subscription_ref, billing_payment_status,
  billing_current_period_end, billing_cancel_at_period_end, billing_synced_at,
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
    trialSource: row.trial_source || null,
    billingProvider: row.billing_provider || null,
    billingCustomerRef: row.billing_customer_ref || null,
    billingSubscriptionRef: row.billing_subscription_ref || null,
    billingPaymentStatus: row.billing_payment_status || null,
    billingCurrentPeriodEnd: row.billing_current_period_end || null,
    billingCancelAtPeriodEnd: Boolean(row.billing_cancel_at_period_end),
    billingSyncedAt: row.billing_synced_at || null,
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

/**
 * Current-status subscription row regardless of ends_at (for paid conversion of expired trials).
 */
async function findOpenStatusSubscription(client, organizationId, productKey) {
  const { rows } = await client.query(
    `SELECT ${SUB_COLS}
       FROM platform.organization_subscriptions
      WHERE organization_id = $1
        AND product_key = $2
        AND status IN ('active', 'trialing', 'past_due')
      ORDER BY starts_at DESC
      LIMIT 1
      FOR UPDATE`,
    [organizationId, productKey]
  );
  return mapSubscription(rows[0] || null);
}

async function insertSubscription(client, fields) {
  const { rows } = await client.query(
    `INSERT INTO platform.organization_subscriptions
       (organization_id, product_key, plan_id, status, starts_at, ends_at, notes, trial_source)
     VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7, $8)
     RETURNING ${SUB_COLS}`,
    [
      fields.organizationId,
      fields.productKey,
      fields.planId,
      fields.status || "active",
      fields.startsAt || new Date().toISOString(),
      fields.endsAt || null,
      fields.notes || null,
      fields.trialSource || null,
    ]
  );
  return mapSubscription(rows[0]);
}

async function updateSubscription(client, id, patch) {
  const { rows } = await client.query(
    `UPDATE platform.organization_subscriptions
        SET plan_id = COALESCE($2, plan_id),
            status = COALESCE($3, status),
            starts_at = CASE
              WHEN $7::timestamptz IS NOT NULL THEN $7::timestamptz
              ELSE starts_at
            END,
            ends_at = CASE
              WHEN $4::boolean THEN NULL
              WHEN $5::timestamptz IS NOT NULL THEN $5::timestamptz
              ELSE ends_at
            END,
            notes = COALESCE($6, notes),
            trial_source = CASE
              WHEN $8::boolean THEN $9
              ELSE trial_source
            END,
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
      patch.startsAt || null,
      patch.setTrialSource === true,
      patch.trialSource != null ? patch.trialSource : null,
    ]
  );
  return mapSubscription(rows[0] || null);
}

/**
 * Update provider-neutral billing metadata only (no plan/entitlement mutation).
 * @param {{ query: Function }} client
 * @param {string} id
 * @param {object} patch
 */
async function updateSubscriptionBilling(client, id, patch) {
  const { rows } = await client.query(
    `UPDATE platform.organization_subscriptions
        SET billing_provider = CASE WHEN $2::boolean THEN $3 ELSE billing_provider END,
            billing_customer_ref = CASE WHEN $4::boolean THEN $5 ELSE billing_customer_ref END,
            billing_subscription_ref = CASE WHEN $6::boolean THEN $7 ELSE billing_subscription_ref END,
            billing_payment_status = CASE WHEN $8::boolean THEN $9 ELSE billing_payment_status END,
            billing_current_period_end = CASE
              WHEN $10::boolean AND $11::boolean THEN NULL
              WHEN $10::boolean THEN $12::timestamptz
              ELSE billing_current_period_end
            END,
            billing_cancel_at_period_end = CASE
              WHEN $13::boolean THEN $14::boolean
              ELSE billing_cancel_at_period_end
            END,
            billing_synced_at = CASE WHEN $15::boolean THEN $16::timestamptz ELSE billing_synced_at END,
            updated_at = now()
      WHERE id = $1
      RETURNING ${SUB_COLS}`,
    [
      id,
      patch.setProvider === true,
      patch.billingProvider != null ? String(patch.billingProvider).slice(0, 64) : null,
      patch.setCustomerRef === true,
      patch.billingCustomerRef != null ? String(patch.billingCustomerRef).slice(0, 200) : null,
      patch.setSubscriptionRef === true,
      patch.billingSubscriptionRef != null
        ? String(patch.billingSubscriptionRef).slice(0, 200)
        : null,
      patch.setPaymentStatus === true,
      patch.billingPaymentStatus != null ? String(patch.billingPaymentStatus) : null,
      patch.setPeriodEnd === true,
      patch.clearPeriodEnd === true,
      patch.billingCurrentPeriodEnd || null,
      patch.setCancelAtPeriodEnd === true,
      patch.billingCancelAtPeriodEnd === true,
      patch.setSyncedAt === true,
      patch.billingSyncedAt || new Date().toISOString(),
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

async function countActiveBranchesForOrganization(client, organizationId, options) {
  const excludeBranchId =
    options && options.excludeBranchId != null
      ? String(options.excludeBranchId).trim()
      : "";
  const params = [organizationId];
  let excludeClause = "";
  if (excludeBranchId) {
    params.push(excludeBranchId);
    excludeClause = ` AND b.id <> $${params.length}`;
  }
  const { rows } = await client.query(
    `SELECT COUNT(b.id)::int AS n
       FROM blessboard.branches b
       INNER JOIN blessboard.churches c ON c.id = b.church_id
      WHERE c.organization_id = $1
        AND b.status = 'active'
        AND c.status = 'active'${excludeClause}`,
    params
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

/**
 * Active staff seats + pending invitations that would add a new staff seat.
 * Pending invites for emails that already hold an active staff role do not add seats.
 */
async function countStaffSeatsIncludingPendingInvites(client, organizationId) {
  const active = await countStaffAccountsForOrganization(client, organizationId);
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS n
       FROM blessboard.user_invitations i
      WHERE i.organization_id = $1
        AND i.status = 'pending'
        AND i.expires_at > now()
        AND NOT EXISTS (
          SELECT 1
            FROM blessboard.user_roles ur
            INNER JOIN blessboard.users u ON u.id = ur.user_id
           WHERE ur.organization_id = i.organization_id
             AND ur.status = 'active'
             AND ur.role_key IN ('platform_admin', 'church_hq_admin', 'branch_admin')
             AND u.email_normalized = i.email_normalized
        )`,
    [organizationId]
  );
  return active + (Number(rows[0].n) || 0);
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

/**
 * Active role users + pending invites that would introduce a new user identity seat.
 */
async function countUserSeatsIncludingPendingInvites(client, organizationId) {
  const active = await countUsersForOrganization(client, organizationId);
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS n
       FROM blessboard.user_invitations i
      WHERE i.organization_id = $1
        AND i.status = 'pending'
        AND i.expires_at > now()
        AND NOT EXISTS (
          SELECT 1
            FROM blessboard.user_roles ur
            INNER JOIN blessboard.users u ON u.id = ur.user_id
           WHERE ur.organization_id = i.organization_id
             AND ur.status = 'active'
             AND u.email_normalized = i.email_normalized
        )`,
    [organizationId]
  );
  return active + (Number(rows[0].n) || 0);
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
  findOpenStatusSubscription,
  insertSubscription,
  updateSubscription,
  updateSubscriptionBilling,
  listActiveOverrides,
  insertOverride,
  countActiveBranchesForOrganization,
  countStaffAccountsForOrganization,
  countStaffSeatsIncludingPendingInvites,
  countUsersForOrganization,
  countUserSeatsIncludingPendingInvites,
};
