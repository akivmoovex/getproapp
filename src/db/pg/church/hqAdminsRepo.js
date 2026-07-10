"use strict";

const auditLogsRepo = require("./auditLogsRepo");
const { normalizeEmail, normalizePhone } = require("./membersRepo");

/**
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @param {string} emailOrPhone
 * @returns {Promise<object | null>}
 */
async function findHqAdminByEmailOrPhoneForOrganization(pool, organizationId, emailOrPhone) {
  const ident = String(emailOrPhone || "").trim();
  if (!ident || !organizationId) return null;
  const email = ident.includes("@") ? normalizeEmail(ident) : "";
  const phoneNorm = normalizePhone(ident);
  const r = await pool.query(
    `SELECT *
     FROM public.church_hq_admins
     WHERE organization_id = $1
       AND status = 'active'
       AND (
         ($2 <> '' AND lower(trim(email)) = $2)
         OR ($3 <> '' AND phone_normalized = $3)
         OR ($2 <> '' AND lower(trim(username)) = $2)
       )
     LIMIT 1`,
    [organizationId, email, phoneNorm]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} adminId
 * @returns {Promise<object | null>}
 */
async function findHqAdminById(pool, adminId) {
  const r = await pool.query(`SELECT * FROM public.church_hq_admins WHERE id = $1 LIMIT 1`, [adminId]);
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} adminId
 * @param {number} organizationId
 * @returns {Promise<object | null>}
 */
async function findHqAdminByIdForPlatform(pool, adminId, organizationId) {
  const id = Number(adminId);
  const orgId = Number(organizationId);
  if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(orgId) || orgId <= 0) return null;
  const r = await pool.query(
    `SELECT ha.*,
            o.name AS organization_name,
            o.slug AS organization_slug,
            o.status AS organization_status
     FROM public.church_hq_admins ha
     INNER JOIN public.church_organizations o ON o.id = ha.organization_id
     WHERE ha.id = $1 AND ha.organization_id = $2
     LIMIT 1`,
    [id, orgId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @param {string} email
 * @returns {Promise<object | null>}
 */
async function findHqAdminByEmailForOrganization(pool, organizationId, email) {
  const emailNorm = normalizeEmail(email);
  if (!organizationId || !emailNorm) return null;
  const r = await pool.query(
    `SELECT * FROM public.church_hq_admins
     WHERE organization_id = $1 AND lower(trim(email)) = $2
     LIMIT 1`,
    [organizationId, emailNorm]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @returns {Promise<object[]>}
 */
async function listHqAdminsForOrganization(pool, organizationId) {
  const r = await pool.query(
    `SELECT id, organization_id, full_name, email, phone, username, role, status,
            notes, created_at, updated_at, deactivated_at, reactivated_at, last_password_reset_at
     FROM public.church_hq_admins
     WHERE organization_id = $1
     ORDER BY status ASC, id ASC`,
    [organizationId]
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @returns {Promise<number>}
 */
async function countActiveHqAdminsForOrganization(pool, organizationId) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS c
     FROM public.church_hq_admins
     WHERE organization_id = $1 AND status = 'active'`,
    [organizationId]
  );
  return r.rows[0] ? r.rows[0].c : 0;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @param {{ email?: string | null, phone?: string | null, excludeAdminId?: number }} opts
 * @returns {Promise<object | null>}
 */
async function checkHqAdminLoginConflictForOrganization(pool, organizationId, opts = {}) {
  const emailNorm = opts.email ? normalizeEmail(opts.email) : "";
  const phoneNorm = opts.phone ? normalizePhone(opts.phone) : "";
  if (!organizationId || (!emailNorm && !phoneNorm)) return null;

  const params = [organizationId];
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
  let where = `WHERE organization_id = $1 AND (${clauses.join(" OR ")})`;
  if (opts.excludeAdminId) {
    where += ` AND id <> $${params.length}`;
  }
  const r = await pool.query(
    `SELECT id, full_name, email, phone, status
     FROM public.church_hq_admins
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
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {object} fields
 * @returns {Promise<object>}
 */
async function createHqAdmin(db, fields) {
  const { email, phone, phoneNorm, fullName, username } = buildAdminIdentity(fields);
  const role = fields.role != null ? String(fields.role) : "hq_admin";
  const status = fields.status != null ? String(fields.status) : "active";
  const notes = fields.notes != null ? fields.notes : null;
  const r = await db.query(
    `INSERT INTO public.church_hq_admins (
       organization_id, username, password_hash,
       display_name, full_name, email, phone, phone_normalized, role, status, notes
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      fields.organization_id,
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
 * @param {number} organizationId
 * @param {{ full_name: string, email?: string | null, phone?: string | null, role?: string, password_hash: string, notes?: string | null }} fields
 * @param {number | null} platformAdminId
 * @returns {Promise<object>}
 */
async function createHqAdminForPlatform(pool, organizationId, fields, platformAdminId) {
  const org = await pool.query(`SELECT id FROM public.church_organizations WHERE id = $1 LIMIT 1`, [organizationId]);
  if (!org.rows[0]) {
    throw Object.assign(new Error("Organization not found."), { code: "NOT_FOUND" });
  }

  const conflict = await checkHqAdminLoginConflictForOrganization(pool, organizationId, {
    email: fields.email,
    phone: fields.phone,
  });
  if (conflict) {
    throw Object.assign(new Error("Email or phone is already in use for this organization."), { code: "DUPLICATE_LOGIN" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const admin = await createHqAdmin(client, {
      organization_id: organizationId,
      full_name: fields.full_name,
      email: fields.email,
      phone: fields.phone,
      role: fields.role || "hq_admin",
      password_hash: fields.password_hash,
      notes: fields.notes,
      status: "active",
    });

    await auditLogsRepo.insertAuditLog(client, {
      organization_id: organizationId,
      branch_id: null,
      actor_type: "platform_admin",
      actor_id: platformAdminId || null,
      action: "platform_church_hq_admin_created",
      entity_type: "church_hq_admin",
      entity_id: admin.id,
      target_label: admin.full_name,
      metadata_json: {
        organization_id: organizationId,
        hq_admin_id: admin.id,
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
 * @param {number} organizationId
 * @param {{ full_name: string, email?: string | null, phone?: string | null, role?: string, notes?: string | null }} fields
 * @param {number | null} platformAdminId
 * @returns {Promise<object>}
 */
async function updateHqAdminForPlatform(pool, adminId, organizationId, fields, platformAdminId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await findHqAdminByIdForPlatform(client, adminId, organizationId);
    if (!existing) {
      throw Object.assign(new Error("HQ admin not found."), { code: "NOT_FOUND" });
    }

    const conflict = await checkHqAdminLoginConflictForOrganization(client, organizationId, {
      email: fields.email,
      phone: fields.phone,
      excludeAdminId: adminId,
    });
    if (conflict) {
      throw Object.assign(new Error("Email or phone is already in use for this organization."), { code: "DUPLICATE_LOGIN" });
    }

    const identity = buildAdminIdentity(fields);
    const next = {
      full_name: identity.fullName,
      email: identity.email,
      phone: identity.phone,
      phone_normalized: identity.phoneNorm,
      username: identity.username,
      role: fields.role || "hq_admin",
      notes: fields.notes != null ? fields.notes : null,
    };

    const changedFields = [];
    if (metadataFieldChanged(existing, next, "full_name")) changedFields.push("full_name");
    if (metadataFieldChanged(existing, next, "email")) changedFields.push("email");
    if (metadataFieldChanged(existing, next, "phone")) changedFields.push("phone");
    if (metadataFieldChanged(existing, next, "role")) changedFields.push("role");
    if (metadataFieldChanged(existing, next, "notes")) changedFields.push("notes");

    const r = await client.query(
      `UPDATE public.church_hq_admins
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
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [
        adminId,
        organizationId,
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
        organization_id: organizationId,
        branch_id: null,
        actor_type: "platform_admin",
        actor_id: platformAdminId || null,
        action: "platform_church_hq_admin_updated",
        entity_type: "church_hq_admin",
        entity_id: adminId,
        target_label: updated.full_name,
        metadata_json: {
          organization_id: organizationId,
          hq_admin_id: adminId,
          changed_fields: changedFields,
          role: updated.role,
          previous_role: existing.role,
          new_role: updated.role,
          result: "ok",
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

async function setHqAdminStatusForPlatform(pool, adminId, organizationId, newStatus, platformAdminId, opts = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await findHqAdminByIdForPlatform(client, adminId, organizationId);
    if (!existing) {
      throw Object.assign(new Error("HQ admin not found."), { code: "NOT_FOUND" });
    }
    if (existing.status === newStatus) {
      await client.query("COMMIT");
      return existing;
    }

    if (newStatus === "inactive" && existing.status === "active") {
      const activeCount = await countActiveHqAdminsForOrganization(client, organizationId);
      if (activeCount <= 1) {
        throw Object.assign(new Error("Cannot deactivate the last active HQ administrator for this organization."), {
          code: "LAST_HQ_ADMIN",
        });
      }
    }

    const reason =
      opts.reason != null
        ? String(opts.reason)
            .trim()
            .slice(0, 2000)
        : null;
    const isActive = newStatus === "active";
    const r = await client.query(
      `UPDATE public.church_hq_admins
       SET status = $3,
           updated_by_platform_admin_id = $4,
           deactivated_at = CASE WHEN $3 = 'inactive' THEN now() ELSE NULL END,
           deactivated_by_platform_admin_id = CASE WHEN $3 = 'inactive' THEN $4 ELSE NULL END,
           reactivated_at = CASE WHEN $3 = 'active' THEN now() ELSE reactivated_at END,
           reactivated_by_platform_admin_id = CASE WHEN $3 = 'active' THEN $4 ELSE reactivated_by_platform_admin_id END,
           updated_at = now()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [adminId, organizationId, newStatus, platformAdminId || null]
    );
    const updated = r.rows[0];

    await auditLogsRepo.insertAuditLog(client, {
      organization_id: organizationId,
      branch_id: null,
      actor_type: "platform_admin",
      actor_id: platformAdminId || null,
      action: isActive ? "platform_church_hq_admin_activated" : "platform_church_hq_admin_deactivated",
      entity_type: "church_hq_admin",
      entity_id: adminId,
      target_label: updated.full_name,
      metadata_json: {
        organization_id: organizationId,
        hq_admin_id: adminId,
        previous_status: existing.status,
        new_status: newStatus,
        reason: reason || null,
        result: "ok",
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

async function activateHqAdminForPlatform(pool, adminId, organizationId, platformAdminId, opts = {}) {
  return setHqAdminStatusForPlatform(pool, adminId, organizationId, "active", platformAdminId, opts);
}

async function deactivateHqAdminForPlatform(pool, adminId, organizationId, platformAdminId, opts = {}) {
  return setHqAdminStatusForPlatform(pool, adminId, organizationId, "inactive", platformAdminId, opts);
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} pool
 * @param {number} adminId
 * @param {number} organizationId
 * @returns {Promise<object | null>}
 */
async function findHqAdminByIdForPasswordChange(pool, adminId, organizationId) {
  const r = await pool.query(
    `SELECT id, organization_id, full_name, display_name, email, phone, role, status,
            password_hash, password_changed_at, password_changed_by
     FROM public.church_hq_admins
     WHERE id = $1 AND organization_id = $2
     LIMIT 1`,
    [adminId, organizationId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} client
 * @param {number} adminId
 * @param {number} organizationId
 * @param {string} passwordHash
 * @returns {Promise<object | null>}
 */
async function updateHqAdminPasswordSelfService(client, adminId, organizationId, passwordHash) {
  const r = await client.query(
    `UPDATE public.church_hq_admins
     SET password_hash = $3,
         password_changed_at = now(),
         password_changed_by = 'hq_admin',
         updated_at = now()
     WHERE id = $1 AND organization_id = $2 AND status = 'active'
     RETURNING id, organization_id, full_name, display_name, email, phone, role, status, password_changed_at`,
    [adminId, organizationId, passwordHash]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} client
 * @param {{ organizationId: number, hqAdminId: number }} entry
 */
async function recordHqAdminPasswordChangeAudit(client, entry) {
  await auditLogsRepo.insertAuditLog(client, {
    organization_id: entry.organizationId,
    branch_id: null,
    actor_type: "hq_admin",
    actor_id: entry.hqAdminId,
    action: "hq_admin_password_changed_self_service",
    entity_type: "church_hq_admin",
    entity_id: entry.hqAdminId,
    metadata_json: {
      organization_id: entry.organizationId,
      hq_admin_id: entry.hqAdminId,
      action_source: "hq_admin_account_security",
    },
  });
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} adminId
 * @param {number} organizationId
 * @param {string} passwordHash
 * @param {number | null} platformAdminId
 * @returns {Promise<object>}
 */
async function resetHqAdminPasswordForPlatform(pool, adminId, organizationId, passwordHash, platformAdminId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await findHqAdminByIdForPlatform(client, adminId, organizationId);
    if (!existing) {
      throw Object.assign(new Error("HQ admin not found."), { code: "NOT_FOUND" });
    }

    const r = await client.query(
      `UPDATE public.church_hq_admins
       SET password_hash = $3,
           last_password_reset_at = now(),
           password_reset_by_platform_admin_id = $4,
           updated_by_platform_admin_id = $4,
           updated_at = now()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [adminId, organizationId, passwordHash, platformAdminId || null]
    );
    const updated = r.rows[0];

    await auditLogsRepo.insertAuditLog(client, {
      organization_id: organizationId,
      branch_id: null,
      actor_type: "platform_admin",
      actor_id: platformAdminId || null,
      action: "platform_church_hq_admin_password_reset",
      entity_type: "church_hq_admin",
      entity_id: adminId,
      target_label: updated.full_name,
      metadata_json: {
        organization_id: organizationId,
        hq_admin_id: adminId,
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
 * @param {number} organizationId
 * @param {string} passwordHash
 * @returns {Promise<object | null>}
 */
async function resetHqAdminPasswordByPlatformResetRequest(client, adminId, organizationId, passwordHash) {
  const r = await client.query(
    `UPDATE public.church_hq_admins
     SET password_hash = $3,
         password_changed_at = now(),
         password_changed_by = 'platform_hq_admin_reset_request',
         failed_login_attempts = 0,
         login_locked_until = NULL,
         updated_at = now()
     WHERE id = $1 AND organization_id = $2 AND status = 'active'
     RETURNING id, organization_id, full_name, display_name, email, phone, role, status, password_changed_at`,
    [adminId, organizationId, passwordHash]
  );
  return r.rows[0] ?? null;
}

module.exports = {
  findHqAdminByEmailOrPhoneForOrganization,
  findHqAdminById,
  findHqAdminByIdForPlatform,
  findHqAdminByEmailForOrganization,
  listHqAdminsForOrganization,
  countActiveHqAdminsForOrganization,
  checkHqAdminLoginConflictForOrganization,
  createHqAdmin,
  createHqAdminForPlatform,
  updateHqAdminForPlatform,
  activateHqAdminForPlatform,
  deactivateHqAdminForPlatform,
  resetHqAdminPasswordForPlatform,
  resetHqAdminPasswordByPlatformResetRequest,
  findHqAdminByIdForPasswordChange,
  updateHqAdminPasswordSelfService,
  recordHqAdminPasswordChangeAudit,
};
