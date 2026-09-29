"use strict";

/**
 * Platform data job repository (import/export shell).
 */

const JOB_COLUMNS = `
  id, organization_id, product_code, job_kind, entity_key, status, dry_run,
  facility_id, branch_id, input_file_ref, output_file_ref, error_report_ref,
  progress_json, result_summary_json, created_by_identity_id, updated_by_identity_id,
  started_at, completed_at, created_at, updated_at
`;

function mapJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    productCode: row.product_code,
    jobKind: row.job_kind,
    entityKey: row.entity_key,
    status: row.status,
    dryRun: row.dry_run === true,
    facilityId: row.facility_id || null,
    branchId: row.branch_id || null,
    inputFileRef: row.input_file_ref || null,
    outputFileRef: row.output_file_ref || null,
    errorReportRef: row.error_report_ref || null,
    progress: row.progress_json || {},
    resultSummary: row.result_summary_json || {},
    createdByIdentityId: row.created_by_identity_id || null,
    updatedByIdentityId: row.updated_by_identity_id || null,
    startedAt: row.started_at || null,
    completedAt: row.completed_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function insertDataJob(db, row) {
  const result = await db.query(
    `INSERT INTO platform.data_jobs (
       organization_id, product_code, job_kind, entity_key, status, dry_run,
       facility_id, branch_id, input_file_ref, created_by_identity_id,
       updated_by_identity_id, progress_json, result_summary_json
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb
     )
     RETURNING ${JOB_COLUMNS}`,
    [
      row.organizationId,
      row.productCode,
      row.jobKind,
      row.entityKey,
      row.status || "queued",
      row.dryRun !== false,
      row.facilityId || null,
      row.branchId || null,
      row.inputFileRef || null,
      row.createdByIdentityId || null,
      row.updatedByIdentityId || null,
      JSON.stringify(row.progress || {}),
      JSON.stringify(row.resultSummary || {}),
    ]
  );
  return mapJob(result.rows[0]);
}

async function findDataJobById(db, { organizationId, jobId }) {
  const result = await db.query(
    `SELECT ${JOB_COLUMNS}
     FROM platform.data_jobs
     WHERE id = $1 AND organization_id = $2
     LIMIT 1`,
    [jobId, organizationId]
  );
  return mapJob(result.rows[0] || null);
}

async function listDataJobs(db, { organizationId, productCode, limit, offset }) {
  const result = await db.query(
    `SELECT ${JOB_COLUMNS}
     FROM platform.data_jobs
     WHERE organization_id = $1
       AND ($2::text IS NULL OR product_code = $2)
     ORDER BY created_at DESC
     LIMIT $3 OFFSET $4`,
    [organizationId, productCode || null, limit, offset]
  );
  return result.rows.map(mapJob);
}

async function countDataJobs(db, { organizationId, productCode }) {
  const result = await db.query(
    `SELECT COUNT(*)::int AS n
     FROM platform.data_jobs
     WHERE organization_id = $1
       AND ($2::text IS NULL OR product_code = $2)`,
    [organizationId, productCode || null]
  );
  return Number(result.rows[0] && result.rows[0].n) || 0;
}

async function updateDataJobStatus(db, row) {
  const result = await db.query(
    `UPDATE platform.data_jobs
     SET status = $3,
         progress_json = COALESCE($4::jsonb, progress_json),
         result_summary_json = COALESCE($5::jsonb, result_summary_json),
         output_file_ref = COALESCE($6, output_file_ref),
         error_report_ref = COALESCE($7, error_report_ref),
         updated_by_identity_id = COALESCE($8, updated_by_identity_id),
         started_at = CASE
           WHEN $3 IN ('validating', 'running') AND started_at IS NULL THEN now()
           ELSE started_at
         END,
         completed_at = CASE
           WHEN $3 IN ('succeeded', 'failed', 'cancelled') THEN now()
           ELSE completed_at
         END,
         updated_at = now()
     WHERE id = $1 AND organization_id = $2
     RETURNING ${JOB_COLUMNS}`,
    [
      row.jobId,
      row.organizationId,
      row.status,
      row.progress ? JSON.stringify(row.progress) : null,
      row.resultSummary ? JSON.stringify(row.resultSummary) : null,
      row.outputFileRef || null,
      row.errorReportRef || null,
      row.updatedByIdentityId || null,
    ]
  );
  return mapJob(result.rows[0] || null);
}

async function insertDataJobEvent(db, row) {
  const result = await db.query(
    `INSERT INTO platform.data_job_events (
       job_id, organization_id, from_status, to_status,
       actor_identity_id, note, metadata_json
     ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
     RETURNING id, job_id, organization_id, from_status, to_status,
               actor_identity_id, note, metadata_json, created_at`,
    [
      row.jobId,
      row.organizationId,
      row.fromStatus || null,
      row.toStatus,
      row.actorIdentityId || null,
      row.note || null,
      JSON.stringify(row.metadata || {}),
    ]
  );
  const event = result.rows[0];
  return {
    id: event.id,
    jobId: event.job_id,
    organizationId: event.organization_id,
    fromStatus: event.from_status,
    toStatus: event.to_status,
    actorIdentityId: event.actor_identity_id,
    note: event.note,
    metadata: event.metadata_json || {},
    createdAt: event.created_at,
  };
}

async function listDataJobEvents(db, { organizationId, jobId }) {
  const result = await db.query(
    `SELECT id, job_id, organization_id, from_status, to_status,
            actor_identity_id, note, metadata_json, created_at
     FROM platform.data_job_events
     WHERE job_id = $1 AND organization_id = $2
     ORDER BY created_at ASC`,
    [jobId, organizationId]
  );
  return result.rows.map((event) => ({
    id: event.id,
    jobId: event.job_id,
    organizationId: event.organization_id,
    fromStatus: event.from_status,
    toStatus: event.to_status,
    actorIdentityId: event.actor_identity_id,
    note: event.note,
    metadata: event.metadata_json || {},
    createdAt: event.created_at,
  }));
}

module.exports = {
  mapJob,
  insertDataJob,
  findDataJobById,
  listDataJobs,
  countDataJobs,
  updateDataJobStatus,
  insertDataJobEvent,
  listDataJobEvents,
};
