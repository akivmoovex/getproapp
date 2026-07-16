"use strict";

/**
 * Foundation inactivity warnings + dormancy (Growth excluded).
 * Suspension and dormancy remain distinct. No production deletion.
 */

const auditLogsRepo = require("../../db/pg/church/auditLogsRepo");
const organizationsRepo = require("../../db/pg/church/organizationsRepo");
const websiteContentRepo = require("../../db/pg/church/websiteContentRepo");
const branchesRepo = require("../../db/pg/church/branchesRepo");
const { resolvePackageFromPlanCode } = require("../../church/blessBoardPackageCatalogue");
const notificationTemplateService = require("./notificationTemplateService");
const churchPackageUsageService = require("./churchPackageUsageService");
const {
  calculateOrganisationActivity,
  classifyInactivity,
  DATA_PRESERVE_DAYS,
  FIRST_WARNING_MONTHS,
  FINAL_WARNING_MONTHS,
  DORMANT_MONTHS,
} = require("./churchInactivityActivityService");

function addDays(date, days) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function addAverageMonths(date, months) {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + Math.round(Number(months) * 30.436875));
  return d;
}

/**
 * Recorded (not SMTP) dormancy notices to HQ admins. Failures never block state transitions.
 */
async function deliverInactivityNotices(pool, opts) {
  const {
    organizationId,
    warningStage,
    basedOnActivityAt,
    at = new Date(),
    organisationName = null,
  } = opts;
  const orgName =
    organisationName ||
    (
      await pool.query(`SELECT name FROM public.church_organizations WHERE id = $1`, [organizationId])
    ).rows[0]?.name ||
    "your church";
  const activityDeadline = addAverageMonths(basedOnActivityAt, DORMANT_MONTHS)
    .toISOString()
    .slice(0, 10);
  const stageLabel =
    warningStage === "final"
      ? "final warning"
      : warningStage === "dormant"
        ? "dormancy notice"
        : "first warning";

  const hqAdmins = await pool.query(
    `SELECT id, full_name, email
     FROM public.church_hq_admins
     WHERE organization_id = $1 AND status = 'active' AND email IS NOT NULL AND email <> ''
     ORDER BY id ASC
     LIMIT 20`,
    [organizationId]
  );

  let delivered = 0;
  for (const admin of hqAdmins.rows) {
    try {
      const preview = await notificationTemplateService.previewTemplate(pool, {
        templateKey: "foundation_dormancy_warning",
        organizationId,
        variables: {
          organisation_name: orgName,
          organization_name: orgName,
          admin_name: admin.full_name || "Administrator",
          warning_stage: stageLabel,
          activity_deadline: activityDeadline,
          branch_name: "",
          support_url: "",
          login_url: "",
          member_name: "",
        },
        allowMissing: true,
      });
      await churchPackageUsageService.recordExternalEmailSend(pool, {
        organizationId,
        category: "foundation_dormancy_lifecycle",
        count: 1,
        at,
        actorType: "system",
        actorId: null,
      });
      await pool.query(
        `INSERT INTO public.church_notification_test_deliveries (
           organization_id, template_key, recipient_actor_type, recipient_actor_id, recipient_email,
           subject_rendered, body_text_rendered, body_html_rendered,
           requested_by_actor_type, requested_by_actor_id
         ) VALUES ($1,$2,'hq_admin',$3,$4,$5,$6,$7,'system',NULL)`,
        [
          organizationId,
          "foundation_dormancy_warning",
          admin.id,
          String(admin.email).trim().toLowerCase(),
          preview.subject,
          preview.bodyText,
          preview.bodyHtml,
        ]
      );
      delivered += 1;
    } catch {
      /* continue other recipients */
    }
  }
  return delivered;
}

async function isGrowthOrganisation(pool, organizationId, at = new Date()) {
  const org = await organizationsRepo.findOrganizationById(pool, organizationId);
  if (!org) return { isGrowth: false, reason: "not_found" };
  try {
    const churchGrowthTrialService = require("./churchGrowthTrialService");
    const trial = await churchGrowthTrialService.findActiveGrowthTrial(pool, organizationId, { at });
    if (trial) {
      return { isGrowth: true, reason: "growth_trial", packageCode: "growth" };
    }
  } catch {
    /* trial service optional mid-migrate */
  }
  const resolved = resolvePackageFromPlanCode(org.plan_code);
  if (resolved.packageCode === "growth") {
    return { isGrowth: true, reason: "growth_package", packageCode: "growth" };
  }
  return { isGrowth: false, reason: "foundation", packageCode: "foundation" };
}

function warningJobKey(organizationId, stage, basedOnIso) {
  return `inactivity_warn:${organizationId}:${stage}:${basedOnIso}`;
}

function dormantJobKey(organizationId, basedOnIso) {
  return `inactivity_dormant:${organizationId}:${basedOnIso}`;
}

async function recordInactivityWarning(pool, opts) {
  const {
    organizationId,
    warningStage,
    basedOnActivityAt,
    message,
    at = new Date(),
  } = opts;
  const basedIso = new Date(basedOnActivityAt).toISOString();
  const jobKey = warningJobKey(organizationId, warningStage, basedIso);

  try {
    const inserted = await pool.query(
      `INSERT INTO public.church_organization_inactivity_warnings (
         organization_id, warning_stage, based_on_activity_at, job_key, status, message, processed_at
       ) VALUES ($1,$2,$3,$4,'recorded',$5,$6)
       ON CONFLICT (job_key) DO NOTHING
       RETURNING *`,
      [
        organizationId,
        warningStage,
        basedIso,
        jobKey,
        message || null,
        at.toISOString(),
      ]
    );
    if (!inserted.rows[0]) {
      return { outcome: "duplicate_job", jobKey };
    }
    const recordedDeliveries = await deliverInactivityNotices(pool, {
      organizationId,
      warningStage,
      basedOnActivityAt,
      at,
    });
    await auditLogsRepo.insertAuditLog(pool, {
      organization_id: organizationId,
      branch_id: null,
      actor_type: "system",
      actor_id: null,
      action:
        warningStage === "final"
          ? "organization_inactivity_final_warning"
          : "organization_inactivity_first_warning",
      entity_type: "church_organization",
      entity_id: organizationId,
      target_label: null,
      metadata_json: {
        warning_stage: warningStage,
        based_on_activity_at: basedIso,
        job_key: jobKey,
        recorded_deliveries: recordedDeliveries,
        recorded_only: true,
      },
    });
    return {
      outcome: "recorded",
      jobKey,
      warning: inserted.rows[0],
      recordedDeliveries,
    };
  } catch (err) {
    if (err && err.code === "23505") {
      return { outcome: "duplicate_job", jobKey };
    }
    throw err;
  }
}

async function unpublishOrganisationPublicSites(pool, organizationId) {
  const branches = await branchesRepo.listBranchesForOrganization(pool, organizationId);
  let unpublished = 0;
  for (const branch of branches || []) {
    const result = await websiteContentRepo.unpublishWebsiteContentForBranch(pool, branch.id);
    if (result) unpublished += 1;
  }
  return { unpublished, branchCount: (branches || []).length };
}

/**
 * Mark Foundation org dormant. Never runs when activity calc is uncertain or org is Growth/suspended/archived.
 */
async function markOrganisationDormant(pool, opts) {
  const { organizationId, activity, at = new Date(), forceJobKey = null } = opts;
  const org = await organizationsRepo.findOrganizationById(pool, organizationId);
  if (!org) {
    return { outcome: "not_found" };
  }
  if (org.status === "dormant") {
    return { outcome: "already_dormant" };
  }
  if (org.status === "suspended" || org.status === "archived") {
    return { outcome: "skipped_status", status: org.status };
  }
  if (org.status !== "active") {
    return { outcome: "skipped_status", status: org.status };
  }

  const growth = await isGrowthOrganisation(pool, organizationId, at);
  if (growth.isGrowth) {
    return { outcome: "skipped_growth", reason: growth.reason };
  }
  if (!activity || !activity.certain) {
    return { outcome: "skipped_uncertain", reason: activity && activity.reason };
  }

  const classification = classifyInactivity(activity, at);
  if (!classification.certain || !classification.eligibleForDormant) {
    return { outcome: "skipped_not_eligible", monthsInactive: classification.monthsInactive };
  }

  const basedIso = activity.lastActivityAt.toISOString();
  const jobKey = forceJobKey || dormantJobKey(organizationId, basedIso);

  // Claim dormant job first (idempotent). Stage `dormant` is a job marker, not a user-facing warning.
  const jobClaim = await pool.query(
    `INSERT INTO public.church_organization_inactivity_warnings (
       organization_id, warning_stage, based_on_activity_at, job_key, status, message, processed_at
     ) VALUES ($1,'dormant',$2,$3,'recorded',$4,$5)
     ON CONFLICT (job_key) DO NOTHING
     RETURNING id`,
    [
      organizationId,
      basedIso,
      jobKey,
      `Marked dormant after ${DORMANT_MONTHS} months without genuine activity. Production deletion is not enabled.`,
      at.toISOString(),
    ]
  );
  if (!jobClaim.rows[0]) {
    return { outcome: "duplicate_job", jobKey };
  }

  const claim = await pool.query(
    `UPDATE public.church_organizations
     SET status = 'dormant',
         dormant_at = $2,
         dormant_by_system = true,
         last_genuine_activity_at = $3,
         last_genuine_activity_sources = $4::jsonb,
         dormancy_data_preserve_until = $5,
         status_reason = $6,
         updated_at = now()
     WHERE id = $1
       AND status = 'active'
     RETURNING *`,
    [
      organizationId,
      at.toISOString(),
      basedIso,
      JSON.stringify(activity.sources || []),
      addDays(at, DATA_PRESERVE_DAYS).toISOString(),
      `Foundation inactivity dormancy after ${DORMANT_MONTHS} months without genuine activity. Data preserved until dormancy_data_preserve_until. Deletion is not enabled.`,
    ]
  );

  if (!claim.rows[0]) {
    return { outcome: "duplicate_job", jobKey };
  }

  const site = await unpublishOrganisationPublicSites(pool, organizationId);
  const recordedDeliveries = await deliverInactivityNotices(pool, {
    organizationId,
    warningStage: "dormant",
    basedOnActivityAt: activity.lastActivityAt,
    at,
    organisationName: claim.rows[0].name,
  });

  await auditLogsRepo.insertAuditLog(pool, {
    organization_id: organizationId,
    branch_id: null,
    actor_type: "system",
    actor_id: null,
    action: "organization_marked_dormant",
    entity_type: "church_organization",
    entity_id: organizationId,
    target_label: claim.rows[0].name,
    metadata_json: {
      previous_status: "active",
      new_status: "dormant",
      job_key: jobKey,
      based_on_activity_at: basedIso,
      primary_source: activity.primarySource,
      months_inactive: classification.monthsInactive,
      data_preserve_until: claim.rows[0].dormancy_data_preserve_until,
      public_sites_unpublished: site.unpublished,
      production_deletion: false,
      recorded_deliveries: recordedDeliveries,
      recorded_only: true,
    },
  });

  return {
    outcome: "dormant",
    jobKey,
    organization: claim.rows[0],
    site,
    dataPreserveUntil: claim.rows[0].dormancy_data_preserve_until,
    recordedDeliveries,
  };
}

async function reactivateFromDormancy(pool, opts) {
  const {
    organizationId,
    actorType = "platform_admin",
    actorId = null,
    reason = null,
    at = new Date(),
  } = opts;
  const org = await organizationsRepo.findOrganizationById(pool, organizationId);
  if (!org) {
    const err = new Error("Organisation not found.");
    err.code = "NOT_FOUND";
    throw err;
  }
  if (org.status !== "dormant") {
    const err = new Error("Only dormant organisations can be reactivated from dormancy.");
    err.code = "INVALID_STATUS";
    throw err;
  }

  const r = await pool.query(
    `UPDATE public.church_organizations
     SET status = 'active',
         dormant_at = NULL,
         dormant_by_system = false,
         reactivated_from_dormancy_at = $2,
         dormancy_data_preserve_until = NULL,
         status_reason = $3,
         updated_at = now()
     WHERE id = $1 AND status = 'dormant'
     RETURNING *`,
    [
      organizationId,
      at.toISOString(),
      reason ? String(reason).trim().slice(0, 2000) : "Reactivated from dormancy.",
    ]
  );
  if (!r.rows[0]) {
    const err = new Error("Organisation could not be reactivated.");
    err.code = "UPDATE_FAILED";
    throw err;
  }

  await auditLogsRepo.insertAuditLog(pool, {
    organization_id: organizationId,
    branch_id: null,
    actor_type: actorType,
    actor_id: actorId,
    action: "organization_reactivated_from_dormancy",
    entity_type: "church_organization",
    entity_id: organizationId,
    target_label: r.rows[0].name,
    metadata_json: {
      previous_status: "dormant",
      new_status: "active",
      reason: reason || null,
      public_site_note: "Public site remains unpublished until manually published.",
    },
  });

  return r.rows[0];
}

/**
 * Idempotent scheduled check for Foundation inactivity.
 */
async function processFoundationInactivityJobs(pool, opts = {}) {
  const at = opts.at instanceof Date ? opts.at : new Date();
  const limit = Math.min(Math.max(Number(opts.limit) || 200, 1), 1000);
  const organizationIds = Array.isArray(opts.organizationIds)
    ? opts.organizationIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
    : null;

  // Orgs younger than the first-warning horizon cannot be eligible (created_at anchors activity).
  const firstWarningHorizon = new Date(at.getTime());
  firstWarningHorizon.setUTCDate(
    firstWarningHorizon.getUTCDate() - Math.ceil(FIRST_WARNING_MONTHS * 30.436875)
  );

  let candidates;
  if (organizationIds && organizationIds.length) {
    candidates = await pool.query(
      `SELECT id, plan_code, status, created_at
       FROM public.church_organizations
       WHERE status = 'active' AND id = ANY($1::int[])
       ORDER BY id ASC`,
      [organizationIds]
    );
  } else {
    candidates = await pool.query(
      `SELECT id, plan_code, status, created_at
       FROM public.church_organizations
       WHERE status = 'active'
         AND created_at <= $1
       ORDER BY id ASC
       LIMIT $2`,
      [firstWarningHorizon.toISOString(), limit]
    );
  }

  const processed = [];
  for (const org of candidates.rows) {
    const growth = await isGrowthOrganisation(pool, org.id, at);
    if (growth.isGrowth) {
      processed.push({ organizationId: org.id, outcome: "skipped_growth", reason: growth.reason });
      continue;
    }

    try {
      const churchPilotFeatureFlagService = require("./churchPilotFeatureFlagService");
      await churchPilotFeatureFlagService.assertPilotFeatureAvailable(pool, {
        organizationId: org.id,
        flagKey: "dormancy_automation",
        at,
      });
    } catch (err) {
      processed.push({
        organizationId: org.id,
        outcome: "skipped_pilot_flag",
        error: err && err.message,
      });
      continue;
    }

    const activity = await calculateOrganisationActivity(pool, org.id);
    if (!activity.certain) {
      processed.push({
        organizationId: org.id,
        outcome: "skipped_uncertain",
        reason: activity.reason,
      });
      continue;
    }

    // Persist diagnostic snapshot (does not change status)
    await pool.query(
      `UPDATE public.church_organizations
       SET last_genuine_activity_at = $2,
           last_genuine_activity_sources = $3::jsonb,
           updated_at = updated_at
       WHERE id = $1 AND status = 'active'`,
      [org.id, activity.lastActivityAt.toISOString(), JSON.stringify(activity.sources || [])]
    );

    const classification = classifyInactivity(activity, at);
    if (!classification.certain) {
      processed.push({ organizationId: org.id, outcome: "skipped_uncertain" });
      continue;
    }

    if (classification.eligibleForDormant) {
      const result = await markOrganisationDormant(pool, { organizationId: org.id, activity, at });
      processed.push({ organizationId: org.id, ...result });
      continue;
    }

    if (classification.eligibleForFinalWarning) {
      const result = await recordInactivityWarning(pool, {
        organizationId: org.id,
        warningStage: "final",
        basedOnActivityAt: activity.lastActivityAt,
        message: `Final inactivity warning (~${FINAL_WARNING_MONTHS} months). Organisation may become dormant at ${DORMANT_MONTHS} months.`,
        at,
      });
      processed.push({ organizationId: org.id, stage: "final", ...result });
      continue;
    }

    if (classification.eligibleForFirstWarning) {
      const result = await recordInactivityWarning(pool, {
        organizationId: org.id,
        warningStage: "first",
        basedOnActivityAt: activity.lastActivityAt,
        message: `First inactivity warning (~${FIRST_WARNING_MONTHS} months without genuine church activity).`,
        at,
      });
      processed.push({ organizationId: org.id, stage: "first", ...result });
      continue;
    }

    processed.push({
      organizationId: org.id,
      outcome: "active_ok",
      monthsInactive: classification.monthsInactive,
    });
  }

  return { at: at.toISOString(), processed, count: processed.length };
}

async function getOrganisationDormancyDiagnostic(pool, organizationId, opts = {}) {
  const at = opts.at instanceof Date ? opts.at : new Date();
  const org = await organizationsRepo.findOrganizationById(pool, organizationId);
  if (!org) return null;

  const growth = await isGrowthOrganisation(pool, organizationId, at);
  const activity = await calculateOrganisationActivity(pool, organizationId);
  const classification =
    activity.certain && !growth.isGrowth
      ? classifyInactivity(activity, at)
      : { certain: false, reason: growth.isGrowth ? "growth_excluded" : activity.reason };

  const warnings = await pool.query(
    `SELECT warning_stage, status, job_key, based_on_activity_at, processed_at, message, created_at
     FROM public.church_organization_inactivity_warnings
     WHERE organization_id = $1
     ORDER BY created_at DESC
     LIMIT 20`,
    [organizationId]
  );

  const auditsFixed = await pool.query(
    `SELECT action, created_at, metadata_json, actor_type
     FROM public.church_audit_logs
     WHERE organization_id = $1
       AND (
         action LIKE 'organization_%dorm%'
         OR action LIKE 'organization_inactivity%'
         OR action = 'organization_marked_dormant'
         OR action = 'organization_reactivated_from_dormancy'
       )
     ORDER BY created_at DESC
     LIMIT 20`,
    [organizationId]
  );

  return {
    organizationId,
    status: org.status,
    package: growth,
    activity,
    classification,
    dormantAt: org.dormant_at || null,
    dataPreserveUntil: org.dormancy_data_preserve_until || null,
    reactivatedFromDormancyAt: org.reactivated_from_dormancy_at || null,
    lastGenuineActivityAt: org.last_genuine_activity_at || null,
    lastGenuineActivitySources: org.last_genuine_activity_sources || null,
    warnings: warnings.rows,
    auditHistory: auditsFixed.rows,
    productionDeletionEnabled: false,
    thresholds: {
      firstWarningMonths: FIRST_WARNING_MONTHS,
      finalWarningMonths: FINAL_WARNING_MONTHS,
      dormantMonths: DORMANT_MONTHS,
      dataPreserveDays: DATA_PRESERVE_DAYS,
    },
  };
}

module.exports = {
  isGrowthOrganisation,
  recordInactivityWarning,
  markOrganisationDormant,
  reactivateFromDormancy,
  processFoundationInactivityJobs,
  getOrganisationDormancyDiagnostic,
  unpublishOrganisationPublicSites,
  deliverInactivityNotices,
  warningJobKey,
  dormantJobKey,
  FIRST_WARNING_MONTHS,
  FINAL_WARNING_MONTHS,
  DORMANT_MONTHS,
  DATA_PRESERVE_DAYS,
};
