"use strict";

/**
 * BlessBoard V5 member participation: ministries + events.
 * Leader recommendation deferred. No payments / attendance.
 */

const repo = require("../repositories/participationRepository");
const {
  authorizeBlessBoardTenantAccess,
  STATUS: AUTHZ_STATUS,
} = require("./authorizeBlessBoardTenantAccess");
const { requireActorPermission } = require("./requireActorPermission");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  FORBIDDEN: "forbidden",
  CONFLICT: "conflict",
  CAPACITY_FULL: "capacity_full",
  UNAVAILABLE: "unavailable",
  LOOKUP_ERROR: "lookup_error",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HTML_HINT = /<\/?[a-z][\s\S]*>/i;

/**
 * @param {{ connect?: Function, query?: Function }} db
 * @param {(client: object) => Promise<*>} fn
 */
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
  if (/must match|not found/i.test(msg)) {
    return { ok: false, status: STATUS.FORBIDDEN, reason: msg };
  }
  return { ok: false, status: STATUS.LOOKUP_ERROR, reason: msg || "error" };
}

function plainMessage(value) {
  if (value == null || value === "") return { ok: true, value: null };
  const s = String(value).trim();
  if (HTML_HINT.test(s)) return { ok: false, reason: "message_html_not_allowed" };
  if (s.length < 1 || s.length > 1000) return { ok: false, reason: "message_length" };
  return { ok: true, value: s };
}

function contentVisibleToBranch(item, branchId) {
  if (!item) return false;
  if (item.branchId == null) return true;
  return String(item.branchId) === String(branchId);
}

/**
 * @param {{ query: Function }} client
 * @param {{ actorUserId: string, tenant: object, branchId: string|null, permission: string }} input
 */
async function authorizeAdmin(client, input) {
  const permission = input.permission || "events.view";
  const result = await requireActorPermission(
    { query: client.query.bind(client) },
    {
      actorUserId: input.actorUserId,
      tenant: input.tenant,
      permission,
      branchId: input.branchId,
    }
  );
  if (!result.ok || !result.allowed) {
    return {
      ok: false,
      reason: result.reason || "denied",
      mode: null,
    };
  }
  if (input.branchId == null && result.mode === "branch") {
    return { ok: false, reason: "church_wide_denied", mode: result.mode };
  }
  return { ok: true, mode: result.mode };
}

function assertAdminCanManageItem(authz, item, scopeBranchId) {
  if (!authz.ok) return false;
  const mode = authz.mode;
  if (mode === "hq") {
    if (scopeBranchId !== undefined && String(scopeBranchId || "") !== String(item.branchId || "")) {
      return false;
    }
    return true;
  }
  // branch mode: only branch-scoped items matching their scope
  if (item.branchId == null) return false;
  if (scopeBranchId && String(item.branchId) !== String(scopeBranchId)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Member: ministries
// ---------------------------------------------------------------------------

async function listMemberMinistries(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  const memberId = String((input && input.memberId) || "").trim();
  if (!churchId || !branchId || !memberId) {
    return { ok: false, status: STATUS.INVALID_INPUT, items: [], reason: "scope" };
  }
  try {
    return await withClient(db, async (client) => {
      const ministries = await repo.listPublishedMinistriesForBranch(client, {
        churchId,
        branchId,
      });
      const memberships = await repo.listMinistryMembershipsForMember(client, memberId);
      const byMinistry = new Map();
      for (const m of memberships) {
        if (m.status === "pending" || m.status === "active") {
          byMinistry.set(m.ministryId, m);
        }
      }
      const items = ministries.map((min) => ({
        ...min,
        membership: byMinistry.get(min.id) || null,
      }));
      return { ok: true, status: STATUS.OK, items };
    });
  } catch (err) {
    return { ...mapDbError(err), items: [] };
  }
}

async function getMemberMinistry(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  const memberId = String((input && input.memberId) || "").trim();
  const id = String((input && input.id) || "").trim();
  if (!churchId || !branchId || !memberId || !UUID_RE.test(id)) {
    return { ok: false, status: STATUS.INVALID_INPUT, item: null, reason: "scope" };
  }
  try {
    return await withClient(db, async (client) => {
      const ministry = await repo.findMinistryById(client, id);
      if (!ministry || String(ministry.churchId) !== churchId || ministry.status !== "published") {
        return { ok: false, status: STATUS.NOT_FOUND, item: null };
      }
      if (!contentVisibleToBranch(ministry, branchId)) {
        return { ok: false, status: STATUS.FORBIDDEN, item: null, reason: "branch_isolation" };
      }
      const membership = await repo.findOpenMinistryMembership(client, memberId, id);
      return { ok: true, status: STATUS.OK, item: { ...ministry, membership } };
    });
  } catch (err) {
    return { ...mapDbError(err), item: null };
  }
}

async function joinMinistry(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  const memberId = String((input && input.memberId) || "").trim();
  const ministryId = String((input && input.ministryId) || "").trim();
  if (!churchId || !branchId || !memberId || !UUID_RE.test(ministryId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, membership: null, reason: "scope" };
  }
  const msg = plainMessage(input && input.message);
  if (!msg.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, membership: null, reason: msg.reason };
  }
  try {
    return await withClient(db, async (client) => {
      const ministry = await repo.findMinistryById(client, ministryId);
      if (!ministry || String(ministry.churchId) !== churchId) {
        return { ok: false, status: STATUS.NOT_FOUND, membership: null };
      }
      if (ministry.status !== "published") {
        return { ok: false, status: STATUS.UNAVAILABLE, membership: null, reason: "inactive" };
      }
      if (!contentVisibleToBranch(ministry, branchId)) {
        return { ok: false, status: STATUS.FORBIDDEN, membership: null, reason: "branch_isolation" };
      }
      const existing = await repo.findOpenMinistryMembership(client, memberId, ministryId);
      if (existing) {
        return { ok: false, status: STATUS.CONFLICT, membership: existing, reason: "duplicate" };
      }
      const nextStatus = ministry.joinPolicy === "open" ? "active" : "pending";
      const membership = await repo.insertMinistryMembership(client, {
        churchId,
        branchId,
        ministryId,
        memberId,
        status: nextStatus,
        message: msg.value,
        joinedAt: nextStatus === "active" ? new Date().toISOString() : null,
        assignmentSource: "self_join",
      });
      return { ok: true, status: STATUS.OK, membership };
    });
  } catch (err) {
    return { ...mapDbError(err), membership: null };
  }
}

async function leaveMinistry(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  const memberId = String((input && input.memberId) || "").trim();
  const ministryId = String((input && input.ministryId) || "").trim();
  if (!churchId || !branchId || !memberId || !UUID_RE.test(ministryId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, membership: null, reason: "scope" };
  }
  try {
    return await withClient(db, async (client) => {
      const membership = await repo.findOpenMinistryMembership(client, memberId, ministryId);
      if (!membership || String(membership.churchId) !== churchId) {
        return { ok: false, status: STATUS.NOT_FOUND, membership: null };
      }
      const nextStatus = membership.status === "pending" ? "cancelled" : "left";
      const updated = await repo.updateMinistryMembershipStatus(client, membership.id, {
        status: nextStatus,
        leftAt: new Date().toISOString(),
      });
      return { ok: true, status: STATUS.OK, membership: updated };
    });
  } catch (err) {
    return { ...mapDbError(err), membership: null };
  }
}

// ---------------------------------------------------------------------------
// Member: events
// ---------------------------------------------------------------------------

async function listMemberEvents(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  const memberId = String((input && input.memberId) || "").trim();
  if (!churchId || !branchId || !memberId) {
    return { ok: false, status: STATUS.INVALID_INPUT, items: [], reason: "scope" };
  }
  const includeRegistrationStats = input && input.includeRegistrationStats === false ? false : true;
  const upcomingOnly = Boolean(input && input.upcomingOnly);
  const limit =
    input && input.limit != null ? Math.min(Math.max(Number(input.limit) || 0, 1), 100) : null;
  try {
    return await withClient(db, async (client) => {
      const events = await repo.listPublishedEventsForBranch(client, {
        churchId,
        branchId,
        upcomingOnly,
        limit,
      });
      if (!includeRegistrationStats) {
        return {
          ok: true,
          status: STATUS.OK,
          items: events.map((event) => ({
            ...event,
            registration: null,
            registeredCount: null,
            spotsRemaining: null,
          })),
        };
      }
      const items = [];
      for (const event of events) {
        const registration = await repo.findEventRegistration(client, memberId, event.id);
        const registeredCount = await repo.countActiveEventRegistrations(client, event.id);
        items.push({
          ...event,
          registration: registration && registration.status === "registered" ? registration : null,
          registeredCount,
          spotsRemaining:
            event.capacity == null ? null : Math.max(0, event.capacity - registeredCount),
        });
      }
      return { ok: true, status: STATUS.OK, items };
    });
  } catch (err) {
    return { ...mapDbError(err), items: [] };
  }
}

async function getMemberEvent(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  const memberId = String((input && input.memberId) || "").trim();
  const id = String((input && input.id) || "").trim();
  if (!churchId || !branchId || !memberId || !UUID_RE.test(id)) {
    return { ok: false, status: STATUS.INVALID_INPUT, item: null, reason: "scope" };
  }
  try {
    return await withClient(db, async (client) => {
      const event = await repo.findEventById(client, id);
      if (!event || String(event.churchId) !== churchId || event.status !== "published") {
        return { ok: false, status: STATUS.NOT_FOUND, item: null };
      }
      if (!contentVisibleToBranch(event, branchId)) {
        return { ok: false, status: STATUS.FORBIDDEN, item: null, reason: "branch_isolation" };
      }
      const registration = await repo.findEventRegistration(client, memberId, id);
      const registeredCount = await repo.countActiveEventRegistrations(client, id);
      return {
        ok: true,
        status: STATUS.OK,
        item: {
          ...event,
          registration: registration && registration.status === "registered" ? registration : null,
          registeredCount,
          spotsRemaining:
            event.capacity == null ? null : Math.max(0, event.capacity - registeredCount),
        },
      };
    });
  } catch (err) {
    return { ...mapDbError(err), item: null };
  }
}

async function registerForEvent(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  const memberId = String((input && input.memberId) || "").trim();
  const eventId = String((input && input.eventId) || "").trim();
  if (!churchId || !branchId || !memberId || !UUID_RE.test(eventId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, registration: null, reason: "scope" };
  }
  try {
    return await withClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const event = await repo.findEventById(client, eventId);
        if (!event || String(event.churchId) !== churchId) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, registration: null };
        }
        if (event.status !== "published") {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.UNAVAILABLE,
            registration: null,
            reason: "inactive",
          };
        }
        if (!contentVisibleToBranch(event, branchId)) {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.FORBIDDEN,
            registration: null,
            reason: "branch_isolation",
          };
        }

        const existing = await repo.findEventRegistration(client, memberId, eventId);
        if (existing && existing.status === "registered") {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.CONFLICT,
            registration: existing,
            reason: "duplicate",
          };
        }

        const activeCount = await repo.countActiveEventRegistrations(client, eventId);
        if (event.capacity != null && activeCount >= event.capacity) {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.CAPACITY_FULL,
            registration: null,
            reason: "capacity_full",
          };
        }

        let registration;
        if (existing && existing.status === "cancelled") {
          registration = await repo.reactivateEventRegistration(client, existing.id);
        } else {
          registration = await repo.insertEventRegistration(client, {
            churchId,
            eventId,
            memberId,
          });
        }
        await client.query("COMMIT");
        return { ok: true, status: STATUS.OK, registration };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });
  } catch (err) {
    return { ...mapDbError(err), registration: null };
  }
}

async function cancelEventRegistration(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  const memberId = String((input && input.memberId) || "").trim();
  const eventId = String((input && input.eventId) || "").trim();
  if (!churchId || !branchId || !memberId || !UUID_RE.test(eventId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, registration: null, reason: "scope" };
  }
  try {
    return await withClient(db, async (client) => {
      const existing = await repo.findEventRegistration(client, memberId, eventId);
      if (!existing || String(existing.churchId) !== churchId || existing.status !== "registered") {
        return { ok: false, status: STATUS.NOT_FOUND, registration: null };
      }
      const registration = await repo.cancelEventRegistration(client, existing.id);
      return { ok: true, status: STATUS.OK, registration };
    });
  } catch (err) {
    return { ...mapDbError(err), registration: null };
  }
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

async function listAdminMinistryParticipation(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  if (!churchId) {
    return { ok: false, status: STATUS.INVALID_INPUT, items: [], reason: "church_id" };
  }
  let branchId;
  if (Object.prototype.hasOwnProperty.call(input || {}, "branchId")) {
    branchId = input.branchId == null || input.branchId === "" ? null : String(input.branchId);
  }
  try {
    return await withClient(db, async (client) => {
      if (input.tenant && input.actorUserId) {
        const authz = await authorizeAdmin(client, {
          actorUserId: input.actorUserId,
          tenant: input.tenant,
          branchId: branchId == null ? null : branchId,
          permission: "events.view",
        });
        if (!authz.ok) {
          return { ok: false, status: STATUS.FORBIDDEN, items: [], reason: authz.reason };
        }
      }
      const ministries = await repo.listAdminMinistries(client, { churchId, branchId });
      const items = [];
      for (const min of ministries) {
        const memberships = await repo.listMinistryMembershipsForMinistry(client, {
          ministryId: min.id,
          status: input.status || null,
        });
        items.push({
          ministry: min,
          memberships,
          pendingCount: memberships.filter((m) => m.status === "pending").length,
          activeCount: memberships.filter((m) => m.status === "active").length,
        });
      }
      return { ok: true, status: STATUS.OK, items };
    });
  } catch (err) {
    return { ...mapDbError(err), items: [] };
  }
}

async function reviewMinistryMembership(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const membershipId = String((input && input.membershipId) || "").trim();
  const decision = String((input && input.decision) || "").trim().toLowerCase();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!churchId || !UUID_RE.test(membershipId) || !actorUserId) {
    return { ok: false, status: STATUS.INVALID_INPUT, membership: null, reason: "scope" };
  }
  if (decision !== "approve" && decision !== "reject") {
    return { ok: false, status: STATUS.INVALID_INPUT, membership: null, reason: "decision" };
  }
  const notes = plainMessage(input && input.reviewNotes);
  if (!notes.ok) {
    return { ok: false, status: STATUS.INVALID_INPUT, membership: null, reason: notes.reason };
  }
  try {
    return await withClient(db, async (client) => {
      const membership = await repo.findMinistryMembershipById(client, membershipId);
      if (!membership || String(membership.churchId) !== churchId) {
        return { ok: false, status: STATUS.NOT_FOUND, membership: null };
      }
      if (membership.status !== "pending") {
        return {
          ok: false,
          status: STATUS.CONFLICT,
          membership,
          reason: "not_pending",
        };
      }
      const ministry = await repo.findMinistryById(client, membership.ministryId);
      if (!ministry) {
        return { ok: false, status: STATUS.NOT_FOUND, membership: null };
      }
      if (input.tenant) {
        const authz = await authorizeAdmin(client, {
          actorUserId,
          tenant: input.tenant,
          branchId: ministry.branchId,
          permission: "events.manage",
        });
        if (!assertAdminCanManageItem(authz, ministry, input.scopeBranchId)) {
          return { ok: false, status: STATUS.FORBIDDEN, membership: null, reason: "role" };
        }
      }
      const updated = await repo.updateMinistryMembershipStatus(client, membershipId, {
        status: decision === "approve" ? "active" : "rejected",
        reviewedByUserId: actorUserId,
        reviewedAt: new Date().toISOString(),
        reviewNotes: notes.value,
        joinedAt: decision === "approve" ? new Date().toISOString() : null,
      });
      return { ok: true, status: STATUS.OK, membership: updated };
    });
  } catch (err) {
    return { ...mapDbError(err), membership: null };
  }
}

async function listAdminEventParticipation(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  if (!churchId) {
    return { ok: false, status: STATUS.INVALID_INPUT, items: [], reason: "church_id" };
  }
  let branchId;
  if (Object.prototype.hasOwnProperty.call(input || {}, "branchId")) {
    branchId = input.branchId == null || input.branchId === "" ? null : String(input.branchId);
  }
  try {
    return await withClient(db, async (client) => {
      if (input.tenant && input.actorUserId) {
        const authz = await authorizeAdmin(client, {
          actorUserId: input.actorUserId,
          tenant: input.tenant,
          branchId: branchId == null ? null : branchId,
          permission: "events.view",
        });
        if (!authz.ok) {
          return { ok: false, status: STATUS.FORBIDDEN, items: [], reason: authz.reason };
        }
      }
      const events = await repo.listAdminEvents(client, { churchId, branchId });
      const items = [];
      for (const event of events) {
        const registrations = await repo.listEventRegistrationsForEvent(client, event.id);
        const active = registrations.filter((r) => r.status === "registered");
        items.push({
          event,
          registrations: active,
          registeredCount: active.length,
          spotsRemaining:
            event.capacity == null ? null : Math.max(0, event.capacity - active.length),
        });
      }
      return { ok: true, status: STATUS.OK, items };
    });
  } catch (err) {
    return { ...mapDbError(err), items: [] };
  }
}

module.exports = {
  STATUS,
  listMemberMinistries,
  getMemberMinistry,
  joinMinistry,
  leaveMinistry,
  listMemberEvents,
  getMemberEvent,
  registerForEvent,
  cancelEventRegistration,
  listAdminMinistryParticipation,
  reviewMinistryMembership,
  listAdminEventParticipation,
};
