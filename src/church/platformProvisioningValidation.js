"use strict";

const { getChurchHostDomain } = require("./host");

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;
const ADMIN_USERNAME_PATTERN = /^[a-z0-9._-]{3,64}$/;
const RESERVED_SLUGS = new Set([
  "www",
  "admin",
  "api",
  "static",
  "mail",
  "app",
  "church",
  "global",
  "demo",
  "demo2",
  "zm",
  "blessboard",
  "getpro",
  "support",
]);

const BRANCH_HOST_RESERVED_SLUGS = new Set([
  ...RESERVED_SLUGS,
  "hq",
  "branch",
  "branches",
  "member",
  "login",
  "register",
  "assets",
  "about",
  "events",
  "sermons",
  "ministries",
  "leadership",
  "giving",
  "contact",
]);

const ORGANIZATION_RESERVED_SLUGS = new Set([
  "church",
  "www",
  "admin",
  "api",
  "app",
  "hq",
  "branch",
  "member",
  "login",
  "register",
  "static",
  "assets",
]);

/** Canonical packages accepted for new church provisioning (Foundation / Growth only). */
const PLAN_CODES = Object.freeze(["foundation", "growth"]);
/** Explicit default when plan_code is missing/empty — Foundation only (documented). */
const DEFAULT_PROVISIONING_PLAN_CODE = "foundation";
/** Known legacy / retired codes rejected for new provisioning (never silently remapped). */
const LEGACY_PLAN_CODES = Object.freeze(["free", "standard", "pro", "network"]);

function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function churchPublicHost(slug) {
  const domain = getChurchHostDomain();
  const s = normalizeSlug(slug);
  if (!s || !SLUG_PATTERN.test(s)) return "";
  return `${s}.${domain}`;
}

function churchPublicUrl(slug, path = "") {
  const host = churchPublicHost(slug);
  if (!host) return "";
  const suffix = String(path || "").trim();
  // Only allow relative path suffixes — never scheme-relative or absolute URLs.
  if (suffix && (!suffix.startsWith("/") || suffix.startsWith("//"))) return "";
  return suffix ? `https://${host}${suffix}` : `https://${host}`;
}

function validateSlugField(value, label, reservedSet = RESERVED_SLUGS) {
  const slug = normalizeSlug(value);
  if (!slug) {
    return { ok: false, error: `${label} is required.` };
  }
  if (!SLUG_PATTERN.test(slug)) {
    return { ok: false, error: `${label} must be lowercase letters, numbers, or hyphens.` };
  }
  if (reservedSet.has(slug)) {
    return { ok: false, error: `${label} is reserved.` };
  }
  return { ok: true, value: slug };
}

function validateBranchHostSlugField(value) {
  return validateSlugField(value, "Branch host slug", BRANCH_HOST_RESERVED_SLUGS);
}

function validateAdminUsername(value, label = "Admin") {
  const username = String(value || "")
    .trim()
    .toLowerCase();
  if (!username) return { ok: true, value: null };
  if (!ADMIN_USERNAME_PATTERN.test(username)) {
    return {
      ok: false,
      error: `${label} username must be 3–64 characters: lowercase letters, numbers, dots, hyphens, or underscores.`,
    };
  }
  return { ok: true, value: username };
}

function validateAdminAccount(body, prefix) {
  const fullName = String(body[`${prefix}_full_name`] || "").trim();
  const email = String(body[`${prefix}_email`] || "").trim();
  const phone = String(body[`${prefix}_phone`] || "").trim();
  const password = String(body[`${prefix}_temporary_password`] || "");
  const usernameField =
    prefix === "branch_admin" ? String(body.branch_admin_username || "").trim().toLowerCase() : "";
  const label =
    prefix === "hq" ? "HQ admin" : prefix === "branch_admin" ? "Branch admin" : "Admin";

  if (!fullName) {
    return { ok: false, error: `${label} full name is required.` };
  }
  if (!email && !phone) {
    return { ok: false, error: `${label} email or phone is required.` };
  }
  if (password.length < 8) {
    return { ok: false, error: `${label} temporary password must be at least 8 characters.` };
  }
  const usernameCheck = validateAdminUsername(usernameField, label);
  if (!usernameCheck.ok) return { ok: false, error: usernameCheck.error };
  return {
    ok: true,
    data: {
      full_name: fullName,
      email,
      phone,
      username: usernameCheck.value,
      temporary_password: password,
    },
  };
}

function parseBooleanField(value, defaultValue = true) {
  if (value == null || value === "") return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "off" || normalized === "0" || normalized === "false" || normalized === "no") {
    return false;
  }
  return true;
}

function normalizeBranchStatus(value) {
  const status = String(value || "active").trim().toLowerCase();
  if (status === "inactive" || status === "suspended") return "suspended";
  if (status === "archived") return "archived";
  return "active";
}

function formFromBody(body) {
  const b = body || {};
  return {
    organization_name: String(b.organization_name || "").trim(),
    organization_slug: normalizeSlug(b.organization_slug),
    country: String(b.country || "").trim(),
    city: String(b.city || "").trim(),
    primary_contact_name: String(b.primary_contact_name || "").trim(),
    primary_contact_phone: String(b.primary_contact_phone || "").trim(),
    primary_contact_email: String(b.primary_contact_email || "").trim(),
    plan_code: String(b.plan_code || DEFAULT_PROVISIONING_PLAN_CODE)
      .trim()
      .toLowerCase(),
    branch_name: String(b.branch_name || "").trim(),
    branch_host_slug: normalizeSlug(b.branch_host_slug),
    branch_city: String(b.branch_city || "").trim(),
    branch_country: String(b.branch_country || "").trim(),
    pastor_name: String(b.pastor_name || "").trim(),
    contact_phone: String(b.contact_phone || "").trim(),
    contact_email: String(b.contact_email || "").trim(),
    hq_full_name: String(b.hq_full_name || "").trim(),
    hq_email: String(b.hq_email || "").trim(),
    hq_phone: String(b.hq_phone || "").trim(),
    hq_temporary_password: String(b.hq_temporary_password || ""),
    branch_admin_full_name: String(b.branch_admin_full_name || "").trim(),
    branch_admin_email: String(b.branch_admin_email || "").trim(),
    branch_admin_phone: String(b.branch_admin_phone || "").trim(),
    branch_admin_username: String(b.branch_admin_username || "")
      .trim()
      .toLowerCase(),
    branch_admin_temporary_password: String(b.branch_admin_temporary_password || ""),
    branch_address: String(b.branch_address || "").trim(),
    branch_status: normalizeBranchStatus(b.branch_status),
    public_site_enabled: parseBooleanField(b.public_site_enabled, true),
    member_registration_enabled: parseBooleanField(b.member_registration_enabled, true),
  };
}

function validateProvisioningBody(body) {
  const form = formFromBody(body);

  if (!form.organization_name) {
    return { ok: false, error: "Organization name is required.", form };
  }
  if (!form.country) {
    return { ok: false, error: "Country is required.", form };
  }

  const orgSlug = validateSlugField(form.organization_slug, "Organization slug");
  if (!orgSlug.ok) return { ok: false, error: orgSlug.error, form };

  const branchSlug = validateBranchHostSlugField(form.branch_host_slug);
  if (!branchSlug.ok) return { ok: false, error: branchSlug.error, form };

  if (!form.branch_name) {
    return { ok: false, error: "Branch name is required.", form };
  }

  const planCode = form.plan_code || DEFAULT_PROVISIONING_PLAN_CODE;
  if (LEGACY_PLAN_CODES.includes(planCode)) {
    return {
      ok: false,
      error:
        `Legacy package "${planCode}" is not accepted for new provisioning. Choose foundation or growth.`,
      form,
    };
  }
  if (!PLAN_CODES.includes(planCode)) {
    return {
      ok: false,
      error: "Invalid package. New churches must use foundation or growth.",
      form,
    };
  }

  const hq = validateAdminAccount(form, "hq");
  if (!hq.ok) return { ok: false, error: hq.error, form };

  const branchAdmin = validateAdminAccount(form, "branch_admin");
  if (!branchAdmin.ok) return { ok: false, error: branchAdmin.error, form };

  return {
    ok: true,
    data: {
      organization: {
        name: form.organization_name,
        slug: orgSlug.value,
        country: form.country,
        city: form.city || null,
        primary_contact_name: form.primary_contact_name || null,
        primary_contact_phone: form.primary_contact_phone || null,
        primary_contact_email: form.primary_contact_email || null,
        plan_code: planCode,
        status: "active",
      },
      branch: {
        name: form.branch_name,
        slug: branchSlug.value,
        host_slug: branchSlug.value,
        city: form.branch_city || form.city || null,
        country: form.branch_country || form.country || null,
        pastor_name: form.pastor_name || null,
        contact_phone: form.contact_phone || null,
        contact_email: form.contact_email || null,
        location_text: form.branch_address || null,
        welcome_message: `Welcome to ${form.branch_name}`,
        service_times: "Sunday · Contact the church office for service times",
        status: form.branch_status,
        member_registration_enabled: form.member_registration_enabled,
      },
      hqAdmin: {
        full_name: hq.data.full_name,
        email: hq.data.email,
        phone: hq.data.phone,
        temporary_password: hq.data.temporary_password,
      },
      branchAdmin: {
        full_name: branchAdmin.data.full_name,
        email: branchAdmin.data.email,
        phone: branchAdmin.data.phone,
        username: branchAdmin.data.username,
        temporary_password: branchAdmin.data.temporary_password,
      },
      onboarding: {
        publishWebsite: form.public_site_enabled,
        memberRegistrationEnabled: form.member_registration_enabled,
      },
    },
    form,
  };
}

function addBranchFormFromBody(body) {
  const b = body || {};
  return {
    branch_name: String(b.branch_name || "").trim(),
    branch_host_slug: normalizeSlug(b.branch_host_slug),
    city: String(b.city || "").trim(),
    country: String(b.country || "").trim(),
    pastor_name: String(b.pastor_name || "").trim(),
    contact_phone: String(b.contact_phone || "").trim(),
    contact_email: String(b.contact_email || "").trim(),
    branch_admin_full_name: String(b.branch_admin_full_name || "").trim(),
    branch_admin_email: String(b.branch_admin_email || "").trim(),
    branch_admin_phone: String(b.branch_admin_phone || "").trim(),
    branch_admin_username: String(b.branch_admin_username || "")
      .trim()
      .toLowerCase(),
    branch_admin_temporary_password: String(b.branch_admin_temporary_password || ""),
  };
}

function validateOptionalEmail(value, label = "Contact email") {
  const email = String(value || "").trim();
  if (!email) return { ok: true, value: null };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: `${label} must be a valid email address.` };
  }
  return { ok: true, value: email };
}

function updateBranchFormFromBody(body) {
  const b = body || {};
  return {
    branch_name: String(b.branch_name || "").trim(),
    branch_host_slug: normalizeSlug(b.branch_host_slug),
    city: String(b.city || "").trim(),
    country: String(b.country || "").trim(),
    pastor_name: String(b.pastor_name || "").trim(),
    contact_phone: String(b.contact_phone || "").trim(),
    contact_email: String(b.contact_email || "").trim(),
  };
}

function branchToUpdateForm(branch) {
  if (!branch) return updateBranchFormFromBody({});
  return {
    branch_name: String(branch.name || "").trim(),
    branch_host_slug: normalizeSlug(branch.host_slug || branch.slug || ""),
    city: String(branch.city || "").trim(),
    country: String(branch.country || "").trim(),
    pastor_name: String(branch.pastor_name || "").trim(),
    contact_phone: String(branch.contact_phone || "").trim(),
    contact_email: String(branch.contact_email || "").trim(),
  };
}

function validateUpdateBranchBody(body) {
  const form = updateBranchFormFromBody(body);

  if (!form.branch_name) {
    return { ok: false, error: "Branch name is required.", form };
  }

  const hostSlug = validateBranchHostSlugField(form.branch_host_slug);
  if (!hostSlug.ok) return { ok: false, error: hostSlug.error, form };

  const email = validateOptionalEmail(form.contact_email);
  if (!email.ok) return { ok: false, error: email.error, form };

  return {
    ok: true,
    form,
    data: {
      name: form.branch_name,
      host_slug: hostSlug.value,
      slug: hostSlug.value,
      city: form.city || null,
      country: form.country || null,
      pastor_name: form.pastor_name || null,
      contact_phone: form.contact_phone || null,
      contact_email: email.value,
    },
  };
}

function updateOrganizationFormFromBody(body) {
  const b = body || {};
  return {
    organization_name: String(b.organization_name || "").trim(),
    organization_slug: normalizeSlug(b.organization_slug),
    country: String(b.country || "").trim(),
    city: String(b.city || "").trim(),
    primary_contact_name: String(b.primary_contact_name || "").trim(),
    primary_contact_phone: String(b.primary_contact_phone || "").trim(),
    primary_contact_email: String(b.primary_contact_email || "").trim(),
  };
}

function organizationToUpdateForm(organization) {
  if (!organization) return updateOrganizationFormFromBody({});
  return {
    organization_name: String(organization.name || "").trim(),
    organization_slug: normalizeSlug(organization.slug || ""),
    country: String(organization.country || "").trim(),
    city: String(organization.city || "").trim(),
    primary_contact_name: String(organization.primary_contact_name || "").trim(),
    primary_contact_phone: String(organization.primary_contact_phone || "").trim(),
    primary_contact_email: String(organization.primary_contact_email || "").trim(),
  };
}

function validateUpdateOrganizationBody(body) {
  const form = updateOrganizationFormFromBody(body);

  if (!form.organization_name) {
    return { ok: false, error: "Organization name is required.", form };
  }
  if (!form.country) {
    return { ok: false, error: "Country is required.", form };
  }

  const orgSlug = validateSlugField(form.organization_slug, "Organization slug", ORGANIZATION_RESERVED_SLUGS);
  if (!orgSlug.ok) return { ok: false, error: orgSlug.error, form };

  const email = validateOptionalEmail(form.primary_contact_email, "Primary contact email");
  if (!email.ok) return { ok: false, error: email.error, form };

  return {
    ok: true,
    form,
    data: {
      name: form.organization_name,
      slug: orgSlug.value,
      country: form.country,
      city: form.city || null,
      primary_contact_name: form.primary_contact_name || null,
      primary_contact_phone: form.primary_contact_phone || null,
      primary_contact_email: email.value,
    },
  };
}

function churchOrganizationEditFormFromBody(body) {
  const orgForm = updateOrganizationFormFromBody(body);
  const branchForm = updateBranchFormFromBody(body);
  return {
    ...orgForm,
    ...branchForm,
    member_registration_enabled: parseBooleanField(
      body && body.member_registration_enabled,
      true
    ),
  };
}

function churchOrganizationEditFormFromRecords(organization, branch) {
  const orgForm = organizationToUpdateForm(organization);
  const branchForm = branchToUpdateForm(branch);
  return {
    ...orgForm,
    ...branchForm,
    member_registration_enabled: branch ? branch.member_registration_enabled !== false : true,
  };
}

function validateUpdateChurchOrganizationEditBody(body) {
  const orgValidation = validateUpdateOrganizationBody(body);
  if (!orgValidation.ok) {
    return {
      ok: false,
      error: orgValidation.error,
      form: churchOrganizationEditFormFromBody(body),
    };
  }

  const branchValidation = validateUpdateBranchBody(body);
  if (!branchValidation.ok) {
    return {
      ok: false,
      error: branchValidation.error,
      form: churchOrganizationEditFormFromBody(body),
    };
  }

  const form = churchOrganizationEditFormFromBody(body);

  return {
    ok: true,
    form,
    organizationData: orgValidation.data,
    branchData: branchValidation.data,
    memberRegistrationEnabled: form.member_registration_enabled,
  };
}

function validateAddBranchBody(body, organization) {
  const form = addBranchFormFromBody(body);
  if (!form.branch_name) {
    return { ok: false, error: "Branch name is required.", form };
  }
  const hostSlug = validateBranchHostSlugField(form.branch_host_slug);
  if (!hostSlug.ok) return { ok: false, error: hostSlug.error, form };

  const branchAdmin = validateAdminAccount(form, "branch_admin");
  if (!branchAdmin.ok) return { ok: false, error: branchAdmin.error, form };

  const orgCountry = organization && organization.country ? String(organization.country).trim() : "";
  return {
    ok: true,
    data: {
      branch: {
        name: form.branch_name,
        slug: hostSlug.value,
        host_slug: hostSlug.value,
        city: form.city || null,
        country: form.country || orgCountry || null,
        pastor_name: form.pastor_name || null,
        contact_phone: form.contact_phone || null,
        contact_email: form.contact_email || null,
        status: "active",
      },
      branchAdmin: {
        full_name: branchAdmin.data.full_name,
        email: branchAdmin.data.email,
        phone: branchAdmin.data.phone,
        username: branchAdmin.data.username,
        temporary_password: branchAdmin.data.temporary_password,
      },
      onboarding: {
        publishWebsite: true,
        memberRegistrationEnabled: true,
      },
    },
    form,
  };
}

/**
 * Service-layer guard for new provisioning plan codes.
 * Empty/missing → Foundation (DEFAULT_PROVISIONING_PLAN_CODE). Documented intentional default.
 * Does not silently map legacy codes (e.g. pro → growth, network → growth).
 * @param {string} planCode
 * @returns {{ ok: true, value: string } | { ok: false, error: string }}
 */
function assertCanonicalProvisioningPlanCode(planCode) {
  const code = String(planCode || "")
    .trim()
    .toLowerCase();
  if (!code) {
    return { ok: true, value: DEFAULT_PROVISIONING_PLAN_CODE };
  }
  if (LEGACY_PLAN_CODES.includes(code)) {
    return {
      ok: false,
      error: `Legacy package "${code}" is not accepted for new provisioning. Choose foundation or growth.`,
    };
  }
  if (!PLAN_CODES.includes(code)) {
    return {
      ok: false,
      error: "Invalid package. New churches must use foundation or growth.",
    };
  }
  return { ok: true, value: code };
}

module.exports = {
  SLUG_PATTERN,
  ADMIN_USERNAME_PATTERN,
  RESERVED_SLUGS,
  BRANCH_HOST_RESERVED_SLUGS,
  ORGANIZATION_RESERVED_SLUGS,
  PLAN_CODES,
  DEFAULT_PROVISIONING_PLAN_CODE,
  LEGACY_PLAN_CODES,
  assertCanonicalProvisioningPlanCode,
  normalizeSlug,
  churchPublicHost,
  churchPublicUrl,
  validateAdminUsername,
  validateProvisioningBody,
  validateAddBranchBody,
  validateUpdateBranchBody,
  validateUpdateOrganizationBody,
  validateUpdateChurchOrganizationEditBody,
  updateBranchFormFromBody,
  updateOrganizationFormFromBody,
  branchToUpdateForm,
  organizationToUpdateForm,
  churchOrganizationEditFormFromBody,
  churchOrganizationEditFormFromRecords,
  addBranchFormFromBody,
  formFromBody,
  validateBranchHostSlugField,
};
