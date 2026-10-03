"use strict";

/**
 * Platform admin service for ActiveClinic platform contact inquiries.
 */

const {
  listPlatformContactInquiries,
  findPlatformContactInquiryById,
  updatePlatformContactInquiryStatus,
  countReceivedPlatformContactInquiries,
} = require("../repositories/activeClinicPlatformContactInquiryRepository");

const RESULT = Object.freeze({
  OK: "ok",
  NOT_FOUND: "not_found",
  INVALID_STATUS: "invalid_status",
});

/**
 * @param {object} pool
 * @param {{ status?: string }} [opts]
 */
async function listPlatformContactInquiriesForAdmin(pool, opts) {
  const inquiries = await listPlatformContactInquiries(pool, opts);
  return {
    ok: true,
    inquiries: inquiries.map((row) => ({
      id: row.id,
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
 * @param {object} pool
 * @param {string} id
 */
async function getPlatformContactInquiryDetail(pool, id) {
  const row = await findPlatformContactInquiryById(pool, id);
  if (!row) {
    return { ok: false, code: RESULT.NOT_FOUND, inquiry: null };
  }
  return {
    ok: true,
    inquiry: {
      id: row.id,
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
 * @param {object} pool
 * @param {string} id
 * @param {{ status: string }} update
 */
async function updatePlatformContactInquiryStatusForAdmin(pool, id, update) {
  const validStatuses = ["received", "reviewed", "closed"];
  const newStatus = String(update.status || "").trim().toLowerCase();
  if (!validStatuses.includes(newStatus)) {
    return { ok: false, code: RESULT.INVALID_STATUS };
  }
  const updated = await updatePlatformContactInquiryStatus(pool, id, { status: newStatus });
  if (!updated) {
    return { ok: false, code: RESULT.NOT_FOUND };
  }
  return { ok: true, code: RESULT.OK };
}

/**
 * @param {object} pool
 */
async function countUnreadPlatformContactInquiries(pool) {
  return countReceivedPlatformContactInquiries(pool);
}

module.exports = {
  RESULT,
  listPlatformContactInquiriesForAdmin,
  getPlatformContactInquiryDetail,
  updatePlatformContactInquiryStatusForAdmin,
  countUnreadPlatformContactInquiries,
};
