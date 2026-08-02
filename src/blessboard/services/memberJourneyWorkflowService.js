"use strict";

/**
 * Member journey workflow queries: dashboard, lists, profile, portal, duplicates.
 */

const { authorize } = require("./blessBoardRbacAuthorizationService");
const {
  normalizeEmailForDuplicate,
  normalizePhoneForDuplicate,
} = require("./registrationDuplicateNormalization");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  LOOKUP_ERROR: "lookup_error",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const FOLLOW_UP_STATUSES = Object.freeze([
  "pending",
  "contacted",
  "unreachable",
  "scheduled",
  "attended",
  "declined",
]);

const STALE_DAYS = 7;

async function withClient(db, fn) {
  let client = null;
  let owned = false;
  try {
    if (db && typeof db.query === "function" && typeof db.release === "function") {
      return await fn(db);
    }
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

async function requirePerm(client, input, permission, resourceContext) {
  const result = await authorize(client, {
    actor: { userId: input.actorUserId },
    permission,
    tenantContext: input.tenantContext,
    resourceContext,
  });
  if (!result.allowed) {
    return { ok: false, status: STATUS.FORBIDDEN, reason: result.reasonCode };
  }
  return { ok: true };
}

function mapContact(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    churchId: row.church_id,
    branchId: row.branch_id,
    firstName: row.first_name,
    lastName: row.last_name,
    emailDisplay: row.email_display || null,
    phoneDisplay: row.phone_display || null,
    sourceType: row.source_type,
    sourceEventId: row.source_event_id || null,
    membershipInterest: row.membership_interest || null,
    decisionOfFaith: Boolean(row.decision_of_faith),
    consentStatus: row.consent_status,
    status: row.status,
    memberId: row.member_id || null,
    followUpStatus: row.follow_up_status || null,
    followUpAssignedUserId: row.follow_up_assigned_user_id || null,
    followUpUpdatedAt: row.follow_up_updated_at || null,
    followUpOutcomeSummary: row.follow_up_outcome_summary || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getDashboardCounts(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  if (![organizationId, churchId, branchId].every((x) => UUID_RE.test(x))) {
    return { ok: false, status: STATUS.INVALID_INPUT, counts: null };
  }
  try {
    return await withClient(db, async (client) => {
      const authz = await requirePerm(client, input, "journey_handovers.view_status", {
        organizationId,
        churchId,
        branchId,
      });
      if (!authz.ok) return { ...authz, counts: null };

      const q = async (sql, params) => {
        const r = await client.query(sql, params);
        return Number(r.rows[0].c) || 0;
      };
      const base = [organizationId, churchId, branchId];
      const staleInterval = `${STALE_DAYS} days`;

      const counts = {
        evangelismContacts: await q(
          `SELECT count(*)::int AS c FROM blessboard.journey_contacts
            WHERE organization_id=$1 AND church_id=$2 AND branch_id=$3
              AND source_type='evangelism' AND status='active'
              AND created_at >= now() - interval '30 days'`,
          base
        ),
        registrationMembershipInterest: await q(
          `SELECT count(*)::int AS c FROM blessboard.journey_contacts
            WHERE organization_id=$1 AND church_id=$2 AND branch_id=$3
              AND source_type='registration_desk' AND status='active'
              AND membership_interest IS NOT NULL
              AND lower(membership_interest) NOT IN ('visitor','visitor_only','no')`,
          base
        ),
        firstTimersAwaitingAcceptance: await q(
          `SELECT count(*)::int AS c FROM blessboard.member_journey_handovers
            WHERE organization_id=$1 AND church_id=$2 AND branch_id=$3
              AND to_stage='first_timers' AND status='submitted'`,
          base
        ),
        returnedHandovers: await q(
          `SELECT count(*)::int AS c FROM blessboard.member_journey_handovers
            WHERE organization_id=$1 AND church_id=$2 AND branch_id=$3
              AND status='returned'`,
          base
        ),
        overdueFollowUps: await q(
          `SELECT count(*)::int AS c FROM blessboard.journey_contacts
            WHERE organization_id=$1 AND church_id=$2 AND branch_id=$3
              AND status='active'
              AND follow_up_status IN ('pending','scheduled','unreachable')
              AND COALESCE(follow_up_updated_at, created_at) < now() - $4::interval`,
          [...base, staleInterval]
        ),
        orientationParticipants: await q(
          `SELECT count(*)::int AS c
             FROM blessboard.class_enrolments e
             INNER JOIN blessboard.class_cohorts c ON c.id = e.cohort_id
             INNER JOIN blessboard.class_programs p ON p.id = c.program_id
            WHERE e.organization_id=$1 AND e.church_id=$2 AND e.branch_id=$3
              AND e.status='enrolled' AND p.program_type='orientation'`,
          base
        ),
        awaitingCellAssignment: await q(
          `SELECT count(*)::int AS c FROM blessboard.member_journey_handovers
            WHERE organization_id=$1 AND church_id=$2 AND branch_id=$3
              AND to_stage='cell_assignment'
              AND status IN ('submitted','accepted','assigned')`,
          base
        ),
        activeClassEnrolments: await q(
          `SELECT count(*)::int AS c FROM blessboard.class_enrolments
            WHERE organization_id=$1 AND church_id=$2 AND branch_id=$3
              AND status='enrolled'`,
          base
        ),
        completionAwaitingApproval: await q(
          `SELECT count(*)::int AS c FROM blessboard.class_enrolments
            WHERE organization_id=$1 AND church_id=$2 AND branch_id=$3
              AND status='enrolled'
              AND completion_recommended_at IS NOT NULL
              AND completion_approved_at IS NULL`,
          base
        ),
        awaitingDepartmentPlacement: await q(
          `SELECT count(*)::int AS c FROM blessboard.member_journey_handovers
            WHERE organization_id=$1 AND church_id=$2 AND branch_id=$3
              AND to_stage='department_service'
              AND status IN ('submitted','accepted','assigned')`,
          base
        ),
        stalledHandovers: await q(
          `SELECT count(*)::int AS c FROM blessboard.member_journey_handovers
            WHERE organization_id=$1 AND church_id=$2 AND branch_id=$3
              AND status IN ('submitted','accepted','assigned','returned')
              AND updated_at < now() - $4::interval`,
          [...base, staleInterval]
        ),
      };
      return { ok: true, status: STATUS.OK, counts };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      counts: null,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function listJourneyContacts(db, input) {
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  const q = String((input && input.q) || "").trim().slice(0, 100);
  const sourceType = String((input && input.sourceType) || "").trim();
  const limit = Math.min(Math.max(Number(input && input.limit) || 50, 1), 100);
  const offset = Math.max(Number(input && input.offset) || 0, 0);
  if (![organizationId, churchId, branchId].every((x) => UUID_RE.test(x))) {
    return { ok: false, status: STATUS.INVALID_INPUT, contacts: [], total: 0 };
  }
  try {
    return await withClient(db, async (client) => {
      const authz = await requirePerm(client, input, "journey_contacts.view_team", {
        organizationId,
        churchId,
        branchId,
      });
      if (!authz.ok) return { ...authz, contacts: [], total: 0 };

      const params = [organizationId, churchId, branchId];
      let where = `organization_id=$1 AND church_id=$2 AND branch_id=$3 AND status <> 'archived'`;
      if (sourceType) {
        params.push(sourceType);
        where += ` AND source_type=$${params.length}`;
      }
      if (q) {
        params.push(`%${q.toLowerCase()}%`);
        where += ` AND (lower(first_name) LIKE $${params.length} OR lower(last_name) LIKE $${params.length}
          OR coalesce(email_normalized,'') LIKE $${params.length}
          OR coalesce(phone_normalized,'') LIKE $${params.length})`;
      }
      const countR = await client.query(
        `SELECT count(*)::int AS c FROM blessboard.journey_contacts WHERE ${where}`,
        params
      );
      params.push(limit, offset);
      const r = await client.query(
        `SELECT * FROM blessboard.journey_contacts
          WHERE ${where}
          ORDER BY updated_at DESC
          LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );
      return {
        ok: true,
        status: STATUS.OK,
        contacts: r.rows.map(mapContact),
        total: countR.rows[0].c,
      };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      contacts: [],
      total: 0,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function getJourneyContact(db, input) {
  const contactId = String((input && input.contactId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  if (!UUID_RE.test(contactId) || !UUID_RE.test(churchId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, contact: null };
  }
  try {
    return await withClient(db, async (client) => {
      const r = await client.query(
        `SELECT * FROM blessboard.journey_contacts WHERE id=$1 AND church_id=$2 LIMIT 1`,
        [contactId, churchId]
      );
      if (!r.rows[0]) return { ok: false, status: STATUS.NOT_FOUND, contact: null };
      const row = r.rows[0];
      const authz = await requirePerm(client, input, "journey_contacts.view_team", {
        organizationId: row.organization_id,
        churchId,
        branchId: row.branch_id,
      });
      if (!authz.ok) return { ...authz, contact: null };
      return { ok: true, status: STATUS.OK, contact: mapContact(row) };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      contact: null,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function findContactDuplicates(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const emailRaw = input.email != null ? normalizeEmailForDuplicate(String(input.email)) : null;
  const phoneRaw = input.phone != null ? normalizePhoneForDuplicate(String(input.phone)) : null;
  const email = emailRaw && emailRaw.normalized ? emailRaw.normalized : null;
  const phone = phoneRaw && phoneRaw.normalized ? phoneRaw.normalized : null;
  if (!UUID_RE.test(churchId) || (!email && !phone)) {
    return { ok: true, status: STATUS.OK, matches: [] };
  }
  try {
    return await withClient(db, async (client) => {
      const r = await client.query(
        `SELECT id, first_name, last_name, email_display, phone_display, status, member_id
           FROM blessboard.journey_contacts
          WHERE church_id = $1
            AND status <> 'archived'
            AND (
              ($2::text IS NOT NULL AND email_normalized = $2)
              OR ($3::text IS NOT NULL AND phone_normalized = $3)
            )
          ORDER BY updated_at DESC
          LIMIT 10`,
        [churchId, email || null, phone || null]
      );
      return {
        ok: true,
        status: STATUS.OK,
        matches: r.rows.map((row) => ({
          id: row.id,
          firstName: row.first_name,
          lastName: row.last_name,
          emailDisplay: row.email_display,
          phoneDisplay: row.phone_display,
          status: row.status,
          memberId: row.member_id,
        })),
      };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      matches: [],
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function updateContactFollowUp(db, input) {
  const contactId = String((input && input.contactId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const followUpStatus = String((input && input.followUpStatus) || "").trim();
  if (![contactId, churchId, actorUserId].every((x) => UUID_RE.test(x))) {
    return { ok: false, status: STATUS.INVALID_INPUT, contact: null, reason: "ids" };
  }
  if (!FOLLOW_UP_STATUSES.includes(followUpStatus)) {
    return { ok: false, status: STATUS.INVALID_INPUT, contact: null, reason: "follow_up_status" };
  }
  try {
    return await withClient(db, async (client) => {
      const existing = await client.query(
        `SELECT * FROM blessboard.journey_contacts WHERE id=$1 AND church_id=$2 LIMIT 1`,
        [contactId, churchId]
      );
      if (!existing.rows[0]) return { ok: false, status: STATUS.NOT_FOUND, contact: null };
      const row = existing.rows[0];
      const authz = await requirePerm(client, input, "journey_contacts.edit_team", {
        organizationId: row.organization_id,
        churchId,
        branchId: row.branch_id,
      });
      if (!authz.ok) return { ...authz, contact: null };

      const outcome =
        input.followUpOutcomeSummary != null
          ? String(input.followUpOutcomeSummary).trim().slice(0, 500)
          : row.follow_up_outcome_summary;
      const assigned =
        input.followUpAssignedUserId && UUID_RE.test(String(input.followUpAssignedUserId))
          ? String(input.followUpAssignedUserId)
          : row.follow_up_assigned_user_id;

      const upd = await client.query(
        `UPDATE blessboard.journey_contacts
            SET follow_up_status = $3,
                follow_up_outcome_summary = $4,
                follow_up_assigned_user_id = $5,
                follow_up_updated_at = now(),
                updated_at = now()
          WHERE id = $1 AND church_id = $2
          RETURNING *`,
        [contactId, churchId, followUpStatus, outcome || null, assigned || null]
      );
      return { ok: true, status: STATUS.OK, contact: mapContact(upd.rows[0]) };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      contact: null,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function getHandoverDetail(db, input) {
  const handoverId = String((input && input.handoverId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  if (!UUID_RE.test(handoverId) || !UUID_RE.test(churchId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, handover: null, events: [] };
  }
  try {
    return await withClient(db, async (client) => {
      const r = await client.query(
        `SELECT * FROM blessboard.member_journey_handovers WHERE id=$1 AND church_id=$2 LIMIT 1`,
        [handoverId, churchId]
      );
      if (!r.rows[0]) {
        return { ok: false, status: STATUS.NOT_FOUND, handover: null, events: [] };
      }
      const row = r.rows[0];
      const authz = await requirePerm(client, input, "journey_handovers.view_status", {
        organizationId: row.organization_id,
        churchId,
        branchId: row.branch_id,
      });
      if (!authz.ok) return { ...authz, handover: null, events: [] };

      const events = await client.query(
        `SELECT id, event_key, previous_status, new_status, reason, created_at, actor_user_id
           FROM blessboard.member_journey_handover_events
          WHERE handover_id = $1
          ORDER BY created_at ASC`,
        [handoverId]
      );
      return {
        ok: true,
        status: STATUS.OK,
        handover: {
          id: row.id,
          organizationId: row.organization_id,
          churchId: row.church_id,
          branchId: row.branch_id,
          journeyContactId: row.journey_contact_id,
          memberId: row.member_id,
          fromStage: row.from_stage,
          toStage: row.to_stage,
          status: row.status,
          notesSummary: row.notes_summary,
          returnReason: row.return_reason,
          assignedUserId: row.assigned_user_id,
          submittedAt: row.submitted_at,
          acceptedAt: row.accepted_at,
          updatedAt: row.updated_at,
          createdAt: row.created_at,
        },
        events: events.rows.map((e) => ({
          id: e.id,
          eventKey: e.event_key,
          previousStatus: e.previous_status,
          newStatus: e.new_status,
          // Staff may see operational return reason on detail; portal never gets this.
          reason: e.reason,
          createdAt: e.created_at,
          actorUserId: e.actor_user_id,
        })),
      };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      handover: null,
      events: [],
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function getStaffMemberJourneySummary(db, input) {
  const memberId = String((input && input.memberId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  if (![memberId, churchId, organizationId].every((x) => UUID_RE.test(x))) {
    return { ok: false, status: STATUS.INVALID_INPUT, summary: null };
  }
  try {
    return await withClient(db, async (client) => {
      const authz = await requirePerm(client, input, "members.view", {
        organizationId,
        churchId,
        branchId: input.branchId || null,
        memberId,
        assignedMemberId: memberId,
      });
      if (!authz.ok) return { ...authz, summary: null };

      const cell = await client.query(
        `SELECT c.display_name, c.cell_key, cm.care_status, cm.status
           FROM blessboard.cell_memberships cm
           INNER JOIN blessboard.cells c ON c.id = cm.cell_id
          WHERE cm.church_id=$1 AND cm.member_id=$2 AND cm.status='active' AND cm.is_primary=true
          LIMIT 1`,
        [churchId, memberId]
      );
      const classes = await client.query(
        `SELECT e.status, e.attendance_count, e.completion_recommended_at, e.completion_approved_at,
                p.display_name AS program_name, co.display_name AS cohort_name
           FROM blessboard.class_enrolments e
           INNER JOIN blessboard.class_cohorts co ON co.id = e.cohort_id
           INNER JOIN blessboard.class_programs p ON p.id = co.program_id
          WHERE e.church_id=$1 AND e.member_id=$2
          ORDER BY e.enrolled_at DESC
          LIMIT 20`,
        [churchId, memberId]
      );
      const depts = await client.query(
        `SELECT d.display_name, dm.status
           FROM blessboard.department_memberships dm
           INNER JOIN blessboard.departments d ON d.id = dm.department_id
          WHERE dm.church_id=$1 AND dm.member_id=$2 AND dm.status='active'
          ORDER BY d.display_name
          LIMIT 20`,
        [churchId, memberId]
      );
      const handovers = await client.query(
        `SELECT id, from_stage, to_stage, status, updated_at
           FROM blessboard.member_journey_handovers
          WHERE church_id=$1 AND member_id=$2
          ORDER BY updated_at DESC
          LIMIT 10`,
        [churchId, memberId]
      );
      const active = handovers.rows.find((h) =>
        ["draft", "submitted", "accepted", "returned", "assigned", "escalated"].includes(h.status)
      );
      return {
        ok: true,
        status: STATUS.OK,
        summary: {
          currentStage: active ? active.to_stage : null,
          activeHandoverStatus: active ? active.status : null,
          cell: cell.rows[0]
            ? {
                displayName: cell.rows[0].display_name,
                cellKey: cell.rows[0].cell_key,
                careStatus: cell.rows[0].care_status,
              }
            : null,
          classes: classes.rows.map((r) => ({
            programName: r.program_name,
            cohortName: r.cohort_name,
            status: r.status,
            attendanceCount: r.attendance_count,
            recommended: Boolean(r.completion_recommended_at),
            approved: Boolean(r.completion_approved_at),
          })),
          departments: depts.rows.map((r) => ({
            displayName: r.display_name,
            status: r.status,
          })),
          handovers: handovers.rows.map((h) => ({
            id: h.id,
            fromStage: h.from_stage,
            toStage: h.to_stage,
            status: h.status,
            updatedAt: h.updated_at,
          })),
        },
      };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      summary: null,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

/**
 * Member-portal safe summary — no staff notes, return reasons, referrals, or care internals.
 */
async function getMemberPortalJourneySummary(db, input) {
  const memberId = String((input && input.memberId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  if (!UUID_RE.test(memberId) || !UUID_RE.test(churchId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, summary: null };
  }
  try {
    return await withClient(db, async (client) => {
      const cell = await client.query(
        `SELECT c.display_name
           FROM blessboard.cell_memberships cm
           INNER JOIN blessboard.cells c ON c.id = cm.cell_id
          WHERE cm.church_id=$1 AND cm.member_id=$2 AND cm.status='active' AND cm.is_primary=true
          LIMIT 1`,
        [churchId, memberId]
      );
      const classes = await client.query(
        `SELECT e.status, p.display_name AS program_name, co.display_name AS cohort_name
           FROM blessboard.class_enrolments e
           INNER JOIN blessboard.class_cohorts co ON co.id = e.cohort_id
           INNER JOIN blessboard.class_programs p ON p.id = co.program_id
          WHERE e.church_id=$1 AND e.member_id=$2
          ORDER BY e.enrolled_at DESC
          LIMIT 20`,
        [churchId, memberId]
      );
      const depts = await client.query(
        `SELECT d.display_name
           FROM blessboard.department_memberships dm
           INNER JOIN blessboard.departments d ON d.id = dm.department_id
          WHERE dm.church_id=$1 AND dm.member_id=$2 AND dm.status='active'
          ORDER BY d.display_name
          LIMIT 20`,
        [churchId, memberId]
      );
      return {
        ok: true,
        status: STATUS.OK,
        summary: {
          cellName: cell.rows[0] ? cell.rows[0].display_name : null,
          classes: classes.rows.map((r) => ({
            programName: r.program_name,
            cohortName: r.cohort_name,
            status: r.status,
          })),
          departments: depts.rows.map((r) => r.display_name),
        },
      };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      summary: null,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

module.exports = {
  STATUS,
  FOLLOW_UP_STATUSES,
  STALE_DAYS,
  getDashboardCounts,
  listJourneyContacts,
  getJourneyContact,
  findContactDuplicates,
  updateContactFollowUp,
  getHandoverDetail,
  getStaffMemberJourneySummary,
  getMemberPortalJourneySummary,
};
