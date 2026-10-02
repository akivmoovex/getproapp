"use strict";

/**
 * Cells, classes, and departments — member journey domain services.
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

async function createCell(db, input) {
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  const cellKey = String((input && input.cellKey) || "").trim().toLowerCase();
  const displayName = String((input && input.displayName) || "").trim();
  if (![actorUserId, organizationId, churchId, branchId].every((x) => UUID_RE.test(x))) {
    return { ok: false, status: STATUS.INVALID_INPUT, cell: null, reason: "ids" };
  }
  if (!KEY_RE.test(cellKey) || !displayName) {
    return { ok: false, status: STATUS.INVALID_INPUT, cell: null, reason: "key_name" };
  }
  try {
    return await withClient(db, async (client) => {
      const authz = await requirePerm(client, input, "cells.manage", {
        organizationId,
        churchId,
        branchId,
      });
      if (!authz.ok) return { ...authz, cell: null };
      const r = await client.query(
        `INSERT INTO blessboard.cells (
           organization_id, church_id, branch_id, cell_key, display_name,
           primary_leader_user_id, meeting_location_summary, meeting_schedule, capacity
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id, cell_key, display_name, status, branch_id`,
        [
          organizationId,
          churchId,
          branchId,
          cellKey,
          displayName,
          input.primaryLeaderUserId || null,
          input.meetingLocationSummary || null,
          input.meetingSchedule || null,
          input.capacity || null,
        ]
      );
      return {
        ok: true,
        status: STATUS.OK,
        cell: {
          id: r.rows[0].id,
          cellKey: r.rows[0].cell_key,
          displayName: r.rows[0].display_name,
          status: r.rows[0].status,
          branchId: r.rows[0].branch_id,
        },
      };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      cell: null,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function assignMemberToCell(db, input) {
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  const cellId = String((input && input.cellId) || "").trim();
  const memberId = String((input && input.memberId) || "").trim();
  const isTransfer = Boolean(input.isTransfer);
  const transferReason =
    input.transferReason != null ? String(input.transferReason).trim().slice(0, 500) : null;
  if (![actorUserId, organizationId, churchId, branchId, cellId, memberId].every((x) => UUID_RE.test(x))) {
    return { ok: false, status: STATUS.INVALID_INPUT, membership: null, reason: "ids" };
  }
  if (isTransfer && !transferReason) {
    return { ok: false, status: STATUS.INVALID_INPUT, membership: null, reason: "transfer_reason" };
  }
  try {
    return await withClient(db, async (client) => {
      await client.query("BEGIN");
      try {
        const perm = isTransfer ? "cells.members.transfer" : "cells.members.assign";
        const authz = await requirePerm(client, input, perm, {
          organizationId,
          churchId,
          branchId,
          cellId,
        });
        if (!authz.ok) {
          await client.query("ROLLBACK");
          return { ...authz, membership: null };
        }
        await client.query(
          `UPDATE blessboard.cell_memberships
              SET status = 'transferred',
                  exited_at = now(),
                  transfer_reason = COALESCE($3, transfer_reason),
                  updated_at = now()
            WHERE church_id = $1 AND member_id = $2 AND status = 'active' AND is_primary = true`,
          [churchId, memberId, transferReason]
        );
        const r = await client.query(
          `INSERT INTO blessboard.cell_memberships (
             organization_id, church_id, branch_id, cell_id, member_id,
             is_primary, status, assignment_source, assigned_by_user_id, transfer_reason
           ) VALUES ($1,$2,$3,$4,$5,true,'active',$6,$7,$8)
           RETURNING id, cell_id, member_id, status`,
          [
            organizationId,
            churchId,
            branchId,
            cellId,
            memberId,
            isTransfer ? "transfer" : "admin",
            actorUserId,
            transferReason,
          ]
        );
        const { notifyLinkedMemberSafe } = require("./memberJourneyNotify");
        await recordBlessBoardAudit(client, {
          organizationId,
          churchId,
          branchId,
          actorUserId,
          actionKey: isTransfer ? "cell.member.transferred" : "cell.member.assigned",
          entityType: "cell_membership",
          entityId: r.rows[0].id,
          outcome: "success",
          metadata: { cell_id: cellId, member_id: memberId },
        });
        await notifyLinkedMemberSafe(client, {
          churchId,
          memberId,
          branchId,
          eventKey: isTransfer ? "cell.member.transferred" : "cell.member.assigned",
        });
        await client.query("COMMIT");
        return {
          ok: true,
          status: STATUS.OK,
          membership: {
            id: r.rows[0].id,
            cellId: r.rows[0].cell_id,
            memberId: r.rows[0].member_id,
            status: r.rows[0].status,
          },
        };
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    });
  } catch (err) {
    const msg = err && err.message ? String(err.message) : "";
    if (/unique|duplicate/i.test(msg) || (err && err.code === "23505")) {
      return { ok: false, status: STATUS.CONFLICT, membership: null, reason: "duplicate" };
    }
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      membership: null,
      reason: msg || "error",
    };
  }
}

async function transferMemberCell(db, input) {
  return assignMemberToCell(db, {
    ...input,
    isTransfer: true,
  });
}

async function createClassCohort(db, input) {
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  const programId = String((input && input.programId) || "").trim();
  const cohortKey = String((input && input.cohortKey) || "").trim().toLowerCase();
  const displayName = String((input && input.displayName) || "").trim();
  if (![actorUserId, organizationId, churchId, branchId, programId].every((x) => UUID_RE.test(x))) {
    return { ok: false, status: STATUS.INVALID_INPUT, cohort: null, reason: "ids" };
  }
  if (!KEY_RE.test(cohortKey) || !displayName) {
    return { ok: false, status: STATUS.INVALID_INPUT, cohort: null, reason: "key_name" };
  }
  try {
    return await withClient(db, async (client) => {
      const authz = await requirePerm(client, input, "classes.manage_cohorts", {
        organizationId,
        churchId,
        branchId,
      });
      if (!authz.ok) return { ...authz, cohort: null };
      const r = await client.query(
        `INSERT INTO blessboard.class_cohorts (
           organization_id, church_id, branch_id, program_id, cohort_key, display_name,
           teacher_user_id, starts_on, ends_on, capacity, status
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active')
         RETURNING id, cohort_key, display_name, status, program_id, branch_id`,
        [
          organizationId,
          churchId,
          branchId,
          programId,
          cohortKey,
          displayName,
          input.teacherUserId || null,
          input.startsOn || null,
          input.endsOn || null,
          input.capacity || null,
        ]
      );
      return {
        ok: true,
        status: STATUS.OK,
        cohort: {
          id: r.rows[0].id,
          cohortKey: r.rows[0].cohort_key,
          displayName: r.rows[0].display_name,
          status: r.rows[0].status,
          programId: r.rows[0].program_id,
          branchId: r.rows[0].branch_id,
        },
      };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      cohort: null,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function createClassProgram(db, input) {
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const programKey = String((input && input.programKey) || "").trim().toLowerCase();
  const displayName = String((input && input.displayName) || "").trim();
  const programType = String((input && input.programType) || "").trim();
  if (![actorUserId, organizationId, churchId].every((x) => UUID_RE.test(x))) {
    return { ok: false, status: STATUS.INVALID_INPUT, program: null, reason: "ids" };
  }
  if (!KEY_RE.test(programKey) || !displayName) {
    return { ok: false, status: STATUS.INVALID_INPUT, program: null, reason: "key_name" };
  }
  try {
    return await withClient(db, async (client) => {
      const authz = await requirePerm(client, input, "classes.manage_programs", {
        organizationId,
        churchId,
        branchId: input.branchId || null,
      });
      if (!authz.ok) return { ...authz, program: null };
      const r = await client.query(
        `INSERT INTO blessboard.class_programs (
           organization_id, church_id, program_key, display_name, program_type
         ) VALUES ($1,$2,$3,$4,$5)
         RETURNING id, program_key, display_name, program_type, status`,
        [organizationId, churchId, programKey, displayName, programType]
      );
      return {
        ok: true,
        status: STATUS.OK,
        program: {
          id: r.rows[0].id,
          programKey: r.rows[0].program_key,
          displayName: r.rows[0].display_name,
          programType: r.rows[0].program_type,
          status: r.rows[0].status,
        },
      };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      program: null,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function enrolMember(db, input) {
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  const cohortId = String((input && input.cohortId) || "").trim();
  const memberId = String((input && input.memberId) || "").trim();
  if (![actorUserId, organizationId, churchId, branchId, cohortId, memberId].every((x) => UUID_RE.test(x))) {
    return { ok: false, status: STATUS.INVALID_INPUT, enrolment: null, reason: "ids" };
  }
  try {
    return await withClient(db, async (client) => {
      const authz = await requirePerm(client, input, "classes.enrol", {
        organizationId,
        churchId,
        branchId,
        cohortId,
        classId: cohortId,
      });
      if (!authz.ok) return { ...authz, enrolment: null };
      const r = await client.query(
        `INSERT INTO blessboard.class_enrolments (
           organization_id, church_id, branch_id, cohort_id, member_id,
           assignment_source, assigned_by_user_id
         ) VALUES ($1,$2,$3,$4,$5,'admin',$6)
         RETURNING id, cohort_id, member_id, status`,
        [organizationId, churchId, branchId, cohortId, memberId, actorUserId]
      );
      await recordBlessBoardAudit(client, {
        organizationId,
        churchId,
        branchId,
        actorUserId,
        actionKey: "class.member.enrolled",
        entityType: "class_enrolment",
        entityId: r.rows[0].id,
        outcome: "success",
        metadata: { cohort_id: cohortId, member_id: memberId },
      });
      return {
        ok: true,
        status: STATUS.OK,
        enrolment: {
          id: r.rows[0].id,
          cohortId: r.rows[0].cohort_id,
          memberId: r.rows[0].member_id,
          status: r.rows[0].status,
        },
      };
    });
  } catch (err) {
    const msg = err && err.message ? String(err.message) : "";
    if (/unique|duplicate/i.test(msg) || (err && err.code === "23505")) {
      return { ok: false, status: STATUS.CONFLICT, enrolment: null, reason: "duplicate" };
    }
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      enrolment: null,
      reason: msg || "error",
    };
  }
}

async function recordClassAttendance(db, input) {
  const enrolmentId = String((input && input.enrolmentId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!UUID_RE.test(enrolmentId) || !UUID_RE.test(churchId) || !UUID_RE.test(actorUserId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, enrolment: null, reason: "ids" };
  }
  try {
    return await withClient(db, async (client) => {
      const existing = await client.query(
        `SELECT * FROM blessboard.class_enrolments WHERE id = $1 AND church_id = $2 LIMIT 1`,
        [enrolmentId, churchId]
      );
      if (!existing.rows[0]) return { ok: false, status: STATUS.NOT_FOUND, enrolment: null };
      const row = existing.rows[0];
      const authz = await requirePerm(client, input, "classes.attendance.record", {
        organizationId: row.organization_id,
        churchId,
        branchId: row.branch_id,
        cohortId: row.cohort_id,
        classId: row.cohort_id,
      });
      if (!authz.ok) return { ...authz, enrolment: null };
      const r = await client.query(
        `UPDATE blessboard.class_enrolments
            SET attendance_count = attendance_count + 1, updated_at = now()
          WHERE id = $1
          RETURNING id, attendance_count, status`,
        [enrolmentId]
      );
      await recordBlessBoardAudit(client, {
        organizationId: row.organization_id,
        churchId,
        branchId: row.branch_id,
        actorUserId,
        actionKey: "class.attendance.recorded",
        entityType: "class_enrolment",
        entityId: enrolmentId,
        outcome: "success",
        metadata: { count: r.rows[0].attendance_count },
      });
      return {
        ok: true,
        status: STATUS.OK,
        enrolment: {
          id: r.rows[0].id,
          attendanceCount: r.rows[0].attendance_count,
          status: r.rows[0].status,
        },
      };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      enrolment: null,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function recommendClassCompletion(db, input) {
  return setCompletionFlag(db, input, "recommend");
}
async function approveClassCompletion(db, input) {
  return setCompletionFlag(db, input, "approve");
}

async function setCompletionFlag(db, input, mode) {
  const enrolmentId = String((input && input.enrolmentId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const permission =
    mode === "approve" ? "classes.completion.approve" : "classes.completion.recommend";
  if (!UUID_RE.test(enrolmentId) || !UUID_RE.test(churchId) || !UUID_RE.test(actorUserId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, enrolment: null, reason: "ids" };
  }
  try {
    return await withClient(db, async (client) => {
      const existing = await client.query(
        `SELECT * FROM blessboard.class_enrolments WHERE id = $1 AND church_id = $2 LIMIT 1`,
        [enrolmentId, churchId]
      );
      if (!existing.rows[0]) return { ok: false, status: STATUS.NOT_FOUND, enrolment: null };
      const row = existing.rows[0];
      const authz = await requirePerm(client, input, permission, {
        organizationId: row.organization_id,
        churchId,
        branchId: row.branch_id,
        cohortId: row.cohort_id,
        classId: row.cohort_id,
      });
      if (!authz.ok) return { ...authz, enrolment: null };
      if (
        mode === "approve" &&
        row.completion_recommended_by_user_id &&
        String(row.completion_recommended_by_user_id) === actorUserId
      ) {
        return {
          ok: false,
          status: STATUS.FORBIDDEN,
          enrolment: null,
          reason: "self_approval_denied",
        };
      }
      if (mode === "approve" && !row.completion_recommended_at) {
        return {
          ok: false,
          status: STATUS.CONFLICT,
          enrolment: null,
          reason: "recommendation_required",
        };
      }
      let r;
      if (mode === "approve") {
        r = await client.query(
          `UPDATE blessboard.class_enrolments
              SET status = 'completed',
                  completion_approved_by_user_id = $2,
                  completion_approved_at = now(),
                  completed_at = now(),
                  updated_at = now()
            WHERE id = $1
            RETURNING id, status`,
          [enrolmentId, actorUserId]
        );
      } else {
        r = await client.query(
          `UPDATE blessboard.class_enrolments
              SET completion_recommended_by_user_id = $2,
                  completion_recommended_at = now(),
                  updated_at = now()
            WHERE id = $1
            RETURNING id, status`,
          [enrolmentId, actorUserId]
        );
      }
      await recordBlessBoardAudit(client, {
        organizationId: row.organization_id,
        churchId,
        branchId: row.branch_id,
        actorUserId,
        actionKey:
          mode === "approve" ? "class.completion.approved" : "class.completion.recommended",
        entityType: "class_enrolment",
        entityId: enrolmentId,
        outcome: "success",
        metadata: {},
      });
      return {
        ok: true,
        status: STATUS.OK,
        enrolment: { id: r.rows[0].id, status: r.rows[0].status },
      };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      enrolment: null,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function addDepartmentMember(db, input) {
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  const departmentId = String((input && input.departmentId) || "").trim();
  const memberId = String((input && input.memberId) || "").trim();
  if (![actorUserId, organizationId, churchId, branchId, departmentId, memberId].every((x) => UUID_RE.test(x))) {
    return { ok: false, status: STATUS.INVALID_INPUT, membership: null, reason: "ids" };
  }
  try {
    return await withClient(db, async (client) => {
      const authz = await requirePerm(client, input, "departments.members.manage", {
        organizationId,
        churchId,
        branchId,
        departmentId,
      });
      if (!authz.ok) return { ...authz, membership: null };
      const r = await client.query(
        `INSERT INTO blessboard.department_memberships (
           organization_id, church_id, branch_id, department_id, member_id,
           assignment_source, assigned_by_user_id
         ) VALUES ($1,$2,$3,$4,$5,'admin',$6)
         RETURNING id, department_id, member_id, status`,
        [organizationId, churchId, branchId, departmentId, memberId, actorUserId]
      );
      await recordBlessBoardAudit(client, {
        organizationId,
        churchId,
        branchId,
        actorUserId,
        actionKey: "department.member.added",
        entityType: "department_membership",
        entityId: r.rows[0].id,
        outcome: "success",
        metadata: { department_id: departmentId, member_id: memberId },
      });
      return {
        ok: true,
        status: STATUS.OK,
        membership: {
          id: r.rows[0].id,
          departmentId: r.rows[0].department_id,
          memberId: r.rows[0].member_id,
          status: r.rows[0].status,
        },
      };
    });
  } catch (err) {
    const msg = err && err.message ? String(err.message) : "";
    if (/unique|duplicate/i.test(msg) || (err && err.code === "23505")) {
      return { ok: false, status: STATUS.CONFLICT, membership: null, reason: "duplicate" };
    }
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      membership: null,
      reason: msg || "error",
    };
  }
}

async function removeDepartmentMember(db, input) {
  const membershipId = String((input && input.membershipId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!UUID_RE.test(membershipId) || !UUID_RE.test(churchId) || !UUID_RE.test(actorUserId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, membership: null, reason: "ids" };
  }
  try {
    return await withClient(db, async (client) => {
      const existing = await client.query(
        `SELECT * FROM blessboard.department_memberships WHERE id = $1 AND church_id = $2 LIMIT 1`,
        [membershipId, churchId]
      );
      if (!existing.rows[0]) return { ok: false, status: STATUS.NOT_FOUND, membership: null };
      const row = existing.rows[0];
      const authz = await requirePerm(client, input, "departments.members.manage", {
        organizationId: row.organization_id,
        churchId,
        branchId: row.branch_id,
        departmentId: row.department_id,
      });
      if (!authz.ok) return { ...authz, membership: null };
      const r = await client.query(
        `UPDATE blessboard.department_memberships
            SET status = 'exited', exited_at = now(), updated_at = now()
          WHERE id = $1
          RETURNING id, status`,
        [membershipId]
      );
      await recordBlessBoardAudit(client, {
        organizationId: row.organization_id,
        churchId,
        branchId: row.branch_id,
        actorUserId,
        actionKey: "department.member.removed",
        entityType: "department_membership",
        entityId: membershipId,
        outcome: "success",
        metadata: { department_id: row.department_id, member_id: row.member_id },
      });
      return {
        ok: true,
        status: STATUS.OK,
        membership: { id: r.rows[0].id, status: r.rows[0].status },
      };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      membership: null,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function createDepartment(db, input) {
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  const departmentKey = String((input && input.departmentKey) || "").trim().toLowerCase();
  const displayName = String((input && input.displayName) || "").trim();
  if (![actorUserId, organizationId, churchId, branchId].every((x) => UUID_RE.test(x))) {
    return { ok: false, status: STATUS.INVALID_INPUT, department: null, reason: "ids" };
  }
  if (!KEY_RE.test(departmentKey) || !displayName) {
    return { ok: false, status: STATUS.INVALID_INPUT, department: null, reason: "key_name" };
  }
  try {
    return await withClient(db, async (client) => {
      const authz = await requirePerm(client, input, "departments.manage", {
        organizationId,
        churchId,
        branchId,
      });
      if (!authz.ok) return { ...authz, department: null };
      const r = await client.query(
        `INSERT INTO blessboard.departments (
           organization_id, church_id, branch_id, department_key, display_name, ministry_id
         ) VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id, department_key, display_name, status, branch_id`,
        [
          organizationId,
          churchId,
          branchId,
          departmentKey,
          displayName,
          input.ministryId || null,
        ]
      );
      return {
        ok: true,
        status: STATUS.OK,
        department: {
          id: r.rows[0].id,
          departmentKey: r.rows[0].department_key,
          displayName: r.rows[0].display_name,
          status: r.rows[0].status,
          branchId: r.rows[0].branch_id,
        },
      };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      department: null,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function listCellsForBranch(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  if (!UUID_RE.test(churchId) || !UUID_RE.test(branchId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, cells: [] };
  }
  try {
    return await withClient(db, async (client) => {
      const authz = await requirePerm(client, input, "cells.view", {
        organizationId: input.organizationId,
        churchId,
        branchId,
      });
      if (!authz.ok) return { ...authz, cells: [] };
      const r = await client.query(
        `SELECT id, cell_key, display_name, status, branch_id,
                primary_leader_user_id, assistant_leader_user_id,
                meeting_schedule, meeting_location_summary, capacity
           FROM blessboard.cells
          WHERE church_id = $1 AND branch_id = $2 AND status <> 'archived'
          ORDER BY display_name`,
        [churchId, branchId]
      );
      return {
        ok: true,
        status: STATUS.OK,
        cells: r.rows.map((row) => ({
          id: row.id,
          cellKey: row.cell_key,
          displayName: row.display_name,
          status: row.status,
          branchId: row.branch_id,
          primaryLeaderUserId: row.primary_leader_user_id,
          assistantLeaderUserId: row.assistant_leader_user_id,
          meetingSchedule: row.meeting_schedule,
          meetingLocationSummary: row.meeting_location_summary,
          capacity: row.capacity,
        })),
      };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      cells: [],
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function getCellDetail(db, input) {
  const cellId = String((input && input.cellId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  if (!UUID_RE.test(cellId) || !UUID_RE.test(churchId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, cell: null, members: [] };
  }
  try {
    return await withClient(db, async (client) => {
      const cellR = await client.query(
        `SELECT * FROM blessboard.cells WHERE id=$1 AND church_id=$2 LIMIT 1`,
        [cellId, churchId]
      );
      if (!cellR.rows[0]) return { ok: false, status: STATUS.NOT_FOUND, cell: null, members: [] };
      const row = cellR.rows[0];
      const authz = await requirePerm(client, input, "cells.view", {
        organizationId: row.organization_id,
        churchId,
        branchId: row.branch_id,
        cellId,
      });
      if (!authz.ok) return { ...authz, cell: null, members: [] };
      const membersAuth = await requirePerm(client, input, "cells.members.view_assigned", {
        organizationId: row.organization_id,
        churchId,
        branchId: row.branch_id,
        cellId,
      });
      let members = [];
      if (membersAuth.ok) {
        const m = await client.query(
          `SELECT cm.id, cm.member_id, cm.care_status, cm.status, cm.joined_at,
                  m.first_name, m.last_name
             FROM blessboard.cell_memberships cm
             INNER JOIN blessboard.members m ON m.id = cm.member_id
            WHERE cm.cell_id=$1 AND cm.status='active'
            ORDER BY m.last_name, m.first_name
            LIMIT 200`,
          [cellId]
        );
        members = m.rows.map((x) => ({
          membershipId: x.id,
          memberId: x.member_id,
          firstName: x.first_name,
          lastName: x.last_name,
          careStatus: x.care_status,
          joinedAt: x.joined_at,
        }));
      }
      return {
        ok: true,
        status: STATUS.OK,
        cell: {
          id: row.id,
          cellKey: row.cell_key,
          displayName: row.display_name,
          status: row.status,
          branchId: row.branch_id,
          primaryLeaderUserId: row.primary_leader_user_id,
          assistantLeaderUserId: row.assistant_leader_user_id,
          meetingSchedule: row.meeting_schedule,
          meetingLocationSummary: row.meeting_location_summary,
          capacity: row.capacity,
        },
        members,
      };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      cell: null,
      members: [],
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function updateCell(db, input) {
  const cellId = String((input && input.cellId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (![cellId, churchId, actorUserId].every((x) => UUID_RE.test(x))) {
    return { ok: false, status: STATUS.INVALID_INPUT, cell: null, reason: "ids" };
  }
  try {
    return await withClient(db, async (client) => {
      const existing = await client.query(
        `SELECT * FROM blessboard.cells WHERE id=$1 AND church_id=$2 LIMIT 1`,
        [cellId, churchId]
      );
      if (!existing.rows[0]) return { ok: false, status: STATUS.NOT_FOUND, cell: null };
      const row = existing.rows[0];
      const authz = await requirePerm(client, input, "cells.manage", {
        organizationId: row.organization_id,
        churchId,
        branchId: row.branch_id,
        cellId,
      });
      if (!authz.ok) return { ...authz, cell: null };
      const displayName =
        input.displayName != null ? String(input.displayName).trim() : row.display_name;
      const upd = await client.query(
        `UPDATE blessboard.cells
            SET display_name = $3,
                primary_leader_user_id = COALESCE($4, primary_leader_user_id),
                assistant_leader_user_id = COALESCE($5, assistant_leader_user_id),
                meeting_schedule = COALESCE($6, meeting_schedule),
                meeting_location_summary = COALESCE($7, meeting_location_summary),
                updated_at = now()
          WHERE id = $1 AND church_id = $2
          RETURNING id, cell_key, display_name, status`,
        [
          cellId,
          churchId,
          displayName,
          input.primaryLeaderUserId || null,
          input.assistantLeaderUserId || null,
          input.meetingSchedule != null ? String(input.meetingSchedule).trim().slice(0, 500) : null,
          input.meetingLocationSummary != null
            ? String(input.meetingLocationSummary).trim().slice(0, 500)
            : null,
        ]
      );
      return {
        ok: true,
        status: STATUS.OK,
        cell: {
          id: upd.rows[0].id,
          cellKey: upd.rows[0].cell_key,
          displayName: upd.rows[0].display_name,
          status: upd.rows[0].status,
        },
      };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      cell: null,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function listDepartmentsForBranch(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  if (!UUID_RE.test(churchId) || !UUID_RE.test(branchId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, departments: [] };
  }
  try {
    return await withClient(db, async (client) => {
      const authz = await requirePerm(client, input, "departments.view", {
        organizationId: input.organizationId,
        churchId,
        branchId,
      });
      if (!authz.ok) return { ...authz, departments: [] };
      const r = await client.query(
        `SELECT id, department_key, display_name, status, branch_id
           FROM blessboard.departments
          WHERE church_id=$1 AND branch_id=$2 AND status <> 'archived'
          ORDER BY display_name`,
        [churchId, branchId]
      );
      return {
        ok: true,
        status: STATUS.OK,
        departments: r.rows.map((row) => ({
          id: row.id,
          departmentKey: row.department_key,
          displayName: row.display_name,
          status: row.status,
          branchId: row.branch_id,
        })),
      };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      departments: [],
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function getDepartmentDetail(db, input) {
  const departmentId = String((input && input.departmentId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  if (!UUID_RE.test(departmentId) || !UUID_RE.test(churchId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, department: null, members: [] };
  }
  try {
    return await withClient(db, async (client) => {
      const d = await client.query(
        `SELECT * FROM blessboard.departments WHERE id=$1 AND church_id=$2 LIMIT 1`,
        [departmentId, churchId]
      );
      if (!d.rows[0]) return { ok: false, status: STATUS.NOT_FOUND, department: null, members: [] };
      const row = d.rows[0];
      const authz = await requirePerm(client, input, "departments.view", {
        organizationId: row.organization_id,
        churchId,
        branchId: row.branch_id,
        departmentId,
      });
      if (!authz.ok) return { ...authz, department: null, members: [] };
      const m = await client.query(
        `SELECT dm.id, dm.member_id, dm.status, m.first_name, m.last_name
           FROM blessboard.department_memberships dm
           INNER JOIN blessboard.members m ON m.id = dm.member_id
          WHERE dm.department_id=$1 AND dm.status='active'
          ORDER BY m.last_name, m.first_name
          LIMIT 200`,
        [departmentId]
      );
      return {
        ok: true,
        status: STATUS.OK,
        department: {
          id: row.id,
          departmentKey: row.department_key,
          displayName: row.display_name,
          status: row.status,
          branchId: row.branch_id,
          requirementsNotes: row.requirements_notes || null,
        },
        members: m.rows.map((x) => ({
          membershipId: x.id,
          memberId: x.member_id,
          firstName: x.first_name,
          lastName: x.last_name,
          status: x.status,
        })),
      };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      department: null,
      members: [],
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function listClassPrograms(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  if (!UUID_RE.test(churchId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, programs: [] };
  }
  try {
    return await withClient(db, async (client) => {
      const authz = await requirePerm(client, input, "classes.view", {
        organizationId: input.organizationId,
        churchId,
        branchId: input.branchId || null,
      });
      if (!authz.ok) return { ...authz, programs: [] };
      const r = await client.query(
        `SELECT id, program_key, display_name, program_type, status
           FROM blessboard.class_programs
          WHERE church_id=$1 AND status <> 'archived'
          ORDER BY display_name`,
        [churchId]
      );
      return {
        ok: true,
        status: STATUS.OK,
        programs: r.rows.map((row) => ({
          id: row.id,
          programKey: row.program_key,
          displayName: row.display_name,
          programType: row.program_type,
          status: row.status,
        })),
      };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      programs: [],
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function listClassCohorts(db, input) {
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  if (!UUID_RE.test(churchId) || !UUID_RE.test(branchId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, cohorts: [] };
  }
  try {
    return await withClient(db, async (client) => {
      const authz = await requirePerm(client, input, "classes.view", {
        organizationId: input.organizationId,
        churchId,
        branchId,
      });
      if (!authz.ok) return { ...authz, cohorts: [] };
      const r = await client.query(
        `SELECT co.id, co.cohort_key, co.display_name, co.status, co.teacher_user_id,
                p.display_name AS program_name, p.program_type
           FROM blessboard.class_cohorts co
           INNER JOIN blessboard.class_programs p ON p.id = co.program_id
          WHERE co.church_id=$1 AND co.branch_id=$2 AND co.status <> 'archived'
          ORDER BY co.starts_on DESC NULLS LAST, co.display_name`,
        [churchId, branchId]
      );
      return {
        ok: true,
        status: STATUS.OK,
        cohorts: r.rows.map((row) => ({
          id: row.id,
          cohortKey: row.cohort_key,
          displayName: row.display_name,
          status: row.status,
          teacherUserId: row.teacher_user_id,
          programName: row.program_name,
          programType: row.program_type,
        })),
      };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      cohorts: [],
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function getCohortDetail(db, input) {
  const cohortId = String((input && input.cohortId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  if (!UUID_RE.test(cohortId) || !UUID_RE.test(churchId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, cohort: null, enrolments: [] };
  }
  try {
    return await withClient(db, async (client) => {
      const c = await client.query(
        `SELECT co.*, p.display_name AS program_name, p.program_type
           FROM blessboard.class_cohorts co
           INNER JOIN blessboard.class_programs p ON p.id = co.program_id
          WHERE co.id=$1 AND co.church_id=$2 LIMIT 1`,
        [cohortId, churchId]
      );
      if (!c.rows[0]) return { ok: false, status: STATUS.NOT_FOUND, cohort: null, enrolments: [] };
      const row = c.rows[0];
      const authz = await requirePerm(client, input, "classes.view", {
        organizationId: row.organization_id,
        churchId,
        branchId: row.branch_id,
        cohortId,
        classId: cohortId,
      });
      if (!authz.ok) return { ...authz, cohort: null, enrolments: [] };
      const e = await client.query(
        `SELECT e.id, e.member_id, e.status, e.attendance_count,
                e.completion_recommended_at, e.completion_approved_at,
                e.completion_recommended_by_user_id,
                m.first_name, m.last_name
           FROM blessboard.class_enrolments e
           INNER JOIN blessboard.members m ON m.id = e.member_id
          WHERE e.cohort_id=$1
          ORDER BY m.last_name, m.first_name
          LIMIT 200`,
        [cohortId]
      );
      return {
        ok: true,
        status: STATUS.OK,
        cohort: {
          id: row.id,
          cohortKey: row.cohort_key,
          displayName: row.display_name,
          status: row.status,
          programName: row.program_name,
          programType: row.program_type,
          teacherUserId: row.teacher_user_id,
          branchId: row.branch_id,
        },
        enrolments: e.rows.map((x) => ({
          id: x.id,
          memberId: x.member_id,
          firstName: x.first_name,
          lastName: x.last_name,
          status: x.status,
          attendanceCount: x.attendance_count,
          recommended: Boolean(x.completion_recommended_at),
          approved: Boolean(x.completion_approved_at),
          recommendedByUserId: x.completion_recommended_by_user_id,
        })),
      };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      cohort: null,
      enrolments: [],
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

module.exports = {
  STATUS,
  createCell,
  updateCell,
  assignMemberToCell,
  transferMemberCell,
  createClassProgram,
  createClassCohort,
  enrolMember,
  recordClassAttendance,
  recommendClassCompletion,
  approveClassCompletion,
  createDepartment,
  addDepartmentMember,
  removeDepartmentMember,
  listCellsForBranch,
  getCellDetail,
  listDepartmentsForBranch,
  getDepartmentDetail,
  listClassPrograms,
  listClassCohorts,
  getCohortDetail,
};
