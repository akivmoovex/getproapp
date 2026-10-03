"use strict";

/**
 * Clinic admin service for ActiveClinic public contact inquiries.
 * Enforces organization-level scoping for tenant isolation.
 */

const {
  listPublicContactInquiriesForOrganization,
  findPublicContactInquiryByIdForOrganization,
  updatePublicContactInquiryStatusForOrganization,
  countReceivedPublicContactInquiriesForOrganization,
} = require("../repositories/activeClinicPublicContactInquiryRepository");

const RESULT = Object.freeze({
  OK: "ok",
  NOT_FOUND: "not_found",
  ACCESS_DENIED: "access_denied",
  INVALID_STATUS: "invalid_status",
});

/**
 * List public contact inquiries for a clinic organization.
 * @param {object} pool
 * @param {{ organizationId: string, facilityIds?: string[], status?: string }} opts
 */
async function listPublicContactInquiriesForClinicAdmin(pool, opts) {
  if (!opts.organizationId) {
    return { ok: false, code: RESULT.ACCESS_DENIED, inquiries: [] };
  }
  const inquiries = await listPublicContactInquiriesForOrganization(pool, {
    organizationId: opts.organizationId,
    facilityIds: opts.facilityIds || null,
    status: opts.status,
  });
  return {
    ok: true,
    inquiries: inquiries.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      facilityId: row.facility_id,
      senderName: row.sender_name,
      senderEmailDisplay: row.sender_email_display,
      senderPhoneDisplay: row.sender_phone_display,
      message: row.message,
      status: row.status,
      createdAt: row.created_at,
    })),
    filters: {
      status: (opts && opts.status) || "all",
    },
  };
}

/**
 * Get a single public contact inquiry, scoped to organization.
 * @param {object} pool
 * @param {string} id
 * @param {string} organizationId
 */
async function getPublicContactInquiryDetailForClinic(pool, id, organizationId) {
  if (!organizationId) {
    return { ok: false, code: RESULT.ACCESS_DENIED, inquiry: null };
  }
  const row = await findPublicContactInquiryByIdForOrganization(pool, id, organizationId);
  if (!row) {
    return { ok: false, code: RESULT.NOT_FOUND, inquiry: null };
  }
  return {
    ok: true,
    inquiry: {
      id: row.id,
      organizationId: row.organization_id,
      facilityId: row.facility_id,
      senderName: row.sender_name,
      senderEmailNormalized: row.sender_email_normalized,
      senderEmailDisplay: row.sender_email_display,
      senderPhoneNormalized: row.sender_phone_normalized,
      senderPhoneDisplay: row.sender_phone_display,
      message: row.message,
      status: row.status,
      createdAt: row.created_at,
    },
  };
}

/**
 * Update status of a public contact inquiry, scoped to organization.
 * @param {object} pool
 * @param {string} id
 * @param {string} organizationId
 * @param {{ status: string }} update
 */
async function updatePublicContactInquiryStatusForClinicAdmin(pool, id, organizationId, update) {
  if (!organizationId) {
    return { ok: false, code: RESULT.ACCESS_DENIED };
  }
  const validStatuses = ["received", "reviewed", "closed"];
  const newStatus = String(update.status || "").trim().toLowerCase();
  if (!validStatuses.includes(newStatus)) {
    return { ok: false, code: RESULT.INVALID_STATUS };
  }
  const updated = await updatePublicContactInquiryStatusForOrganization(pool, id, organizationId, {
    status: newStatus,
  });
  if (!updated) {
    return { ok: false, code: RESULT.NOT_FOUND };
  }
  return { ok: true, code: RESULT.OK };
}

/**
 * Count unread contact inquiries for a clinic organization.
 * @param {object} pool
 * @param {string} organizationId
 * @param {string[]|null} [facilityIds]
 */
async function countUnreadPublicContactInquiriesForClinic(pool, organizationId, facilityIds) {
  if (!organizationId) return 0;
  return countReceivedPublicContactInquiriesForOrganization(pool, organizationId, facilityIds);
}

module.exports = {
  RESULT,
  listPublicContactInquiriesForClinicAdmin,
  getPublicContactInquiryDetailForClinic,
  updatePublicContactInquiryStatusForClinicAdmin,
  countUnreadPublicContactInquiriesForClinic,
};
