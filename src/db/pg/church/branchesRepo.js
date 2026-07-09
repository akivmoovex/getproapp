"use strict";

const auditLogsRepo = require("./auditLogsRepo");
const { normalizeSlug } = require("../../../church/platformProvisioningValidation");

const STATUS_AUDIT_ACTIONS = {
  suspended: "platform_church_branch_suspended",
  active: "platform_church_branch_reactivated",
  archived: "platform_church_branch_archived",
};

function branchHostSlug(row) {
  if (!row) return "";
  return String(row.host_slug || row.slug || "")
    .toLowerCase()
    .trim();
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @param {string} branchSlug
 * @returns {Promise<object | null>}
 */
async function findBranchBySlug(pool, organizationId, branchSlug) {
  const slug = String(branchSlug || "")
    .toLowerCase()
    .trim();
  if (!slug || !organizationId) return null;
  const r = await pool.query(
    `SELECT * FROM public.church_branches
     WHERE organization_id = $1 AND slug = $2
     LIMIT 1`,
    [organizationId, slug]
  );
  return r.rows[0] ?? null;
}

/**
 * Resolve branch by public church host slug (e.g. kafue-baptist.church.*).
 * Falls back to legacy org-slug routing for existing single-branch tenants.
 * @param {import("pg").Pool} pool
 * @param {string} hostSlug
 * @returns {Promise<object | null>}
 */
async function findBranchByHostSlug(pool, hostSlug) {
  const s = String(hostSlug || "")
    .toLowerCase()
    .trim();
  if (!s) return null;

  const byHost = await pool.query(
    `SELECT b.*
     FROM public.church_branches b
     WHERE lower(trim(b.host_slug)) = $1
     LIMIT 1`,
    [s]
  );
  if (byHost.rows[0]) return byHost.rows[0];

  const legacy = await pool.query(
    `SELECT b.*
     FROM public.church_branches b
     INNER JOIN public.church_organizations o ON o.id = b.organization_id
     WHERE o.slug = $1
     ORDER BY b.id ASC
     LIMIT 1`,
    [s]
  );
  return legacy.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @returns {Promise<number>}
 */
async function countBranchesForOrganization(pool, organizationId) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS c FROM public.church_branches WHERE organization_id = $1`,
    [organizationId]
  );
  return r.rows[0]?.c ?? 0;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @returns {Promise<object[]>}
 */
async function listBranchesForOrganization(pool, organizationId) {
  const r = await pool.query(
    `SELECT b.*,
            ba.full_name AS branch_admin_name,
            ba.email AS branch_admin_email
     FROM public.church_branches b
     LEFT JOIN public.church_branch_admins ba
       ON ba.branch_id = b.id AND ba.status = 'active'
     WHERE b.organization_id = $1
     ORDER BY b.id ASC`,
    [organizationId]
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {string} hostSlug
 * @returns {Promise<boolean>}
 */
async function isBranchHostSlugAvailable(db, hostSlug) {
  const s = normalizeSlug(hostSlug);
  if (!s) return false;
  const r = await db.query(
    `SELECT 1 FROM public.church_branches
     WHERE lower(trim(host_slug)) = $1
     LIMIT 1`,
    [s]
  );
  return r.rows.length === 0;
}

/**
 * @param {import("pg").Pool} pool
 * @param {{ organization_id: number, slug: string, host_slug?: string, name: string, status?: string, city?: string, country?: string, pastor_name?: string, contact_phone?: string, contact_email?: string, welcome_message?: string, service_times?: string, location_text?: string }} fields
 * @returns {Promise<object>}
 */
async function createBranch(pool, fields) {
  const slug = String(fields.slug || fields.host_slug || "")
    .toLowerCase()
    .trim();
  const hostSlug = String(fields.host_slug || slug)
    .toLowerCase()
    .trim();
  const name = String(fields.name || "").trim();
  const status = fields.status != null ? String(fields.status) : "active";
  const welcomeMessage = fields.welcome_message != null ? String(fields.welcome_message) : "";
  const serviceTimes = fields.service_times != null ? String(fields.service_times) : "";
  const locationText = fields.location_text != null ? String(fields.location_text) : "";
  const r = await pool.query(
    `INSERT INTO public.church_branches
       (organization_id, slug, host_slug, name, status, city, country,
        pastor_name, contact_phone, contact_email,
        welcome_message, service_times, location_text, member_registration_enabled)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING *`,
    [
      fields.organization_id,
      slug,
      hostSlug,
      name,
      status,
      fields.city ?? null,
      fields.country ?? null,
      fields.pastor_name ?? null,
      fields.contact_phone ?? null,
      fields.contact_email ?? null,
      welcomeMessage,
      serviceTimes,
      locationText,
      fields.member_registration_enabled !== false,
    ]
  );
  return r.rows[0];
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {number} branchId
 * @param {string} newStatus
 * @param {{ reason?: string | null, platformAdminId?: number | null, previousStatus?: string, organizationId?: number }} opts
 */
async function updateBranchStatus(db, branchId, newStatus, opts = {}) {
  const id = Number(branchId);
  const client = "connect" in db ? await db.connect() : null;
  const runner = client || db;
  try {
    if (client) await client.query("BEGIN");

    const existing = await runner.query(`SELECT * FROM public.church_branches WHERE id = $1 LIMIT 1`, [id]);
    const row = existing.rows[0];
    if (!row) {
      throw Object.assign(new Error("Branch not found."), { code: "NOT_FOUND" });
    }
    const previousStatus = opts.previousStatus != null ? opts.previousStatus : row.status;
    const reason = opts.reason != null ? String(opts.reason).trim().slice(0, 2000) : null;
    const platformAdminId = opts.platformAdminId || null;
    const organizationId = opts.organizationId != null ? opts.organizationId : row.organization_id;

    const sets = ["status = $2", "updated_at = now()"];
    const params = [id, newStatus];
    let idx = 3;

    if (newStatus === "suspended") {
      sets.push("suspended_at = now()");
      sets.push(`suspended_by_platform_admin_id = $${idx++}`);
      sets.push(`status_reason = $${idx++}`);
      params.push(platformAdminId, reason);
    } else if (newStatus === "archived") {
      sets.push("archived_at = now()");
      sets.push(`archived_by_platform_admin_id = $${idx++}`);
      sets.push(`status_reason = $${idx++}`);
      params.push(platformAdminId, reason);
    } else if (newStatus === "active") {
      sets.push("suspended_at = NULL");
      sets.push("suspended_by_platform_admin_id = NULL");
      sets.push("archived_at = NULL");
      sets.push("archived_by_platform_admin_id = NULL");
      if (reason) {
        sets.push(`status_reason = $${idx++}`);
        params.push(reason);
      } else {
        sets.push("status_reason = NULL");
      }
    }

    const r = await runner.query(
      `UPDATE public.church_branches
       SET ${sets.join(", ")}
       WHERE id = $1
       RETURNING *`,
      params
    );
    const updated = r.rows[0];

    const auditAction = STATUS_AUDIT_ACTIONS[newStatus];
    if (auditAction) {
      await auditLogsRepo.insertAuditLog(runner, {
        organization_id: organizationId,
        branch_id: id,
        actor_type: "platform_admin",
        actor_id: platformAdminId,
        action: auditAction,
        entity_type: "church_branch",
        entity_id: id,
        target_label: updated.name,
        metadata_json: {
          previous_status: previousStatus,
          new_status: newStatus,
          reason: reason || null,
          organization_id: organizationId,
          branch_id: id,
        },
      });
    }

    if (client) await client.query("COMMIT");
    return updated;
  } catch (err) {
    if (client) await client.query("ROLLBACK");
    throw err;
  } finally {
    if (client) client.release();
  }
}

async function suspendBranch(pool, branchId, { reason, platformAdminId }) {
  return updateBranchStatus(pool, branchId, "suspended", { reason, platformAdminId });
}

async function reactivateBranch(pool, branchId, { reason, platformAdminId }) {
  return updateBranchStatus(pool, branchId, "active", { reason, platformAdminId });
}

async function archiveBranch(pool, branchId, { reason, platformAdminId }) {
  return updateBranchStatus(pool, branchId, "archived", { reason, platformAdminId });
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {number} branchId
 * @returns {Promise<object | null>}
 */
async function findBranchByIdForPlatform(db, branchId) {
  const id = Number(branchId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const r = await db.query(
    `SELECT b.*,
            o.name AS organization_name,
            o.slug AS organization_slug,
            o.status AS organization_status,
            COALESCE(NULLIF(trim(b.host_slug), ''), b.slug) AS branch_host_slug
     FROM public.church_branches b
     INNER JOIN public.church_organizations o ON o.id = b.organization_id
     WHERE b.id = $1
     LIMIT 1`,
    [id]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {string} hostSlug
 * @param {number} excludeBranchId
 * @returns {Promise<boolean>}
 */
async function checkBranchHostSlugAvailableForUpdate(db, hostSlug, excludeBranchId) {
  const s = normalizeSlug(hostSlug);
  if (!s) return false;
  const id = Number(excludeBranchId);
  const r = await db.query(
    `SELECT 1 FROM public.church_branches
     WHERE lower(trim(host_slug)) = $1
       AND id <> $2
     LIMIT 1`,
    [s, id]
  );
  return r.rows.length === 0;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @returns {Promise<object | null>}
 */
async function getBranchAdminSummaryForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT id, full_name, email, phone, username, status, created_at
     FROM public.church_branch_admins
     WHERE branch_id = $1 AND status = 'active'
     ORDER BY id ASC
     LIMIT 1`,
    [branchId]
  );
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @returns {Promise<{ verified_member_count: number, pending_member_count: number, total_member_count: number, latest_report_status: string | null, latest_report_year: number | null, latest_report_month: number | null }>}
 */
async function getBranchUsageSummaryForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT
       COUNT(m.id) FILTER (WHERE m.status = 'verified')::int AS verified_member_count,
       COUNT(m.id) FILTER (WHERE m.status = 'pending')::int AS pending_member_count,
       COUNT(m.id)::int AS total_member_count,
       lr.status AS latest_report_status,
       lr.period_year AS latest_report_year,
       lr.period_month AS latest_report_month
     FROM public.church_branches b
     LEFT JOIN public.church_members m ON m.branch_id = b.id
     LEFT JOIN LATERAL (
       SELECT status, period_year, period_month
       FROM public.church_monthly_reports mr
       WHERE mr.branch_id = b.id
       ORDER BY mr.period_year DESC, mr.period_month DESC, mr.id DESC
       LIMIT 1
     ) lr ON true
     WHERE b.id = $1
     GROUP BY b.id, lr.status, lr.period_year, lr.period_month`,
    [branchId]
  );
  const row = r.rows[0];
  return {
    verified_member_count: row ? row.verified_member_count : 0,
    pending_member_count: row ? row.pending_member_count : 0,
    total_member_count: row ? row.total_member_count : 0,
    latest_report_status: row ? row.latest_report_status : null,
    latest_report_year: row ? row.latest_report_year : null,
    latest_report_month: row ? row.latest_report_month : null,
  };
}

function metadataFieldChanged(before, after, field) {
  const beforeVal = before[field] == null ? "" : String(before[field]).trim();
  const afterVal = after[field] == null ? "" : String(after[field]).trim();
  return beforeVal !== afterVal;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} branchId
 * @param {{ name: string, host_slug: string, slug: string, city?: string | null, country?: string | null, pastor_name?: string | null, contact_phone?: string | null, contact_email?: string | null }} fields
 * @param {number | null} platformAdminId
 */
async function updateBranchMetadataForPlatform(pool, branchId, fields, platformAdminId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await findBranchByIdForPlatform(client, branchId);
    if (!existing) {
      throw Object.assign(new Error("Branch not found."), { code: "NOT_FOUND" });
    }

    const hostSlug = normalizeSlug(fields.host_slug);
    const available = await checkBranchHostSlugAvailableForUpdate(client, hostSlug, branchId);
    if (!available) {
      throw Object.assign(new Error("Branch host slug is already in use."), { code: "DUPLICATE_HOST_SLUG" });
    }

    const previousHostSlug = branchHostSlug(existing);
    const hostSlugChanged = previousHostSlug !== hostSlug;

    const next = {
      name: String(fields.name || "").trim(),
      host_slug: hostSlug,
      slug: String(fields.slug || hostSlug).toLowerCase().trim(),
      city: fields.city != null ? fields.city : null,
      country: fields.country != null ? fields.country : null,
      pastor_name: fields.pastor_name != null ? fields.pastor_name : null,
      contact_phone: fields.contact_phone != null ? fields.contact_phone : null,
      contact_email: fields.contact_email != null ? fields.contact_email : null,
    };

    const changedFields = [];
    if (metadataFieldChanged(existing, next, "name")) changedFields.push("name");
    if (hostSlugChanged) changedFields.push("host_slug");
    if (metadataFieldChanged(existing, next, "city")) changedFields.push("city");
    if (metadataFieldChanged(existing, next, "country")) changedFields.push("country");
    if (metadataFieldChanged(existing, next, "pastor_name")) changedFields.push("pastor_name");
    if (metadataFieldChanged(existing, next, "contact_phone")) changedFields.push("contact_phone");
    if (metadataFieldChanged(existing, next, "contact_email")) changedFields.push("contact_email");

    const r = await client.query(
      `UPDATE public.church_branches
       SET name = $2,
           slug = $3,
           host_slug = $4,
           city = $5,
           country = $6,
           pastor_name = $7,
           contact_phone = $8,
           contact_email = $9,
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        branchId,
        next.name,
        next.slug,
        next.host_slug,
        next.city,
        next.country,
        next.pastor_name,
        next.contact_phone,
        next.contact_email,
      ]
    );
    const updated = r.rows[0];

    const auditBase = {
      organization_id: existing.organization_id,
      branch_id: branchId,
      actor_type: "platform_admin",
      actor_id: platformAdminId || null,
      entity_type: "church_branch",
      entity_id: branchId,
      target_label: updated.name,
    };

    if (changedFields.length > 0) {
      await auditLogsRepo.insertAuditLog(client, {
        ...auditBase,
        action: "platform_church_branch_updated",
        metadata_json: {
          branch_id: branchId,
          organization_id: existing.organization_id,
          branch_name: updated.name,
          changed_fields: changedFields,
          previous_host_slug: previousHostSlug,
          new_host_slug: hostSlug,
        },
      });
    }

    if (hostSlugChanged) {
      await auditLogsRepo.insertAuditLog(client, {
        ...auditBase,
        action: "platform_church_branch_host_slug_changed",
        metadata_json: {
          branch_id: branchId,
          organization_id: existing.organization_id,
          branch_name: updated.name,
          previous_host_slug: previousHostSlug,
          new_host_slug: hostSlug,
          changed_fields: changedFields,
        },
      });
    }

    await client.query("COMMIT");
    return { branch: updated, hostSlugChanged, previousHostSlug, newHostSlug: hostSlug };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function updateBranchMemberRegistrationEnabled(pool, branchId, enabled, adminId) {
  const r = await pool.query(
    `UPDATE public.church_branches
     SET member_registration_enabled = $1, updated_at = now()
     WHERE id = $2
     RETURNING id, member_registration_enabled`,
    [enabled === true, branchId]
  );
  return r.rows[0] ?? null;
}

module.exports = {
  branchHostSlug,
  findBranchBySlug,
  findBranchByHostSlug,
  countBranchesForOrganization,
  listBranchesForOrganization,
  isBranchHostSlugAvailable,
  createBranch,
  updateBranchStatus,
  suspendBranch,
  reactivateBranch,
  archiveBranch,
  findBranchByIdForPlatform,
  checkBranchHostSlugAvailableForUpdate,
  getBranchAdminSummaryForBranch,
  getBranchUsageSummaryForBranch,
  updateBranchMetadataForPlatform,
  updateBranchMemberRegistrationEnabled,
};
