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

module.exports = {
  JOB_TRANSITIONS,
  assertTrustedJobScope,
  createDataJob,
  transitionDataJob,
  getDataJob,
  listOrganizationDataJobs,
};
