"use strict";

const { ATTENDANCE_TYPES } = require("./attendanceValidation");

/**
 * Minimal member display for ushers — no email, phone, or full PII.
 * @param {{ full_name?: string, member_full_name?: string } | null} member
 * @returns {{ label: string, initials: string }}
 */
function usherMemberDisplay(member) {
  const name = String((member && (member.full_name || member.member_full_name)) || "").trim();
  if (!name) return { label: "Member", initials: "?" };
  const parts = name.split(/\s+/).filter(Boolean);
  const first = parts[0] || "Member";
  const lastInitial = parts.length > 1 ? `${parts[parts.length - 1].charAt(0).toUpperCase()}.` : "";
  const label = lastInitial ? `${first} ${lastInitial}` : first;
  const initials = parts
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
  return { label, initials: initials || "?" };
}

/**
 * @param {Record<string, unknown>} body
 */
function validateOpenSessionBody(body) {
  const attendanceType = String(body.attendance_type || "").trim();
  const serviceName = String(body.service_name || "").trim().slice(0, 200);
  const sessionDate = String(body.session_date || "").trim();
  const notes = String(body.notes || "").trim().slice(0, 2000);
  const form = { attendance_type: attendanceType, service_name: serviceName, session_date: sessionDate, notes };

  if (!ATTENDANCE_TYPES.includes(attendanceType)) {
    return { ok: false, error: "Please select a valid attendance type.", form };
  }
  if (!serviceName) {
    return { ok: false, error: "Please enter a service or meeting name.", form };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
    return { ok: false, error: "Please enter a valid session date.", form };
  }
  return { ok: true, data: { attendance_type: attendanceType, service_name: serviceName, session_date: sessionDate, notes } };
}

/**
 * @param {Record<string, unknown>} body
 */
function validateManualCheckInBody(body) {
  const memberId = Number.parseInt(String(body.member_id || "").trim(), 10);
  const sessionId = Number.parseInt(String(body.session_id || "").trim(), 10);
  if (!Number.isFinite(memberId) || memberId <= 0) {
    return { ok: false, error: "Please select a member to check in." };
  }
  if (!Number.isFinite(sessionId) || sessionId <= 0) {
    return { ok: false, error: "Please select an open service session." };
  }
  return { ok: true, data: { member_id: memberId, session_id: sessionId } };
}

/**
 * @param {Record<string, unknown>} body
 */
function validateVisitorCheckInBody(body) {
  const sessionId = Number.parseInt(String(body.session_id || "").trim(), 10);
  const visitorName = String(body.visitor_name || "").trim().slice(0, 200);
  const visitorPhone = String(body.visitor_phone || "").trim().slice(0, 32);
  if (!Number.isFinite(sessionId) || sessionId <= 0) {
    return { ok: false, error: "Please select an open service session." };
  }
  if (!visitorName) {
    return { ok: false, error: "Please enter the visitor name." };
  }
  return { ok: true, data: { session_id: sessionId, visitor_name: visitorName, visitor_phone: visitorPhone } };
}

/**
 * @param {Record<string, unknown>} body
 */
function validateQrCheckInBody(body) {
  const sessionId = Number.parseInt(String(body.session_id || "").trim(), 10);
  const qrToken = String(body.qr_token || "").trim();
  if (!Number.isFinite(sessionId) || sessionId <= 0) {
    return { ok: false, error: "Please select an open service session." };
  }
  if (!qrToken || qrToken.length < 16 || qrToken.length > 128) {
    return { ok: false, error: "Invalid QR code." };
  }
  if (/^\d+$/.test(qrToken)) {
    return { ok: false, error: "Invalid QR code." };
  }
  return { ok: true, data: { session_id: sessionId, qr_token: qrToken } };
}

/**
 * @param {Record<string, unknown>} body
 */
function validateCorrectionBody(body) {
  const reason = String(body.reason || "").trim().slice(0, 2000);
  const replacementKind = String(body.replacement_kind || "void_only").trim();
  if (!reason || reason.length < 3) {
    return { ok: false, error: "Please provide a correction reason (at least 3 characters)." };
  }
  if (!["void_only", "visitor", "member"].includes(replacementKind)) {
    return { ok: false, error: "Invalid correction action." };
  }
  const memberId = Number.parseInt(String(body.replacement_member_id || "").trim(), 10);
  const visitorName = String(body.replacement_visitor_name || "").trim().slice(0, 200);
  return {
    ok: true,
    data: {
      reason,
      replacement_kind: replacementKind,
      replacement_member_id: Number.isFinite(memberId) && memberId > 0 ? memberId : null,
      replacement_visitor_name: visitorName,
    },
  };
}

module.exports = {
  usherMemberDisplay,
  validateOpenSessionBody,
  validateManualCheckInBody,
  validateVisitorCheckInBody,
  validateQrCheckInBody,
  validateCorrectionBody,
};
