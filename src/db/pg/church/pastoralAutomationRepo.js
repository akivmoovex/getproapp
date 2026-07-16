"use strict";

const DEFAULT_SETTINGS = Object.freeze({
  enabled: false,
  missed_service_threshold_weeks: null,
  first_response_target_hours: 48,
  follow_up_target_days: 7,
  auto_create_cases: true,
});

async function findSettingsForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT * FROM public.church_pastoral_automation_settings WHERE branch_id = $1 LIMIT 1`,
    [branchId]
  );
  return r.rows[0] ?? null;
}

async function getSettingsWithDefaults(pool, branchId) {
  const row = await findSettingsForBranch(pool, branchId);
  if (!row) return { ...DEFAULT_SETTINGS, branch_id: branchId };
  return row;
}

async function upsertSettings(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_pastoral_automation_settings (
       organization_id, branch_id, enabled, missed_service_threshold_weeks,
       first_response_target_hours, follow_up_target_days, auto_create_cases, updated_by_admin_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (branch_id) DO UPDATE SET
       enabled = EXCLUDED.enabled,
       missed_service_threshold_weeks = EXCLUDED.missed_service_threshold_weeks,
       first_response_target_hours = EXCLUDED.first_response_target_hours,
       follow_up_target_days = EXCLUDED.follow_up_target_days,
       auto_create_cases = EXCLUDED.auto_create_cases,
       updated_by_admin_id = EXCLUDED.updated_by_admin_id,
       updated_at = now()
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.enabled === true,
      fields.missed_service_threshold_weeks ?? null,
      fields.first_response_target_hours ?? 48,
      fields.follow_up_target_days ?? 7,
      fields.auto_create_cases !== false,
      fields.updated_by_admin_id ?? null,
    ]
  );
  return r.rows[0];
}

async function beginRun(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_pastoral_automation_runs (
       organization_id, branch_id, run_key, job_type, status
     ) VALUES ($1, $2, $3, $4, 'running')
     ON CONFLICT (branch_id, run_key) DO NOTHING
     RETURNING *`,
    [fields.organization_id, fields.branch_id, fields.run_key, fields.job_type || "missed_service_scan"]
  );
  return r.rows[0] ?? null;
}

async function findRunByKey(pool, branchId, runKey) {
  const r = await pool.query(
    `SELECT * FROM public.church_pastoral_automation_runs
     WHERE branch_id = $1 AND run_key = $2 LIMIT 1`,
    [branchId, runKey]
  );
  return r.rows[0] ?? null;
}

async function completeRun(pool, runId, stats) {
  const r = await pool.query(
    `UPDATE public.church_pastoral_automation_runs
     SET status = 'completed', stats_json = $2::jsonb, completed_at = now()
     WHERE id = $1
     RETURNING *`,
    [runId, JSON.stringify(stats || {})]
  );
  return r.rows[0] ?? null;
}

async function insertWorkItem(pool, fields) {
  const existing = await findActiveWorkItemForMember(
    pool,
    fields.branch_id,
    fields.member_id,
    fields.trigger_type || "missed_service"
  );
  if (existing) return existing;

  const r = await pool.query(
    `INSERT INTO public.church_pastoral_automation_work_items (
       organization_id, branch_id, member_id, trigger_type, status, risk_level,
       recommendation_summary, confidentiality_level, pastoral_case_id, automation_run_id
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      fields.organization_id,
      fields.branch_id,
      fields.member_id,
      fields.trigger_type || "missed_service",
      fields.status || "pending",
      fields.risk_level || "standard",
      fields.recommendation_summary || "",
      fields.confidentiality_level || "standard",
      fields.pastoral_case_id ?? null,
      fields.automation_run_id ?? null,
    ]
  );
  return r.rows[0];
}

async function findActiveWorkItemForMember(pool, branchId, memberId, triggerType) {
  const r = await pool.query(
    `SELECT * FROM public.church_pastoral_automation_work_items
     WHERE branch_id = $1 AND member_id = $2 AND trigger_type = $3
       AND status IN ('pending', 'converted')
     LIMIT 1`,
    [branchId, memberId, triggerType]
  );
  return r.rows[0] ?? null;
}

async function findWorkItemByIdForBranch(pool, workItemId, branchId) {
  const r = await pool.query(
    `SELECT w.*, m.full_name AS member_name
     FROM public.church_pastoral_automation_work_items w
     INNER JOIN public.church_members m ON m.id = w.member_id
     WHERE w.id = $1 AND w.branch_id = $2
     LIMIT 1`,
    [workItemId, branchId]
  );
  return r.rows[0] ?? null;
}

async function listWorkItemsForBranch(pool, branchId, opts = {}) {
  const statuses = opts.statuses || ["pending", "converted"];
  const r = await pool.query(
    `SELECT w.*, m.full_name AS member_name
     FROM public.church_pastoral_automation_work_items w
     INNER JOIN public.church_members m ON m.id = w.member_id
     WHERE w.branch_id = $1 AND w.status = ANY($2::text[])
     ORDER BY w.created_at DESC
     LIMIT $3`,
    [branchId, statuses, Math.min(Math.max(Number(opts.limit) || 50, 1), 200)]
  );
  return r.rows;
}

async function updateWorkItem(pool, workItemId, fields) {
  const r = await pool.query(
    `UPDATE public.church_pastoral_automation_work_items
     SET status = COALESCE($2, status),
         pastoral_case_id = COALESCE($3, pastoral_case_id),
         accepted_by_admin_id = COALESCE($4, accepted_by_admin_id),
         dismissed_by_admin_id = COALESCE($5, dismissed_by_admin_id),
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      workItemId,
      fields.status ?? null,
      fields.pastoral_case_id ?? null,
      fields.accepted_by_admin_id ?? null,
      fields.dismissed_by_admin_id ?? null,
    ]
  );
  return r.rows[0] ?? null;
}

async function listOverdueCasesForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT c.*, m.full_name AS member_name, aa.full_name AS assigned_admin_name
     FROM public.church_pastoral_cases c
     INNER JOIN public.church_members m ON m.id = c.member_id
     LEFT JOIN public.church_branch_admins aa ON aa.id = c.assigned_admin_id
     WHERE c.branch_id = $1
       AND c.status IN ('open', 'in_follow_up', 'escalated', 'pending_supervisor_ack')
       AND (
         (c.first_response_due_at IS NOT NULL AND c.first_response_due_at < now() AND c.status = 'open')
         OR (c.follow_up_due_at IS NOT NULL AND c.follow_up_due_at < now() AND c.status IN ('in_follow_up', 'escalated'))
       )
     ORDER BY COALESCE(c.first_response_due_at, c.follow_up_due_at) ASC`,
    [branchId]
  );
  return r.rows;
}

async function workloadByAdminForBranch(pool, branchId) {
  const r = await pool.query(
    `SELECT ba.id AS admin_id, ba.full_name,
            COUNT(c.id) FILTER (WHERE c.status IN ('open', 'in_follow_up', 'escalated', 'pending_supervisor_ack', 'paused'))::int AS open_cases,
            COUNT(c.id) FILTER (WHERE c.status = 'escalated')::int AS escalated_cases,
            COUNT(c.id) FILTER (WHERE c.first_response_due_at < now() AND c.status = 'open')::int AS overdue_first_response
     FROM public.church_branch_admins ba
     LEFT JOIN public.church_pastoral_cases c ON c.assigned_admin_id = ba.id AND c.branch_id = ba.branch_id
     WHERE ba.branch_id = $1 AND ba.status = 'active' AND ba.can_access_pastoral = true
     GROUP BY ba.id, ba.full_name
     ORDER BY open_cases DESC, ba.full_name ASC`,
    [branchId]
  );
  return r.rows;
}

async function branchComparisonForOrganization(pool, organizationId) {
  const r = await pool.query(
    `SELECT b.id AS branch_id, b.name AS branch_name,
            COUNT(c.id) FILTER (WHERE c.status IN ('open', 'in_follow_up', 'escalated', 'pending_supervisor_ack', 'paused'))::int AS open_cases,
            COUNT(c.id) FILTER (WHERE c.status = 'escalated')::int AS escalated_cases,
            COUNT(w.id) FILTER (WHERE w.status = 'pending')::int AS pending_work_items,
            COUNT(c.id) FILTER (
              WHERE c.first_response_due_at < now() AND c.status = 'open'
            )::int AS overdue_first_response
     FROM public.church_branches b
     LEFT JOIN public.church_pastoral_cases c ON c.branch_id = b.id
     LEFT JOIN public.church_pastoral_automation_work_items w ON w.branch_id = b.id
     WHERE b.organization_id = $1
     GROUP BY b.id, b.name
     ORDER BY b.name ASC`,
    [organizationId]
  );
  return r.rows;
}

module.exports = {
  DEFAULT_SETTINGS,
  findSettingsForBranch,
  getSettingsWithDefaults,
  upsertSettings,
  beginRun,
  findRunByKey,
  completeRun,
  insertWorkItem,
  findActiveWorkItemForMember,
  findWorkItemByIdForBranch,
  listWorkItemsForBranch,
  updateWorkItem,
  listOverdueCasesForBranch,
  workloadByAdminForBranch,
  branchComparisonForOrganization,
};
