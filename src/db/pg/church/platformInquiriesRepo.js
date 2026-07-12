"use strict";

const SELECT_COLUMNS = `
  id, inquiry_type, full_name, email, phone, whatsapp,
  church_name, branch_name, city, country, role_in_church, branch_count,
  subject, message, consent_contact, status, source_ip, user_agent,
  created_at, updated_at
`;

async function createPlatformInquiry(pool, fields) {
  const r = await pool.query(
    `INSERT INTO public.church_platform_inquiries (
       inquiry_type, full_name, email, phone, whatsapp,
       church_name, branch_name, city, country, role_in_church, branch_count,
       subject, message, consent_contact, status, source_ip, user_agent
     ) VALUES (
       $1, $2, $3, $4, $5,
       $6, $7, $8, $9, $10, $11,
       $12, $13, $14, 'new', $15, $16
     )
     RETURNING ${SELECT_COLUMNS}`,
    [
      fields.inquiry_type,
      fields.full_name,
      fields.email || null,
      fields.phone || null,
      fields.whatsapp || null,
      fields.church_name || null,
      fields.branch_name || null,
      fields.city || null,
      fields.country || null,
      fields.role_in_church || null,
      fields.branch_count || null,
      fields.subject || null,
      fields.message,
      Boolean(fields.consent_contact),
      fields.source_ip || null,
      fields.user_agent || null,
    ]
  );
  return r.rows[0];
}

async function listPlatformInquiries(pool, opts = {}) {
  const params = [];
  const clauses = [];

  const inquiryType = String(opts.inquiry_type || "all").trim().toLowerCase();
  if (inquiryType && inquiryType !== "all") {
    params.push(inquiryType);
    clauses.push(`inquiry_type = $${params.length}`);
  }

  const status = String(opts.status || "all").trim().toLowerCase();
  if (status && status !== "all") {
    params.push(status);
    clauses.push(`status = $${params.length}`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 200);
  params.push(limit);

  const r = await pool.query(
    `SELECT ${SELECT_COLUMNS}
     FROM public.church_platform_inquiries
     ${where}
     ORDER BY created_at DESC, id DESC
     LIMIT $${params.length}`,
    params
  );
  return r.rows;
}

async function findPlatformInquiryById(pool, inquiryId) {
  const r = await pool.query(
    `SELECT ${SELECT_COLUMNS}
     FROM public.church_platform_inquiries
     WHERE id = $1
     LIMIT 1`,
    [inquiryId]
  );
  return r.rows[0] ?? null;
}

async function updatePlatformInquiryStatus(pool, inquiryId, status) {
  const r = await pool.query(
    `UPDATE public.church_platform_inquiries
     SET status = $1,
         updated_at = now()
     WHERE id = $2
     RETURNING ${SELECT_COLUMNS}`,
    [status, inquiryId]
  );
  return r.rows[0] ?? null;
}

async function countNewPlatformInquiries(pool) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM public.church_platform_inquiries
     WHERE status = 'new'`
  );
  return r.rows[0]?.count || 0;
}

module.exports = {
  createPlatformInquiry,
  listPlatformInquiries,
  findPlatformInquiryById,
  updatePlatformInquiryStatus,
  countNewPlatformInquiries,
};
