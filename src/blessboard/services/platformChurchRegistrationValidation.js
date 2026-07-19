"use strict";

/**
 * Apex /register-church application validation.
 * Plan codes come from the public pricing catalogue (foundation / growth / network).
 * Customer "Free/Basic" maps to canonical stored code: foundation.
 * Instant Free (flag on) additionally validates organization key + password.
 */

const { TIER_PLAN_CODES } = require("../../church/platformPricingContent");
const { normalizeOrganizationKey } = require("./organizationKey");

const ALLOWED_PLANS = Object.freeze([...TIER_PLAN_CODES]);
const FREE_PLAN_CODE = "foundation";
/** Catalogue plan key used by the shared orchestrator. */
const ORCHESTRATOR_FREE_PLAN_KEY = "free";

/** Inbound aliases accepted from CTAs/query/body; always stored as FREE_PLAN_CODE. */
const PLAN_ALIASES = Object.freeze({
  foundation: FREE_PLAN_CODE,
  free: FREE_PLAN_CODE,
  basic: FREE_PLAN_CODE,
  basic_free: FREE_PLAN_CODE,
  growth: "growth",
  network: "network",
});

const PLAN_DISPLAY_LABELS = Object.freeze({
  foundation: "Foundation — Free",
  growth: "Growth",
  network: "Network",
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 10;
const PASSWORD_MAX = 200;

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
 * Normalize to a canonical catalogue plan code, or null.
 * Unknown values → null (never stored). Empty → null.
 * @param {unknown} raw
 * @returns {string | null}
 */
function normalizeSelectedPlan(raw) {
  const value = trim(raw, 40).toLowerCase();
  if (!value) return null;
  const mapped = PLAN_ALIASES[value];
  if (!mapped) return null;
  return ALLOWED_PLANS.includes(mapped) ? mapped : null;
}

/**
 * Map public / stored plan label to orchestrator catalogue key.
 * Only foundation (and aliases) map to free; others return null.
 * @param {unknown} raw
 * @returns {string | null}
 */
function mapPublicPlanToOrchestratorPlanKey(raw) {
  const canonical = normalizeSelectedPlan(raw);
  if (canonical === FREE_PLAN_CODE) return ORCHESTRATOR_FREE_PLAN_KEY;
  return null;
}

function isFreePlanSelection(raw) {
  return normalizeSelectedPlan(raw) === FREE_PLAN_CODE;
}

function planDisplayLabel(code) {
  const canonical = normalizeSelectedPlan(code);
  if (!canonical) return "";
  return PLAN_DISPLAY_LABELS[canonical] || canonical;
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
 * Same length policy as createBlessBoardUser / orchestrator (10–200).
 * Never logs or returns the password value.
 * @param {unknown} password
 * @param {unknown} passwordConfirm
 */
function validateAdministratorPassword(password, passwordConfirm) {
  const value = password != null ? String(password) : "";
  const confirm = passwordConfirm != null ? String(passwordConfirm) : "";
  if (!value) {
    return {
      ok: false,
      error: "Please choose a password for your administrator account.",
      field: "password",
    };
  }
  if (value.length < PASSWORD_MIN) {
    return {
      ok: false,
      error: `Password must be at least ${PASSWORD_MIN} characters.`,
      field: "password",
    };
  }
  if (value.length > PASSWORD_MAX) {
    return {
      ok: false,
      error: "Password is too long.",
      field: "password",
    };
  }
  if (value !== confirm) {
    return {
      ok: false,
      error: "Password confirmation does not match.",
      field: "password_confirm",
    };
  }
  return { ok: true, value };
}

/**
 * @param {unknown} raw
 */
function validateRequestedOrganizationKey(raw) {
  const rawTrim = trim(raw, 80);
  if (!rawTrim) {
    return {
      ok: false,
      error: "Please choose an organization key for your church workspace.",
      field: "organization_key",
    };
  }
  const norm = normalizeOrganizationKey(rawTrim);
  if (!norm.ok) {
    if (norm.reason === "reserved_key") {
      return {
        ok: false,
        error: "That organization key is reserved. Please choose another.",
        field: "organization_key",
      };
    }
    return {
      ok: false,
      error:
        "Use a lowercase letter first, then letters, numbers, hyphens, or underscores (up to 64 characters).",
      field: "organization_key",
    };
  }
  return { ok: true, value: norm.key };
}

/**
 * @param {object} body
 * @param {{
 *   selectedPlanHint?: string | null,
 *   instantFreeEnabled?: boolean,
 * }} [opts]
 */
function validatePlatformChurchRegistration(body, opts = {}) {
  if (isHoneypotTriggered(body)) {
    return { ok: true, honeypot: true, data: null };
  }

  const instantFreeEnabled = Boolean(opts.instantFreeEnabled);
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
      error: "Please confirm that you agree to the Terms and Privacy Policy.",
      field: "consent_contact",
    };
  }

  // Reject unknown plan strings when the client sent a non-empty value.
  const rawPlan = trim(body && body.selected_plan, 40);
  if (rawPlan && !normalizeSelectedPlan(rawPlan)) {
    return { ok: false, error: "Please select a valid plan interest.", field: "selected_plan" };
  }

  const wantsInstantFree =
    instantFreeEnabled && selectedPlan === FREE_PLAN_CODE;

  /** @type {string | null} */
  let organizationKey = null;
  /** @type {string | null} */
  let administratorPassword = null;

  if (wantsInstantFree) {
    const keyResult = validateRequestedOrganizationKey(body && body.organization_key);
    if (!keyResult.ok) return keyResult;
    organizationKey = keyResult.value;

    const passwordResult = validateAdministratorPassword(
      body && body.password,
      body && (body.password_confirm || body.password_confirmation)
    );
    if (!passwordResult.ok) return passwordResult;
    administratorPassword = passwordResult.value;
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
      organization_key: organizationKey,
      // Password stays on the validation result only for the orchestrator call —
      // never persisted on the application row.
      administrator_password: administratorPassword,
      wants_instant_free: wantsInstantFree,
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
    organization_key: trim(body && body.organization_key, 80),
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
    // Never echo passwords into form locals.
  };
}

module.exports = {
  ALLOWED_PLANS,
  FREE_PLAN_CODE,
  ORCHESTRATOR_FREE_PLAN_KEY,
  PLAN_ALIASES,
  PLAN_DISPLAY_LABELS,
  PASSWORD_MIN,
  PASSWORD_MAX,
  normalizeSelectedPlan,
  mapPublicPlanToOrchestratorPlanKey,
  isFreePlanSelection,
  planDisplayLabel,
  validatePlatformChurchRegistration,
  validateAdministratorPassword,
  validateRequestedOrganizationKey,
  formFromBody,
  isHoneypotTriggered,
};
