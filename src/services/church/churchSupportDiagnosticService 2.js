"use strict";

/**
 * Redacted BlessBoard support diagnostic summary for platform administrators.
 * Aggregates existing services — no secrets, no member PII, no DB edit actions, no impersonation.
 */

const organizationsRepo = require("../../db/pg/church/organizationsRepo");
const auditLogsRepo = require("../../db/pg/church/auditLogsRepo");
const { getOrganisationPackageDiagnostic } = require("./churchEntitlementService");
const churchBackgroundJobStatusService = require("./churchBackgroundJobStatusService");
const { deploymentLabel } = require("./churchProductionDiagnostics");
const { latestChurchSchemaMigration } = require("../../db/pg/ensureChurchSchema");

const FAILED_JOB_STATUSES = new Set(["failed", "partially_failed", "error"]);
const RECENT_FAILED_JOB_LIMIT = 10;
const RECENT_TENANT_ERROR_AUDIT_LIMIT = 15;

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?:\+?\d[\d\s().-]{7,}\d)/g;

function redactEmail(value) {
  const email = String(value || "").trim();
  const at = email.indexOf("@");
  if (at < 1) return "[redacted-email]";
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const keep = local.slice(0, Math.min(2, local.length));
  return `${keep}***@${domain}`;
}

function redactPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 4) return "[redacted-phone]";
  return `***${digits.slice(-4)}`;
}

function redactText(value) {
  if (value == null) return null;
  let text = String(value);
  text = text.replace(EMAIL_RE, (m) => redactEmail(m));
  text = text.replace(PHONE_RE, (m) => redactPhone(m));
  return text;
}

function isoOrNull(value) {
  if (!value) return null;
  try {
    return new Date(value).toISOString();
  } catch {
    return null;
  }
}

function summarizeMeter(meter) {
  if (!meter) return null;
  return {
    used: meter.used,
    limit: meter.limit,
    display: meter.display || null,
    status: meter.status || meter.state || null,
    warningBand: meter.warningBand != null ? meter.warningBand : null,
    enforced: Boolean(meter.enforced),
  };
}

async function loadBranchLifecycleSummary(db, organizationId) {
  try {
    const r = await db.query(
      `SELECT
         COUNT(*)::int AS total_branches,
         COUNT(*) FILTER (WHERE status = 'active')::int AS active_branches,
         COUNT(*) FILTER (WHERE status = 'suspended')::int AS suspended_branches,
         COUNT(*) FILTER (WHERE status = 'archived')::int AS archived_branches,
         COUNT(*) FILTER (WHERE COALESCE(lifecycle_phase, '') = 'draft')::int AS lifecycle_draft,
         COUNT(*) FILTER (WHERE COALESCE(lifecycle_phase, '') = 'ready')::int AS lifecycle_ready,
         COUNT(*) FILTER (WHERE COALESCE(lifecycle_phase, '') = 'active')::int AS lifecycle_active,
         COUNT(*) FILTER (WHERE COALESCE(lifecycle_phase, '') = 'temporarily_inactive')::int AS lifecycle_temporarily_inactive,
         COUNT(*) FILTER (WHERE COALESCE(lifecycle_phase, '') = 'archived')::int AS lifecycle_archived,
         COUNT(*) FILTER (WHERE COALESCE(lifecycle_phase, '') = 'closed')::int AS lifecycle_closed
       FROM public.church_branches
       WHERE organization_id = $1`,
      [organizationId]
    );
    const row = r.rows[0] || {};
    return {
      totalBranches: row.total_branches || 0,
      byOperationalStatus: {
        active: row.active_branches || 0,
        suspended: row.suspended_branches || 0,
        archived: row.archived_branches || 0,
      },
      byLifecyclePhase: {
        draft: row.lifecycle_draft || 0,
        ready: row.lifecycle_ready || 0,
        active: row.lifecycle_active || 0,
        temporarily_inactive: row.lifecycle_temporarily_inactive || 0,
        archived: row.lifecycle_archived || 0,
        closed: row.lifecycle_closed || 0,
      },
    };
  } catch {
    return {
      totalBranches: null,
      byOperationalStatus: null,
      byLifecyclePhase: null,
      unavailable: true,
    };
  }
}

async function loadRecentFailedJobs(db, organizationId) {
  try {
    const listed = await churchBackgroundJobStatusService.listBackgroundJobs(db, {
      organization_id: organizationId,
      limit: 50,
      page: 1,
    });
    return (listed.jobs || [])
      .filter((j) => FAILED_JOB_STATUSES.has(String(j.status || "").toLowerCase()))
      .slice(0, RECENT_FAILED_JOB_LIMIT)
      .map((j) => ({
        ref: j.ref,
        jobType: j.jobType,
        jobTypeLabel: j.jobTypeLabel,
        status: j.status,
        finishedAt: isoOrNull(j.finishedAt),
        attemptCount: j.attemptCount,
        errorSummary: redactText(j.errorSummary),
        sourceNote: j.sourceNote || null,
      }));
  } catch {
    return [];
  }
}

async function loadRecentTenantLinkedErrors(db, organizationId) {
  // No dedicated application error store — surface redacted audit/job-adjacent failure signals.
  try {
    const r = await db.query(
      `SELECT action, entity_type, entity_id, target_label, created_at, metadata_json
       FROM public.church_audit_logs
       WHERE organization_id = $1
         AND (
           action LIKE '%_failed'
           OR action LIKE '%_blocked'
           OR action LIKE '%quota%'
           OR action LIKE '%error%'
           OR action LIKE 'platform_background_job_%'
         )
       ORDER BY created_at DESC
       LIMIT $2`,
      [organizationId, RECENT_TENANT_ERROR_AUDIT_LIMIT]
    );
    return r.rows.map((row) => {
      const meta = row.metadata_json && typeof row.metadata_json === "object" ? row.metadata_json : {};
      return {
        action: row.action,
        entityType: row.entity_type || null,
        entityId: row.entity_id != null ? Number(row.entity_id) : null,
        targetLabel: redactText(row.target_label),
        createdAt: isoOrNull(row.created_at),
        result: meta.result != null ? redactText(String(meta.result)) : null,
        reasonCode: meta.reason_code || meta.code || null,
      };
    });
  } catch {
    return {
      unavailable: true,
      note: "Tenant-linked application error stream is not supported yet; showing none.",
      items: [],
    };
  }
}

function buildCustomDomainStatus(packageDiagnostic) {
  const entitled =
    packageDiagnostic &&
    packageDiagnostic.sampleEntitlements &&
    packageDiagnostic.sampleEntitlements["domains.custom"] === true;
  return {
    supported: false,
    entitlementEnabled: Boolean(entitled),
    status: "not_implemented",
    note: "Custom domains are not product-supported yet. Organisations use BlessBoard host slugs.",
  };
}

function buildStorageHealth(packageDiagnostic, orgRow) {
  const usage = packageDiagnostic && packageDiagnostic.usage;
  const storageMeter = usage && usage.meters ? usage.meters.storage : null;
  return {
    kind: "attachment_quota",
    note: "Attachment storage quota only — not filesystem or object-store infrastructure health.",
    bytesUsed: usage ? usage.storageBytesUsed : orgRow && orgRow.storage_bytes_used != null
      ? Number(orgRow.storage_bytes_used)
      : null,
    reconciledAt: orgRow && orgRow.storage_bytes_reconciled_at
      ? isoOrNull(orgRow.storage_bytes_reconciled_at)
      : null,
    meter: summarizeMeter(storageMeter),
  };
}

function buildUsageQuotaSummary(packageDiagnostic) {
  const usage = packageDiagnostic && packageDiagnostic.usage;
  if (!usage) {
    return { unavailable: true, meters: null, warnings: [] };
  }
  const meters = usage.meters || {};
  return {
    unavailable: false,
    usageMonthKey: usage.usageMonthKey || null,
    activeBranches: usage.activeBranches,
    activeMembers: usage.activeMembers,
    privilegedAccounts: usage.privilegedAccounts,
    meters: {
      branches: summarizeMeter(meters.branches),
      members: summarizeMeter(meters.members),
      admins: summarizeMeter(meters.admins),
      storage: summarizeMeter(meters.storage),
      externalEmails: summarizeMeter(meters.externalEmails),
      scheduledReports: summarizeMeter(meters.scheduledReports),
    },
    warningCount: Array.isArray(usage.quotaWarnings) ? usage.quotaWarnings.length : 0,
    blocked: Boolean(usage.blocked),
  };
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @param {{ platformAdminId?: number|null, auditAccess?: boolean }} [opts]
 */
async function buildOrganisationSupportDiagnostic(pool, organizationId, opts = {}) {
  const started = Date.now();
  const id = Number(organizationId);
  if (!Number.isFinite(id) || id <= 0) {
    const err = new Error("Invalid organisation id.");
    err.code = "VALIDATION";
    throw err;
  }

  const org = await organizationsRepo.findOrganizationById(pool, id);
  if (!org) {
    const err = new Error("Organisation not found.");
    err.code = "NOT_FOUND";
    throw err;
  }

  const [
    packageDiagnostic,
    usageCounts,
    adminCounts,
    branchLifecycle,
    failedJobs,
    tenantErrors,
  ] = await Promise.all([
    getOrganisationPackageDiagnostic(pool, id).catch(() => null),
    organizationsRepo.getOrganizationUsageCounts(pool, id).catch(() => null),
    organizationsRepo.getOrganizationAdminCounts(pool, id).catch(() => null),
    loadBranchLifecycleSummary(pool, id),
    loadRecentFailedJobs(pool, id),
    loadRecentTenantLinkedErrors(pool, id),
  ]);

  const pkg = packageDiagnostic || {};
  const summary = {
    generatedAt: new Date().toISOString(),
    elapsedMs: null,
    redacted: true,
    organisation: {
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status,
      platformTenantId: org.platform_tenant_id || null,
      statusReason: org.status_reason ? redactText(String(org.status_reason).slice(0, 200)) : null,
      suspendedAt: isoOrNull(org.suspended_at),
      dormantAt: isoOrNull(org.dormant_at),
      archivedAt: isoOrNull(org.archived_at),
    },
    package: {
      code: (pkg.currentPackage && pkg.currentPackage.code) || org.plan_code || null,
      label: (pkg.currentPackage && pkg.currentPackage.label) || null,
      planStatus: pkg.planStatus || org.plan_status || null,
      storedPlanCode: pkg.storedPlanCode || org.plan_code || null,
      entitlementSource: pkg.entitlementSource || null,
      fallback: {
        used: Boolean(pkg.fallback && pkg.fallback.used),
        reason: (pkg.fallback && pkg.fallback.reason) || null,
      },
      defaultPackageCode: pkg.defaultPackageCode || "foundation",
    },
    branches: {
      activeCount:
        packageDiagnostic && packageDiagnostic.usage
          ? packageDiagnostic.usage.activeBranches
          : branchLifecycle.byOperationalStatus
            ? branchLifecycle.byOperationalStatus.active
            : null,
      lifecycle: branchLifecycle,
    },
    members: {
      activeVerifiedCount: usageCounts ? usageCounts.active_members_count : null,
      totalCount: usageCounts ? usageCounts.total_members_count : null,
      note: "Counts only — no member records are included.",
    },
    administrators: {
      hqTotal: adminCounts ? adminCounts.hq_admin_count : null,
      hqActive: adminCounts ? adminCounts.active_hq_admin_count : null,
      branchTotal: adminCounts ? adminCounts.branch_admin_count : null,
      branchActive: adminCounts ? adminCounts.active_branch_admin_count : null,
      privilegedSeatTotal:
        packageDiagnostic && packageDiagnostic.usage
          ? packageDiagnostic.usage.privilegedAccounts
          : null,
      note: "Account counts only — emails and phones are omitted.",
    },
    usageAndQuota: buildUsageQuotaSummary(packageDiagnostic),
    recentFailedJobs: failedJobs,
    recentTenantLinkedErrors: Array.isArray(tenantErrors)
      ? { unavailable: false, items: tenantErrors }
      : tenantErrors,
    application: {
      version: require("../../../package.json").version || null,
      deploymentLabel: deploymentLabel(),
      latestChurchMigration: latestChurchSchemaMigration(),
      nodeEnv: process.env.NODE_ENV || null,
    },
    customDomain: buildCustomDomainStatus(packageDiagnostic),
    storageHealth: buildStorageHealth(packageDiagnostic, org),
  };

  summary.elapsedMs = Date.now() - started;

  if (opts.auditAccess !== false) {
    await auditLogsRepo.insertAuditLog(pool, {
      organization_id: id,
      branch_id: null,
      actor_type: "platform_admin",
      actor_id: opts.platformAdminId || null,
      action: "platform_support_diagnostic_viewed",
      entity_type: "organization",
      entity_id: id,
      target_label: org.slug || String(id),
      metadata_json: {
        redacted: true,
        elapsed_ms: summary.elapsedMs,
        failed_jobs: failedJobs.length,
      },
    });
  }

  return summary;
}

function formatDiagnosticAsText(summary) {
  const lines = [];
  const push = (k, v) => lines.push(`${k}: ${v == null || v === "" ? "—" : v}`);
  lines.push("BlessBoard support diagnostic (redacted)");
  lines.push(`Generated at: ${summary.generatedAt}`);
  lines.push("");
  lines.push("[Organisation]");
  push("id", summary.organisation.id);
  push("name", summary.organisation.name);
  push("slug", summary.organisation.slug);
  push("status", summary.organisation.status);
  push("platform_tenant_id", summary.organisation.platformTenantId);
  lines.push("");
  lines.push("[Package]");
  push("code", summary.package.code);
  push("label", summary.package.label);
  push("plan_status", summary.package.planStatus);
  push("stored_plan_code", summary.package.storedPlanCode);
  push("entitlement_source", summary.package.entitlementSource);
  push("fallback_used", summary.package.fallback.used);
  push("fallback_reason", summary.package.fallback.reason);
  lines.push("");
  lines.push("[Branches]");
  push("active_count", summary.branches.activeCount);
  if (summary.branches.lifecycle && summary.branches.lifecycle.byOperationalStatus) {
    const s = summary.branches.lifecycle.byOperationalStatus;
    push("status_active", s.active);
    push("status_suspended", s.suspended);
    push("status_archived", s.archived);
  }
  if (summary.branches.lifecycle && summary.branches.lifecycle.byLifecyclePhase) {
    const p = summary.branches.lifecycle.byLifecyclePhase;
    Object.keys(p).forEach((k) => push(`lifecycle_${k}`, p[k]));
  }
  lines.push("");
  lines.push("[Members]");
  push("active_verified", summary.members.activeVerifiedCount);
  push("total", summary.members.totalCount);
  lines.push("");
  lines.push("[Administrators]");
  push("hq_active", summary.administrators.hqActive);
  push("branch_active", summary.administrators.branchActive);
  push("privileged_seats", summary.administrators.privilegedSeatTotal);
  lines.push("");
  lines.push("[Usage / quota]");
  if (summary.usageAndQuota.unavailable) {
    lines.push("unavailable: true");
  } else {
    const meters = summary.usageAndQuota.meters || {};
    Object.keys(meters).forEach((key) => {
      const m = meters[key];
      push(key, m && m.display ? m.display : m ? `${m.used} / ${m.limit}` : "—");
    });
    push("warning_count", summary.usageAndQuota.warningCount);
    push("blocked", summary.usageAndQuota.blocked);
  }
  lines.push("");
  lines.push("[Recent failed jobs]");
  if (!(summary.recentFailedJobs || []).length) {
    lines.push("(none)");
  } else {
    summary.recentFailedJobs.forEach((j) => {
      lines.push(`- ${j.ref} ${j.status} ${j.errorSummary || ""}`.trim());
    });
  }
  lines.push("");
  lines.push("[Recent tenant-linked errors]");
  const errBlock = summary.recentTenantLinkedErrors || {};
  if (errBlock.unavailable) {
    lines.push(errBlock.note || "unavailable");
  } else if (!(errBlock.items || []).length) {
    lines.push("(none)");
  } else {
    errBlock.items.forEach((e) => {
      lines.push(`- ${e.createdAt || ""} ${e.action} ${e.reasonCode || ""}`.trim());
    });
  }
  lines.push("");
  lines.push("[Application]");
  push("version", summary.application.version);
  push("deployment_label", summary.application.deploymentLabel);
  push("latest_migration", summary.application.latestChurchMigration);
  push("node_env", summary.application.nodeEnv);
  lines.push("");
  lines.push("[Custom domain]");
  push("status", summary.customDomain.status);
  push("note", summary.customDomain.note);
  lines.push("");
  lines.push("[Storage health]");
  push("kind", summary.storageHealth.kind);
  push("bytes_used", summary.storageHealth.bytesUsed);
  push("reconciled_at", summary.storageHealth.reconciledAt);
  push("meter", summary.storageHealth.meter && summary.storageHealth.meter.display);
  push("note", summary.storageHealth.note);
  lines.push("");
  push("elapsed_ms", summary.elapsedMs);
  return lines.join("\n");
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} organizationId
 * @param {{ format: 'json'|'txt', platformAdminId?: number|null }} opts
 */
async function exportOrganisationSupportDiagnostic(pool, organizationId, opts = {}) {
  const format = String(opts.format || "json").toLowerCase() === "txt" ? "txt" : "json";
  const summary = await buildOrganisationSupportDiagnostic(pool, organizationId, {
    platformAdminId: opts.platformAdminId,
    auditAccess: false,
  });

  await auditLogsRepo.insertAuditLog(pool, {
    organization_id: Number(organizationId),
    branch_id: null,
    actor_type: "platform_admin",
    actor_id: opts.platformAdminId || null,
    action: "platform_support_diagnostic_exported",
    entity_type: "organization",
    entity_id: Number(organizationId),
    target_label: summary.organisation.slug || String(organizationId),
    metadata_json: {
      format,
      redacted: true,
      elapsed_ms: summary.elapsedMs,
    },
  });

  if (format === "txt") {
    return {
      format,
      contentType: "text/plain; charset=utf-8",
      filename: `blessboard-support-diagnostic-org-${organizationId}.txt`,
      body: formatDiagnosticAsText(summary),
      summary,
    };
  }

  return {
    format: "json",
    contentType: "application/json; charset=utf-8",
    filename: `blessboard-support-diagnostic-org-${organizationId}.json`,
    body: JSON.stringify(summary, null, 2),
    summary,
  };
}

module.exports = {
  buildOrganisationSupportDiagnostic,
  exportOrganisationSupportDiagnostic,
  formatDiagnosticAsText,
  redactEmail,
  redactPhone,
  redactText,
  RECENT_FAILED_JOB_LIMIT,
};
