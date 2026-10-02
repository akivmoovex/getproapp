"use strict";

/**
 * ActiveClinic staff invitation persistence.
 */

function mapInvitation(row) {
  if (!row) return null;
  return {
    id: row.id != null ? String(row.id) : null,
    organizationId:
      row.organization_id != null ? String(row.organization_id) : null,
    healthcareOrganizationId:
      row.healthcare_organization_id != null
        ? String(row.healthcare_organization_id)
        : null,
    staffMemberId:
      row.staff_member_id != null ? String(row.staff_member_id) : null,
    platformIdentityId:
      row.platform_identity_id != null
        ? String(row.platform_identity_id)
        : null,
    status: row.status != null ? String(row.status) : null,
    issuedAt: row.issued_at || null,
    expiresAt: row.expires_at || null,
    acceptedAt: row.accepted_at || null,
    revokedAt: row.revoked_at || null,
    currentTokenId:
      row.current_token_id != null ? String(row.current_token_id) : null,
    issuedByPlatformIdentityId:
      row.issued_by_platform_identity_id != null
        ? String(row.issued_by_platform_identity_id)
        : null,
    deliveryStatus:
      row.delivery_status != null ? String(row.delivery_status) : null,
    deliveryMethod:
      row.delivery_method != null ? String(row.delivery_method) : null,
    deliveryAttemptedAt: row.delivery_attempted_at || null,
    deliveryErrorCode:
      row.delivery_error_code != null ? String(row.delivery_error_code) : null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

/**
 * @param {{ query: Function }} db
 * @param {object} fields
 */
async function insertInvitation(db, fields) {
  const res = await db.query(
    `INSERT INTO activeclinic.staff_invitations (
       organization_id, healthcare_organization_id, staff_member_id,
       platform_identity_id, status, expires_at, current_token_id,
       issued_by_platform_identity_id, delivery_status, delivery_method,
       delivery_attempted_at, delivery_error_code
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      fields.organizationId,
      fields.healthcareOrganizationId,
      fields.staffMemberId,
      fields.platformIdentityId,
      fields.status || "pending",
      fields.expiresAt,
      fields.currentTokenId || null,
      fields.issuedByPlatformIdentityId || null,
      fields.deliveryStatus || "link_generated",
      fields.deliveryMethod || "copy_link",
      fields.deliveryAttemptedAt || null,
      fields.deliveryErrorCode || null,
    ]
  );
  return mapInvitation(res.rows[0]);
}

/**
 * @param {{ query: Function }} db
 * @param {{ id: string, organizationId: string }} input
 */
async function findByIdAndOrganization(db, input) {
  const res = await db.query(
    `SELECT * FROM activeclinic.staff_invitations
      WHERE id = $1 AND organization_id = $2
      LIMIT 1`,
    [input.id, input.organizationId]
  );
  return mapInvitation(res.rows[0] || null);
}

/**
 * @param {{ query: Function }} db
 * @param {{ staffMemberId: string, organizationId: string }} input
 */
async function findPendingByStaff(db, input) {
  const res = await db.query(
    `SELECT * FROM activeclinic.staff_invitations
      WHERE staff_member_id = $1
        AND organization_id = $2
        AND status = 'pending'
      LIMIT 1`,
    [input.staffMemberId, input.organizationId]
  );
  return mapInvitation(res.rows[0] || null);
}

/**
 * @param {{ query: Function }} db
 * @param {string} invitationId
 */
async function findById(db, invitationId) {
  const res = await db.query(
    `SELECT * FROM activeclinic.staff_invitations WHERE id = $1 LIMIT 1`,
    [invitationId]
  );
  return mapInvitation(res.rows[0] || null);
}

/**
 * @param {{ query: Function }} db
 * @param {{ organizationId: string, status?: string|null }} input
 */
async function listByOrganization(db, input) {
  const params = [input.organizationId];
  let sql = `SELECT * FROM activeclinic.staff_invitations
              WHERE organization_id = $1`;
  if (input.status) {
    params.push(input.status);
    sql += ` AND status = $${params.length}`;
  }
  sql += ` ORDER BY issued_at DESC`;
  const res = await db.query(sql, params);
  return res.rows.map(mapInvitation);
}

/**
 * @param {{ query: Function }} db
 * @param {{ staffMemberId: string, organizationId: string }} input
 */
async function listByStaff(db, input) {
  const res = await db.query(
    `SELECT * FROM activeclinic.staff_invitations
      WHERE staff_member_id = $1 AND organization_id = $2
      ORDER BY issued_at DESC`,
    [input.staffMemberId, input.organizationId]
  );
  return res.rows.map(mapInvitation);
}

/**
 * @param {{ query: Function }} db
 * @param {{ id: string, patch: object }} input
 */
async function updateInvitation(db, input) {
  const patch = input.patch || {};
  const sets = [];
  const params = [input.id];
  function add(col, value) {
    params.push(value);
    sets.push(`${col} = $${params.length}`);
  }
  if (patch.status !== undefined) add("status", patch.status);
  if (patch.expiresAt !== undefined) add("expires_at", patch.expiresAt);
  if (patch.acceptedAt !== undefined) add("accepted_at", patch.acceptedAt);
  if (patch.revokedAt !== undefined) add("revoked_at", patch.revokedAt);
  if (patch.currentTokenId !== undefined) {
    add("current_token_id", patch.currentTokenId);
  }
  if (patch.deliveryStatus !== undefined) {
    add("delivery_status", patch.deliveryStatus);
  }
  if (patch.deliveryMethod !== undefined) {
    add("delivery_method", patch.deliveryMethod);
  }
  if (patch.deliveryAttemptedAt !== undefined) {
    add("delivery_attempted_at", patch.deliveryAttemptedAt);
  }
  if (patch.deliveryErrorCode !== undefined) {
    add("delivery_error_code", patch.deliveryErrorCode);
  }
  if (patch.issuedAt !== undefined) add("issued_at", patch.issuedAt);
  if (patch.platformIdentityId !== undefined) {
    add("platform_identity_id", patch.platformIdentityId);
  }
  if (!sets.length) {
    return findById(db, input.id);
  }
  const res = await db.query(
    `UPDATE activeclinic.staff_invitations
        SET ${sets.join(", ")}
      WHERE id = $1
      RETURNING *`,
    params
  );
  return mapInvitation(res.rows[0] || null);
}

/**
 * @param {{ query: Function }} db
 * @param {string} tokenId
 */
async function findByCurrentTokenId(db, tokenId) {
  const res = await db.query(
    `SELECT * FROM activeclinic.staff_invitations
      WHERE current_token_id = $1
      LIMIT 1`,
    [tokenId]
  );
  return mapInvitation(res.rows[0] || null);
}

module.exports = {
  mapInvitation,
  insertInvitation,
  findByIdAndOrganization,
  findPendingByStaff,
  findById,
  findByCurrentTokenId,
  listByOrganization,
  listByStaff,
  updateInvitation,
};
