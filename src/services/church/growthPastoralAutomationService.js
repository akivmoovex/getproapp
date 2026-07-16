"use strict";

const pastoralAutomationRepo = require("../../db/pg/church/pastoralAutomationRepo");
const pastoralCareRepo = require("../../db/pg/church/pastoralCareRepo");
const attendanceRulesRepo = require("../../db/pg/church/attendanceRulesRepo");
const branchAdminsRepo = require("../../db/pg/church/branchAdminsRepo");
const { getEntitlement } = require("./churchEntitlementService");
const { safePastoralNotificationSubject } = require("../../church/foundationPastoralNotification");

const AUTOMATION_ERRORS = Object.freeze({
  PACKAGE_REQUIRED: "PACKAGE_REQUIRED",
  NOT_FOUND: "NOT_FOUND",
  DUPLICATE: "DUPLICATE",
  PERMISSION_DENIED: "PERMISSION_DENIED",
  SUPERVISOR_REQUIRED: "SUPERVISOR_REQUIRED",
  INVALID_TRANSITION: "INVALID_TRANSITION",
  ALREADY_RUN: "ALREADY_RUN",
});

function makeError(code, message) {
  return Object.assign(new Error(message), { code });
}

function assertAdvancedCareAutomation(plan) {
  if (getEntitlement(plan, "care.automation") !== "advanced") {
    throw makeError(AUTOMATION_ERRORS.PACKAGE_REQUIRED, "Pastoral-care automation requires Growth.");
  }
}

function addHours(date, hours) {
  const d = new Date(date);
  d.setHours(d.getHours() + Number(hours || 0));
  return d;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + Number(days || 0));
  return d;
}

async function resolveMissedServiceThresholdWeeks(pool, branchId, settings) {
  if (settings.missed_service_threshold_weeks != null) {
    return Number(settings.missed_service_threshold_weeks);
  }
  const attendanceRules = await attendanceRulesRepo.getBranchRulesWithDefaults(pool, branchId);
  return attendanceRules.absence_threshold_weeks != null
    ? Number(attendanceRules.absence_threshold_weeks)
    : null;
}

/**
 * @param {import("pg").Pool} pool
 * @param {object} ctx
 * @param {object} plan
 * @param {{ at?: Date, runKey?: string }} [opts]
 */
async function runMissedServiceScan(pool, ctx, plan, opts = {}) {
  assertAdvancedCareAutomation(plan);
  const settings = await pastoralAutomationRepo.getSettingsWithDefaults(pool, ctx.branch_id);
  if (!settings.enabled) {
    return { skipped: true, reason: "Automation disabled for branch." };
  }

  const thresholdWeeks = await resolveMissedServiceThresholdWeeks(pool, ctx.branch_id, settings);
  if (!thresholdWeeks || thresholdWeeks <= 0) {
    return { skipped: true, reason: "Missed-service threshold not configured." };
  }

  const at = opts.at instanceof Date ? opts.at : new Date();
  const runKey = opts.runKey || `missed_service:${at.toISOString().slice(0, 10)}`;
  const run = await pastoralAutomationRepo.beginRun(pool, {
    organization_id: ctx.organization_id,
    branch_id: ctx.branch_id,
    run_key: runKey,
    job_type: "missed_service_scan",
  });
  if (!run) {
    const existing = await pastoralAutomationRepo.findRunByKey(pool, ctx.branch_id, runKey);
    return { skipped: true, reason: "Job already executed.", run: existing, duplicateRun: true };
  }

  const flagged = await attendanceRulesRepo.listMembersOverAbsenceThreshold(
    pool,
    ctx.branch_id,
    thresholdWeeks
  );

  const stats = { flagged: flagged.length, work_items_created: 0, cases_created: 0, duplicates: 0 };
  const created = [];

  for (const member of flagged) {
    const existingCase = await pastoralCareRepo.findOpenPastoralCaseForMember(
      pool,
      ctx.branch_id,
      member.id
    );
    if (existingCase) {
      stats.duplicates += 1;
      continue;
    }

    const existingWork = await pastoralAutomationRepo.findActiveWorkItemForMember(
      pool,
      ctx.branch_id,
      member.id,
      "missed_service"
    );
    if (existingWork) {
      stats.duplicates += 1;
      continue;
    }

    const riskLevel = member.last_check_in_at ? "standard" : "high";
    const summary = member.last_check_in_at
      ? `Missed service: no check-in for ${thresholdWeeks}+ weeks (last: ${new Date(member.last_check_in_at).toISOString().slice(0, 10)}).`
      : `Missed service: no recorded check-in; threshold ${thresholdWeeks} weeks exceeded.`;

    const workItem = await pastoralAutomationRepo.insertWorkItem(pool, {
      organization_id: ctx.organization_id,
      branch_id: ctx.branch_id,
      member_id: member.id,
      trigger_type: "missed_service",
      status: settings.auto_create_cases ? "converted" : "pending",
      risk_level: riskLevel,
      recommendation_summary: summary,
      confidentiality_level: riskLevel === "high" ? "restricted" : "standard",
      automation_run_id: run.id,
    });
    if (!workItem) {
      stats.duplicates += 1;
      continue;
    }
    stats.work_items_created += 1;

    if (settings.auto_create_cases) {
      const pastoralCase = await createAutomatedCase(pool, ctx, settings, {
        member_id: member.id,
        work_item_id: workItem.id,
        risk_level: riskLevel,
        summary,
        trigger_type: "missed_service",
        at,
      });
      await pastoralAutomationRepo.updateWorkItem(pool, workItem.id, {
        status: "converted",
        pastoral_case_id: pastoralCase.id,
      });
      stats.cases_created += 1;
      created.push({ workItem, pastoralCase });
    } else {
      created.push({ workItem, pastoralCase: null });
    }
  }

  await pastoralAutomationRepo.completeRun(pool, run.id, stats);
  return { run, stats, created, duplicateRun: false };
}

async function createAutomatedCase(pool, ctx, settings, data) {
  const at = data.at instanceof Date ? data.at : new Date();
  const status = data.risk_level === "high" ? "pending_supervisor_ack" : "open";
  const r = await pool.query(
    `INSERT INTO public.church_pastoral_cases (
       organization_id, branch_id, member_id, case_type, title, summary, status,
       assigned_admin_id, due_date, next_action, opened_by_admin_id,
       automation_work_item_id, trigger_type, risk_level, confidentiality_level,
       first_response_due_at, follow_up_due_at, opened_by_automation
     ) VALUES ($1, $2, $3, 'pastoral_care', $4, $5, $6, NULL, NULL,
       'Review automated pastoral recommendation and contact member.',
       NULL, $7, $8, $9, $10, $11, $12, true)
     RETURNING *`,
    [
      ctx.organization_id,
      ctx.branch_id,
      data.member_id,
      "Pastoral follow-up recommended",
      data.summary,
      status,
      data.work_item_id,
      data.trigger_type || "missed_service",
      data.risk_level || "standard",
      data.risk_level === "high" ? "restricted" : "standard",
      addHours(at, settings.first_response_target_hours),
      addDays(at, settings.follow_up_target_days),
    ]
  );
  return r.rows[0];
}

async function acceptWorkItem(pool, ctx, plan, workItemId) {
  assertAdvancedCareAutomation(plan);
  const item = await pastoralAutomationRepo.findWorkItemByIdForBranch(pool, workItemId, ctx.branch_id);
  if (!item) throw makeError(AUTOMATION_ERRORS.NOT_FOUND, "Work item not found.");
  if (item.status !== "pending") {
    throw makeError(AUTOMATION_ERRORS.INVALID_TRANSITION, "Work item is no longer pending.");
  }
  const settings = await pastoralAutomationRepo.getSettingsWithDefaults(pool, ctx.branch_id);
  const duplicate = await pastoralCareRepo.findOpenPastoralCaseForMember(pool, ctx.branch_id, item.member_id);
  if (duplicate) throw makeError(AUTOMATION_ERRORS.DUPLICATE, "Member already has an open pastoral case.");

  const pastoralCase = await createAutomatedCase(pool, ctx, settings, {
    member_id: item.member_id,
    work_item_id: item.id,
    risk_level: item.risk_level,
    summary: item.recommendation_summary,
    trigger_type: item.trigger_type,
  });
  await pastoralAutomationRepo.updateWorkItem(pool, item.id, {
    status: "converted",
    pastoral_case_id: pastoralCase.id,
    accepted_by_admin_id: ctx.admin_id,
  });
  return { workItem: item, pastoralCase };
}

async function dismissWorkItem(pool, ctx, plan, workItemId) {
  assertAdvancedCareAutomation(plan);
  const item = await pastoralAutomationRepo.findWorkItemByIdForBranch(pool, workItemId, ctx.branch_id);
  if (!item) throw makeError(AUTOMATION_ERRORS.NOT_FOUND, "Work item not found.");
  const updated = await pastoralAutomationRepo.updateWorkItem(pool, item.id, {
    status: "dismissed",
    dismissed_by_admin_id: ctx.admin_id,
  });
  return updated;
}

async function supervisorAcknowledgeCase(pool, ctx, plan, caseId) {
  assertAdvancedCareAutomation(plan);
  if (!ctx.can_supervise_pastoral) {
    throw makeError(AUTOMATION_ERRORS.SUPERVISOR_REQUIRED, "Supervisor pastoral access required.");
  }
  const existing = await pastoralCareRepo.findPastoralCaseByIdForBranch(pool, caseId, ctx.branch_id);
  if (!existing) throw makeError(AUTOMATION_ERRORS.NOT_FOUND, "Pastoral case not found.");
  if (existing.status !== "pending_supervisor_ack") {
    throw makeError(AUTOMATION_ERRORS.INVALID_TRANSITION, "Case does not require supervisor acknowledgement.");
  }
  const r = await pool.query(
    `UPDATE public.church_pastoral_cases
     SET status = 'open',
         supervisor_acknowledged_at = now(),
         supervisor_acknowledged_by_admin_id = $1,
         updated_at = now()
     WHERE id = $2 AND branch_id = $3
     RETURNING *`,
    [ctx.admin_id, caseId, ctx.branch_id]
  );
  return r.rows[0];
}

async function reassignCase(pool, ctx, plan, caseId, assigneeId) {
  assertAdvancedCareAutomation(plan);
  const assignee = await branchAdminsRepo.findBranchAdminById(pool, assigneeId);
  if (
    !assignee ||
    Number(assignee.branch_id) !== Number(ctx.branch_id) ||
    assignee.status !== "active" ||
    !assignee.can_access_pastoral
  ) {
    throw makeError(AUTOMATION_ERRORS.NOT_FOUND, "Assignee must be an active pastoral administrator.");
  }
  const existing = await pastoralCareRepo.findPastoralCaseByIdForBranch(pool, caseId, ctx.branch_id);
  if (!existing || existing.status === "closed") {
    throw makeError(AUTOMATION_ERRORS.NOT_FOUND, "Pastoral case not found.");
  }
  return pastoralCareRepo.updatePastoralCaseForBranch(pool, caseId, ctx.branch_id, {
    assigned_admin_id: assigneeId,
  });
}

async function escalateCase(pool, ctx, plan, caseId, escalateToAdminId) {
  assertAdvancedCareAutomation(plan);
  const existing = await pastoralCareRepo.findPastoralCaseByIdForBranch(pool, caseId, ctx.branch_id);
  if (!existing || existing.status === "closed") {
    throw makeError(AUTOMATION_ERRORS.NOT_FOUND, "Pastoral case not found.");
  }
  let targetId = escalateToAdminId;
  if (targetId) {
    const supervisor = await branchAdminsRepo.findBranchAdminById(pool, targetId);
    if (
      !supervisor ||
      Number(supervisor.branch_id) !== Number(ctx.branch_id) ||
      !supervisor.can_supervise_pastoral
    ) {
      throw makeError(AUTOMATION_ERRORS.SUPERVISOR_REQUIRED, "Escalation target must be a pastoral supervisor.");
    }
  }
  const r = await pool.query(
    `UPDATE public.church_pastoral_cases
     SET status = 'escalated',
         escalated_at = now(),
         escalated_by_admin_id = $1,
         escalated_to_admin_id = COALESCE($2, escalated_to_admin_id),
         assigned_admin_id = COALESCE($2, assigned_admin_id),
         updated_at = now()
     WHERE id = $3 AND branch_id = $4
     RETURNING *`,
    [ctx.admin_id, targetId || null, caseId, ctx.branch_id]
  );
  return r.rows[0];
}

async function pauseCase(pool, ctx, plan, caseId, reason) {
  assertAdvancedCareAutomation(plan);
  const existing = await pastoralCareRepo.findPastoralCaseByIdForBranch(pool, caseId, ctx.branch_id);
  if (!existing || existing.status === "closed") {
    throw makeError(AUTOMATION_ERRORS.NOT_FOUND, "Pastoral case not found.");
  }
  const r = await pool.query(
    `UPDATE public.church_pastoral_cases
     SET status = 'paused', paused_at = now(), paused_by_admin_id = $1,
         pause_reason = $2, updated_at = now()
     WHERE id = $3 AND branch_id = $4
     RETURNING *`,
    [ctx.admin_id, reason || "", caseId, ctx.branch_id]
  );
  return r.rows[0];
}

async function resumeCase(pool, ctx, plan, caseId) {
  assertAdvancedCareAutomation(plan);
  const existing = await pastoralCareRepo.findPastoralCaseByIdForBranch(pool, caseId, ctx.branch_id);
  if (!existing || existing.status !== "paused") {
    throw makeError(AUTOMATION_ERRORS.INVALID_TRANSITION, "Case is not paused.");
  }
  const r = await pool.query(
    `UPDATE public.church_pastoral_cases
     SET status = 'in_follow_up', paused_at = NULL, paused_by_admin_id = NULL,
         pause_reason = NULL, updated_at = now()
     WHERE id = $1 AND branch_id = $2
     RETURNING *`,
    [caseId, ctx.branch_id]
  );
  return r.rows[0];
}

async function identifyOverdueCases(pool, ctx, plan) {
  assertAdvancedCareAutomation(plan);
  return pastoralAutomationRepo.listOverdueCasesForBranch(pool, ctx.branch_id);
}

async function processOverdueEscalations(pool, ctx, plan) {
  assertAdvancedCareAutomation(plan);
  const overdue = await pastoralAutomationRepo.listOverdueCasesForBranch(pool, ctx.branch_id);
  const escalated = [];
  for (const row of overdue) {
    if (row.status === "escalated" || row.status === "pending_supervisor_ack") continue;
    const updated = await escalateCase(pool, ctx, plan, row.id, row.escalated_to_admin_id || null);
    escalated.push(updated);
  }
  return escalated;
}

async function loadAutomationDashboard(pool, ctx, plan) {
  assertAdvancedCareAutomation(plan);
  const settings = await pastoralAutomationRepo.getSettingsWithDefaults(pool, ctx.branch_id);
  const workItems = await pastoralAutomationRepo.listWorkItemsForBranch(pool, ctx.branch_id);
  const overdue = await pastoralAutomationRepo.listOverdueCasesForBranch(pool, ctx.branch_id);
  const workload = await pastoralAutomationRepo.workloadByAdminForBranch(pool, ctx.branch_id);
  const branchComparison = await pastoralAutomationRepo.branchComparisonForOrganization(
    pool,
    ctx.organization_id
  );
  return { settings, workItems, overdue, workload, branchComparison };
}

function mapCaseForViewer(pastoralCase, admin) {
  if (!pastoralCase) return pastoralCase;
  const restricted =
    pastoralCase.confidentiality_level === "restricted" &&
    !(admin && admin.can_supervise_pastoral);
  if (!restricted) return pastoralCase;
  return {
    ...pastoralCase,
    summary: "[Restricted — supervisor access required for full details]",
    summary_redacted: true,
  };
}

module.exports = {
  AUTOMATION_ERRORS,
  assertAdvancedCareAutomation,
  runMissedServiceScan,
  acceptWorkItem,
  dismissWorkItem,
  supervisorAcknowledgeCase,
  reassignCase,
  escalateCase,
  pauseCase,
  resumeCase,
  identifyOverdueCases,
  processOverdueEscalations,
  loadAutomationDashboard,
  mapCaseForViewer,
  safePastoralNotificationSubject,
};
