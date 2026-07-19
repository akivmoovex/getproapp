"use strict";

/**
 * Apex /register-church application validation (pending inquiry only).
 * Plan codes are allowlisted; invalid query/body values normalize to null.
 */

const ALLOWED_PLANS = Object.freeze(["foundation", "growth", "network"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function trim(value, max) {
  return String(value == null ? "" : value)
    .trim()
    .slice(0, max);
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function isHoneypotTriggered(body) {
  return Boolean(trim(body && (body.company_website || body._gotcha), 200));
}

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
function normalizeSelectedPlan(raw) {
  const value = trim(raw, 40).toLowerCase();
  if (!value) return null;
  return ALLOWED_PLANS.includes(value) ? value : null;
}

function validateEmail(email) {
  const value = trim(email, 254).toLowerCase();
  if (!value) {
    return { ok: false, error: "Please enter your email address.", field: "email" };
  }
  if (!EMAIL_RE.test(value)) {
    return { ok: false, error: "Please enter a valid email address.", field: "email" };
  }
  return { ok: true, value };
}

function validatePhone(phone) {
  const value = trim(phone, 50);
  if (!value) {
    return { ok: false, error: "Please enter a phone number.", field: "phone" };
  }
  const digits = digitsOnly(value);
  if (digits.length < 7 || digits.length > 15) {
    return { ok: false, error: "Please enter a valid phone number.", field: "phone" };
  }
  return { ok: true, value };
}

/**
 * @param {object} body
 * @param {{ selectedPlanHint?: string | null }} [opts]
 */
function validatePlatformChurchRegistration(body, opts = {}) {
  if (isHoneypotTriggered(body)) {
    return { ok: true, honeypot: true, data: null };
  }

  const churchName = trim(body && body.church_name, 200);
  const country = trim(body && body.country, 120);
  const city = trim(body && body.city, 120);
  const contactName = trim((body && (body.contact_name || body.full_name)) || "", 200);
  const roleInChurch = trim(body && body.role_in_church, 120) || null;
  const branchName = trim(body && body.branch_name, 200) || null;
  const branchCount = trim(body && body.branch_count, 20) || null;
  const message = trim(body && body.message, 5000) || null;
  const selectedPlan =
    normalizeSelectedPlan(body && body.selected_plan) ||
    normalizeSelectedPlan(opts.selectedPlanHint) ||
    null;

  if (!churchName) {
    return { ok: false, error: "Please enter your church name.", field: "church_name" };
  }
  if (!country) {
    return { ok: false, error: "Please enter a country.", field: "country" };
  }
  if (!city) {
    return { ok: false, error: "Please enter a town or city.", field: "city" };
  }
  if (!contactName) {
    return { ok: false, error: "Please enter the contact person name.", field: "contact_name" };
  }
  if (!roleInChurch) {
    return { ok: false, error: "Please enter your role in the church.", field: "role_in_church" };
  }

  const emailResult = validateEmail(body && body.email);
  if (!emailResult.ok) return emailResult;

  const phoneResult = validatePhone(body && body.phone);
  if (!phoneResult.ok) return phoneResult;

  if (branchCount && !/^\d{1,3}$/.test(branchCount)) {
    return {
      ok: false,
      error: "Number of branches must be a whole number up to 999.",
      field: "branch_count",
    };
  }

  const consent =
    body &&
    (body.consent_contact === "on" ||
      body.consent_contact === "1" ||
      body.consent_contact === true ||
      body.consent_terms === "on" ||
      body.consent_terms === "1" ||
      body.consent_terms === true);
  if (!consent) {
    return {
      ok: false,
      error: "Please confirm that BlessBoard may contact you about this request.",
      field: "consent_contact",
    };
  }

  // Body may include an invalid plan string — reject only when present and not allowlisted.
  const rawPlan = trim(body && body.selected_plan, 40);
  if (rawPlan && !normalizeSelectedPlan(rawPlan)) {
    return { ok: false, error: "Please select a valid plan interest.", field: "selected_plan" };
  }

  return {
    ok: true,
    data: {
      church_name: churchName,
      country,
      city,
      contact_name: contactName,
      contact_email: emailResult.value,
      contact_phone: phoneResult.value,
      role_in_church: roleInChurch,
      branch_name: branchName,
      branch_count: branchCount,
      selected_plan: selectedPlan,
      message,
      consent_terms: true,
    },
  };
}

function formFromBody(body, opts = {}) {
  return {
    church_name: trim(body && body.church_name, 200),
    country: trim(body && body.country, 120),
    city: trim(body && body.city, 120),
    contact_name: trim((body && (body.contact_name || body.full_name)) || "", 200),
    role_in_church: trim(body && body.role_in_church, 120),
    branch_name: trim(body && body.branch_name, 200),
    branch_count: trim(body && body.branch_count, 20),
    email: trim(body && body.email, 254),
    phone: trim(body && body.phone, 50),
    selected_plan:
      normalizeSelectedPlan(body && body.selected_plan) ||
      normalizeSelectedPlan(opts.selectedPlanHint) ||
      "",
    message: trim(body && body.message, 5000),
    consent_contact:
      body &&
      (body.consent_contact === "on" ||
        body.consent_contact === "1" ||
        body.consent_contact === true ||
        body.consent_terms === "on" ||
        body.consent_terms === "1" ||
        body.consent_terms === true),
  };
}

module.exports = {
  ALLOWED_PLANS,
  normalizeSelectedPlan,
  validatePlatformChurchRegistration,
  formFromBody,
  isHoneypotTriggered,
};
