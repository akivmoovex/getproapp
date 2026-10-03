"use strict";

/**
 * Repository for activeclinic.public_contact_inquiries (tenant-scoped contact form).
 * All queries MUST filter by organization_id for tenant isolation.
 * Statuses: received | reviewed | closed
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const SELECT_COLUMNS = `
  id, organization_id, healthcare_organization_id, facility_id,
  sender_name, sender_email_normalized, sender_email_display,
  sender_phone_normalized, sender_phone_display, message, status, created_at
`;

/**
 * List public contact inquiries for an organization with optional filters.
 * @param {object} pool
 * @param {{ organizationId: string, facilityIds?: string[], status?: string, limit?: number }} opts
 */
async function listPublicContactInquiriesForOrganization(pool, opts) {
  const organizationId = opts.organizationId;
  if (!organizationId || !UUID_RE.test(organizationId)) {
    return [];
  }
  const params = [organizationId];
  let where = "WHERE organization_id = $1";

  // Facility scoping: restrict to authorized facilities if provided
  if (Array.isArray(opts.facilityIds) && opts.facilityIds.length > 0) {
    const validFacilityIds = opts.facilityIds.filter((id) => UUID_RE.test(id));
    if (validFacilityIds.length > 0) {
      // Include inquiries for these facilities OR inquiries without a facility (org-level)
      params.push(validFacilityIds);
      where += ` AND (facility_id = ANY($${params.length}) OR facility_id IS NULL)`;
    }
  }

  const status = String(opts.status || "all").trim().toLowerCase();
  if (status && status !== "all") {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }

  const limit = Math.min(Math.max(Number(opts.limit) || 100, 1), 500);
  params.push(limit);

  const r = await pool.query(
    `SELECT ${SELECT_COLUMNS}
       FROM activeclinic.public_contact_inquiries
       ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT $${params.length}`,
    params
  );
  return r.rows;
}

/**
 * Find a single public contact inquiry by ID, scoped to organization.
 * @param {object} pool
 * @param {string} id
 * @param {string} organizationId
 */
async function findPublicContactInquiryByIdForOrganization(pool, id, organizationId) {
  if (!id || !UUID_RE.test(id)) return null;
  if (!organizationId || !UUID_RE.test(organizationId)) return null;
  const r = await pool.query(
    `SELECT ${SELECT_COLUMNS}
       FROM activeclinic.public_contact_inquiries
      WHERE id = $1 AND organization_id = $2
      LIMIT 1`,
    [id, organizationId]
  );
  return r.rows[0] ?? null;
}

/**
 * Update the status of a public contact inquiry, scoped to organization.
 * @param {object} pool
 * @param {string} id
 * @param {string} organizationId
 * @param {{ status: string }} update
 */
async function updatePublicContactInquiryStatusForOrganization(pool, id, organizationId, update) {
  if (!id || !UUID_RE.test(id)) return null;
  if (!organizationId || !UUID_RE.test(organizationId)) return null;
  const validStatuses = ["received", "reviewed", "closed"];
  const newStatus = String(update.status || "").trim().toLowerCase();
  if (!validStatuses.includes(newStatus)) return null;
  const r = await pool.query(
    `UPDATE activeclinic.public_contact_inquiries
        SET status = $1
      WHERE id = $2 AND organization_id = $3
      RETURNING ${SELECT_COLUMNS}`,
    [newStatus, id, organizationId]
  );
  return r.rows[0] ?? null;
}

/**
 * Count public contact inquiries with status='received' (unread), scoped to organization.
 * @param {object} pool
 * @param {string} organizationId
 * @param {string[]|null} [facilityIds]
 */
async function countReceivedPublicContactInquiriesForOrganization(pool, organizationId, facilityIds) {
  if (!organizationId || !UUID_RE.test(organizationId)) return 0;
  const params = [organizationId];
  let where = "WHERE organization_id = $1 AND status = 'received'";

  if (Array.isArray(facilityIds) && facilityIds.length > 0) {
    const validFacilityIds = facilityIds.filter((id) => UUID_RE.test(id));
    if (validFacilityIds.length > 0) {
      params.push(validFacilityIds);
      where += ` AND (facility_id = ANY($${params.length}) OR facility_id IS NULL)`;
    }
  }

  const r = await pool.query(
    `SELECT COUNT(*)::int AS count
       FROM activeclinic.public_contact_inquiries
       ${where}`,
    params
  );
  return r.rows[0]?.count || 0;
}

module.exports = {
  listPublicContactInquiriesForOrganization,
  findPublicContactInquiryByIdForOrganization,
  updatePublicContactInquiryStatusForOrganization,
  countReceivedPublicContactInquiriesForOrganization,
};
