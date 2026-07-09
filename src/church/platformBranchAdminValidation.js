"use strict";

const BRANCH_ADMIN_ROLES = ["branch_admin"];

function createFormFromBody(body) {
  const b = body || {};
  return {
    full_name: String(b.full_name || "").trim(),
    email: String(b.email || "").trim(),
    phone: String(b.phone || "").trim(),
    role: String(b.role || "branch_admin").trim(),
    temporary_password: String(b.temporary_password || ""),
    notes: String(b.notes || "").trim(),
  };
}

function editFormFromBody(body) {
  const b = body || {};
  return {
    full_name: String(b.full_name || "").trim(),
    email: String(b.email || "").trim(),
    phone: String(b.phone || "").trim(),
    role: String(b.role || "branch_admin").trim(),
    notes: String(b.notes || "").trim(),
  };
}

function adminToEditForm(admin) {
  if (!admin) return editFormFromBody({});
  return {
    full_name: String(admin.full_name || "").trim(),
    email: String(admin.email || "").trim(),
    phone: String(admin.phone || "").trim(),
    role: String(admin.role || "branch_admin").trim(),
    notes: String(admin.notes || "").trim(),
  };
}

function validateCreateBranchAdminBody(body) {
  const form = createFormFromBody(body);

  if (!form.full_name) {
    return { ok: false, error: "Full name is required.", form };
  }
  if (!form.email && !form.phone) {
    return { ok: false, error: "Email or phone is required.", form };
  }
  if (form.temporary_password.length < 8) {
    return { ok: false, error: "Temporary password must be at least 8 characters.", form };
  }
  if (!BRANCH_ADMIN_ROLES.includes(form.role)) {
    return { ok: false, error: "Invalid role.", form };
  }

  return {
    ok: true,
    form,
    data: {
      full_name: form.full_name,
      email: form.email || null,
      phone: form.phone || null,
      role: form.role,
      temporary_password: form.temporary_password,
      notes: form.notes || null,
    },
  };
}

function validateUpdateBranchAdminBody(body) {
  const form = editFormFromBody(body);

  if (!form.full_name) {
    return { ok: false, error: "Full name is required.", form };
  }
  if (!form.email && !form.phone) {
    return { ok: false, error: "Email or phone is required.", form };
  }
  if (!BRANCH_ADMIN_ROLES.includes(form.role)) {
    return { ok: false, error: "Invalid role.", form };
  }

  return {
    ok: true,
    form,
    data: {
      full_name: form.full_name,
      email: form.email || null,
      phone: form.phone || null,
      role: form.role,
      notes: form.notes || null,
    },
  };
}

function validateResetBranchAdminPasswordBody(body) {
  const newPassword = String((body && body.new_password) || "");
  const confirmPassword = String((body && body.confirm_password) || "");

  if (newPassword.length < 8) {
    return { ok: false, error: "New password must be at least 8 characters." };
  }
  if (newPassword !== confirmPassword) {
    return { ok: false, error: "Password confirmation does not match." };
  }

  return { ok: true, new_password: newPassword };
}

module.exports = {
  BRANCH_ADMIN_ROLES,
  createFormFromBody,
  editFormFromBody,
  adminToEditForm,
  validateCreateBranchAdminBody,
  validateUpdateBranchAdminBody,
  validateResetBranchAdminPasswordBody,
};
