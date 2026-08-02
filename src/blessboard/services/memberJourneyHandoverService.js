"use strict";

/**
 * Member journey handover state machine + contact services.
 * Status updates only through these transitions — never from routes directly.
 */

const { authorize } = require("./blessBoardRbacAuthorizationService");
const { recordBlessBoardAudit } = require("./recordBlessBoardAudit");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  CONFLICT: "conflict",
  LOOKUP_ERROR: "lookup_error",
});

const STAGES = Object.freeze([
  "evangelism",
  "registration",
  "first_timers",
  "orientation",
  "cell_assignment",
  "salvation_class",
  "foundation_class",
  "establishment_class",
  "department_service",
  "ongoing_cell_care",
  "minister_referral",
  "pastor_referral",
]);

const HANDOVER_STATUSES = Object.freeze([
  "draft",
  "submitted",
  "accepted",
  "returned",
  "assigned",
  "completed",
  "escalated",
  "closed",
  "cancelled",
]);

/** @type {Record<string, string[]>} */
const TRANSITIONS = Object.freeze({
  draft: ["submitted", "cancelled"],
  submitted: ["accepted", "returned", "cancelled"],
  accepted: ["assigned", "completed", "escalated", "cancelled"],
  assigned: ["completed", "escalated"],
  returned: ["submitted", "cancelled"],
  completed: ["closed"],
  escalated: ["closed", "assigned"],
  closed: [],
  cancelled: [],
});

const EVENT_FOR_STATUS = Object.freeze({
  submitted: "journey.handover.submitted",
  accepted: "journey.handover.accepted",
  returned: "journey.handover.returned",
  assigned: "journey.handover.assigned",
  completed: "journey.handover.completed",
  escalated: "journey.handover.escalated",
  closed: "journey.handover.closed",
  cancelled: "journey.handover.cancelled",
});

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;

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

function mapHandover(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    churchId: row.church_id,
    branchId: row.branch_id,
    journeyContactId: row.journey_contact_id || null,
    memberId: row.member_id || null,
    fromStage: row.from_stage,
    toStage: row.to_stage,
    status: row.status,
    submittedByUserId: row.submitted_by_user_id || null,
    submittedAt: row.submitted_at || null,
    acceptedByUserId: row.accepted_by_user_id || null,
    acceptedAt: row.accepted_at || null,
    returnedByUserId: row.returned_by_user_id || null,
    returnedAt: row.returned_at || null,
    returnReason: row.return_reason || null,
    assignedUserId: row.assigned_user_id || null,
    assignedScopeType: row.assigned_scope_type || null,
    assignedScopeId: row.assigned_scope_id || null,
    completedByUserId: row.completed_by_user_id || null,
    completedAt: row.completed_at || null,
    escalatedByUserId: row.escalated_by_user_id || null,
    escalatedAt: row.escalated_at || null,
    closedByUserId: row.closed_by_user_id || null,
    closedAt: row.closed_at || null,
    notesSummary: row.notes_summary || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function canTransition(from, to) {
  const allowed = TRANSITIONS[from] || [];
  return allowed.includes(to);
}

/**
 * After acceptance, previous-stage actors may only view status — not edit core fields.
 * @param {string} status
 */
function previousStageMayEdit(status) {
  return status === "draft" || status === "returned";
}

function receivingStageMayAct(status) {
  return status === "accepted" || status === "assigned" || status === "escalated";
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

async function insertHandoverEvent(client, input) {
  await client.query(
    `INSERT INTO blessboard.member_journey_handover_events (
       handover_id, organization_id, actor_user_id, event_key,
       previous_status, new_status, reason, metadata_json
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
    [
      input.handoverId,
      input.organizationId,
      input.actorUserId || null,
      input.eventKey,
      input.previousStatus || null,
      input.newStatus || null,
      input.reason || null,
      JSON.stringify(input.metadata || {}),
    ]
  );
}

async function findHandover(client, handoverId, churchId) {
  const r = await client.query(
    `SELECT * FROM blessboard.member_journey_handovers
      WHERE id = $1 AND church_id = $2 LIMIT 1`,
    [handoverId, churchId]
  );
  return mapHandover(r.rows[0] || null);
}

/**
 * @param {{ query: Function, connect?: Function }} db
 * @param {object} input
 */
async function createJourneyContact(db, input) {
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  const firstName = String((input && input.firstName) || "").trim();
  const lastName = String((input && input.lastName) || "").trim();
  const emailDisplay = input.email != null ? String(input.email).trim() : "";
  const phoneDisplay = input.phone != null ? String(input.phone).trim() : "";
  const sourceType = String((input && input.sourceType) || "manual").trim();
  const emailNormalized = emailDisplay ? emailDisplay.toLowerCase() : null;
  const phoneNormalized = phoneDisplay ? phoneDisplay.replace(/[^\d+]/g, "") : null;

  if (![actorUserId, organizationId, churchId, branchId].every((x) => UUID_RE.test(x))) {
    return { ok: false, status: STATUS.INVALID_INPUT, contact: null, reason: "ids" };
  }
  if (!firstName || !lastName) {
    return { ok: false, status: STATUS.INVALID_INPUT, contact: null, reason: "name" };
  }
  if (!emailNormalized && !phoneNormalized) {
    return { ok: false, status: STATUS.INVALID_INPUT, contact: null, reason: "contact" };
  }
  if (emailNormalized && !EMAIL_RE.test(emailNormalized)) {
    return { ok: false, status: STATUS.INVALID_INPUT, contact: null, reason: "email" };
  }

  try {
    return await withClient(db, async (client) => {
      const authz = await requirePerm(client, input, "journey_contacts.create", {
        organizationId,
        churchId,
        branchId,
      });
      if (!authz.ok) return { ...authz, contact: null };

      const ins = await client.query(
        `INSERT INTO blessboard.journey_contacts (
           organization_id, church_id, branch_id, first_name, last_name,
           email_normalized, email_display, phone_normalized, phone_display,
           source_type, membership_interest, decision_of_faith, consent_status,
           created_by_user_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING *`,
        [
          organizationId,
          churchId,
          branchId,
          firstName,
          lastName,
          emailNormalized,
          emailDisplay || null,
          phoneNormalized,
          phoneDisplay || null,
          sourceType,
          input.membershipInterest || null,
          Boolean(input.decisionOfFaith),
          input.consentStatus || "unknown",
          actorUserId,
        ]
      );
      const contact = ins.rows[0];
      await recordBlessBoardAudit(client, {
        organizationId,
        churchId,
        branchId,
        actorUserId,
        actionKey: "journey.contact.created",
        entityType: "journey_contact",
        entityId: contact.id,
        outcome: "success",
        metadata: { source_type: sourceType, branch_id: branchId },
      });
      return {
        ok: true,
        status: STATUS.OK,
        contact: {
          id: contact.id,
          firstName: contact.first_name,
          lastName: contact.last_name,
          status: contact.status,
          memberId: contact.member_id,
        },
      };
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

async function updateJourneyContact(db, input) {
  const contactId = String((input && input.contactId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!UUID_RE.test(contactId) || !UUID_RE.test(churchId) || !UUID_RE.test(actorUserId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, contact: null, reason: "ids" };
  }
  try {
    return await withClient(db, async (client) => {
      const existing = await client.query(
        `SELECT * FROM blessboard.journey_contacts WHERE id = $1 AND church_id = $2 LIMIT 1`,
        [contactId, churchId]
      );
      if (!existing.rows[0]) {
        return { ok: false, status: STATUS.NOT_FOUND, contact: null };
      }
      const row = existing.rows[0];
      const authz = await requirePerm(client, input, "journey_contacts.edit_team", {
        organizationId: row.organization_id,
        churchId,
        branchId: row.branch_id,
      });
      if (!authz.ok) return { ...authz, contact: null };

      // Block edits once linked or closed
      if (row.status === "linked" || row.status === "closed" || row.status === "archived") {
        return { ok: false, status: STATUS.CONFLICT, contact: null, reason: "status_locked" };
      }

      const firstName = input.firstName != null ? String(input.firstName).trim() : row.first_name;
      const lastName = input.lastName != null ? String(input.lastName).trim() : row.last_name;
      const upd = await client.query(
        `UPDATE blessboard.journey_contacts
            SET first_name = $3, last_name = $4, membership_interest = COALESCE($5, membership_interest),
                decision_of_faith = COALESCE($6, decision_of_faith), updated_at = now()
          WHERE id = $1 AND church_id = $2
          RETURNING id, first_name, last_name, status, member_id`,
        [
          contactId,
          churchId,
          firstName,
          lastName,
          input.membershipInterest != null ? String(input.membershipInterest).trim() : null,
          input.decisionOfFaith != null ? Boolean(input.decisionOfFaith) : null,
        ]
      );
      await recordBlessBoardAudit(client, {
        organizationId: row.organization_id,
        churchId,
        branchId: row.branch_id,
        actorUserId,
        actionKey: "journey.contact.updated",
        entityType: "journey_contact",
        entityId: contactId,
        outcome: "success",
        metadata: {},
      });
      return {
        ok: true,
        status: STATUS.OK,
        contact: {
          id: upd.rows[0].id,
          firstName: upd.rows[0].first_name,
          lastName: upd.rows[0].last_name,
          status: upd.rows[0].status,
          memberId: upd.rows[0].member_id,
        },
      };
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

/**
 * Link contact to existing member. Does not auto-create members.
 * Becomes member association when an existing blessboard.members row is linked.
 */
async function linkJourneyContactToMember(db, input) {
  const contactId = String((input && input.contactId) || "").trim();
  const memberId = String((input && input.memberId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (![contactId, memberId, churchId, actorUserId].every((x) => UUID_RE.test(x))) {
    return { ok: false, status: STATUS.INVALID_INPUT, contact: null, reason: "ids" };
  }
  try {
    return await withClient(db, async (client) => {
      const existing = await client.query(
        `SELECT * FROM blessboard.journey_contacts WHERE id = $1 AND church_id = $2 LIMIT 1`,
        [contactId, churchId]
      );
      if (!existing.rows[0]) return { ok: false, status: STATUS.NOT_FOUND, contact: null };
      const row = existing.rows[0];
      const authz = await requirePerm(client, input, "journey_contacts.link_member", {
        organizationId: row.organization_id,
        churchId,
        branchId: row.branch_id,
      });
      if (!authz.ok) return { ...authz, contact: null };

      const member = await client.query(
        `SELECT id FROM blessboard.members WHERE id = $1 AND church_id = $2 LIMIT 1`,
        [memberId, churchId]
      );
      if (!member.rows[0]) {
        return { ok: false, status: STATUS.NOT_FOUND, contact: null, reason: "member" };
      }

      const upd = await client.query(
        `UPDATE blessboard.journey_contacts
            SET member_id = $3, status = 'linked', linked_by_user_id = $4, linked_at = now(), updated_at = now()
          WHERE id = $1 AND church_id = $2
          RETURNING id, status, member_id`,
        [contactId, churchId, memberId, actorUserId]
      );
      await recordBlessBoardAudit(client, {
        organizationId: row.organization_id,
        churchId,
        branchId: row.branch_id,
        actorUserId,
        actionKey: "journey.contact.linked_to_member",
        entityType: "journey_contact",
        entityId: contactId,
        outcome: "success",
        metadata: { member_id: memberId },
      });
      return {
        ok: true,
        status: STATUS.OK,
        contact: {
          id: upd.rows[0].id,
          status: upd.rows[0].status,
          memberId: upd.rows[0].member_id,
        },
      };
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

async function createHandover(db, input) {
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  const fromStage = String((input && input.fromStage) || "").trim();
  const toStage = String((input && input.toStage) || "").trim();
  const journeyContactId = input.journeyContactId ? String(input.journeyContactId).trim() : null;
  const memberId = input.memberId ? String(input.memberId).trim() : null;

  if (![actorUserId, organizationId, churchId, branchId].every((x) => UUID_RE.test(x))) {
    return { ok: false, status: STATUS.INVALID_INPUT, handover: null, reason: "ids" };
  }
  if (!STAGES.includes(fromStage) || !STAGES.includes(toStage)) {
    return { ok: false, status: STATUS.INVALID_INPUT, handover: null, reason: "stage" };
  }
  if (!journeyContactId && !memberId) {
    return { ok: false, status: STATUS.INVALID_INPUT, handover: null, reason: "subject" };
  }

  try {
    return await withClient(db, async (client) => {
      const authz = await requirePerm(client, input, "journey_handovers.create", {
        organizationId,
        churchId,
        branchId,
      });
      if (!authz.ok) return { ...authz, handover: null };

      const notes =
        input.notesSummary != null ? String(input.notesSummary).trim().slice(0, 500) : null;

      const ins = await client.query(
        `INSERT INTO blessboard.member_journey_handovers (
           organization_id, church_id, branch_id, journey_contact_id, member_id,
           from_stage, to_stage, status, notes_summary
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',$8)
         RETURNING *`,
        [
          organizationId,
          churchId,
          branchId,
          journeyContactId,
          memberId,
          fromStage,
          toStage,
          notes,
        ]
      );
      const handover = mapHandover(ins.rows[0]);
      await insertHandoverEvent(client, {
        handoverId: handover.id,
        organizationId,
        actorUserId,
        eventKey: "journey.handover.created",
        previousStatus: null,
        newStatus: "draft",
      });
      await recordBlessBoardAudit(client, {
        organizationId,
        churchId,
        branchId,
        actorUserId,
        actionKey: "journey.handover.created",
        entityType: "member_journey_handover",
        entityId: handover.id,
        outcome: "success",
        metadata: { from_stage: fromStage, to_stage: toStage },
      });
      return { ok: true, status: STATUS.OK, handover };
    });
  } catch (err) {
    const msg = err && err.message ? String(err.message) : "";
    if (/unique|duplicate/i.test(msg) || (err && err.code === "23505")) {
      return { ok: false, status: STATUS.CONFLICT, handover: null, reason: "duplicate_active" };
    }
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      handover: null,
      reason: msg || "error",
    };
  }
}

async function transitionHandover(db, input, toStatus, permissionKey, extra) {
  const handoverId = String((input && input.handoverId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!UUID_RE.test(handoverId) || !UUID_RE.test(churchId) || !UUID_RE.test(actorUserId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, handover: null, reason: "ids" };
  }
  if (toStatus === "returned") {
    const reason = input.returnReason != null ? String(input.returnReason).trim() : "";
    if (!reason) {
      return { ok: false, status: STATUS.INVALID_INPUT, handover: null, reason: "return_reason" };
    }
  }

  try {
    return await withClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const current = await findHandover(client, handoverId, churchId);
        if (!current) {
          await client.query("ROLLBACK");
          return { ok: false, status: STATUS.NOT_FOUND, handover: null };
        }
        if (!canTransition(current.status, toStatus)) {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.CONFLICT,
            handover: current,
            reason: "invalid_transition",
          };
        }

        const authz = await requirePerm(client, input, permissionKey, {
          organizationId: current.organizationId,
          churchId: current.churchId,
          branchId: current.branchId,
        });
        if (!authz.ok) {
          await client.query("ROLLBACK");
          return { ...authz, handover: null };
        }

        // Previous-stage edit restriction: core fields locked after submit/accept
        if (
          extra &&
          extra.requirePreviousStageEdit &&
          !previousStageMayEdit(current.status)
        ) {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.FORBIDDEN,
            handover: current,
            reason: "previous_stage_edit_denied",
          };
        }
        if (extra && extra.requireReceivingStage && !receivingStageMayAct(current.status)) {
          await client.query("ROLLBACK");
          return {
            ok: false,
            status: STATUS.FORBIDDEN,
            handover: current,
            reason: "receiving_stage_required",
          };
        }

        const sets = ["status = $3", "updated_at = now()"];
        const params = [handoverId, churchId, toStatus];
        let p = 4;
        if (toStatus === "submitted") {
          sets.push(`submitted_by_user_id = $${p++}`, `submitted_at = now()`);
          params.push(actorUserId);
        } else if (toStatus === "accepted") {
          sets.push(`accepted_by_user_id = $${p++}`, `accepted_at = now()`);
          params.push(actorUserId);
        } else if (toStatus === "returned") {
          sets.push(
            `returned_by_user_id = $${p++}`,
            `returned_at = now()`,
            `return_reason = $${p++}`
          );
          params.push(actorUserId, String(input.returnReason).trim());
        } else if (toStatus === "assigned") {
          sets.push(`assigned_user_id = $${p++}`);
          params.push(input.assignedUserId || actorUserId);
          if (input.assignedScopeType) {
            sets.push(`assigned_scope_type = $${p++}`, `assigned_scope_id = $${p++}`);
            params.push(input.assignedScopeType, input.assignedScopeId || null);
          }
        } else if (toStatus === "completed") {
          sets.push(`completed_by_user_id = $${p++}`, `completed_at = now()`);
          params.push(actorUserId);
        } else if (toStatus === "escalated") {
          sets.push(`escalated_by_user_id = $${p++}`, `escalated_at = now()`);
          params.push(actorUserId);
        } else if (toStatus === "closed") {
          sets.push(`closed_by_user_id = $${p++}`, `closed_at = now()`);
          params.push(actorUserId);
        } else if (toStatus === "cancelled") {
          sets.push(`cancelled_by_user_id = $${p++}`, `cancelled_at = now()`);
          params.push(actorUserId);
        }

        const upd = await client.query(
          `UPDATE blessboard.member_journey_handovers
              SET ${sets.join(", ")}
            WHERE id = $1 AND church_id = $2
            RETURNING *`,
          params
        );
        const handover = mapHandover(upd.rows[0]);
        const eventKey = EVENT_FOR_STATUS[toStatus] || "journey.handover.created";
        await insertHandoverEvent(client, {
          handoverId,
          organizationId: current.organizationId,
          actorUserId,
          eventKey,
          previousStatus: current.status,
          newStatus: toStatus,
          reason: toStatus === "returned" ? String(input.returnReason).trim() : null,
        });
        await recordBlessBoardAudit(client, {
          organizationId: current.organizationId,
          churchId,
          branchId: current.branchId,
          actorUserId,
          actionKey: eventKey,
          entityType: "member_journey_handover",
          entityId: handoverId,
          outcome: "success",
          metadata: {
            from_status: current.status,
            to_status: toStatus,
            from_stage: current.fromStage,
            to_stage: current.toStage,
          },
        });
        const { notifyLinkedMemberSafe } = require("./memberJourneyNotify");
        await notifyLinkedMemberSafe(client, {
          churchId,
          branchId: current.branchId,
          memberId: current.memberId,
          eventKey,
        });
        await client.query("COMMIT");
        return { ok: true, status: STATUS.OK, handover };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      handover: null,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function submitHandover(db, input) {
  return transitionHandover(db, input, "submitted", "journey_handovers.submit", {
    requirePreviousStageEdit: true,
  });
}
async function acceptHandover(db, input) {
  return transitionHandover(db, input, "accepted", "journey_handovers.accept");
}
async function returnHandover(db, input) {
  return transitionHandover(db, input, "returned", "journey_handovers.return");
}
async function assignHandover(db, input) {
  return transitionHandover(db, input, "assigned", "journey_handovers.assign", {
    requireReceivingStage: true,
  });
}
async function completeHandover(db, input) {
  return transitionHandover(db, input, "completed", "journey_handovers.complete", {
    requireReceivingStage: true,
  });
}
async function escalateHandover(db, input) {
  return transitionHandover(db, input, "escalated", "journey_handovers.escalate");
}
async function closeHandover(db, input) {
  return transitionHandover(db, input, "closed", "journey_handovers.close");
}

/**
 * Update core handover fields (notes_summary / stages). Allowed only while draft or returned.
 */
async function updateHandoverCore(db, input) {
  const handoverId = String((input && input.handoverId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!UUID_RE.test(handoverId) || !UUID_RE.test(churchId) || !UUID_RE.test(actorUserId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, handover: null, reason: "ids" };
  }
  try {
    return await withClient(db, async (client) => {
      const current = await findHandover(client, handoverId, churchId);
      if (!current) {
        return { ok: false, status: STATUS.NOT_FOUND, handover: null };
      }
      if (!previousStageMayEdit(current.status)) {
        return {
          ok: false,
          status: STATUS.FORBIDDEN,
          handover: current,
          reason: "previous_stage_edit_denied",
        };
      }
      const authz = await requirePerm(client, input, "journey_handovers.create", {
        organizationId: current.organizationId,
        churchId: current.churchId,
        branchId: current.branchId,
      });
      if (!authz.ok) return { ...authz, handover: null };

      const notes =
        input.notesSummary != null
          ? String(input.notesSummary).trim().slice(0, 500)
          : current.notesSummary;
      const upd = await client.query(
        `UPDATE blessboard.member_journey_handovers
            SET notes_summary = $3, updated_at = now()
          WHERE id = $1 AND church_id = $2
          RETURNING *`,
        [handoverId, churchId, notes]
      );
      return { ok: true, status: STATUS.OK, handover: mapHandover(upd.rows[0]) };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      handover: null,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function listHandovers(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  if (!UUID_RE.test(churchId) || !UUID_RE.test(organizationId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, handovers: [] };
  }
  try {
    return await withClient(db, async (client) => {
      const authz = await requirePerm(client, input, "journey_handovers.view_status", {
        organizationId,
        churchId,
        branchId: input.branchId || null,
      });
      if (!authz.ok) return { ...authz, handovers: [] };
      const r = await client.query(
        `SELECT * FROM blessboard.member_journey_handovers
          WHERE church_id = $1 AND organization_id = $2
          ORDER BY updated_at DESC
          LIMIT 100`,
        [churchId, organizationId]
      );
      return { ok: true, status: STATUS.OK, handovers: r.rows.map(mapHandover) };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      handovers: [],
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

module.exports = {
  STATUS,
  STAGES,
  HANDOVER_STATUSES,
  TRANSITIONS,
  canTransition,
  previousStageMayEdit,
  receivingStageMayAct,
  createJourneyContact,
  updateJourneyContact,
  linkJourneyContactToMember,
  createHandover,
  updateHandoverCore,
  submitHandover,
  acceptHandover,
  returnHandover,
  assignHandover,
  completeHandover,
  escalateHandover,
  closeHandover,
  listHandovers,
  findHandover,
};
