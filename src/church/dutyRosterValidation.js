"use strict";

const DUTY_STATUSES = ["draft", "confirmed", "cancelled"];

const ROLE_EXAMPLES = [
  "Ushering",
  "Worship team",
  "Children's ministry",
  "Media",
  "Security",
  "Cleaning",
  "Hospitality",
  "Prayer",
  "Scripture reading",
  "Offering collection",
];

function dutyStatusLabel(status) {
  const map = { draft: "Draft", confirmed: "Confirmed", cancelled: "Cancelled" };
  return map[status] || status;
}

function formatDutyDate(dutyDate) {
  if (!dutyDate) return "—";
  const d = dutyDate instanceof Date ? dutyDate : new Date(String(dutyDate).slice(0, 10));
  if (Number.isNaN(d.getTime())) return String(dutyDate);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
}

function assignedMemberDisplay(duty) {
  if (!duty) return "—";
  if (duty.assigned_member_full_name) return duty.assigned_member_full_name;
  if (duty.assigned_member_name) return duty.assigned_member_name;
  return "—";
}

function validateDutyBody(body, { forConfirm = false } = {}) {
  const form = body || {};
  const dutyDate = String(form.duty_date || "").trim().slice(0, 10);
  const serviceName = String(form.service_name || "").trim().slice(0, 200);
  const roleName = String(form.role_name || "").trim().slice(0, 200);
  const assignedMemberIdRaw = String(form.assigned_member_id || "").trim();
  const assignedMemberId = assignedMemberIdRaw ? Number(assignedMemberIdRaw) : null;
  const assignedMemberName = String(form.assigned_member_name || "").trim().slice(0, 200);
  const ministryIdRaw = String(form.ministry_id || "").trim();
  const ministryId = ministryIdRaw ? Number(ministryIdRaw) : null;
  const departmentIdRaw = String(form.department_id || "").trim();
  const departmentId = departmentIdRaw ? Number(departmentIdRaw) : null;
  const notes = String(form.notes || "").trim().slice(0, 2000);

  const normalizedForm = {
    duty_date: dutyDate,
    service_name: serviceName,
    role_name: roleName,
    assigned_member_id: assignedMemberIdRaw,
    assigned_member_name: assignedMemberName,
    ministry_id: ministryIdRaw,
    department_id: departmentIdRaw,
    notes,
  };

  if (!dutyDate || !/^\d{4}-\d{2}-\d{2}$/.test(dutyDate)) {
    return { ok: false, error: "Duty date is required (YYYY-MM-DD).", form: normalizedForm };
  }
  if (!serviceName) {
    return { ok: false, error: "Service name is required.", form: normalizedForm };
  }
  if (!roleName) {
    return { ok: false, error: "Role name is required.", form: normalizedForm };
  }
  if (!assignedMemberId && !assignedMemberName) {
    return { ok: false, error: "Assign a member or enter a name.", form: normalizedForm };
  }
  if (assignedMemberId && (!Number.isFinite(assignedMemberId) || assignedMemberId <= 0)) {
    return { ok: false, error: "Invalid member selection.", form: normalizedForm };
  }
  if (ministryId && (!Number.isFinite(ministryId) || ministryId <= 0)) {
    return { ok: false, error: "Invalid ministry selection.", form: normalizedForm };
  }
  if (departmentId && (!Number.isFinite(departmentId) || departmentId <= 0)) {
    return { ok: false, error: "Invalid department selection.", form: normalizedForm };
  }

  if (forConfirm && !assignedMemberId) {
    return {
      ok: false,
      error: "Select a verified member from the directory to confirm a duty.",
      form: normalizedForm,
    };
  }

  return {
    ok: true,
    data: {
      duty_date: dutyDate,
      service_name: serviceName,
      role_name: roleName,
      assigned_member_id: assignedMemberId,
      assigned_member_name: assignedMemberId ? null : assignedMemberName || null,
      ministry_id: ministryId,
      department_id: departmentId,
      notes: notes || null,
    },
    form: normalizedForm,
  };
}

module.exports = {
  DUTY_STATUSES,
  ROLE_EXAMPLES,
  dutyStatusLabel,
  formatDutyDate,
  assignedMemberDisplay,
  validateDutyBody,
};
