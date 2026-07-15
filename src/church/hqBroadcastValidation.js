"use strict";

const BROADCAST_CATEGORIES = [
  "General",
  "Leadership",
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

const BROADCAST_AUDIENCES = [
  "public",
  "members",
  "branch_admins",
  "leaders",
  "all_logged_in",
  "ministry",
  "department",
  "event",
  "selected_recipients",
];

const BROADCAST_TARGET_SCOPES = ["all_branches", "selected_branches"];

const BROADCAST_STATUSES = [
  "draft",
  "preview",
  "audience_estimate",
  "approval",
  "scheduled",
  "processing",
  "published",
  "partially_failed",
  "failed",
  "cancelled",
  "archived",
];

const BROADCAST_FILTERS = [
  "all",
  "draft",
  "preview",
  "audience_estimate",
  "approval",
  "scheduled",
  "processing",
  "published",
  "partially_failed",
  "failed",
  "cancelled",
  "archived",
];

const BROADCAST_DELIVERY_CHANNELS = ["in_app", "email"];

const BROADCAST_PRIORITIES = ["normal", "important", "urgent", "emergency"];

const MEMBER_HQ_AUDIENCES = ["public", "members", "all_logged_in"];
const PUBLIC_HQ_AUDIENCES = ["public"];
const BRANCH_ADMIN_HQ_AUDIENCES = ["branch_admins", "all_logged_in"];
const LEADER_HQ_AUDIENCES = ["leaders", "all_logged_in"];

function broadcastStatusLabel(status) {
  const map = {
    draft: "Draft",
    preview: "Preview",
    audience_estimate: "Audience estimate",
    approval: "Approval",
    scheduled: "Scheduled",
    processing: "Processing",
    published: "Published",
    partially_failed: "Partially failed",
    failed: "Failed",
    cancelled: "Cancelled",
    archived: "Archived",
  };
  return map[status] || status;
}

function broadcastAudienceLabel(audience) {
  const map = {
    public: "Public",
    members: "Members",
    branch_admins: "Branch admins",
    leaders: "Leaders (role)",
    all_logged_in: "All logged-in users",
    ministry: "Ministry",
    department: "Group (department)",
    event: "Event",
    selected_recipients: "Selected recipients",
  };
  return map[audience] || audience;
}

function targetScopeLabel(scope) {
  const map = {
    all_branches: "All branches",
    selected_branches: "Selected branches",
  };
  return map[scope] || scope;
}

function priorityLabel(priority) {
  const map = {
    normal: "Normal",
    important: "Important",
    urgent: "Urgent",
    emergency: "Emergency",
  };
  return map[priority] || priority;
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

function parseIdList(body, field) {
  const raw = body && body[field];
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return [...new Set(list.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))];
}

function parseBranchIds(body) {
  return parseIdList(body, "branch_ids");
}

function parseSelectedRecipients(body) {
  const raw = body && body.selected_recipients;
  const tokens = Array.isArray(raw)
    ? raw
    : String(raw || "")
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
  const out = [];
  for (const token of tokens) {
    if (typeof token === "object" && token) {
      const recipient_type = String(token.recipient_type || "").trim();
      const recipient_id = Number(token.recipient_id);
      if (
        ["member", "branch_admin", "hq_admin", "leader"].includes(recipient_type) &&
        Number.isFinite(recipient_id) &&
        recipient_id > 0
      ) {
        out.push({ recipient_type, recipient_id });
      }
      continue;
    }
    const [type, idRaw] = String(token).split(":");
    const recipient_id = Number(idRaw);
    if (
      ["member", "branch_admin", "hq_admin", "leader"].includes(type) &&
      Number.isFinite(recipient_id) &&
      recipient_id > 0
    ) {
      out.push({ recipient_type: type, recipient_id });
    }
  }
  return out;
}

function parseDeliveryChannels(body) {
  const raw = body && body.delivery_channels;
  let list = [];
  if (Array.isArray(raw)) list = raw.map((c) => String(c).trim().toLowerCase());
  else if (raw) list = String(raw).split(",").map((c) => c.trim().toLowerCase());
  list = [...new Set(list.filter((c) => BROADCAST_DELIVERY_CHANNELS.includes(c)))];
  if (!list.length) list = ["in_app"];
  if (!list.includes("in_app")) list.unshift("in_app");
  return list;
}

/**
 * Email subject must not carry confidential detail (title/body).
 * Uses org label + category only.
 */
function safeBroadcastEmailSubject(orgName, category) {
  const cat = String(category || "General").trim().slice(0, 40) || "General";
  const org = String(orgName || "Church").trim().slice(0, 60) || "Church";
  return `${org}: ${cat} update`;
}

function parseCheckbox(value) {
  if (value === true || value === 1) return true;
  const raw = String(value || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "on" || raw === "yes";
}

function parseOptionalHttpUrl(value, fieldLabel) {
  const raw = String(value || "").trim();
  if (!raw) return { ok: true, value: null };
  if (raw.length > 2000) {
    return { ok: false, error: `${fieldLabel} is too long.` };
  }
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, error: `${fieldLabel} must be a valid URL.` };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: `${fieldLabel} must start with http:// or https://.` };
  }
  return { ok: true, value: raw };
}

function validateBroadcastBody(body, { requireBody = true } = {}) {
  const form = body || {};
  const title = String(form.title || "").trim();
  const broadcastBody = String(form.body || "").trim();
  const category = String(form.category || "General").trim();
  const audience = String(form.audience || "members").trim();
  const targetScope = String(form.target_scope || "all_branches").trim();
  const priority = String(form.priority || "normal").trim();
  const branchIds = parseBranchIds(form);
  const ministryIds = parseIdList(form, "ministry_ids");
  const departmentIds = parseIdList(form, "department_ids");
  const eventIds = parseIdList(form, "event_ids");
  const selectedRecipients = parseSelectedRecipients(form);
  const deliveryChannels = parseDeliveryChannels(form);
  const isPinned = parseCheckbox(form.is_pinned);
  const isFeatured = parseCheckbox(form.is_featured);
  const actionLabel = String(form.action_label || "").trim().slice(0, 200);

  const baseForm = {
    title,
    body: broadcastBody,
    category,
    audience,
    target_scope: targetScope,
    branch_ids: branchIds,
    ministry_ids: ministryIds,
    department_ids: departmentIds,
    event_ids: eventIds,
    selected_recipients: selectedRecipients,
    delivery_channels: deliveryChannels,
    priority,
    is_pinned: isPinned,
    is_featured: isFeatured,
    featured_until: form.featured_until || "",
    action_url: form.action_url || "",
    action_label: actionLabel,
    publish_at: form.publish_at || "",
    expires_at: form.expires_at || "",
  };

  if (!title) {
    return { ok: false, error: "Title is required.", form: baseForm };
  }
  if (requireBody && !broadcastBody) {
    return { ok: false, error: "Body is required.", form: baseForm };
  }
  if (!BROADCAST_CATEGORIES.includes(category)) {
    return { ok: false, error: "Invalid category.", form: baseForm };
  }
  if (!BROADCAST_AUDIENCES.includes(audience)) {
    return { ok: false, error: "Invalid audience.", form: baseForm };
  }
  if (!BROADCAST_TARGET_SCOPES.includes(targetScope)) {
    return { ok: false, error: "Invalid target scope.", form: baseForm };
  }
  if (!BROADCAST_PRIORITIES.includes(priority)) {
    return { ok: false, error: "Invalid priority.", form: baseForm };
  }
  if (targetScope === "selected_branches" && branchIds.length === 0) {
    return {
      ok: false,
      error: "Select at least one branch when targeting selected branches.",
      form: baseForm,
    };
  }
  if (audience === "ministry" && ministryIds.length === 0) {
    return { ok: false, error: "Select at least one ministry.", form: baseForm };
  }
  if (audience === "department" && departmentIds.length === 0) {
    return { ok: false, error: "Select at least one group (department).", form: baseForm };
  }
  if (audience === "event" && eventIds.length === 0) {
    return { ok: false, error: "Select at least one event.", form: baseForm };
  }
  if (audience === "selected_recipients" && selectedRecipients.length === 0) {
    return { ok: false, error: "Select at least one recipient.", form: baseForm };
  }

  const actionUrl = parseOptionalHttpUrl(form.action_url, "Action link URL");
  if (!actionUrl.ok) {
    return { ok: false, error: actionUrl.error, form: baseForm };
  }
  if (actionUrl.value && !actionLabel) {
    return { ok: false, error: "Action label is required when an action link URL is set.", form: baseForm };
  }
  if (actionLabel && !actionUrl.value) {
    return { ok: false, error: "Action link URL is required when an action label is set.", form: baseForm };
  }

  const publishAt = parseOptionalDateTime(form.publish_at);
  if (!publishAt.ok) {
    return { ok: false, error: publishAt.error, form: baseForm };
  }
  const expiresAt = parseOptionalDateTime(form.expires_at);
  if (!expiresAt.ok) {
    return { ok: false, error: expiresAt.error, form: baseForm };
  }
  if (publishAt.value && expiresAt.value && expiresAt.value <= publishAt.value) {
    return { ok: false, error: "Expiry must be after publish date.", form: baseForm };
  }

  const featuredUntil = parseOptionalDateTime(form.featured_until);
  if (!featuredUntil.ok) {
    return { ok: false, error: featuredUntil.error, form: baseForm };
  }
  if (featuredUntil.value && !isFeatured) {
    return { ok: false, error: "Set Featured when using a featured-until date.", form: baseForm };
  }

  return {
    ok: true,
    data: {
      title,
      body: broadcastBody,
      category,
      audience,
      target_scope: targetScope,
      branch_ids: branchIds,
      ministry_ids: ministryIds,
      department_ids: departmentIds,
      event_ids: eventIds,
      selected_recipients: selectedRecipients,
      delivery_channels: deliveryChannels,
      priority,
      is_pinned: isPinned,
      is_featured: isFeatured,
      featured_until: featuredUntil.value,
      action_url: actionUrl.value,
      action_label: actionUrl.value ? actionLabel : null,
      publish_at: publishAt.value,
      expires_at: expiresAt.value,
    },
    form: baseForm,
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
  BROADCAST_CATEGORIES,
  BROADCAST_AUDIENCES,
  BROADCAST_TARGET_SCOPES,
  BROADCAST_STATUSES,
  BROADCAST_FILTERS,
  BROADCAST_PRIORITIES,
  BROADCAST_DELIVERY_CHANNELS,
  MEMBER_HQ_AUDIENCES,
  PUBLIC_HQ_AUDIENCES,
  BRANCH_ADMIN_HQ_AUDIENCES,
  LEADER_HQ_AUDIENCES,
  broadcastStatusLabel,
  broadcastAudienceLabel,
  targetScopeLabel,
  priorityLabel,
  validateBroadcastBody,
  parseBranchIds,
  parseIdList,
  parseSelectedRecipients,
  parseDeliveryChannels,
  safeBroadcastEmailSubject,
  formatDateTimeLocal,
};
