"use strict";

const { STATUS } = require("./constants");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapRow(row) {
  if (!row) return null;
  return {
    organizationId: String(row.organization_id),
    productCode: String(row.product_code),
    status: String(row.status || STATUS.NOT_STARTED),
    currentStepKey: row.current_step_key != null ? String(row.current_step_key) : null,
    skippedStepKeys: Array.isArray(row.skipped_step_keys)
      ? row.skipped_step_keys.map((k) => String(k))
      : [],
    startedAt: row.started_at || null,
    completedAt: row.completed_at || null,
    lastResumedAt: row.last_resumed_at || null,
    lastAuditAction: row.last_audit_action != null ? String(row.last_audit_action) : null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

async function getProgress(db, organizationId, productCode) {
  const orgId = String(organizationId || "").trim();
  const product = String(productCode || "").trim();
  if (!UUID_RE.test(orgId) || !product) return null;
  const r = await db.query(
    `SELECT organization_id, product_code, status, current_step_key, skipped_step_keys,
            started_at, completed_at, last_resumed_at, last_audit_action, created_at, updated_at
       FROM platform.organization_onboarding_progress
      WHERE organization_id = $1 AND product_code = $2
      LIMIT 1`,
    [orgId, product]
  );
  return mapRow(r.rows[0] || null);
}

/**
 * @param {{ query: Function }} db
 * @param {{
 *   organizationId: string,
 *   productCode: string,
 *   status?: string,
 *   currentStepKey?: string|null,
 *   skippedStepKeys?: string[],
 *   markStarted?: boolean,
 *   markCompleted?: boolean,
 *   clearCompleted?: boolean,
 *   markResumed?: boolean,
 *   lastAuditAction?: string|null,
 * }} fields
 */
async function upsertProgress(db, fields) {
  const organizationId = String((fields && fields.organizationId) || "").trim();
  const productCode = String((fields && fields.productCode) || "").trim();
  if (!UUID_RE.test(organizationId) || !productCode) {
    throw new Error("invalid_onboarding_progress_scope");
  }
  const skipped = Array.isArray(fields.skippedStepKeys)
    ? [...new Set(fields.skippedStepKeys.map((k) => String(k).trim()).filter(Boolean))]
    : [];
  const status = String(fields.status || STATUS.NOT_STARTED);
  const currentStepKey =
    fields.currentStepKey != null && String(fields.currentStepKey).trim()
      ? String(fields.currentStepKey).trim().slice(0, 64)
      : null;
  const lastAuditAction =
    fields.lastAuditAction != null && String(fields.lastAuditAction).trim()
      ? String(fields.lastAuditAction).trim().slice(0, 64)
      : null;
  const markStarted = fields.markStarted === true;
  const markCompleted = fields.markCompleted === true;
  const clearCompleted = fields.clearCompleted === true;
  const markResumed = fields.markResumed === true;

  const r = await db.query(
    `INSERT INTO platform.organization_onboarding_progress (
       organization_id, product_code, status, current_step_key, skipped_step_keys,
       started_at, completed_at, last_resumed_at, last_audit_action
     ) VALUES (
       $1, $2, $3, $4, $5::text[],
       CASE WHEN $6::boolean THEN now() ELSE NULL END,
       CASE WHEN $7::boolean THEN now() ELSE NULL END,
       CASE WHEN $8::boolean THEN now() ELSE NULL END,
       $9
     )
     ON CONFLICT (organization_id, product_code) DO UPDATE SET
       status = EXCLUDED.status,
       current_step_key = EXCLUDED.current_step_key,
       skipped_step_keys = EXCLUDED.skipped_step_keys,
       started_at = CASE
         WHEN platform.organization_onboarding_progress.started_at IS NOT NULL
           THEN platform.organization_onboarding_progress.started_at
         WHEN $6::boolean THEN now()
         ELSE platform.organization_onboarding_progress.started_at
       END,
       completed_at = CASE
         WHEN $10::boolean THEN NULL
         WHEN $7::boolean THEN COALESCE(platform.organization_onboarding_progress.completed_at, now())
         ELSE platform.organization_onboarding_progress.completed_at
       END,
       last_resumed_at = CASE
         WHEN $8::boolean THEN now()
         ELSE platform.organization_onboarding_progress.last_resumed_at
       END,
       last_audit_action = COALESCE(EXCLUDED.last_audit_action, platform.organization_onboarding_progress.last_audit_action),
       updated_at = now()
     RETURNING organization_id, product_code, status, current_step_key, skipped_step_keys,
               started_at, completed_at, last_resumed_at, last_audit_action, created_at, updated_at`,
    [
      organizationId,
      productCode,
      status,
      currentStepKey,
      skipped,
      markStarted,
      markCompleted,
      markResumed,
      lastAuditAction,
      clearCompleted,
    ]
  );
  return mapRow(r.rows[0] || null);
}

module.exports = {
  getProgress,
  upsertProgress,
  mapRow,
};
