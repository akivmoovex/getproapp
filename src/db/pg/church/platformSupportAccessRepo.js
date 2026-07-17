"use strict";

/**
 * Persistence for account-manager assignments and platform support access grants.
 */

function mapAccessRow(row) {
  if (!row) return null;
  return {
    ...row,
    id: Number(row.id),
    support_admin_user_id: Number(row.support_admin_user_id),
    organization_id: Number(row.organization_id),
    branch_id: row.branch_id != null ? Number(row.branch_id) : null,
    approved_by_admin_user_id:
      row.approved_by_admin_user_id != null ? Number(row.approved_by_admin_user_id) : null,
    revoked_by_admin_user_id:
      row.revoked_by_admin_user_id != null ? Number(row.revoked_by_admin_user_id) : null,
  };
}

async function getAccountManagers(db, organizationId) {
  const r = await db.query(
    `SELECT m.*,
            p.username AS primary_username,
            COALESCE(NULLIF(trim(p.display_name), ''), p.username) AS primary_display_name,
            b.username AS backup_username,
            COALESCE(NULLIF(trim(b.display_name), ''), b.username) AS backup_display_name,
            a.username AS assigned_by_username
     FROM public.church_organization_account_managers m
     LEFT JOIN public.admin_users p ON p.id = m.primary_admin_user_id
     LEFT JOIN public.admin_users b ON b.id = m.backup_admin_user_id
     LEFT JOIN public.admin_users a ON a.id = m.assigned_by_admin_user_id
     WHERE m.organization_id = $1`,
    [organizationId]
  );
  return r.rows[0] || null;
}

async function upsertAccountManagers(db, fields) {
  const r = await db.query(
    `INSERT INTO public.church_organization_account_managers (
       organization_id, primary_admin_user_id, backup_admin_user_id,
       status, assigned_by_admin_user_id, assigned_at, internal_note, updated_at
     ) VALUES ($1,$2,$3,$4,$5,now(),$6,now())
     ON CONFLICT (organization_id) DO UPDATE SET
       primary_admin_user_id = EXCLUDED.primary_admin_user_id,
       backup_admin_user_id = EXCLUDED.backup_admin_user_id,
       status = EXCLUDED.status,
       assigned_by_admin_user_id = EXCLUDED.assigned_by_admin_user_id,
       assigned_at = now(),
       internal_note = EXCLUDED.internal_note,
       updated_at = now()
     RETURNING *`,
    [
      fields.organization_id,
      fields.primary_admin_user_id,
      fields.backup_admin_user_id,
      fields.status || "active",
      fields.assigned_by_admin_user_id || null,
      fields.internal_note || null,
    ]
  );
  return r.rows[0];
}

async function findAccessById(db, accessId) {
  const r = await db.query(
    `SELECT a.*,
            s.username AS support_username,
            COALESCE(NULLIF(trim(s.display_name), ''), s.username) AS support_display_name,
            s.enabled AS support_enabled,
            s.role AS support_role,
            s.tenant_id AS support_tenant_id,
            o.name AS organization_name,
            o.platform_tenant_id,
            o.country AS organization_country,
            br.name AS branch_name
     FROM public.church_platform_support_access a
     INNER JOIN public.admin_users s ON s.id = a.support_admin_user_id
     INNER JOIN public.church_organizations o ON o.id = a.organization_id
     LEFT JOIN public.church_branches br ON br.id = a.branch_id
     WHERE a.id = $1`,
    [accessId]
  );
  return mapAccessRow(r.rows[0]);
}

async function listAccessForOrganization(db, organizationId, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 100);
  const r = await db.query(
    `SELECT a.*,
            s.username AS support_username,
            COALESCE(NULLIF(trim(s.display_name), ''), s.username) AS support_display_name
     FROM public.church_platform_support_access a
     INNER JOIN public.admin_users s ON s.id = a.support_admin_user_id
     WHERE a.organization_id = $1
     ORDER BY a.requested_at DESC, a.id DESC
     LIMIT $2`,
    [organizationId, limit]
  );
  return r.rows.map(mapAccessRow);
}

async function listActiveApprovedAccessForSupportUser(db, supportAdminUserId, organizationId) {
  const r = await db.query(
    `SELECT a.*
     FROM public.church_platform_support_access a
     WHERE a.support_admin_user_id = $1
       AND a.organization_id = $2
       AND a.status = 'approved'
       AND a.expires_at IS NOT NULL
       AND a.expires_at > now()
       AND a.revoked_at IS NULL
     ORDER BY a.expires_at DESC, a.id DESC`,
    [supportAdminUserId, organizationId]
  );
  return r.rows.map(mapAccessRow);
}

async function createAccessRequest(db, fields) {
  const r = await db.query(
    `INSERT INTO public.church_platform_support_access (
       support_admin_user_id, organization_id, branch_id,
       ticket_reference, reason, requested_scope, status, requested_at
     ) VALUES ($1,$2,$3,$4,$5,$6,'pending',now())
     RETURNING *`,
    [
      fields.support_admin_user_id,
      fields.organization_id,
      fields.branch_id || null,
      fields.ticket_reference,
      fields.reason,
      fields.requested_scope,
    ]
  );
  return mapAccessRow(r.rows[0]);
}

async function updateAccessStatus(db, accessId, patch) {
  const sets = ["updated_at = now()"];
  const params = [accessId];
  function add(col, val) {
    params.push(val);
    sets.push(`${col} = $${params.length}`);
  }
  if (patch.status != null) add("status", patch.status);
  if (patch.approved_by_admin_user_id !== undefined) {
    add("approved_by_admin_user_id", patch.approved_by_admin_user_id);
  }
  if (patch.approved_at !== undefined) add("approved_at", patch.approved_at);
  if (patch.expires_at !== undefined) add("expires_at", patch.expires_at);
  if (patch.revoked_at !== undefined) add("revoked_at", patch.revoked_at);
  if (patch.revoked_by_admin_user_id !== undefined) {
    add("revoked_by_admin_user_id", patch.revoked_by_admin_user_id);
  }
  if (patch.rejection_reason !== undefined) add("rejection_reason", patch.rejection_reason);

  const r = await db.query(
    `UPDATE public.church_platform_support_access
     SET ${sets.join(", ")}
     WHERE id = $1
     RETURNING *`,
    params
  );
  return mapAccessRow(r.rows[0]);
}

async function insertAccessEvent(db, fields) {
  const r = await db.query(
    `INSERT INTO public.church_platform_support_access_events (
       access_id, organization_id, event_type, actor_admin_user_id,
       action_summary, church_visible, metadata_json
     ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
     RETURNING *`,
    [
      fields.access_id,
      fields.organization_id,
      fields.event_type,
      fields.actor_admin_user_id || null,
      String(fields.action_summary || "").slice(0, 500),
      fields.church_visible !== false,
      JSON.stringify(fields.metadata_json || {}),
    ]
  );
  return r.rows[0];
}

/**
 * Church-visible history: grants + safe events only (no internal notes).
 */
async function listChurchVisibleSupportHistory(db, organizationId, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 100);
  const grants = await db.query(
    `SELECT a.id, a.requested_scope, a.status, a.reason, a.ticket_reference,
            a.requested_at, a.approved_at, a.expires_at, a.revoked_at, a.branch_id,
            COALESCE(NULLIF(trim(s.display_name), ''), s.username) AS support_display_name,
            br.name AS branch_name
     FROM public.church_platform_support_access a
     INNER JOIN public.admin_users s ON s.id = a.support_admin_user_id
     LEFT JOIN public.church_branches br ON br.id = a.branch_id
     WHERE a.organization_id = $1
       AND a.status IN ('approved', 'expired', 'revoked', 'rejected')
     ORDER BY COALESCE(a.approved_at, a.requested_at) DESC, a.id DESC
     LIMIT $2`,
    [organizationId, limit]
  );

  const events = await db.query(
    `SELECT e.access_id, e.event_type, e.action_summary, e.created_at
     FROM public.church_platform_support_access_events e
     WHERE e.organization_id = $1
       AND e.church_visible = true
       AND e.event_type IN ('approval', 'use', 'revocation', 'expiry', 'rejection')
     ORDER BY e.created_at DESC
     LIMIT $2`,
    [organizationId, limit * 3]
  );

  const eventsByAccess = new Map();
  for (const ev of events.rows) {
    const id = Number(ev.access_id);
    if (!eventsByAccess.has(id)) eventsByAccess.set(id, []);
    eventsByAccess.get(id).push({
      event_type: ev.event_type,
      action_summary: ev.action_summary,
      created_at: ev.created_at,
    });
  }

  return grants.rows.map((g) => ({
    id: Number(g.id),
    support_display_name: g.support_display_name,
    access_purpose: g.reason,
    approved_scope: g.requested_scope,
    status: g.status,
    branch_name: g.branch_name || null,
    started_at: g.approved_at || g.requested_at,
    ends_at: g.revoked_at || g.expires_at,
    expires_at: g.expires_at,
    high_level_actions: (eventsByAccess.get(Number(g.id)) || []).slice(0, 20),
  }));
}

async function adminHasTenantScope(db, adminUserId, platformTenantId) {
  const r = await db.query(
    `SELECT 1
     FROM public.admin_users u
     WHERE u.id = $1
       AND u.enabled = true
       AND (
         u.role = 'super_admin'
         OR u.tenant_id = $2
         OR EXISTS (
           SELECT 1 FROM public.admin_user_tenant_roles m
           WHERE m.admin_user_id = u.id AND m.tenant_id = $2
         )
       )
     LIMIT 1`,
    [adminUserId, platformTenantId]
  );
  return Boolean(r.rows[0]);
}

async function findAdminUserSafe(db, adminUserId) {
  const r = await db.query(
    `SELECT id, username, role, tenant_id, enabled,
            COALESCE(NULLIF(trim(display_name), ''), username) AS display_name
     FROM public.admin_users
     WHERE id = $1`,
    [adminUserId]
  );
  return r.rows[0] || null;
}

module.exports = {
  getAccountManagers,
  upsertAccountManagers,
  findAccessById,
  listAccessForOrganization,
  listActiveApprovedAccessForSupportUser,
  createAccessRequest,
  updateAccessStatus,
  insertAccessEvent,
  listChurchVisibleSupportHistory,
  adminHasTenantScope,
  findAdminUserSafe,
};
