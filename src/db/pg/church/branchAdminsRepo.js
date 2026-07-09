"use strict";

const auditLogsRepo = require("./auditLogsRepo");
const { normalizeEmail, normalizePhone } = require("./membersRepo");

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {string} emailOrPhone
 * @returns {Promise<object | null>}
 */
async function findBranchAdminByEmailOrPhoneForBranch(pool, branchId, emailOrPhone) {
  const ident = String(emailOrPhone || "").trim();
  if (!ident || !branchId) return null;
  const email = ident.includes("@") ? normalizeEmail(ident) : "";
  const phoneNorm = normalizePhone(ident);
  const r = await pool.query(
    `SELECT *
     FROM public.church_branch_admins
     WHERE branch_id = $1
       AND status = 'active'
       AND (
         ($2 <> '' AND lower(trim(email)) = $2)
         OR ($3 <> '' AND phone_normalized = $3)
         OR ($2 <> '' AND lower(trim(username)) = $2)
       )
     LIMIT 1`,
    [branchId, email, phoneNorm]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} adminId
 * @returns {Promise<object | null>}
 */
async function findBranchAdminById(pool, adminId) {
  const r = await pool.query(`SELECT * FROM public.church_branch_admins WHERE id = $1 LIMIT 1`, [adminId]);
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} adminId
 * @param {number} branchId
 * @returns {Promise<object | null>}
 */
async function findBranchAdminByIdForPlatform(pool, adminId, branchId) {
  const id = Number(adminId);
  const bid = Number(branchId);
  if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(bid) || bid <= 0) return null;
  const r = await pool.query(
    `SELECT ba.*,
            b.name AS branch_name,
            b.host_slug,
            b.slug AS branch_slug,
            o.name AS organization_name,
            o.slug AS organization_slug
     FROM public.church_branch_admins ba
     INNER JOIN public.church_branches b ON b.id = ba.branch_id
     INNER JOIN public.church_organizations o ON o.id = ba.organization_id
     WHERE ba.id = $1 AND ba.branch_id = $2
     LIMIT 1`,
    [id, bid]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {string} email
 * @returns {Promise<object | null>}
 */
async function findBranchAdminByEmailForBranch(pool, branchId, email) {
  const emailNorm = normalizeEmail(email);
  if (!branchId || !emailNorm) return null;
  const r = await pool.query(
    `SELECT * FROM public.church_branch_admins
     WHERE branch_id = $1 AND lower(trim(email)) = $2
     LIMIT 1`,
    [branchId, emailNorm]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @returns {Promise<object[]>}
 */
async function listBranchAdminsForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT id, organization_id, branch_id, full_name, email, phone, username, role, status,
            notes, created_at, updated_at, deactivated_at, reactivated_at, last_password_reset_at
     FROM public.church_branch_admins
     WHERE branch_id = $1
     ORDER BY status ASC, id ASC`,
    [branchId]
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @returns {Promise<number>}
 */
async function countActiveBranchAdminsForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS c
     FROM public.church_branch_admins
     WHERE branch_id = $1 AND status = 'active'`,
    [branchId]
  );
  return r.rows[0] ? r.rows[0].c : 0;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {{ email?: string | null, phone?: string | null, excludeAdminId?: number }} opts
 * @returns {Promise<object | null>}
 */
async function checkBranchAdminLoginConflictForBranch(pool, branchId, opts = {}) {
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
  if (opts.excludeAdminId) {
    params.push(Number(opts.excludeAdminId));
  }
  let where = `WHERE branch_id = $1 AND (${clauses.join(" OR ")})`;
  if (opts.excludeAdminId) {
    where += ` AND id <> $${params.length}`;
  }
  const r = await pool.query(
    `SELECT id, full_name, email, phone, status
     FROM public.church_branch_admins
     ${where}
     LIMIT 1`,
    params
  );
  return r.rows[0] ?? null;
}

function metadataFieldChanged(before, after, field) {
  const beforeVal = before[field] == null ? "" : String(before[field]).trim();
  const afterVal = after[field] == null ? "" : String(after[field]).trim();
  return beforeVal !== afterVal;
}

function buildAdminIdentity(fields) {
  const email = normalizeEmail(fields.email);
  const phone = String(fields.phone || "").trim().slice(0, 64);
  const phoneNorm = normalizePhone(fields.phone);
  const fullName = String(fields.full_name || "").trim().slice(0, 200);
  const username = String(fields.username || email || phoneNorm).trim().toLowerCase().slice(0, 80);
  return { email, phone, phoneNorm, fullName, username };
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} fields
 * @returns {Promise<object>}
 */
async function createBranchAdmin(pool, fields) {
  const { email, phone, phoneNorm, fullName, username } = buildAdminIdentity(fields);
  const role = fields.role != null ? String(fields.role) : "branch_admin";
  const status = fields.status != null ? String(fields.status) : "active";
  const notes = fields.notes != null ? fields.notes : null;
  const r = await pool.query(
    `INSERT INTO public.church_branch_admins (
       organization_id, branch_id, username, password_hash,
       display_name, full_name, email, phone, phone_normalized, role, status, notes
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      username,
      fields.password_hash,
      fullName,
      fullName,
      email,
      phone,
      phoneNorm,
      role,
      status,
      notes,
    ]
  );
  return r.rows[0];
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {{ full_name: string, email?: string | null, phone?: string | null, role?: string, password_hash: string, notes?: string | null }} fields
 * @param {number | null} platformAdminId
 * @returns {Promise<object>}
 */
async function createBranchAdminForPlatform(pool, branchId, fields, platformAdminId) {
  const branch = await pool.query(`SELECT id, organization_id FROM public.church_branches WHERE id = $1 LIMIT 1`, [
    branchId,
  ]);
  const branchRow = branch.rows[0];
  if (!branchRow) {
    throw Object.assign(new Error("Branch not found."), { code: "NOT_FOUND" });
  }

  const conflict = await checkBranchAdminLoginConflictForBranch(pool, branchId, {
    email: fields.email,
    phone: fields.phone,
  });
  if (conflict) {
    throw Object.assign(new Error("Email or phone is already in use for this branch."), { code: "DUPLICATE_LOGIN" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const admin = await createBranchAdmin(client, {
      organization_id: branchRow.organization_id,
      branch_id: branchId,
      full_name: fields.full_name,
      email: fields.email,
      phone: fields.phone,
      role: fields.role || "branch_admin",
      password_hash: fields.password_hash,
      notes: fields.notes,
      status: "active",
    });

    await auditLogsRepo.insertAuditLog(client, {
      organization_id: branchRow.organization_id,
      branch_id: branchId,
      actor_type: "platform_admin",
      actor_id: platformAdminId || null,
      action: "platform_church_branch_admin_created",
      entity_type: "church_branch_admin",
      entity_id: admin.id,
      target_label: admin.full_name,
      metadata_json: {
        organization_id: branchRow.organization_id,
        branch_id: branchId,
        branch_admin_id: admin.id,
        role: admin.role,
        email: admin.email || null,
      },
    });

    await client.query("COMMIT");
    return admin;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} adminId
 * @param {number} branchId
 * @param {{ full_name: string, email?: string | null, phone?: string | null, role?: string, notes?: string | null }} fields
 * @param {number | null} platformAdminId
 * @returns {Promise<object>}
 */
async function updateBranchAdminForPlatform(pool, adminId, branchId, fields, platformAdminId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await findBranchAdminByIdForPlatform(client, adminId, branchId);
    if (!existing) {
      throw Object.assign(new Error("Branch admin not found."), { code: "NOT_FOUND" });
    }

    const conflict = await checkBranchAdminLoginConflictForBranch(client, branchId, {
      email: fields.email,
      phone: fields.phone,
      excludeAdminId: adminId,
    });
    if (conflict) {
      throw Object.assign(new Error("Email or phone is already in use for this branch."), { code: "DUPLICATE_LOGIN" });
    }

    const identity = buildAdminIdentity(fields);
    const next = {
      full_name: identity.fullName,
      email: identity.email,
      phone: identity.phone,
      phone_normalized: identity.phoneNorm,
      username: identity.username,
      role: fields.role || "branch_admin",
      notes: fields.notes != null ? fields.notes : null,
    };

    const changedFields = [];
    if (metadataFieldChanged(existing, next, "full_name")) changedFields.push("full_name");
    if (metadataFieldChanged(existing, next, "email")) changedFields.push("email");
    if (metadataFieldChanged(existing, next, "phone")) changedFields.push("phone");
    if (metadataFieldChanged(existing, next, "role")) changedFields.push("role");
    if (metadataFieldChanged(existing, next, "notes")) changedFields.push("notes");

    const r = await client.query(
      `UPDATE public.church_branch_admins
       SET full_name = $3,
           display_name = $3,
           email = $4,
           phone = $5,
           phone_normalized = $6,
           username = $7,
           role = $8,
           notes = $9,
           updated_by_platform_admin_id = $10,
           updated_at = now()
       WHERE id = $1 AND branch_id = $2
       RETURNING *`,
      [
        adminId,
        branchId,
        next.full_name,
        next.email,
        next.phone,
        next.phone_normalized,
        next.username,
        next.role,
        next.notes,
        platformAdminId || null,
      ]
    );
    const updated = r.rows[0];

    if (changedFields.length > 0) {
      await auditLogsRepo.insertAuditLog(client, {
        organization_id: existing.organization_id,
        branch_id: branchId,
        actor_type: "platform_admin",
        actor_id: platformAdminId || null,
        action: "platform_church_branch_admin_updated",
        entity_type: "church_branch_admin",
        entity_id: adminId,
        target_label: updated.full_name,
        metadata_json: {
          organization_id: existing.organization_id,
          branch_id: branchId,
          branch_admin_id: adminId,
          changed_fields: changedFields,
          role: updated.role,
        },
      });
    }

    await client.query("COMMIT");
    return updated;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function setBranchAdminStatusForPlatform(pool, adminId, branchId, newStatus, platformAdminId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await findBranchAdminByIdForPlatform(client, adminId, branchId);
    if (!existing) {
      throw Object.assign(new Error("Branch admin not found."), { code: "NOT_FOUND" });
    }
    if (existing.status === newStatus) {
      await client.query("COMMIT");
      return existing;
    }

    const isActive = newStatus === "active";
    const r = await client.query(
      `UPDATE public.church_branch_admins
       SET status = $3,
           updated_by_platform_admin_id = $4,
           deactivated_at = CASE WHEN $3 = 'inactive' THEN now() ELSE NULL END,
           deactivated_by_platform_admin_id = CASE WHEN $3 = 'inactive' THEN $4 ELSE NULL END,
           reactivated_at = CASE WHEN $3 = 'active' THEN now() ELSE reactivated_at END,
           reactivated_by_platform_admin_id = CASE WHEN $3 = 'active' THEN $4 ELSE reactivated_by_platform_admin_id END,
           updated_at = now()
       WHERE id = $1 AND branch_id = $2
       RETURNING *`,
      [adminId, branchId, newStatus, platformAdminId || null]
    );
    const updated = r.rows[0];

    await auditLogsRepo.insertAuditLog(client, {
      organization_id: existing.organization_id,
      branch_id: branchId,
      actor_type: "platform_admin",
      actor_id: platformAdminId || null,
      action: isActive
        ? "platform_church_branch_admin_activated"
        : "platform_church_branch_admin_deactivated",
      entity_type: "church_branch_admin",
      entity_id: adminId,
      target_label: updated.full_name,
      metadata_json: {
        organization_id: existing.organization_id,
        branch_id: branchId,
        branch_admin_id: adminId,
        previous_status: existing.status,
        new_status: newStatus,
        role: updated.role,
      },
    });

    await client.query("COMMIT");
    return updated;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function activateBranchAdminForPlatform(pool, adminId, branchId, platformAdminId) {
  return setBranchAdminStatusForPlatform(pool, adminId, branchId, "active", platformAdminId);
}

async function deactivateBranchAdminForPlatform(pool, adminId, branchId, platformAdminId) {
  return setBranchAdminStatusForPlatform(pool, adminId, branchId, "inactive", platformAdminId);
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {number} adminId
 * @param {number} branchId
 * @returns {Promise<object | null>}
 */
async function findBranchAdminByIdForPasswordChange(pool, adminId, branchId) {
  const r = await pool.query(
    `SELECT id, organization_id, branch_id, full_name, display_name, email, phone, role, status,
            password_hash, password_changed_at, password_changed_by
     FROM public.church_branch_admins
     WHERE id = $1 AND branch_id = $2
     LIMIT 1`,
    [adminId, branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} client
 * @param {number} adminId
 * @param {number} branchId
 * @param {string} passwordHash
 * @returns {Promise<object | null>}
 */
async function updateBranchAdminPasswordSelfService(client, adminId, branchId, passwordHash) {
  const r = await client.query(
    `UPDATE public.church_branch_admins
     SET password_hash = $3,
         password_changed_at = now(),
         password_changed_by = 'branch_admin',
         updated_at = now()
     WHERE id = $1 AND branch_id = $2 AND status = 'active'
     RETURNING id, organization_id, branch_id, full_name, display_name, email, phone, role, status, password_changed_at`,
    [adminId, branchId, passwordHash]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} client
 * @param {{ organizationId: number, branchId: number, branchAdminId: number }} entry
 */
async function recordBranchAdminPasswordChangeAudit(client, entry) {
  await auditLogsRepo.insertAuditLog(client, {
    organization_id: entry.organizationId,
    branch_id: entry.branchId,
    actor_type: "branch_admin",
    actor_id: entry.branchAdminId,
    action: "branch_admin_password_changed_self_service",
    entity_type: "church_branch_admin",
    entity_id: entry.branchAdminId,
    metadata_json: {
      organization_id: entry.organizationId,
      branch_id: entry.branchId,
      branch_admin_id: entry.branchAdminId,
      action_source: "branch_admin_account_security",
    },
  });
}

async function resetBranchAdminPasswordForPlatform(pool, adminId, branchId, passwordHash, platformAdminId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await findBranchAdminByIdForPlatform(client, adminId, branchId);
    if (!existing) {
      throw Object.assign(new Error("Branch admin not found."), { code: "NOT_FOUND" });
    }

    const r = await client.query(
      `UPDATE public.church_branch_admins
       SET password_hash = $3,
           last_password_reset_at = now(),
           password_reset_by_platform_admin_id = $4,
           updated_by_platform_admin_id = $4,
           updated_at = now()
       WHERE id = $1 AND branch_id = $2
       RETURNING *`,
      [adminId, branchId, passwordHash, platformAdminId || null]
    );
    const updated = r.rows[0];

    await auditLogsRepo.insertAuditLog(client, {
      organization_id: existing.organization_id,
      branch_id: branchId,
      actor_type: "platform_admin",
      actor_id: platformAdminId || null,
      action: "platform_church_branch_admin_password_reset",
      entity_type: "church_branch_admin",
      entity_id: adminId,
      target_label: updated.full_name,
      metadata_json: {
        organization_id: existing.organization_id,
        branch_id: branchId,
        branch_admin_id: adminId,
        role: updated.role,
      },
    });

    await client.query("COMMIT");
    return updated;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * @param {import("pg").PoolClient} client
 * @param {number} adminId
 * @param {number} branchId
 * @param {string} passwordHash
 * @returns {Promise<object | null>}
 */
async function resetBranchAdminPasswordByPlatformResetRequest(client, adminId, branchId, passwordHash) {
  const r = await client.query(
    `UPDATE public.church_branch_admins
     SET password_hash = $3,
         password_changed_at = now(),
         password_changed_by = 'platform_branch_admin_reset_request',
         failed_login_attempts = 0,
         login_locked_until = NULL,
         updated_at = now()
     WHERE id = $1 AND branch_id = $2 AND status = 'active'
     RETURNING id, organization_id, branch_id, full_name, display_name, email, phone, role, status, password_changed_at`,
    [adminId, branchId, passwordHash]
  );
  return r.rows[0] ?? null;
}

module.exports = {
  findBranchAdminByEmailOrPhoneForBranch,
  findBranchAdminById,
  findBranchAdminByIdForPlatform,
  findBranchAdminByEmailForBranch,
  listBranchAdminsForBranch,
  countActiveBranchAdminsForBranch,
  checkBranchAdminLoginConflictForBranch,
  createBranchAdmin,
  createBranchAdminForPlatform,
  updateBranchAdminForPlatform,
  activateBranchAdminForPlatform,
  deactivateBranchAdminForPlatform,
  resetBranchAdminPasswordForPlatform,
  resetBranchAdminPasswordByPlatformResetRequest,
  findBranchAdminByIdForPasswordChange,
  updateBranchAdminPasswordSelfService,
  recordBranchAdminPasswordChangeAudit,
  createInitialBranchAdminForBranch: createBranchAdmin,
};
