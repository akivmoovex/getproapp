"use strict";

/**
 * Phase3 website audit log service — records and presents website workflow events.
 */

const auditRepo = require("../repositories/websiteAuditRepository");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  LOOKUP_ERROR: "lookup_error",
});

const ACTION_LABELS = Object.freeze({
  website_edit_started: "Website edit started",
  draft_saved: "Draft saved",
  submission_created: "Submission created",
  submission_submitted: "Submission submitted",
  submission_resubmitted: "Submission resubmitted",
  submission_withdrawn: "Submission withdrawn",
  changes_approved: "Changes approved",
  changes_requested: "Changes requested",
  submission_rejected: "Submission rejected",
  website_published: "Website published",
  version_restored: "Version restored",
  previous_website_restore_started: "Previous website restore started",
  previous_website_restored_as_draft: "Previous website restored as draft",
  restored_draft_opened: "Restored draft opened",
  restored_draft_discarded: "Restored draft discarded",
  previous_website_restore_failed: "Previous website restore failed",
  theme_changed: "Theme changed",
  image_uploaded: "Image uploaded",
  image_replaced: "Image replaced",
  section_hidden: "Section hidden",
  section_reordered: "Section reordered",
  edit_conflict_force_replace: "Edit conflict force replace",
  edit_conflict_saved_as_draft: "Edit conflict saved as draft",
  approval_settings_updated: "Approval settings updated",
});

const SENSITIVE_KEYS = Object.freeze(
  new Set([
    "password",
    "password_hash",
    "secret",
    "token",
    "session",
    "session_token",
    "csrf",
    "csrf_token",
    "authorization",
    "cookie",
    "prayer",
    "prayer_request",
    "prayerrequest",
    "member",
    "member_email",
    "member_phone",
    "payment",
    "card_number",
    "cvv",
    "iban",
    "raw_body",
    "headers",
  ])
);

function sanitizeObject(value, depth) {
  if (value == null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    if (typeof value === "string") return { value: value.slice(0, 500) };
    if (typeof value === "number" || typeof value === "boolean") return { value };
    return {};
  }
  if (depth > 3) return {};
  const out = {};
  for (const [key, raw] of Object.entries(value)) {
    const k = String(key).toLowerCase();
    if (
      SENSITIVE_KEYS.has(k) ||
      k.includes("password") ||
      k.includes("secret") ||
      k.includes("token")
    ) {
      continue;
    }
    if (raw == null) continue;
    if (typeof raw === "string") {
      out[key] = raw.slice(0, 500);
    } else if (typeof raw === "number" || typeof raw === "boolean") {
      out[key] = raw;
    } else if (typeof raw === "object" && !Array.isArray(raw)) {
      out[key] = sanitizeObject(raw, depth + 1);
    } else if (Array.isArray(raw)) {
      out[key] = raw.slice(0, 20).map((item) => {
        if (item == null) return null;
        if (typeof item === "object") return sanitizeObject(item, depth + 1);
        return String(item).slice(0, 200);
      });
    }
  }
  return out;
}

function presentFields(obj) {
  const safe = sanitizeObject(obj || {}, 0);
  return Object.keys(safe).map((key) => ({
    key,
    label: key
      .replace(/_/g, " ")
      .replace(/([A-Z])/g, " $1")
      .replace(/^\w/, (c) => c.toUpperCase()),
    value: typeof safe[key] === "object" ? JSON.stringify(safe[key]) : String(safe[key]),
  }));
}

function buildSummary(event) {
  const action = ACTION_LABELS[event.actionType] || event.actionType;
  const who = event.actorName || "Someone";
  const page = event.pageKey ? ` on ${event.pageKey}` : "";
  const section = event.sectionKey ? ` / ${event.sectionKey}` : "";
  return `${who}: ${action}${page}${section}`;
}

/**
 * @param {import('pg').Pool|import('pg').PoolClient} db
 * @param {object} input
 */
async function recordWebsiteAuditEvent(db, input) {
  if (!auditRepo.isUuid(input.organizationId) || !input.actionType) {
    throw Object.assign(new Error("invalid_audit_event"), { code: "INVALID_AUDIT" });
  }
  return auditRepo.insertAuditEvent(db, {
    organizationId: input.organizationId,
    branchId: input.branchId || null,
    actorUserId: input.actorUserId || null,
    actorRole: input.actorRole || null,
    actionType: String(input.actionType).slice(0, 80),
    pageKey: input.pageKey || null,
    sectionKey: input.sectionKey || null,
    entityType: input.entityType || null,
    entityId: input.entityId || null,
    result: input.result || "success",
    before: sanitizeObject(input.before || {}, 0),
    after: sanitizeObject(input.after || {}, 0),
    metadata: sanitizeObject(input.metadata || {}, 0),
  });
}

async function recordWebsiteAuditEventInTransaction(db, input) {
  return recordWebsiteAuditEvent(db, input);
}

/**
 * @param {import('pg').Pool} db
 * @param {object} opts
 */
async function listWebsiteAuditEvents(db, opts) {
  const organizationId = opts && opts.organizationId;
  if (!auditRepo.isUuid(organizationId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "tenant" };
  }
  try {
    const [list, actors, actionTypes] = await Promise.all([
      auditRepo.listAuditEvents(db, {
        organizationId,
        actionType: opts.actionType || null,
        actorUserId: opts.actorUserId || null,
        actorRole: opts.actorRole || null,
        branchId: opts.branchId || null,
        pageKey: opts.pageKey || null,
        result: opts.result || null,
        from: opts.from || null,
        to: opts.to || null,
        limit: opts.limit,
        offset: opts.offset,
      }),
      auditRepo.listAuditActors(db, organizationId),
      auditRepo.listAuditActionTypes(db, organizationId),
    ]);
    return {
      ok: true,
      status: STATUS.OK,
      items: list.items.map((e) => ({
        ...e,
        actionLabel: ACTION_LABELS[e.actionType] || e.actionType,
      })),
      total: list.total,
      actors,
      actionTypes,
      actionLabels: ACTION_LABELS,
      filters: {
        actionType: opts.actionType || "",
        actorUserId: opts.actorUserId || "",
        actorRole: opts.actorRole || "",
        branchId: opts.branchId || "",
        pageKey: opts.pageKey || "",
        result: opts.result || "",
        from: opts.from || "",
        to: opts.to || "",
      },
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "list" };
  }
}

/**
 * @param {import('pg').Pool} db
 * @param {{ organizationId: string, eventId: string }} opts
 */
async function loadWebsiteAuditEvent(db, opts) {
  if (!auditRepo.isUuid(opts.organizationId) || !auditRepo.isUuid(opts.eventId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }
  try {
    const event = await auditRepo.getAuditEventByOrgAndId(
      db,
      opts.organizationId,
      opts.eventId
    );
    if (!event) return { ok: false, status: STATUS.NOT_FOUND, reason: "event" };
    return {
      ok: true,
      status: STATUS.OK,
      event: {
        ...event,
        actionLabel: ACTION_LABELS[event.actionType] || event.actionType,
        beforeFields: presentFields(event.before),
        afterFields: presentFields(event.after),
        metadataFields: presentFields(event.metadata),
        summary: buildSummary(event),
      },
      actionLabels: ACTION_LABELS,
    };
  } catch {
    return { ok: false, status: STATUS.LOOKUP_ERROR, reason: "detail" };
  }
}

module.exports = {
  STATUS,
  ACTION_LABELS,
  sanitizeObject,
  presentFields,
  recordWebsiteAuditEvent,
  recordWebsiteAuditEventInTransaction,
  listWebsiteAuditEvents,
  loadWebsiteAuditEvent,
};
