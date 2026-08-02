"use strict";

/**
 * BlessBoard staff invitation repository (SQL only).
 */

function mapInvitation(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    churchId: row.church_id,
    branchId: row.branch_id || null,
    emailNormalized: row.email_normalized,
    emailDisplay: row.email_display,
    phoneNormalized: row.phone_normalized || null,
    phoneDisplay: row.phone_display || null,
    displayName: row.display_name,
    roleKey: row.role_key,
    tokenHash: row.token_hash,
    status: row.status,
    expiresAt: row.expires_at,
    invitedByUserId: row.invited_by_user_id || null,
    acceptedUserId: row.accepted_user_id || null,
    acceptedAt: row.accepted_at || null,
    revokedAt: row.revoked_at || null,
    revokedByUserId: row.revoked_by_user_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    branchKey: row.branch_key || null,
    branchDisplayName: row.branch_display_name || null,
    deliveryStatus: row.delivery_status != null ? String(row.delivery_status) : null,
    deliveryAttemptedAt: row.delivery_attempted_at || null,
    deliveryErrorCode: row.delivery_error_code != null ? String(row.delivery_error_code) : null,
  };
}

const INVITATION_SELECT = `id, organization_id, church_id, branch_id, email_normalized, email_display,
            phone_normalized, phone_display,
            display_name, role_key, token_hash, status, expires_at, invited_by_user_id,
            accepted_user_id, accepted_at, revoked_at, revoked_by_user_id, created_at, updated_at,
            delivery_status, delivery_attempted_at, delivery_error_code`;

async function findPendingByScope(client, fields) {
  if (fields.phoneNormalized) {
    const byPhone = await client.query(
      `SELECT ${INVITATION_SELECT}
         FROM blessboard.user_invitations
        WHERE organization_id = $1
          AND church_id = $2
          AND phone_normalized = $3
          AND role_key = $4
          AND branch_id IS NOT DISTINCT FROM $5
          AND status = 'pending'
        LIMIT 1
        FOR UPDATE`,
      [
        fields.organizationId,
        fields.churchId,
        fields.phoneNormalized,
        fields.roleKey,
        fields.branchId || null,
      ]
    );
    if (byPhone.rows[0]) return mapInvitation(byPhone.rows[0]);
  }
  if (!fields.emailNormalized) return null;
  const r = await client.query(
    `SELECT ${INVITATION_SELECT}
       FROM blessboard.user_invitations
      WHERE organization_id = $1
        AND church_id = $2
        AND email_normalized = $3
        AND role_key = $4
        AND branch_id IS NOT DISTINCT FROM $5
        AND status = 'pending'
      LIMIT 1
      FOR UPDATE`,
    [
      fields.organizationId,
      fields.churchId,
      fields.emailNormalized,
      fields.roleKey,
      fields.branchId || null,
    ]
  );
  return mapInvitation(r.rows[0] || null);
}

async function findByTokenHash(client, tokenHash, { forUpdate } = {}) {
  const lock = forUpdate ? " FOR UPDATE" : "";
  const r = await client.query(
    `SELECT ${INVITATION_SELECT}
       FROM blessboard.user_invitations
      WHERE token_hash = $1
      LIMIT 1${lock}`,
    [tokenHash]
  );
  return mapInvitation(r.rows[0] || null);
}

async function findById(client, invitationId, { forUpdate } = {}) {
  const lock = forUpdate ? " FOR UPDATE" : "";
  const r = await client.query(
    `SELECT ${INVITATION_SELECT}
       FROM blessboard.user_invitations
      WHERE id = $1
      LIMIT 1${lock}`,
    [invitationId]
  );
  return mapInvitation(r.rows[0] || null);
}

async function insertInvitation(client, fields) {
  const r = await client.query(
    `INSERT INTO blessboard.user_invitations
       (organization_id, church_id, branch_id, email_normalized, email_display,
        phone_normalized, phone_display, display_name,
        role_key, token_hash, status, expires_at, invited_by_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11::timestamptz, $12)
     RETURNING ${INVITATION_SELECT}`,
    [
      fields.organizationId,
      fields.churchId,
      fields.branchId || null,
      fields.emailNormalized != null ? fields.emailNormalized : null,
      fields.emailDisplay != null ? fields.emailDisplay : null,
      fields.phoneNormalized != null ? fields.phoneNormalized : null,
      fields.phoneDisplay != null ? fields.phoneDisplay : null,
      fields.displayName,
      fields.roleKey,
      fields.tokenHash,
      fields.expiresAt,
      fields.invitedByUserId || null,
    ]
  );
  return mapInvitation(r.rows[0]);
}

async function markRevoked(client, invitationId, revokedByUserId) {
  const r = await client.query(
    `UPDATE blessboard.user_invitations
        SET status = 'revoked',
            revoked_at = now(),
            revoked_by_user_id = $2,
            updated_at = now()
      WHERE id = $1 AND status = 'pending'
      RETURNING ${INVITATION_SELECT}`,
    [invitationId, revokedByUserId || null]
  );
  return mapInvitation(r.rows[0] || null);
}

async function markExpired(client, invitationId) {
  const r = await client.query(
    `UPDATE blessboard.user_invitations
        SET status = 'expired', updated_at = now()
      WHERE id = $1 AND status = 'pending'
      RETURNING id, status`,
    [invitationId]
  );
  return r.rows[0] || null;
}

async function markAccepted(client, invitationId, userId) {
  const r = await client.query(
    `UPDATE blessboard.user_invitations
        SET status = 'accepted',
            accepted_user_id = $2,
            accepted_at = now(),
            updated_at = now()
      WHERE id = $1 AND status = 'pending'
      RETURNING ${INVITATION_SELECT}`,
    [invitationId, userId]
  );
  return mapInvitation(r.rows[0] || null);
}

async function listPendingForChurch(client, fields) {
  const r = await client.query(
    `SELECT i.id, i.organization_id, i.church_id, i.branch_id, i.email_normalized, i.email_display,
            i.display_name, i.role_key, i.token_hash, i.status, i.expires_at, i.invited_by_user_id,
            i.accepted_user_id, i.accepted_at, i.revoked_at, i.revoked_by_user_id, i.created_at, i.updated_at,
            i.delivery_status, i.delivery_attempted_at, i.delivery_error_code,
            b.branch_key, b.display_name AS branch_display_name
       FROM blessboard.user_invitations i
       LEFT JOIN blessboard.branches b ON b.id = i.branch_id
      WHERE i.organization_id = $1
        AND i.church_id = $2
        AND i.status = 'pending'
        AND i.expires_at > now()
      ORDER BY i.created_at DESC
      LIMIT $3`,
    [fields.organizationId, fields.churchId, Math.min(Math.max(Number(fields.limit) || 50, 1), 100)]
  );
  return r.rows.map(mapInvitation);
}

/**
 * Pending invitations that would create a new staff seat (email has no active staff role in org).
 */
async function countPendingNewStaffSeats(client, organizationId) {
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
  return Number(rows[0].n) || 0;
}

module.exports = {
  mapInvitation,
  findPendingByScope,
  findByTokenHash,
  findById,
  insertInvitation,
  markRevoked,
  markExpired,
  markAccepted,
  listPendingForChurch,
  countPendingNewStaffSeats,
};
