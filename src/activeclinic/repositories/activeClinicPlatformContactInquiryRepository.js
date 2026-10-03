"use strict";

/**
 * Repository for activeclinic.platform_contact_inquiries (platform-level contact form).
 * Statuses: received | reviewed | closed
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SELECT_COLUMNS = `
  id, sender_name, sender_email_normalized, sender_email_display,
  sender_phone_normalized, sender_phone_display, message, status, created_at
`;

/**
 * List platform contact inquiries with optional status filter.
 * @param {object} pool
 * @param {{ status?: string, limit?: number }} [opts]
 */
async function listPlatformContactInquiries(pool, opts = {}) {
  const status = String(opts.status || "all").trim().toLowerCase();
  const params = [];
  let where = "WHERE 1=1";
  if (status && status !== "all") {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }
  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 500);
  params.push(limit);
  const r = await pool.query(
    `SELECT ${SELECT_COLUMNS}
       FROM activeclinic.platform_contact_inquiries
       ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT $${params.length}`,
    params
  );
  return r.rows;
}

/**
 * Find a single platform contact inquiry by ID.
 * @param {object} pool
 * @param {string} id
 */
async function findPlatformContactInquiryById(pool, id) {
  if (!id || !UUID_RE.test(id)) return null;
  const r = await pool.query(
    `SELECT ${SELECT_COLUMNS}
       FROM activeclinic.platform_contact_inquiries
      WHERE id = $1
      LIMIT 1`,
    [id]
  );
  return r.rows[0] ?? null;
}

/**
 * Update the status of a platform contact inquiry.
 * @param {object} pool
 * @param {string} id
 * @param {{ status: string }} update
 */
async function updatePlatformContactInquiryStatus(pool, id, update) {
  if (!id || !UUID_RE.test(id)) return null;
  const validStatuses = ["received", "reviewed", "closed"];
  const newStatus = String(update.status || "").trim().toLowerCase();
  if (!validStatuses.includes(newStatus)) return null;
  const r = await pool.query(
    `UPDATE activeclinic.platform_contact_inquiries
        SET status = $1
      WHERE id = $2
      RETURNING ${SELECT_COLUMNS}`,
    [newStatus, id]
  );
  return r.rows[0] ?? null;
}

/**
 * Count platform contact inquiries with status='received' (unread).
 * @param {object} pool
 */
async function countReceivedPlatformContactInquiries(pool) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS count
       FROM activeclinic.platform_contact_inquiries
      WHERE status = 'received'`
  );
  return r.rows[0]?.count || 0;
}

module.exports = {
  listPlatformContactInquiries,
  findPlatformContactInquiryById,
  updatePlatformContactInquiryStatus,
  countReceivedPlatformContactInquiries,
};
