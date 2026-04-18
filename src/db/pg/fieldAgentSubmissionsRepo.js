"use strict";

const { OPEN_PIPELINE_STATUSES, normalizeStatus } = require("../../fieldAgent/fieldAgentSubmissionStatuses");
const faAnalyticsObs = require("../../lib/fieldAgentAnalyticsObservability");
const fieldAgentSubmissionAuditRepo = require("./fieldAgentSubmissionAuditRepo");

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} submissionId
 * @param {{ adminUserId?: number, previousStatus?: string|null }} [auditContext]
 */
const CORRECTION_TARGET_STATUSES = ["approved", "rejected", "info_needed", "appealed"];
/** Allowed correction edges (current → target). Does not replace normal moderation rules when correction flag is off. */
const CORRECTION_EDGES = {
  pending: ["approved", "rejected", "info_needed"],
  info_needed: ["approved", "rejected", "pending"],
  appealed: ["approved", "rejected", "info_needed"],
  approved: ["rejected", "info_needed", "pending"],
  rejected: ["approved", "appealed", "info_needed", "pending"],
};

function isAllowedCorrection(currentStatus, targetStatus) {
  const cur = String(currentStatus || "").trim();
  const next = String(targetStatus || "").trim();
  const row = CORRECTION_EDGES[cur];
  if (!row || !row.includes(next)) return false;
  if (next === "appealed" && cur !== "rejected") return false;
  return true;
}

async function resolvePreviousStatusForAudit(pool, tenantId, submissionId, auditContext) {
  if (!auditContext) return null;
  const aid = Number(auditContext.adminUserId);
  if (!Number.isFinite(aid) || aid < 1) return null;
  if (auditContext.previousStatus != null && String(auditContext.previousStatus).trim() !== "") {
    return String(auditContext.previousStatus).trim();
  }
  const r = await pool.query(
    `SELECT status FROM public.field_agent_provider_submissions WHERE id = $1 AND tenant_id = $2`,
    [submissionId, tenantId]
  );
  return r.rows[0] ? String(r.rows[0].status || "") : null;
}

/**
 * Full submission row for admin CRM (tenant-scoped). Includes submitting field agent identity.
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} submissionId
 */
async function getSubmissionByIdForAdmin(pool, tenantId, submissionId) {
  const sid = Number(submissionId);
  const tid = Number(tenantId);
  if (!Number.isFinite(sid) || sid < 1 || !Number.isFinite(tid) || tid < 1) return null;
  const r = await pool.query(
    `
    SELECT s.*,
           fa.username AS field_agent_username,
           fa.display_name AS field_agent_display_name
    FROM public.field_agent_provider_submissions s
    INNER JOIN public.field_agents fa ON fa.id = s.field_agent_id AND fa.tenant_id = s.tenant_id
    WHERE s.id = $1 AND s.tenant_id = $2
    `,
    [sid, tid]
  );
  return r.rows[0] ?? null;
}

/**
 * Tenant-scoped submission rows by id set for admin operations.
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number[]} submissionIds
 */
async function listSubmissionsByIdsForAdmin(pool, tenantId, submissionIds) {
  const tid = Number(tenantId);
  const ids = [...new Set((Array.isArray(submissionIds) ? submissionIds : []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))];
  if (!Number.isFinite(tid) || tid < 1 || ids.length === 0) return [];
  const r = await pool.query(
    `
    SELECT id, status
    FROM public.field_agent_provider_submissions
    WHERE tenant_id = $1 AND id = ANY($2::int[])
    `,
    [tid, ids]
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {{ limit?: number }} [opts]
 */
async function listFieldAgentSubmissionsForAdmin(pool, tenantId, opts) {
  const tid = Number(tenantId);
  const limit = Math.min(Math.max(Number((opts && opts.limit) || 100), 1), 500);
  if (!Number.isFinite(tid) || tid < 1) return [];
  const r = await pool.query(
    `
    SELECT s.*,
           fa.username AS field_agent_username,
           fa.display_name AS field_agent_display_name
    FROM public.field_agent_provider_submissions s
    INNER JOIN public.field_agents fa ON fa.id = s.field_agent_id AND fa.tenant_id = s.tenant_id
    WHERE s.tenant_id = $1
    ORDER BY s.updated_at DESC
    LIMIT $2
    `,
    [tid, limit]
  );
  return r.rows;
}

/**
 * pending | info_needed | appealed → approved
 * @param {import("pg").Pool} pool
 * @param {{ tenantId: number, submissionId: number, commissionAmount?: number }} p
 * @returns {Promise<boolean>}
 */
async function approveFieldAgentSubmission(pool, p) {
  const tid = Number(p.tenantId);
  const sid = Number(p.submissionId);
  const commission = p.commissionAmount != null && Number.isFinite(Number(p.commissionAmount)) ? Number(p.commissionAmount) : 0;
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(sid) || sid < 1) return false;
  let prevForAudit = null;
  if (p.auditContext && Number(p.auditContext.adminUserId) > 0) {
    prevForAudit = await resolvePreviousStatusForAudit(pool, tid, sid, p.auditContext);
  }
  const obs = p && p._obs ? p._obs : null;
  const r = await faAnalyticsObs.observeQuery({ obs, query: "fieldAgentSubmissions.approveFieldAgentSubmission" }, () =>
    pool.query(
      `
    UPDATE public.field_agent_provider_submissions
    SET status = 'approved',
        rejection_reason = '',
        admin_info_request = '',
        field_agent_reply = '',
        commission_amount = $3::numeric,
        updated_at = now()
    WHERE id = $1 AND tenant_id = $2
      AND status IN ('pending', 'info_needed', 'appealed')
    `,
      [sid, tid, commission]
    )
  );
  const ok = r.rowCount === 1;
  if (ok && p.auditContext && Number(p.auditContext.adminUserId) > 0 && prevForAudit) {
    const meta =
      p.auditContext.metadata && typeof p.auditContext.metadata === "object" && !Array.isArray(p.auditContext.metadata)
        ? { ...p.auditContext.metadata }
        : {};
    if (commission > 0) meta.commission_amount = commission;
    await fieldAgentSubmissionAuditRepo.insertAuditRecord(pool, {
      tenantId: tid,
      submissionId: sid,
      adminUserId: Number(p.auditContext.adminUserId),
      actionType: "approve",
      previousStatus: prevForAudit,
      newStatus: "approved",
      metadata: Object.keys(meta).length ? meta : null,
    });
  }
  return ok;
}

/**
 * pending | info_needed | appealed → rejected
 * @param {import("pg").Pool} pool
 * @param {{ tenantId: number, submissionId: number, rejectionReason: string }} p
 * @returns {Promise<boolean>}
 */
async function rejectFieldAgentSubmission(pool, p) {
  const tid = Number(p.tenantId);
  const sid = Number(p.submissionId);
  const reason = String(p.rejectionReason || "").trim();
  if (!reason) return false;
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(sid) || sid < 1) return false;
  let prevForAudit = null;
  if (p.auditContext && Number(p.auditContext.adminUserId) > 0) {
    prevForAudit = await resolvePreviousStatusForAudit(pool, tid, sid, p.auditContext);
  }
  const obs = p && p._obs ? p._obs : null;
  const r = await faAnalyticsObs.observeQuery({ obs, query: "fieldAgentSubmissions.rejectFieldAgentSubmission" }, () =>
    pool.query(
      `
    UPDATE public.field_agent_provider_submissions
    SET status = 'rejected',
        rejection_reason = $3,
        admin_info_request = '',
        field_agent_reply = '',
        commission_amount = 0,
        updated_at = now()
    WHERE id = $1 AND tenant_id = $2
      AND status IN ('pending', 'info_needed', 'appealed')
    `,
      [sid, tid, reason.slice(0, 4000)]
    )
  );
  const ok = r.rowCount === 1;
  if (ok && p.auditContext && Number(p.auditContext.adminUserId) > 0 && prevForAudit) {
    const meta =
      p.auditContext.metadata && typeof p.auditContext.metadata === "object" && !Array.isArray(p.auditContext.metadata)
        ? { ...p.auditContext.metadata }
        : {};
    meta.reject_reason = reason.slice(0, 500);
    await fieldAgentSubmissionAuditRepo.insertAuditRecord(pool, {
      tenantId: tid,
      submissionId: sid,
      adminUserId: Number(p.auditContext.adminUserId),
      actionType: "reject",
      previousStatus: prevForAudit,
      newStatus: "rejected",
      metadata: meta,
    });
  }
  return ok;
}

/**
 * pending | appealed → info_needed (moderator requests more information).
 * @param {import("pg").Pool} pool
 * @param {{ tenantId: number, submissionId: number, adminInfoRequest: string }} p
 * @returns {Promise<boolean>}
 */
async function markFieldAgentSubmissionInfoNeeded(pool, p) {
  const tid = Number(p.tenantId);
  const sid = Number(p.submissionId);
  const adminMsg = String(p.adminInfoRequest || "").trim();
  if (!adminMsg) return false;
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(sid) || sid < 1) return false;
  let prevForAudit = null;
  if (p.auditContext && Number(p.auditContext.adminUserId) > 0) {
    prevForAudit = await resolvePreviousStatusForAudit(pool, tid, sid, p.auditContext);
  }
  const obs = p && p._obs ? p._obs : null;
  const stored = adminMsg.slice(0, 4000);
  const r = await faAnalyticsObs.observeQuery({ obs, query: "fieldAgentSubmissions.markFieldAgentSubmissionInfoNeeded" }, () =>
    pool.query(
      `
    UPDATE public.field_agent_provider_submissions
    SET status = 'info_needed',
        admin_info_request = $3,
        field_agent_reply = '',
        updated_at = now()
    WHERE id = $1 AND tenant_id = $2
      AND status IN ('pending', 'appealed')
    `,
      [sid, tid, stored]
    )
  );
  const ok = r.rowCount === 1;
  if (ok && p.auditContext && Number(p.auditContext.adminUserId) > 0 && prevForAudit) {
    const meta =
      p.auditContext.metadata && typeof p.auditContext.metadata === "object" && !Array.isArray(p.auditContext.metadata)
        ? { ...p.auditContext.metadata }
        : {};
    meta.info_request = stored.slice(0, 500);
    await fieldAgentSubmissionAuditRepo.insertAuditRecord(pool, {
      tenantId: tid,
      submissionId: sid,
      adminUserId: Number(p.auditContext.adminUserId),
      actionType: "info_needed",
      previousStatus: prevForAudit,
      newStatus: "info_needed",
      metadata: Object.keys(meta).length ? meta : null,
    });
  }
  return ok;
}

/**
 * rejected → appealed (reopen for review).
 * @param {import("pg").Pool} pool
 * @param {{ tenantId: number, submissionId: number }} p
 * @returns {Promise<boolean>}
 */
async function markFieldAgentSubmissionAppealed(pool, p) {
  const tid = Number(p.tenantId);
  const sid = Number(p.submissionId);
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(sid) || sid < 1) return false;
  let prevForAudit = null;
  if (p.auditContext && Number(p.auditContext.adminUserId) > 0) {
    prevForAudit = await resolvePreviousStatusForAudit(pool, tid, sid, p.auditContext);
  }
  const obs = p && p._obs ? p._obs : null;
  const r = await faAnalyticsObs.observeQuery({ obs, query: "fieldAgentSubmissions.markFieldAgentSubmissionAppealed" }, () =>
    pool.query(
      `
    UPDATE public.field_agent_provider_submissions
    SET status = 'appealed',
        updated_at = now()
    WHERE id = $1 AND tenant_id = $2 AND status = 'rejected'
    `,
      [sid, tid]
    )
  );
  const ok = r.rowCount === 1;
  if (ok && p.auditContext && Number(p.auditContext.adminUserId) > 0 && prevForAudit) {
    const meta =
      p.auditContext.metadata && typeof p.auditContext.metadata === "object" && !Array.isArray(p.auditContext.metadata)
        ? p.auditContext.metadata
        : null;
    await fieldAgentSubmissionAuditRepo.insertAuditRecord(pool, {
      tenantId: tid,
      submissionId: sid,
      adminUserId: Number(p.auditContext.adminUserId),
      actionType: "appeal",
      previousStatus: prevForAudit,
      newStatus: "appealed",
      metadata: meta,
    });
  }
  return ok;
}

/**
 * @param {import("pg").Pool} pool
 * @param {{ tenantId: number, submissionId: number, commissionAmount: number }} p
 * @returns {Promise<boolean>}
 */
/**
 * Controlled status correction (dispute / mistake). Uses a dedicated UPDATE + append-only audit with correction metadata.
 * Does not modify existing moderation helpers or their transition guards.
 *
 * @param {import("pg").Pool} pool
 * @param {{
 *   tenantId: number,
 *   submissionId: number,
 *   adminUserId: number,
 *   targetStatus: 'approved'|'rejected'|'info_needed'|'appealed',
 *   correctionReason: string,
 *   commissionAmount?: number,
 *   _obs?: object,
 * }} p
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function correctFieldAgentSubmissionStatus(pool, p) {
  const tid = Number(p.tenantId);
  const sid = Number(p.submissionId);
  const adminUserId = Number(p.adminUserId);
  const reason = String(p.correctionReason || "").trim();
  const target = String(p.targetStatus || "").trim();
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(sid) || sid < 1) {
    return { ok: false, error: "Invalid submission." };
  }
  if (!Number.isFinite(adminUserId) || adminUserId < 1) {
    return { ok: false, error: "Invalid admin." };
  }
  if (!reason) {
    return { ok: false, error: "Correction reason is required." };
  }
  if (!CORRECTION_TARGET_STATUSES.includes(target)) {
    return { ok: false, error: "Invalid target status." };
  }
  const obs = p && p._obs ? p._obs : null;
  const curRow = await faAnalyticsObs.observeQuery(
    { obs, query: "fieldAgentSubmissions.correctFieldAgentSubmissionStatus.load" },
    () => pool.query(`SELECT status FROM public.field_agent_provider_submissions WHERE id = $1 AND tenant_id = $2`, [sid, tid])
  );
  if (!curRow.rows[0]) {
    return { ok: false, error: "Not found." };
  }
  const current = String(curRow.rows[0].status || "").trim();
  if (current === target) {
    return { ok: false, error: "Submission is already in this status." };
  }
  if (!isAllowedCorrection(current, target)) {
    return { ok: false, error: "This status change is not allowed as a correction." };
  }
  const commission =
    p.commissionAmount != null && Number.isFinite(Number(p.commissionAmount)) && Number(p.commissionAmount) >= 0
      ? Number(p.commissionAmount)
      : 0;

  let r;
  if (target === "approved") {
    r = await faAnalyticsObs.observeQuery({ obs, query: "fieldAgentSubmissions.correctFieldAgentSubmissionStatus.toApproved" }, () =>
      pool.query(
        `
        UPDATE public.field_agent_provider_submissions
        SET status = 'approved',
            rejection_reason = '',
            admin_info_request = '',
            field_agent_reply = '',
            commission_amount = $3::numeric,
            updated_at = now()
        WHERE id = $1 AND tenant_id = $2 AND status = $4
        `,
        [sid, tid, commission, current]
      )
    );
  } else if (target === "rejected") {
    r = await faAnalyticsObs.observeQuery({ obs, query: "fieldAgentSubmissions.correctFieldAgentSubmissionStatus.toRejected" }, () =>
      pool.query(
        `
        UPDATE public.field_agent_provider_submissions
        SET status = 'rejected',
            rejection_reason = $3,
            admin_info_request = '',
            field_agent_reply = '',
            commission_amount = 0,
            updated_at = now()
        WHERE id = $1 AND tenant_id = $2 AND status = $4
        `,
        [sid, tid, reason.slice(0, 4000), current]
      )
    );
  } else if (target === "info_needed") {
    r = await faAnalyticsObs.observeQuery({ obs, query: "fieldAgentSubmissions.correctFieldAgentSubmissionStatus.toInfoNeeded" }, () =>
      pool.query(
        `
        UPDATE public.field_agent_provider_submissions
        SET status = 'info_needed',
            admin_info_request = $4,
            field_agent_reply = '',
            updated_at = now()
        WHERE id = $1 AND tenant_id = $2 AND status = $3
        `,
        [sid, tid, current, reason.slice(0, 4000)]
      )
    );
  } else {
    r = await faAnalyticsObs.observeQuery({ obs, query: "fieldAgentSubmissions.correctFieldAgentSubmissionStatus.toAppealed" }, () =>
      pool.query(
        `
        UPDATE public.field_agent_provider_submissions
        SET status = 'appealed',
            updated_at = now()
        WHERE id = $1 AND tenant_id = $2 AND status = 'rejected'
        `,
        [sid, tid]
      )
    );
  }
  if (r.rowCount !== 1) {
    return { ok: false, error: "Update failed (record may have changed)." };
  }

  const actionType = target === "approved" ? "approve" : target === "rejected" ? "reject" : target === "info_needed" ? "info_needed" : "appeal";
  const meta = {
    correction: true,
    reason: reason.slice(0, 1000),
    previous_decision: current,
    trigger: "manual_override",
  };
  if (target === "rejected") {
    meta.reject_reason = reason.slice(0, 500);
  }
  if (target === "approved" && commission > 0) {
    meta.commission_amount = commission;
  }

  await fieldAgentSubmissionAuditRepo.insertAuditRecord(pool, {
    tenantId: tid,
    submissionId: sid,
    adminUserId,
    actionType,
    previousStatus: current,
    newStatus: target,
    metadata: meta,
  });

  return { ok: true };
}

async function updateFieldAgentSubmissionCommission(pool, p) {
  const tid = Number(p.tenantId);
  const sid = Number(p.submissionId);
  const amt = Number(p.commissionAmount);
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(sid) || sid < 1) return false;
  if (!Number.isFinite(amt) || amt < 0) return false;
  const r = await pool.query(
    `
    UPDATE public.field_agent_provider_submissions
    SET commission_amount = $3::numeric,
        updated_at = now()
    WHERE id = $1 AND tenant_id = $2 AND status = 'approved'
    `,
    [sid, tid, amt]
  );
  return r.rowCount === 1;
}

async function countByAgentAndStatus(pool, fieldAgentId, status) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS c FROM public.field_agent_provider_submissions
     WHERE field_agent_id = $1 AND status = $2`,
    [fieldAgentId, status]
  );
  return Number(r.rows[0].c);
}

async function sumCommissionLastDays(pool, fieldAgentId, days) {
  const r = await pool.query(
    `SELECT COALESCE(SUM(commission_amount), 0)::numeric AS s
     FROM public.field_agent_provider_submissions
     WHERE field_agent_id = $1 AND status = 'approved'
       AND updated_at >= now() - ($2::int * interval '1 day')`,
    [fieldAgentId, days]
  );
  return Number(r.rows[0].s);
}

/**
 * Approved recruitment commission in an explicit inclusive period (by submission updated_at).
 * Used for admin pay-run previews; does not change rolling dashboard helpers.
 */
async function sumCommissionApprovedInPeriod(pool, fieldAgentId, periodStart, periodEnd) {
  const aid = Number(fieldAgentId);
  if (!Number.isFinite(aid) || aid < 1) return 0;
  const r = await pool.query(
    `SELECT COALESCE(SUM(commission_amount), 0)::numeric AS s
     FROM public.field_agent_provider_submissions
     WHERE field_agent_id = $1 AND status = 'approved'
       AND updated_at >= $2::timestamptz AND updated_at <= $3::timestamptz`,
    [aid, periodStart, periodEnd]
  );
  const v = r.rows[0] && r.rows[0].s;
  return v != null && Number.isFinite(Number(v)) ? Number(v) : 0;
}

async function listRejectedWithReason(pool, fieldAgentId, limit = 50) {
  const r = await pool.query(
    `SELECT id, rejection_reason, created_at, updated_at, first_name, last_name, phone_raw
     FROM public.field_agent_provider_submissions
     WHERE field_agent_id = $1 AND status = 'rejected' AND rejection_reason <> ''
     ORDER BY updated_at DESC
     LIMIT $2`,
    [fieldAgentId, limit]
  );
  return r.rows;
}

/**
 * Field-agent console: submissions for this agent only, filtered by status.
 * @param {import("pg").Pool} pool
 * @param {number} fieldAgentId
 * @param {string} status
 * @param {number} [limit]
 */
async function listSubmissionsForFieldAgentByStatus(pool, fieldAgentId, status, limit = 100) {
  const st = normalizeStatus(status);
  if (!st) return [];
  const aid = Number(fieldAgentId);
  if (!Number.isFinite(aid) || aid < 1) return [];
  const lim = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const r = await pool.query(
    `
    SELECT id, first_name, last_name, profession, city,
           phone_raw, whatsapp_raw, status, rejection_reason,
           admin_info_request, field_agent_reply,
           created_at, updated_at
    FROM public.field_agent_provider_submissions
    WHERE field_agent_id = $1 AND status = $2
    ORDER BY updated_at DESC
    LIMIT $3
    `,
    [aid, st, lim]
  );
  return r.rows;
}

/**
 * Approved submissions for this field agent that are not yet linked to any company row
 * (`companies.source_field_agent_submission_id`). Used for field-agent "next website step" UX only.
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} fieldAgentId
 * @param {number} [limit]
 */
async function listApprovedForFieldAgentNotLinkedToCompany(pool, tenantId, fieldAgentId, limit = 25) {
  const tid = Number(tenantId);
  const aid = Number(fieldAgentId);
  const lim = Math.min(Math.max(Number(limit) || 25, 1), 100);
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(aid) || aid < 1) return [];
  const r = await pool.query(
    `
    SELECT s.id, s.first_name, s.last_name, s.profession, s.city, s.phone_raw, s.updated_at
    FROM public.field_agent_provider_submissions s
    WHERE s.tenant_id = $1 AND s.field_agent_id = $2 AND s.status = 'approved'
      AND NOT EXISTS (
        SELECT 1 FROM public.companies c
        WHERE c.tenant_id = $1 AND c.source_field_agent_submission_id = s.id
      )
    ORDER BY s.updated_at DESC
    LIMIT $3
    `,
    [tid, aid, lim]
  );
  return r.rows;
}

/**
 * Approved submissions available to link to a company (excludes submission already linked to another company).
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number | null} excludeCompanyId — current company when editing
 */
async function listApprovedForCompanyLinkageSelect(pool, tenantId, excludeCompanyId) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return [];
  const ex = excludeCompanyId != null && Number.isFinite(Number(excludeCompanyId)) ? Number(excludeCompanyId) : null;
  const r = await pool.query(
    `
    SELECT s.id, s.field_agent_id, s.first_name, s.last_name, s.phone_raw, s.profession, s.status
    FROM public.field_agent_provider_submissions s
    WHERE s.tenant_id = $1 AND s.status = 'approved'
      AND NOT EXISTS (
        SELECT 1 FROM public.companies c
        WHERE c.tenant_id = $1
          AND c.source_field_agent_submission_id = s.id
          AND ($2::int IS NULL OR c.id <> $2)
      )
    ORDER BY s.updated_at DESC
    LIMIT 400
    `,
    [tid, ex]
  );
  return r.rows;
}

/**
 * @param {import("pg").Pool} pool
 * @param {number} tenantId
 * @param {number} submissionId
 */
async function getSubmissionByIdForAdminLinkage(pool, tenantId, submissionId) {
  const tid = Number(tenantId);
  const sid = Number(submissionId);
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(sid) || sid < 1) return null;
  const r = await pool.query(
    `
    SELECT id, tenant_id, field_agent_id, status
    FROM public.field_agent_provider_submissions
    WHERE id = $1 AND tenant_id = $2
    `,
    [sid, tid]
  );
  return r.rows[0] ?? null;
}

/**
 * Field-agent console: one submission row if it belongs to this agent and tenant.
 */
async function getSubmissionByIdForFieldAgent(pool, tenantId, fieldAgentId, submissionId) {
  const tid = Number(tenantId);
  const aid = Number(fieldAgentId);
  const sid = Number(submissionId);
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(aid) || aid < 1 || !Number.isFinite(sid) || sid < 1) {
    return null;
  }
  const r = await pool.query(
    `
    SELECT *
    FROM public.field_agent_provider_submissions
    WHERE id = $1 AND tenant_id = $2 AND field_agent_id = $3
    `,
    [sid, tid, aid]
  );
  return r.rows[0] ?? null;
}

/** Keys align with public.companies listing text fields (mini-site / directory); photos out of scope. */
const WEBSITE_LISTING_DRAFT_KEYS = [
  "listing_name",
  "headline",
  "about",
  "services",
  "location",
  "service_areas",
  "hours_text",
  "email",
  "listing_phone",
  "featured_cta_label",
  "featured_cta_phone",
];

const WEBSITE_LISTING_DRAFT_MAX = {
  listing_name: 200,
  headline: 500,
  about: 12000,
  services: 12000,
  location: 500,
  service_areas: 4000,
  hours_text: 4000,
  email: 320,
  listing_phone: 120,
  featured_cta_label: 120,
  featured_cta_phone: 120,
};

/**
 * Sanitize client payload for website_listing_draft_json (JSONB).
 * @param {unknown} raw
 * @returns {Record<string, string | number | null>}
 */
function normalizeWebsiteListingDraft(raw) {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const out = /** @type {Record<string, string | number | null>} */ ({});
  for (const k of WEBSITE_LISTING_DRAFT_KEYS) {
    const lim = WEBSITE_LISTING_DRAFT_MAX[k] || 500;
    out[k] = String(o[k] != null ? o[k] : "").trim().slice(0, lim);
  }
  let y = o.years_experience;
  if (y === "" || y == null) {
    out.years_experience = null;
  } else {
    const n = Number(y);
    out.years_experience = Number.isFinite(n) ? Math.min(999, Math.max(0, Math.floor(n))) : null;
  }
  return out;
}

/**
 * Merge stored JSONB (object or missing keys) with defaults for forms.
 * @param {unknown} stored
 */
function mergeWebsiteListingDraftForDisplay(stored) {
  const base = normalizeWebsiteListingDraft({});
  const cur = stored && typeof stored === "object" && !Array.isArray(stored) ? stored : {};
  const n = normalizeWebsiteListingDraft(cur);
  return { ...base, ...n };
}

/**
 * Approved submission, not linked to a company: save listing draft only (no moderation status change).
 * @param {import("pg").Pool} pool
 * @param {{ tenantId: number, fieldAgentId: number, submissionId: number, draft: unknown }} params
 * @returns {Promise<boolean>}
 */
async function patchWebsiteListingDraftForFieldAgent(pool, params) {
  const tid = Number(params.tenantId);
  const aid = Number(params.fieldAgentId);
  const sid = Number(params.submissionId);
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(aid) || aid < 1 || !Number.isFinite(sid) || sid < 1) {
    return false;
  }
  const normalized = normalizeWebsiteListingDraft(params.draft);
  const r = await pool.query(
    `
    UPDATE public.field_agent_provider_submissions s
    SET website_listing_draft_json = $1::jsonb,
        updated_at = now()
    WHERE s.id = $2 AND s.tenant_id = $3 AND s.field_agent_id = $4
      AND s.status = 'approved'
      AND NOT EXISTS (
        SELECT 1 FROM public.companies c
        WHERE c.tenant_id = s.tenant_id AND c.source_field_agent_submission_id = s.id
      )
    RETURNING s.id
    `,
    [JSON.stringify(normalized), sid, tid, aid]
  );
  return r.rowCount === 1;
}

/**
 * Sets website_listing_review_requested_at; optionally updates draft in the same row.
 * @param {import("pg").Pool} pool
 * @param {{ tenantId: number, fieldAgentId: number, submissionId: number, draft?: unknown }} params
 * @returns {Promise<boolean>}
 */
async function submitWebsiteListingReviewRequestForFieldAgent(pool, params) {
  const tid = Number(params.tenantId);
  const aid = Number(params.fieldAgentId);
  const sid = Number(params.submissionId);
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(aid) || aid < 1 || !Number.isFinite(sid) || sid < 1) {
    return false;
  }
  const hasDraft = params.draft !== undefined;
  const draftJson = hasDraft ? JSON.stringify(normalizeWebsiteListingDraft(params.draft)) : null;
  const r = await pool.query(
    `
    UPDATE public.field_agent_provider_submissions s
    SET website_listing_draft_json = CASE WHEN $1 IS NULL THEN s.website_listing_draft_json ELSE $1::jsonb END,
        website_listing_review_requested_at = now(),
        updated_at = now()
    WHERE s.id = $2 AND s.tenant_id = $3 AND s.field_agent_id = $4
      AND s.status = 'approved'
      AND NOT EXISTS (
        SELECT 1 FROM public.companies c
        WHERE c.tenant_id = s.tenant_id AND c.source_field_agent_submission_id = s.id
      )
    RETURNING s.id
    `,
    [draftJson, sid, tid, aid]
  );
  return r.rowCount === 1;
}

/**
 * Staff console: update website_listing_draft_json on an approved submission (tenant-scoped).
 * @param {import("pg").Pool|import("pg").PoolClient} pool
 * @param {{ tenantId: number, submissionId: number, draft: unknown }} params
 * @returns {Promise<boolean>}
 */
async function patchWebsiteListingDraftForAdmin(pool, params) {
  const tid = Number(params.tenantId);
  const sid = Number(params.submissionId);
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(sid) || sid < 1) {
    return false;
  }
  const normalized = normalizeWebsiteListingDraft(params.draft);
  const r = await pool.query(
    `
    UPDATE public.field_agent_provider_submissions
    SET website_listing_draft_json = $1::jsonb,
        updated_at = now()
    WHERE id = $2 AND tenant_id = $3 AND status = 'approved'
    RETURNING id
    `,
    [JSON.stringify(normalized), sid, tid]
  );
  return r.rowCount === 1;
}

async function duplicateExistsAgainstSubmissions(pool, tenantId, phoneNorm, whatsappNorm, excludeId) {
  const r = await pool.query(
    `
    SELECT id FROM public.field_agent_provider_submissions
    WHERE tenant_id = $1 AND status = ANY($2::text[])
      AND (
        ($3::text <> '' AND (phone_norm = $3 OR whatsapp_norm = $3))
        OR ($4::text <> '' AND (phone_norm = $4 OR whatsapp_norm = $4))
      )
      AND ($5::int IS NULL OR id <> $5)
    LIMIT 1
    `,
    [tenantId, OPEN_PIPELINE_STATUSES, phoneNorm || "", whatsappNorm || "", excludeId != null ? excludeId : null]
  );
  return { duplicate: r.rows.length > 0, id: r.rows[0]?.id };
}

/**
 * Directory duplicates: companies / professional_signups phone match (canonical + legacy-expanded norms).
 * @param {import("pg").Pool|import("pg").PoolClient} pool
 * @param {number} tenantId
 * @param {string[]} normCandidates digit strings (canonical + legacy-expanded)
 */
async function duplicateExistsCompaniesOrSignups(pool, tenantId, normCandidates) {
  const tid = Number(tenantId);
  if (!Number.isFinite(tid) || tid < 1) return { duplicate: false };
  const uniq = [...new Set((normCandidates || []).map((x) => String(x || "").replace(/\D/g, "")).filter(Boolean))];
  for (const d of uniq) {
    const c = await pool.query(
      `SELECT 1 FROM public.companies WHERE tenant_id = $1 AND regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $2 LIMIT 1`,
      [tid, d]
    );
    if (c.rows.length) return { duplicate: true, source: "company_phone" };
    const p = await pool.query(
      `SELECT 1 FROM public.professional_signups WHERE tenant_id = $1 AND regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $2 LIMIT 1`,
      [tid, d]
    );
    if (p.rows.length) return { duplicate: true, source: "professional_signup_phone" };
    const feat = await pool.query(
      `SELECT 1 FROM public.companies WHERE tenant_id = $1 AND regexp_replace(COALESCE(featured_cta_phone, ''), '\\D', '', 'g') = $2 LIMIT 1`,
      [tid, d]
    );
    if (feat.rows.length) return { duplicate: true, source: "company_featured_phone" };
  }
  return { duplicate: false };
}

/**
 * @param {import("pg").Pool|import("pg").PoolClient} pool
 * @param {import("pg").PoolClient|null} client
 */
async function insertSubmission(pool, client, row) {
  const q = client || pool;
  const r = await q.query(
    `
    INSERT INTO public.field_agent_provider_submissions (
      tenant_id, field_agent_id,
      phone_raw, phone_norm, whatsapp_raw, whatsapp_norm,
      first_name, last_name, profession, city, pacra,
      address_street, address_landmarks, address_neighbourhood, address_city,
      nrc_number, photo_profile_url, work_photos_json,
      status, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'pending', now()
    )
    RETURNING id
    `,
    [
      row.tenantId,
      row.fieldAgentId,
      row.phoneRaw,
      row.phoneNorm,
      row.whatsappRaw,
      row.whatsappNorm,
      row.firstName,
      row.lastName,
      row.profession,
      row.city,
      row.pacra,
      row.addressStreet,
      row.addressLandmarks,
      row.addressNeighbourhood,
      row.addressCity,
      row.nrcNumber,
      row.photoProfileUrl || "",
      row.workPhotosJson || "[]",
    ]
  );
  return Number(r.rows[0].id);
}

async function updatePhotosAfterUpload(pool, client, { submissionId, tenantId, photoProfileUrl, workPhotosJson }) {
  const q = client || pool;
  await q.query(
    `UPDATE public.field_agent_provider_submissions
     SET photo_profile_url = $1, work_photos_json = $2, updated_at = now()
     WHERE id = $3 AND tenant_id = $4`,
    [photoProfileUrl || "", workPhotosJson || "[]", submissionId, tenantId]
  );
}

/**
 * Field agent: set reply while status is info_needed or rejected (no status change).
 * @param {import("pg").Pool} pool
 * @param {{ tenantId: number, fieldAgentId: number, submissionId: number, message: string }} p
 */
async function patchFieldAgentSubmissionReply(pool, p) {
  const tid = Number(p.tenantId);
  const aid = Number(p.fieldAgentId);
  const sid = Number(p.submissionId);
  const msg = String(p.message || "").trim();
  if (!msg) return false;
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(aid) || aid < 1 || !Number.isFinite(sid) || sid < 1) return false;
  const r = await pool.query(
    `
    UPDATE public.field_agent_provider_submissions
    SET field_agent_reply = $4,
        updated_at = now()
    WHERE id = $1 AND tenant_id = $2 AND field_agent_id = $3 AND status IN ('info_needed', 'rejected')
    `,
    [sid, tid, aid, msg.slice(0, 4000)]
  );
  return r.rowCount === 1;
}

/**
 * Field agent: update editable fields and resubmit (info_needed | rejected → pending).
 * @param {import("pg").Pool} pool
 * @param {{
 *   tenantId: number,
 *   fieldAgentId: number,
 *   submissionId: number,
 *   phoneRaw: string,
 *   phoneNorm: string,
 *   whatsappRaw: string,
 *   whatsappNorm: string,
 *   firstName: string,
 *   lastName: string,
 *   profession: string,
 *   city: string,
 *   pacra: string,
 *   addressStreet: string,
 *   addressLandmarks: string,
 *   addressNeighbourhood: string,
 *   addressCity: string,
 *   nrcNumber: string,
 *   photoProfileUrl: string,
 *   workPhotosJson: string,
 *   fieldAgentReply?: string | null,
 * }} p
 * @returns {Promise<boolean>}
 */
async function resubmitFieldAgentSubmissionForReview(pool, p) {
  const tid = Number(p.tenantId);
  const aid = Number(p.fieldAgentId);
  const sid = Number(p.submissionId);
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(aid) || aid < 1 || !Number.isFinite(sid) || sid < 1) return false;

  const phoneRaw = String(p.phoneRaw || "").trim();
  const phoneNorm = String(p.phoneNorm || "").trim();
  const whatsappRaw = String(p.whatsappRaw || "").trim();
  const whatsappNorm = String(p.whatsappNorm || "").trim();
  const firstName = String(p.firstName || "").trim().slice(0, 120);
  const lastName = String(p.lastName || "").trim().slice(0, 120);
  const profession = String(p.profession || "").trim().slice(0, 200);
  const city = String(p.city || "").trim().slice(0, 120);
  const pacra = String(p.pacra || "").trim().slice(0, 200);
  const addressStreet = String(p.addressStreet || "").trim().slice(0, 300);
  const addressLandmarks = String(p.addressLandmarks || "").trim().slice(0, 300);
  const addressNeighbourhood = String(p.addressNeighbourhood || "").trim().slice(0, 200);
  const addressCity = String(p.addressCity || "").trim().slice(0, 120);
  const nrcNumber = String(p.nrcNumber || "").trim().slice(0, 80);
  const photoProfileUrl = String(p.photoProfileUrl != null ? p.photoProfileUrl : "").trim().slice(0, 500);
  const workPhotosJsonRaw = p.workPhotosJson != null ? String(p.workPhotosJson).trim() : "[]";
  const workPhotosJson = workPhotosJsonRaw.length > 20000 ? workPhotosJsonRaw.slice(0, 20000) : workPhotosJsonRaw;

  const replyParam = p.fieldAgentReply === undefined ? null : String(p.fieldAgentReply).trim().slice(0, 4000);

  const r = await pool.query(
    `
    UPDATE public.field_agent_provider_submissions
    SET
      phone_raw = $4,
      phone_norm = $5,
      whatsapp_raw = $6,
      whatsapp_norm = $7,
      first_name = $8,
      last_name = $9,
      profession = $10,
      city = $11,
      pacra = $12,
      address_street = $13,
      address_landmarks = $14,
      address_neighbourhood = $15,
      address_city = $16,
      nrc_number = $17,
      photo_profile_url = $18,
      work_photos_json = $19,
      status = 'pending',
      admin_info_request = '',
      rejection_reason = '',
      field_agent_reply = CASE WHEN $20::text IS NULL THEN field_agent_reply ELSE $20 END,
      updated_at = now()
    WHERE id = $1 AND tenant_id = $2 AND field_agent_id = $3 AND status IN ('info_needed', 'rejected')
    `,
    [
      sid,
      tid,
      aid,
      phoneRaw,
      phoneNorm,
      whatsappRaw,
      whatsappNorm,
      firstName,
      lastName,
      profession,
      city,
      pacra,
      addressStreet,
      addressLandmarks,
      addressNeighbourhood,
      addressCity,
      nrcNumber,
      photoProfileUrl,
      workPhotosJson,
      replyParam,
    ]
  );
  return r.rowCount === 1;
}

/**
 * Bulk moderation wrapper for tenant-scoped submission ids.
 * Reuses the same single-item transition helpers and does not bypass transition rules.
 *
 * @param {import("pg").Pool} pool
 * @param {{
 *   tenantId: number,
 *   action: "approve"|"reject"|"info_needed"|"appeal",
 *   ids: number[],
 *   rejectionReason?: string,
 *   infoRequest?: string,
 *   commissionAmount?: number,
 *   adminUserId?: number|null
 * }} p
 */
async function applyBulkSubmissionAction(pool, p) {
  const tid = Number(p.tenantId);
  if (!Number.isFinite(tid) || tid < 1) {
    return {
      ok: false,
      error: "Invalid tenant.",
      action: String(p.action || ""),
      processed: 0,
      succeeded: 0,
      failed: 0,
      results: [],
    };
  }
  const action = String(p.action || "").trim();
  const allowed = ["approve", "reject", "info_needed", "appeal"];
  if (!allowed.includes(action)) {
    return {
      ok: false,
      error: "Invalid action.",
      action,
      processed: 0,
      succeeded: 0,
      failed: 0,
      results: [],
    };
  }
  const maxIds = Math.max(Number((p && p.maxIds) || 500), 1);
  const ids = [...new Set((Array.isArray(p.ids) ? p.ids : []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))];
  if (ids.length > maxIds) {
    return {
      ok: false,
      error: `Too many ids supplied. Maximum ${maxIds} per bulk action.`,
      action,
      processed: 0,
      succeeded: 0,
      failed: 0,
      results: [],
    };
  }
  if (ids.length === 0) {
    return {
      ok: false,
      error: "No valid ids supplied.",
      action,
      processed: 0,
      succeeded: 0,
      failed: 0,
      results: [],
    };
  }
  const rejectionReason = String(p.rejectionReason || "").trim();
  const infoRequest = String(p.infoRequest || "").trim();
  if (action === "reject" && !rejectionReason) {
    return {
      ok: false,
      error: "Rejection reason is required.",
      action,
      processed: 0,
      succeeded: 0,
      failed: 0,
      results: [],
    };
  }
  if (action === "info_needed" && !infoRequest) {
    return {
      ok: false,
      error: "Info request message is required.",
      action,
      processed: 0,
      succeeded: 0,
      failed: 0,
      results: [],
    };
  }
  const commission =
    p.commissionAmount != null && Number.isFinite(Number(p.commissionAmount)) && Number(p.commissionAmount) >= 0
      ? Number(p.commissionAmount)
      : 0;
  const auditAdminId = p.adminUserId != null && Number(p.adminUserId) > 0 ? Number(p.adminUserId) : null;

  const results = [];
  const existing = await faAnalyticsObs.observeQuery(
    {
      obs: p && p._obs ? p._obs : null,
      query: "fieldAgentSubmissions.listSubmissionsByIdsForAdmin",
    },
    () => listSubmissionsByIdsForAdmin(pool, tid, ids)
  );
  const byId = new Map(existing.map((row) => [Number(row.id), String(row.status || "")]));
  for (const id of ids) {
    const currentStatus = byId.get(Number(id));
    if (!currentStatus) {
      results.push({ id, ok: false, error: "Not found in this tenant." });
      continue;
    }
    let ok = false;
    const auditContext =
      auditAdminId != null
        ? {
            adminUserId: auditAdminId,
            previousStatus: currentStatus,
            metadata:
              action === "reject"
                ? { reject_reason: rejectionReason.slice(0, 500) }
                : action === "approve" && commission > 0
                  ? { commission_amount: commission }
                  : action === "info_needed"
                    ? { info_request: infoRequest.slice(0, 500) }
                    : undefined,
          }
        : undefined;
    if (action === "approve") {
      ok = await approveFieldAgentSubmission(pool, {
        tenantId: tid,
        submissionId: id,
        commissionAmount: commission,
        auditContext,
        _obs: p && p._obs ? p._obs : null,
      });
    } else if (action === "reject") {
      ok = await rejectFieldAgentSubmission(pool, {
        tenantId: tid,
        submissionId: id,
        rejectionReason,
        auditContext,
        _obs: p && p._obs ? p._obs : null,
      });
    } else if (action === "info_needed") {
      ok = await markFieldAgentSubmissionInfoNeeded(pool, {
        tenantId: tid,
        submissionId: id,
        adminInfoRequest: infoRequest,
        auditContext,
        _obs: p && p._obs ? p._obs : null,
      });
    } else if (action === "appeal") {
      ok = await markFieldAgentSubmissionAppealed(pool, {
        tenantId: tid,
        submissionId: id,
        auditContext,
        _obs: p && p._obs ? p._obs : null,
      });
    }
    if (ok) {
      results.push({ id, ok: true });
    } else {
      let reason = "Invalid state transition.";
      if (action === "approve") reason = `Cannot approve from status "${currentStatus}".`;
      if (action === "reject") reason = `Cannot reject from status "${currentStatus}".`;
      if (action === "info_needed") reason = `Cannot mark info needed from status "${currentStatus}".`;
      if (action === "appeal") reason = `Cannot appeal from status "${currentStatus}".`;
      results.push({ id, ok: false, error: reason });
    }
  }

  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.length - succeeded;
  return {
    ok: true,
    action,
    processed: results.length,
    succeeded,
    failed,
    results,
  };
}

module.exports = {
  getSubmissionByIdForAdmin,
  listSubmissionsByIdsForAdmin,
  listFieldAgentSubmissionsForAdmin,
  approveFieldAgentSubmission,
  rejectFieldAgentSubmission,
  markFieldAgentSubmissionInfoNeeded,
  markFieldAgentSubmissionAppealed,
  updateFieldAgentSubmissionCommission,
  countByAgentAndStatus,
  sumCommissionLastDays,
  sumCommissionApprovedInPeriod,
  listRejectedWithReason,
  listSubmissionsForFieldAgentByStatus,
  listApprovedForFieldAgentNotLinkedToCompany,
  listApprovedForCompanyLinkageSelect,
  getSubmissionByIdForAdminLinkage,
  getSubmissionByIdForFieldAgent,
  duplicateExistsAgainstSubmissions,
  duplicateExistsCompaniesOrSignups,
  insertSubmission,
  updatePhotosAfterUpload,
  patchFieldAgentSubmissionReply,
  resubmitFieldAgentSubmissionForReview,
  applyBulkSubmissionAction,
  correctFieldAgentSubmissionStatus,
  normalizeWebsiteListingDraft,
  mergeWebsiteListingDraftForDisplay,
  patchWebsiteListingDraftForFieldAgent,
  submitWebsiteListingReviewRequestForFieldAgent,
  patchWebsiteListingDraftForAdmin,
};
