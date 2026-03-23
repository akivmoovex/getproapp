/**
 * Auto-create tenant CRM tasks for inbound events (join signups, callbacks, company leads).
 * Tasks are unassigned (owner_id NULL) and status "new" so they appear in the New column + Unassigned sidebar.
 */

function createCrmTaskFromEvent(db, { tenantId, title, description, sourceType, sourceRefId }) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid <= 0) return null;
  const t = String(title || "").trim().slice(0, 200);
  if (!t) return null;
  const desc = String(description || "").trim().slice(0, 8000);
  const st = String(sourceType || "manual").trim().slice(0, 40) || "manual";
  const ref =
    sourceRefId != null && Number.isFinite(Number(sourceRefId)) && Number(sourceRefId) > 0
      ? Number(sourceRefId)
      : null;

  const r = db
    .prepare(
      `INSERT INTO crm_tasks (tenant_id, title, description, status, owner_id, created_by_id, attachment_url, source_type, source_ref_id)
       VALUES (?, ?, ?, 'new', NULL, NULL, '', ?, ?)`
    )
    .run(tid, t, desc, st, ref);
  return Number(r.lastInsertRowid);
}

module.exports = { createCrmTaskFromEvent };
