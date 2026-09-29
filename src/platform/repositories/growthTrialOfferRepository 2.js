"use strict";

/**
 * Explicit SQL for Foundation→Growth trial offers.
 */

const OFFER_COLS = `
  id, organization_id, offer_source, status,
  offered_at, offered_by, accepted_at, accepted_by,
  trial_subscription_id, starts_at, ends_at,
  exception_reason, is_exception, declined_at, canceled_at,
  created_at, updated_at
`;

const CONSUMED_STATUSES = Object.freeze(["accepted", "active", "expired", "consumed"]);

function mapOffer(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    offerSource: row.offer_source,
    status: row.status,
    offeredAt: row.offered_at || null,
    offeredBy: row.offered_by || null,
    acceptedAt: row.accepted_at || null,
    acceptedBy: row.accepted_by || null,
    trialSubscriptionId: row.trial_subscription_id || null,
    startsAt: row.starts_at || null,
    endsAt: row.ends_at || null,
    exceptionReason: row.exception_reason || null,
    isException: Boolean(row.is_exception),
    declinedAt: row.declined_at || null,
    canceledAt: row.canceled_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * @param {{ query: Function }} client
 * @param {string} organizationId
 */
async function findOpenOffer(client, organizationId) {
  const { rows } = await client.query(
    `SELECT ${OFFER_COLS}
       FROM blessboard.organization_growth_trial_offers
      WHERE organization_id = $1 AND status = 'offered'
      LIMIT 1`,
    [organizationId]
  );
  return mapOffer(rows[0] || null);
}

/**
 * @param {{ query: Function }} client
 * @param {string} organizationId
 */
async function findLatestOffer(client, organizationId) {
  const { rows } = await client.query(
    `SELECT ${OFFER_COLS}
       FROM blessboard.organization_growth_trial_offers
      WHERE organization_id = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [organizationId]
  );
  return mapOffer(rows[0] || null);
}

/**
 * @param {{ query: Function }} client
 * @param {string} organizationId
 */
async function hasConsumedIntroductoryTrial(client, organizationId) {
  const { rows } = await client.query(
    `SELECT 1
       FROM blessboard.organization_growth_trial_offers
      WHERE organization_id = $1
        AND is_exception = false
        AND status = ANY($2::text[])
      LIMIT 1`,
    [organizationId, CONSUMED_STATUSES.slice()]
  );
  return Boolean(rows[0]);
}

/**
 * @param {{ query: Function }} client
 * @param {object} fields
 */
async function insertOffer(client, fields) {
  const { rows } = await client.query(
    `INSERT INTO blessboard.organization_growth_trial_offers (
       organization_id, offer_source, status,
       offered_at, offered_by, exception_reason, is_exception
     ) VALUES (
       $1, $2, $3,
       $4::timestamptz, $5, $6, $7
     )
     RETURNING ${OFFER_COLS}`,
    [
      fields.organizationId,
      fields.offerSource || "foundation_upgrade",
      fields.status || "offered",
      fields.offeredAt || new Date().toISOString(),
      fields.offeredBy || null,
      fields.exceptionReason || null,
      fields.isException === true,
    ]
  );
  return mapOffer(rows[0]);
}

/**
 * @param {{ query: Function }} client
 * @param {string} id
 * @param {object} patch
 */
async function updateOffer(client, id, patch) {
  const { rows } = await client.query(
    `UPDATE blessboard.organization_growth_trial_offers
        SET status = COALESCE($2, status),
            accepted_at = COALESCE($3::timestamptz, accepted_at),
            accepted_by = COALESCE($4, accepted_by),
            trial_subscription_id = COALESCE($5, trial_subscription_id),
            starts_at = COALESCE($6::timestamptz, starts_at),
            ends_at = COALESCE($7::timestamptz, ends_at),
            declined_at = COALESCE($8::timestamptz, declined_at),
            canceled_at = COALESCE($9::timestamptz, canceled_at),
            exception_reason = COALESCE($10, exception_reason),
            updated_at = now()
      WHERE id = $1
      RETURNING ${OFFER_COLS}`,
    [
      id,
      patch.status || null,
      patch.acceptedAt || null,
      patch.acceptedBy || null,
      patch.trialSubscriptionId || null,
      patch.startsAt || null,
      patch.endsAt || null,
      patch.declinedAt || null,
      patch.canceledAt || null,
      patch.exceptionReason != null ? patch.exceptionReason : null,
    ]
  );
  return mapOffer(rows[0] || null);
}

/**
 * @param {{ query: Function }} client
 * @param {string} organizationId
 */
async function findCurrentFoundationSubscription(client, organizationId) {
  const { rows } = await client.query(
    `SELECT os.id, os.status, os.starts_at, os.ends_at, os.trial_source,
            p.plan_key, p.display_name
       FROM platform.organization_subscriptions os
       INNER JOIN platform.plans p ON p.id = os.plan_id
      WHERE os.organization_id = $1
        AND os.product_key = 'blessboard'
        AND os.status IN ('active', 'trialing', 'past_due')
        AND (os.ends_at IS NULL OR os.ends_at > now())
      ORDER BY os.created_at DESC
      LIMIT 1`,
    [organizationId]
  );
  return rows[0] || null;
}

module.exports = {
  CONSUMED_STATUSES,
  mapOffer,
  findOpenOffer,
  findLatestOffer,
  hasConsumedIntroductoryTrial,
  insertOffer,
  updateOffer,
  findCurrentFoundationSubscription,
};
