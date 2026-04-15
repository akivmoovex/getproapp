"use strict";

function sanitizePresetName(name) {
  return String(name || "").trim().slice(0, 120);
}

async function listPresets(pool, tenantId, adminUserId, recordType) {
  const tid = Number(tenantId);
  const uid = Number(adminUserId);
  const rt = String(recordType || "").trim();
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(uid) || uid < 1 || !rt) return [];
  const r = await pool.query(
    `
    SELECT id, tenant_id, admin_user_id, name, record_type, bucket, filters_json, created_at, updated_at
    FROM public.admin_field_agent_analytics_presets
    WHERE tenant_id = $1 AND admin_user_id = $2 AND record_type = $3
    ORDER BY lower(name) ASC, id ASC
    `,
    [tid, uid, rt]
  );
  return r.rows;
}

async function createPreset(pool, p) {
  const tid = Number(p.tenantId);
  const uid = Number(p.adminUserId);
  const name = sanitizePresetName(p.name);
  const recordType = String(p.recordType || "").trim();
  const bucket = String(p.bucket || "").trim();
  const filtersJson = p.filtersJson || {};
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(uid) || uid < 1 || !name || !recordType || !bucket) return null;
  const r = await pool.query(
    `
    INSERT INTO public.admin_field_agent_analytics_presets
    (tenant_id, admin_user_id, name, record_type, bucket, filters_json)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    RETURNING id, tenant_id, admin_user_id, name, record_type, bucket, filters_json, created_at, updated_at
    `,
    [tid, uid, name, recordType, bucket, JSON.stringify(filtersJson)]
  );
  return r.rows[0] || null;
}

async function updatePresetName(pool, p) {
  const tid = Number(p.tenantId);
  const uid = Number(p.adminUserId);
  const id = Number(p.presetId);
  const name = sanitizePresetName(p.name);
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(uid) || uid < 1 || !Number.isFinite(id) || id < 1 || !name) {
    return null;
  }
  const r = await pool.query(
    `
    UPDATE public.admin_field_agent_analytics_presets
    SET name = $4, updated_at = now()
    WHERE id = $1 AND tenant_id = $2 AND admin_user_id = $3
    RETURNING id, tenant_id, admin_user_id, name, record_type, bucket, filters_json, created_at, updated_at
    `,
    [id, tid, uid, name]
  );
  return r.rows[0] || null;
}

async function deletePreset(pool, p) {
  const tid = Number(p.tenantId);
  const uid = Number(p.adminUserId);
  const id = Number(p.presetId);
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(uid) || uid < 1 || !Number.isFinite(id) || id < 1) {
    return false;
  }
  const r = await pool.query(
    `
    DELETE FROM public.admin_field_agent_analytics_presets
    WHERE id = $1 AND tenant_id = $2 AND admin_user_id = $3
    `,
    [id, tid, uid]
  );
  return r.rowCount === 1;
}

module.exports = {
  listPresets,
  createPreset,
  updatePresetName,
  deletePreset,
};
