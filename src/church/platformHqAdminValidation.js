"use strict";

const HQ_ADMIN_ROLES = ["hq_admin"];

function createFormFromBody(body) {
  const b = body || {};
  return {
    full_name: String(b.full_name || "").trim(),
    email: String(b.email || "").trim(),
    phone: String(b.phone || "").trim(),
    role: String(b.role || "hq_admin").trim(),
    temporary_password: String(b.temporary_password || ""),
    confirm_password: String(b.confirm_password || ""),
    notes: String(b.notes || "").trim(),
  };
}

function looksLikeEmail(value) {
  const s = String(value || "").trim();
  if (!s) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function editFormFromBody(body) {
  const b = body || {};
  return {
    full_name: String(b.full_name || "").trim(),
    email: String(b.email || "").trim(),
    phone: String(b.phone || "").trim(),
    role: String(b.role || "hq_admin").trim(),
    notes: String(b.notes || "").trim(),
  };
}

function adminToEditForm(admin) {
  if (!admin) return editFormFromBody({});
  return {
    full_name: String(admin.full_name || "").trim(),
    email: String(admin.email || "").trim(),
    phone: String(admin.phone || "").trim(),
    role: String(admin.role || "hq_admin").trim(),
    notes: String(admin.notes || "").trim(),
  };
}

function validateCreateHqAdminBody(body) {
  const form = createFormFromBody(body);

  if (!form.full_name) {
    return { ok: false, error: "Name is required.", form };
  }
  if (!form.email) {
    return { ok: false, error: "Email is required.", form };
  }
  if (!looksLikeEmail(form.email)) {
    return { ok: false, error: "Enter a valid email address.", form };
  }
  if (form.temporary_password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters.", form };
  }
  if (form.temporary_password !== form.confirm_password) {
    return { ok: false, error: "Passwords do not match.", form };
  }
  if (!HQ_ADMIN_ROLES.includes(form.role)) {
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

function validateUpdateHqAdminBody(body) {
  const form = editFormFromBody(body);

  if (!form.full_name) {
    return { ok: false, error: "Full name is required.", form };
  }
  if (!form.email && !form.phone) {
    return { ok: false, error: "Email or phone is required.", form };
  }
  if (!HQ_ADMIN_ROLES.includes(form.role)) {
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

function validateResetHqAdminPasswordBody(body) {
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
  HQ_ADMIN_ROLES,
  createFormFromBody,
  editFormFromBody,
  adminToEditForm,
  validateCreateHqAdminBody,
  validateUpdateHqAdminBody,
  validateResetHqAdminPasswordBody,
};
