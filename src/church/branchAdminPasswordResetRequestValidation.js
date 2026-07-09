"use strict";

const { normalizeEmail, normalizePhone } = require("../db/pg/church/membersRepo");

const PUBLIC_SUCCESS_MESSAGE =
  "If your details match a branch administrator account, GetPro support will review your request.";

const PASSWORD_RESET_STATUSES = ["submitted", "reviewed", "reset_completed", "rejected"];
const PASSWORD_RESET_FILTERS = ["all", ...PASSWORD_RESET_STATUSES];

function passwordResetStatusLabel(status) {
  const map = {
    submitted: "Submitted",
    reviewed: "Reviewed",
    reset_completed: "Reset completed",
    rejected: "Rejected",
  };
  return map[String(status || "")] || String(status || "");
}

function validatePublicBranchAdminForgotPasswordBody(body) {
  const identifier = String((body && body.identifier) || "").trim().slice(0, 120);
  const full_name = String((body && body.full_name) || "").trim().slice(0, 150);
  const phoneRaw = String((body && body.phone) || "").trim();
  const emailRaw = String((body && body.email) || "").trim().slice(0, 254);

  if (!identifier) {
    return {
      ok: false,
      error: "Please enter your email or phone number.",
      form: { full_name, phone: phoneRaw, email: emailRaw },
    };
  }

  const email = emailRaw ? normalizeEmail(emailRaw) : "";
  if (emailRaw && (!email || !email.includes("@"))) {
    return {
      ok: false,
      error: "Please enter a valid email address.",
      form: { identifier, full_name, phone: phoneRaw, email: emailRaw },
    };
  }

  const phone = phoneRaw ? normalizePhone(phoneRaw) : "";

  return {
    ok: true,
    data: {
      identifier,
      full_name: full_name || null,
      phone: phone || null,
      email: email || null,
    },
    form: { identifier, full_name, phone: phoneRaw, email: emailRaw },
  };
}

function validatePlatformResetPasswordBody(body) {
  const new_password = String((body && body.new_password) || "");
  const confirm_password = String((body && body.confirm_password) || "");

  if (!new_password) {
    return { ok: false, error: "New password is required." };
  }
  if (new_password.length < 8) {
    return { ok: false, error: "New password must be at least 8 characters." };
  }
  if (!confirm_password) {
    return { ok: false, error: "Please confirm the new password." };
  }
  if (new_password !== confirm_password) {
    return { ok: false, error: "New password and confirmation do not match." };
  }

  return { ok: true, new_password, confirm_password };
}

function validateRejectPasswordResetBody(body) {
  const review_comment = String((body && body.review_comment) || "").trim().slice(0, 2000);
  if (review_comment.length < 3) {
    return { ok: false, error: "Please enter a rejection comment (at least 3 characters)." };
  }
  return { ok: true, review_comment };
}

function parsePlatformPasswordResetFilters(query) {
  const status = String((query && query.status) || "all").trim();
  const statusFilter = PASSWORD_RESET_FILTERS.includes(status) ? status : "all";
  const orgRaw = query && query.organization_id;
  const branchRaw = query && query.branch_id;
  const organizationId =
    orgRaw != null && String(orgRaw).trim() !== "" ? Number(orgRaw) : null;
  const branchId =
    branchRaw != null && String(branchRaw).trim() !== "" ? Number(branchRaw) : null;

  return {
    status: statusFilter,
    organization_id:
      organizationId != null && Number.isFinite(organizationId) && organizationId > 0
        ? organizationId
        : null,
    branch_id:
      branchId != null && Number.isFinite(branchId) && branchId > 0 ? branchId : null,
  };
}

module.exports = {
  PUBLIC_SUCCESS_MESSAGE,
  PASSWORD_RESET_STATUSES,
  PASSWORD_RESET_FILTERS,
  passwordResetStatusLabel,
  validatePublicBranchAdminForgotPasswordBody,
  validatePlatformResetPasswordBody,
  validateRejectPasswordResetBody,
  parsePlatformPasswordResetFilters,
};
