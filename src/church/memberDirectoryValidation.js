"use strict";

const {
  GENDER_VALUES,
  AGE_GROUP_OPTIONS,
  ATTENDANCE_DURATION_OPTIONS,
} = require("./memberRegistration");
const { normalizeMinistryInterest } = require("./memberPortalValidation");

const MEMBER_STATUS_FILTERS = ["all", "pending", "verified", "rejected", "suspended"];

function memberStatusLabel(status) {
  const map = {
    pending: "Pending",
    verified: "Verified",
    rejected: "Rejected",
    suspended: "Suspended",
  };
  return map[status] || status;
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
  memberStatusLabel,
  validateMemberProfileForAdmin,
  validateAdminNoteBody,
};
