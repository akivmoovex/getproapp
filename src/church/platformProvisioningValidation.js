"use strict";

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;
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
  "zm",
]);

const BRANCH_HOST_RESERVED_SLUGS = new Set([
  ...RESERVED_SLUGS,
  "hq",
  "branch",
  "member",
  "login",
  "register",
  "assets",
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

const PLAN_CODES = ["free", "standard", "pro"];

function normalizeSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function churchPublicHost(slug) {
  const base = (process.env.BASE_DOMAIN || "getproapp.org").toLowerCase().trim();
  const s = normalizeSlug(slug);
  return s ? `${s}.church.${base}` : "";
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

function validateAdminAccount(body, prefix) {
  const fullName = String(body[`${prefix}_full_name`] || "").trim();
  const email = String(body[`${prefix}_email`] || "").trim();
  const phone = String(body[`${prefix}_phone`] || "").trim();
  const password = String(body[`${prefix}_temporary_password`] || "");
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
  return {
    ok: true,
    data: { full_name: fullName, email, phone, temporary_password: password },
  };
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
    plan_code: String(b.plan_code || "free").trim(),
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
    branch_admin_temporary_password: String(b.branch_admin_temporary_password || ""),
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

  const planCode = form.plan_code || "free";
  if (!PLAN_CODES.includes(planCode)) {
    return { ok: false, error: "Invalid plan code.", form };
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
        status: "active",
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
        temporary_password: branchAdmin.data.temporary_password,
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
        temporary_password: branchAdmin.data.temporary_password,
      },
    },
    form,
  };
}

module.exports = {
  SLUG_PATTERN,
  RESERVED_SLUGS,
  BRANCH_HOST_RESERVED_SLUGS,
  ORGANIZATION_RESERVED_SLUGS,
  PLAN_CODES,
  normalizeSlug,
  churchPublicHost,
  validateProvisioningBody,
  validateAddBranchBody,
  validateUpdateBranchBody,
  validateUpdateOrganizationBody,
  updateBranchFormFromBody,
  updateOrganizationFormFromBody,
  branchToUpdateForm,
  organizationToUpdateForm,
  addBranchFormFromBody,
  formFromBody,
  validateBranchHostSlugField,
};
