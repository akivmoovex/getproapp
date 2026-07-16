"use strict";

async function getCommunicationPolicy(pool, organizationId) {
  const r = await pool.query(
    `SELECT p.*, o.timezone AS organization_timezone
     FROM public.church_organizations o
     LEFT JOIN public.church_organization_communication_policies p
       ON p.organization_id = o.id
     WHERE o.id = $1
     LIMIT 1`,
    [organizationId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    organization_id: organizationId,
    quiet_hours_enabled: Boolean(row.quiet_hours_enabled),
    quiet_hours_start: formatTime(row.quiet_hours_start, "21:00"),
    quiet_hours_end: formatTime(row.quiet_hours_end, "07:00"),
    timezone: row.organization_timezone || "UTC",
    updated_at: row.updated_at || null,
  };
}

function formatTime(raw, fallback) {
  if (raw == null) return fallback;
  if (typeof raw === "string") return raw.slice(0, 5);
  if (raw instanceof Date) {
    return `${String(raw.getUTCHours()).padStart(2, "0")}:${String(raw.getUTCMinutes()).padStart(2, "0")}`;
  }
  return fallback;
}

async function upsertCommunicationPolicy(pool, organizationId, fields, hqAdminId) {
  const r = await pool.query(
    `INSERT INTO public.church_organization_communication_policies (
       organization_id, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, updated_by_hq_admin_id
     ) VALUES ($1, $2, $3::time, $4::time, $5)
     ON CONFLICT (organization_id) DO UPDATE SET
       quiet_hours_enabled = EXCLUDED.quiet_hours_enabled,
       quiet_hours_start = EXCLUDED.quiet_hours_start,
       quiet_hours_end = EXCLUDED.quiet_hours_end,
       updated_by_hq_admin_id = EXCLUDED.updated_by_hq_admin_id,
       updated_at = now()
     RETURNING *`,
    [
      organizationId,
      Boolean(fields.quiet_hours_enabled),
      fields.quiet_hours_start,
      fields.quiet_hours_end,
      hqAdminId || null,
    ]
  );
  return r.rows[0];
}

async function insertBroadcastTestDelivery(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_hq_broadcast_test_deliveries (
       organization_id, broadcast_id, recipient_hq_admin_id, recipient_email,
       subject_rendered, channels_json, requested_by_hq_admin_id
     ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
     RETURNING *`,
    [
      fields.organization_id,
      fields.broadcast_id,
      fields.recipient_hq_admin_id || null,
      fields.recipient_email,
      fields.subject_rendered || "",
      JSON.stringify(fields.channels_json || ["email"]),
      fields.requested_by_hq_admin_id || null,
    ]
  );
  return r.rows[0];
}

module.exports = {
  getCommunicationPolicy,
  upsertCommunicationPolicy,
  insertBroadcastTestDelivery,
};
