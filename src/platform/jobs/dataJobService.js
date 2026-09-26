"use strict";

/**
 * Shared import/export job shell.
 * Products register adapters per entity_key; domain mapping stays product-owned.
 * Scope always comes from trusted auth context — never request body tenant IDs.
 */

const {
  rejectForgedTenantIdentifiers,
} = require("../rbac/sharedTenantScope");
const {
  buildStatusHistoryEntry,
  assertStatusTransition,
} = require("../history/statusHistory");
const {
  recordSharedPlatformAudit,
} = require("../audit/sharedAuditLogging");
const {
  SHARED_AUDIT_ACTION,
  SHARED_AUDIT_ENTITY,
  SHARED_AUDIT_PRODUCT,
} = require("../audit/sharedAuditCatalog");
const {
  getDataJobAdapter,
} = require("./dataJobAdapters");
const repo = require("./dataJobRepository");
const {
  validateImportFile,
} = require("./dataJobFileValidation");
const {
  putArtifact,
  getArtifact,
} = require("./dataJobArtifactStore");

const JOB_TRANSITIONS = Object.freeze({
  "*": ["queued"],
  queued: ["validating", "running", "cancelled"],
  validating: ["running", "failed", "cancelled"],
  running: ["succeeded", "failed", "cancelled"],
  succeeded: [],
  failed: [],
  cancelled: [],
});

function assertTrustedJobScope(input) {
  const trusted = (input && input.trusted) || null;
  const organizationId =
    trusted && trusted.organizationId
      ? String(trusted.organizationId).trim()
      : "";
  if (!organizationId) {
    return {
      ok: false,
      code: "tenant_unresolved",
      reasonCode: "RBAC_TENANT_UNRESOLVED",
      httpStatus: 403,
    };
  }
  const forged = rejectForgedTenantIdentifiers({
    body: input && input.body,
    query: input && input.query,
    trusted: {
      organizationId,
      facilityId: trusted.facilityId || null,
      branchId: trusted.branchId || null,
    },
    allowMatchingTrusted: true,
  });
  if (!forged.ok) return forged;
  return {
    ok: true,
    code: "ok",
    organizationId,
    facilityId: trusted.facilityId ? String(trusted.facilityId) : null,
    branchId: trusted.branchId ? String(trusted.branchId) : null,
  };
}

/**
 * Create a queued import/export job. Does not run product mappers yet.
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {object} input
 */
async function createDataJob(db, input) {
  const scope = assertTrustedJobScope(input);
  if (!scope.ok) return scope;

  const productCode = String(input.productCode || "")
    .trim()
    .toLowerCase();
  if (productCode !== "blessboard" && productCode !== "activeclinic") {
    return { ok: false, code: "invalid_product_code" };
  }
  const jobKind = String(input.jobKind || "")
    .trim()
    .toLowerCase();
  if (jobKind !== "import" && jobKind !== "export") {
    return { ok: false, code: "invalid_job_kind" };
  }
  const entityKey = String(input.entityKey || "").trim();
  if (!entityKey || entityKey.length > 120) {
    return { ok: false, code: "invalid_entity_key" };
  }

  const adapter = getDataJobAdapter(productCode, entityKey);
  if (adapter && !adapter.jobKinds.includes(jobKind)) {
    return { ok: false, code: "job_kind_not_supported" };
  }

  const job = await repo.insertDataJob(db, {
    organizationId: scope.organizationId,
    productCode,
    jobKind,
    entityKey,
    status: "queued",
    dryRun: input.dryRun !== false,
    facilityId: scope.facilityId,
    branchId: scope.branchId,
    inputFileRef: input.inputFileRef || null,
    createdByIdentityId: input.actorIdentityId || null,
    updatedByIdentityId: input.actorIdentityId || null,
  });

  await repo.insertDataJobEvent(db, {
    jobId: job.id,
    organizationId: scope.organizationId,
    fromStatus: null,
    toStatus: "queued",
    actorIdentityId: input.actorIdentityId || null,
    note: "Job created",
    metadata: { dryRun: job.dryRun, entityKey, jobKind },
  });

  await recordSharedPlatformAudit(db, {
    actionKey: SHARED_AUDIT_ACTION.DATA_JOB_CREATED,
    productCode:
      productCode === "blessboard"
        ? SHARED_AUDIT_PRODUCT.BLESSBOARD
        : SHARED_AUDIT_PRODUCT.ACTIVECLINIC,
    organizationId: scope.organizationId,
    facilityId: scope.facilityId,
    branchId: scope.branchId,
    entityType: SHARED_AUDIT_ENTITY.DATA_JOB,
    entityId: job.id,
    actorIdentityId: input.actorIdentityId || null,
    metadata: { jobKind, entityKey, dryRun: job.dryRun },
  });

  return { ok: true, code: "ok", job, adapterRegistered: Boolean(adapter) };
}

/**
 * Transition job status with append-only event + audit.
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {object} input
 */
async function transitionDataJob(db, input) {
  const scope = assertTrustedJobScope(input);
  if (!scope.ok) return scope;
  const jobId = String(input.jobId || "").trim();
  if (!jobId) return { ok: false, code: "invalid_job_id" };

  const existing = await repo.findDataJobById(db, {
    organizationId: scope.organizationId,
    jobId,
  });
  if (!existing) {
    return { ok: false, code: "not_found", httpStatus: 404 };
  }

  const toStatus = String(input.toStatus || "").trim();
  const transition = assertStatusTransition(
    existing.status,
    toStatus,
    JOB_TRANSITIONS
  );
  if (!transition.ok) return transition;

  const history = buildStatusHistoryEntry({
    from: existing.status,
    to: toStatus,
    by: input.actorIdentityId || null,
    note: input.note || null,
  });
  if (!history.ok) return history;

  const job = await repo.updateDataJobStatus(db, {
    jobId,
    organizationId: scope.organizationId,
    status: toStatus,
    progress: input.progress || null,
    resultSummary: input.resultSummary || null,
    outputFileRef: input.outputFileRef || null,
    errorReportRef: input.errorReportRef || null,
    updatedByIdentityId: input.actorIdentityId || null,
  });

  await repo.insertDataJobEvent(db, {
    jobId,
    organizationId: scope.organizationId,
    fromStatus: existing.status,
    toStatus,
    actorIdentityId: input.actorIdentityId || null,
    note: input.note || null,
    metadata: history.entry,
  });

  await recordSharedPlatformAudit(db, {
    actionKey: SHARED_AUDIT_ACTION.DATA_JOB_STATUS_CHANGED,
    productCode:
      existing.productCode === "blessboard"
        ? SHARED_AUDIT_PRODUCT.BLESSBOARD
        : SHARED_AUDIT_PRODUCT.ACTIVECLINIC,
    organizationId: scope.organizationId,
    facilityId: scope.facilityId || existing.facilityId,
    branchId: scope.branchId || existing.branchId,
    entityType: SHARED_AUDIT_ENTITY.DATA_JOB,
    entityId: jobId,
    actorIdentityId: input.actorIdentityId || null,
    metadata: { from: existing.status, to: toStatus },
  });

  return { ok: true, code: "ok", job };
}

async function getDataJob(db, input) {
  const scope = assertTrustedJobScope(input);
  if (!scope.ok) return scope;
  const job = await repo.findDataJobById(db, {
    organizationId: scope.organizationId,
    jobId: String(input.jobId || "").trim(),
  });
  if (!job) return { ok: false, code: "not_found", httpStatus: 404 };
  const events = await repo.listDataJobEvents(db, {
    organizationId: scope.organizationId,
    jobId: job.id,
  });
  return { ok: true, code: "ok", job, events };
}

async function listOrganizationDataJobs(db, input) {
  const scope = assertTrustedJobScope(input);
  if (!scope.ok) return scope;
  const limit = Math.min(Math.max(Number(input.limit) || 50, 1), 100);
  const offset = Math.max(Number(input.offset) || 0, 0);
  const productCode = input.productCode
    ? String(input.productCode).trim().toLowerCase()
    : null;
  const [jobs, total] = await Promise.all([
    repo.listDataJobs(db, {
      organizationId: scope.organizationId,
      productCode,
      limit,
      offset,
    }),
    repo.countDataJobs(db, {
      organizationId: scope.organizationId,
      productCode,
    }),
  ]);
  return { ok: true, code: "ok", jobs, total, limit, offset };
}

/**
 * Validate file + run product previewImport adapter (dry-run).
 */
async function previewDataJobImport(db, input) {
  const created = await createDataJob(db, {
    ...input,
    jobKind: "import",
    dryRun: true,
  });
  if (!created.ok) return created;

  const adapter = getDataJobAdapter(created.job.productCode, created.job.entityKey);
  if (!adapter || typeof adapter.previewImport !== "function") {
    await transitionDataJob(db, {
      trusted: input.trusted,
      jobId: created.job.id,
      toStatus: "failed",
      actorIdentityId: input.actorIdentityId || null,
      note: "No import preview adapter registered",
      resultSummary: { error: "adapter_missing" },
    });
    return { ok: false, code: "adapter_missing", job: created.job };
  }

  await transitionDataJob(db, {
    trusted: input.trusted,
    jobId: created.job.id,
    toStatus: "validating",
    actorIdentityId: input.actorIdentityId || null,
    note: "Validating import file",
  });

  const validated = validateImportFile({
    buffer: input.buffer,
    text: input.text,
    filename: input.filename,
    maxBytes: input.maxBytes,
    maxRows: input.maxRows,
    requiredHeaders: input.requiredHeaders || adapter.requiredHeaders || [],
  });
  if (!validated.ok) {
    await transitionDataJob(db, {
      trusted: input.trusted,
      jobId: created.job.id,
      toStatus: "failed",
      actorIdentityId: input.actorIdentityId || null,
      note: validated.code,
      resultSummary: validated,
      errorReportRef: putArtifact(created.job.id, {
        organizationId: created.job.organizationId,
        filename: "import-errors.json",
        contentType: "application/json",
        body: JSON.stringify(validated, null, 2),
      }),
    });
    return { ok: false, code: validated.code, jobId: created.job.id, validation: validated };
  }

  await transitionDataJob(db, {
    trusted: input.trusted,
    jobId: created.job.id,
    toStatus: "running",
    actorIdentityId: input.actorIdentityId || null,
    note: "Building import preview",
  });

  let preview;
  try {
    preview = await adapter.previewImport({
      db,
      job: created.job,
      trusted: input.trusted,
      headers: validated.headers,
      rows: validated.rows,
      filename: validated.filename,
    });
  } catch (err) {
    await transitionDataJob(db, {
      trusted: input.trusted,
      jobId: created.job.id,
      toStatus: "failed",
      actorIdentityId: input.actorIdentityId || null,
      note: "preview_failed",
      resultSummary: { error: String(err && err.message ? err.message : err) },
    });
    throw err;
  }

  const summary = {
    filename: validated.filename,
    rowCount: validated.rowCount,
    preview: preview || {},
  };
  const next = await transitionDataJob(db, {
    trusted: input.trusted,
    jobId: created.job.id,
    toStatus: "succeeded",
    actorIdentityId: input.actorIdentityId || null,
    note: "Import preview completed",
    progress: { stage: "preview" },
    resultSummary: summary,
  });
  return {
    ok: true,
    code: "ok",
    job: next.job,
    preview: summary.preview,
    validation: {
      filename: validated.filename,
      rowCount: validated.rowCount,
      headers: validated.headers,
    },
  };
}

/**
 * Commit a previously previewed import (or inline commit when dryRun=false).
 */
async function commitDataJobImport(db, input) {
  const scope = assertTrustedJobScope(input);
  if (!scope.ok) return scope;
  const jobId = String(input.jobId || "").trim();
  if (!jobId) return { ok: false, code: "invalid_job_id" };

  const existing = await repo.findDataJobById(db, {
    organizationId: scope.organizationId,
    jobId,
  });
  if (!existing) return { ok: false, code: "not_found", httpStatus: 404 };
  if (existing.jobKind !== "import") {
    return { ok: false, code: "invalid_job_kind" };
  }

  const adapter = getDataJobAdapter(existing.productCode, existing.entityKey);
  if (!adapter || typeof adapter.commitImport !== "function") {
    return { ok: false, code: "adapter_missing" };
  }

  const previewRows =
    (existing.resultSummary &&
      existing.resultSummary.preview &&
      existing.resultSummary.preview.acceptedRows) ||
    input.acceptedRows ||
    [];

  // Re-open a commit job from succeeded preview → running.
  // Preview jobs end in succeeded; create a sibling commit job for audit clarity.
  const commitJob = await createDataJob(db, {
    trusted: input.trusted,
    productCode: existing.productCode,
    entityKey: existing.entityKey,
    jobKind: "import",
    dryRun: false,
    actorIdentityId: input.actorIdentityId || null,
    inputFileRef: existing.inputFileRef,
    body: input.body,
    query: input.query,
  });
  if (!commitJob.ok) return commitJob;

  await transitionDataJob(db, {
    trusted: input.trusted,
    jobId: commitJob.job.id,
    toStatus: "running",
    actorIdentityId: input.actorIdentityId || null,
    note: `Commit from preview ${existing.id}`,
  });

  let result;
  try {
    result = await adapter.commitImport({
      db,
      job: commitJob.job,
      previewJob: existing,
      trusted: input.trusted,
      acceptedRows: previewRows,
    });
  } catch (err) {
    await transitionDataJob(db, {
      trusted: input.trusted,
      jobId: commitJob.job.id,
      toStatus: "failed",
      actorIdentityId: input.actorIdentityId || null,
      note: "commit_failed",
      resultSummary: { error: String(err && err.message ? err.message : err) },
    });
    throw err;
  }

  const next = await transitionDataJob(db, {
    trusted: input.trusted,
    jobId: commitJob.job.id,
    toStatus: "succeeded",
    actorIdentityId: input.actorIdentityId || null,
    note: "Import commit completed",
    resultSummary: result || {},
  });
  return { ok: true, code: "ok", job: next.job, result: result || {}, previewJobId: existing.id };
}

/**
 * Run product buildExport adapter and attach downloadable artifact.
 */
async function runDataJobExport(db, input) {
  const created = await createDataJob(db, {
    ...input,
    jobKind: "export",
    dryRun: false,
  });
  if (!created.ok) return created;

  const adapter = getDataJobAdapter(created.job.productCode, created.job.entityKey);
  if (!adapter || typeof adapter.buildExport !== "function") {
    await transitionDataJob(db, {
      trusted: input.trusted,
      jobId: created.job.id,
      toStatus: "failed",
      actorIdentityId: input.actorIdentityId || null,
      note: "No export adapter registered",
      resultSummary: { error: "adapter_missing" },
    });
    return { ok: false, code: "adapter_missing", job: created.job };
  }

  await transitionDataJob(db, {
    trusted: input.trusted,
    jobId: created.job.id,
    toStatus: "running",
    actorIdentityId: input.actorIdentityId || null,
    note: "Building export",
  });

  let built;
  try {
    built = await adapter.buildExport({
      db,
      job: created.job,
      trusted: input.trusted,
      filters: input.filters || {},
    });
  } catch (err) {
    await transitionDataJob(db, {
      trusted: input.trusted,
      jobId: created.job.id,
      toStatus: "failed",
      actorIdentityId: input.actorIdentityId || null,
      note: "export_failed",
      resultSummary: { error: String(err && err.message ? err.message : err) },
    });
    throw err;
  }

  const csv = built && built.csv != null ? String(built.csv) : "";
  const filename =
    (built && built.filename) || `${created.job.entityKey.replace(/\./g, "-")}-export.csv`;
  const outputFileRef = putArtifact(created.job.id, {
    organizationId: created.job.organizationId,
    filename,
    contentType: "text/csv; charset=utf-8",
    body: csv,
  });

  const next = await transitionDataJob(db, {
    trusted: input.trusted,
    jobId: created.job.id,
    toStatus: "succeeded",
    actorIdentityId: input.actorIdentityId || null,
    note: "Export completed",
    outputFileRef,
    resultSummary: {
      rowCount: built && built.rowCount != null ? built.rowCount : null,
      filename,
      privacy: (built && built.privacy) || "facility_scoped",
    },
  });
  return { ok: true, code: "ok", job: next.job, filename, rowCount: built && built.rowCount };
}

async function downloadDataJobArtifact(db, input) {
  const scope = assertTrustedJobScope(input);
  if (!scope.ok) return scope;
  const jobId = String(input.jobId || "").trim();
  if (!jobId) return { ok: false, code: "invalid_job_id" };
  const job = await repo.findDataJobById(db, {
    organizationId: scope.organizationId,
    jobId,
  });
  if (!job) return { ok: false, code: "not_found", httpStatus: 404 };
  const artifact = getArtifact(jobId, scope.organizationId);
  if (!artifact) {
    return { ok: false, code: "artifact_expired", httpStatus: 410 };
  }
  return { ok: true, code: "ok", job, artifact };
}

module.exports = {
  JOB_TRANSITIONS,
  assertTrustedJobScope,
  createDataJob,
  transitionDataJob,
  getDataJob,
  listOrganizationDataJobs,
  previewDataJobImport,
  commitDataJobImport,
  runDataJobExport,
  downloadDataJobArtifact,
};
