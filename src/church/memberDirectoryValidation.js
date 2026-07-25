"use strict";

const {
  GENDER_VALUES,
  AGE_GROUP_OPTIONS,
  ATTENDANCE_DURATION_OPTIONS,
} = require("./memberRegistration");
const { normalizeMinistryInterest } = require("./memberPortalValidation");

const MEMBER_STATUS_FILTERS = ["all", "pending", "verified", "rejected", "suspended"];

/** Verification queue only surfaces pending registrations (existing status system). */
const VERIFICATION_STATUS_FILTERS = ["pending"];

function memberStatusLabel(status) {
  const map = {
    pending: "Pending",
    verified: "Verified",
    rejected: "Rejected",
    suspended: "Suspended",
  };
  return map[status] || status;
}

function verificationStatusLabel(status) {
  if (status === "pending") return "Pending Review";
  return memberStatusLabel(status);
}

/**
 * Allowlisted query parse for member directory (branch or HQ).
 * Invalid status/branch values fall back safely — never throw.
 * @param {Record<string, unknown>} query
 * @returns {{ status: string, q: string, branchId: number | null }}
 */
function parseMemberDirectoryQuery(query) {
  const raw = query && typeof query === "object" ? query : {};
  const statusRaw = String(raw.status || "all").trim().toLowerCase();
  const status = MEMBER_STATUS_FILTERS.includes(statusRaw) ? statusRaw : "all";
  const q = String(raw.q || "").trim().slice(0, 200);
  const branchRaw = String(raw.branch_id || raw.branchId || "").trim();
  let branchId = null;
  if (branchRaw !== "") {
    const n = Number(branchRaw);
    if (Number.isFinite(n) && n > 0 && Number.isInteger(n)) {
      branchId = n;
    }
  }
  return { status, q, branchId };
}

/**
 * Allowlisted query parse for member verification queue.
 * @param {Record<string, unknown>} query
 * @returns {{ status: string, q: string, branchId: number | null }}
 */
function parseVerificationQueueQuery(query) {
  const raw = query && typeof query === "object" ? query : {};
  const statusRaw = String(raw.status || "pending").trim().toLowerCase();
  const status = VERIFICATION_STATUS_FILTERS.includes(statusRaw) ? statusRaw : "pending";
  const q = String(raw.q || "").trim().slice(0, 200);
  const branchRaw = String(raw.branch_id || raw.branchId || "").trim();
  let branchId = null;
  if (branchRaw !== "") {
    const n = Number(branchRaw);
    if (Number.isFinite(n) && n > 0 && Number.isInteger(n)) {
      branchId = n;
    }
  }
  return { status, q, branchId };
}

/**
 * @param {{ q?: string, status?: string, branchId?: number | null }} filters
 * @param {{ hasMembersInScope?: boolean }} meta
 * @returns {"empty" | "no_results" | "results"}
 */
function resolveMemberListState(filters, members, meta = {}) {
  const list = Array.isArray(members) ? members : [];
  if (list.length > 0) return "results";
  const hasQuery = Boolean(filters && String(filters.q || "").trim());
  const statusActive = filters && filters.status && filters.status !== "all";
  const branchActive = Boolean(filters && filters.branchId);
  if (hasQuery || statusActive || branchActive) return "no_results";
  if (meta.hasMembersInScope === false) return "empty";
  return "empty";
}

function validateMemberProfileForAdmin(body) {
  const form = {
    full_name: String(body.full_name || "").trim(),
    phone: String(body.phone || "").trim(),
    email: String(body.email || "").trim(),
    gender: String(body.gender || "").trim().toLowerCase(),
    age_group: String(body.age_group || "").trim(),
    address_area: String(body.address_area || "").trim(),
    attendance_duration: String(body.attendance_duration || "").trim(),
    ministry_interest: normalizeMinistryInterest(body.ministry_interest),
    emergency_contact_name: String(body.emergency_contact_name || "").trim(),
    emergency_contact_phone: String(body.emergency_contact_phone || "").trim(),
  };

  if (!form.full_name || form.full_name.length < 2) {
    return { ok: false, error: "Full name is required.", form };
  }
  if (!form.phone || form.phone.replace(/\D/g, "").length < 7) {
    return { ok: false, error: "Please enter a valid phone number.", form };
  }
  if (!form.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
    return { ok: false, error: "Please enter a valid email address.", form };
  }
  if (!GENDER_VALUES.has(form.gender)) {
    return { ok: false, error: "Please select a gender option.", form };
  }
  if (!AGE_GROUP_OPTIONS.includes(form.age_group)) {
    return { ok: false, error: "Please select an age group.", form };
  }
  if (!form.address_area) {
    return { ok: false, error: "Address area is required.", form };
  }
  if (!ATTENDANCE_DURATION_OPTIONS.includes(form.attendance_duration)) {
    return { ok: false, error: "Please select an attendance duration.", form };
  }

  return { ok: true, data: form, form };
}

function validateAdminNoteBody(body) {
  const note = String((body && body.note) || "").trim().slice(0, 2000);
  if (!note) {
    return { ok: false, error: "Please enter a note." };
  }
  return { ok: true, note };
}

module.exports = {
  MEMBER_STATUS_FILTERS,
  VERIFICATION_STATUS_FILTERS,
  memberStatusLabel,
  verificationStatusLabel,
  parseMemberDirectoryQuery,
  parseVerificationQueueQuery,
  resolveMemberListState,
  validateMemberProfileForAdmin,
  validateAdminNoteBody,
};
