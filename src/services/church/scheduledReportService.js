"use strict";

/**
 * Growth scheduled-report workflow (create/run/deliver).
 * Foundation may run reports manually elsewhere; scheduling requires reports.scheduled.
 */

const crypto = require("crypto");
const auditLogsRepo = require("../../db/pg/church/auditLogsRepo");
const branchAdminsRepo = require("../../db/pg/church/branchAdminsRepo");
const hqAdminsRepo = require("../../db/pg/church/hqAdminsRepo");
const {
  getSupportedScheduledReport,
  listSupportedScheduledReports,
  buildScheduledReportPayload,
  renderScheduledReportExport,
} = require("../../church/scheduledReportCatalogue");
const {
  normalizeTimezone,
  parseDeliveryTime,
  computeNextRunAt,
  jobKeyForScheduleRun,
} = require("../../church/scheduledReportTiming");
const { hasEntitlement, getOrganisationPlan } = require("./churchEntitlementService");
const churchPackageUsageService = require("./churchPackageUsageService");

const FREQUENCIES = Object.freeze(["daily", "weekly", "monthly"]);
const FORMATS = Object.freeze(["csv", "pdf"]);
const STATUSES = Object.freeze(["enabled", "paused", "cancelled"]);

function sha256(text) {
  return crypto.createHash("sha256").update(String(text || ""), "utf8").digest("hex");
}

async function assertCanScheduleReports(pool, organizationId) {
  const plan = await getOrganisationPlan(pool, organizationId);
  if (!plan) {
    const err = new Error("Organisation not found.");
    err.code = "ORG_NOT_FOUND";
    throw err;
  }
  if (!hasEntitlement(plan, "reports.scheduled")) {
    const err = new Error("Scheduled reports require Growth. Foundation may run permitted reports manually only.");
    err.code = "FOUNDATION_SCHEDULE_FORBIDDEN";
    throw err;
  }
  const churchPilotFeatureFlagService = require("./churchPilotFeatureFlagService");
  await churchPilotFeatureFlagService.assertPilotFeatureAvailable(pool, {
    organizationId,
    flagKey: "reports_scheduled",
    plan,
  });
  return plan;
}

/**
 * Validate recipient remains authorised for this org (and branch when branch_admin).
 */
async function resolveAuthorisedRecipient(db, opts) {
  const organizationId = Number(opts.organizationId);
  const branchId = opts.branchId != null ? Number(opts.branchId) : null;
  const recipientType = String(opts.recipient_type || "");
  const recipientId = Number(opts.recipient_id);

  if (recipientType === "branch_admin") {
    const admin = await branchAdminsRepo.findBranchAdminById(db, recipientId);
    if (
      !admin ||
      Number(admin.organization_id) !== organizationId ||
      admin.status !== "active" ||
      (branchId && Number(admin.branch_id) !== branchId)
    ) {
      return null;
    }
    return {
      recipient_type: "branch_admin",
      recipient_id: admin.id,
      email: admin.email,
      full_name: admin.full_name,
    };
  }

  if (recipientType === "hq_admin") {
    const admin = await hqAdminsRepo.findHqAdminById(db, recipientId);
    if (!admin || Number(admin.organization_id) !== organizationId || admin.status !== "active") {
      return null;
    }
    return {
      recipient_type: "hq_admin",
      recipient_id: admin.id,
      email: admin.email,
      full_name: admin.full_name,
    };
  }
  return null;
}

function validateScheduleInput(body, opts = {}) {
  const reportType = String(body.report_type || "").trim();
  const reportDef = getSupportedScheduledReport(reportType);
  if (!reportDef) return { ok: false, error: "Select a supported report." };

  const exportFormat = String(body.export_format || "csv").trim().toLowerCase();
  if (!FORMATS.includes(exportFormat)) return { ok: false, error: "Export format must be PDF or CSV." };

  const frequency = String(body.frequency || "").trim().toLowerCase();
  if (!FREQUENCIES.includes(frequency)) return { ok: false, error: "Choose daily, weekly, or monthly frequency." };

  const timezone = normalizeTimezone(body.timezone || opts.defaultTimezone || "UTC");
  const delivery = parseDeliveryTime(body.delivery_time_local || body.delivery_time || "09:00");

  let dayOfWeek = null;
  let dayOfMonth = null;
  if (frequency === "weekly") {
    dayOfWeek = Number(body.day_of_week);
    if (!Number.isFinite(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
      return { ok: false, error: "Weekly schedules require a day of week (0=Sun … 6=Sat)." };
    }
  }
  if (frequency === "monthly") {
    dayOfMonth = Number(body.day_of_month || 1);
    if (!Number.isFinite(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 28) {
      return { ok: false, error: "Monthly schedules require day of month 1–28." };
    }
  }

  const filters = {
    period_month: String(body.period_month || "").trim() || null,
  };

  const recipientsRaw = Array.isArray(body.recipients)
    ? body.recipients
    : String(body.recipients || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((token) => {
          const [type, id] = token.split(":");
          return { recipient_type: type, recipient_id: Number(id) };
        });

  if (!recipientsRaw.length) return { ok: false, error: "Choose at least one authorised recipient." };

  return {
    ok: true,
    data: {
      report_type: reportType,
      export_format: exportFormat,
      frequency,
      timezone,
      delivery_time_local: delivery.text,
      day_of_week: dayOfWeek,
      day_of_month: dayOfMonth,
      filters_json: filters,
      recipients: recipientsRaw,
      status: STATUSES.includes(String(body.status || "enabled"))
        ? String(body.status || "enabled")
        : "enabled",
    },
  };
}

async function listSchedulesForBranch(db, organizationId, branchId, opts = {}) {
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 100);
  const r = await db.query(
    `SELECT s.*,
            (SELECT COUNT(*)::int FROM public.church_scheduled_report_recipients r WHERE r.schedule_id = s.id) AS recipient_count
     FROM public.church_scheduled_reports s
     WHERE s.organization_id = $1 AND s.branch_id = $2 AND s.status <> 'cancelled'
     ORDER BY s.updated_at DESC, s.id DESC
     LIMIT $3`,
    [organizationId, branchId, limit]
  );
  return r.rows;
}

async function findScheduleForBranch(db, scheduleId, organizationId, branchId) {
  const r = await db.query(
    `SELECT * FROM public.church_scheduled_reports
     WHERE id = $1 AND organization_id = $2 AND branch_id = $3
     LIMIT 1`,
    [scheduleId, organizationId, branchId]
  );
  return r.rows[0] || null;
}

async function listRecipientsForSchedule(db, scheduleId, organizationId) {
  const r = await db.query(
    `SELECT * FROM public.church_scheduled_report_recipients
     WHERE schedule_id = $1 AND organization_id = $2
     ORDER BY id ASC`,
    [scheduleId, organizationId]
  );
  return r.rows;
}

async function createSchedule(pool, input) {
  await assertCanScheduleReports(pool, input.organizationId);

  const validation = validateScheduleInput(input.body || {}, {
    defaultTimezone: input.defaultTimezone,
  });
  if (!validation.ok) {
    const err = new Error(validation.error);
    err.code = "VALIDATION";
    throw err;
  }

  // Report permission at create time (existing supported report only).
  const reportDef = getSupportedScheduledReport(validation.data.report_type);
  if (!reportDef || !(reportDef.portals || []).includes("branch")) {
    const err = new Error("This report cannot be scheduled.");
    err.code = "UNAUTHORISED_REPORT";
    throw err;
  }
  if (input.actorType === "branch_admin" && input.actorId) {
    const creator = await resolveAuthorisedRecipient(pool, {
      organizationId: input.organizationId,
      branchId: input.branchId,
      recipient_type: "branch_admin",
      recipient_id: input.actorId,
    });
    if (!creator) {
      const err = new Error("You are not authorised to schedule this report.");
      err.code = "UNAUTHORISED_REPORT";
      throw err;
    }
  }

  const authorised = [];
  for (const rec of validation.data.recipients) {
    const resolved = await resolveAuthorisedRecipient(pool, {
      organizationId: input.organizationId,
      branchId: input.branchId,
      recipient_type: rec.recipient_type,
      recipient_id: rec.recipient_id,
    });
    if (!resolved) {
      const err = new Error("One or more recipients are not authorised for this organisation.");
      err.code = "UNAUTHORISED_RECIPIENT";
      throw err;
    }
    // Cross-tenant already blocked by org id match inside resolver.
    authorised.push(resolved);
  }

  // Creating a schedule itself does not consume monthly run quota; each run does.
  const nextRunAt =
    validation.data.status === "enabled"
      ? computeNextRunAt(validation.data, input.at || new Date())
      : null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inserted = await client.query(
      `INSERT INTO public.church_scheduled_reports (
         organization_id, branch_id, report_type, filters_json, export_format,
         frequency, timezone, delivery_time_local, day_of_week, day_of_month,
         status, created_by_actor_type, created_by_actor_id, next_run_at
       ) VALUES (
         $1,$2,$3,$4::jsonb,$5,
         $6,$7,$8::time,$9,$10,
         $11,$12,$13,$14
       ) RETURNING *`,
      [
        input.organizationId,
        input.branchId,
        validation.data.report_type,
        JSON.stringify(validation.data.filters_json),
        validation.data.export_format,
        validation.data.frequency,
        validation.data.timezone,
        validation.data.delivery_time_local,
        validation.data.day_of_week,
        validation.data.day_of_month,
        validation.data.status,
        input.actorType || "branch_admin",
        input.actorId || null,
        nextRunAt ? nextRunAt.toISOString() : null,
      ]
    );
    const schedule = inserted.rows[0];
    for (const rec of authorised) {
      await client.query(
        `INSERT INTO public.church_scheduled_report_recipients (
           schedule_id, organization_id, recipient_type, recipient_id
         ) VALUES ($1,$2,$3,$4)
         ON CONFLICT (schedule_id, recipient_type, recipient_id) DO NOTHING`,
        [schedule.id, input.organizationId, rec.recipient_type, rec.recipient_id]
      );
    }
    await auditLogsRepo.insertAuditLog(client, {
      organization_id: input.organizationId,
      branch_id: input.branchId,
      actor_type: input.actorType || "branch_admin",
      actor_id: input.actorId || null,
      action: "scheduled_report_created",
      entity_type: "church_scheduled_report",
      entity_id: schedule.id,
      target_label: validation.data.report_type,
      metadata_json: {
        report_type: validation.data.report_type,
        frequency: validation.data.frequency,
        export_format: validation.data.export_format,
        recipient_count: authorised.length,
        next_run_at: nextRunAt ? nextRunAt.toISOString() : null,
      },
    });
    await client.query("COMMIT");
    return schedule;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

async function updateScheduleStatus(pool, opts) {
  const status = String(opts.status || "").trim();
  if (!STATUSES.includes(status)) {
    const err = new Error("Invalid schedule status.");
    err.code = "VALIDATION";
    throw err;
  }
  const schedule = await findScheduleForBranch(pool, opts.scheduleId, opts.organizationId, opts.branchId);
  if (!schedule) {
    const err = new Error("Schedule not found.");
    err.code = "NOT_FOUND";
    throw err;
  }
  if (status !== "cancelled") await assertCanScheduleReports(pool, opts.organizationId);

  let nextRunAt = schedule.next_run_at;
  if (status === "enabled") {
    nextRunAt = computeNextRunAt(schedule, opts.at || new Date());
  } else {
    nextRunAt = null;
  }

  const r = await pool.query(
    `UPDATE public.church_scheduled_reports
     SET status = $2,
         next_run_at = $3,
         updated_at = now()
     WHERE id = $1 AND organization_id = $4
     RETURNING *`,
    [schedule.id, status, nextRunAt ? new Date(nextRunAt).toISOString() : null, opts.organizationId]
  );
  await auditLogsRepo.insertAuditLog(pool, {
    organization_id: opts.organizationId,
    branch_id: opts.branchId,
    actor_type: opts.actorType || "branch_admin",
    actor_id: opts.actorId || null,
    action: `scheduled_report_${status}`,
    entity_type: "church_scheduled_report",
    entity_id: schedule.id,
    target_label: schedule.report_type,
    metadata_json: { status, next_run_at: nextRunAt },
  });
  return r.rows[0];
}

/**
 * Execute one schedule run (idempotent via job_key).
 */
async function executeScheduleRun(pool, schedule, opts = {}) {
  const at = opts.at instanceof Date ? opts.at : new Date();
  const scheduledFor = opts.scheduledFor
    ? new Date(opts.scheduledFor)
    : schedule.next_run_at
      ? new Date(schedule.next_run_at)
      : at;
  const jobKey = jobKeyForScheduleRun(schedule.id, scheduledFor);

  // Re-validate package entitlement at run time.
  try {
    await assertCanScheduleReports(pool, schedule.organization_id);
  } catch (err) {
    if (err && err.code === "FOUNDATION_SCHEDULE_FORBIDDEN") {
      await pool.query(
        `UPDATE public.church_scheduled_reports
         SET status = 'paused', next_run_at = NULL, updated_at = now()
         WHERE id = $1`,
        [schedule.id]
      );
      return { outcome: "skipped_no_entitlement", jobKey };
    }
    throw err;
  }

  const reportDef = getSupportedScheduledReport(schedule.report_type);
  if (!reportDef) {
    return { outcome: "skipped_unsupported_report", jobKey };
  }

  // Permission re-check at run time (supported report type for branch portal).
  if (!(reportDef.portals || []).includes("branch")) {
    return { outcome: "skipped_unauthorised_report", jobKey };
  }

  // Claim the run first (unique job_key) so retries never double-deliver or double-bill quota.
  let run;
  try {
    const inserted = await pool.query(
      `INSERT INTO public.church_scheduled_report_runs (
         schedule_id, organization_id, job_key, scheduled_for, status, export_format, attempt_count, started_at
       ) VALUES ($1,$2,$3,$4,'running',$5,1,now())
       RETURNING *`,
      [schedule.id, schedule.organization_id, jobKey, scheduledFor.toISOString(), schedule.export_format]
    );
    run = inserted.rows[0];
  } catch (err) {
    if (err && err.code === "23505") {
      const existing = await pool.query(
        `SELECT * FROM public.church_scheduled_report_runs WHERE job_key = $1 LIMIT 1`,
        [jobKey]
      );
      return { outcome: "duplicate_job", jobKey, run: existing.rows[0] || null };
    }
    throw err;
  }

  try {
    await churchPackageUsageService.assertCanCreateScheduledReport(pool, {
      organizationId: schedule.organization_id,
      actorType: "system",
      actorId: null,
      consume: true,
      at,
    });
  } catch (err) {
    if (err && err.code === "PACKAGE_SCHEDULED_REPORT_LIMIT") {
      await pool.query(
        `UPDATE public.church_scheduled_report_runs
         SET status = 'skipped', finished_at = now(), last_error = $2
         WHERE id = $1`,
        [run.id, err.message]
      );
      return { outcome: "skipped_quota", jobKey, runId: run.id, error: err.message };
    }
    throw err;
  }

  try {
    const payload = await buildScheduledReportPayload(pool, schedule.report_type, {
      organizationId: schedule.organization_id,
      branchId: schedule.branch_id,
      filters: schedule.filters_json || {},
    });
    const body = renderScheduledReportExport(payload, schedule.export_format);
    const digest = sha256(body);

    await pool.query(
      `UPDATE public.church_scheduled_report_runs
       SET export_body = $2,
           export_sha256 = $3,
           export_byte_length = $4
       WHERE id = $1`,
      [run.id, body, digest, Buffer.byteLength(body, "utf8")]
    );

    const recipients = await listRecipientsForSchedule(pool, schedule.id, schedule.organization_id);
    let delivered = 0;
    let failed = 0;
    let skipped = 0;

    for (const rec of recipients) {
      const idempotencyKey = `delivery:${run.id}:${rec.recipient_type}:${rec.recipient_id}`;
      const authorised = await resolveAuthorisedRecipient(pool, {
        organizationId: schedule.organization_id,
        branchId: schedule.branch_id,
        recipient_type: rec.recipient_type,
        recipient_id: rec.recipient_id,
      });

      if (!authorised) {
        try {
          await pool.query(
            `INSERT INTO public.church_scheduled_report_deliveries (
               run_id, organization_id, recipient_type, recipient_id, recipient_email,
               status, idempotency_key, error_message
             ) VALUES ($1,$2,$3,$4,NULL,'skipped_unauthorised',$5,$6)
             ON CONFLICT (idempotency_key) DO NOTHING`,
            [
              run.id,
              schedule.organization_id,
              rec.recipient_type,
              rec.recipient_id,
              idempotencyKey,
              "Recipient no longer authorised or was deleted.",
            ]
          );
          skipped += 1;
        } catch {
          /* ignore */
        }
        continue;
      }

      try {
        const del = await pool.query(
          `INSERT INTO public.church_scheduled_report_deliveries (
             run_id, organization_id, recipient_type, recipient_id, recipient_email,
             status, idempotency_key, delivered_at
           ) VALUES ($1,$2,$3,$4,$5,'delivered',$6,now())
           ON CONFLICT (idempotency_key) DO NOTHING
           RETURNING *`,
          [
            run.id,
            schedule.organization_id,
            authorised.recipient_type,
            authorised.recipient_id,
            authorised.email,
            idempotencyKey,
          ]
        );
        if (del.rows[0]) {
          delivered += 1;
          await churchPackageUsageService.recordExternalEmailSend(pool, {
            organizationId: schedule.organization_id,
            category: "scheduled_report_delivery",
            count: 1,
            at,
          }).catch(() => null);
        }
      } catch (delErr) {
        failed += 1;
        await pool.query(
          `INSERT INTO public.church_scheduled_report_deliveries (
             run_id, organization_id, recipient_type, recipient_id, recipient_email,
             status, idempotency_key, error_message
           ) VALUES ($1,$2,$3,$4,$5,'failed',$6,$7)
           ON CONFLICT (idempotency_key) DO NOTHING`,
          [
            run.id,
            schedule.organization_id,
            authorised.recipient_type,
            authorised.recipient_id,
            authorised.email,
            idempotencyKey,
            String(delErr.message || "delivery failed").slice(0, 500),
          ]
        );
      }
    }

    const finalStatus = failed > 0 && delivered === 0 ? "failed" : "delivered";
    await pool.query(
      `UPDATE public.church_scheduled_report_runs
       SET status = $2, finished_at = now(), last_error = $3
       WHERE id = $1`,
      [
        run.id,
        finalStatus,
        failed ? `${failed} delivery failure(s)` : null,
      ]
    );

    const nextRunAt = computeNextRunAt(schedule, scheduledFor);
    await pool.query(
      `UPDATE public.church_scheduled_reports
       SET last_run_at = $2, next_run_at = $3, updated_at = now()
       WHERE id = $1 AND status = 'enabled'`,
      [schedule.id, at.toISOString(), nextRunAt.toISOString()]
    );

    await auditLogsRepo.insertAuditLog(pool, {
      organization_id: schedule.organization_id,
      branch_id: schedule.branch_id,
      actor_type: "system",
      actor_id: null,
      action: "scheduled_report_run_completed",
      entity_type: "church_scheduled_report_run",
      entity_id: run.id,
      target_label: schedule.report_type,
      metadata_json: {
        job_key: jobKey,
        delivered,
        failed,
        skipped,
        export_format: schedule.export_format,
        export_sha256: digest,
      },
    });

    return {
      outcome: finalStatus,
      jobKey,
      runId: run.id,
      delivered,
      failed,
      skipped,
    };
  } catch (err) {
    await pool.query(
      `UPDATE public.church_scheduled_report_runs
       SET status = 'failed',
           finished_at = now(),
           last_error = $2,
           attempt_count = attempt_count
       WHERE id = $1`,
      [run.id, String(err.message || "run failed").slice(0, 1000)]
    );
    await auditLogsRepo.insertAuditLog(pool, {
      organization_id: schedule.organization_id,
      branch_id: schedule.branch_id,
      actor_type: "system",
      actor_id: null,
      action: "scheduled_report_run_failed",
      entity_type: "church_scheduled_report_run",
      entity_id: run.id,
      target_label: schedule.report_type,
      metadata_json: { job_key: jobKey, error: String(err.message || "").slice(0, 300) },
    });
    return { outcome: "failed", jobKey, runId: run.id, error: err.message };
  }
}

/**
 * Retry a failed run without duplicating successful deliveries (idempotency keys).
 */
async function retryFailedRun(pool, runId, organizationId) {
  const r = await pool.query(
    `SELECT * FROM public.church_scheduled_report_runs
     WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [runId, organizationId]
  );
  const run = r.rows[0];
  if (!run) {
    const err = new Error("Run not found.");
    err.code = "NOT_FOUND";
    throw err;
  }
  if (run.status !== "failed") {
    const err = new Error("Only failed runs can be retried.");
    err.code = "INVALID_STATUS";
    throw err;
  }

  const s = await pool.query(
    `SELECT * FROM public.church_scheduled_reports WHERE id = $1 AND organization_id = $2`,
    [run.schedule_id, organizationId]
  );
  const schedule = s.rows[0];
  if (!schedule) {
    const err = new Error("Schedule not found.");
    err.code = "NOT_FOUND";
    throw err;
  }

  await assertCanScheduleReports(pool, organizationId);

  await pool.query(
    `UPDATE public.church_scheduled_report_runs
     SET status = 'running',
         attempt_count = attempt_count + 1,
         started_at = now(),
         finished_at = NULL,
         last_error = NULL
     WHERE id = $1 AND status = 'failed'`,
    [run.id]
  );

  // Re-enter execute path by temporarily mapping to same job — use execute with forced existing run
  // Simpler: re-deliver undelivered recipients for this run.
  const recipients = await listRecipientsForSchedule(pool, schedule.id, organizationId);
  let delivered = 0;
  let failed = 0;
  let skipped = 0;
  const body = run.export_body;
  if (!body) {
    const payload = await buildScheduledReportPayload(pool, schedule.report_type, {
      organizationId: schedule.organization_id,
      branchId: schedule.branch_id,
      filters: schedule.filters_json || {},
    });
    const rebuilt = renderScheduledReportExport(payload, schedule.export_format);
    await pool.query(
      `UPDATE public.church_scheduled_report_runs
       SET export_body = $2, export_sha256 = $3, export_byte_length = $4
       WHERE id = $1`,
      [run.id, rebuilt, sha256(rebuilt), Buffer.byteLength(rebuilt, "utf8")]
    );
  }

  for (const rec of recipients) {
    const idempotencyKey = `delivery:${run.id}:${rec.recipient_type}:${rec.recipient_id}`;
    const existing = await pool.query(
      `SELECT status FROM public.church_scheduled_report_deliveries WHERE idempotency_key = $1`,
      [idempotencyKey]
    );
    if (existing.rows[0] && existing.rows[0].status === "delivered") continue;

    const authorised = await resolveAuthorisedRecipient(pool, {
      organizationId,
      branchId: schedule.branch_id,
      recipient_type: rec.recipient_type,
      recipient_id: rec.recipient_id,
    });
    if (!authorised) {
      skipped += 1;
      await pool.query(
        `INSERT INTO public.church_scheduled_report_deliveries (
           run_id, organization_id, recipient_type, recipient_id, status, idempotency_key, error_message
         ) VALUES ($1,$2,$3,$4,'skipped_unauthorised',$5,$6)
         ON CONFLICT (idempotency_key) DO UPDATE
           SET status = 'skipped_unauthorised',
               error_message = EXCLUDED.error_message`,
        [
          run.id,
          organizationId,
          rec.recipient_type,
          rec.recipient_id,
          idempotencyKey,
          "Recipient no longer authorised or was deleted.",
        ]
      );
      continue;
    }

    await pool.query(
      `INSERT INTO public.church_scheduled_report_deliveries (
         run_id, organization_id, recipient_type, recipient_id, recipient_email,
         status, idempotency_key, delivered_at
       ) VALUES ($1,$2,$3,$4,$5,'delivered',$6,now())
       ON CONFLICT (idempotency_key) DO UPDATE
         SET status = 'delivered',
             recipient_email = EXCLUDED.recipient_email,
             delivered_at = now(),
             error_message = NULL`,
      [
        run.id,
        organizationId,
        authorised.recipient_type,
        authorised.recipient_id,
        authorised.email,
        idempotencyKey,
      ]
    );
    delivered += 1;
  }

  const finalStatus = failed > 0 && delivered === 0 ? "failed" : "delivered";
  await pool.query(
    `UPDATE public.church_scheduled_report_runs
     SET status = $2, finished_at = now()
     WHERE id = $1`,
    [run.id, finalStatus]
  );

  await auditLogsRepo.insertAuditLog(pool, {
    organization_id: organizationId,
    branch_id: schedule.branch_id,
    actor_type: "system",
    actor_id: null,
    action: "scheduled_report_run_retried",
    entity_type: "church_scheduled_report_run",
    entity_id: run.id,
    target_label: schedule.report_type,
    metadata_json: { delivered, failed, skipped, job_key: run.job_key },
  });

  return { outcome: finalStatus, runId: run.id, delivered, failed, skipped };
}

async function processDueScheduledReports(pool, opts = {}) {
  const at = opts.at instanceof Date ? opts.at : new Date();
  const limit = Math.min(Math.max(Number(opts.limit) || 25, 1), 100);
  const due = await pool.query(
    `SELECT * FROM public.church_scheduled_reports
     WHERE status = 'enabled'
       AND next_run_at IS NOT NULL
       AND next_run_at <= $1
     ORDER BY next_run_at ASC, id ASC
     LIMIT $2`,
    [at.toISOString(), limit]
  );

  const processed = [];
  for (const schedule of due.rows) {
    try {
      const churchPilotFeatureFlagService = require("./churchPilotFeatureFlagService");
      await churchPilotFeatureFlagService.assertPilotFeatureAvailable(pool, {
        organizationId: schedule.organization_id,
        flagKey: "reports_scheduled",
        at,
      });
    } catch (err) {
      processed.push({
        scheduleId: schedule.id,
        organizationId: schedule.organization_id,
        outcome: "skipped_pilot_flag",
        error: err && err.message,
      });
      continue;
    }
    const result = await executeScheduleRun(pool, schedule, {
      at,
      scheduledFor: schedule.next_run_at,
    });
    processed.push({
      scheduleId: schedule.id,
      organizationId: schedule.organization_id,
      ...result,
    });
  }
  return { at: at.toISOString(), processed, count: processed.length };
}

async function listEligibleRecipients(pool, organizationId, branchId) {
  const branchAdmins = await branchAdminsRepo.listBranchAdminsForBranch(pool, branchId);
  const hqAdmins = await hqAdminsRepo.listHqAdminsForOrganization(pool, organizationId);
  return {
    branchAdmins: (branchAdmins || []).filter((a) => a.status === "active"),
    hqAdmins: (hqAdmins || []).filter((a) => a.status === "active"),
  };
}

async function listRunsForSchedule(db, scheduleId, organizationId, limit = 20) {
  const r = await db.query(
    `SELECT id, schedule_id, organization_id, job_key, scheduled_for, status, attempt_count,
            last_error, export_format, export_sha256, export_byte_length,
            started_at, finished_at, created_at
     FROM public.church_scheduled_report_runs
     WHERE schedule_id = $1 AND organization_id = $2
     ORDER BY scheduled_for DESC, id DESC
     LIMIT $3`,
    [scheduleId, organizationId, Math.min(Math.max(Number(limit) || 20, 1), 100)]
  );
  return r.rows;
}

async function listDeliveriesForRun(db, runId, organizationId) {
  const r = await db.query(
    `SELECT * FROM public.church_scheduled_report_deliveries
     WHERE run_id = $1 AND organization_id = $2
     ORDER BY id ASC`,
    [runId, organizationId]
  );
  return r.rows;
}

/** Batch-load deliveries for many runs (avoids N+1 on schedule detail). */
async function listDeliveriesForRuns(db, runIds, organizationId) {
  const ids = (runIds || [])
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0);
  const byRun = new Map();
  if (!ids.length) return byRun;
  const r = await db.query(
    `SELECT * FROM public.church_scheduled_report_deliveries
     WHERE organization_id = $1 AND run_id = ANY($2::bigint[])
     ORDER BY run_id ASC, id ASC`,
    [organizationId, ids]
  );
  for (const row of r.rows) {
    const key = Number(row.run_id);
    if (!byRun.has(key)) byRun.set(key, []);
    byRun.get(key).push(row);
  }
  return byRun;
}

async function findRunForOrganization(db, runId, organizationId) {
  const r = await db.query(
    `SELECT * FROM public.church_scheduled_report_runs
     WHERE id = $1 AND organization_id = $2
     LIMIT 1`,
    [runId, organizationId]
  );
  return r.rows[0] || null;
}

module.exports = {
  FREQUENCIES,
  FORMATS,
  STATUSES,
  listSupportedScheduledReports,
  getSupportedScheduledReport,
  assertCanScheduleReports,
  validateScheduleInput,
  resolveAuthorisedRecipient,
  listSchedulesForBranch,
  findScheduleForBranch,
  listRecipientsForSchedule,
  listEligibleRecipients,
  listRunsForSchedule,
  listDeliveriesForRun,
  listDeliveriesForRuns,
  findRunForOrganization,
  createSchedule,
  updateScheduleStatus,
  executeScheduleRun,
  retryFailedRun,
  processDueScheduledReports,
  computeNextRunAt,
  jobKeyForScheduleRun,
};
