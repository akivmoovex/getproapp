"use strict";

const { OPEN_PIPELINE_STATUSES, normalizeStatus } = require("../../fieldAgent/fieldAgentSubmissionStatuses");
const faAnalyticsObs = require("../../lib/fieldAgentAnalyticsObservability");

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
  const obs = p && p._obs ? p._obs : null;
  const r = await faAnalyticsObs.observeQuery({ obs, query: "fieldAgentSubmissions.approveFieldAgentSubmission" }, () =>
    pool.query(
      `
    UPDATE public.field_agent_provider_submissions
    SET status = 'approved',
        rejection_reason = '',
        commission_amount = $3::numeric,
        updated_at = now()
    WHERE id = $1 AND tenant_id = $2
      AND status IN ('pending', 'info_needed', 'appealed')
    `,
      [sid, tid, commission]
    )
  );
  return r.rowCount === 1;
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
  const obs = p && p._obs ? p._obs : null;
  const r = await faAnalyticsObs.observeQuery({ obs, query: "fieldAgentSubmissions.rejectFieldAgentSubmission" }, () =>
    pool.query(
      `
    UPDATE public.field_agent_provider_submissions
    SET status = 'rejected',
        rejection_reason = $3,
        commission_amount = 0,
        updated_at = now()
    WHERE id = $1 AND tenant_id = $2
      AND status IN ('pending', 'info_needed', 'appealed')
    `,
      [sid, tid, reason.slice(0, 4000)]
    )
  );
  return r.rowCount === 1;
}

/**
 * pending | appealed → info_needed (moderator requests more information).
 * @param {import("pg").Pool} pool
 * @param {{ tenantId: number, submissionId: number }} p
 * @returns {Promise<boolean>}
 */
async function markFieldAgentSubmissionInfoNeeded(pool, p) {
  const tid = Number(p.tenantId);
  const sid = Number(p.submissionId);
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(sid) || sid < 1) return false;
  const obs = p && p._obs ? p._obs : null;
  const r = await faAnalyticsObs.observeQuery({ obs, query: "fieldAgentSubmissions.markFieldAgentSubmissionInfoNeeded" }, () =>
    pool.query(
      `
    UPDATE public.field_agent_provider_submissions
    SET status = 'info_needed',
        updated_at = now()
    WHERE id = $1 AND tenant_id = $2
      AND status IN ('pending', 'appealed')
    `,
      [sid, tid]
    )
  );
  return r.rowCount === 1;
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
  return r.rowCount === 1;
}

/**
 * @param {import("pg").Pool} pool
 * @param {{ tenantId: number, submissionId: number, commissionAmount: number }} p
 * @returns {Promise<boolean>}
 */
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
 * Bulk moderation wrapper for tenant-scoped submission ids.
 * Reuses the same single-item transition helpers and does not bypass transition rules.
 *
 * @param {import("pg").Pool} pool
 * @param {{
 *   tenantId: number,
 *   action: "approve"|"reject"|"info_needed"|"appeal",
 *   ids: number[],
 *   rejectionReason?: string,
 *   commissionAmount?: number
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
  const ids = [...new Set((Array.isArray(p.ids) ? p.ids : []).map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))].slice(
    0,
    500
  );
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
  const commission =
    p.commissionAmount != null && Number.isFinite(Number(p.commissionAmount)) && Number(p.commissionAmount) >= 0
      ? Number(p.commissionAmount)
      : 0;

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
    if (action === "approve") {
      ok = await approveFieldAgentSubmission(pool, {
        tenantId: tid,
        submissionId: id,
        commissionAmount: commission,
        _obs: p && p._obs ? p._obs : null,
      });
    } else if (action === "reject") {
      ok = await rejectFieldAgentSubmission(pool, {
        tenantId: tid,
        submissionId: id,
        rejectionReason,
        _obs: p && p._obs ? p._obs : null,
      });
    } else if (action === "info_needed") {
      ok = await markFieldAgentSubmissionInfoNeeded(pool, {
        tenantId: tid,
        submissionId: id,
        _obs: p && p._obs ? p._obs : null,
      });
    } else if (action === "appeal") {
      ok = await markFieldAgentSubmissionAppealed(pool, {
        tenantId: tid,
        submissionId: id,
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
  listApprovedForCompanyLinkageSelect,
  getSubmissionByIdForAdminLinkage,
  getSubmissionByIdForFieldAgent,
  duplicateExistsAgainstSubmissions,
  duplicateExistsCompaniesOrSignups,
  insertSubmission,
  updatePhotosAfterUpload,
  applyBulkSubmissionAction,
};
