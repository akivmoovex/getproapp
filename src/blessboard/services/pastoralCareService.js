"use strict";

/**
 * Pastoral care cases — confidential domain services.
 * Note bodies stay off list metadata. Routes must not mutate case state directly.
 */

const { authorize } = require("./blessBoardRbacAuthorizationService");
const { recordBlessBoardAudit } = require("./recordBlessBoardAudit");
const { notifyPastoralSafe } = require("./pastoralWelfareNotify");

const STATUS = Object.freeze({
  OK: "ok",
  INVALID_INPUT: "invalid_input",
  FORBIDDEN: "forbidden",
  NOT_FOUND: "not_found",
  CONFLICT: "conflict",
  LOOKUP_ERROR: "lookup_error",
});

const CONFIDENTIALITY = Object.freeze([
  "general_care",
  "restricted_care",
  "highly_confidential",
  "safeguarding_restricted",
]);

const NOTE_VISIBILITY = Object.freeze([
  "referrer_safe",
  "assigned_care",
  "minister_only",
  "pastor_only",
  "safeguarding_only",
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const KEY_RE = /^[a-z][a-z0-9_]{0,63}$/;

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

function resourceBase(input, extras) {
  return {
    organizationId: input.organizationId,
    churchId: input.churchId,
    branchId: input.branchId || null,
    ...(extras || {}),
  };
}

async function requirePerm(client, input, permission, extras) {
  const resourceContext = resourceBase(input, extras);
  const result = await authorize(client, {
    actor: { userId: input.actorUserId },
    permission,
    tenantContext: input.tenantContext,
    resourceContext,
  });
  if (result.allowed) {
    return { ok: true, authz: result };
  }
  // Cell-scoped actors may pass cellId separately from branch.
  if (input.cellId && !resourceContext.cellId) {
    const retry = await authorize(client, {
      actor: { userId: input.actorUserId },
      permission,
      tenantContext: input.tenantContext,
      resourceContext: { ...resourceContext, cellId: String(input.cellId) },
    });
    if (retry.allowed) return { ok: true, authz: retry };
  }
  return { ok: false, status: STATUS.FORBIDDEN, reason: result.reasonCode };
}

async function insertCaseEvent(client, row) {
  await client.query(
    `INSERT INTO blessboard.pastoral_case_events (
       case_id, organization_id, actor_user_id, event_key,
       previous_status, new_status, previous_confidentiality, new_confidentiality, metadata_json
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
    [
      row.caseId,
      row.organizationId,
      row.actorUserId || null,
      row.eventKey,
      row.previousStatus || null,
      row.newStatus || null,
      row.previousConfidentiality || null,
      row.newConfidentiality || null,
      JSON.stringify(row.metadata || {}),
    ]
  );
}

async function loadCase(client, caseId, churchId) {
  const r = await client.query(
    `SELECT id, organization_id, church_id, branch_id, member_id, source_handover_id,
            case_key, category, confidentiality_level, status, title,
            opened_by_user_id, assigned_minister_user_id, assigned_pastor_user_id,
            escalated_at, escalated_by_user_id, closed_at, closed_by_user_id,
            archived_at, created_at, updated_at
       FROM blessboard.pastoral_cases
      WHERE id = $1 AND church_id = $2
      LIMIT 1`,
    [caseId, churchId]
  );
  return r.rows[0] || null;
}

async function listActiveAssignments(client, caseId, userId) {
  const r = await client.query(
    `SELECT id, assignment_role, user_id
       FROM blessboard.pastoral_case_assignments
      WHERE case_id = $1 AND user_id = $2 AND status = 'active'`,
    [caseId, userId]
  );
  return r.rows;
}

function mapCaseMeta(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    churchId: row.church_id,
    branchId: row.branch_id,
    memberId: row.member_id,
    sourceHandoverId: row.source_handover_id,
    caseKey: row.case_key,
    category: row.category,
    confidentialityLevel: row.confidentiality_level,
    status: row.status,
    title: row.title,
    openedByUserId: row.opened_by_user_id,
    assignedMinisterUserId: row.assigned_minister_user_id,
    assignedPastorUserId: row.assigned_pastor_user_id,
    escalatedAt: row.escalated_at,
    closedAt: row.closed_at,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Case list / metadata access: permission + explicit relationship.
 * Does not imply note-body access.
 */
async function evaluateCaseRelationship(client, input, caseRow) {
  const actorUserId = String(input.actorUserId);
  const assignments = await listActiveAssignments(client, caseRow.id, actorUserId);
  const roles = new Set(assignments.map((a) => a.assignment_role));
  const isOpenedBy = uuidEqual(caseRow.opened_by_user_id, actorUserId);
  const isAssignedMinister = uuidEqual(caseRow.assigned_minister_user_id, actorUserId);
  const isAssignedPastor = uuidEqual(caseRow.assigned_pastor_user_id, actorUserId);
  const isEscalated = String(caseRow.status) === "escalated" || Boolean(caseRow.escalated_at);

  const canOverseeEscalated = await requirePerm(client, input, "pastoral_cases.assign", {
    branchId: caseRow.branch_id,
    assignedCaseId: caseRow.id,
    caseId: caseRow.id,
  });

  const linked =
    roles.size > 0 ||
    isOpenedBy ||
    isAssignedMinister ||
    isAssignedPastor ||
    (isEscalated && canOverseeEscalated.ok);

  return {
    linked,
    roles,
    isOpenedBy,
    isAssignedMinister,
    isAssignedPastor,
    isEscalated,
    canOverseeEscalated: canOverseeEscalated.ok,
  };
}

function uuidEqual(a, b) {
  if (a == null || b == null) return false;
  return String(a).toLowerCase() === String(b).toLowerCase();
}

async function assertMetadataAccess(client, input, caseRow) {
  if (
    !uuidEqual(caseRow.organization_id, input.organizationId) ||
    !uuidEqual(caseRow.church_id, input.churchId)
  ) {
    return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
  }

  const level = String(caseRow.confidentiality_level);
  let permKey = "pastoral_cases.view_assigned";
  if (level === "safeguarding_restricted") {
    permKey = "pastoral_cases.view_safeguarding";
  } else if (level === "highly_confidential") {
    permKey = "pastoral_cases.view_highly_confidential";
  }

  // Referrers may see own general/restricted referral metadata with referral or view_assigned.
  const rel = await evaluateCaseRelationship(client, input, caseRow);
  if (!rel.linked) {
    return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
  }

  if (level === "safeguarding_restricted") {
    const authz = await requirePerm(client, input, "pastoral_cases.view_safeguarding", {
      branchId: caseRow.branch_id,
      assignedCaseId: caseRow.id,
      caseId: caseRow.id,
    });
    if (!authz.ok || (!rel.roles.has("safeguarding") && !rel.isAssignedPastor && !rel.canOverseeEscalated)) {
      return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
    }
  } else if (level === "highly_confidential") {
    const authz = await requirePerm(client, input, "pastoral_cases.view_highly_confidential", {
      branchId: caseRow.branch_id,
      assignedCaseId: caseRow.id,
      caseId: caseRow.id,
    });
    if (!authz.ok) {
      return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
    }
  } else {
    const view = await requirePerm(client, input, "pastoral_cases.view_assigned", {
      branchId: caseRow.branch_id,
      assignedCaseId: caseRow.id,
      caseId: caseRow.id,
    });
    const referral = await requirePerm(client, input, "pastoral_referrals.create", {
      branchId: caseRow.branch_id,
      assignedCaseId: caseRow.id,
      caseId: caseRow.id,
    });
    if (!view.ok && !(referral.ok && rel.isOpenedBy)) {
      return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
    }
  }

  return { ok: true, relationship: rel, accessPermission: permKey };
}

/**
 * Note visibility rules after metadata access is granted.
 */
async function canReadNoteBody(client, input, caseRow, note, relationship) {
  const vis = String(note.note_visibility);
  const level = String(caseRow.confidentiality_level);

  if (level === "safeguarding_restricted") {
    const authz = await requirePerm(client, input, "pastoral_cases.view_safeguarding", {
      branchId: caseRow.branch_id,
      assignedCaseId: caseRow.id,
      caseId: caseRow.id,
    });
    return authz.ok && (relationship.roles.has("safeguarding") || relationship.canOverseeEscalated);
  }
  if (level === "highly_confidential") {
    const authz = await requirePerm(client, input, "pastoral_cases.view_highly_confidential", {
      branchId: caseRow.branch_id,
      assignedCaseId: caseRow.id,
      caseId: caseRow.id,
    });
    if (!authz.ok) return false;
  }

  if (vis === "referrer_safe") {
    return (
      relationship.isOpenedBy ||
      relationship.roles.size > 0 ||
      relationship.isAssignedMinister ||
      relationship.isAssignedPastor
    );
  }
  if (vis === "assigned_care") {
    return (
      relationship.isAssignedMinister ||
      relationship.isAssignedPastor ||
      relationship.roles.has("minister") ||
      relationship.roles.has("pastor") ||
      relationship.roles.has("safeguarding")
    );
  }
  if (vis === "minister_only") {
    return (
      relationship.isAssignedMinister ||
      relationship.roles.has("minister") ||
      relationship.isAssignedPastor ||
      relationship.roles.has("pastor")
    );
  }
  if (vis === "pastor_only") {
    return relationship.isAssignedPastor || relationship.roles.has("pastor");
  }
  if (vis === "safeguarding_only") {
    const authz = await requirePerm(client, input, "pastoral_cases.view_safeguarding", {
      branchId: caseRow.branch_id,
      assignedCaseId: caseRow.id,
      caseId: caseRow.id,
    });
    return authz.ok && relationship.roles.has("safeguarding");
  }
  return false;
}

async function createPastoralCase(db, input) {
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  const caseKey = String((input && input.caseKey) || "").trim().toLowerCase();
  const title = String((input && input.title) || "").trim();
  const category = String((input && input.category) || "referral").trim();
  const confidentialityLevel = String(
    (input && input.confidentialityLevel) || "general_care"
  ).trim();
  const memberId = input.memberId ? String(input.memberId).trim() : null;
  const sourceHandoverId = input.sourceHandoverId
    ? String(input.sourceHandoverId).trim()
    : null;
  const isReferral = Boolean(input.isReferral);

  if (![actorUserId, organizationId, churchId, branchId].every((x) => UUID_RE.test(x))) {
    return { ok: false, status: STATUS.INVALID_INPUT, case: null, reason: "ids" };
  }
  if (!KEY_RE.test(caseKey) || !title || title.length > 200) {
    return { ok: false, status: STATUS.INVALID_INPUT, case: null, reason: "key_title" };
  }
  if (!CONFIDENTIALITY.includes(confidentialityLevel)) {
    return { ok: false, status: STATUS.INVALID_INPUT, case: null, reason: "confidentiality" };
  }
  if (memberId && !UUID_RE.test(memberId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, case: null, reason: "member_id" };
  }
  if (sourceHandoverId && !UUID_RE.test(sourceHandoverId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, case: null, reason: "handover_id" };
  }

  try {
    return await withClient(db, async (client) => {
      const createPerm = isReferral
        ? "pastoral_referrals.create"
        : "pastoral_cases.create";
      const authz = await requirePerm(client, input, createPerm, { branchId });
      if (!authz.ok) return { ...authz, case: null };

      if (
        confidentialityLevel === "highly_confidential" ||
        confidentialityLevel === "safeguarding_restricted"
      ) {
        const elevated = await requirePerm(
          client,
          input,
          confidentialityLevel === "safeguarding_restricted"
            ? "pastoral_cases.view_safeguarding"
            : "pastoral_cases.view_highly_confidential",
          { branchId }
        );
        if (!elevated.ok) {
          return { ok: false, status: STATUS.FORBIDDEN, case: null, reason: elevated.reason };
        }
      }

      await client.query("BEGIN");
      try {
        const ins = await client.query(
          `INSERT INTO blessboard.pastoral_cases (
             organization_id, church_id, branch_id, member_id, source_handover_id,
             case_key, category, confidentiality_level, status, title, opened_by_user_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open',$9,$10)
           RETURNING *`,
          [
            organizationId,
            churchId,
            branchId,
            memberId,
            sourceHandoverId,
            caseKey,
            category,
            confidentialityLevel,
            title,
            actorUserId,
          ]
        );
        const row = ins.rows[0];
        await client.query(
          `INSERT INTO blessboard.pastoral_case_assignments (
             case_id, organization_id, church_id, user_id, assignment_role,
             status, assigned_by_user_id
           ) VALUES ($1,$2,$3,$4,'referrer','active',$4)`,
          [row.id, organizationId, churchId, actorUserId]
        );
        await insertCaseEvent(client, {
          caseId: row.id,
          organizationId,
          actorUserId,
          eventKey: "pastoral.case.created",
          previousStatus: null,
          newStatus: "open",
          previousConfidentiality: null,
          newConfidentiality: confidentialityLevel,
          metadata: { category, referral: isReferral },
        });
        await recordBlessBoardAudit(client, {
          organizationId,
          churchId,
          branchId,
          actorUserId,
          actionKey: "pastoral.case.created",
          entityType: "pastoral_case",
          entityId: row.id,
          metadata: {
            case_key: caseKey,
            confidentiality_level: confidentialityLevel,
            category,
          },
        });
        await notifyPastoralSafe(client, {
          churchId,
          memberId,
          eventKey: "pastoral.case.created",
        });
        await client.query("COMMIT");
        return { ok: true, status: STATUS.OK, case: mapCaseMeta(row) };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });
  } catch (err) {
    const msg = err && err.message ? String(err.message) : "error";
    if (/pastoral_cases_church_key_live_uidx|duplicate/i.test(msg)) {
      return { ok: false, status: STATUS.CONFLICT, case: null, reason: "case_key" };
    }
    return { ok: false, status: STATUS.LOOKUP_ERROR, case: null, reason: msg };
  }
}

async function assignPastoralCase(db, input) {
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const caseId = String((input && input.caseId) || "").trim();
  const assigneeUserId = String((input && input.assigneeUserId) || "").trim();
  const assignmentRole = String((input && input.assignmentRole) || "minister").trim();
  if (
    ![actorUserId, caseId, assigneeUserId, input.organizationId, input.churchId].every((x) =>
      UUID_RE.test(String(x || ""))
    )
  ) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }
  if (!["minister", "pastor", "safeguarding", "viewer"].includes(assignmentRole)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "role" };
  }

  try {
    return await withClient(db, async (client) => {
      const caseRow = await loadCase(client, caseId, input.churchId);
      if (!caseRow) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };

      const authz = await requirePerm(client, input, "pastoral_cases.assign", {
        branchId: caseRow.branch_id,
        assignedCaseId: caseRow.id,
        caseId: caseRow.id,
      });
      if (!authz.ok) return authz;

      if (assignmentRole === "safeguarding") {
        // Assigner must hold safeguarding permission to grant that relationship.
        const sg = await requirePerm(client, input, "pastoral_cases.view_safeguarding", {
          branchId: caseRow.branch_id,
          assignedCaseId: caseRow.id,
          caseId: caseRow.id,
        });
        if (!sg.ok) return { ok: false, status: STATUS.FORBIDDEN, reason: sg.reason };
      }

      await client.query("BEGIN");
      try {
        const existing = await client.query(
          `SELECT id, status FROM blessboard.pastoral_case_assignments
            WHERE case_id = $1 AND user_id = $2 AND assignment_role = $3
            LIMIT 1`,
          [caseId, assigneeUserId, assignmentRole]
        );
        if (existing.rows[0]) {
          await client.query(
            `UPDATE blessboard.pastoral_case_assignments
                SET status = 'active', revoked_at = NULL, assigned_by_user_id = $2, assigned_at = now()
              WHERE id = $1`,
            [existing.rows[0].id, actorUserId]
          );
        } else {
          await client.query(
            `INSERT INTO blessboard.pastoral_case_assignments (
               case_id, organization_id, church_id, user_id, assignment_role,
               status, assigned_by_user_id
             ) VALUES ($1,$2,$3,$4,$5,'active',$6)`,
            [
              caseId,
              caseRow.organization_id,
              caseRow.church_id,
              assigneeUserId,
              assignmentRole,
              actorUserId,
            ]
          );
        }

        if (assignmentRole === "minister") {
          await client.query(
            `UPDATE blessboard.pastoral_cases
                SET assigned_minister_user_id = $2, status = 'assigned', updated_at = now()
              WHERE id = $1`,
            [caseId, assigneeUserId]
          );
        } else if (assignmentRole === "pastor") {
          await client.query(
            `UPDATE blessboard.pastoral_cases
                SET assigned_pastor_user_id = $2, status = 'assigned', updated_at = now()
              WHERE id = $1`,
            [caseId, assigneeUserId]
          );
        } else {
          await client.query(
            `UPDATE blessboard.pastoral_cases SET status = 'assigned', updated_at = now() WHERE id = $1`,
            [caseId]
          );
        }

        await insertCaseEvent(client, {
          caseId,
          organizationId: caseRow.organization_id,
          actorUserId,
          eventKey: "pastoral.case.assigned",
          previousStatus: caseRow.status,
          newStatus: "assigned",
          metadata: { assignment_role: assignmentRole },
        });
        await recordBlessBoardAudit(client, {
          organizationId: caseRow.organization_id,
          churchId: caseRow.church_id,
          branchId: caseRow.branch_id,
          actorUserId,
          actionKey: "pastoral.case.assigned",
          entityType: "pastoral_case",
          entityId: caseId,
          metadata: { assignment_role: assignmentRole },
        });
        await notifyPastoralSafe(client, {
          churchId: caseRow.church_id,
          memberId: caseRow.member_id,
          eventKey: "pastoral.case.assigned",
        });
        await client.query("COMMIT");
        const updated = await loadCase(client, caseId, input.churchId);
        return { ok: true, status: STATUS.OK, case: mapCaseMeta(updated) };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function addPastoralCaseNote(db, input) {
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const caseId = String((input && input.caseId) || "").trim();
  const body = String((input && input.body) || "").trim();
  const noteVisibility = String((input && input.noteVisibility) || "assigned_care").trim();
  if (![actorUserId, caseId, input.organizationId, input.churchId].every((x) => UUID_RE.test(String(x || "")))) {
    return { ok: false, status: STATUS.INVALID_INPUT, note: null, reason: "ids" };
  }
  if (!body || body.length > 20000) {
    return { ok: false, status: STATUS.INVALID_INPUT, note: null, reason: "body" };
  }
  if (!NOTE_VISIBILITY.includes(noteVisibility)) {
    return { ok: false, status: STATUS.INVALID_INPUT, note: null, reason: "visibility" };
  }

  try {
    return await withClient(db, async (client) => {
      const caseRow = await loadCase(client, caseId, input.churchId);
      if (!caseRow) return { ok: false, status: STATUS.NOT_FOUND, note: null, reason: "not_found" };

      const access = await assertMetadataAccess(client, input, caseRow);
      if (!access.ok) return { ...access, note: null };

      const rel = access.relationship;
      if (noteVisibility === "referrer_safe") {
        if (!rel.isOpenedBy && !rel.roles.has("referrer")) {
          const edit = await requirePerm(client, input, "pastoral_cases.edit_assigned", {
            branchId: caseRow.branch_id,
            assignedCaseId: caseRow.id,
            caseId: caseRow.id,
          });
          if (!edit.ok) return { ok: false, status: STATUS.FORBIDDEN, note: null, reason: edit.reason };
        }
      } else {
        const edit = await requirePerm(client, input, "pastoral_cases.edit_assigned", {
          branchId: caseRow.branch_id,
          assignedCaseId: caseRow.id,
          caseId: caseRow.id,
        });
        if (!edit.ok) return { ok: false, status: STATUS.FORBIDDEN, note: null, reason: edit.reason };
        if (
          !rel.isAssignedMinister &&
          !rel.isAssignedPastor &&
          !rel.roles.has("minister") &&
          !rel.roles.has("pastor") &&
          !rel.roles.has("safeguarding")
        ) {
          return { ok: false, status: STATUS.FORBIDDEN, note: null, reason: "not_assigned" };
        }
      }

      if (["minister_only", "pastor_only", "safeguarding_only"].includes(noteVisibility)) {
        if (noteVisibility === "minister_only" && !(rel.isAssignedMinister || rel.roles.has("minister") || rel.isAssignedPastor || rel.roles.has("pastor"))) {
          return { ok: false, status: STATUS.FORBIDDEN, note: null, reason: "visibility" };
        }
        if (noteVisibility === "pastor_only" && !(rel.isAssignedPastor || rel.roles.has("pastor"))) {
          return { ok: false, status: STATUS.FORBIDDEN, note: null, reason: "visibility" };
        }
        if (noteVisibility === "safeguarding_only" && !rel.roles.has("safeguarding")) {
          return { ok: false, status: STATUS.FORBIDDEN, note: null, reason: "visibility" };
        }
      }

      const ins = await client.query(
        `INSERT INTO blessboard.pastoral_case_notes (
           case_id, organization_id, church_id, author_user_id, note_visibility, body
         ) VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id, note_visibility, created_at`,
        [caseId, caseRow.organization_id, caseRow.church_id, actorUserId, noteVisibility, body]
      );
      await insertCaseEvent(client, {
        caseId,
        organizationId: caseRow.organization_id,
        actorUserId,
        eventKey: "pastoral.case.note_added",
        metadata: { note_visibility: noteVisibility, note_id: ins.rows[0].id },
      });
      return {
        ok: true,
        status: STATUS.OK,
        note: {
          id: ins.rows[0].id,
          noteVisibility: ins.rows[0].note_visibility,
          createdAt: ins.rows[0].created_at,
        },
      };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      note: null,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function changePastoralConfidentiality(db, input) {
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const caseId = String((input && input.caseId) || "").trim();
  const nextLevel = String((input && input.confidentialityLevel) || "").trim();
  if (![actorUserId, caseId].every((x) => UUID_RE.test(x)) || !CONFIDENTIALITY.includes(nextLevel)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "input" };
  }
  try {
    return await withClient(db, async (client) => {
      const caseRow = await loadCase(client, caseId, input.churchId);
      if (!caseRow) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
      const authz = await requirePerm(client, input, "pastoral_cases.assign", {
        branchId: caseRow.branch_id,
        assignedCaseId: caseRow.id,
        caseId: caseRow.id,
      });
      if (!authz.ok) return authz;
      if (nextLevel === "highly_confidential") {
        const hc = await requirePerm(client, input, "pastoral_cases.view_highly_confidential", {
          branchId: caseRow.branch_id,
          assignedCaseId: caseRow.id,
          caseId: caseRow.id,
        });
        if (!hc.ok) return hc;
      }
      if (nextLevel === "safeguarding_restricted") {
        const sg = await requirePerm(client, input, "pastoral_cases.view_safeguarding", {
          branchId: caseRow.branch_id,
          assignedCaseId: caseRow.id,
          caseId: caseRow.id,
        });
        if (!sg.ok) return sg;
      }
      const prev = caseRow.confidentiality_level;
      await client.query(
        `UPDATE blessboard.pastoral_cases SET confidentiality_level = $2, updated_at = now() WHERE id = $1`,
        [caseId, nextLevel]
      );
      await insertCaseEvent(client, {
        caseId,
        organizationId: caseRow.organization_id,
        actorUserId,
        eventKey: "pastoral.case.confidentiality_changed",
        previousConfidentiality: prev,
        newConfidentiality: nextLevel,
      });
      await recordBlessBoardAudit(client, {
        organizationId: caseRow.organization_id,
        churchId: caseRow.church_id,
        branchId: caseRow.branch_id,
        actorUserId,
        actionKey: "pastoral.case.confidentiality_changed",
        entityType: "pastoral_case",
        entityId: caseId,
        metadata: { from: prev, to: nextLevel },
      });
      const updated = await loadCase(client, caseId, input.churchId);
      return { ok: true, status: STATUS.OK, case: mapCaseMeta(updated) };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function escalatePastoralCase(db, input) {
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const caseId = String((input && input.caseId) || "").trim();
  if (!UUID_RE.test(actorUserId) || !UUID_RE.test(caseId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }
  try {
    return await withClient(db, async (client) => {
      const caseRow = await loadCase(client, caseId, input.churchId);
      if (!caseRow) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
      const access = await assertMetadataAccess(client, input, caseRow);
      if (!access.ok) return access;
      const authz = await requirePerm(client, input, "pastoral_cases.escalate", {
        branchId: caseRow.branch_id,
        assignedCaseId: caseRow.id,
        caseId: caseRow.id,
      });
      if (!authz.ok) return authz;
      const rel = access.relationship;
      if (
        !rel.isAssignedMinister &&
        !rel.isAssignedPastor &&
        !rel.roles.has("minister") &&
        !rel.roles.has("pastor") &&
        !rel.isOpenedBy
      ) {
        return { ok: false, status: STATUS.FORBIDDEN, reason: "not_assigned" };
      }
      await client.query(
        `UPDATE blessboard.pastoral_cases
            SET status = 'escalated', escalated_at = now(), escalated_by_user_id = $2, updated_at = now()
          WHERE id = $1`,
        [caseId, actorUserId]
      );
      await insertCaseEvent(client, {
        caseId,
        organizationId: caseRow.organization_id,
        actorUserId,
        eventKey: "pastoral.case.escalated",
        previousStatus: caseRow.status,
        newStatus: "escalated",
      });
      await recordBlessBoardAudit(client, {
        organizationId: caseRow.organization_id,
        churchId: caseRow.church_id,
        branchId: caseRow.branch_id,
        actorUserId,
        actionKey: "pastoral.case.escalated",
        entityType: "pastoral_case",
        entityId: caseId,
        metadata: {},
      });
      await notifyPastoralSafe(client, {
        churchId: caseRow.church_id,
        memberId: caseRow.member_id,
        eventKey: "pastoral.case.escalated",
      });
      const updated = await loadCase(client, caseId, input.churchId);
      return { ok: true, status: STATUS.OK, case: mapCaseMeta(updated) };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function closePastoralCase(db, input) {
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const caseId = String((input && input.caseId) || "").trim();
  if (!UUID_RE.test(actorUserId) || !UUID_RE.test(caseId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }
  try {
    return await withClient(db, async (client) => {
      const caseRow = await loadCase(client, caseId, input.churchId);
      if (!caseRow) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
      const access = await assertMetadataAccess(client, input, caseRow);
      if (!access.ok) return access;
      const authz = await requirePerm(client, input, "pastoral_cases.close", {
        branchId: caseRow.branch_id,
        assignedCaseId: caseRow.id,
        caseId: caseRow.id,
      });
      if (!authz.ok) return authz;
      await client.query(
        `UPDATE blessboard.pastoral_cases
            SET status = 'closed', closed_at = now(), closed_by_user_id = $2, updated_at = now()
          WHERE id = $1`,
        [caseId, actorUserId]
      );
      await insertCaseEvent(client, {
        caseId,
        organizationId: caseRow.organization_id,
        actorUserId,
        eventKey: "pastoral.case.closed",
        previousStatus: caseRow.status,
        newStatus: "closed",
      });
      await recordBlessBoardAudit(client, {
        organizationId: caseRow.organization_id,
        churchId: caseRow.church_id,
        branchId: caseRow.branch_id,
        actorUserId,
        actionKey: "pastoral.case.closed",
        entityType: "pastoral_case",
        entityId: caseId,
        metadata: {},
      });
      const updated = await loadCase(client, caseId, input.churchId);
      return { ok: true, status: STATUS.OK, case: mapCaseMeta(updated) };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function reopenPastoralCase(db, input) {
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const caseId = String((input && input.caseId) || "").trim();
  if (!UUID_RE.test(actorUserId) || !UUID_RE.test(caseId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }
  try {
    return await withClient(db, async (client) => {
      const caseRow = await loadCase(client, caseId, input.churchId);
      if (!caseRow) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
      if (String(caseRow.status) !== "closed") {
        return { ok: false, status: STATUS.CONFLICT, reason: "not_closed" };
      }
      const authz = await requirePerm(client, input, "pastoral_cases.assign", {
        branchId: caseRow.branch_id,
        assignedCaseId: caseRow.id,
        caseId: caseRow.id,
      });
      if (!authz.ok) return authz;
      await client.query(
        `UPDATE blessboard.pastoral_cases
            SET status = 'open', closed_at = NULL, closed_by_user_id = NULL, updated_at = now()
          WHERE id = $1`,
        [caseId]
      );
      await insertCaseEvent(client, {
        caseId,
        organizationId: caseRow.organization_id,
        actorUserId,
        eventKey: "pastoral.case.reopened",
        previousStatus: "closed",
        newStatus: "open",
      });
      const updated = await loadCase(client, caseId, input.churchId);
      return { ok: true, status: STATUS.OK, case: mapCaseMeta(updated) };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function archivePastoralCase(db, input) {
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const caseId = String((input && input.caseId) || "").trim();
  if (!UUID_RE.test(actorUserId) || !UUID_RE.test(caseId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }
  try {
    return await withClient(db, async (client) => {
      const caseRow = await loadCase(client, caseId, input.churchId);
      if (!caseRow) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
      const authz = await requirePerm(client, input, "pastoral_cases.close", {
        branchId: caseRow.branch_id,
        assignedCaseId: caseRow.id,
        caseId: caseRow.id,
      });
      if (!authz.ok) return authz;
      await client.query(
        `UPDATE blessboard.pastoral_cases
            SET status = 'archived', archived_at = now(), updated_at = now()
          WHERE id = $1`,
        [caseId]
      );
      await insertCaseEvent(client, {
        caseId,
        organizationId: caseRow.organization_id,
        actorUserId,
        eventKey: "pastoral.case.archived",
        previousStatus: caseRow.status,
        newStatus: "archived",
      });
      const updated = await loadCase(client, caseId, input.churchId);
      return { ok: true, status: STATUS.OK, case: mapCaseMeta(updated) };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function listPastoralCases(db, input) {
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = input.branchId ? String(input.branchId).trim() : null;
  const limit = Math.min(Math.max(parseInt(String(input.limit || "50"), 10) || 50, 1), 100);
  const offset = Math.max(parseInt(String(input.offset || "0"), 10) || 0, 0);
  if (![actorUserId, organizationId, churchId].every((x) => UUID_RE.test(x))) {
    return { ok: false, status: STATUS.INVALID_INPUT, cases: [], reason: "ids" };
  }
  try {
    return await withClient(db, async (client) => {
      const view = await requirePerm(client, input, "pastoral_cases.view_assigned", {
        branchId,
      });
      const referral = await requirePerm(client, input, "pastoral_referrals.create", {
        branchId,
      });
      if (!view.ok && !referral.ok) {
        return { ok: false, status: STATUS.FORBIDDEN, cases: [], reason: view.reason };
      }

      const r = await client.query(
        `SELECT c.*
           FROM blessboard.pastoral_cases c
          WHERE c.organization_id = $1
            AND c.church_id = $2
            AND ($3::uuid IS NULL OR c.branch_id = $3)
            AND (
              c.opened_by_user_id = $4
              OR c.assigned_minister_user_id = $4
              OR c.assigned_pastor_user_id = $4
              OR EXISTS (
                SELECT 1 FROM blessboard.pastoral_case_assignments a
                 WHERE a.case_id = c.id AND a.user_id = $4 AND a.status = 'active'
              )
              OR (
                (c.status = 'escalated' OR c.escalated_at IS NOT NULL)
                AND EXISTS (
                  SELECT 1
                    FROM blessboard.user_role_assignments ura
                    JOIN blessboard.roles r ON r.id = ura.role_id
                    JOIN blessboard.role_permissions rp ON rp.role_id = r.id
                    JOIN blessboard.permissions p ON p.id = rp.permission_id
                   WHERE ura.user_id = $4
                     AND ura.organization_id = c.organization_id
                     AND ura.status = 'active'
                     AND p.permission_key = 'pastoral_cases.assign'
                     AND (
                       ura.scope_type IN ('organisation', 'church', 'platform')
                       OR (ura.scope_type = 'branch' AND ura.scope_id = c.branch_id)
                       OR (ura.scope_type = 'assigned_case' AND ura.scope_id = c.id)
                     )
                )
              )
            )
          ORDER BY c.updated_at DESC
          LIMIT $5 OFFSET $6`,
        [organizationId, churchId, branchId, actorUserId, limit, offset]
      );

      const cases = [];
      for (const row of r.rows) {
        const access = await assertMetadataAccess(client, input, row);
        if (access.ok) cases.push(mapCaseMeta(row));
      }
      return { ok: true, status: STATUS.OK, cases };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      cases: [],
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function getPastoralCaseDetail(db, input) {
  const caseId = String((input && input.caseId) || "").trim();
  if (!UUID_RE.test(caseId)) {
    return { ok: false, status: STATUS.NOT_FOUND, case: null, notes: [], reason: "not_found" };
  }
  try {
    return await withClient(db, async (client) => {
      const caseRow = await loadCase(client, caseId, input.churchId);
      if (!caseRow) {
        return { ok: false, status: STATUS.NOT_FOUND, case: null, notes: [], reason: "not_found" };
      }
      const access = await assertMetadataAccess(client, input, caseRow);
      if (!access.ok) {
        return { ok: false, status: STATUS.NOT_FOUND, case: null, notes: [], reason: "not_found" };
      }

      const level = String(caseRow.confidentiality_level);
      if (level === "highly_confidential") {
        await insertCaseEvent(client, {
          caseId,
          organizationId: caseRow.organization_id,
          actorUserId: input.actorUserId,
          eventKey: "pastoral.case.highly_confidential_accessed",
          metadata: {},
        });
        await recordBlessBoardAudit(client, {
          organizationId: caseRow.organization_id,
          churchId: caseRow.church_id,
          branchId: caseRow.branch_id,
          actorUserId: input.actorUserId,
          actionKey: "pastoral.case.highly_confidential_accessed",
          entityType: "pastoral_case",
          entityId: caseId,
          metadata: {},
        });
      }
      if (level === "safeguarding_restricted") {
        await insertCaseEvent(client, {
          caseId,
          organizationId: caseRow.organization_id,
          actorUserId: input.actorUserId,
          eventKey: "pastoral.case.safeguarding_accessed",
          metadata: {},
        });
        await recordBlessBoardAudit(client, {
          organizationId: caseRow.organization_id,
          churchId: caseRow.church_id,
          branchId: caseRow.branch_id,
          actorUserId: input.actorUserId,
          actionKey: "pastoral.case.safeguarding_accessed",
          entityType: "pastoral_case",
          entityId: caseId,
          metadata: {},
        });
      }

      const includeBodies = input.includeNoteBodies === true;
      const notesRaw = await client.query(
        `SELECT id, author_user_id, note_visibility, body, created_at
           FROM blessboard.pastoral_case_notes
          WHERE case_id = $1
          ORDER BY created_at ASC`,
        [caseId]
      );
      const notes = [];
      for (const n of notesRaw.rows) {
        const readable = await canReadNoteBody(client, input, caseRow, n, access.relationship);
        if (!readable) {
          notes.push({
            id: n.id,
            authorUserId: n.author_user_id,
            noteVisibility: n.note_visibility,
            body: null,
            bodyRedacted: true,
            createdAt: n.created_at,
          });
          continue;
        }
        notes.push({
          id: n.id,
          authorUserId: n.author_user_id,
          noteVisibility: n.note_visibility,
          body: includeBodies ? n.body : null,
          bodyRedacted: !includeBodies,
          createdAt: n.created_at,
        });
      }

      return {
        ok: true,
        status: STATUS.OK,
        case: mapCaseMeta(caseRow),
        notes,
        accessWarning:
          level === "highly_confidential" || level === "safeguarding_restricted"
            ? "Restricted pastoral record. Access is audited."
            : null,
      };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      case: null,
      notes: [],
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

module.exports = {
  STATUS,
  CONFIDENTIALITY,
  NOTE_VISIBILITY,
  createPastoralCase,
  assignPastoralCase,
  addPastoralCaseNote,
  changePastoralConfidentiality,
  escalatePastoralCase,
  closePastoralCase,
  reopenPastoralCase,
  archivePastoralCase,
  listPastoralCases,
  getPastoralCaseDetail,
};
