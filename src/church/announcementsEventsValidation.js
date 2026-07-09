"use strict";

const ANNOUNCEMENT_CATEGORIES = [
  "General",
  "Service",
  "Ministry",
  "Youth",
  "Women",
  "Men",
  "Children",
  "Prayer",
  "Outreach",
  "Urgent",
  "Other",
];

const ANNOUNCEMENT_AUDIENCES = ["public", "members", "leaders", "specific_ministry"];

const EVENT_VISIBILITIES = ["public", "members", "leaders"];

const ANNOUNCEMENT_STATUSES = ["draft", "published", "archived"];

const EVENT_STATUSES = ["draft", "published", "cancelled"];

function announcementStatusLabel(status) {
  const map = {
    draft: "Draft",
    published: "Published",
    archived: "Archived",
  };
  return map[status] || status;
}

function eventStatusLabel(status) {
  const map = {
    draft: "Draft",
    published: "Published",
    cancelled: "Cancelled",
  };
  return map[status] || status;
}

function audienceLabel(audience) {
  const map = {
    public: "Public",
    members: "Members",
    leaders: "Leaders",
    specific_ministry: "Specific ministry",
  };
  return map[audience] || audience;
}

function visibilityLabel(visibility) {
  const map = {
    public: "Public",
    members: "Members",
    leaders: "Leaders",
  };
  return map[visibility] || visibility;
}

function parseOptionalDateTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return { ok: true, value: null };
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    return { ok: false, error: "Invalid date or time." };
  }
  return { ok: true, value: d };
}

function parseEventDate(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return { ok: false, error: "Event date is required." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { ok: false, error: "Event date must be YYYY-MM-DD." };
  }
  const d = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(d.getTime())) {
    return { ok: false, error: "Invalid event date." };
  }
  return { ok: true, value: raw };
}

function validateAnnouncementBody(body, { requireBody = true } = {}) {
  const form = body || {};
  const title = String(form.title || "").trim();
  const announcementBody = String(form.body || "").trim();
  const category = String(form.category || "General").trim();
  const audience = String(form.audience || "members").trim();

  if (!title) {
    return { ok: false, error: "Title is required.", form };
  }
  if (requireBody && !announcementBody) {
    return { ok: false, error: "Body is required.", form: { ...form, title } };
  }
  if (!ANNOUNCEMENT_CATEGORIES.includes(category)) {
    return { ok: false, error: "Invalid category.", form: { ...form, title } };
  }
  if (!ANNOUNCEMENT_AUDIENCES.includes(audience)) {
    return { ok: false, error: "Invalid audience.", form: { ...form, title } };
  }

  const publishAt = parseOptionalDateTime(form.publish_at);
  if (!publishAt.ok) {
    return { ok: false, error: publishAt.error, form: { ...form, title } };
  }
  const expiresAt = parseOptionalDateTime(form.expires_at);
  if (!expiresAt.ok) {
    return { ok: false, error: expiresAt.error, form: { ...form, title } };
  }
  if (publishAt.value && expiresAt.value && expiresAt.value <= publishAt.value) {
    return { ok: false, error: "Expiry must be after publish date.", form: { ...form, title } };
  }

  return {
    ok: true,
    data: {
      title,
      body: announcementBody,
      category,
      audience,
      publish_at: publishAt.value,
      expires_at: expiresAt.value,
    },
    form: {
      title,
      body: announcementBody,
      category,
      audience,
      publish_at: form.publish_at || "",
      expires_at: form.expires_at || "",
    },
  };
}

function validateEventBody(body) {
  const form = body || {};
  const title = String(form.title || "").trim();
  const description = String(form.description || "").trim();
  const location = String(form.location || "").trim();
  const ministry = String(form.ministry_or_department || "").trim();
  const visibility = String(form.visibility || "members").trim();
  const startTime = String(form.start_time || "").trim();
  const endTime = String(form.end_time || "").trim();

  if (!title) {
    return { ok: false, error: "Event title is required.", form };
  }
  const eventDate = parseEventDate(form.event_date);
  if (!eventDate.ok) {
    return { ok: false, error: eventDate.error, form: { ...form, title } };
  }
  if (!EVENT_VISIBILITIES.includes(visibility)) {
    return { ok: false, error: "Invalid visibility.", form: { ...form, title } };
  }

  return {
    ok: true,
    data: {
      title,
      description,
      event_date: eventDate.value,
      start_time: startTime,
      end_time: endTime,
      location,
      ministry_or_department: ministry || null,
      visibility,
    },
    form: {
      title,
      description,
      event_date: eventDate.value,
      start_time: startTime,
      end_time: endTime,
      location,
      ministry_or_department: ministry,
      visibility,
    },
  };
}

function formatDateTimeLocal(value) {
  if (!value) return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

module.exports = {
  ANNOUNCEMENT_CATEGORIES,
  ANNOUNCEMENT_AUDIENCES,
  EVENT_VISIBILITIES,
  ANNOUNCEMENT_STATUSES,
  EVENT_STATUSES,
  announcementStatusLabel,
  eventStatusLabel,
  audienceLabel,
  visibilityLabel,
  validateAnnouncementBody,
  validateEventBody,
  formatDateTimeLocal,
};
