/**
 * Inbound “company profile” contact requests (table `leads`).
 *
 * Admin list/detail templates must only receive this allowlisted shape so client
 * contact fields are not mixed with arbitrary columns from `SELECT l.*` if the
 * schema grows. Company association is always explicit (`company_id`), never
 * inferred from category/city.
 */

/** SQL projection for admin company-lead queries (join companies for listing labels). */
const ADMIN_COMPANY_LEAD_SELECT = [
  "l.id",
  "l.company_id",
  "l.name",
  "l.phone",
  "l.email",
  "l.message",
  "l.status",
  "l.created_at",
  "l.updated_at",
  "c.name AS company_name",
  "c.subdomain AS company_subdomain",
].join(", ");

/**
 * @param {Record<string, unknown>|undefined|null} row
 * @returns {object|null}
 */
function mapAdminCompanyLeadRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    company_id: row.company_id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    message: row.message,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    company_name: row.company_name,
    company_subdomain: row.company_subdomain,
  };
}

module.exports = {
  ADMIN_COMPANY_LEAD_SELECT,
  mapAdminCompanyLeadRow,
};
