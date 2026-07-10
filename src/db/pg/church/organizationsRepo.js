"use strict";

const auditLogsRepo = require("./auditLogsRepo");
const { normalizePlanCode } = require("../../../church/churchPlans");
const { normalizeSlug } = require("../../../church/platformProvisioningValidation");

/**
 * @param {import("pg").Pool} pool
 * @param {string} slug
 * @returns {Promise<object | null>}
 */
async function findOrganizationBySlug(pool, slug) {
  const s = String(slug || "")
    .toLowerCase()
    .trim();
  if (!s) return null;
  const r = await pool.query(`SELECT * FROM public.church_organizations WHERE slug = $1 LIMIT 1`, [s]);
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @returns {Promise<object | null>}
 */
async function findOrganizationById(pool, organizationId) {
  const id = Number(organizationId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const r = await pool.query(`SELECT * FROM public.church_organizations WHERE id = $1 LIMIT 1`, [id]);
  return r.rows[0] ?? null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @returns {Promise<{ branches_count: number, active_members_count: number, total_members_count: number }>}
 */
async function getOrganizationUsageCounts(pool, organizationId) {
  const r = await pool.query(
    `SELECT
       COUNT(DISTINCT b.id)::int AS branches_count,
       COUNT(m.id) FILTER (WHERE m.status = 'verified')::int AS active_members_count,
       COUNT(m.id)::int AS total_members_count
     FROM public.church_organizations o
     LEFT JOIN public.church_branches b ON b.organization_id = o.id
     LEFT JOIN public.church_members m ON m.organization_id = o.id
     WHERE o.id = $1
     GROUP BY o.id`,
    [organizationId]
  );
  const row = r.rows[0];
  return {
    branches_count: row ? row.branches_count : 0,
    active_members_count: row ? row.active_members_count : 0,
    total_members_count: row ? row.total_members_count : 0,
  };
}

/**
 * Administrator counts for platform organization overview (single round-trip).
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 */
async function getOrganizationAdminCounts(pool, organizationId) {
  const r = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM public.church_hq_admins WHERE organization_id = $1) AS hq_admin_count,
       (SELECT COUNT(*)::int FROM public.church_hq_admins WHERE organization_id = $1 AND status = 'active') AS active_hq_admin_count,
       (SELECT COUNT(*)::int FROM public.church_branch_admins WHERE organization_id = $1) AS branch_admin_count,
       (SELECT COUNT(*)::int FROM public.church_branch_admins WHERE organization_id = $1 AND status = 'active') AS active_branch_admin_count`,
    [organizationId]
  );
  const row = r.rows[0] || {};
  return {
    hq_admin_count: row.hq_admin_count || 0,
    active_hq_admin_count: row.active_hq_admin_count || 0,
    branch_admin_count: row.branch_admin_count || 0,
    active_branch_admin_count: row.active_branch_admin_count || 0,
  };
}

/**
 * Submitted password-reset requests scoped to one organization.
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 */
async function countSubmittedResetRequestsForOrganization(pool, organizationId) {
  const r = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM public.church_member_password_reset_requests
         WHERE organization_id = $1 AND status = 'submitted') AS member_submitted,
       (SELECT COUNT(*)::int FROM public.church_branch_admin_password_reset_requests
         WHERE organization_id = $1 AND status = 'submitted') AS branch_admin_submitted,
       (SELECT COUNT(*)::int FROM public.church_hq_admin_password_reset_requests
         WHERE organization_id = $1 AND status = 'submitted') AS hq_admin_submitted`,
    [organizationId]
  );
  const row = r.rows[0] || {};
  const member = row.member_submitted || 0;
  const branchAdmin = row.branch_admin_submitted || 0;
  const hqAdmin = row.hq_admin_submitted || 0;
  return {
    member_submitted: member,
    branch_admin_submitted: branchAdmin,
    hq_admin_submitted: hqAdmin,
    total_submitted: member + branchAdmin + hqAdmin,
  };
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @param {{ plan_code: string, plan_status?: string, plan_notes?: string | null }} fields
 * @param {number | null} platformAdminId
 * @returns {Promise<object>}
 */
async function updateOrganizationPlan(pool, organizationId, fields, platformAdminId) {
  const existing = await findOrganizationById(pool, organizationId);
  if (!existing) {
    throw Object.assign(new Error("Organization not found."), { code: "NOT_FOUND" });
  }
  const planCode = normalizePlanCode(fields.plan_code);
  const planStatus = fields.plan_status != null ? String(fields.plan_status) : existing.plan_status || "active";
  const planNotes = fields.plan_notes != null ? fields.plan_notes : existing.plan_notes;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await client.query(
      `UPDATE public.church_organizations
       SET plan_code = $2,
           plan_status = $3,
           plan_notes = $4,
           plan_started_at = CASE
             WHEN plan_code IS DISTINCT FROM $2 AND $2 IS NOT NULL THEN COALESCE(plan_started_at, now())
             ELSE plan_started_at
           END,
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [organizationId, planCode, planStatus, planNotes]
    );
    const updated = r.rows[0];
    await auditLogsRepo.insertAuditLog(client, {
      organization_id: organizationId,
      branch_id: null,
      actor_type: "platform_admin",
      actor_id: platformAdminId || null,
      action: "platform_church_plan_updated",
      entity_type: "church_organization",
      entity_id: organizationId,
      target_label: updated.name,
      metadata_json: {
        previous_plan: existing.plan_code || "free",
        new_plan: updated.plan_code,
        plan_status: updated.plan_status,
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
 * @param {import("pg").Pool} pool
 * @param {{ platform_tenant_id: number, slug: string, name: string, status?: string }} fields
 * @returns {Promise<object>}
 */
async function createOrganization(pool, fields) {
  const slug = String(fields.slug || "")
    .toLowerCase()
    .trim();
  const name = String(fields.name || "").trim();
  const status = fields.status != null ? String(fields.status) : "active";
  const r = await pool.query(
    `INSERT INTO public.church_organizations (platform_tenant_id, slug, name, status)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [fields.platform_tenant_id, slug, name, status]
  );
  return r.rows[0];
}

const STATUS_AUDIT_ACTIONS = {
  suspended: "platform_church_organization_suspended",
  active: "platform_church_organization_reactivated",
  archived: "platform_church_organization_archived",
};

/**
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {number} organizationId
 * @param {string} newStatus
 * @param {{ reason?: string | null, platformAdminId?: number | null, previousStatus?: string }} opts
 */
async function updateOrganizationStatus(db, organizationId, newStatus, opts = {}) {
  const existing =
    opts.previousStatus != null
      ? { status: opts.previousStatus }
      : await findOrganizationById(db, organizationId);
  if (!existing || (opts.previousStatus == null && !existing.id)) {
    throw Object.assign(new Error("Organization not found."), { code: "NOT_FOUND" });
  }
  const previousStatus = existing.status;
  const reason = opts.reason != null ? String(opts.reason).trim().slice(0, 2000) : null;
  const platformAdminId = opts.platformAdminId || null;

  const client = "connect" in db ? await db.connect() : null;
  const runner = client || db;
  try {
    if (client) await client.query("BEGIN");

    const sets = ["status = $2", "updated_at = now()"];
    const params = [organizationId, newStatus];
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
      `UPDATE public.church_organizations
       SET ${sets.join(", ")}
       WHERE id = $1
       RETURNING *`,
      params
    );
    const updated = r.rows[0];
    if (!updated) {
      throw Object.assign(new Error("Organization not found."), { code: "NOT_FOUND" });
    }

    const auditAction = STATUS_AUDIT_ACTIONS[newStatus];
    if (auditAction) {
      await auditLogsRepo.insertAuditLog(runner, {
        organization_id: organizationId,
        branch_id: null,
        actor_type: "platform_admin",
        actor_id: platformAdminId,
        action: auditAction,
        entity_type: "church_organization",
        entity_id: organizationId,
        target_label: updated.name,
        metadata_json: {
          previous_status: previousStatus,
          new_status: newStatus,
          reason: reason || null,
          result: "ok",
          organization_id: organizationId,
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

async function suspendOrganization(pool, organizationId, { reason, platformAdminId }) {
  return updateOrganizationStatus(pool, organizationId, "suspended", { reason, platformAdminId });
}

async function reactivateOrganization(pool, organizationId, { reason, platformAdminId }) {
  return updateOrganizationStatus(pool, organizationId, "active", { reason, platformAdminId });
}

async function archiveOrganization(pool, organizationId, { reason, platformAdminId }) {
  return updateOrganizationStatus(pool, organizationId, "archived", { reason, platformAdminId });
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @returns {Promise<object | null>}
 */
async function findOrganizationByIdForPlatform(pool, organizationId) {
  return findOrganizationById(pool, organizationId);
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {string} slug
 * @param {number} excludeOrganizationId
 * @returns {Promise<boolean>}
 */
async function checkOrganizationSlugAvailableForUpdate(db, slug, excludeOrganizationId) {
  const s = normalizeSlug(slug);
  if (!s) return false;
  const id = Number(excludeOrganizationId);
  const r = await db.query(
    `SELECT 1 FROM public.church_organizations
     WHERE slug = $1 AND id <> $2
     LIMIT 1`,
    [s, id]
  );
  return r.rows.length === 0;
}

function metadataFieldChanged(before, after, field) {
  const beforeVal = before[field] == null ? "" : String(before[field]).trim();
  const afterVal = after[field] == null ? "" : String(after[field]).trim();
  return beforeVal !== afterVal;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @param {{ name: string, slug: string, country: string, city?: string | null, primary_contact_name?: string | null, primary_contact_phone?: string | null, primary_contact_email?: string | null }} fields
 * @param {number | null} platformAdminId
 * @returns {Promise<{ organization: object, slugChanged: boolean, previousSlug: string, newSlug: string }>}
 */
async function updateOrganizationMetadataForPlatform(pool, organizationId, fields, platformAdminId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await findOrganizationById(client, organizationId);
    if (!existing) {
      throw Object.assign(new Error("Organization not found."), { code: "NOT_FOUND" });
    }

    const newSlug = normalizeSlug(fields.slug);
    const available = await checkOrganizationSlugAvailableForUpdate(client, newSlug, organizationId);
    if (!available) {
      throw Object.assign(new Error("Organization slug is already in use."), { code: "DUPLICATE_ORG_SLUG" });
    }

    const previousSlug = String(existing.slug || "").trim().toLowerCase();
    const slugChanged = previousSlug !== newSlug;

    const next = {
      name: String(fields.name || "").trim(),
      slug: newSlug,
      country: fields.country != null ? String(fields.country).trim() : null,
      city: fields.city != null ? fields.city : null,
      primary_contact_name: fields.primary_contact_name != null ? fields.primary_contact_name : null,
      primary_contact_phone: fields.primary_contact_phone != null ? fields.primary_contact_phone : null,
      primary_contact_email: fields.primary_contact_email != null ? fields.primary_contact_email : null,
    };

    const changedFields = [];
    if (metadataFieldChanged(existing, next, "name")) changedFields.push("name");
    if (slugChanged) changedFields.push("slug");
    if (metadataFieldChanged(existing, next, "country")) changedFields.push("country");
    if (metadataFieldChanged(existing, next, "city")) changedFields.push("city");
    if (metadataFieldChanged(existing, next, "primary_contact_name")) changedFields.push("primary_contact_name");
    if (metadataFieldChanged(existing, next, "primary_contact_phone")) changedFields.push("primary_contact_phone");
    if (metadataFieldChanged(existing, next, "primary_contact_email")) changedFields.push("primary_contact_email");

    const r = await client.query(
      `UPDATE public.church_organizations
       SET name = $2,
           slug = $3,
           country = $4,
           city = $5,
           primary_contact_name = $6,
           primary_contact_phone = $7,
           primary_contact_email = $8,
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        organizationId,
        next.name,
        next.slug,
        next.country,
        next.city,
        next.primary_contact_name,
        next.primary_contact_phone,
        next.primary_contact_email,
      ]
    );
    const updated = r.rows[0];

    const auditBase = {
      organization_id: organizationId,
      branch_id: null,
      actor_type: "platform_admin",
      actor_id: platformAdminId || null,
      entity_type: "church_organization",
      entity_id: organizationId,
      target_label: updated.name,
    };

    if (changedFields.length > 0) {
      await auditLogsRepo.insertAuditLog(client, {
        ...auditBase,
        action: "platform_church_organization_updated",
        metadata_json: {
          organization_id: organizationId,
          organization_name: updated.name,
          changed_fields: changedFields,
          previous_slug: previousSlug,
          new_slug: newSlug,
        },
      });
    }

    if (slugChanged) {
      await auditLogsRepo.insertAuditLog(client, {
        ...auditBase,
        action: "platform_church_organization_slug_changed",
        metadata_json: {
          organization_id: organizationId,
          organization_name: updated.name,
          previous_slug: previousSlug,
          new_slug: newSlug,
          changed_fields: changedFields,
        },
      });
    }

    await client.query("COMMIT");
    return { organization: updated, slugChanged, previousSlug, newSlug };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  findOrganizationBySlug,
  findOrganizationById,
  findOrganizationByIdForPlatform,
  checkOrganizationSlugAvailableForUpdate,
  getOrganizationUsageCounts,
  getOrganizationAdminCounts,
  countSubmittedResetRequestsForOrganization,
  updateOrganizationPlan,
  updateOrganizationMetadataForPlatform,
  createOrganization,
  updateOrganizationStatus,
  suspendOrganization,
  reactivateOrganization,
  archiveOrganization,
};
