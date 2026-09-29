"use strict";

/**
 * Platform-admin read model for BlessBoard background job status.
 * Aggregates existing domain tables — does not change job business logic.
 * Safe retry/cancel delegates to existing service methods where supported.
 */

const auditLogsRepo = require("../../db/pg/church/auditLogsRepo");
const scheduledReportService = require("./scheduledReportService");
const scheduledBroadcastService = require("./scheduledBroadcastService");

const JOB_TYPE_DEFS = Object.freeze([
  { id: "scheduled_report_run", label: "Scheduled report run", source: "cron" },
  { id: "scheduled_broadcast", label: "Scheduled broadcast", source: "cron" },
  { id: "growth_trial_reminder", label: "Growth trial reminder", source: "cron" },
  { id: "growth_trial_expiry", label: "Growth trial expiry", source: "cron" },
  { id: "dormancy_check", label: "Foundation dormancy check", source: "cron" },
  { id: "billing_snapshot", label: "Billing snapshot", source: "on_demand" },
  { id: "quota_period", label: "Quota period (usage month)", source: "lazy" },
  { id: "member_import", label: "Member import processing", source: "sync" },
]);

const JOB_TYPE_IDS = JOB_TYPE_DEFS.map((d) => d.id);

const SECRET_ERROR_PATTERNS = [
  /password/i,
  /token/i,
  /bearer\s+\S+/i,
  /authorization:\s*\S+/i,
  /api[_-]?key/i,
  /secret/i,
  /-----BEGIN/i,
];

function jobTypeLabel(type) {
  const def = JOB_TYPE_DEFS.find((d) => d.id === type);
  return def ? def.label : type || "—";
}

function parseJobRef(raw) {
  const s = String(raw || "").trim();
  const m = /^([a-z_]+):(.+)$/.exec(s);
  if (!m) return { ok: false, error: "Invalid job reference." };
  const type = m[1];
  const idPart = m[2];
  if (!JOB_TYPE_IDS.includes(type)) {
    return { ok: false, error: "Unknown or invalid job reference." };
  }
  if (type === "quota_period") {
    if (!/^\d+_\d{4}-\d{2}-\d{2}$/.test(idPart)) {
      return { ok: false, error: "Unknown or invalid job reference." };
    }
    return { ok: true, type, id: idPart, ref: `${type}:${idPart}` };
  }
  const id = Number(idPart);
  if (!Number.isFinite(id) || id <= 0) {
    return { ok: false, error: "Unknown or invalid job reference." };
  }
  return { ok: true, type, id, ref: `${type}:${id}` };
}

function makeRef(type, id) {
  return `${type}:${id}`;
}

function safeErrorSummary(raw) {
  if (raw == null || String(raw).trim() === "") return null;
  let text = String(raw).replace(/\s+/g, " ").trim().slice(0, 280);
  for (const pattern of SECRET_ERROR_PATTERNS) {
    text = text.replace(pattern, "[redacted]");
  }
  if (/full_name,email|export_body|INSERT INTO/i.test(text)) {
    return "Job failed (details withheld).";
  }
  return text;
}

function normalizeRow(partial) {
  return {
    ref: partial.ref,
    jobType: partial.jobType,
    jobTypeLabel: jobTypeLabel(partial.jobType),
    organizationId: partial.organizationId != null ? Number(partial.organizationId) : null,
    organizationName: partial.organizationName || "—",
    branchId: partial.branchId != null ? Number(partial.branchId) : null,
    branchName: partial.branchName || null,
    scheduledAt: partial.scheduledAt || null,
    startedAt: partial.startedAt || null,
    finishedAt: partial.finishedAt || null,
    status: partial.status || "unknown",
    attemptCount: partial.attemptCount != null ? Number(partial.attemptCount) : null,
    errorSummary: safeErrorSummary(partial.errorSummary),
    idempotencyKey: partial.idempotencyKey || null,
    nextRetryAt: partial.nextRetryAt || null,
    canRetry: Boolean(partial.canRetry),
    canCancel: Boolean(partial.canCancel),
    sourceNote: partial.sourceNote || null,
    detailSafe: partial.detailSafe || {},
  };
}

function parseListFilters(query) {
  const page = Math.max(Number(query && query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query && query.limit) || 50, 1), 100);
  const jobType = String((query && query.job_type) || "").trim();
  const status = String((query && query.status) || "").trim().toLowerCase();
  const organizationIdRaw = query && query.organization_id;
  const organizationId =
    organizationIdRaw != null && String(organizationIdRaw).trim() !== ""
      ? Number(organizationIdRaw)
      : null;
  return {
    page,
    limit,
    offset: (page - 1) * limit,
    jobType: JOB_TYPE_IDS.includes(jobType) ? jobType : "",
    status: status || "",
    organizationId: Number.isFinite(organizationId) && organizationId > 0 ? organizationId : null,
  };
}

async function fetchScheduledReportRuns(pool, filters, fetchLimit) {
  const params = [];
  const clauses = [];
  if (filters.organizationId) {
    params.push(filters.organizationId);
    clauses.push(`r.organization_id = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    clauses.push(`r.status = $${params.length}`);
  }
  params.push(fetchLimit);
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const r = await pool.query(
    `SELECT r.id, r.organization_id, r.schedule_id, r.job_key, r.scheduled_for, r.status,
            r.attempt_count, r.last_error, r.started_at, r.finished_at, r.created_at,
            o.name AS organization_name, s.branch_id, b.name AS branch_name, s.status AS schedule_status
     FROM public.church_scheduled_report_runs r
     LEFT JOIN public.church_organizations o ON o.id = r.organization_id
     LEFT JOIN public.church_scheduled_reports s ON s.id = r.schedule_id
     LEFT JOIN public.church_branches b ON b.id = s.branch_id
     ${where}
     ORDER BY COALESCE(r.finished_at, r.started_at, r.scheduled_for, r.created_at) DESC, r.id DESC
     LIMIT $${params.length}`,
    params
  );
  return r.rows.map((row) =>
    normalizeRow({
      ref: makeRef("scheduled_report_run", row.id),
      jobType: "scheduled_report_run",
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      branchId: row.branch_id,
      branchName: row.branch_name,
      scheduledAt: row.scheduled_for,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      status: row.status,
      attemptCount: row.attempt_count,
      errorSummary: row.last_error,
      idempotencyKey: row.job_key,
      nextRetryAt: null,
      canRetry: row.status === "failed",
      canCancel: false,
      sourceNote: `schedule #${row.schedule_id}`,
      detailSafe: {
        schedule_id: row.schedule_id,
        schedule_status: row.schedule_status,
        run_id: row.id,
      },
    })
  );
}

async function fetchScheduledBroadcasts(pool, filters, fetchLimit) {
  const params = [];
  const clauses = [
    `hb.status IN ('scheduled','processing','published','partially_failed','failed','cancelled')`,
  ];
  if (filters.organizationId) {
    params.push(filters.organizationId);
    clauses.push(`hb.organization_id = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    clauses.push(`hb.status = $${params.length}`);
  }
  params.push(fetchLimit);
  const r = await pool.query(
    `SELECT hb.id, hb.organization_id, hb.status, hb.publish_at, hb.job_key, hb.last_error,
            hb.created_at, hb.updated_at, hb.cancelled_at,
            o.name AS organization_name
     FROM public.church_hq_broadcasts hb
     LEFT JOIN public.church_organizations o ON o.id = hb.organization_id
     WHERE ${clauses.join(" AND ")}
     ORDER BY COALESCE(hb.publish_at, hb.updated_at, hb.created_at) DESC, hb.id DESC
     LIMIT $${params.length}`,
    params
  );
  return r.rows.map((row) =>
    normalizeRow({
      ref: makeRef("scheduled_broadcast", row.id),
      jobType: "scheduled_broadcast",
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      scheduledAt: row.publish_at,
      startedAt:
        row.status === "processing" ||
        row.status === "published" ||
        row.status === "failed" ||
        row.status === "partially_failed"
          ? row.updated_at
          : null,
      finishedAt:
        row.status === "published" ||
        row.status === "failed" ||
        row.status === "partially_failed" ||
        row.status === "cancelled"
          ? row.cancelled_at || row.updated_at
          : null,
      status: row.status,
      attemptCount: null,
      errorSummary: row.last_error,
      idempotencyKey: row.job_key,
      nextRetryAt: null,
      canRetry: row.status === "failed" || row.status === "partially_failed",
      canCancel: ["scheduled", "approval", "preview", "audience_estimate"].includes(row.status),
      sourceNote: `broadcast #${row.id}`,
      detailSafe: {
        broadcast_id: row.id,
      },
    })
  );
}

async function fetchTrialReminders(pool, filters, fetchLimit) {
  const params = [];
  const clauses = [];
  if (filters.organizationId) {
    params.push(filters.organizationId);
    clauses.push(`t.organization_id = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    clauses.push(`r.status = $${params.length}`);
  }
  params.push(fetchLimit);
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const r = await pool.query(
    `SELECT r.id, r.status, r.due_at, r.job_key, r.processed_at, r.days_before_expiry,
            t.organization_id, o.name AS organization_name
     FROM public.church_organization_package_trial_reminders r
     INNER JOIN public.church_organization_package_trials t ON t.id = r.trial_id
     LEFT JOIN public.church_organizations o ON o.id = t.organization_id
     ${where}
     ORDER BY COALESCE(r.processed_at, r.due_at) DESC, r.id DESC
     LIMIT $${params.length}`,
    params
  );
  return r.rows.map((row) =>
    normalizeRow({
      ref: makeRef("growth_trial_reminder", row.id),
      jobType: "growth_trial_reminder",
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      scheduledAt: row.due_at,
      startedAt: row.processed_at,
      finishedAt: row.processed_at,
      status: row.status,
      attemptCount: row.status === "sent" || row.status === "skipped" ? 1 : 0,
      errorSummary: null,
      idempotencyKey: row.job_key,
      canRetry: false,
      canCancel: false,
      sourceNote: `${row.days_before_expiry}d before expiry`,
      detailSafe: { days_before_expiry: row.days_before_expiry },
    })
  );
}

async function fetchTrialExpiries(pool, filters, fetchLimit) {
  const params = [];
  const clauses = [];
  if (filters.organizationId) {
    params.push(filters.organizationId);
    clauses.push(`t.organization_id = $${params.length}`);
  }
  if (filters.status) {
    if (filters.status === "pending") {
      clauses.push(`t.status = 'active'`);
    } else if (filters.status === "delivered" || filters.status === "sent") {
      clauses.push(`t.status = 'expired'`);
    } else {
      params.push(filters.status);
      clauses.push(`t.status = $${params.length}`);
    }
  }
  params.push(fetchLimit);
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const r = await pool.query(
    `SELECT t.id, t.organization_id, t.status, t.ends_at, t.expiry_job_key, t.updated_at, t.starts_at,
            o.name AS organization_name
     FROM public.church_organization_package_trials t
     LEFT JOIN public.church_organizations o ON o.id = t.organization_id
     ${where}
     ORDER BY t.ends_at DESC, t.id DESC
     LIMIT $${params.length}`,
    params
  );
  return r.rows.map((row) =>
    normalizeRow({
      ref: makeRef("growth_trial_expiry", row.id),
      jobType: "growth_trial_expiry",
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      scheduledAt: row.ends_at,
      startedAt: row.status === "expired" ? row.ends_at : null,
      finishedAt: row.status === "expired" ? row.updated_at || row.ends_at : null,
      status: row.status === "active" ? "pending" : row.status,
      attemptCount: row.status === "expired" ? 1 : 0,
      errorSummary: null,
      idempotencyKey: row.expiry_job_key,
      canRetry: false,
      canCancel: false,
      sourceNote: "expiry job",
      detailSafe: { trial_id: row.id, starts_at: row.starts_at },
    })
  );
}

async function fetchDormancyChecks(pool, filters, fetchLimit) {
  const params = [];
  const clauses = [];
  if (filters.organizationId) {
    params.push(filters.organizationId);
    clauses.push(`w.organization_id = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    clauses.push(`w.status = $${params.length}`);
  }
  params.push(fetchLimit);
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const r = await pool.query(
    `SELECT w.id, w.organization_id, w.warning_stage, w.job_key, w.status, w.processed_at,
            w.based_on_activity_at, o.name AS organization_name
     FROM public.church_organization_inactivity_warnings w
     LEFT JOIN public.church_organizations o ON o.id = w.organization_id
     ${where}
     ORDER BY COALESCE(w.processed_at, w.based_on_activity_at) DESC, w.id DESC
     LIMIT $${params.length}`,
    params
  );
  return r.rows.map((row) =>
    normalizeRow({
      ref: makeRef("dormancy_check", row.id),
      jobType: "dormancy_check",
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      scheduledAt: row.based_on_activity_at,
      startedAt: row.processed_at,
      finishedAt: row.processed_at,
      status: row.status,
      attemptCount: row.status === "recorded" || row.status === "skipped" ? 1 : 0,
      errorSummary: null,
      idempotencyKey: row.job_key,
      canRetry: false,
      canCancel: false,
      sourceNote: `stage=${row.warning_stage}`,
      detailSafe: { warning_stage: row.warning_stage },
    })
  );
}

async function fetchBillingSnapshots(pool, filters, fetchLimit) {
  const params = [];
  const clauses = [];
  if (filters.organizationId) {
    params.push(filters.organizationId);
    clauses.push(`s.organization_id = $${params.length}`);
  }
  params.push(fetchLimit);
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const r = await pool.query(
    `SELECT s.id, s.organization_id, s.snapshot_key, s.captured_at, s.billable_from, s.billable_to,
            s.branch_id, o.name AS organization_name
     FROM public.church_billing_branch_snapshots s
     LEFT JOIN public.church_organizations o ON o.id = s.organization_id
     ${where}
     ORDER BY s.captured_at DESC, s.id DESC
     LIMIT $${params.length}`,
    params
  );
  return r.rows
    .filter((row) => !filters.status || filters.status === "delivered" || filters.status === "completed")
    .map((row) =>
      normalizeRow({
        ref: makeRef("billing_snapshot", row.id),
        jobType: "billing_snapshot",
        organizationId: row.organization_id,
        organizationName: row.organization_name,
        branchId: row.branch_id,
        scheduledAt: row.billable_from,
        startedAt: row.captured_at,
        finishedAt: row.captured_at,
        status: "completed",
        attemptCount: 1,
        errorSummary: null,
        idempotencyKey: row.snapshot_key,
        canRetry: false,
        canCancel: false,
        sourceNote: "on-demand billing readiness",
        detailSafe: {
          billable_from: row.billable_from,
          billable_to: row.billable_to,
          branch_id: row.branch_id,
        },
      })
    );
}

async function fetchQuotaPeriods(pool, filters, fetchLimit) {
  const params = [];
  const clauses = [];
  if (filters.organizationId) {
    params.push(filters.organizationId);
    clauses.push(`u.organization_id = $${params.length}`);
  }
  params.push(fetchLimit);
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const r = await pool.query(
    `SELECT u.organization_id, u.usage_month, u.external_emails_count, u.scheduled_reports_count,
            u.created_at, u.updated_at, o.name AS organization_name
     FROM public.church_organization_usage_months u
     LEFT JOIN public.church_organizations o ON o.id = u.organization_id
     ${where}
     ORDER BY u.usage_month DESC, u.organization_id DESC
     LIMIT $${params.length}`,
    params
  );
  return r.rows
    .filter((row) => !filters.status || filters.status === "completed" || filters.status === "observed")
    .map((row) => {
      const month = String(row.usage_month).slice(0, 10);
      return normalizeRow({
        ref: `quota_period:${row.organization_id}_${month}`,
        jobType: "quota_period",
        organizationId: row.organization_id,
        organizationName: row.organization_name,
        scheduledAt: row.usage_month,
        startedAt: row.created_at,
        finishedAt: row.updated_at || row.created_at,
        status: "observed",
        attemptCount: 1,
        errorSummary: null,
        idempotencyKey: `usage_month:${row.organization_id}:${month}`,
        canRetry: false,
        canCancel: false,
        sourceNote: "lazy month boundary (not a cron job)",
        detailSafe: {
          usage_month: month,
          external_emails_count: row.external_emails_count,
          scheduled_reports_count: row.scheduled_reports_count,
        },
      });
    });
}

async function fetchMemberImports(pool, filters, fetchLimit) {
  const params = [];
  const clauses = [];
  if (filters.organizationId) {
    params.push(filters.organizationId);
    clauses.push(`b.organization_id = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    clauses.push(`b.status = $${params.length}`);
  }
  params.push(fetchLimit);
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const r = await pool.query(
    `SELECT b.id, b.organization_id, b.branch_id, b.status, b.batch_key, b.created_at, b.updated_at,
            b.committed_at, b.row_count, o.name AS organization_name, br.name AS branch_name
     FROM public.church_member_import_batches b
     LEFT JOIN public.church_organizations o ON o.id = b.organization_id
     LEFT JOIN public.church_branches br ON br.id = b.branch_id
     ${where}
     ORDER BY COALESCE(b.committed_at, b.updated_at, b.created_at) DESC, b.id DESC
     LIMIT $${params.length}`,
    params
  );
  return r.rows.map((row) =>
    normalizeRow({
      ref: makeRef("member_import", row.id),
      jobType: "member_import",
      organizationId: row.organization_id,
      organizationName: row.organization_name,
      branchId: row.branch_id,
      branchName: row.branch_name,
      scheduledAt: row.created_at,
      startedAt: row.created_at,
      finishedAt:
        row.committed_at ||
        (row.status === "failed" || row.status === "cancelled" ? row.updated_at : null),
      status: row.status,
      attemptCount: 1,
      errorSummary: null,
      idempotencyKey: row.batch_key,
      canRetry: false,
      canCancel: false,
      sourceNote: "synchronous HTTP import (not a background worker)",
      detailSafe: {
        batch_id: row.id,
        row_count: row.row_count,
      },
    })
  );
}

const FETCHERS = {
  scheduled_report_run: fetchScheduledReportRuns,
  scheduled_broadcast: fetchScheduledBroadcasts,
  growth_trial_reminder: fetchTrialReminders,
  growth_trial_expiry: fetchTrialExpiries,
  dormancy_check: fetchDormancyChecks,
  billing_snapshot: fetchBillingSnapshots,
  quota_period: fetchQuotaPeriods,
  member_import: fetchMemberImports,
};

function sortKey(job) {
  const t = job.finishedAt || job.startedAt || job.scheduledAt;
  return t ? new Date(t).getTime() : 0;
}

async function listBackgroundJobs(pool, query = {}) {
  const filters = parseListFilters(query);
  const perType = Math.min(filters.limit + filters.offset + 20, 200);
  const types = filters.jobType ? [filters.jobType] : JOB_TYPE_IDS;
  const chunks = await Promise.all(types.map((type) => FETCHERS[type](pool, filters, perType)));
  const merged = chunks.flat().sort((a, b) => sortKey(b) - sortKey(a));
  const total = merged.length;
  const jobs = merged.slice(filters.offset, filters.offset + filters.limit);
  const totalPages = Math.max(Math.ceil(total / filters.limit), 1);
  return { jobs, filters, total, totalPages };
}

async function getBackgroundJob(pool, jobRefRaw) {
  const parsed = parseJobRef(jobRefRaw);
  if (!parsed.ok) {
    const err = new Error(parsed.error);
    err.code = "NOT_FOUND";
    throw err;
  }
  const rows = await FETCHERS[parsed.type](pool, {}, 500);
  const job = rows.find((j) => j.ref === parsed.ref);
  if (!job) {
    const err = new Error("Job not found.");
    err.code = "NOT_FOUND";
    throw err;
  }
  return job;
}

async function getBackgroundJobByParts(pool, jobType, jobId) {
  return getBackgroundJob(pool, `${jobType}:${jobId}`);
}

async function recordPlatformJobAction(pool, opts) {
  await auditLogsRepo.insertAuditLog(pool, {
    organization_id: opts.organizationId || null,
    branch_id: opts.branchId || null,
    actor_type: "platform_admin",
    actor_id: opts.platformAdminId || null,
    action: opts.action,
    entity_type: "background_job",
    entity_id: typeof opts.entityId === "number" ? opts.entityId : null,
    target_label: opts.jobRef,
    metadata_json: {
      job_ref: opts.jobRef,
      job_type: opts.jobType,
      result: opts.result || null,
      previous_status: opts.previousStatus || null,
      idempotency_key: opts.idempotencyKey || null,
    },
  });
}

async function retryBackgroundJob(pool, jobRefRaw, opts = {}) {
  const job = await getBackgroundJob(pool, jobRefRaw);
  if (!job.canRetry) {
    const err = new Error("This job type or status does not support safe retry.");
    err.code = "RETRY_UNSUPPORTED";
    throw err;
  }

  const platformAdminId = opts.platformAdminId || null;
  let result;

  if (job.jobType === "scheduled_report_run") {
    result = await scheduledReportService.retryFailedRun(
      pool,
      Number(job.detailSafe.run_id),
      job.organizationId
    );
  } else if (job.jobType === "scheduled_broadcast") {
    result = await scheduledBroadcastService.retryFailedDeliveries(
      pool,
      Number(job.detailSafe.broadcast_id),
      job.organizationId
    );
  } else {
    const err = new Error("Safe retry is not available for this job.");
    err.code = "RETRY_UNSUPPORTED";
    throw err;
  }

  await recordPlatformJobAction(pool, {
    organizationId: job.organizationId,
    branchId: job.branchId,
    platformAdminId,
    action: "platform_background_job_retry",
    entityId: Number.isFinite(Number(String(job.ref).split(":")[1]))
      ? Number(String(job.ref).split(":")[1])
      : null,
    jobRef: job.ref,
    jobType: job.jobType,
    previousStatus: job.status,
    idempotencyKey: job.idempotencyKey,
    result: "retried",
  });

  const refreshed = await getBackgroundJob(pool, job.ref).catch(() => job);
  return { job: refreshed, result };
}

async function cancelBackgroundJob(pool, jobRefRaw, opts = {}) {
  const job = await getBackgroundJob(pool, jobRefRaw);
  if (!job.canCancel) {
    const err = new Error("This job type or status does not support cancellation.");
    err.code = "CANCEL_UNSUPPORTED";
    throw err;
  }

  const platformAdminId = opts.platformAdminId || null;

  if (job.jobType === "scheduled_broadcast") {
    await scheduledBroadcastService.cancelScheduledBroadcast(
      pool,
      Number(job.detailSafe.broadcast_id),
      job.organizationId,
      null
    );
  } else {
    const err = new Error("Cancellation is not available for this job.");
    err.code = "CANCEL_UNSUPPORTED";
    throw err;
  }

  await recordPlatformJobAction(pool, {
    organizationId: job.organizationId,
    branchId: job.branchId,
    platformAdminId,
    action: "platform_background_job_cancelled",
    entityId: Number.isFinite(Number(String(job.ref).split(":")[1]))
      ? Number(String(job.ref).split(":")[1])
      : null,
    jobRef: job.ref,
    jobType: job.jobType,
    previousStatus: job.status,
    idempotencyKey: job.idempotencyKey,
    result: "cancelled",
  });

  const refreshed = await getBackgroundJob(pool, job.ref).catch(() => ({
    ...job,
    status: "cancelled",
    canCancel: false,
    canRetry: false,
  }));
  return { job: refreshed };
}

module.exports = {
  JOB_TYPE_DEFS,
  JOB_TYPE_IDS,
  jobTypeLabel,
  parseJobRef,
  safeErrorSummary,
  parseListFilters,
  listBackgroundJobs,
  getBackgroundJob,
  getBackgroundJobByParts,
  retryBackgroundJob,
  cancelBackgroundJob,
};
