"use strict";

const MINISTRY_VISIBILITIES = ["public", "members", "leaders"];
const MINISTRY_STATUSES = ["draft", "published", "archived"];
const DEPARTMENT_STATUSES = ["active", "archived"];

function slugifyName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function ministryStatusLabel(status) {
  const map = { draft: "Draft", published: "Published", archived: "Archived" };
  return map[status] || status;
}

function departmentStatusLabel(status) {
  const map = { active: "Active", archived: "Archived" };
  return map[status] || status;
}

function visibilityLabel(visibility) {
  const map = { public: "Public", members: "Members", leaders: "Leaders" };
  return map[visibility] || visibility;
}

function formatMinistrySchedule(ministry) {
  if (!ministry) return "—";
  const parts = [ministry.meeting_day, ministry.meeting_time].filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
}

function validateMinistryBody(body, { forPublish = false } = {}) {
  const form = body || {};
  const name = String(form.name || "").trim();
  const description = String(form.description || "").trim();
  const visibility = String(form.visibility || "members").trim();

  if (!name) {
    return { ok: false, error: "Ministry name is required.", form };
  }
  if (forPublish && !description) {
    return { ok: false, error: "Description is required before publishing.", form: { ...form, name } };
  }
  if (!MINISTRY_VISIBILITIES.includes(visibility)) {
    return { ok: false, error: "Invalid visibility.", form: { ...form, name } };
  }

  return {
    ok: true,
    data: {
      name,
      slug: slugifyName(form.slug || name) || slugifyName(name),
      description,
      leader_name: String(form.leader_name || "").trim(),
      leader_phone: String(form.leader_phone || "").trim() || null,
      meeting_day: String(form.meeting_day || "").trim() || null,
      meeting_time: String(form.meeting_time || "").trim() || null,
      location: String(form.location || "").trim() || null,
      visibility,
    },
    form: {
      name,
      slug: slugifyName(form.slug || name),
      description,
      leader_name: form.leader_name || "",
      leader_phone: form.leader_phone || "",
      meeting_day: form.meeting_day || "",
      meeting_time: form.meeting_time || "",
      location: form.location || "",
      visibility,
    },
  };
}

function validateDepartmentBody(body) {
  const form = body || {};
  const name = String(form.name || "").trim();
  if (!name) {
    return { ok: false, error: "Department name is required.", form };
  }
  return {
    ok: true,
    data: {
      name,
      slug: slugifyName(form.slug || name) || slugifyName(name),
      purpose: String(form.purpose || "").trim(),
      leader_name: String(form.leader_name || "").trim(),
      leader_phone: String(form.leader_phone || "").trim() || null,
    },
    form: {
      name,
      slug: slugifyName(form.slug || name),
      purpose: form.purpose || "",
      leader_name: form.leader_name || "",
      leader_phone: form.leader_phone || "",
    },
  };
}

function matchMinistriesByInterest(ministries, ministryInterest) {
  const interests = String(ministryInterest || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!interests.length) return [];
  return (ministries || []).filter((m) => {
    const slug = String(m.slug || "").toLowerCase();
    const name = String(m.name || "").toLowerCase();
    return interests.some((i) => slug.includes(i) || name.includes(i) || i.includes(slug));
  });
}

module.exports = {
  MINISTRY_VISIBILITIES,
  MINISTRY_STATUSES,
  DEPARTMENT_STATUSES,
  slugifyName,
  ministryStatusLabel,
  departmentStatusLabel,
  visibilityLabel,
  formatMinistrySchedule,
  validateMinistryBody,
  validateDepartmentBody,
  matchMinistriesByInterest,
};
