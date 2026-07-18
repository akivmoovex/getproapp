"use strict";

/**
 * BlessBoard V5 aggregate attendance service.
 * Explicit submission / amendment policy. No individual-member tracking. No fake analytics.
 */

const repo = require("../repositories/attendanceRepository");
const {
  authorizeBlessBoardTenantAccess,
  STATUS: AUTHZ_STATUS,
} = require("./authorizeBlessBoardTenantAccess");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  FORBIDDEN: "forbidden",
  CONFLICT: "conflict",
  POLICY: "policy",
  LOOKUP_ERROR: "lookup_error",
});

/**
 * Explicit product policy for attendance workflow.
 * - Branch may create/edit while draft.
 * - Branch may submit draft → submitted.
 * - Branch may amend submitted counts only by reverting to draft (must resubmit).
 * - Branch cannot edit approved or archived.
 * - HQ may approve submitted → approved; may archive; may view church-wide.
 */
const ATTENDANCE_POLICY = Object.freeze({
  branchEditableStatuses: Object.freeze(["draft"]),
  branchMayAmendSubmittedByRevertingToDraft: true,
  branchMaySubmit: true,
  hqMayApprove: true,
  hqMayArchive: true,
  reportStatuses: Object.freeze(["submitted", "approved", "archived"]),
});

const EVENT_TYPES = Object.freeze([
  "sunday_service",
  "midweek",
  "special",
  "youth",
  "children",
  "other",
]);

const CATEGORIES = Object.freeze([
  "adults",
  "youth",
  "children",
  "first_time_visitors",
  "volunteers",
  "other",
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HTML_HINT = /<\/?[a-z][\s\S]*>/i;
const YEAR_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

async function withClient(db, fn) {
  let client = null;
  let owned = false;
  try {
    if (db && typeof db.connect === "function") {
      client = await db.connect();
      owned = true;
    } else {
      client = db;
    }
    return await fn(client);
  } finally {
    if (owned && client && typeof client.release === "function") client.release();
  }
}

function mapDbError(err) {
  const msg = err && err.message ? String(err.message) : "";
  if (/unique|duplicate/i.test(msg)) {
    return { ok: false, status: STATUS.CONFLICT, reason: "duplicate" };
  }
  if (/archived|must belong|must match/i.test(msg)) {
    return { ok: false, status: STATUS.CONFLICT, reason: msg };
  }
  return { ok: false, status: STATUS.LOOKUP_ERROR, reason: msg || "error" };
}

function plainText(value, field, { required, max }) {
  if (value == null || value === "") {
    if (required) return { ok: false, reason: field };
    return { ok: true, value: null };
  }
  const s = String(value).trim();
  if (HTML_HINT.test(s)) return { ok: false, reason: `${field}_html_not_allowed` };
  if (!s) {
    if (required) return { ok: false, reason: field };
    return { ok: true, value: null };
  }
  if (s.length < 1 || s.length > max) return { ok: false, reason: `${field}_length` };
  return { ok: true, value: s };
}

function parseCount(raw) {
  if (raw == null || raw === "") return { ok: false, reason: "count" };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) return { ok: false, reason: "count" };
  return { ok: true, value: n };
}

function parseEventDate(raw) {
  const s = String(raw || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false, reason: "event_date" };
  const d = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return { ok: false, reason: "event_date" };
  return { ok: true, value: s };
}

async function authorizeActor(client, input) {
  const authz = await authorizeBlessBoardTenantAccess(
    { query: client.query.bind(client) },
    {
      userId: input.actorUserId,
      tenant: input.tenant,
      branchId: input.branchId,
    }
  );
  if (!authz.ok) {
    return {
      ok: false,
      reason: authz.status || AUTHZ_STATUS.UNAUTHORIZED,
      effectiveRoles: [],
      mode: null,
    };
  }
  const roles = authz.context.effectiveRoles || [];
  const hasHq = roles.some((r) => r.roleKey === "church_hq_admin");
  const hasBranch = roles.some((r) => r.roleKey === "branch_admin");
  const hasPlatform = roles.some((r) => r.roleKey === "platform_admin");
  if (hasHq || hasPlatform) {
    return { ok: true, effectiveRoles: roles, mode: "hq" };
  }
  if (hasBranch && input.branchId) {
    return { ok: true, effectiveRoles: roles, mode: "branch" };
  }
  return { ok: false, reason: "role", effectiveRoles: roles, mode: null };
}

function canBranchEditEvent(event) {
  if (!event) return false;
  if (ATTENDANCE_POLICY.branchEditableStatuses.includes(event.status)) return true;
  if (
    event.status === "submitted" &&
    ATTENDANCE_POLICY.branchMayAmendSubmittedByRevertingToDraft
  ) {
    return true; // amendment path reverts to draft
  }
  return false;
}

async function loadBundle(client, event) {
  const entries = await repo.listEntriesForEvent(client, event.id);
  const totalCount = entries.reduce((sum, e) => sum + e.count, 0);
  return { ...event, entries, totalCount };
}

async function createAttendanceEvent(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!churchId || !branchId || !actorUserId) {
    return { ok: false, status: STATUS.INVALID_INPUT, event: null, reason: "scope" };
  }
  const title = plainText(input.title, "title", { required: true, max: 200 });
  if (!title.ok) return { ok: false, status: STATUS.INVALID_INPUT, event: null, reason: title.reason };
  const eventType = String(input.eventType || "").trim().toLowerCase();
  if (!EVENT_TYPES.includes(eventType)) {
    return { ok: false, status: STATUS.INVALID_INPUT, event: null, reason: "event_type" };
  }
  const eventDate = parseEventDate(input.eventDate);
  if (!eventDate.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, event: null, reason: eventDate.reason };
  }
  let eventAt = null;
  if (input.eventAt != null && input.eventAt !== "") {
    const d = new Date(String(input.eventAt));
    if (Number.isNaN(d.getTime())) {
      return { ok: false, status: STATUS.INVALID_INPUT, event: null, reason: "event_at" };
    }
    eventAt = d.toISOString();
  }

  try {
    return await withClient(db, async (client) => {
      if (input.tenant) {
        const authz = await authorizeActor(client, {
          actorUserId,
          tenant: input.tenant,
          branchId,
        });
        if (!authz.ok) {
          return { ok: false, status: STATUS.FORBIDDEN, event: null, reason: authz.reason };
        }
        if (authz.mode === "branch" && String(branchId) !== String(input.scopeBranchId || branchId)) {
          // branch admin must use assigned branch (caller sets both to primary)
        }
      }
      const branch = await repo.findBranchScope(client, branchId);
      if (!branch || String(branch.church_id) !== churchId || branch.status !== "active") {
        return { ok: false, status: STATUS.INVALID_INPUT, event: null, reason: "branch" };
      }
      const event = await repo.insertEvent(client, {
        churchId,
        branchId,
        eventDate: eventDate.value,
        eventAt,
        eventType,
        title: title.value,
        createdByUserId: actorUserId,
      });
      return { ok: true, status: STATUS.OK, event: await loadBundle(client, event) };
    });
  } catch (err) {
    return { ...mapDbError(err), event: null };
  }
}

/**
 * Update draft event metadata (title / type / date). Category counts use upsertAttendanceEntry.
 * Branch may only edit metadata while draft.
 */
async function updateAttendanceEvent(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const eventId = String((input && input.id) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!churchId || !UUID_RE.test(eventId) || !actorUserId) {
    return { ok: false, status: STATUS.INVALID_INPUT, event: null, reason: "scope" };
  }
  const title = plainText(input.title, "title", { required: true, max: 200 });
  if (!title.ok) return { ok: false, status: STATUS.INVALID_INPUT, event: null, reason: title.reason };
  const eventType = String(input.eventType || "").trim().toLowerCase();
  if (!EVENT_TYPES.includes(eventType)) {
    return { ok: false, status: STATUS.INVALID_INPUT, event: null, reason: "event_type" };
  }
  const eventDate = parseEventDate(input.eventDate);
  if (!eventDate.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, event: null, reason: eventDate.reason };
  }
  let eventAt = null;
  let clearEventAt = false;
  if (input.eventAt === null || input.eventAt === "") {
    clearEventAt = true;
  } else if (input.eventAt != null) {
    const d = new Date(String(input.eventAt));
    if (Number.isNaN(d.getTime())) {
      return { ok: false, status: STATUS.INVALID_INPUT, event: null, reason: "event_at" };
    }
    eventAt = d.toISOString();
  }

  try {
    return await withClient(db, async (client) => {
      const existing = await repo.findEventById(client, eventId);
      if (!existing || String(existing.churchId) !== churchId) {
        return { ok: false, status: STATUS.NOT_FOUND, event: null };
      }
      if (input.tenant) {
        const authz = await authorizeActor(client, {
          actorUserId,
          tenant: input.tenant,
          branchId: existing.branchId,
        });
        if (!authz.ok) {
          return { ok: false, status: STATUS.FORBIDDEN, event: null, reason: authz.reason };
        }
        if (authz.mode === "branch") {
          if (input.scopeBranchId && String(input.scopeBranchId) !== String(existing.branchId)) {
            return { ok: false, status: STATUS.FORBIDDEN, event: null, reason: "branch_scope" };
          }
          if (existing.status !== "draft") {
            return { ok: false, status: STATUS.POLICY, event: null, reason: "status_locked" };
          }
        } else if (existing.status === "archived") {
          return { ok: false, status: STATUS.POLICY, event: null, reason: "archived" };
        }
      } else if (existing.status === "archived") {
        return { ok: false, status: STATUS.POLICY, event: null, reason: "archived" };
      }

      const updated = await repo.updateEventMeta(client, eventId, {
        title: title.value,
        eventType,
        eventDate: eventDate.value,
        eventAt,
        clearEventAt,
      });
      return { ok: true, status: STATUS.OK, event: await loadBundle(client, updated) };
    });
  } catch (err) {
    return { ...mapDbError(err), event: null };
  }
}

async function upsertAttendanceEntry(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const eventId = String((input && input.attendanceEventId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const category = String((input && input.category) || "").trim().toLowerCase();
  if (!churchId || !UUID_RE.test(eventId) || !actorUserId) {
    return { ok: false, status: STATUS.INVALID_INPUT, entry: null, reason: "scope" };
  }
  if (!CATEGORIES.includes(category)) {
    return { ok: false, status: STATUS.INVALID_INPUT, entry: null, reason: "category" };
  }
  const count = parseCount(input.count);
  if (!count.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, entry: null, reason: count.reason };
  }
  const notes = plainText(input.notes, "notes", { required: false, max: 1000 });
  if (!notes.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, entry: null, reason: notes.reason };
  }

  try {
    return await withClient(db, async (client) => {
      const event = await repo.findEventById(client, eventId);
      if (!event || String(event.churchId) !== churchId) {
        return { ok: false, status: STATUS.NOT_FOUND, entry: null };
      }
      if (input.tenant) {
        const authz = await authorizeActor(client, {
          actorUserId,
          tenant: input.tenant,
          branchId: event.branchId,
        });
        if (!authz.ok) {
          return { ok: false, status: STATUS.FORBIDDEN, entry: null, reason: authz.reason };
        }
        if (authz.mode === "branch") {
          if (input.scopeBranchId && String(input.scopeBranchId) !== String(event.branchId)) {
            return { ok: false, status: STATUS.FORBIDDEN, entry: null, reason: "branch_scope" };
          }
          if (!canBranchEditEvent(event)) {
            return { ok: false, status: STATUS.POLICY, entry: null, reason: "status_locked" };
          }
          if (event.status === "submitted" && ATTENDANCE_POLICY.branchMayAmendSubmittedByRevertingToDraft) {
            await repo.updateEventStatus(client, eventId, { status: "draft" });
          }
        } else if (event.status === "archived") {
          return { ok: false, status: STATUS.POLICY, entry: null, reason: "archived" };
        }
      } else if (!canBranchEditEvent(event) && event.status !== "approved") {
        // service-level without tenant still respects archive lock
        if (event.status === "archived") {
          return { ok: false, status: STATUS.POLICY, entry: null, reason: "archived" };
        }
      }

      const entry = await repo.upsertEntry(client, {
        churchId,
        attendanceEventId: eventId,
        category,
        count: count.value,
        notes: notes.value,
        submittedByUserId: actorUserId,
      });
      return { ok: true, status: STATUS.OK, entry };
    });
  } catch (err) {
    return { ...mapDbError(err), entry: null };
  }
}

async function submitAttendanceEvent(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const eventId = String((input && input.id) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!churchId || !UUID_RE.test(eventId) || !actorUserId) {
    return { ok: false, status: STATUS.INVALID_INPUT, event: null, reason: "scope" };
  }
  if (!ATTENDANCE_POLICY.branchMaySubmit) {
    return { ok: false, status: STATUS.POLICY, event: null, reason: "submit_disabled" };
  }
  try {
    return await withClient(db, async (client) => {
      const event = await repo.findEventById(client, eventId);
      if (!event || String(event.churchId) !== churchId) {
        return { ok: false, status: STATUS.NOT_FOUND, event: null };
      }
      if (input.tenant) {
        const authz = await authorizeActor(client, {
          actorUserId,
          tenant: input.tenant,
          branchId: event.branchId,
        });
        if (!authz.ok) {
          return { ok: false, status: STATUS.FORBIDDEN, event: null, reason: authz.reason };
        }
        if (authz.mode === "branch" && input.scopeBranchId) {
          if (String(input.scopeBranchId) !== String(event.branchId)) {
            return { ok: false, status: STATUS.FORBIDDEN, event: null, reason: "branch_scope" };
          }
        }
      }
      if (event.status !== "draft") {
        return { ok: false, status: STATUS.CONFLICT, event, reason: "not_draft" };
      }
      const entries = await repo.listEntriesForEvent(client, eventId);
      if (!entries.length) {
        return { ok: false, status: STATUS.INVALID_INPUT, event, reason: "entries_required" };
      }
      const updated = await repo.updateEventStatus(client, eventId, {
        status: "submitted",
        submittedByUserId: actorUserId,
        submittedAt: new Date().toISOString(),
      });
      return { ok: true, status: STATUS.OK, event: await loadBundle(client, updated) };
    });
  } catch (err) {
    return { ...mapDbError(err), event: null };
  }
}

async function approveAttendanceEvent(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const eventId = String((input && input.id) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!churchId || !UUID_RE.test(eventId) || !actorUserId) {
    return { ok: false, status: STATUS.INVALID_INPUT, event: null, reason: "scope" };
  }
  if (!ATTENDANCE_POLICY.hqMayApprove) {
    return { ok: false, status: STATUS.POLICY, event: null, reason: "approve_disabled" };
  }
  try {
    return await withClient(db, async (client) => {
      const event = await repo.findEventById(client, eventId);
      if (!event || String(event.churchId) !== churchId) {
        return { ok: false, status: STATUS.NOT_FOUND, event: null };
      }
      if (input.tenant) {
        const authz = await authorizeActor(client, {
          actorUserId,
          tenant: input.tenant,
          branchId: event.branchId,
        });
        if (!authz.ok || authz.mode !== "hq") {
          return { ok: false, status: STATUS.FORBIDDEN, event: null, reason: "hq_required" };
        }
      }
      if (event.status !== "submitted") {
        return { ok: false, status: STATUS.CONFLICT, event, reason: "not_submitted" };
      }
      const updated = await repo.updateEventStatus(client, eventId, {
        status: "approved",
        approvedByUserId: actorUserId,
        approvedAt: new Date().toISOString(),
      });
      return { ok: true, status: STATUS.OK, event: await loadBundle(client, updated) };
    });
  } catch (err) {
    return { ...mapDbError(err), event: null };
  }
}

async function archiveAttendanceEvent(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const eventId = String((input && input.id) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!churchId || !UUID_RE.test(eventId) || !actorUserId) {
    return { ok: false, status: STATUS.INVALID_INPUT, event: null, reason: "scope" };
  }
  if (!ATTENDANCE_POLICY.hqMayArchive) {
    return { ok: false, status: STATUS.POLICY, event: null, reason: "archive_disabled" };
  }
  try {
    return await withClient(db, async (client) => {
      const event = await repo.findEventById(client, eventId);
      if (!event || String(event.churchId) !== churchId) {
        return { ok: false, status: STATUS.NOT_FOUND, event: null };
      }
      if (input.tenant) {
        const authz = await authorizeActor(client, {
          actorUserId,
          tenant: input.tenant,
          branchId: event.branchId,
        });
        if (!authz.ok || authz.mode !== "hq") {
          return { ok: false, status: STATUS.FORBIDDEN, event: null, reason: "hq_required" };
        }
      }
      if (event.status === "draft") {
        return { ok: false, status: STATUS.CONFLICT, event, reason: "draft_cannot_archive" };
      }
      if (event.status === "archived") {
        return { ok: true, status: STATUS.OK, event: await loadBundle(client, event) };
      }
      // Ensure submitted_at / approved_at consistency for archive from submitted
      const patch = { status: "archived" };
      if (!event.approvedAt) {
        patch.approvedByUserId = actorUserId;
        patch.approvedAt = new Date().toISOString();
      }
      const updated = await repo.updateEventStatus(client, eventId, patch);
      return { ok: true, status: STATUS.OK, event: await loadBundle(client, updated) };
    });
  } catch (err) {
    return { ...mapDbError(err), event: null };
  }
}

async function getAttendanceEvent(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const eventId = String((input && input.id) || "").trim();
  if (!churchId || !UUID_RE.test(eventId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, event: null, reason: "scope" };
  }
  try {
    return await withClient(db, async (client) => {
      const event = await repo.findEventById(client, eventId);
      if (!event || String(event.churchId) !== churchId) {
        return { ok: false, status: STATUS.NOT_FOUND, event: null };
      }
      if (input.tenant && input.actorUserId) {
        const authz = await authorizeActor(client, {
          actorUserId: input.actorUserId,
          tenant: input.tenant,
          branchId: event.branchId,
        });
        if (!authz.ok) {
          return { ok: false, status: STATUS.FORBIDDEN, event: null, reason: authz.reason };
        }
        if (authz.mode === "branch" && input.scopeBranchId) {
          if (String(input.scopeBranchId) !== String(event.branchId)) {
            return { ok: false, status: STATUS.FORBIDDEN, event: null, reason: "branch_scope" };
          }
        }
      }
      return { ok: true, status: STATUS.OK, event: await loadBundle(client, event) };
    });
  } catch (err) {
    return { ...mapDbError(err), event: null };
  }
}

async function listAttendanceEvents(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  if (!churchId) {
    return { ok: false, status: STATUS.INVALID_INPUT, events: [], reason: "church_id" };
  }
  let branchId;
  if (Object.prototype.hasOwnProperty.call(input || {}, "branchId")) {
    branchId = input.branchId == null || input.branchId === "" ? null : String(input.branchId);
  }
  try {
    return await withClient(db, async (client) => {
      if (input.tenant && input.actorUserId) {
        const authz = await authorizeActor(client, {
          actorUserId: input.actorUserId,
          tenant: input.tenant,
          branchId: branchId || null,
        });
        if (!authz.ok) {
          return { ok: false, status: STATUS.FORBIDDEN, events: [], reason: authz.reason };
        }
        if (authz.mode === "branch") {
          if (!branchId) {
            return { ok: false, status: STATUS.FORBIDDEN, events: [], reason: "branch_required" };
          }
        }
      }
      const events = await repo.listEvents(client, {
        churchId,
        branchId: branchId || undefined,
        status: input.status || null,
        eventType: input.eventType || null,
        yearMonth: input.yearMonth || null,
        limit: input.limit,
      });
      const bundles = [];
      for (const event of events) {
        bundles.push(await loadBundle(client, event));
      }
      return { ok: true, status: STATUS.OK, events: bundles };
    });
  } catch (err) {
    return { ...mapDbError(err), events: [] };
  }
}

async function getMonthlyAttendanceSummary(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const yearMonth = String((input && input.yearMonth) || "").trim();
  if (!churchId || !YEAR_MONTH_RE.test(yearMonth)) {
    return { ok: false, status: STATUS.INVALID_INPUT, summary: null, reason: "year_month" };
  }
  let branchId;
  if (Object.prototype.hasOwnProperty.call(input || {}, "branchId")) {
    branchId = input.branchId == null || input.branchId === "" ? null : String(input.branchId);
  }
  try {
    return await withClient(db, async (client) => {
      if (input.tenant && input.actorUserId) {
        const authz = await authorizeActor(client, {
          actorUserId: input.actorUserId,
          tenant: input.tenant,
          branchId: branchId || null,
        });
        if (!authz.ok) {
          return { ok: false, status: STATUS.FORBIDDEN, summary: null, reason: authz.reason };
        }
        if (authz.mode === "branch" && !branchId) {
          return { ok: false, status: STATUS.FORBIDDEN, summary: null, reason: "branch_required" };
        }
      }
      const byBranch = await repo.monthlySummary(client, {
        churchId,
        branchId: branchId || null,
        yearMonth,
      });
      const churchTotals = branchId
        ? null
        : await repo.monthlyChurchTotals(client, { churchId, yearMonth });
      const grandTotal = (churchTotals || byBranch).reduce(
        (sum, row) => sum + (Number(row.totalCount) || 0),
        0
      );
      return {
        ok: true,
        status: STATUS.OK,
        summary: {
          yearMonth,
          churchId,
          branchId: branchId || null,
          byBranch,
          churchTotals,
          grandTotal,
          // Explicit: derived only from submitted/approved/archived entry sums.
          sourceStatuses: ATTENDANCE_POLICY.reportStatuses.slice(),
        },
      };
    });
  } catch (err) {
    return { ...mapDbError(err), summary: null };
  }
}

module.exports = {
  STATUS,
  ATTENDANCE_POLICY,
  EVENT_TYPES,
  CATEGORIES,
  createAttendanceEvent,
  updateAttendanceEvent,
  upsertAttendanceEntry,
  submitAttendanceEvent,
  approveAttendanceEvent,
  archiveAttendanceEvent,
  getAttendanceEvent,
  listAttendanceEvents,
  getMonthlyAttendanceSummary,
};
