"use strict";

const clientIntake = require("../../../intake/clientProjectIntake");

function normalizeEmail(email) {
  return String(email || "")
    .trim()
    .toLowerCase()
    .slice(0, 254);
}

function normalizePhone(phone) {
  return clientIntake.normalizeDigits(phone).slice(0, 32);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {string} emailOrPhone
 * @returns {Promise<object | null>}
 */
async function findMemberByEmailOrPhoneForBranch(pool, branchId, emailOrPhone) {
  const ident = String(emailOrPhone || "").trim();
  if (!ident || !branchId) return null;
  const email = ident.includes("@") ? normalizeEmail(ident) : "";
  const phoneNorm = normalizePhone(ident);
  const r = await pool.query(
    `SELECT *
     FROM public.church_members
     WHERE branch_id = $1
       AND (
         ($2 <> '' AND lower(trim(email)) = $2)
         OR ($3 <> '' AND phone_normalized = $3)
       )
     LIMIT 1`,
    [branchId, email, phoneNorm]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} memberId
 * @returns {Promise<object | null>}
 */
async function findMemberById(pool, memberId) {
  const r = await pool.query(`SELECT * FROM public.church_members WHERE id = $1 LIMIT 1`, [memberId]);
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} memberId
 * @param {number} branchId
 * @returns {Promise<object | null>}
 */
/**
 * @param {import("pg").Pool} pool
 * @param {number} memberId
 * @param {number} organizationId
 * @returns {Promise<object | null>}
 */
async function findMemberByIdForOrganization(pool, memberId, organizationId) {
  const id = Number(memberId);
  const orgId = Number(organizationId);
  if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(orgId) || orgId <= 0) return null;
  const r = await pool.query(
    `SELECT m.*,
            b.name AS branch_name,
            b.slug AS branch_slug,
            b.status AS branch_status
     FROM public.church_members m
     INNER JOIN public.church_branches b ON b.id = m.branch_id
     WHERE m.id = $1 AND m.organization_id = $2
     LIMIT 1`,
    [id, orgId]
  );
  return r.rows[0] ?? null;
}

/**
 * Cross-branch member search for authorised HQ admins (Growth).
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @param {string} query
 * @param {{ status?: string, limit?: number }} [opts]
 * @returns {Promise<object[]>}
 */
async function searchMembersForOrganization(pool, organizationId, query, opts = {}) {
  const orgId = Number(organizationId);
  const q = String(query || "").trim();
  if (!Number.isFinite(orgId) || orgId <= 0 || !q) return [];

  const status = String(opts.status || "").trim();
  const branchId = opts.branchId != null ? Number(opts.branchId) : null;
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 200);
  const params = [orgId, `%${q.toLowerCase()}%`, `%${normalizePhone(q)}%`];
  let where = `WHERE m.organization_id = $1
     AND (
       lower(m.full_name) LIKE $2
       OR lower(trim(m.email)) LIKE $2
       OR m.phone_normalized LIKE $3
       OR m.phone ILIKE $2
     )`;
  if (Number.isFinite(branchId) && branchId > 0) {
    params.push(branchId);
    where += ` AND m.branch_id = $${params.length}`;
  }
  if (status && status !== "all") {
    params.push(status);
    where += ` AND m.status = $${params.length}`;
  }

  const r = await pool.query(
    `SELECT m.id, m.full_name, m.email, m.phone, m.status, m.branch_id, m.created_at, m.updated_at,
            m.age_group, m.ministry_interest,
            b.name AS branch_name, b.slug AS branch_slug
     FROM public.church_members m
     INNER JOIN public.church_branches b ON b.id = m.branch_id
     ${where}
     ORDER BY m.full_name ASC
     LIMIT ${limit}`,
    params
  );
  return r.rows;
}

async function findMemberByIdForBranch(pool, memberId, branchId) {
  const r = await pool.query(
    `SELECT * FROM public.church_members WHERE id = $1 AND branch_id = $2 LIMIT 1`,
    [memberId, branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {string} email
 * @param {string} phone
 * @returns {Promise<object | null>}
 */
async function findActiveRegistrationConflictForBranch(pool, branchId, email, phone) {
  const emailNorm = normalizeEmail(email);
  const phoneNorm = normalizePhone(phone);
  if (!branchId || (!emailNorm && !phoneNorm)) return null;
  const r = await pool.query(
    `SELECT id, status
     FROM public.church_members
     WHERE branch_id = $1
       AND status IN ('pending', 'verified')
       AND (
         ($2 <> '' AND lower(trim(email)) = $2)
         OR ($3 <> '' AND phone_normalized = $3)
       )
     LIMIT 1`,
    [branchId, emailNorm, phoneNorm]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {number} memberId
 * @param {string} email
 * @param {string} phone
 * @returns {Promise<object | null>}
 */
async function findProfileConflictForBranch(pool, branchId, memberId, email, phone) {
  const emailNorm = normalizeEmail(email);
  const phoneNorm = normalizePhone(phone);
  if (!branchId || (!emailNorm && !phoneNorm)) return null;
  const r = await pool.query(
    `SELECT id, status
     FROM public.church_members
     WHERE branch_id = $1
       AND id <> $2
       AND status IN ('pending', 'verified', 'suspended')
       AND (
         ($3 <> '' AND lower(trim(email)) = $3)
         OR ($4 <> '' AND phone_normalized = $4)
       )
     LIMIT 1`,
    [branchId, memberId, emailNorm, phoneNorm]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} fields
 * @returns {Promise<object>}
 */
async function createPendingMember(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_members (
       organization_id, branch_id, platform_tenant_id,
       email, phone, phone_normalized, full_name, password_hash,
       gender, age_group, address_area, attendance_duration, ministry_interest,
       emergency_contact_name, emergency_contact_phone, status
     ) VALUES (
       $1, $2, $3,
       $4, $5, $6, $7, $8,
       $9, $10, $11, $12, $13,
       $14, $15, 'pending'
     )
     RETURNING id, organization_id, branch_id, platform_tenant_id, email, phone, full_name, status, created_at`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.platform_tenant_id,
      normalizeEmail(fields.email),
      String(fields.phone || "").trim().slice(0, 64),
      normalizePhone(fields.phone),
      String(fields.full_name || "").trim().slice(0, 200),
      fields.password_hash,
      String(fields.gender || "").trim().slice(0, 32),
      String(fields.age_group || "").trim().slice(0, 64),
      String(fields.address_area || "").trim().slice(0, 300),
      String(fields.attendance_duration || "").trim().slice(0, 64),
      String(fields.ministry_interest || "").trim().slice(0, 500),
      String(fields.emergency_contact_name || "").trim().slice(0, 200),
      String(fields.emergency_contact_phone || "").trim().slice(0, 64),
    ]
  );
  return r.rows[0];
}

async function listMembersForBranch(pool, branchId, opts = {}) {
  const status = String(opts.status || "").trim();
  const params = [branchId];
  let where = "WHERE branch_id = $1";
  if (status && status !== "all") {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }
  const r = await pool.query(
    `SELECT id, full_name, email, phone, age_group, ministry_interest, status, created_at, updated_at
     FROM public.church_members
     ${where}
     ORDER BY full_name ASC`,
    params
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {string} query
 * @param {{ status?: string }} opts
 * @returns {Promise<object[]>}
 */
async function searchMembersForBranch(pool, branchId, query, opts = {}) {
  const q = String(query || "").trim();
  if (!q) {
    return listMembersForBranch(pool, branchId, opts);
  }
  const status = String(opts.status || "").trim();
  const params = [branchId, `%${q.toLowerCase()}%`, `%${normalizePhone(q)}%`];
  let where = `WHERE branch_id = $1
     AND (
       lower(full_name) LIKE $2
       OR lower(trim(email)) LIKE $2
       OR phone_normalized LIKE $3
       OR phone ILIKE $2
     )`;
  if (status && status !== "all") {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }
  const r = await pool.query(
    `SELECT id, full_name, email, phone, age_group, ministry_interest, status, created_at, updated_at
     FROM public.church_members
     ${where}
     ORDER BY full_name ASC`,
    params
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @returns {Promise<object[]>}
 */
async function listPendingMembersForBranch(pool, branchId, opts = {}) {
  const q = String(opts.q || "").trim();
  const params = [branchId];
  let where = `WHERE branch_id = $1 AND status = 'pending'`;
  if (q) {
    params.push(`%${q.toLowerCase()}%`, `%${normalizePhone(q)}%`);
    where += ` AND (
       lower(full_name) LIKE $${params.length - 1}
       OR lower(trim(email)) LIKE $${params.length - 1}
       OR phone_normalized LIKE $${params.length}
       OR phone ILIKE $${params.length - 1}
     )`;
  }
  const r = await pool.query(
    `SELECT id, full_name, email, phone, age_group, ministry_interest, status, created_at, review_comment
     FROM public.church_members
     ${where}
     ORDER BY created_at ASC`,
    params
  );
  return r.rows;
}

/**
 * Org-scoped member directory for HQ (Growth). Always tenant-scoped by organization_id.
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @param {{ status?: string, branchId?: number | null, q?: string, limit?: number }} [opts]
 */
async function listMembersForOrganization(pool, organizationId, opts = {}) {
  const orgId = Number(organizationId);
  if (!Number.isFinite(orgId) || orgId <= 0) return [];

  const status = String(opts.status || "").trim();
  const branchId = opts.branchId != null ? Number(opts.branchId) : null;
  const q = String(opts.q || "").trim();
  const limit = Math.min(Math.max(Number(opts.limit) || 200, 1), 200);
  const params = [orgId];
  let where = `WHERE m.organization_id = $1`;

  if (Number.isFinite(branchId) && branchId > 0) {
    params.push(branchId);
    where += ` AND m.branch_id = $${params.length}`;
  }
  if (status && status !== "all") {
    params.push(status);
    where += ` AND m.status = $${params.length}`;
  }
  if (q) {
    params.push(`%${q.toLowerCase()}%`, `%${normalizePhone(q)}%`);
    where += ` AND (
       lower(m.full_name) LIKE $${params.length - 1}
       OR lower(trim(m.email)) LIKE $${params.length - 1}
       OR m.phone_normalized LIKE $${params.length}
       OR m.phone ILIKE $${params.length - 1}
     )`;
  }

  const r = await pool.query(
    `SELECT m.id, m.full_name, m.email, m.phone, m.age_group, m.ministry_interest, m.status,
            m.created_at, m.updated_at, m.branch_id,
            b.name AS branch_name, b.slug AS branch_slug
     FROM public.church_members m
     INNER JOIN public.church_branches b ON b.id = m.branch_id AND b.organization_id = m.organization_id
     ${where}
     ORDER BY m.full_name ASC
     LIMIT ${limit}`,
    params
  );
  return r.rows;
}

/**
 * Org-scoped pending verification queue for HQ (Growth).
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @param {{ branchId?: number | null, q?: string, limit?: number }} [opts]
 */
async function listPendingMembersForOrganization(pool, organizationId, opts = {}) {
  return listMembersForOrganization(pool, organizationId, {
    status: "pending",
    branchId: opts.branchId,
    q: opts.q,
    limit: opts.limit || 200,
  });
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @param {{ branchId?: number | null }} [opts]
 */
async function countMembersForOrganization(pool, organizationId, opts = {}) {
  const orgId = Number(organizationId);
  if (!Number.isFinite(orgId) || orgId <= 0) return 0;
  const branchId = opts.branchId != null ? Number(opts.branchId) : null;
  const params = [orgId];
  let where = `WHERE organization_id = $1`;
  if (Number.isFinite(branchId) && branchId > 0) {
    params.push(branchId);
    where += ` AND branch_id = $${params.length}`;
  }
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count FROM public.church_members ${where}`,
    params
  );
  return r.rows[0]?.count ?? 0;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @returns {Promise<object[]>}
 */
async function listVerifiedMembersForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT id, full_name, email, phone
     FROM public.church_members
     WHERE branch_id = $1 AND status = 'verified'
     ORDER BY full_name ASC`,
    [branchId]
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @returns {Promise<Record<string, number>>}
 */
async function countMembersByStatusForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM public.church_members
     WHERE branch_id = $1
     GROUP BY status`,
    [branchId]
  );
  /** @type {Record<string, number>} */
  const out = { pending: 0, verified: 0, rejected: 0, suspended: 0 };
  for (const row of r.rows) {
    out[row.status] = row.count;
  }
  return out;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} memberId
 * @param {number} branchId
 * @param {string} status
 * @param {{ reviewComment?: string }} [opts]
 * @returns {Promise<object | null>}
 */
async function updateMemberStatusForBranch(pool, memberId, branchId, status, opts) {
  const reviewComment =
    opts && opts.reviewComment != null ? String(opts.reviewComment).trim().slice(0, 2000) : null;
  const nextStatus = String(status || "");

  if (nextStatus === "verified") {
    const seatQuota = require("../../../services/church/churchSeatQuotaService");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const existing = await client.query(
        `SELECT m.*, b.organization_id
         FROM public.church_members m
         INNER JOIN public.church_branches b ON b.id = m.branch_id
         WHERE m.id = $1 AND m.branch_id = $2
         LIMIT 1`,
        [memberId, branchId]
      );
      const row = existing.rows[0];
      if (!row) {
        await client.query("ROLLBACK");
        return null;
      }
      await seatQuota.assertCanActivateMemberLocked(client, {
        organizationId: row.organization_id,
        branchId,
        memberId,
        currentStatus: row.status,
        actorType: (opts && opts.actorType) || "branch_admin",
        actorId: (opts && opts.actorId) || null,
      });
      const r = await client.query(
        `UPDATE public.church_members
         SET status = 'verified',
             review_comment = CASE WHEN $3::text IS NOT NULL THEN $3 ELSE review_comment END,
             updated_at = now()
         WHERE id = $1 AND branch_id = $2
         RETURNING *`,
        [memberId, branchId, reviewComment]
      );
      await client.query("COMMIT");
      return r.rows[0] ?? null;
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw err;
    } finally {
      client.release();
    }
  }

  const r = await pool.query(
    `UPDATE public.church_members
     SET status = $1,
         review_comment = CASE WHEN $4::text IS NOT NULL THEN $4 ELSE review_comment END,
         updated_at = now()
     WHERE id = $2 AND branch_id = $3
     RETURNING *`,
    [status, memberId, branchId, reviewComment]
  );
  return r.rows[0] ?? null;
}

/** @deprecated use updateMemberStatusForBranch */
async function updateMemberStatus(pool, memberId, branchId, status) {
  return updateMemberStatusForBranch(pool, memberId, branchId, status);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} memberId
 * @param {number} branchId
 * @param {object} fields
 * @returns {Promise<object | null>}
 */
async function updateMemberProfileForMember(pool, memberId, branchId, fields) {
  const r = await pool.query(
    `UPDATE public.church_members
     SET full_name = $1,
         email = $2,
         phone = $3,
         phone_normalized = $4,
         gender = $5,
         age_group = $6,
         address_area = $7,
         ministry_interest = $8,
         emergency_contact_name = $9,
         emergency_contact_phone = $10,
         communication_consent = $11,
         communication_consent_updated_at = CASE
           WHEN communication_consent IS DISTINCT FROM $11 THEN now()
           ELSE communication_consent_updated_at
         END,
         updated_at = now()
     WHERE id = $12 AND branch_id = $13 AND status = 'verified'
     RETURNING *`,
    [
      String(fields.full_name || "").trim().slice(0, 200),
      normalizeEmail(fields.email),
      String(fields.phone || "").trim().slice(0, 64),
      normalizePhone(fields.phone),
      String(fields.gender || "").trim().slice(0, 32),
      String(fields.age_group || "").trim().slice(0, 64),
      String(fields.address_area || "").trim().slice(0, 300),
      String(fields.ministry_interest || "").trim().slice(0, 500),
      String(fields.emergency_contact_name || "").trim().slice(0, 200),
      String(fields.emergency_contact_phone || "").trim().slice(0, 64),
      fields.communication_consent !== false,
      memberId,
      branchId,
    ]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} memberId
 * @param {number} branchId
 * @param {object} fields
 * @returns {Promise<object | null>}
 */
async function updateMemberProfileForBranchAdmin(pool, memberId, branchId, fields) {
  const r = await pool.query(
    `UPDATE public.church_members
     SET full_name = $1,
         email = $2,
         phone = $3,
         phone_normalized = $4,
         gender = $5,
         age_group = $6,
         address_area = $7,
         attendance_duration = $8,
         ministry_interest = $9,
         emergency_contact_name = $10,
         emergency_contact_phone = $11,
         updated_at = now()
     WHERE id = $12 AND branch_id = $13
     RETURNING id, organization_id, branch_id, platform_tenant_id, email, phone, full_name, status, created_at, updated_at, gender, age_group, address_area, attendance_duration, ministry_interest, emergency_contact_name, emergency_contact_phone, review_comment, admin_notes, last_admin_note_at, suspended_at, reactivated_at`,
    [
      String(fields.full_name || "").trim().slice(0, 200),
      normalizeEmail(fields.email),
      String(fields.phone || "").trim().slice(0, 64),
      normalizePhone(fields.phone),
      String(fields.gender || "").trim().slice(0, 32),
      String(fields.age_group || "").trim().slice(0, 64),
      String(fields.address_area || "").trim().slice(0, 300),
      String(fields.attendance_duration || "").trim().slice(0, 64),
      String(fields.ministry_interest || "").trim().slice(0, 500),
      String(fields.emergency_contact_name || "").trim().slice(0, 200),
      String(fields.emergency_contact_phone || "").trim().slice(0, 64),
      memberId,
      branchId,
    ]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} memberId
 * @param {number} branchId
 * @param {number} adminId
 * @returns {Promise<object | null>}
 */
async function verifyMemberForBranch(pool, memberId, branchId, adminId) {
  const seatQuota = require("../../../services/church/churchSeatQuotaService");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(
      `SELECT m.*, b.organization_id
       FROM public.church_members m
       INNER JOIN public.church_branches b ON b.id = m.branch_id
       WHERE m.id = $1 AND m.branch_id = $2
       LIMIT 1`,
      [memberId, branchId]
    );
    const row = existing.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return null;
    }
    if (!["pending", "rejected", "suspended"].includes(row.status)) {
      await client.query("ROLLBACK");
      return null;
    }
    await seatQuota.assertCanActivateMemberLocked(client, {
      organizationId: row.organization_id,
      branchId,
      memberId,
      currentStatus: row.status,
      actorType: "branch_admin",
      actorId: adminId,
    });
    const r = await client.query(
      `UPDATE public.church_members
       SET status = 'verified',
           reactivated_at = CASE WHEN status = 'suspended' THEN now() ELSE reactivated_at END,
           reactivated_by_admin_id = CASE WHEN status = 'suspended' THEN $1 ELSE reactivated_by_admin_id END,
           updated_at = now()
       WHERE id = $2
         AND branch_id = $3
         AND status IN ('pending', 'rejected', 'suspended')
       RETURNING *`,
      [adminId, memberId, branchId]
    );
    await client.query("COMMIT");
    return r.rows[0] ?? null;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} memberId
 * @param {number} branchId
 * @param {number} adminId
 * @param {string} [reason]
 * @returns {Promise<object | null>}
 */
async function suspendMemberForBranch(pool, memberId, branchId, adminId, reason) {
  const note = reason ? String(reason).trim().slice(0, 2000) : null;
  const r = await pool.query(
    `UPDATE public.church_members
     SET status = 'suspended',
         suspended_at = now(),
         suspended_by_admin_id = $1,
         review_comment = CASE WHEN $4::text IS NOT NULL THEN $4 ELSE review_comment END,
         security_version = security_version + 1,
         updated_at = now()
     WHERE id = $2
       AND branch_id = $3
       AND status = 'verified'
     RETURNING *`,
    [adminId, memberId, branchId, note]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} memberId
 * @param {number} branchId
 * @param {number} adminId
 * @returns {Promise<object | null>}
 */
async function reactivateMemberForBranch(pool, memberId, branchId, adminId) {
  const seatQuota = require("../../../services/church/churchSeatQuotaService");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query(
      `SELECT m.*, b.organization_id
       FROM public.church_members m
       INNER JOIN public.church_branches b ON b.id = m.branch_id
       WHERE m.id = $1 AND m.branch_id = $2
       LIMIT 1`,
      [memberId, branchId]
    );
    const row = existing.rows[0];
    if (!row || row.status !== "suspended") {
      await client.query("ROLLBACK");
      return null;
    }
    await seatQuota.assertCanActivateMemberLocked(client, {
      organizationId: row.organization_id,
      branchId,
      memberId,
      currentStatus: row.status,
      actorType: "branch_admin",
      actorId: adminId,
    });
    const r = await client.query(
      `UPDATE public.church_members
       SET status = 'verified',
           reactivated_at = now(),
           reactivated_by_admin_id = $1,
           updated_at = now()
       WHERE id = $2
         AND branch_id = $3
         AND status = 'suspended'
       RETURNING *`,
      [adminId, memberId, branchId]
    );
    await client.query("COMMIT");
    return r.rows[0] ?? null;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} memberId
 * @param {number} branchId
 * @param {string} note
 * @returns {Promise<object | null>}
 */
async function addAdminNoteForMember(pool, memberId, branchId, note) {
  const trimmed = String(note || "").trim().slice(0, 2000);
  if (!trimmed) return null;
  const r = await pool.query(
    `UPDATE public.church_members
     SET admin_notes = CASE
           WHEN admin_notes IS NULL OR admin_notes = '' THEN $1
           ELSE admin_notes || E'\\n\\n' || $1
         END,
         last_admin_note_at = now(),
         updated_at = now()
     WHERE id = $2 AND branch_id = $3
     RETURNING *`,
    [trimmed, memberId, branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {number} memberId
 * @param {number} branchId
 * @returns {Promise<object | null>}
 */
async function findMemberByIdForPasswordChange(pool, memberId, branchId) {
  const r = await pool.query(
    `SELECT id, organization_id, branch_id, full_name, email, phone, status,
            password_hash, password_changed_at, password_changed_by
     FROM public.church_members
     WHERE id = $1 AND branch_id = $2
     LIMIT 1`,
    [memberId, branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} client
 * @param {number} memberId
 * @param {number} branchId
 * @param {string} passwordHash
 * @returns {Promise<object | null>}
 */
async function updateMemberPasswordSelfService(client, memberId, branchId, passwordHash) {
  const r = await client.query(
    `UPDATE public.church_members
     SET password_hash = $3,
         password_changed_at = now(),
         password_changed_by = 'member',
         security_version = security_version + 1,
         updated_at = now()
     WHERE id = $1 AND branch_id = $2 AND status = 'verified'
     RETURNING id, organization_id, branch_id, full_name, email, phone, status, password_changed_at, security_version`,
    [memberId, branchId, passwordHash]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").PoolClient} client
 * @param {number} memberId
 * @param {number} branchId
 * @param {string} passwordHash
 * @returns {Promise<object | null>}
 */
async function resetMemberPasswordByBranchAdmin(client, memberId, branchId, passwordHash) {
  const r = await client.query(
    `UPDATE public.church_members
     SET password_hash = $3,
         password_changed_at = now(),
         password_changed_by = 'branch_admin_password_reset',
         failed_login_attempts = 0,
         login_locked_until = NULL,
         security_version = security_version + 1,
         updated_at = now()
     WHERE id = $1 AND branch_id = $2 AND status = 'verified'
     RETURNING id, organization_id, branch_id, full_name, email, phone, status, password_changed_at, security_version`,
    [memberId, branchId, passwordHash]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} client
 * @param {{ organizationId: number, branchId: number, memberId: number }} entry
 */
async function recordMemberPasswordChangeAudit(client, entry) {
  const auditLogsRepo = require("./auditLogsRepo");
  await auditLogsRepo.insertAuditLog(client, {
    organization_id: entry.organizationId,
    branch_id: entry.branchId,
    actor_type: "member",
    actor_id: entry.memberId,
    action: "member_password_changed_self_service",
    entity_type: "member",
    entity_id: entry.memberId,
    metadata_json: {
      organization_id: entry.organizationId,
      branch_id: entry.branchId,
      member_id: entry.memberId,
      action_source: "member_account_security",
    },
  });
}

module.exports = {
  normalizeEmail,
  normalizePhone,
  findMemberByEmailOrPhoneForBranch,
  findMemberById,
  findMemberByIdForOrganization,
  findMemberByIdForBranch,
  searchMembersForOrganization,
  listMembersForOrganization,
  listPendingMembersForOrganization,
  countMembersForOrganization,
  findActiveRegistrationConflictForBranch,
  findProfileConflictForBranch,
  createPendingMember,
  listMembersForBranch,
  searchMembersForBranch,
  listPendingMembersForBranch,
  listVerifiedMembersForBranch,
  countMembersByStatusForBranch,
  updateMemberStatusForBranch,
  updateMemberStatus,
  updateMemberProfileForMember,
  updateMemberProfileForBranchAdmin,
  verifyMemberForBranch,
  suspendMemberForBranch,
  reactivateMemberForBranch,
  addAdminNoteForMember,
  findMemberByIdForPasswordChange,
  updateMemberPasswordSelfService,
  resetMemberPasswordByBranchAdmin,
  recordMemberPasswordChangeAudit,
};
