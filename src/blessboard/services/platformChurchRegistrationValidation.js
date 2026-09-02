"use strict";

/**
 * Apex /register-church application validation.
 * Plan codes come from the public pricing catalogue (foundation / growth / network).
 * Customer "Free/Basic" maps to canonical stored code: foundation.
 * Automatic provisioning (flag on) for Foundation and Growth validates organization
 * key + password. Network remains enquiry-only.
 */

const { TIER_PLAN_CODES } = require("../../church/platformPricingContent");
const { normalizeOrganizationKey, resolveBaseOrganizationKey } = require("./organizationKey");
const { normalizeRegistrationPhone } = require("./normalizeRegistrationPhone");
const { prepareBranchDisplayName } = require("./normalizeBranchDisplayName");
const {
  extractPhoneFieldsFromBody,
  listPhoneCountries,
} = require("../../platform/services/phoneNumberService");
const { resolveCountryCodeForUniqueness } = require("./normalizeChurchIdentity");
const {
  PUBLIC_PLAN_CODES,
  DB_PLAN_KEYS,
  ALLOWED_PUBLIC_PLAN_CODES,
  PUBLIC_DISPLAY_LABELS,
  normalizePublicPlanCode,
  mapPublicPlanToDbPlanKey,
  publicPlanDisplayLabel,
} = require("./registrationPlanMapping");

const ALLOWED_PLANS = Object.freeze([...TIER_PLAN_CODES]);
const FREE_PLAN_CODE = PUBLIC_PLAN_CODES.FOUNDATION;
const GROWTH_PLAN_CODE = PUBLIC_PLAN_CODES.GROWTH;
const NETWORK_PLAN_CODE = PUBLIC_PLAN_CODES.NETWORK;
/** Catalogue plan key used by the shared orchestrator for Foundation. */
const ORCHESTRATOR_FREE_PLAN_KEY = DB_PLAN_KEYS.FREE;
const ORCHESTRATOR_GROWTH_PLAN_KEY = DB_PLAN_KEYS.GROWTH;
/** Canonical DB key for Network (not used for automatic provisioning). */
const ORCHESTRATOR_NETWORK_PLAN_KEY = DB_PLAN_KEYS.PROFESSIONAL;

/** Inbound aliases accepted from CTAs/query/body; always stored as FREE_PLAN_CODE. */
const PLAN_ALIASES = Object.freeze({
  foundation: FREE_PLAN_CODE,
  free: FREE_PLAN_CODE,
  basic: FREE_PLAN_CODE,
  basic_free: FREE_PLAN_CODE,
  growth: GROWTH_PLAN_CODE,
  network: NETWORK_PLAN_CODE,
});

const PLAN_DISPLAY_LABELS = PUBLIC_DISPLAY_LABELS;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN = 10;
const PASSWORD_MAX = 200;

function trim(value, max) {
  return String(value == null ? "" : value)
    .trim()
    .slice(0, max);
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
  const mapped = normalizePublicPlanCode(raw);
  if (!mapped) return null;
  return ALLOWED_PLANS.includes(mapped) || ALLOWED_PUBLIC_PLAN_CODES.includes(mapped)
    ? mapped
    : null;
}

/**
 * Map public / stored plan label to orchestrator catalogue key for automatic provisioning.
 * Foundation → free; Growth → growth; Network → null (support-contact only; DB key is professional).
 * @param {unknown} raw
 * @returns {string | null}
 */
function mapPublicPlanToOrchestratorPlanKey(raw) {
  const dbKey = mapPublicPlanToDbPlanKey(raw);
  if (dbKey === ORCHESTRATOR_FREE_PLAN_KEY || dbKey === ORCHESTRATOR_GROWTH_PLAN_KEY) {
    return dbKey;
  }
  return null;
}

function isFreePlanSelection(raw) {
  return normalizeSelectedPlan(raw) === FREE_PLAN_CODE;
}

function isGrowthPlanSelection(raw) {
  return normalizeSelectedPlan(raw) === GROWTH_PLAN_CODE;
}

function isNetworkPlanSelection(raw) {
  return normalizeSelectedPlan(raw) === NETWORK_PLAN_CODE;
}

/** Plans that auto-provision when the emergency switch is enabled. */
function isInstantProvisionPlan(raw) {
  const canonical = normalizeSelectedPlan(raw);
  return canonical === FREE_PLAN_CODE || canonical === GROWTH_PLAN_CODE;
}

function planDisplayLabel(code) {
  return publicPlanDisplayLabel(code);
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

/**
 * Shared platform phone parser: structured country + national, or legacy `phone`.
 * Church location `country` is only a fallback when the caller did not send a
 * phone-country selector. Server env/validationMode is authoritative.
 *
 * @param {object} body
 * @param {{ churchCountry?: unknown, env?: object, validationMode?: string }} [opts]
 */
function validatePhone(body, opts = {}) {
  const fields = extractPhoneFieldsFromBody(body);
  const phoneCountry = fields.phoneCountry || null;
  const phoneNational = fields.phoneNational || null;
  return normalizeRegistrationPhone(fields.phone, {
    country: phoneCountry || opts.churchCountry || null,
    phoneCountry,
    phoneNational,
    env: opts.env,
    validationMode: opts.validationMode,
  });
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
function isKnownRegistrationCountry(iso) {
  const code = String(iso || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return false;
  return listPhoneCountries().some((row) => row.iso === code);
}

/**
 * Church physical country — ISO-2 from the shared phone/country catalogue.
 * @param {unknown} raw
 */
function validateChurchCountry(raw) {
  const iso = resolveCountryCodeForUniqueness(raw);
  if (!iso || !isKnownRegistrationCountry(iso)) {
    return { ok: false, error: "Please select a country.", field: "country" };
  }
  return { ok: true, value: iso };
}

/**
 * Server-authoritative organization key from church name. Submitted keys are ignored.
 * @param {unknown} churchName
 */
function deriveOrganizationKeyFromChurchName(churchName) {
  const derived = resolveBaseOrganizationKey(churchName);
  if (!derived.ok) {
    return {
      ok: false,
      error: "Please enter a church name we can use for your church URL.",
      field: "church_name",
    };
  }
  return { ok: true, value: derived.key };
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
 *   env?: object,
 *   validationMode?: string,
 * }} [opts]
 */
function validatePlatformChurchRegistration(body, opts = {}) {
  if (isHoneypotTriggered(body)) {
    return { ok: true, honeypot: true, data: null };
  }

  const instantFreeEnabled = Boolean(opts.instantFreeEnabled);
  const churchName = trim(body && body.church_name, 200);
  const countryResult = validateChurchCountry(body && body.country);
  const city = trim(body && body.city, 120);
  const contactName = trim((body && (body.contact_name || body.full_name)) || "", 200);
  const roleInChurch = trim(body && body.role_in_church, 120) || null;
  const branchPrepared = prepareBranchDisplayName(body && body.branch_name, {
    required: true,
    field: "branch_name",
    emptyMessage: "Please enter a branch name.",
  });
  if (!branchPrepared.ok) return branchPrepared;
  const branchName = branchPrepared.display;
  const branchCount = trim(body && body.branch_count, 20) || null;
  const message = trim(body && body.message, 5000) || null;
  const selectedPlan =
    normalizeSelectedPlan(body && body.selected_plan) ||
    normalizeSelectedPlan(opts.selectedPlanHint) ||
    null;

  if (!churchName) {
    return { ok: false, error: "Please enter your church name.", field: "church_name" };
  }
  if (!countryResult.ok) return countryResult;
  const country = countryResult.value;
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

  const phoneResult = validatePhone(body, {
    churchCountry: country,
    env: opts.env,
    validationMode: opts.validationMode,
  });
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

  const wantsInstantProvision =
    instantFreeEnabled && isInstantProvisionPlan(selectedPlan);

  /** @type {string | null} */
  let organizationKey = null;
  /** @type {string | null} */
  let administratorPassword = null;

  if (wantsInstantProvision) {
    const keyResult = deriveOrganizationKeyFromChurchName(churchName);
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
      contact_phone: phoneResult.display,
      contact_phone_normalized: phoneResult.normalized,
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
      // Compatibility name: true for Foundation or Growth auto-provision.
      wants_instant_free: wantsInstantProvision,
    },
  };
}

function formFromBody(body, opts = {}) {
  return {
    church_name: trim(body && body.church_name, 200),
    country: resolveCountryCodeForUniqueness(body && body.country) || trim(body && body.country, 8).toUpperCase(),
    city: trim(body && body.city, 120),
    contact_name: trim((body && (body.contact_name || body.full_name)) || "", 200),
    role_in_church: trim(body && body.role_in_church, 120),
    branch_name: trim(body && body.branch_name, 200),
    branch_count: trim(body && body.branch_count, 20),
    email: trim(body && body.email, 254),
    phone: trim(body && body.phone, 50),
    phone_country: trim(body && (body.phone_country || body.phoneCountry), 8).toUpperCase(),
    phone_national: trim(body && (body.phone_national || body.phoneNational), 50),
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

/**
 * Step 1 — church details, plan, website key preview fields.
 * @param {object} body
 * @param {{ selectedPlanHint?: string | null, instantFreeEnabled?: boolean }} [opts]
 */
function validateChurchRegistrationChurchStep(body, opts = {}) {
  if (isHoneypotTriggered(body)) {
    return { ok: true, honeypot: true, data: null };
  }
  const instantFreeEnabled = Boolean(opts.instantFreeEnabled);
  const churchName = trim(body && body.church_name, 200);
  const countryResult = validateChurchCountry(body && body.country);
  const city = trim(body && body.city, 120);
  const branchPrepared = prepareBranchDisplayName(body && body.branch_name, {
    required: true,
    field: "branch_name",
    emptyMessage: "Please enter a branch name.",
  });
  if (!branchPrepared.ok) return branchPrepared;
  const branchCount = trim(body && body.branch_count, 20) || null;
  const selectedPlan =
    normalizeSelectedPlan(body && body.selected_plan) ||
    normalizeSelectedPlan(opts.selectedPlanHint) ||
    null;

  if (!churchName) {
    return { ok: false, error: "Please enter your church name.", field: "church_name" };
  }
  if (!countryResult.ok) return countryResult;
  if (!city) {
    return { ok: false, error: "Please enter a town or city.", field: "city" };
  }
  if (branchCount && !/^\d{1,3}$/.test(branchCount)) {
    return {
      ok: false,
      error: "Number of branches must be a whole number up to 999.",
      field: "branch_count",
    };
  }
  const rawPlan = trim(body && body.selected_plan, 40);
  if (rawPlan && !normalizeSelectedPlan(rawPlan)) {
    return { ok: false, error: "Please select a valid plan interest.", field: "selected_plan" };
  }
  if (instantFreeEnabled && !selectedPlan) {
    return { ok: false, error: "Please select a plan.", field: "selected_plan" };
  }

  let organizationKey = null;
  if (instantFreeEnabled && isInstantProvisionPlan(selectedPlan)) {
    const keyResult = deriveOrganizationKeyFromChurchName(churchName);
    if (!keyResult.ok) return keyResult;
    organizationKey = keyResult.value;
  }

  return {
    ok: true,
    data: {
      church_name: churchName,
      country: countryResult.value,
      city,
      branch_name: branchPrepared.display,
      branch_count: branchCount,
      selected_plan: selectedPlan,
      message: trim(body && body.message, 5000) || null,
      organization_key: organizationKey,
    },
  };
}

/**
 * Step 2 — administrator contact + credentials.
 * @param {object} body
 * @param {{ instantFreeEnabled?: boolean, env?: object, validationMode?: string }} [opts]
 */
function validateChurchRegistrationAdministratorStep(body, opts = {}) {
  const instantFreeEnabled = Boolean(opts.instantFreeEnabled);
  const contactName = trim((body && (body.contact_name || body.full_name)) || "", 200);
  const roleInChurch = trim(body && body.role_in_church, 120) || null;
  const country = resolveCountryCodeForUniqueness(body && body.country);

  if (!contactName) {
    return { ok: false, error: "Please enter the contact person name.", field: "contact_name" };
  }
  if (!roleInChurch) {
    return { ok: false, error: "Please enter your role in the church.", field: "role_in_church" };
  }

  const emailResult = validateEmail(body && body.email);
  if (!emailResult.ok) return emailResult;

  const phoneResult = validatePhone(body, {
    churchCountry: country,
    env: opts.env,
    validationMode: opts.validationMode,
  });
  if (!phoneResult.ok) return phoneResult;

  const selectedPlan =
    normalizeSelectedPlan(body && body.selected_plan) ||
    normalizeSelectedPlan(opts.selectedPlanHint) ||
    null;
  const wantsInstantProvision =
    instantFreeEnabled && isInstantProvisionPlan(selectedPlan);

  /** @type {string | null} */
  let administratorPassword = null;
  if (wantsInstantProvision) {
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
      contact_name: contactName,
      contact_email: emailResult.value,
      contact_phone: phoneResult.display,
      contact_phone_normalized: phoneResult.normalized,
      role_in_church: roleInChurch,
      administrator_password: administratorPassword,
    },
  };
}

module.exports = {
  ALLOWED_PLANS,
  FREE_PLAN_CODE,
  GROWTH_PLAN_CODE,
  NETWORK_PLAN_CODE,
  ORCHESTRATOR_FREE_PLAN_KEY,
  ORCHESTRATOR_GROWTH_PLAN_KEY,
  ORCHESTRATOR_NETWORK_PLAN_KEY,
  PLAN_ALIASES,
  PLAN_DISPLAY_LABELS,
  PASSWORD_MIN,
  PASSWORD_MAX,
  normalizeSelectedPlan,
  mapPublicPlanToOrchestratorPlanKey,
  mapPublicPlanToDbPlanKey,
  isFreePlanSelection,
  isGrowthPlanSelection,
  isNetworkPlanSelection,
  isInstantProvisionPlan,
  planDisplayLabel,
  validatePlatformChurchRegistration,
  validateChurchRegistrationChurchStep,
  validateChurchRegistrationAdministratorStep,
  validateAdministratorPassword,
  validateChurchCountry,
  deriveOrganizationKeyFromChurchName,
  validateRequestedOrganizationKey,
  formFromBody,
  isHoneypotTriggered,
};
