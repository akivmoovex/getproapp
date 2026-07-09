"use strict";

const GENDER_VALUES = new Set(["male", "female"]);

const AGE_GROUP_OPTIONS = [
  "Children (Under 13)",
  "Youth (13-19)",
  "Young Adult (20-35)",
  "Adult (36-60)",
  "Senior (60+)",
];

const ATTENDANCE_DURATION_OPTIONS = [
  "First time visitor",
  "Less than 6 months",
  "6 months - 1 year",
  "1 - 5 years",
  "Over 5 years",
];

const MINISTRY_INTEREST_OPTIONS = [
  { value: "choir", label: "Choir & Worship" },
  { value: "youth", label: "Youth Ministry" },
  { value: "ushers", label: "Ushers & Greeting" },
  { value: "media", label: "Media & Tech" },
  { value: "outreach", label: "Outreach & Missions" },
];

function normalizeMinistryInterest(raw) {
  if (Array.isArray(raw)) {
    return raw
      .map((v) => String(v || "").trim())
      .filter(Boolean)
      .slice(0, 10)
      .join(", ");
  }
  return String(raw || "")
    .trim()
    .slice(0, 500);
}

/**
 * @param {Record<string, unknown>} body
 * @returns {{ ok: true, data: object } | { ok: false, error: string, form: object }}
 */
function validateRegistrationBody(body) {
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
    password: String(body.password || ""),
    confirm_password: String(body.confirm_password || ""),
    accept_terms: body.accept_terms === "on" || body.accept_terms === "1" || body.accept_terms === true,
  };

  if (!form.full_name || form.full_name.length < 2) {
    return { ok: false, error: "Please enter your full name.", form };
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
    return { ok: false, error: "Please enter your address area.", form };
  }
  if (!ATTENDANCE_DURATION_OPTIONS.includes(form.attendance_duration)) {
    return { ok: false, error: "Please select how long you have been attending.", form };
  }
  if (!form.password || form.password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters.", form };
  }
  if (form.password !== form.confirm_password) {
    return { ok: false, error: "Passwords do not match.", form };
  }
  if (!form.accept_terms) {
    return { ok: false, error: "Please accept the privacy policy to continue.", form };
  }

  return { ok: true, data: form };
}

module.exports = {
  GENDER_VALUES,
  AGE_GROUP_OPTIONS,
  ATTENDANCE_DURATION_OPTIONS,
  MINISTRY_INTEREST_OPTIONS,
  validateRegistrationBody,
};
