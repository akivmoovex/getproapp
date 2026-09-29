"use strict";

function parseTime(value) {
  const raw = String(value || "").trim();
  if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(raw)) return null;
  const parts = raw.split(":").map(Number);
  const h = parts[0];
  const m = parts[1];
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

function parseDateTime(value) {
  const d = new Date(String(value || "").trim());
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function validateSettingsBody(body) {
  const b = body && typeof body === "object" ? body : {};
  const duration = Number(b.default_duration_minutes || 30);
  const buffer = Number(b.buffer_minutes || 0);
  const reminder = Number(b.reminder_hours_before || 24);
  if (!Number.isFinite(duration) || duration < 5 || duration > 480) {
    return { ok: false, error: "Duration must be 5–480 minutes." };
  }
  if (!Number.isFinite(buffer) || buffer < 0 || buffer > 120) {
    return { ok: false, error: "Buffer must be 0–120 minutes." };
  }
  if (!Number.isFinite(reminder) || reminder < 1 || reminder > 168) {
    return { ok: false, error: "Reminder must be 1–168 hours before." };
  }
  return {
    ok: true,
    data: {
      default_duration_minutes: Math.floor(duration),
      buffer_minutes: Math.floor(buffer),
      reminder_hours_before: Math.floor(reminder),
    },
  };
}

function validateAvailabilityBody(body) {
  const b = body && typeof body === "object" ? body : {};
  const ministerId = Number(b.minister_admin_id);
  const dow = Number(b.day_of_week);
  const start = parseTime(b.start_time);
  const end = parseTime(b.end_time);
  if (!Number.isFinite(ministerId) || ministerId <= 0) {
    return { ok: false, error: "Select a minister." };
  }
  if (!Number.isFinite(dow) || dow < 0 || dow > 6) {
    return { ok: false, error: "Day of week must be 0–6." };
  }
  if (!start || !end || end <= start) {
    return { ok: false, error: "Provide a valid start and end time." };
  }
  return {
    ok: true,
    data: {
      minister_admin_id: ministerId,
      day_of_week: Math.floor(dow),
      start_time: start,
      end_time: end,
      is_recurring: String(b.is_recurring || "1") !== "0",
    },
  };
}

function validateLeaveBody(body) {
  const b = body && typeof body === "object" ? body : {};
  const ministerId = Number(b.minister_admin_id);
  const startsAt = parseDateTime(b.starts_at);
  const endsAt = parseDateTime(b.ends_at);
  if (!Number.isFinite(ministerId) || ministerId <= 0) {
    return { ok: false, error: "Select a minister." };
  }
  if (!startsAt || !endsAt || endsAt <= startsAt) {
    return { ok: false, error: "Leave requires a valid start and end." };
  }
  return {
    ok: true,
    data: {
      minister_admin_id: ministerId,
      starts_at: startsAt,
      ends_at: endsAt,
      reason: String(b.reason || "").trim().slice(0, 500),
    },
  };
}

function validateBookingBody(body, defaults = {}) {
  const b = body && typeof body === "object" ? body : {};
  const ministerId = Number(b.minister_admin_id);
  const memberId = Number(b.member_id);
  const startsAt = parseDateTime(b.starts_at);
  const duration = Number(b.duration_minutes || defaults.default_duration_minutes || 30);
  if (!Number.isFinite(ministerId) || ministerId <= 0) {
    return { ok: false, error: "Select a minister." };
  }
  if (!startsAt) return { ok: false, error: "Provide a start time." };
  if (!Number.isFinite(duration) || duration < 5 || duration > 480) {
    return { ok: false, error: "Duration must be 5–480 minutes." };
  }
  const endsAt = new Date(startsAt.getTime() + duration * 60 * 1000);
  return {
    ok: true,
    data: {
      minister_admin_id: ministerId,
      member_id: Number.isFinite(memberId) && memberId > 0 ? memberId : null,
      starts_at: startsAt,
      ends_at: endsAt,
      duration_minutes: Math.floor(duration),
      purpose: String(b.purpose || "").trim().slice(0, 200),
      member_request_note: String(b.member_request_note || "").trim().slice(0, 500),
    },
  };
}

function validateConfidentialNoteBody(body) {
  const note = String((body && body.note_body) || "").trim();
  if (!note || note.length > 8000) {
    return { ok: false, error: "Confidential note is required (max 8000 characters)." };
  }
  return { ok: true, note_body: note };
}

module.exports = {
  validateSettingsBody,
  validateAvailabilityBody,
  validateLeaveBody,
  validateBookingBody,
  validateConfidentialNoteBody,
};
