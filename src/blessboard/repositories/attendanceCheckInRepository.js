"use strict";

/**
 * DB persistence for attendance check-ins + opaque tokens (V2.04).
 */

async function insertCheckIn(client, row) {
  const { rows } = await client.query(
    `INSERT INTO blessboard.attendance_check_ins (
       organization_id, church_id, session_id, member_id,
       membership_branch_id, attendance_branch_id,
       method, status, late_arrival, wrong_branch, needs_review,
       checked_in_at, checked_in_by_user_id, metadata_json
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,COALESCE($14::jsonb, '{}'::jsonb)
     )
     RETURNING *`,
    [
      row.organizationId,
      row.churchId,
      row.sessionId,
      row.memberId,
      row.membershipBranchId || null,
      row.attendanceBranchId,
      row.method,
      row.status || "present",
      row.lateArrival === true,
      row.wrongBranch === true,
      row.needsReview === true,
      row.checkedInAt || new Date(),
      row.checkedInByUserId || null,
      row.metadataJson ? JSON.stringify(row.metadataJson) : null,
    ]
  );
  return mapCheckIn(rows[0]);
}

async function findActiveCheckInBySessionMember(client, { sessionId, memberId }) {
  if (!sessionId || !memberId) return null;
  const { rows } = await client.query(
    `SELECT * FROM blessboard.attendance_check_ins
      WHERE session_id = $1 AND member_id = $2 AND status <> 'voided'
      LIMIT 1`,
    [sessionId, memberId]
  );
  return mapCheckIn(rows[0] || null);
}

async function listCheckInsForSession(client, sessionId, limit) {
  const lim = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const { rows } = await client.query(
    `SELECT c.*, m.first_name, m.last_name, m.preferred_name, m.member_number
       FROM blessboard.attendance_check_ins c
       LEFT JOIN blessboard.members m ON m.id = c.member_id
      WHERE c.session_id = $1
        AND c.status <> 'voided'
      ORDER BY c.checked_in_at DESC
      LIMIT $2`,
    [sessionId, lim]
  );
  return rows.map((r) => ({
    ...mapCheckIn(r),
    memberName:
      [r.first_name, r.last_name].filter(Boolean).join(" ") || "Member",
    preferredName: r.preferred_name || null,
    memberNumber: r.member_number || null,
  }));
}

function mapCheckIn(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organizationId || row.organization_id,
    churchId: row.churchId || row.church_id,
    sessionId: row.sessionId || row.session_id,
    memberId: row.memberId || row.member_id,
    membershipBranchId:
      row.membershipBranchId != null
        ? row.membershipBranchId
        : row.membership_branch_id,
    attendanceBranchId:
      row.attendanceBranchId || row.attendance_branch_id,
    method: row.method,
    status: row.status,
    lateArrival:
      row.lateArrival != null ? row.lateArrival === true : row.late_arrival === true,
    wrongBranch:
      row.wrongBranch != null ? row.wrongBranch === true : row.wrong_branch === true,
    needsReview:
      row.needsReview != null ? row.needsReview === true : row.needs_review === true,
    checkedInAt: row.checkedInAt || row.checked_in_at,
    checkedInByUserId:
      row.checkedInByUserId || row.checked_in_by_user_id || null,
  };
}

async function insertToken(client, row) {
  const { rows } = await client.query(
    `INSERT INTO blessboard.attendance_check_in_tokens (
       organization_id, church_id, session_id, token_kind, token_hash,
       member_id, expires_at, created_by_user_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      row.organizationId,
      row.churchId,
      row.sessionId,
      row.tokenKind,
      row.tokenHash,
      row.memberId || null,
      row.expiresAt,
      row.createdByUserId || null,
    ]
  );
  return rows[0] || null;
}

async function findTokenByHash(client, tokenHash) {
  const { rows } = await client.query(
    `SELECT * FROM blessboard.attendance_check_in_tokens
      WHERE token_hash = $1
      LIMIT 1`,
    [tokenHash]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    churchId: row.church_id,
    sessionId: row.session_id,
    tokenKind: row.token_kind,
    tokenHash: row.token_hash,
    memberId: row.member_id,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    redeemedAt: row.redeemed_at,
  };
}

/**
 * Load member with primary membership branch for wrong-branch evaluation.
 */
async function findMemberForCheckIn(client, memberId) {
  const { rows } = await client.query(
    `SELECT m.id, m.church_id, m.status, m.member_number,
            m.first_name, m.last_name, m.preferred_name,
            m.phone_display, m.email_display,
            mb.branch_id AS primary_branch_id
       FROM blessboard.members m
       LEFT JOIN LATERAL (
         SELECT mb2.branch_id
           FROM blessboard.member_branch_memberships mb2
          WHERE mb2.member_id = m.id
          ORDER BY mb2.is_primary DESC, mb2.joined_at ASC NULLS LAST, mb2.id ASC
          LIMIT 1
       ) mb ON true
      WHERE m.id = $1
      LIMIT 1`,
    [memberId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    churchId: row.church_id,
    status: row.status,
    memberNumber: row.member_number,
    firstName: row.first_name,
    lastName: row.last_name,
    preferredName: row.preferred_name,
    phoneDisplay: row.phone_display,
    emailDisplay: row.email_display,
    primaryBranchId: row.primary_branch_id || null,
    branchId: row.primary_branch_id || null,
  };
}

async function findCheckInById(client, checkInId) {
  const { rows } = await client.query(
    `SELECT c.*, m.first_name, m.last_name, m.preferred_name, m.member_number,
            s.status AS session_status, s.branch_id AS session_branch_id,
            s.title AS session_title, s.service_event_ref
       FROM blessboard.attendance_check_ins c
       LEFT JOIN blessboard.members m ON m.id = c.member_id
       LEFT JOIN blessboard.attendance_sessions s ON s.id = c.session_id
      WHERE c.id = $1
      LIMIT 1`,
    [checkInId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...mapCheckIn(row),
    memberName: [row.first_name, row.last_name].filter(Boolean).join(" ") || "Member",
    preferredName: row.preferred_name || null,
    memberNumber: row.member_number || null,
    sessionStatus: row.session_status || null,
    sessionBranchId: row.session_branch_id || null,
    sessionTitle: row.session_title || row.service_event_ref || null,
  };
}

/**
 * Apply correction fields only — never updates method or checked_in_at.
 */
async function applyCheckInCorrection(client, { checkInId, correctedValue }) {
  const status = correctedValue && correctedValue.status != null
    ? String(correctedValue.status).trim().toLowerCase()
    : null;
  const lateArrival =
    correctedValue && correctedValue.lateArrival != null
      ? correctedValue.lateArrival === true
      : null;
  const wrongBranch =
    correctedValue && correctedValue.wrongBranch != null
      ? correctedValue.wrongBranch === true
      : null;
  const needsReview =
    correctedValue && correctedValue.needsReview != null
      ? correctedValue.needsReview === true
      : null;

  const { rows } = await client.query(
    `UPDATE blessboard.attendance_check_ins SET
       status = COALESCE($2, status),
       late_arrival = COALESCE($3, late_arrival),
       wrong_branch = COALESCE($4, wrong_branch),
       needs_review = COALESCE($5, needs_review),
       voided_at = CASE WHEN $2 = 'voided' THEN COALESCE(voided_at, now()) ELSE voided_at END,
       updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [checkInId, status, lateArrival, wrongBranch, needsReview]
  );
  return mapCheckIn(rows[0] || null);
}

async function insertCorrection(client, row) {
  const { rows } = await client.query(
    `INSERT INTO blessboard.attendance_corrections (
       id, organization_id, church_id, check_in_id, actor_user_id,
       original_value_json, corrected_value_json, reason, created_at
     ) VALUES (
       COALESCE($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, COALESCE($9::timestamptz, now())
     )
     RETURNING *`,
    [
      row.id || null,
      row.organizationId,
      row.churchId,
      row.checkInId,
      row.actorUserId,
      JSON.stringify(row.originalValue || {}),
      JSON.stringify(row.correctedValue || {}),
      row.reason,
      row.createdAt || null,
    ]
  );
  return mapCorrection(rows[0]);
}

async function findCorrectionById(client, correctionId) {
  const { rows } = await client.query(
    `SELECT * FROM blessboard.attendance_corrections WHERE id = $1 LIMIT 1`,
    [correctionId]
  );
  return mapCorrection(rows[0] || null);
}

async function listCorrectionsForSession(client, sessionId, limit) {
  const lim = Math.min(Math.max(Number(limit) || 100, 1), 300);
  const { rows } = await client.query(
    `SELECT corr.*, c.method, c.checked_in_at, c.member_id,
            m.first_name, m.last_name, m.member_number
       FROM blessboard.attendance_corrections corr
       INNER JOIN blessboard.attendance_check_ins c ON c.id = corr.check_in_id
       LEFT JOIN blessboard.members m ON m.id = c.member_id
      WHERE c.session_id = $1
      ORDER BY corr.created_at DESC
      LIMIT $2`,
    [sessionId, lim]
  );
  return rows.map((r) => ({
    ...mapCorrection(r),
    method: r.method,
    checkedInAt: r.checked_in_at,
    memberId: r.member_id,
    memberName: [r.first_name, r.last_name].filter(Boolean).join(" ") || "Member",
    memberNumber: r.member_number || null,
  }));
}

async function listCorrectionsForCheckIn(client, checkInId) {
  const { rows } = await client.query(
    `SELECT * FROM blessboard.attendance_corrections
      WHERE check_in_id = $1
      ORDER BY created_at DESC`,
    [checkInId]
  );
  return rows.map(mapCorrection);
}

function mapCorrection(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organizationId || row.organization_id,
    churchId: row.churchId || row.church_id,
    checkInId: row.checkInId || row.check_in_id,
    actorUserId: row.actorUserId || row.actor_user_id,
    originalValue: row.originalValue || row.original_value_json || {},
    correctedValue: row.correctedValue || row.corrected_value_json || {},
    reason: row.reason,
    createdAt: row.createdAt || row.created_at,
  };
}

function createDbCheckInStore(getClient) {
  return {
    async insert(db, row) {
      const client = getClient ? await getClient(db) : db;
      return insertCheckIn(client, row);
    },
    async findById(db, checkInId) {
      const client = getClient ? await getClient(db) : db;
      return findCheckInById(client, checkInId);
    },
    async findActiveBySessionMember(db, args) {
      const client = getClient ? await getClient(db) : db;
      return findActiveCheckInBySessionMember(client, args);
    },
    async listForSession(db, sessionId, limit) {
      const client = getClient ? await getClient(db) : db;
      return listCheckInsForSession(client, sessionId, limit);
    },
    async applyCorrection(db, args) {
      const client = getClient ? await getClient(db) : db;
      return applyCheckInCorrection(client, args);
    },
  };
}

function createDbCorrectionStore(getClient) {
  return {
    async insert(db, row) {
      const client = getClient ? await getClient(db) : db;
      return insertCorrection(client, row);
    },
    async findById(db, id) {
      const client = getClient ? await getClient(db) : db;
      return findCorrectionById(client, id);
    },
    async listForSession(db, sessionId, limit) {
      const client = getClient ? await getClient(db) : db;
      return listCorrectionsForSession(client, sessionId, limit);
    },
    async listForCheckIn(db, checkInId) {
      const client = getClient ? await getClient(db) : db;
      return listCorrectionsForCheckIn(client, checkInId);
    },
  };
}

function createDbTokenStore(getClient) {
  return {
    async insert(db, row) {
      const client = getClient ? await getClient(db) : db;
      return insertToken(client, row);
    },
    async findByHash(db, tokenHash) {
      const client = getClient ? await getClient(db) : db;
      return findTokenByHash(client, tokenHash);
    },
  };
}

function createDbMemberStore(getClient) {
  return {
    async findById(db, memberId) {
      const client = getClient ? await getClient(db) : db;
      return findMemberForCheckIn(client, memberId);
    },
  };
}

module.exports = {
  insertCheckIn,
  findActiveCheckInBySessionMember,
  listCheckInsForSession,
  findCheckInById,
  applyCheckInCorrection,
  mapCheckIn,
  insertToken,
  findTokenByHash,
  findMemberForCheckIn,
  insertCorrection,
  findCorrectionById,
  listCorrectionsForSession,
  listCorrectionsForCheckIn,
  mapCorrection,
  createDbCheckInStore,
  createDbTokenStore,
  createDbMemberStore,
  createDbCorrectionStore,
};
