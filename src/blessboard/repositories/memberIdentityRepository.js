"use strict";

/**
 * Member identity repositories (profiles, memberships, registrations).
 * No binary data; no sensitive category fields.
 */

function mapMember(row) {
  if (!row) return null;
  return {
    id: row.id,
    churchId: row.church_id,
    userId: row.user_id,
    firstName: row.first_name,
    lastName: row.last_name,
    preferredName: row.preferred_name,
    emailNormalized: row.email_normalized,
    emailDisplay: row.email_display,
    phoneNormalized: row.phone_normalized,
    phoneDisplay: row.phone_display,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMembership(row) {
  if (!row) return null;
  return {
    id: row.id,
    memberId: row.member_id,
    branchId: row.branch_id,
    membershipStatus: row.membership_status,
    isPrimary: Boolean(row.is_primary),
    joinedAt: row.joined_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRegistration(row) {
  if (!row) return null;
  return {
    id: row.id,
    churchId: row.church_id,
    branchId: row.branch_id,
    firstName: row.first_name,
    lastName: row.last_name,
    preferredName: row.preferred_name,
    emailNormalized: row.email_normalized,
    emailDisplay: row.email_display,
    phoneNormalized: row.phone_normalized,
    phoneDisplay: row.phone_display,
    status: row.status,
    memberId: row.member_id,
    reviewedByUserId: row.reviewed_by_user_id,
    reviewedAt: row.reviewed_at,
    reviewNotes: row.review_notes,
    intakeFormId: row.intake_form_id || null,
    applicationJson: row.application_json || {},
    pastoralNotes: row.pastoral_notes || null,
    pastoralNotesUpdatedAt: row.pastoral_notes_updated_at || null,
    pastoralNotesUpdatedByUserId: row.pastoral_notes_updated_by_user_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    branchKey: row.branch_key || null,
    branchDisplayName: row.branch_display_name || null,
  };
}

const MEMBER_COLS = `id, church_id, user_id, first_name, last_name, preferred_name,
                     email_normalized, email_display, phone_normalized, phone_display,
                     status, created_at, updated_at`;

const MEMBERSHIP_COLS = `id, member_id, branch_id, membership_status, is_primary,
                         joined_at, created_at, updated_at`;

const REGISTRATION_COLS = `id, church_id, branch_id, first_name, last_name, preferred_name,
                           email_normalized, email_display, phone_normalized, phone_display,
                           status, member_id, reviewed_by_user_id, reviewed_at, review_notes,
                           intake_form_id, application_json, pastoral_notes,
                           pastoral_notes_updated_at, pastoral_notes_updated_by_user_id,
                           created_at, updated_at`;

async function findMemberById(client, id) {
  const { rows } = await client.query(
    `SELECT ${MEMBER_COLS} FROM blessboard.members WHERE id = $1`,
    [id]
  );
  return mapMember(rows[0] || null);
}

/**
 * Active member linked to a login user within a church.
 * @param {{ query: Function }} client
 * @param {{ churchId: string, userId: string }} input
 */
async function findActiveMemberByUserId(client, input) {
  const { rows } = await client.query(
    `SELECT ${MEMBER_COLS}
       FROM blessboard.members
      WHERE church_id = $1
        AND user_id = $2
        AND status = 'active'
      LIMIT 1`,
    [input.churchId, input.userId]
  );
  return mapMember(rows[0] || null);
}

/**
 * @param {{ query: Function }} client
 * @param {{
 *   memberId: string,
 *   preferredName?: string|null,
 *   emailDisplay?: string|null,
 *   phoneNormalized?: string|null,
 *   phoneDisplay?: string|null,
 * }} fields
 */
async function updateMemberProfileFields(client, fields) {
  const { rows } = await client.query(
    `UPDATE blessboard.members
        SET first_name = COALESCE($2, first_name),
            last_name = COALESCE($3, last_name),
            preferred_name = CASE WHEN $4::boolean THEN $5 ELSE preferred_name END,
            email_display = CASE WHEN $6::boolean THEN $7 ELSE email_display END,
            email_normalized = CASE WHEN $6::boolean THEN lower(trim($7)) ELSE email_normalized END,
            phone_normalized = CASE WHEN $8::boolean THEN $9 ELSE phone_normalized END,
            phone_display = CASE WHEN $10::boolean THEN $11 ELSE phone_display END,
            updated_at = now()
      WHERE id = $1
        AND status IN ('active', 'pending', 'inactive')
      RETURNING ${MEMBER_COLS}`,
    [
      fields.memberId,
      fields.firstName != null ? fields.firstName : null,
      fields.lastName != null ? fields.lastName : null,
      fields.preferredName !== undefined,
      fields.preferredName !== undefined ? fields.preferredName : null,
      fields.emailDisplay !== undefined,
      fields.emailDisplay !== undefined ? fields.emailDisplay : null,
      fields.phoneNormalized !== undefined,
      fields.phoneNormalized !== undefined ? fields.phoneNormalized : null,
      fields.phoneDisplay !== undefined,
      fields.phoneDisplay !== undefined ? fields.phoneDisplay : null,
    ]
  );
  return mapMember(rows[0] || null);
}

async function findLiveMemberByEmail(client, churchId, emailNormalized) {
  if (!emailNormalized) return null;
  const { rows } = await client.query(
    `SELECT ${MEMBER_COLS}
       FROM blessboard.members
      WHERE church_id = $1
        AND email_normalized = $2
        AND status IN ('pending', 'active', 'inactive', 'suspended')
      LIMIT 1`,
    [churchId, emailNormalized]
  );
  return mapMember(rows[0] || null);
}

async function findLiveMemberByPhone(client, churchId, phoneNormalized) {
  if (!phoneNormalized) return null;
  const { rows } = await client.query(
    `SELECT ${MEMBER_COLS}
       FROM blessboard.members
      WHERE church_id = $1
        AND phone_normalized = $2
        AND status IN ('pending', 'active', 'inactive', 'suspended')
      LIMIT 1`,
    [churchId, phoneNormalized]
  );
  return mapMember(rows[0] || null);
}

async function insertMember(client, fields) {
  const { rows } = await client.query(
    `INSERT INTO blessboard.members
       (church_id, user_id, first_name, last_name, preferred_name,
        email_normalized, email_display, phone_normalized, phone_display, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING ${MEMBER_COLS}`,
    [
      fields.churchId,
      fields.userId || null,
      fields.firstName,
      fields.lastName,
      fields.preferredName || null,
      fields.emailNormalized || null,
      fields.emailDisplay || null,
      fields.phoneNormalized || null,
      fields.phoneDisplay || null,
      fields.status || "pending",
    ]
  );
  return mapMember(rows[0]);
}

async function updateMemberUserId(client, { memberId, userId }) {
  const { rows } = await client.query(
    `UPDATE blessboard.members
        SET user_id = $2,
            updated_at = now()
      WHERE id = $1
      RETURNING ${MEMBER_COLS}`,
    [memberId, userId]
  );
  return mapMember(rows[0] || null);
}

async function updateMemberStatus(client, { memberId, status }) {
  const { rows } = await client.query(
    `UPDATE blessboard.members
        SET status = $2,
            updated_at = now()
      WHERE id = $1
      RETURNING ${MEMBER_COLS}`,
    [memberId, status]
  );
  return mapMember(rows[0] || null);
}

async function findMembership(client, memberId, branchId) {
  const { rows } = await client.query(
    `SELECT ${MEMBERSHIP_COLS}
       FROM blessboard.member_branch_memberships
      WHERE member_id = $1 AND branch_id = $2
      LIMIT 1`,
    [memberId, branchId]
  );
  return mapMembership(rows[0] || null);
}

async function countPrimaryMemberships(client, memberId) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS n
       FROM blessboard.member_branch_memberships
      WHERE member_id = $1 AND is_primary = true`,
    [memberId]
  );
  return rows[0] ? Number(rows[0].n) : 0;
}

async function insertMembership(client, fields) {
  const { rows } = await client.query(
    `INSERT INTO blessboard.member_branch_memberships
       (member_id, branch_id, membership_status, is_primary, joined_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${MEMBERSHIP_COLS}`,
    [
      fields.memberId,
      fields.branchId,
      fields.membershipStatus || "active",
      Boolean(fields.isPrimary),
      fields.joinedAt || null,
    ]
  );
  return mapMembership(rows[0]);
}

async function findRegistrationById(client, id) {
  const { rows } = await client.query(
    `SELECT ${REGISTRATION_COLS} FROM blessboard.member_registrations WHERE id = $1 FOR UPDATE`,
    [id]
  );
  return mapRegistration(rows[0] || null);
}

async function findRegistrationByIdReadonly(client, id) {
  const { rows } = await client.query(
    `SELECT ${REGISTRATION_COLS} FROM blessboard.member_registrations WHERE id = $1`,
    [id]
  );
  return mapRegistration(rows[0] || null);
}

async function findOpenRegistrationByEmail(client, churchId, emailNormalized) {
  if (!emailNormalized) return null;
  const { rows } = await client.query(
    `SELECT ${REGISTRATION_COLS}
       FROM blessboard.member_registrations
      WHERE church_id = $1
        AND email_normalized = $2
        AND status IN ('submitted', 'under_review', 'needs_follow_up')
      LIMIT 1`,
    [churchId, emailNormalized]
  );
  return mapRegistration(rows[0] || null);
}

async function findOpenRegistrationByPhone(client, churchId, phoneNormalized) {
  if (!phoneNormalized) return null;
  const { rows } = await client.query(
    `SELECT ${REGISTRATION_COLS}
       FROM blessboard.member_registrations
      WHERE church_id = $1
        AND phone_normalized = $2
        AND status IN ('submitted', 'under_review', 'needs_follow_up')
      LIMIT 1`,
    [churchId, phoneNormalized]
  );
  return mapRegistration(rows[0] || null);
}

async function insertRegistration(client, fields) {
  const { rows } = await client.query(
    `INSERT INTO blessboard.member_registrations
       (church_id, branch_id, first_name, last_name, preferred_name,
        email_normalized, email_display, phone_normalized, phone_display, status,
        intake_form_id, application_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'submitted', $10, $11::jsonb)
     RETURNING ${REGISTRATION_COLS}`,
    [
      fields.churchId,
      fields.branchId,
      fields.firstName,
      fields.lastName,
      fields.preferredName || null,
      fields.emailNormalized || null,
      fields.emailDisplay || null,
      fields.phoneNormalized || null,
      fields.phoneDisplay || null,
      fields.intakeFormId || null,
      JSON.stringify(fields.applicationJson || {}),
    ]
  );
  return mapRegistration(rows[0]);
}

async function updateRegistrationStatus(client, fields) {
  const { rows } = await client.query(
    `UPDATE blessboard.member_registrations
        SET status = $2,
            member_id = COALESCE($3, member_id),
            reviewed_by_user_id = COALESCE($4, reviewed_by_user_id),
            reviewed_at = COALESCE($5, reviewed_at),
            review_notes = COALESCE($6, review_notes),
            updated_at = now()
      WHERE id = $1
      RETURNING ${REGISTRATION_COLS}`,
    [
      fields.id,
      fields.status,
      fields.memberId !== undefined ? fields.memberId : null,
      fields.reviewedByUserId !== undefined ? fields.reviewedByUserId : null,
      fields.reviewedAt !== undefined ? fields.reviewedAt : null,
      fields.reviewNotes !== undefined ? fields.reviewNotes : null,
    ]
  );
  return mapRegistration(rows[0] || null);
}

async function findBranchById(client, branchId) {
  const { rows } = await client.query(
    `SELECT id, church_id, branch_key, display_name, status
       FROM blessboard.branches
      WHERE id = $1
      LIMIT 1`,
    [branchId]
  );
  return rows[0] || null;
}

async function findChurchById(client, churchId) {
  const { rows } = await client.query(
    `SELECT id, organization_id, church_key, status
       FROM blessboard.churches
      WHERE id = $1
      LIMIT 1`,
    [churchId]
  );
  return rows[0] || null;
}

async function findUserById(client, userId) {
  const { rows } = await client.query(
    `SELECT id, email_normalized, email_display, display_name, status,
            phone_normalized, phone_display
       FROM blessboard.users
      WHERE id = $1
      LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

/**
 * Bounded list/search for manager UI. Never returns more than maxLimit rows.
 * @param {{ query: Function }} client
 * @param {{
 *   churchId: string,
 *   branchId?: string|null,
 *   status?: string|null,
 *   q?: string|null,
 *   limit?: number,
 *   offset?: number,
 * }} input
 */
async function listRegistrations(client, input) {
  const churchId = String(input.churchId || "").trim();
  const branchId =
    input.branchId != null && String(input.branchId).trim()
      ? String(input.branchId).trim()
      : null;
  const status =
    input.status != null && String(input.status).trim()
      ? String(input.status).trim().toLowerCase()
      : null;
  const qRaw = input.q != null ? String(input.q).trim() : "";
  const q = qRaw.slice(0, 100);
  const limit = Math.min(Math.max(Number(input.limit) || 20, 1), 50);
  const offset = Math.max(Number(input.offset) || 0, 0);

  const where = ["r.church_id = $1"];
  const params = [churchId];
  let i = 2;

  if (branchId) {
    where.push(`r.branch_id = $${i++}`);
    params.push(branchId);
  }
  if (status) {
    where.push(`r.status = $${i++}`);
    params.push(status);
  }
  if (q) {
    const {
      prepareIdentitySearchQuery,
    } = require("../services/phoneFirstIdentityHelpers");
    const search = prepareIdentitySearchQuery(q);
    if (search.phoneNormalized) {
      where.push(
        `(r.phone_normalized = $${i}
          OR lower(r.first_name) LIKE $${i + 1} OR lower(r.last_name) LIKE $${i + 1}
          OR lower(COALESCE(r.preferred_name, '')) LIKE $${i + 1}
          OR lower(COALESCE(r.email_normalized, '')) LIKE $${i + 1})`
      );
      params.push(search.phoneNormalized, search.like);
      i += 2;
    } else {
      const like = `%${q.toLowerCase().replace(/[%_]/g, "")}%`;
      where.push(
        `(lower(r.first_name) LIKE $${i} OR lower(r.last_name) LIKE $${i} OR lower(COALESCE(r.preferred_name, '')) LIKE $${i}
          OR lower(COALESCE(r.email_normalized, '')) LIKE $${i} OR COALESCE(r.phone_normalized, '') LIKE $${i})`
      );
      params.push(like);
      i += 1;
    }
  }

  const whereSql = where.join(" AND ");
  const countParams = params.slice();
  const { rows: countRows } = await client.query(
    `SELECT COUNT(*)::int AS n FROM blessboard.member_registrations r WHERE ${whereSql}`,
    countParams
  );
  const total = countRows[0] ? Number(countRows[0].n) : 0;

  params.push(limit);
  params.push(offset);
  const { rows } = await client.query(
    `SELECT r.id, r.church_id, r.branch_id, r.first_name, r.last_name, r.preferred_name,
            r.email_normalized, r.email_display, r.phone_normalized, r.phone_display,
            r.status, r.member_id, r.reviewed_by_user_id, r.reviewed_at, r.review_notes,
            r.created_at, r.updated_at,
            b.branch_key, b.display_name AS branch_display_name
       FROM blessboard.member_registrations r
       LEFT JOIN blessboard.branches b ON b.id = r.branch_id
      WHERE ${whereSql}
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT $${i++} OFFSET $${i++}`,
    params
  );

  return {
    items: rows.map(mapRegistration),
    total,
    limit,
    offset,
  };
}

/**
 * Bounded branch member directory for managers (privacy-limited columns).
 * @param {{ query: Function }} client
 * @param {{
 *   churchId: string,
 *   branchId: string,
 *   status?: string|null,
 *   membershipStatus?: string|null,
 *   q?: string|null,
 *   limit?: number,
 *   offset?: number,
 * }} input
 */
async function listMembersForBranch(client, input) {
  const churchId = String(input.churchId || "").trim();
  const branchId = String(input.branchId || "").trim();
  const status =
    input.status != null && String(input.status).trim()
      ? String(input.status).trim().toLowerCase()
      : null;
  const membershipStatus =
    input.membershipStatus != null && String(input.membershipStatus).trim()
      ? String(input.membershipStatus).trim().toLowerCase()
      : null;
  const qRaw = input.q != null ? String(input.q).trim() : "";
  const q = qRaw.slice(0, 100);
  const limit = Math.min(Math.max(Number(input.limit) || 20, 1), 50);
  const offset = Math.max(Number(input.offset) || 0, 0);

  const where = ["m.church_id = $1", "mb.branch_id = $2"];
  const params = [churchId, branchId];
  let i = 3;

  if (status) {
    where.push(`m.status = $${i++}`);
    params.push(status);
  }
  if (membershipStatus) {
    where.push(`mb.membership_status = $${i++}`);
    params.push(membershipStatus);
  }
  if (q) {
    const {
      prepareIdentitySearchQuery,
    } = require("../services/phoneFirstIdentityHelpers");
    const search = prepareIdentitySearchQuery(q);
    const like = search.like;
    // Use normalized phone equality when query looks like a phone.
    if (search.phoneNormalized) {
      where.push(
        `(m.phone_normalized = $${i}
          OR lower(m.first_name) LIKE $${i + 1} OR lower(m.last_name) LIKE $${i + 1}
          OR lower(COALESCE(m.preferred_name, '')) LIKE $${i + 1}
          OR lower(COALESCE(m.email_normalized, '')) LIKE $${i + 1})`
      );
      params.push(search.phoneNormalized, like);
      i += 2;
    } else {
      where.push(
        `(lower(m.first_name) LIKE $${i} OR lower(m.last_name) LIKE $${i} OR lower(COALESCE(m.preferred_name, '')) LIKE $${i}
          OR lower(COALESCE(m.email_normalized, '')) LIKE $${i} OR COALESCE(m.phone_normalized, '') LIKE $${i}
          OR lower(COALESCE(m.phone_display, '')) LIKE $${i})`
      );
      params.push(like);
      i += 1;
    }
  }

  const whereSql = where.join(" AND ");
  const { rows: countRows } = await client.query(
    `SELECT COUNT(*)::int AS n
       FROM blessboard.members m
       INNER JOIN blessboard.member_branch_memberships mb ON mb.member_id = m.id
      WHERE ${whereSql}`,
    params
  );
  const total = countRows[0] ? Number(countRows[0].n) : 0;

  params.push(limit);
  params.push(offset);
  const { rows } = await client.query(
    `SELECT m.id, m.church_id, m.user_id, m.first_name, m.last_name, m.preferred_name,
            m.email_normalized, m.email_display, m.phone_normalized, m.phone_display,
            m.status, m.created_at, m.updated_at,
            mb.membership_status, mb.is_primary, mb.joined_at
       FROM blessboard.members m
       INNER JOIN blessboard.member_branch_memberships mb ON mb.member_id = m.id
      WHERE ${whereSql}
      ORDER BY m.last_name ASC, m.first_name ASC, m.id ASC
      LIMIT $${i++} OFFSET $${i++}`,
    params
  );

  return {
    items: rows.map((row) => {
      const member = mapMember(row);
      return {
        ...member,
        membershipStatus: row.membership_status,
        isPrimary: Boolean(row.is_primary),
        joinedAt: row.joined_at,
      };
    }),
    total,
    limit,
    offset,
  };
}

/**
 * Load one member for managers when they have a membership on the scoped branch.
 * @param {{ query: Function }} client
 * @param {{ memberId: string, churchId: string, branchId: string }} input
 */
async function findMemberOnBranch(client, input) {
  const memberId = String(input.memberId || "").trim();
  const churchId = String(input.churchId || "").trim();
  const branchId = String(input.branchId || "").trim();
  const { rows } = await client.query(
    `SELECT m.id, m.church_id, m.user_id, m.first_name, m.last_name, m.preferred_name,
            m.email_normalized, m.email_display, m.phone_normalized, m.phone_display,
            m.status, m.created_at, m.updated_at,
            mb.membership_status, mb.is_primary, mb.joined_at
       FROM blessboard.members m
       INNER JOIN blessboard.member_branch_memberships mb ON mb.member_id = m.id
      WHERE m.id = $1
        AND m.church_id = $2
        AND mb.branch_id = $3
      LIMIT 1`,
    [memberId, churchId, branchId]
  );
  if (!rows[0]) return null;
  const member = mapMember(rows[0]);
  return {
    ...member,
    membershipStatus: rows[0].membership_status,
    isPrimary: Boolean(rows[0].is_primary),
    joinedAt: rows[0].joined_at,
  };
}

/**
 * Church-wide member directory for HQ managers (optional branch filter).
 * @param {{ query: Function }} client
 * @param {{
 *   churchId: string,
 *   branchId?: string|null,
 *   status?: string|null,
 *   q?: string|null,
 *   limit?: number,
 *   offset?: number,
 * }} input
 */
async function listMembersForChurch(client, input) {
  const churchId = String(input.churchId || "").trim();
  const branchId =
    input.branchId != null && String(input.branchId).trim()
      ? String(input.branchId).trim()
      : null;
  const status =
    input.status != null && String(input.status).trim()
      ? String(input.status).trim().toLowerCase()
      : null;
  const qRaw = input.q != null ? String(input.q).trim() : "";
  const q = qRaw.slice(0, 100);
  const limit = Math.min(Math.max(Number(input.limit) || 20, 1), 50);
  const offset = Math.max(Number(input.offset) || 0, 0);

  const where = ["m.church_id = $1"];
  const params = [churchId];
  let i = 2;

  if (branchId) {
    where.push(`mb.branch_id = $${i++}`);
    params.push(branchId);
  }
  if (status) {
    where.push(`m.status = $${i++}`);
    params.push(status);
  }
  if (q) {
    const {
      prepareIdentitySearchQuery,
    } = require("../services/phoneFirstIdentityHelpers");
    const search = prepareIdentitySearchQuery(q);
    const like = search.like;
    // Use normalized phone equality when query looks like a phone.
    if (search.phoneNormalized) {
      where.push(
        `(m.phone_normalized = $${i}
          OR lower(m.first_name) LIKE $${i + 1} OR lower(m.last_name) LIKE $${i + 1}
          OR lower(COALESCE(m.preferred_name, '')) LIKE $${i + 1}
          OR lower(COALESCE(m.email_normalized, '')) LIKE $${i + 1})`
      );
      params.push(search.phoneNormalized, like);
      i += 2;
    } else {
      where.push(
        `(lower(m.first_name) LIKE $${i} OR lower(m.last_name) LIKE $${i} OR lower(COALESCE(m.preferred_name, '')) LIKE $${i}
          OR lower(COALESCE(m.email_normalized, '')) LIKE $${i} OR COALESCE(m.phone_normalized, '') LIKE $${i}
          OR lower(COALESCE(m.phone_display, '')) LIKE $${i})`
      );
      params.push(like);
      i += 1;
    }
  }

  const whereSql = where.join(" AND ");
  const joinSql = branchId
    ? `INNER JOIN blessboard.member_branch_memberships mb ON mb.member_id = m.id`
    : `INNER JOIN LATERAL (
         SELECT mb2.membership_status, mb2.is_primary, mb2.joined_at, mb2.branch_id
           FROM blessboard.member_branch_memberships mb2
          WHERE mb2.member_id = m.id
          ORDER BY mb2.is_primary DESC, mb2.joined_at ASC NULLS LAST, mb2.id ASC
          LIMIT 1
       ) mb ON true`;

  const { rows: countRows } = await client.query(
    `SELECT COUNT(*)::int AS n
       FROM blessboard.members m
       ${joinSql}
      WHERE ${whereSql}`,
    params
  );
  const total = countRows[0] ? Number(countRows[0].n) : 0;

  params.push(limit);
  params.push(offset);
  const { rows } = await client.query(
    `SELECT m.id, m.church_id, m.user_id, m.first_name, m.last_name, m.preferred_name,
            m.email_normalized, m.email_display, m.phone_normalized, m.phone_display,
            m.status, m.created_at, m.updated_at,
            mb.membership_status, mb.is_primary, mb.joined_at,
            b.branch_key, b.display_name AS branch_display_name
       FROM blessboard.members m
       ${joinSql}
       LEFT JOIN blessboard.branches b ON b.id = mb.branch_id
      WHERE ${whereSql}
      ORDER BY m.last_name ASC, m.first_name ASC, m.id ASC
      LIMIT $${i++} OFFSET $${i++}`,
    params
  );

  return {
    items: rows.map((row) => {
      const member = mapMember(row);
      return {
        ...member,
        membershipStatus: row.membership_status,
        isPrimary: Boolean(row.is_primary),
        joinedAt: row.joined_at,
        branchKey: row.branch_key || null,
        branchDisplayName: row.branch_display_name || null,
      };
    }),
    total,
    limit,
    offset,
  };
}

/**
 * Load one member in a church for HQ managers (any membership on the church).
 * @param {{ query: Function }} client
 * @param {{ memberId: string, churchId: string }} input
 */
async function findMemberInChurch(client, input) {
  const memberId = String(input.memberId || "").trim();
  const churchId = String(input.churchId || "").trim();
  const { rows } = await client.query(
    `SELECT m.id, m.church_id, m.user_id, m.first_name, m.last_name, m.preferred_name,
            m.email_normalized, m.email_display, m.phone_normalized, m.phone_display,
            m.status, m.created_at, m.updated_at,
            mb.membership_status, mb.is_primary, mb.joined_at, mb.branch_id,
            b.branch_key, b.display_name AS branch_display_name
       FROM blessboard.members m
       INNER JOIN LATERAL (
         SELECT mb2.membership_status, mb2.is_primary, mb2.joined_at, mb2.branch_id
           FROM blessboard.member_branch_memberships mb2
          WHERE mb2.member_id = m.id
          ORDER BY mb2.is_primary DESC, mb2.joined_at ASC NULLS LAST, mb2.id ASC
          LIMIT 1
       ) mb ON true
       LEFT JOIN blessboard.branches b ON b.id = mb.branch_id
      WHERE m.id = $1
        AND m.church_id = $2
      LIMIT 1`,
    [memberId, churchId]
  );
  if (!rows[0]) return null;
  const member = mapMember(rows[0]);
  return {
    ...member,
    branchId: rows[0].branch_id || null,
    membershipStatus: rows[0].membership_status,
    isPrimary: Boolean(rows[0].is_primary),
    joinedAt: rows[0].joined_at,
    branchKey: rows[0].branch_key || null,
    branchDisplayName: rows[0].branch_display_name || null,
  };
}

function mapIntakeForm(row) {
  if (!row) return null;
  return {
    id: row.id,
    churchId: row.church_id,
    branchId: row.branch_id,
    formKey: row.form_key,
    title: row.title,
    description: row.description,
    status: row.status,
    enableSpiritualBackground: row.enable_spiritual_background !== false,
    enableParticipationInterests: row.enable_participation_interests !== false,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function insertIntakeForm(client, fields) {
  const { rows } = await client.query(
    `INSERT INTO blessboard.membership_intake_forms (
       church_id, branch_id, form_key, title, description, status,
       enable_spiritual_background, enable_participation_interests,
       created_by_user_id, updated_by_user_id
     ) VALUES ($1,$2,$3,$4,$5,'draft',$6,$7,$8,$8)
     RETURNING *`,
    [
      fields.churchId,
      fields.branchId || null,
      fields.formKey,
      fields.title,
      fields.description || null,
      fields.enableSpiritualBackground !== false,
      fields.enableParticipationInterests !== false,
      fields.createdByUserId || null,
    ]
  );
  return mapIntakeForm(rows[0]);
}

async function updateIntakeForm(client, fields) {
  const { rows } = await client.query(
    `UPDATE blessboard.membership_intake_forms SET
       title = COALESCE($3, title),
       description = CASE WHEN $4::boolean THEN $5 ELSE description END,
       enable_spiritual_background = COALESCE($6, enable_spiritual_background),
       enable_participation_interests = COALESCE($7, enable_participation_interests),
       status = COALESCE($8, status),
       published_at = CASE WHEN $9::boolean THEN $10 ELSE published_at END,
       updated_by_user_id = $11,
       updated_at = now()
     WHERE id = $1 AND church_id = $2
     RETURNING *`,
    [
      fields.id,
      fields.churchId,
      fields.title != null ? fields.title : null,
      fields.description !== undefined,
      fields.description != null ? fields.description : null,
      fields.enableSpiritualBackground != null ? fields.enableSpiritualBackground : null,
      fields.enableParticipationInterests != null ? fields.enableParticipationInterests : null,
      fields.status != null ? fields.status : null,
      fields.setPublishedAt === true,
      fields.publishedAt || null,
      fields.updatedByUserId || null,
    ]
  );
  return mapIntakeForm(rows[0] || null);
}

async function getIntakeFormById(client, { id, churchId }) {
  const { rows } = await client.query(
    `SELECT * FROM blessboard.membership_intake_forms
      WHERE id = $1 AND church_id = $2 LIMIT 1`,
    [id, churchId]
  );
  return mapIntakeForm(rows[0] || null);
}

async function getPublishedIntakeFormForChurch(client, { churchId, branchId }) {
  const { rows } = await client.query(
    `SELECT * FROM blessboard.membership_intake_forms
      WHERE church_id = $1
        AND status = 'published'
        AND (branch_id IS NULL OR branch_id = $2)
      ORDER BY CASE WHEN branch_id = $2 THEN 0 ELSE 1 END, published_at DESC NULLS LAST
      LIMIT 1`,
    [churchId, branchId || null]
  );
  return mapIntakeForm(rows[0] || null);
}

async function listIntakeForms(client, { churchId, status }) {
  const params = [churchId];
  let sql = `SELECT * FROM blessboard.membership_intake_forms WHERE church_id = $1`;
  if (status) {
    params.push(status);
    sql += ` AND status = $${params.length}`;
  }
  sql += ` ORDER BY updated_at DESC`;
  const { rows } = await client.query(sql, params);
  return rows.map(mapIntakeForm);
}

async function insertReviewEvent(client, fields) {
  const { rows } = await client.query(
    `INSERT INTO blessboard.member_registration_review_events (
       registration_id, church_id, branch_id, from_status, to_status,
       decision_code, decision_summary, actor_user_id
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING id, registration_id, from_status, to_status, decision_code,
               decision_summary, actor_user_id, created_at`,
    [
      fields.registrationId,
      fields.churchId,
      fields.branchId,
      fields.fromStatus || null,
      fields.toStatus,
      fields.decisionCode,
      fields.decisionSummary || null,
      fields.actorUserId || null,
    ]
  );
  const r = rows[0];
  return {
    id: r.id,
    registrationId: r.registration_id,
    fromStatus: r.from_status,
    toStatus: r.to_status,
    decisionCode: r.decision_code,
    decisionSummary: r.decision_summary,
    actorUserId: r.actor_user_id,
    createdAt: r.created_at,
  };
}

async function listReviewEvents(client, { registrationId, churchId }) {
  const { rows } = await client.query(
    `SELECT id, registration_id, from_status, to_status, decision_code,
            decision_summary, actor_user_id, created_at
       FROM blessboard.member_registration_review_events
      WHERE registration_id = $1 AND church_id = $2
      ORDER BY created_at ASC`,
    [registrationId, churchId]
  );
  return rows.map((r) => ({
    id: r.id,
    registrationId: r.registration_id,
    fromStatus: r.from_status,
    toStatus: r.to_status,
    decisionCode: r.decision_code,
    decisionSummary: r.decision_summary,
    actorUserId: r.actor_user_id,
    createdAt: r.created_at,
  }));
}

async function updatePastoralNotes(client, fields) {
  const { rows } = await client.query(
    `UPDATE blessboard.member_registrations SET
       pastoral_notes = $3,
       pastoral_notes_updated_at = now(),
       pastoral_notes_updated_by_user_id = $4,
       updated_at = now()
     WHERE id = $1 AND church_id = $2
     RETURNING ${REGISTRATION_COLS}`,
    [fields.id, fields.churchId, fields.pastoralNotes, fields.actorUserId || null]
  );
  return mapRegistration(rows[0] || null);
}

async function insertTransferRequest(client, fields) {
  const { rows } = await client.query(
    `INSERT INTO blessboard.member_branch_transfer_requests (
       church_id, member_id, from_branch_id, to_branch_id, status, reason,
       requested_by_user_id
     ) VALUES ($1,$2,$3,$4,'requested',$5,$6)
     RETURNING *`,
    [
      fields.churchId,
      fields.memberId,
      fields.fromBranchId,
      fields.toBranchId,
      fields.reason || null,
      fields.requestedByUserId || null,
    ]
  );
  return mapTransfer(rows[0]);
}

function mapTransfer(row) {
  if (!row) return null;
  return {
    id: row.id,
    churchId: row.church_id,
    memberId: row.member_id,
    fromBranchId: row.from_branch_id,
    toBranchId: row.to_branch_id,
    status: row.status,
    reason: row.reason,
    reviewerNotes: row.reviewer_notes,
    requestedByUserId: row.requested_by_user_id,
    reviewedByUserId: row.reviewed_by_user_id,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getTransferById(client, { id, churchId }) {
  const { rows } = await client.query(
    `SELECT * FROM blessboard.member_branch_transfer_requests
      WHERE id = $1 AND church_id = $2 LIMIT 1`,
    [id, churchId]
  );
  return mapTransfer(rows[0] || null);
}

async function listTransfers(client, { churchId, status, memberId }) {
  const params = [churchId];
  let sql = `SELECT * FROM blessboard.member_branch_transfer_requests WHERE church_id = $1`;
  if (status) {
    params.push(status);
    sql += ` AND status = $${params.length}`;
  }
  if (memberId) {
    params.push(memberId);
    sql += ` AND member_id = $${params.length}`;
  }
  sql += ` ORDER BY created_at DESC LIMIT 100`;
  const { rows } = await client.query(sql, params);
  return rows.map(mapTransfer);
}

/**
 * Branch-scoped member status counts for membership overview (BB18).
 * @param {{ query: Function }} client
 * @param {{ churchId: string, branchId: string }} input
 */
async function countMembersByStatusForBranch(client, { churchId, branchId }) {
  const { rows } = await client.query(
    `SELECT m.status, COUNT(*)::int AS n
       FROM blessboard.members m
       INNER JOIN blessboard.member_branch_memberships mb ON mb.member_id = m.id
      WHERE m.church_id = $1 AND mb.branch_id = $2
      GROUP BY m.status`,
    [churchId, branchId]
  );
  const byStatus = Object.create(null);
  let total = 0;
  for (const row of rows) {
    const key = String(row.status || "").toLowerCase() || "unknown";
    const n = Number(row.n) || 0;
    byStatus[key] = n;
    total += n;
  }
  return { total, byStatus };
}

/**
 * Open registration queue for a branch (no pastoral / review notes).
 * @param {{ query: Function }} client
 * @param {{ churchId: string, branchId: string, limit?: number }} input
 */
async function listReviewQueueForBranch(client, { churchId, branchId, limit }) {
  const lim = Math.min(Math.max(Number(limit) || 5, 1), 20);
  const statuses = ["submitted", "under_review", "needs_follow_up"];
  const countRes = await client.query(
    `SELECT COUNT(*)::int AS n
       FROM blessboard.member_registrations r
      WHERE r.church_id = $1 AND r.branch_id = $2 AND r.status = ANY($3::text[])`,
    [churchId, branchId, statuses]
  );
  const total = countRes.rows[0] ? Number(countRes.rows[0].n) : 0;
  const { rows } = await client.query(
    `SELECT r.id, r.first_name, r.last_name, r.preferred_name, r.status, r.created_at, r.updated_at
       FROM blessboard.member_registrations r
      WHERE r.church_id = $1 AND r.branch_id = $2 AND r.status = ANY($3::text[])
      ORDER BY
        CASE r.status
          WHEN 'needs_follow_up' THEN 0
          WHEN 'under_review' THEN 1
          ELSE 2
        END,
        r.created_at ASC,
        r.id ASC
      LIMIT $4`,
    [churchId, branchId, statuses, lim]
  );
  return {
    total,
    items: rows.map((row) => ({
      id: row.id,
      firstName: row.first_name,
      lastName: row.last_name,
      preferredName: row.preferred_name || null,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  };
}

/**
 * Open branch transfers touching this branch (privacy-limited; no reviewer notes).
 * @param {{ query: Function }} client
 * @param {{ churchId: string, branchId: string, limit?: number }} input
 */
async function listOpenTransfersForBranch(client, { churchId, branchId, limit }) {
  const lim = Math.min(Math.max(Number(limit) || 5, 1), 20);
  const countRes = await client.query(
    `SELECT COUNT(*)::int AS n
       FROM blessboard.member_branch_transfer_requests t
      WHERE t.church_id = $1
        AND t.status = 'requested'
        AND (t.from_branch_id = $2 OR t.to_branch_id = $2)`,
    [churchId, branchId]
  );
  const total = countRes.rows[0] ? Number(countRes.rows[0].n) : 0;
  const { rows } = await client.query(
    `SELECT t.id, t.member_id, t.from_branch_id, t.to_branch_id, t.status, t.created_at,
            m.first_name, m.last_name, m.preferred_name,
            fb.branch_key AS from_branch_key, fb.display_name AS from_branch_display_name,
            tb.branch_key AS to_branch_key, tb.display_name AS to_branch_display_name
       FROM blessboard.member_branch_transfer_requests t
       INNER JOIN blessboard.members m ON m.id = t.member_id
       LEFT JOIN blessboard.branches fb ON fb.id = t.from_branch_id
       LEFT JOIN blessboard.branches tb ON tb.id = t.to_branch_id
      WHERE t.church_id = $1
        AND t.status = 'requested'
        AND (t.from_branch_id = $2 OR t.to_branch_id = $2)
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT $3`,
    [churchId, branchId, lim]
  );
  return {
    total,
    items: rows.map((row) => {
      const fromId = String(row.from_branch_id || "");
      const scopeId = String(branchId);
      return {
        id: row.id,
        memberId: row.member_id,
        firstName: row.first_name,
        lastName: row.last_name,
        preferredName: row.preferred_name || null,
        status: row.status,
        createdAt: row.created_at,
        direction: fromId === scopeId ? "outbound" : "inbound",
        fromBranchId: row.from_branch_id,
        toBranchId: row.to_branch_id,
        fromBranchKey: row.from_branch_key || null,
        fromBranchDisplayName: row.from_branch_display_name || null,
        toBranchKey: row.to_branch_key || null,
        toBranchDisplayName: row.to_branch_display_name || null,
      };
    }),
  };
}

/**
 * Optional visitor-form submission count (30d). Soft-fails when activity tables absent.
 * @param {{ query: Function }} client
 * @param {{ organizationId: string, branchId: string }} input
 */
async function countVisitorSubmissions30d(client, { organizationId, branchId }) {
  const orgId = String(organizationId || "").trim();
  const bId = String(branchId || "").trim();
  if (!orgId || !bId) {
    return { available: false, total: 0 };
  }
  try {
    const { rows } = await client.query(
      `SELECT COUNT(*)::int AS n
         FROM platform.tenant_form_submissions s
         INNER JOIN platform.tenant_forms f ON f.id = s.form_id
        WHERE f.organization_id = $1
          AND f.product_code = 'blessboard'
          AND f.category = 'visitor'
          AND s.created_at >= (now() - interval '30 days')
          AND (
            s.branch_id = $2
            OR (s.branch_id IS NULL AND f.branch_id = $2)
            OR (s.branch_id IS NULL AND f.branch_id IS NULL)
          )`,
      [orgId, bId]
    );
    return { available: true, total: rows[0] ? Number(rows[0].n) : 0 };
  } catch {
    return { available: false, total: 0 };
  }
}

async function updateTransferStatus(client, fields) {
  const { rows } = await client.query(
    `UPDATE blessboard.member_branch_transfer_requests SET
       status = $3,
       reviewer_notes = COALESCE($4, reviewer_notes),
       reviewed_by_user_id = $5,
       reviewed_at = now(),
       updated_at = now()
     WHERE id = $1 AND church_id = $2
     RETURNING *`,
    [
      fields.id,
      fields.churchId,
      fields.status,
      fields.reviewerNotes !== undefined ? fields.reviewerNotes : null,
      fields.reviewedByUserId || null,
    ]
  );
  return mapTransfer(rows[0] || null);
}

async function setPrimaryMembershipBranch(client, { memberId, fromBranchId, toBranchId }) {
  await client.query(
    `UPDATE blessboard.member_branch_memberships
        SET is_primary = false, updated_at = now()
      WHERE member_id = $1 AND branch_id = $2`,
    [memberId, fromBranchId]
  );
  const existing = await client.query(
    `SELECT id FROM blessboard.member_branch_memberships
      WHERE member_id = $1 AND branch_id = $2 LIMIT 1`,
    [memberId, toBranchId]
  );
  if (existing.rows[0]) {
    await client.query(
      `UPDATE blessboard.member_branch_memberships
          SET is_primary = true, membership_status = 'active', updated_at = now()
        WHERE id = $1`,
      [existing.rows[0].id]
    );
  } else {
    await client.query(
      `INSERT INTO blessboard.member_branch_memberships
         (member_id, branch_id, membership_status, is_primary, joined_at)
       VALUES ($1, $2, 'active', true, now())`,
      [memberId, toBranchId]
    );
  }
}

module.exports = {
  mapMember,
  mapMembership,
  mapRegistration,
  mapIntakeForm,
  mapTransfer,
  findMemberById,
  findActiveMemberByUserId,
  updateMemberProfileFields,
  findLiveMemberByEmail,
  findLiveMemberByPhone,
  insertMember,
  updateMemberUserId,
  updateMemberStatus,
  findMembership,
  countPrimaryMemberships,
  insertMembership,
  findRegistrationById,
  findRegistrationByIdReadonly,
  findOpenRegistrationByEmail,
  findOpenRegistrationByPhone,
  insertRegistration,
  updateRegistrationStatus,
  listRegistrations,
  listMembersForBranch,
  findMemberOnBranch,
  listMembersForChurch,
  findMemberInChurch,
  findBranchById,
  findChurchById,
  findUserById,
  insertIntakeForm,
  updateIntakeForm,
  getIntakeFormById,
  getPublishedIntakeFormForChurch,
  listIntakeForms,
  insertReviewEvent,
  listReviewEvents,
  updatePastoralNotes,
  insertTransferRequest,
  getTransferById,
  listTransfers,
  countMembersByStatusForBranch,
  listReviewQueueForBranch,
  listOpenTransfersForBranch,
  countVisitorSubmissions30d,
  updateTransferStatus,
  setPrimaryMembershipBranch,
};
