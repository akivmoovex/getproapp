"use strict";

const {
  GENDER_VALUES,
  AGE_GROUP_OPTIONS,
  MINISTRY_INTEREST_OPTIONS,
} = require("./memberRegistration");

const REQUEST_TYPES = [
  "Baptism",
  "Baby dedication",
  "Wedding application",
  "Volunteer registration",
  "Facility booking",
  "Benevolence assistance",
  "Membership-related request",
  "Other",
];

const PRAYER_PRIVACY_LEVELS = [
  { value: "private_to_pastor", label: "Private to pastor only" },
  { value: "prayer_team", label: "Share with prayer team" },
  { value: "anonymous_summary", label: "Anonymous summary only" },
];

const PRAYER_URGENCY_LEVELS = [
  { value: "normal", label: "Normal" },
  { value: "soon", label: "Soon" },
  { value: "urgent", label: "Urgent" },
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

function validateProfileBody(body) {
  const form = {
    full_name: String(body.full_name || "").trim(),
    phone: String(body.phone || "").trim(),
    email: String(body.email || "").trim(),
    gender: String(body.gender || "").trim().toLowerCase(),
    age_group: String(body.age_group || "").trim(),
    address_area: String(body.address_area || "").trim(),
    ministry_interest: normalizeMinistryInterest(body.ministry_interest),
    emergency_contact_name: String(body.emergency_contact_name || "").trim(),
    emergency_contact_phone: String(body.emergency_contact_phone || "").trim(),
    communication_consent:
      body.communication_consent === true ||
      body.communication_consent === "1" ||
      body.communication_consent === "on" ||
      body.communication_consent === "true",
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

  return { ok: true, data: form, form };
}

function validateMemberRequestBody(body) {
  const requestType = String(body.request_type || "").trim();
  const subject = String(body.subject || "").trim().slice(0, 200);
  const description = String(body.description || "").trim().slice(0, 4000);
  const form = { request_type: requestType, subject, description };

  if (!REQUEST_TYPES.includes(requestType)) {
    return { ok: false, error: "Please select a valid request type.", form };
  }
  if (!subject) {
    return { ok: false, error: "Please enter a subject.", form };
  }
  if (!description) {
    return { ok: false, error: "Please describe your request.", form };
  }

  return { ok: true, data: form, form };
}

function validatePrayerRequestBody(body) {
  const prayerTopic = String(body.prayer_topic || "").trim().slice(0, 200);
  const details = String(body.details || "").trim().slice(0, 4000);
  const urgency = String(body.urgency || "normal").trim();
  const privacyLevel = String(body.privacy_level || "").trim();
  const form = { prayer_topic: prayerTopic, details, urgency, privacy_level: privacyLevel };

  if (!prayerTopic) {
    return { ok: false, error: "Please enter a prayer topic.", form };
  }
  if (!PRAYER_PRIVACY_LEVELS.some((p) => p.value === privacyLevel)) {
    return { ok: false, error: "Please select a privacy level.", form };
  }
  if (!PRAYER_URGENCY_LEVELS.some((u) => u.value === urgency)) {
    return { ok: false, error: "Please select an urgency level.", form };
  }

  return { ok: true, data: form, form };
}

function requestStatusLabel(status) {
  const map = {
    submitted: "Submitted",
    in_review: "In review",
    more_info_needed: "More info needed",
    approved: "Approved",
    rejected: "Rejected",
    completed: "Completed",
  };
  return map[status] || status;
}

function prayerStatusLabel(status) {
  const map = {
    submitted: "Submitted",
    acknowledged: "Acknowledged",
    assigned: "Assigned",
    in_follow_up: "In follow-up",
    reviewed: "Reviewed",
    closed: "Closed",
  };
  return map[status] || status;
}

module.exports = {
  REQUEST_TYPES,
  PRAYER_PRIVACY_LEVELS,
  PRAYER_URGENCY_LEVELS,
  validateProfileBody,
  validateMemberRequestBody,
  validatePrayerRequestBody,
  requestStatusLabel,
  prayerStatusLabel,
};
