"use strict";

const { PRODUCT } = require("./constants");
const { toCanonicalLifecycle } = require("./lifecycle");

function formatTs(value) {
  if (!value) return "";
  try {
    return new Date(value).toISOString().replace("T", " ").slice(0, 16) + " UTC";
  } catch {
    return String(value).slice(0, 19);
  }
}

function detailHref(productCode, id) {
  if (productCode === PRODUCT.ACTIVECLINIC) {
    return `/admin/clinic-registrations/${encodeURIComponent(id)}`;
  }
  return `/admin/registration-applications/${encodeURIComponent(id)}`;
}

/**
 * Unified Platform Admin registration queue (read model).
 * Does not replace product-specific detail queues.
 */
async function listUnifiedRegistrations(db, filters) {
  const product = String((filters && filters.product) || "all").toLowerCase();
  const q = String((filters && filters.q) || "").trim();
  const limit = Math.min(Math.max(Number((filters && filters.limit) || 100) || 100, 1), 200);

  const churchRows =
    product === PRODUCT.ACTIVECLINIC
      ? { rows: [] }
      : await db.query(
          `SELECT
              id,
              church_name AS organization_name,
              contact_name AS applicant_name,
              contact_email AS applicant_email,
              created_at,
              application_status,
              provisioning_status,
              provisioning_error_code AS review_reason,
              organization_id,
              selected_plan
             FROM blessboard.platform_church_registration_applications
            ORDER BY created_at DESC
            LIMIT $1`,
          [limit]
        );

  const clinicRows =
    product === PRODUCT.BLESSBOARD
      ? { rows: [] }
      : await db.query(
          `SELECT
              id,
              clinic_name AS organization_name,
              contact_name AS applicant_name,
              contact_email_display AS applicant_email,
              created_at,
              status AS application_status,
              provisioning_status,
              last_provision_error AS review_reason,
              organization_id,
              NULL::text AS selected_plan
             FROM activeclinic.clinic_registration_applications
            ORDER BY created_at DESC
            LIMIT $1`,
          [limit]
        );

  const mapped = [];
  for (const row of clinicRows.rows || []) {
    mapped.push({
      id: row.id,
      productCode: PRODUCT.ACTIVECLINIC,
      productLabel: "ActiveClinic",
      organizationName: row.organization_name,
      applicantName: row.applicant_name,
      applicantEmail: row.applicant_email,
      createdAt: row.created_at,
      createdLabel: formatTs(row.created_at),
      storedStatus: row.application_status,
      provisioningStatus: row.provisioning_status,
      reviewReason: row.review_reason || null,
      organizationId: row.organization_id || null,
      plan: row.selected_plan || null,
      canonicalLifecycle: toCanonicalLifecycle(PRODUCT.ACTIVECLINIC, row),
      detailHref: detailHref(PRODUCT.ACTIVECLINIC, row.id),
    });
  }
  for (const row of churchRows.rows || []) {
    mapped.push({
      id: row.id,
      productCode: PRODUCT.BLESSBOARD,
      productLabel: "BlessBoard",
      organizationName: row.organization_name,
      applicantName: row.applicant_name,
      applicantEmail: row.applicant_email,
      createdAt: row.created_at,
      createdLabel: formatTs(row.created_at),
      storedStatus: row.application_status,
      provisioningStatus: row.provisioning_status,
      reviewReason: row.review_reason || null,
      organizationId: row.organization_id || null,
      plan: row.selected_plan || null,
      canonicalLifecycle: toCanonicalLifecycle(PRODUCT.BLESSBOARD, {
        ...row,
        application_status: row.application_status,
      }),
      detailHref: detailHref(PRODUCT.BLESSBOARD, row.id),
    });
  }

  mapped.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const needle = q.toLowerCase();
  const filtered = needle
    ? mapped.filter((row) => {
        const hay = `${row.organizationName || ""} ${row.applicantName || ""} ${row.applicantEmail || ""} ${row.productCode} ${row.canonicalLifecycle}`.toLowerCase();
        return hay.includes(needle);
      })
    : mapped;
  return filtered.slice(0, limit);
}

module.exports = {
  listUnifiedRegistrations,
};
