"use strict";

const { normalizeEmail, normalizePhone } = require("./membersRepo");

const LEADER_SELECT = `
  SELECT l.*,
         m.name AS ministry_name
  FROM public.church_ministry_leaders l
  LEFT JOIN public.church_ministries m ON m.id = l.ministry_id
`;

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {string} emailOrPhone
 * @returns {Promise<object | null>}
 */
async function findLeaderByEmailOrPhoneForBranch(pool, branchId, emailOrPhone) {
  const ident = String(emailOrPhone || "").trim();
  if (!ident || !branchId) return null;
  const email = ident.includes("@") ? normalizeEmail(ident) : "";
  const phoneNorm = normalizePhone(ident);
  const r = await pool.query(
    `SELECT *
     FROM public.church_ministry_leaders
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
 * @param {number} leaderId
 * @returns {Promise<object | null>}
 */
async function findLeaderById(pool, leaderId) {
  const r = await pool.query(`${LEADER_SELECT} WHERE l.id = $1 LIMIT 1`, [leaderId]);
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} leaderId
 * @param {number} branchId
 * @returns {Promise<object | null>}
 */
async function findLeaderByIdForBranch(pool, leaderId, branchId) {
  const r = await pool.query(
    `${LEADER_SELECT}
     WHERE l.id = $1 AND l.branch_id = $2
     LIMIT 1`,
    [leaderId, branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {{ email?: string, phone?: string, excludeLeaderId?: number }} opts
 * @returns {Promise<object | null>}
 */
async function findLeaderConflictForBranch(pool, branchId, opts = {}) {
  const emailNorm = opts.email ? normalizeEmail(opts.email) : "";
  const phoneNorm = opts.phone ? normalizePhone(opts.phone) : "";
  if (!branchId || (!emailNorm && !phoneNorm)) return null;

  const params = [branchId];
  const clauses = [];
  if (emailNorm) {
    params.push(emailNorm);
    clauses.push(`lower(trim(email)) = $${params.length}`);
  }
  if (phoneNorm) {
    params.push(phoneNorm);
    clauses.push(`phone_normalized = $${params.length}`);
  }
  if (opts.excludeLeaderId) {
    params.push(opts.excludeLeaderId);
  }
  let where = `WHERE branch_id = $1 AND (${clauses.join(" OR ")})`;
  if (opts.excludeLeaderId) {
    where += ` AND id <> $${params.length}`;
  }
  const r = await pool.query(
    `SELECT id, full_name, email, phone, status
     FROM public.church_ministry_leaders
     ${where}
     LIMIT 1`,
    params
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} fields
 * @returns {Promise<object>}
 */
async function createLeaderForBranch(pool, fields) {
  const email = normalizeEmail(fields.email);
  const phone = String(fields.phone || "").trim().slice(0, 64);
  const phoneNorm = normalizePhone(fields.phone);
  const status = fields.status || "active";

  if (status === "active") {
    const seatQuota = require("../../../services/church/churchSeatQuotaService");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await seatQuota.assertCanAssignPrivilegedRoleLocked(client, {
        organizationId: fields.organization_id,
        branchId: fields.branch_id,
        actorType: "branch_admin",
        actorId: fields.created_by_admin_id || null,
        roleLabel: "ministry_leader",
      });
      const r = await client.query(
        `INSERT INTO public.church_ministry_leaders (
           organization_id, branch_id, ministry_id, department_id, member_id,
           full_name, email, phone, phone_normalized, password_hash,
           role, status, notes, created_by_admin_id, updated_by_admin_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)
         RETURNING id`,
        [
          fields.organization_id,
          fields.branch_id,
          fields.ministry_id || null,
          fields.department_id || null,
          fields.member_id || null,
          String(fields.full_name || "").trim().slice(0, 200),
          email,
          phone || null,
          phoneNorm || null,
          fields.password_hash,
          fields.role || "ministry_leader",
          status,
          fields.notes || null,
          fields.created_by_admin_id || null,
        ]
      );
      await client.query("COMMIT");
      return findLeaderByIdForBranch(pool, r.rows[0].id, fields.branch_id);
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
    `INSERT INTO public.church_ministry_leaders (
       organization_id, branch_id, ministry_id, department_id, member_id,
       full_name, email, phone, phone_normalized, password_hash,
       role, status, notes, created_by_admin_id, updated_by_admin_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)
     RETURNING id`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.ministry_id || null,
      fields.department_id || null,
      fields.member_id || null,
      String(fields.full_name || "").trim().slice(0, 200),
      email,
      phone || null,
      phoneNorm || null,
      fields.password_hash,
      fields.role || "ministry_leader",
      status,
      fields.notes || null,
      fields.created_by_admin_id || null,
    ]
  );
  return findLeaderByIdForBranch(pool, r.rows[0].id, fields.branch_id);
}

/** @deprecated use createLeaderForBranch */
async function createMinistryLeader(pool, fields) {
  return createLeaderForBranch(pool, fields);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {{ ministryId?: number, status?: string }} opts
 * @returns {Promise<object[]>}
 */
async function listLeadersForBranch(pool, branchId, opts = {}) {
  const params = [branchId];
  let where = "WHERE l.branch_id = $1";
  if (opts.ministryId) {
    params.push(opts.ministryId);
    where += ` AND l.ministry_id = $${params.length}`;
  }
  const status = String(opts.status || "").trim();
  if (status && status !== "all") {
    params.push(status);
    where += ` AND l.status = $${params.length}`;
  }
  const r = await pool.query(
    `${LEADER_SELECT}
     ${where}
     ORDER BY l.full_name ASC`,
    params
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} ministryId
 * @param {number} branchId
 * @returns {Promise<object[]>}
 */
async function listLeadersForMinistry(pool, ministryId, branchId) {
  return listLeadersForBranch(pool, branchId, { ministryId });
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {string} email
 * @returns {Promise<object | null>}
 */
async function findLeaderByEmailForBranch(pool, branchId, email) {
  const emailNorm = normalizeEmail(email);
  if (!branchId || !emailNorm) return null;
  const r = await pool.query(
    `${LEADER_SELECT}
     WHERE l.branch_id = $1 AND lower(trim(l.email)) = $2
     LIMIT 1`,
    [branchId, emailNorm]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} leaderId
 * @param {number} branchId
 * @param {object} update
 * @returns {Promise<object | null>}
 */
async function updateLeaderForBranch(pool, leaderId, branchId, update) {
  const email = normalizeEmail(update.email);
  const phone = String(update.phone || "").trim().slice(0, 64);
  const phoneNorm = normalizePhone(update.phone);
  const nextStatus = update.status || "active";

  const existing = await findLeaderByIdForBranch(pool, leaderId, branchId);
  if (!existing) return null;

  if (nextStatus === "active" && existing.status !== "active") {
    const seatQuota = require("../../../services/church/churchSeatQuotaService");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await seatQuota.assertCanAssignPrivilegedRoleLocked(client, {
        organizationId: existing.organization_id,
        branchId,
        excludeMinistryLeaderId: existing.id,
        actorType: "branch_admin",
        actorId: update.updated_by_admin_id || null,
        roleLabel: "ministry_leader",
      });
      const r = await client.query(
        `UPDATE public.church_ministry_leaders
         SET full_name = $1,
             email = $2,
             phone = $3,
             phone_normalized = $4,
             ministry_id = $5,
             role = $6,
             status = $7,
             notes = $8,
             updated_by_admin_id = $9,
             updated_at = now()
         WHERE id = $10 AND branch_id = $11
         RETURNING id`,
        [
          update.full_name,
          email,
          phone || null,
          phoneNorm || null,
          update.ministry_id,
          update.role || "ministry_leader",
          nextStatus,
          update.notes || null,
          update.updated_by_admin_id || null,
          leaderId,
          branchId,
        ]
      );
      await client.query("COMMIT");
      if (!r.rows[0]) return null;
      return findLeaderByIdForBranch(pool, leaderId, branchId);
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
    `UPDATE public.church_ministry_leaders
     SET full_name = $1,
         email = $2,
         phone = $3,
         phone_normalized = $4,
         ministry_id = $5,
         role = $6,
         status = $7,
         notes = $8,
         updated_by_admin_id = $9,
         updated_at = now()
     WHERE id = $10 AND branch_id = $11
     RETURNING id`,
    [
      update.full_name,
      email,
      phone || null,
      phoneNorm || null,
      update.ministry_id,
      update.role || "ministry_leader",
      nextStatus,
      update.notes || null,
      update.updated_by_admin_id || null,
      leaderId,
      branchId,
    ]
  );
  if (!r.rows[0]) return null;
  return findLeaderByIdForBranch(pool, leaderId, branchId);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} leaderId
 * @param {number} branchId
 * @param {number} adminId
 * @returns {Promise<object | null>}
 */
async function activateLeaderForBranch(pool, leaderId, branchId, adminId) {
  const existing = await findLeaderByIdForBranch(pool, leaderId, branchId);
  if (!existing) return null;
  if (existing.status === "active") {
    return existing;
  }

  const seatQuota = require("../../../services/church/churchSeatQuotaService");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await seatQuota.assertCanAssignPrivilegedRoleLocked(client, {
      organizationId: existing.organization_id,
      branchId,
      excludeMinistryLeaderId: existing.id,
      actorType: "branch_admin",
      actorId: adminId,
      roleLabel: "ministry_leader",
    });
    const r = await client.query(
      `UPDATE public.church_ministry_leaders
       SET status = 'active',
           updated_by_admin_id = $1,
           updated_at = now()
       WHERE id = $2 AND branch_id = $3 AND status <> 'active'
       RETURNING id`,
      [adminId, leaderId, branchId]
    );
    await client.query("COMMIT");
    if (!r.rows[0]) return null;
    return findLeaderByIdForBranch(pool, leaderId, branchId);
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
 * @param {number} leaderId
 * @param {number} branchId
 * @param {number} adminId
 * @returns {Promise<object | null>}
 */
async function deactivateLeaderForBranch(pool, leaderId, branchId, adminId) {
  const r = await pool.query(
    `UPDATE public.church_ministry_leaders
     SET status = 'inactive',
         updated_by_admin_id = $1,
         updated_at = now()
     WHERE id = $2 AND branch_id = $3 AND status = 'active'
     RETURNING id`,
    [adminId, leaderId, branchId]
  );
  if (!r.rows[0]) return null;
  return findLeaderByIdForBranch(pool, leaderId, branchId);
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} leaderId
 * @param {number} branchId
 * @param {string} passwordHash
 * @param {number} adminId
 * @returns {Promise<object | null>}
 */
async function resetLeaderPasswordForBranch(pool, leaderId, branchId, passwordHash, adminId) {
  const r = await pool.query(
    `UPDATE public.church_ministry_leaders
     SET password_hash = $1,
         last_password_reset_at = now(),
         password_reset_by_admin_id = $2,
         updated_by_admin_id = $2,
         updated_at = now()
     WHERE id = $3 AND branch_id = $4
     RETURNING id`,
    [passwordHash, adminId, leaderId, branchId]
  );
  if (!r.rows[0]) return null;
  return findLeaderByIdForBranch(pool, leaderId, branchId);
}

/**
 * @param {import("pg").PoolClient} client
 * @param {number} leaderId
 * @param {number} branchId
 * @param {string} passwordHash
 * @param {number} branchAdminId
 * @returns {Promise<object | null>}
 */
async function resetMinistryLeaderPasswordByBranchAdminResetRequest(
  client,
  leaderId,
  branchId,
  passwordHash,
  branchAdminId
) {
  const r = await client.query(
    `UPDATE public.church_ministry_leaders
     SET password_hash = $3,
         last_password_reset_at = now(),
         password_reset_by_admin_id = $4,
         updated_by_admin_id = $4,
         login_locked_until = NULL,
         failed_login_attempts = 0,
         updated_at = now()
     WHERE id = $1 AND branch_id = $2
     RETURNING id, organization_id, branch_id, ministry_id, full_name, status`,
    [leaderId, branchId, passwordHash, branchAdminId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @returns {Promise<Record<string, number>>}
 */
async function countLeadersByStatusForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT status, COUNT(*)::int AS count
     FROM public.church_ministry_leaders
     WHERE branch_id = $1 AND role = 'ministry_leader'
     GROUP BY status`,
    [branchId]
  );
  const out = { active: 0, inactive: 0 };
  for (const row of r.rows) {
    if (Object.prototype.hasOwnProperty.call(out, row.status)) {
      out[row.status] = row.count;
    }
  }
  return out;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} leaderId
 * @returns {Promise<{ activity_notes: number, attendance_records: number }>}
 */
async function countLeaderActivityStats(pool, leaderId) {
  const r = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM public.church_ministry_activity_notes WHERE leader_id = $1) AS activity_notes,
       (SELECT COUNT(*)::int FROM public.church_attendance_records WHERE created_by_leader_id = $1) AS attendance_records`,
    [leaderId]
  );
  return {
    activity_notes: r.rows[0]?.activity_notes ?? 0,
    attendance_records: r.rows[0]?.attendance_records ?? 0,
  };
}

module.exports = {
  findLeaderByEmailOrPhoneForBranch,
  findLeaderById,
  findLeaderByIdForBranch,
  findLeaderConflictForBranch,
  createLeaderForBranch,
  createMinistryLeader,
  listLeadersForBranch,
  listLeadersForMinistry,
  findLeaderByEmailForBranch,
  updateLeaderForBranch,
  activateLeaderForBranch,
  deactivateLeaderForBranch,
  resetLeaderPasswordForBranch,
  resetMinistryLeaderPasswordByBranchAdminResetRequest,
  countLeadersByStatusForBranch,
  countLeaderActivityStats,
};
