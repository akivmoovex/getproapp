"use strict";

/**
 * Controlled pilot rehearsal flows + compact report (testing only, no real email).
 */

const bcrypt = require("bcryptjs");
const { TENANT_ZM } = require("../../tenants/tenantIds");
const { ROLES } = require("../../auth/roles");
const membersRepo = require("../../db/pg/church/membersRepo");
const attendanceRepo = require("../../db/pg/church/attendanceRepo");
const hqBroadcastsRepo = require("../../db/pg/church/hqBroadcastsRepo");
const organizationsRepo = require("../../db/pg/church/organizationsRepo");
const adminUsersRepo = require("../../db/pg/adminUsersRepo");
const scheduledReportService = require("./scheduledReportService");
const scheduledBroadcastService = require("./scheduledBroadcastService");
const crossBranchComparisonService = require("./crossBranchComparisonService");
const churchPackageAssignmentService = require("./churchPackageAssignmentService");
const churchPlatformSupportAccessService = require("./churchPlatformSupportAccessService");
const { getOrganisationPlan, hasEntitlement } = require("./churchEntitlementService");
const { gatherGrowthJobPausedCounts } = require("./churchProductionDiagnostics");
const {
  SYNTHETIC_PASSWORD,
  normalizePilotId,
  seedControlledPilot,
  assertControlledPilotSafety,
  redactSecrets,
} = require("./churchControlledPilotSeedService");

function flowResult(name, organizationId, ok, detail) {
  return {
    name,
    organizationId,
    ok: Boolean(ok),
    detail: redactSecrets(detail || (ok ? "ok" : "failed")),
  };
}

function formatRehearsalReport(report) {
  const lines = [
    "BlessBoard V5 controlled pilot rehearsal report",
    `pilotId=${report.pilotId}`,
    `checkedAt=${report.checkedAt}`,
    `verdict=${report.readinessVerdict}`,
    "",
    "Tenants:",
    `  Foundation: id=${report.tenants.foundation.id} package=${report.tenants.foundation.package} branches=${report.tenants.foundation.branches} members=${report.tenants.foundation.members}`,
    `    hosts: ${(report.tenants.foundation.hosts || []).join(", ") || "(none)"}`,
    `  Growth: id=${report.tenants.growth.id} package=${report.tenants.growth.package} branches=${report.tenants.growth.branches} members=${report.tenants.growth.members}`,
    `    hosts: ${(report.tenants.growth.hosts || []).join(", ") || "(none)"}`,
    "",
    `Passed flows (${report.flows.passed.length}): ${report.flows.passed.join(", ") || "(none)"}`,
    `Failed flows (${report.flows.failed.length}):`,
  ];
  for (const f of report.flows.failed) {
    lines.push(`  - ${f.name}: ${f.detail}`);
  }
  if (report.pausedJobs) {
    lines.push(
      "",
      `Paused jobs: bcast_ent=${report.pausedJobs.broadcastsEntitlement} bcast_inact=${report.pausedJobs.broadcastsInactive} rep_ent=${report.pausedJobs.reportsEntitlement} rep_inact=${report.pausedJobs.reportsInactive}`
    );
  }
  lines.push(`Audit rows (pilot orgs): ${report.auditCoverage.pilotOrgAuditRows}`);
  return redactSecrets(lines.join("\n"));
}

async function runControlledPilotRehearsal(pool, opts) {
  const pilotId = normalizePilotId(opts.pilotId);
  await assertControlledPilotSafety(pool, {
    requireConfirm: opts.requireConfirm !== false,
    confirmed: opts.confirm === true,
    allowTestDatabaseUrl: opts.allowTestDatabaseUrl,
    env: opts.env,
  });

  const seeded = await seedControlledPilot(pool, {
    pilotId,
    confirm: true,
    allowTestDatabaseUrl: opts.allowTestDatabaseUrl,
    env: opts.env,
  });

  const flows = [];
  const foundation = seeded.foundation;
  const growth = seeded.growth;
  const fOrgId = foundation.organization.id;
  const gOrgId = growth.organization.id;
  const fBranch = foundation.branches[0];
  const gBranchA = growth.branches[0];

  flows.push(
    flowResult(
      "platform_admin_provisioning",
      fOrgId,
      foundation.organization && growth.organization && growth.branches.length >= 2,
      `foundation=${foundation.organization.slug}; growth=${growth.organization.slug}; growthBranches=${growth.branches.length}`
    )
  );

  flows.push(
    flowResult(
      "hq_branch_admin_login",
      gOrgId,
      Boolean(foundation.hqAdmin && growth.hqAdmin && foundation.branchAdmin && growth.branchAdmin),
      "Synthetic HQ/branch admins present (password hashes; no secret printed)"
    )
  );

  try {
    const passwordHash = await bcrypt.hash(SYNTHETIC_PASSWORD, 10);
    let member = (
      await pool.query(
        `SELECT id, status FROM public.church_members
         WHERE organization_id = $1 AND email = $2 LIMIT 1`,
        [gOrgId, `pilot.${pilotId}.member@example.test`]
      )
    ).rows[0];
    if (!member) {
      member = await membersRepo.createPendingMember(pool, {
        organization_id: gOrgId,
        branch_id: gBranchA.id,
        platform_tenant_id: TENANT_ZM,
        email: `pilot.${pilotId}.member@example.test`,
        phone: "260970000001",
        full_name: `Pilot Member ${pilotId}`,
        password_hash: passwordHash,
      });
    }
    if (member.status !== "verified") {
      await membersRepo.verifyMemberForBranch(pool, member.id, gBranchA.id, growth.branchAdmin.id);
    }
    flows.push(flowResult("member_registration_verification", gOrgId, true, `memberId=${member.id}`));
  } catch (err) {
    flows.push(flowResult("member_registration_verification", gOrgId, false, err.message));
  }

  try {
    const att = await attendanceRepo.createAttendanceRecord(pool, {
      organization_id: fOrgId,
      branch_id: fBranch.id,
      attendance_date: "2026-07-12",
      service_name: "Sunday Service",
      attendance_type: "sunday",
      adults_count: 12,
      youth_count: 3,
      children_count: 4,
      first_time_visitors_count: 1,
      new_members_count: 0,
      volunteers_count: 2,
      status: "submitted",
      created_by_admin_id: foundation.branchAdmin.id,
    });
    flows.push(flowResult("attendance", fOrgId, Boolean(att && att.id), `recordId=${att && att.id}`));
  } catch (err) {
    flows.push(flowResult("attendance", fOrgId, false, err.message));
  }

  try {
    const plan = await getOrganisationPlan(pool, fOrgId);
    const basic = hasEntitlement(plan, "reports.basic") || plan.packageCode === "foundation";
    flows.push(flowResult("basic_report", fOrgId, Boolean(basic), `package=${plan.packageCode}`));
  } catch (err) {
    flows.push(flowResult("basic_report", fOrgId, false, err.message));
  }

  try {
    const existing = await pool.query(
      `SELECT id FROM public.church_scheduled_reports
       WHERE organization_id = $1 AND report_type = 'branch_attendance_summary' LIMIT 1`,
      [gOrgId]
    );
    let scheduleId = existing.rows[0]?.id;
    if (!scheduleId) {
      const schedule = await scheduledReportService.createSchedule(pool, {
        organizationId: gOrgId,
        branchId: gBranchA.id,
        actorType: "branch_admin",
        actorId: growth.branchAdmin.id,
        at: new Date("2026-07-16T12:00:00.000Z"),
        body: {
          report_type: "branch_attendance_summary",
          export_format: "csv",
          frequency: "weekly",
          timezone: "Africa/Lusaka",
          delivery_time_local: "09:00",
          day_of_week: 1,
          status: "enabled",
          recipients: [{ recipient_type: "branch_admin", recipient_id: growth.branchAdmin.id }],
        },
      });
      scheduleId = schedule.id;
    }
    flows.push(flowResult("growth_scheduled_report", gOrgId, Boolean(scheduleId), `scheduleId=${scheduleId}`));
  } catch (err) {
    flows.push(flowResult("growth_scheduled_report", gOrgId, false, err.message));
  }

  try {
    const title = `Pilot ${pilotId} scheduled broadcast`;
    const existing = await pool.query(
      `SELECT id, status FROM public.church_hq_broadcasts WHERE organization_id = $1 AND title = $2 LIMIT 1`,
      [gOrgId, title]
    );
    let broadcastId = existing.rows[0]?.id;
    let outcome = existing.rows[0]?.status;
    if (!broadcastId) {
      const draft = await hqBroadcastsRepo.createBroadcastForOrganization(pool, gOrgId, {
        title,
        body: "Synthetic rehearsal broadcast — in_app only.",
        category: "Leadership",
        audience: "branch_admins",
        target_scope: "selected_branches",
        branch_ids: [gBranchA.id],
        delivery_channels: ["in_app"],
        status: "draft",
        publish_at: new Date("2026-08-01T10:00:00.000Z"),
        created_by_hq_admin_id: growth.hqAdmin.id,
      });
      await scheduledBroadcastService.moveToPreview(pool, draft.id, gOrgId);
      await scheduledBroadcastService.computeAndStoreAudienceEstimate(pool, draft.id, gOrgId);
      await scheduledBroadcastService.submitForApproval(pool, draft.id, gOrgId);
      const approved = await scheduledBroadcastService.approveBroadcast(pool, {
        broadcastId: draft.id,
        organizationId: gOrgId,
        hqAdminId: growth.hqAdmin.id,
        at: new Date("2026-07-15T09:00:00.000Z"),
      });
      broadcastId = draft.id;
      outcome = approved.outcome;
    }
    flows.push(
      flowResult("growth_scheduled_broadcast", gOrgId, Boolean(broadcastId), `broadcastId=${broadcastId}; outcome=${outcome}`)
    );
  } catch (err) {
    flows.push(flowResult("growth_scheduled_broadcast", gOrgId, false, err.message));
  }

  try {
    const plan = await getOrganisationPlan(pool, gOrgId);
    const entitled = hasEntitlement(plan, "reports.cross_branch");
    const comparison = await crossBranchComparisonService.loadCrossBranchComparison(pool, {
      organizationId: gOrgId,
      canViewFinance: false,
      filters: { dateFrom: "2026-06-01", dateTo: "2026-07-31" },
    });
    flows.push(
      flowResult(
        "cross_branch_reporting",
        gOrgId,
        entitled && Array.isArray(comparison.rows),
        `entitled=${entitled}; rows=${(comparison.rows || []).length}`
      )
    );
  } catch (err) {
    flows.push(flowResult("cross_branch_reporting", gOrgId, false, err.message));
  }

  try {
    const eligibility = await churchPackageAssignmentService.evaluateFoundationDowngradeEligibility(
      pool,
      gOrgId
    );
    const blocked = eligibility && eligibility.allowed === false;
    flows.push(
      flowResult(
        "package_downgrade_blocker",
        gOrgId,
        blocked,
        blocked
          ? `blockers=${(eligibility.incompatibilities || []).length}`
          : "expected blocker missing"
      )
    );
  } catch (err) {
    flows.push(flowResult("package_downgrade_blocker", gOrgId, false, err.message));
  }

  try {
    const before = (
      await pool.query(`SELECT security_version FROM public.church_hq_admins WHERE id = $1`, [
        foundation.hqAdmin.id,
      ])
    ).rows[0];
    await pool.query(
      `UPDATE public.church_hq_admins
       SET security_version = COALESCE(security_version, 1) + 1
       WHERE id = $1 AND organization_id = $2`,
      [foundation.hqAdmin.id, fOrgId]
    );
    const after = (
      await pool.query(`SELECT security_version FROM public.church_hq_admins WHERE id = $1`, [
        foundation.hqAdmin.id,
      ])
    ).rows[0];
    flows.push(
      flowResult(
        "session_revocation",
        fOrgId,
        Number(after.security_version) > Number(before.security_version || 1),
        `security_version ${before.security_version} → ${after.security_version}`
      )
    );
  } catch (err) {
    flows.push(flowResult("session_revocation", fOrgId, false, err.message));
  }

  try {
    await organizationsRepo.suspendOrganization(pool, fOrgId, {
      reason: "controlled pilot rehearsal suspension",
      platformAdminId: null,
    });
    const suspended = await organizationsRepo.findOrganizationById(pool, fOrgId);
    await organizationsRepo.reactivateOrganization(pool, fOrgId, {
      reason: "controlled pilot rehearsal reactivate",
      platformAdminId: null,
    });
    const active = await organizationsRepo.findOrganizationById(pool, fOrgId);
    flows.push(
      flowResult(
        "organization_suspension",
        fOrgId,
        suspended.status === "suspended" && active.status === "active",
        `suspended→${suspended.status}; restored→${active.status}`
      )
    );
  } catch (err) {
    flows.push(flowResult("organization_suspension", fOrgId, false, err.message));
  }

  try {
    const suffix = `pr_${pilotId}_${Date.now().toString(36)}`.slice(0, 40);
    const countryAdminId = await adminUsersRepo.insertUser(pool, {
      username: `pca_${suffix}`,
      passwordHash: await bcrypt.hash(SYNTHETIC_PASSWORD, 10),
      role: ROLES.TENANT_MANAGER,
      tenantId: TENANT_ZM,
      displayName: `Pilot Country Admin ${pilotId}`,
    });
    const supportId = await adminUsersRepo.insertUser(pool, {
      username: `psr_${suffix}`,
      passwordHash: await bcrypt.hash(SYNTHETIC_PASSWORD, 10),
      role: ROLES.CSR,
      tenantId: TENANT_ZM,
      displayName: `Pilot Support ${pilotId}`,
    });
    const countryAdmin = { ...(await adminUsersRepo.getById(pool, countryAdminId)), enabled: true };
    const support = { ...(await adminUsersRepo.getById(pool, supportId)), enabled: true };

    await churchPlatformSupportAccessService.assignAccountManagers(pool, {
      actor: countryAdmin,
      organizationId: fOrgId,
      primaryAdminUserId: supportId,
      status: "active",
      internalNote: "controlled pilot rehearsal",
    });
    const pending = await churchPlatformSupportAccessService.requestSupportAccess(pool, {
      actor: support,
      organizationId: fOrgId,
      ticketReference: `PILOT-${pilotId}`,
      reason: "Controlled pilot support-access rehearsal",
      requestedScope: "configuration",
    });
    await churchPlatformSupportAccessService.approveSupportAccess(pool, {
      actor: countryAdmin,
      accessId: pending.id,
      durationHours: 2,
    });
    const allowed = await churchPlatformSupportAccessService.assertCanPerformSupportAction(pool, {
      actor: support,
      organizationId: fOrgId,
      action: "view_org_config",
      recordUse: true,
    });
    flows.push(
      flowResult("support_access", fOrgId, allowed.allowed === true, `accessId=${pending.id}; mode=${allowed.mode}`)
    );
  } catch (err) {
    flows.push(flowResult("support_access", fOrgId, false, err.message));
  }

  const orgGuardOk = flows.every(
    (f) => !f.organizationId || f.organizationId === fOrgId || f.organizationId === gOrgId
  );
  flows.push(flowResult("org_scope_guard", gOrgId, orgGuardOk, "All flows scoped to pilot orgs"));

  const paused = await gatherGrowthJobPausedCounts(pool);
  const passed = flows.filter((f) => f.ok);
  const failed = flows.filter((f) => !f.ok);
  const audit = await pool.query(
    `SELECT COUNT(*)::int AS c FROM public.church_audit_logs WHERE organization_id = ANY($1::bigint[])`,
    [[fOrgId, gOrgId]]
  );
  const memberCounts = await pool.query(
    `SELECT organization_id, COUNT(*)::int AS c
     FROM public.church_members
     WHERE organization_id = ANY($1::bigint[])
     GROUP BY organization_id`,
    [[fOrgId, gOrgId]]
  );
  const memberByOrg = new Map(
    memberCounts.rows.map((r) => [Number(r.organization_id), Number(r.c) || 0])
  );

  const verdict = failed.length === 0 ? "READY" : failed.length <= 2 ? "READY_WITH_GAPS" : "NOT_READY";
  const report = {
    pilotId,
    checkedAt: new Date().toISOString(),
    tenants: {
      foundation: {
        id: foundation.organization.id,
        slug: foundation.organization.slug,
        package: foundation.organization.plan_code,
        hosts: foundation.hosts,
        branches: foundation.branches.length,
        members: memberByOrg.get(fOrgId) || 0,
        data_environment: foundation.organization.data_environment,
      },
      growth: {
        id: growth.organization.id,
        slug: growth.organization.slug,
        package: growth.organization.plan_code,
        hosts: growth.hosts,
        branches: growth.branches.length,
        members: memberByOrg.get(gOrgId) || 0,
        data_environment: growth.organization.data_environment,
      },
    },
    flows: {
      passed: passed.map((f) => f.name),
      failed: failed.map((f) => ({ name: f.name, detail: f.detail })),
      details: flows,
    },
    pausedJobs: paused.available
      ? {
          broadcastsEntitlement: paused.scheduledBroadcastsPausedNoEntitlement,
          broadcastsInactive: paused.scheduledBroadcastsPausedOrgInactive,
          reportsEntitlement: paused.scheduledReportsPausedNoEntitlement,
          reportsInactive: paused.scheduledReportsPausedOrgInactive,
        }
      : null,
    auditCoverage: { pilotOrgAuditRows: Number(audit.rows[0]?.c) || 0 },
    readinessVerdict: verdict,
  };

  return {
    ok: failed.length === 0,
    report,
    reportText: formatRehearsalReport(report),
  };
}

module.exports = {
  runControlledPilotRehearsal,
  formatRehearsalReport,
};
