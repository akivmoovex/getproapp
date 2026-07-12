"use strict";

const { getPgPool } = require("../../db/pg");
const platformInquiriesRepo = require("../../db/pg/church/platformInquiriesRepo");

function clientMetaFromRequest(req) {
  const ip = String(req.ip || req.connection?.remoteAddress || "").slice(0, 64);
  const userAgent = String(req.get("user-agent") || "").slice(0, 500);
  return { source_ip: ip || null, user_agent: userAgent || null };
}

/**
 * Log a notification intent without storing sensitive payload fields.
 * Email delivery is not implemented; inquiries remain in the database queue.
 */
function logPlatformInquiryReceived(inquiry) {
  if (!inquiry || !inquiry.id) return;
  // eslint-disable-next-line no-console
  console.log(
    "[blessboard-platform-inquiry]",
    JSON.stringify({
      op: "platform_inquiry_received",
      inquiryId: inquiry.id,
      inquiryType: inquiry.inquiry_type,
      status: inquiry.status,
    })
  );
}

async function persistPlatformInquiry(req, data) {
  const pool = getPgPool();
  if (!pool) {
    return { ok: false, error: "We could not save your request right now. Please try again shortly." };
  }
  const inquiry = await platformInquiriesRepo.createPlatformInquiry(pool, {
    ...data,
    ...clientMetaFromRequest(req),
  });
  try {
    logPlatformInquiryReceived(inquiry);
  } catch {
    /* logging must not block submission */
  }
  return { ok: true, inquiry };
}

async function submitPlatformInquiry(req, validationResult) {
  if (validationResult.honeypot) {
    return { ok: true, honeypot: true };
  }
  if (!validationResult.ok) {
    return validationResult;
  }
  return persistPlatformInquiry(req, validationResult.data);
}

module.exports = {
  submitPlatformInquiry,
  logPlatformInquiryReceived,
};
