"use strict";

/**
 * BlessBoard Growth trial entitlements (default duration from package catalogue).
 * No payment collection. No Network features. No silent conversion to paid Growth.
 */

const organizationsRepo = require("../../db/pg/church/organizationsRepo");
const auditLogsRepo = require("../../db/pg/church/auditLogsRepo");
const churchBillingRepo = require("../../db/pg/church/churchBillingRepo");
const {
  resolvePackageFromPlanCode,
  getPackageDefinition,
  readEntitlementPath,
  DEFAULT_GROWTH_TRIAL_DURATION_DAYS,
} = require("../../church/blessBoardPackageCatalogue");
const { PACKAGE_FEATURES } = require("../../church/blessBoardPackageFeatures");

const TRIAL_KIND_GROWTH_30 = "growth_30_day";
const DEFAULT_DURATION_DAYS = DEFAULT_GROWTH_TRIAL_DURATION_DAYS;
const CONFIG_RETENTION_DAYS = 90;
const REMINDER_DAYS_BEFORE = Object.freeze([7, 3, 1]);

function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + Number(days));
  return d;
}

function parseAt(raw) {
  if (raw == null || raw === "") return new Date();
  const d = raw instanceof Date ? raw : new Date(String(raw));
  if (Number.isNaN(d.getTime())) {
    const err = new Error("Invalid trial date.");
    err.code = "INVALID_TRIAL_DATE";
    throw err;
  }
  return d;
}

function growthFeatureIds() {
  const growth = getPackageDefinition("growth").entitlements;
  const foundation = getPackageDefinition("foundation").entitlements;
  return PACKAGE_FEATURES.filter((f) => {
    const g = readEntitlementPath(growth, f.entitlementKey);
    const fnd = readEntitlementPath(foundation, f.entitlementKey);
    const growthAllows =
      g === true ||
      (typeof g === "string" && g && g !== "false") ||
      (typeof g === "number" && g !== 0);
    const foundationAllows =
      fnd === true ||
      (typeof fnd === "string" && fnd && fnd !== "false") ||
      (typeof fnd === "number" && fnd !== 0);
    return growthAllows && !foundationAllows;
  }).map((f) => f.id);
}

async function setOrganizationPlanCode(db, organizationId, fields, platformAdminId) {
  const existing = await organizationsRepo.findOrganizationById(db, organizationId);
  if (!existing) {
    const err = new Error("Organization not found.");
    err.code = "NOT_FOUND";
    throw err;
  }
  const planCode = String(fields.plan_code || "")
    .trim()
    .toLowerCase();
  const planStatus = fields.plan_status != null ? String(fields.plan_status) : existing.plan_status || "active";
  const planNotes = fields.plan_notes != null ? fields.plan_notes : existing.plan_notes;
  const r = await db.query(
    `UPDATE public.church_organizations
     SET plan_code = $2,
         plan_status = $3,
         plan_notes = $4,
         plan_started_at = CASE
           WHEN plan_code IS DISTINCT FROM $2 AND $2 IS NOT NULL THEN COALESCE(plan_started_at, now())
           ELSE plan_started_at
         END,
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [organizationId, planCode, planStatus, planNotes]
  );
  const updated = r.rows[0];
  await auditLogsRepo.insertAuditLog(db, {
    organization_id: organizationId,
    branch_id: null,
    actor_type: "platform_admin",
    actor_id: platformAdminId || null,
    action: "platform_church_plan_updated",
    entity_type: "church_organization",
    entity_id: organizationId,
    target_label: updated.name,
    metadata_json: {
      previous_plan: existing.plan_code || null,
      new_plan: updated.plan_code,
      plan_status: updated.plan_status,
      previous_package: resolvePackageFromPlanCode(existing.plan_code).packageCode,
      new_package: resolvePackageFromPlanCode(updated.plan_code).packageCode,
      via: "growth_trial",
    },
  });
  return updated;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {number} organizationId
 * @param {{ at?: Date }} [opts]
 */
async function findActiveGrowthTrial(db, organizationId, opts = {}) {
  const at = parseAt(opts.at);
  const r = await db.query(
    `SELECT *
     FROM public.church_organization_package_trials
     WHERE organization_id = $1
       AND trial_kind = $2
       AND status = 'active'
       AND starts_at <= $3
       AND ends_at > $3
     ORDER BY id DESC
     LIMIT 1`,
    [organizationId, TRIAL_KIND_GROWTH_30, at.toISOString()]
  );
  return r.rows[0] || null;
}

/**
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {number} organizationId
 */
async function findGrowthTrialRecord(db, organizationId) {
  const r = await db.query(
    `SELECT *
     FROM public.church_organization_package_trials
     WHERE organization_id = $1 AND trial_kind = $2
     ORDER BY id DESC
     LIMIT 1`,
    [organizationId, TRIAL_KIND_GROWTH_30]
  );
  return r.rows[0] || null;
}

/**
 * Public trial status for account / package pages (tenant-scoped).
 * @param {import("pg").Pool | import("pg").PoolClient} db
 * @param {number} organizationId
 * @param {{ at?: Date }} [opts]
 */
async function getOrganisationTrialStatus(db, organizationId, opts = {}) {
  const at = parseAt(opts.at);
  const orgId = Number(organizationId);
  if (!Number.isFinite(orgId) || orgId <= 0) return null;

  const trial = await findGrowthTrialRecord(db, orgId);
  if (!trial) {
    return {
      organizationId: orgId,
      hasTrial: false,
      status: "none",
      canGrant: true,
      trial: null,
      configRetained: false,
    };
  }

  const endsAt = new Date(trial.ends_at);
  const startsAt = new Date(trial.starts_at);
  const retainUntil = trial.config_retain_until ? new Date(trial.config_retain_until) : null;
  const isActive =
    trial.status === "active" && startsAt.getTime() <= at.getTime() && endsAt.getTime() > at.getTime();
  const configRetained =
    !isActive &&
    trial.status === "expired" &&
    retainUntil &&
    at.getTime() < retainUntil.getTime() &&
    !trial.config_purged_at;

  let status = trial.status;
  if (isActive) status = "active";
  else if (configRetained) status = "expired_retaining_config";
  else if (trial.status === "expired") status = "expired";

  return {
    organizationId: orgId,
    hasTrial: true,
    status,
    canGrant: false,
    configRetained: Boolean(configRetained),
    trial: {
      id: trial.id,
      kind: trial.trial_kind,
      status: trial.status,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      durationDays: trial.duration_days,
      grantedByPlatformAdminId: trial.granted_by_platform_admin_id,
      reason: trial.grant_reason,
      previousPackageCode: trial.previous_package_code,
      previousPlanCode: trial.previous_plan_code,
      expiredAt: trial.expired_at ? new Date(trial.expired_at).toISOString() : null,
      configRetainUntil: retainUntil ? retainUntil.toISOString() : null,
      configPurgedAt: trial.config_purged_at ? new Date(trial.config_purged_at).toISOString() : null,
    },
  };
}

/**
 * Grant one Growth trial per organisation (default).
 * Sets plan_code to growth for the trial window; restores previous package on expiry.
 *
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @param {{ reason: string, durationDays?: number, startsAt?: Date|string, grantedByPlatformAdminId?: number|null, at?: Date }} fields
 */
async function grantGrowthTrial(pool, organizationId, fields) {
  const orgId = Number(organizationId);
  const churchPilotFeatureFlagService = require("./churchPilotFeatureFlagService");
  await churchPilotFeatureFlagService.assertPilotFeatureAvailable(pool, {
    organizationId: orgId,
    flagKey: "growth_trial",
    at: fields && fields.at ? new Date(fields.at) : new Date(),
  });
  const reason = String(fields.reason || "")
    .trim()
    .slice(0, 2000);
  if (!reason) {
    const err = new Error("A reason is required to grant a Growth trial.");
    err.code = "REASON_REQUIRED";
    throw err;
  }

  const org = await organizationsRepo.findOrganizationById(pool, orgId);
  if (!org) {
    const err = new Error("Organization not found.");
    err.code = "NOT_FOUND";
    throw err;
  }

  const { isBillableEnvironment, getDataEnvironment } = require("../../church/orgDataEnvironment");
  if (!isBillableEnvironment(org)) {
    const err = new Error(
      `Growth trials are not available for ${getDataEnvironment(org)} organisations.`
    );
    err.code = "NOT_BILLABLE_ENVIRONMENT";
    err.dataEnvironment = getDataEnvironment(org);
    throw err;
  }

  const existing = await findGrowthTrialRecord(pool, orgId);
  if (existing) {
    const err = new Error("This organisation already has a Growth trial and cannot receive another by default.");
    err.code = "DUPLICATE_TRIAL";
    throw err;
  }

  const current = resolvePackageFromPlanCode(org.plan_code);
  if (current.packageCode === "growth" && org.plan_status === "active") {
    // Already on paid/assigned Growth — trial is unnecessary and would mask package assignment.
    const err = new Error("Organisation is already on Growth. Trial grant is not applicable.");
    err.code = "ALREADY_GROWTH";
    throw err;
  }

  const startsAt = parseAt(fields.startsAt != null ? fields.startsAt : fields.at);
  const durationDays = Number(fields.durationDays) > 0 ? Math.floor(Number(fields.durationDays)) : DEFAULT_DURATION_DAYS;
  const endsAt = addDays(startsAt, durationDays);
  const configRetainUntil = addDays(endsAt, CONFIG_RETENTION_DAYS);
  const adminId = fields.grantedByPlatformAdminId != null ? Number(fields.grantedByPlatformAdminId) : null;

  const client = await pool.connect();
  let trial;
  try {
    await client.query("BEGIN");

    const inserted = await client.query(
      `INSERT INTO public.church_organization_package_trials (
         organization_id, trial_kind, status,
         previous_plan_code, previous_package_code,
         starts_at, ends_at, duration_days,
         granted_by_platform_admin_id, grant_reason,
         config_retain_until, growth_config_snapshot_json
       ) VALUES (
         $1, $2, 'active',
         $3, $4,
         $5, $6, $7,
         $8, $9,
         $10, $11::jsonb
       )
       RETURNING *`,
      [
        orgId,
        TRIAL_KIND_GROWTH_30,
        org.plan_code == null ? null : String(org.plan_code),
        current.packageCode,
        startsAt.toISOString(),
        endsAt.toISOString(),
        durationDays,
        Number.isFinite(adminId) ? adminId : null,
        reason,
        configRetainUntil.toISOString(),
        JSON.stringify({
          feature_ids: growthFeatureIds(),
          captured_at: startsAt.toISOString(),
          note: "Growth-only configuration retained for 90 days after trial expiry.",
        }),
      ]
    );
    trial = inserted.rows[0];

    for (const days of REMINDER_DAYS_BEFORE) {
      const dueAt = addDays(endsAt, -days);
      const jobKey = `trial_reminder:${trial.id}:${days}`;
      await client.query(
        `INSERT INTO public.church_organization_package_trial_reminders (
           trial_id, organization_id, days_before_expiry, due_at, status, job_key
         ) VALUES ($1, $2, $3, $4, 'pending', $5)
         ON CONFLICT (job_key) DO NOTHING`,
        [trial.id, orgId, days, dueAt.toISOString(), jobKey]
      );
    }

    await setOrganizationPlanCode(
      client,
      orgId,
      {
        plan_code: "growth",
        plan_status: org.plan_status || "active",
        plan_notes: `Growth trial: ${reason}`.slice(0, 2000),
      },
      Number.isFinite(adminId) ? adminId : null
    );

    await churchBillingRepo.insertPackageHistory(client, {
      organization_id: orgId,
      previous_plan_code: org.plan_code,
      new_plan_code: "growth",
      previous_package_code: current.packageCode,
      new_package_code: "growth",
      changed_by_platform_admin_id: Number.isFinite(adminId) ? adminId : null,
      change_reason: `Growth trial granted: ${reason}`.slice(0, 2000),
      effective_at: startsAt,
    });

    await auditLogsRepo.insertAuditLog(client, {
      organization_id: orgId,
      branch_id: null,
      actor_type: "platform_admin",
      actor_id: Number.isFinite(adminId) ? adminId : null,
      action: "platform_growth_trial_granted",
      entity_type: "church_organization_package_trial",
      entity_id: trial.id,
      target_label: org.name,
      metadata_json: {
        trial_id: trial.id,
        trial_kind: TRIAL_KIND_GROWTH_30,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        duration_days: durationDays,
        previous_package_code: current.packageCode,
        reason,
        config_retain_until: configRetainUntil.toISOString(),
      },
    });

    await client.query("COMMIT");
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    if (err && (err.code === "23505" || /unique|duplicate/i.test(String(err.message || "")))) {
      const dup = new Error("This organisation already has a Growth trial and cannot receive another by default.");
      dup.code = "DUPLICATE_TRIAL";
      throw dup;
    }
    throw err;
  } finally {
    client.release();
  }

  return {
    trial,
    status: await getOrganisationTrialStatus(pool, orgId, { at: startsAt }),
  };
}

/**
 * Idempotent reminder processor. Safe if run twice.
 * @param {import("pg").Pool} pool
 * @param {{ at?: Date, limit?: number }} [opts]
 */
async function processTrialReminders(pool, opts = {}) {
  const at = parseAt(opts.at);
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 500);
  const due = await pool.query(
    `SELECT r.*
     FROM public.church_organization_package_trial_reminders r
     INNER JOIN public.church_organization_package_trials t ON t.id = r.trial_id
     WHERE r.status = 'pending'
       AND r.due_at <= $1
       AND t.status = 'active'
     ORDER BY r.due_at ASC, r.id ASC
     LIMIT $2`,
    [at.toISOString(), limit]
  );

  const processed = [];
  for (const row of due.rows) {
    const claimed = await pool.query(
      `UPDATE public.church_organization_package_trial_reminders
       SET status = 'sent',
           processed_at = now(),
           metadata_json = COALESCE(metadata_json, '{}'::jsonb) || jsonb_build_object('processed_at', $2::text)
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [row.id, at.toISOString()]
    );
    if (!claimed.rows[0]) {
      processed.push({ id: row.id, organizationId: row.organization_id, outcome: "already_processed" });
      continue;
    }
    await auditLogsRepo.insertAuditLog(pool, {
      organization_id: row.organization_id,
      branch_id: null,
      actor_type: "system",
      actor_id: null,
      action: "platform_growth_trial_reminder",
      entity_type: "church_organization_package_trial",
      entity_id: row.trial_id,
      target_label: null,
      metadata_json: {
        trial_id: row.trial_id,
        days_before_expiry: row.days_before_expiry,
        job_key: row.job_key,
        due_at: row.due_at,
      },
    });
    processed.push({
      id: row.id,
      organizationId: row.organization_id,
      daysBeforeExpiry: row.days_before_expiry,
      outcome: "sent",
      jobKey: row.job_key,
    });
  }
  return { at: at.toISOString(), processed, count: processed.length };
}

/**
 * Idempotent expiry processor. Restores previous package; retains Growth config metadata for 90 days.
 * Does not convert the trial into a paid package.
 * @param {import("pg").Pool} pool
 * @param {{ at?: Date, limit?: number }} [opts]
 */
async function processTrialExpiries(pool, opts = {}) {
  const at = parseAt(opts.at);
  const limit = Math.min(Math.max(Number(opts.limit) || 50, 1), 200);
  const due = await pool.query(
    `SELECT *
     FROM public.church_organization_package_trials
     WHERE status = 'active'
       AND ends_at <= $1
     ORDER BY ends_at ASC, id ASC
     LIMIT $2`,
    [at.toISOString(), limit]
  );

  const processed = [];
  for (const trial of due.rows) {
    const jobKey = `trial_expire:${trial.id}`;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const claimed = await client.query(
        `UPDATE public.church_organization_package_trials
         SET status = 'expired',
             expired_at = $2,
             expiry_job_key = $3,
             updated_at = now()
         WHERE id = $1
           AND status = 'active'
           AND expiry_job_key IS NULL
         RETURNING *`,
        [trial.id, at.toISOString(), jobKey]
      );
      if (!claimed.rows[0]) {
        await client.query("ROLLBACK");
        processed.push({
          trialId: trial.id,
          organizationId: trial.organization_id,
          outcome: "already_expired",
        });
        continue;
      }

      const previousPlan = trial.previous_plan_code || trial.previous_package_code || "foundation";
      let restoreCode = resolvePackageFromPlanCode(previousPlan).packageCode;
      // Never silently convert trial into ongoing paid Growth.
      if (restoreCode === "growth") restoreCode = "foundation";

      await setOrganizationPlanCode(
        client,
        trial.organization_id,
        {
          plan_code: restoreCode,
          plan_status: "active",
          plan_notes: `Growth trial expired; restored ${restoreCode}.`,
        },
        trial.granted_by_platform_admin_id || null
      );

      await churchBillingRepo.insertPackageHistory(client, {
        organization_id: trial.organization_id,
        previous_plan_code: "growth",
        new_plan_code: restoreCode,
        previous_package_code: "growth",
        new_package_code: restoreCode,
        changed_by_platform_admin_id: trial.granted_by_platform_admin_id || null,
        change_reason: "Growth trial expired — previous package restored. Not converted to paid Growth.",
        effective_at: at,
      });

      await client.query(
        `UPDATE public.church_organization_package_trial_reminders
         SET status = 'skipped', processed_at = now()
         WHERE trial_id = $1 AND status = 'pending'`,
        [trial.id]
      );

      await auditLogsRepo.insertAuditLog(client, {
        organization_id: trial.organization_id,
        branch_id: null,
        actor_type: "system",
        actor_id: null,
        action: "platform_growth_trial_expired",
        entity_type: "church_organization_package_trial",
        entity_id: trial.id,
        target_label: null,
        metadata_json: {
          trial_id: trial.id,
          job_key: jobKey,
          restored_package_code: restoreCode,
          config_retain_until: trial.config_retain_until,
          converted_to_paid: false,
        },
      });

      await client.query("COMMIT");
      processed.push({
        trialId: trial.id,
        organizationId: trial.organization_id,
        outcome: "expired",
        jobKey,
        restoredPackageCode: restoreCode,
      });
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      if (err && err.code === "23505") {
        processed.push({
          trialId: trial.id,
          organizationId: trial.organization_id,
          outcome: "already_expired",
        });
        continue;
      }
      throw err;
    } finally {
      client.release();
    }
  }

  return { at: at.toISOString(), processed, count: processed.length };
}

/**
 * Mark Growth config retention windows as purged after 90 days (idempotent).
 * Does not delete church data.
 * @param {import("pg").Pool} pool
 * @param {{ at?: Date, limit?: number }} [opts]
 */
async function processTrialConfigRetention(pool, opts = {}) {
  const at = parseAt(opts.at);
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 500);
  const due = await pool.query(
    `UPDATE public.church_organization_package_trials
     SET config_purged_at = $1,
         updated_at = now()
     WHERE status = 'expired'
       AND config_retain_until IS NOT NULL
       AND config_retain_until <= $1
       AND config_purged_at IS NULL
       AND id IN (
         SELECT id FROM public.church_organization_package_trials
         WHERE status = 'expired'
           AND config_retain_until IS NOT NULL
           AND config_retain_until <= $1
           AND config_purged_at IS NULL
         ORDER BY config_retain_until ASC
         LIMIT $2
       )
     RETURNING *`,
    [at.toISOString(), limit]
  );

  for (const row of due.rows) {
    await auditLogsRepo.insertAuditLog(pool, {
      organization_id: row.organization_id,
      branch_id: null,
      actor_type: "system",
      actor_id: null,
      action: "platform_growth_trial_config_retention_ended",
      entity_type: "church_organization_package_trial",
      entity_id: row.id,
      target_label: null,
      metadata_json: {
        trial_id: row.id,
        config_retain_until: row.config_retain_until,
        note: "Growth-only configuration retention ended. Church data remains.",
      },
    });
  }

  return { at: at.toISOString(), processed: due.rows.length, trials: due.rows.map((r) => r.id) };
}

/**
 * Run reminder + expiry + retention jobs (exported for cron scripts).
 * @param {import("pg").Pool} pool
 * @param {{ at?: Date }} [opts]
 */
async function runGrowthTrialJobs(pool, opts = {}) {
  const reminders = await processTrialReminders(pool, opts);
  const expiries = await processTrialExpiries(pool, opts);
  const retention = await processTrialConfigRetention(pool, opts);
  return { reminders, expiries, retention };
}

function computeReminderDueDates(endsAt) {
  const end = parseAt(endsAt);
  return REMINDER_DAYS_BEFORE.map((days) => ({
    daysBeforeExpiry: days,
    dueAt: addDays(end, -days).toISOString(),
  }));
}

module.exports = {
  TRIAL_KIND_GROWTH_30,
  DEFAULT_DURATION_DAYS,
  CONFIG_RETENTION_DAYS,
  REMINDER_DAYS_BEFORE,
  findActiveGrowthTrial,
  findGrowthTrialRecord,
  getOrganisationTrialStatus,
  grantGrowthTrial,
  processTrialReminders,
  processTrialExpiries,
  processTrialConfigRetention,
  runGrowthTrialJobs,
  computeReminderDueDates,
  addDays,
};
