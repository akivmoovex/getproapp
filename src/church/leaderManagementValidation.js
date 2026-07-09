"use strict";

const LEADER_ROLES = ["ministry_leader", "department_leader"];
const LEADER_STATUSES = ["active", "inactive"];
const MIN_PASSWORD_LENGTH = 8;

function leaderRoleLabel(role) {
  const map = {
    ministry_leader: "Ministry leader",
    department_leader: "Department leader (coming later)",
  };
  return map[role] || role;
}

function leaderStatusLabel(status) {
  const map = { active: "Active", inactive: "Inactive" };
  return map[status] || status;
}

function validateLeaderCreateBody(body) {
  const form = normalizeLeaderForm(body);
  const base = validateLeaderCommon(form, { requirePassword: true });
  if (!base.ok) return base;
  const password = String(form.temporary_password || "");
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Temporary password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
      form,
    };
  }
  return { ok: true, data: { ...base.data, password }, form };
}

function validateLeaderUpdateBody(body) {
  const form = normalizeLeaderForm(body);
  return validateLeaderCommon(form, { requirePassword: false });
}

function validatePasswordResetBody(body) {
  const newPassword = String((body && body.new_password) || "");
  const confirmPassword = String((body && body.confirm_password) || "");
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  if (newPassword !== confirmPassword) {
    return { ok: false, error: "Passwords do not match." };
  }
  return { ok: true, password: newPassword };
}

function normalizeLeaderForm(body) {
  const form = body || {};
  return {
    full_name: String(form.full_name || "").trim(),
    email: String(form.email || "").trim(),
    phone: String(form.phone || "").trim(),
    ministry_id: String(form.ministry_id || "").trim(),
    role: String(form.role || "ministry_leader").trim(),
    status: String(form.status || "active").trim(),
    notes: String(form.notes || "").trim(),
    temporary_password: String(form.temporary_password || ""),
  };
}

function validateLeaderCommon(form, { requirePassword }) {
  if (!form.full_name) {
    return { ok: false, error: "Leader name is required.", form };
  }
  if (!form.email && !form.phone) {
    return { ok: false, error: "Email or phone is required.", form };
  }
  const ministryId = Number(form.ministry_id);
  if (!Number.isFinite(ministryId) || ministryId <= 0) {
    return { ok: false, error: "Assigned ministry is required.", form };
  }
  if (form.role !== "ministry_leader") {
    return {
      ok: false,
      error: "Only ministry leader accounts are supported in this phase.",
      form,
    };
  }
  if (!LEADER_STATUSES.includes(form.status)) {
    return { ok: false, error: "Invalid status.", form };
  }
  return {
    ok: true,
    data: {
      full_name: form.full_name.slice(0, 200),
      email: form.email,
      phone: form.phone.slice(0, 64),
      ministry_id: ministryId,
      role: "ministry_leader",
      status: form.status,
      notes: form.notes.slice(0, 2000) || null,
    },
    form,
  };
}

module.exports = {
  LEADER_ROLES,
  LEADER_STATUSES,
  MIN_PASSWORD_LENGTH,
  leaderRoleLabel,
  leaderStatusLabel,
  validateLeaderCreateBody,
  validateLeaderUpdateBody,
  validatePasswordResetBody,
};
