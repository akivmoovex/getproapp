"use strict";

const { validateBranchPathSlug } = require("./branchPathSlug");
const { validateAdminAccount } = require("./platformProvisioningValidation");

function hqCreateBranchFormFromBody(body) {
  const b = body && typeof body === "object" ? body : {};
  return {
    branch_name: String(b.branch_name || "").trim(),
    branch_slug: String(b.branch_slug || "").trim().toLowerCase(),
    location_text: String(b.location_text || "").trim(),
    service_times: String(b.service_times || "").trim(),
    city: String(b.city || "").trim(),
    country: String(b.country || "").trim(),
    pastor_name: String(b.pastor_name || "").trim(),
    contact_phone: String(b.contact_phone || "").trim(),
    contact_email: String(b.contact_email || "").trim(),
    branch_admin_full_name: String(b.branch_admin_full_name || "").trim(),
    branch_admin_email: String(b.branch_admin_email || "").trim(),
    branch_admin_phone: String(b.branch_admin_phone || "").trim(),
    branch_admin_temporary_password: String(b.branch_admin_temporary_password || ""),
    billing_acknowledged: String(b.billing_acknowledged || "") === "1",
  };
}

function validateHqCreateBranchBody(body, organization) {
  const form = hqCreateBranchFormFromBody(body);
  if (!form.branch_name) {
    return { ok: false, error: "Branch name is required.", form };
  }
  const slug = validateBranchPathSlug(form.branch_slug);
  if (!slug.ok) return { ok: false, error: slug.error, form };

  const branchAdmin = validateAdminAccount(form, "branch_admin");
  if (!branchAdmin.ok) return { ok: false, error: branchAdmin.error, form };

  const orgCountry = organization && organization.country ? String(organization.country).trim() : "";
  return {
    ok: true,
    form,
    data: {
      branch: {
        name: form.branch_name,
        slug: slug.slug,
        location_text: form.location_text || null,
        service_times: form.service_times || null,
        city: form.city || null,
        country: form.country || orgCountry || null,
        pastor_name: form.pastor_name || null,
        contact_phone: form.contact_phone || null,
        contact_email: form.contact_email || null,
      },
      branchAdmin: {
        full_name: branchAdmin.data.full_name,
        email: branchAdmin.data.email,
        phone: branchAdmin.data.phone,
        username: branchAdmin.data.username,
        temporary_password: branchAdmin.data.temporary_password,
      },
    },
  };
}

function validateHqActivateBranchBody(body) {
  const b = body && typeof body === "object" ? body : {};
  return {
    billingAcknowledged: String(b.billing_acknowledged || "") === "1",
    reason: String(b.reason || "").trim().slice(0, 2000) || null,
  };
}

function validateHqDeactivateBranchBody(body) {
  const b = body && typeof body === "object" ? body : {};
  return {
    reason: String(b.reason || "").trim().slice(0, 2000) || null,
  };
}

function validateHqMemberTransferBody(body) {
  const b = body && typeof body === "object" ? body : {};
  const toBranchId = Number(b.to_branch_id);
  return {
    toBranchId: Number.isFinite(toBranchId) && toBranchId > 0 ? toBranchId : null,
    reason: String(b.transfer_reason || b.reason || "").trim().slice(0, 2000) || null,
  };
}

module.exports = {
  hqCreateBranchFormFromBody,
  validateHqCreateBranchBody,
  validateHqActivateBranchBody,
  validateHqDeactivateBranchBody,
  validateHqMemberTransferBody,
};
