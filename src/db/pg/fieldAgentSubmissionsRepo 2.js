"use strict";

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
 * @param {import("pg").Pool} pool
 * @param {{ tenantId: number, submissionId: number, commissionAmount?: number }} p
 * @returns {Promise<boolean>}
 */
async function approveFieldAgentSubmission(pool, p) {
  const tid = Number(p.tenantId);
  const sid = Number(p.submissionId);
  const commission = p.commissionAmount != null && Number.isFinite(Number(p.commissionAmount)) ? Number(p.commissionAmount) : 0;
  if (!Number.isFinite(tid) || tid < 1 || !Number.isFinite(sid) || sid < 1) return false;
  const r = await pool.query(
    `
    UPDATE public.field_agent_provider_submissions
    SET status = 'approved',
        rejection_reason = '',
        commission_amount = $3::numeric,
        updated_at = now()
    WHERE id = $1 AND tenant_id = $2 AND status = 'pending'
    `,
    [sid, tid, commission]
  );
  return r.rowCount === 1;
}

/**
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
  const r = await pool.query(
    `
    UPDATE public.field_agent_provider_submissions
    SET status = 'rejected',
        rejection_reason = $3,
        commission_amount = 0,
        updated_at = now()
    WHERE id = $1 AND tenant_id = $2 AND status = 'pending'
    `,
    [sid, tid, reason.slice(0, 4000)]
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

async function duplicateExistsAgainstSubmissions(pool, tenantId, phoneNorm, whatsappNorm, excludeId) {
  const r = await pool.query(
    `
    SELECT id FROM public.field_agent_provider_submissions
    WHERE tenant_id = $1 AND status IN ('pending', 'approved')
      AND (
        ($2::text <> '' AND (phone_norm = $2 OR whatsapp_norm = $2))
        OR ($3::text <> '' AND (phone_norm = $3 OR whatsapp_norm = $3))
      )
      AND ($4::int IS NULL OR id <> $4)
    LIMIT 1
    `,
    [tenantId, phoneNorm || "", whatsappNorm || "", excludeId != null ? excludeId : null]
  );
  return { duplicate: r.rows.length > 0, id: r.rows[0]?.id };
}

/**
 * @param {string[]} normCandidates digit strings (canonical + legacy-expanded)
 */
async function duplicateExistsCompaniesOrSignups(pool, tenantId, normCandidates) {
  const uniq = [...new Set((normCandidates || []).map((x) => String(x || "").replace(/\D/g, "")).filter(Boolean))];
  for (const d of uniq) {
    const c = await pool.query(
      `SELECT 1 FROM public.companies WHERE tenant_id = $1 AND regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $2 LIMIT 1`,
      [tenantId, d]
    );
    if (c.rows.length) return { duplicate: true, source: "company_phone" };
    const p = await pool.query(
      `SELECT 1 FROM public.professional_signups WHERE tenant_id = $1 AND regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') = $2 LIMIT 1`,
      [tenantId, d]
    );
    if (p.rows.length) return { duplicate: true, source: "professional_signup_phone" };
    const feat = await pool.query(
      `SELECT 1 FROM public.companies WHERE tenant_id = $1 AND regexp_replace(COALESCE(featured_cta_phone, ''), '\\D', '', 'g') = $2 LIMIT 1`,
      [tenantId, d]
    );
    if (feat.rows.length) return { duplicate: true, source: "company_featured_phone" };
  }
  return { duplicate: false };
}

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

module.exports = {
  getSubmissionByIdForAdmin,
  listFieldAgentSubmissionsForAdmin,
  approveFieldAgentSubmission,
  rejectFieldAgentSubmission,
  updateFieldAgentSubmissionCommission,
  countByAgentAndStatus,
  sumCommissionLastDays,
  listRejectedWithReason,
  duplicateExistsAgainstSubmissions,
  duplicateExistsCompaniesOrSignups,
  insertSubmission,
  updatePhotosAfterUpload,
};
