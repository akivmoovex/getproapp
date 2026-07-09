"use strict";

const ATTENDANCE_TYPES = [
  "Sunday service",
  "Midweek service",
  "Prayer meeting",
  "Ministry meeting",
  "Department meeting",
  "Youth meeting",
  "Women's meeting",
  "Men's meeting",
  "Children's ministry",
  "Outreach",
  "Conference",
];

function parseNonNegativeInt(value, fieldLabel) {
  const n = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: `${fieldLabel} must be a zero or positive whole number.` };
  }
  return { ok: true, value: n };
}

function parseNonNegativeMoney(value, fieldLabel) {
  const raw = String(value ?? "").trim().replace(/,/g, "");
  if (raw === "") return { ok: true, value: 0 };
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    return { ok: false, error: `${fieldLabel} must be zero or a positive number.` };
  }
  return { ok: true, value: Math.round(n * 100) / 100 };
}

/**
 * @param {Record<string, unknown>} body
 * @returns {{ ok: true, data: object, status: string } | { ok: false, error: string, form: object }}
 */
function validateAttendanceBody(body) {
  const submitAction = String(body.submit_action || "save_draft").trim();
  const status = submitAction === "submit" ? "submitted" : "draft";
  const attendanceType = String(body.attendance_type || "").trim();
  const serviceName = String(body.service_name || "").trim().slice(0, 200);
  const attendanceDate = String(body.attendance_date || "").trim();
  const notes = String(body.notes || "").trim().slice(0, 2000);

  const form = {
    attendance_type: attendanceType,
    service_name: serviceName,
    attendance_date: attendanceDate,
    notes,
  };

  if (!ATTENDANCE_TYPES.includes(attendanceType)) {
    return { ok: false, error: "Please select a valid attendance type.", form };
  }
  if (!serviceName) {
    return { ok: false, error: "Please enter a service or meeting name.", form };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(attendanceDate)) {
    return { ok: false, error: "Please enter a valid attendance date.", form };
  }

  const counts = {};
  for (const [key, label] of [
    ["adults_count", "Adults count"],
    ["youth_count", "Youth count"],
    ["children_count", "Children count"],
    ["first_time_visitors_count", "First-time visitors count"],
    ["new_members_count", "New members count"],
    ["volunteers_count", "Volunteers count"],
  ]) {
    const parsed = parseNonNegativeInt(body[key], label);
    if (!parsed.ok) return { ok: false, error: parsed.error, form: { ...form, ...counts } };
    counts[key] = parsed.value;
    form[key] = parsed.value;
  }

  return {
    ok: true,
    status,
    data: {
      attendance_type: attendanceType,
      service_name: serviceName,
      attendance_date: attendanceDate,
      notes,
      ...counts,
    },
  };
}

function totalAttendanceCounts(row) {
  return (
    Number(row.adults_count || 0) +
    Number(row.youth_count || 0) +
    Number(row.children_count || 0)
  );
}

module.exports = {
  ATTENDANCE_TYPES,
  validateAttendanceBody,
  totalAttendanceCounts,
  parseNonNegativeInt,
  parseNonNegativeMoney,
};
