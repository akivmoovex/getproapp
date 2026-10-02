"use strict";

/**
 * Platform approval_requests repository helpers.
 * Callers/tests may inject store overrides; SQL is used when db.query is present.
 */

const { APPROVAL_REQUEST_STATUS } = require("./approvalRequestConstants");

function mapRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id || row.organizationId,
    productCode: row.product_code || row.productCode,
    requestType: row.request_type || row.requestType,
    requesterSubjectType: row.requester_subject_type || row.requesterSubjectType,
    requesterSubjectId: row.requester_subject_id || row.requesterSubjectId,
    requesterUserId: row.requester_user_id || row.requesterUserId || null,
    targetType: row.target_type || row.targetType,
    targetId: row.target_id || row.targetId,
    status: row.status,
    assignedReviewerUserId:
      row.assigned_reviewer_user_id || row.assignedReviewerUserId || null,
    payload: row.payload_json || row.payload || {},
    decisionReason: row.decision_reason || row.decisionReason || null,
    decidedByUserId: row.decided_by_user_id || row.decidedByUserId || null,
    decidedAt: row.decided_at || row.decidedAt || null,
    cancelledAt: row.cancelled_at || row.cancelledAt || null,
    cancelledByUserId: row.cancelled_by_user_id || row.cancelledByUserId || null,
    createdAt: row.created_at || row.createdAt || null,
    updatedAt: row.updated_at || row.updatedAt || null,
  };
}

async function insertApprovalRequest(db, row) {
  if (db && typeof db.insertApprovalRequest === "function") {
    return mapRequest(await db.insertApprovalRequest(row));
  }
  const { rows } = await db.query(
    `INSERT INTO platform.approval_requests (
       organization_id, product_code, request_type,
       requester_subject_type, requester_subject_id, requester_user_id,
       target_type, target_id, status, assigned_reviewer_user_id, payload_json
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
     RETURNING *`,
    [
      row.organizationId,
      row.productCode,
      row.requestType,
      row.requesterSubjectType,
      row.requesterSubjectId,
      row.requesterUserId || null,
      row.targetType,
      row.targetId,
      row.status || APPROVAL_REQUEST_STATUS.PENDING,
      row.assignedReviewerUserId || null,
      JSON.stringify(row.payload || {}),
    ]
  );
  return mapRequest(rows[0]);
}

async function findApprovalRequestById(db, id) {
  if (db && typeof db.findApprovalRequestById === "function") {
    return mapRequest(await db.findApprovalRequestById(id));
  }
  const { rows } = await db.query(
    `SELECT * FROM platform.approval_requests WHERE id = $1`,
    [id]
  );
  return mapRequest(rows[0] || null);
}

async function findPendingDuplicate(db, input) {
  if (db && typeof db.findPendingDuplicate === "function") {
    return mapRequest(await db.findPendingDuplicate(input));
  }
  const { rows } = await db.query(
    `SELECT * FROM platform.approval_requests
      WHERE organization_id = $1
        AND product_code = $2
        AND request_type = $3
        AND requester_subject_id = $4
        AND target_type = $5
        AND target_id = $6
        AND status = 'pending'
      LIMIT 1`,
    [
      input.organizationId,
      input.productCode,
      input.requestType,
      input.requesterSubjectId,
      input.targetType,
      input.targetId,
    ]
  );
  return mapRequest(rows[0] || null);
}

async function updateApprovalRequestStatus(db, input) {
  if (db && typeof db.updateApprovalRequestStatus === "function") {
    return mapRequest(await db.updateApprovalRequestStatus(input));
  }
  const { rows } = await db.query(
    `UPDATE platform.approval_requests
        SET status = $2,
            decision_reason = COALESCE($3, decision_reason),
            decided_by_user_id = COALESCE($4, decided_by_user_id),
            decided_at = COALESCE($5, decided_at),
            cancelled_at = COALESCE($6, cancelled_at),
            cancelled_by_user_id = COALESCE($7, cancelled_by_user_id),
            assigned_reviewer_user_id = COALESCE($8, assigned_reviewer_user_id),
            updated_at = now()
      WHERE id = $1
      RETURNING *`,
    [
      input.id,
      input.status,
      input.decisionReason || null,
      input.decidedByUserId || null,
      input.decidedAt || null,
      input.cancelledAt || null,
      input.cancelledByUserId || null,
      input.assignedReviewerUserId || null,
    ]
  );
  return mapRequest(rows[0] || null);
}

async function insertDecision(db, row) {
  if (db && typeof db.insertDecision === "function") {
    return db.insertDecision(row);
  }
  const { rows } = await db.query(
    `INSERT INTO platform.approval_request_decisions (
       approval_request_id, organization_id, actor_user_id,
       from_status, to_status, reason, metadata_json
     ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
     RETURNING *`,
    [
      row.approvalRequestId,
      row.organizationId,
      row.actorUserId,
      row.fromStatus,
      row.toStatus,
      row.reason || null,
      JSON.stringify(row.metadata || {}),
    ]
  );
  return rows[0];
}

async function listDecisions(db, approvalRequestId) {
  if (db && typeof db.listDecisions === "function") {
    return db.listDecisions(approvalRequestId);
  }
  const { rows } = await db.query(
    `SELECT * FROM platform.approval_request_decisions
      WHERE approval_request_id = $1
      ORDER BY created_at ASC`,
    [approvalRequestId]
  );
  return rows;
}

/**
 * List approval requests for an organization (tenant-scoped).
 */
async function listApprovalRequests(db, input) {
  if (db && typeof db.listApprovalRequests === "function") {
    return (await db.listApprovalRequests(input)).map(mapRequest);
  }
  const organizationId = String((input && input.organizationId) || "").trim();
  if (!organizationId) return [];

  const params = [organizationId];
  const where = ["organization_id = $1"];
  let i = 2;

  if (input.productCode) {
    where.push(`product_code = $${i++}`);
    params.push(String(input.productCode).trim().toLowerCase());
  }
  if (input.status) {
    where.push(`status = $${i++}`);
    params.push(String(input.status).trim().toLowerCase());
  }
  if (input.requestType) {
    where.push(`request_type = $${i++}`);
    params.push(String(input.requestType).trim());
  }
  if (input.targetType) {
    where.push(`target_type = $${i++}`);
    params.push(String(input.targetType).trim());
  }
  if (input.targetId) {
    where.push(`target_id = $${i++}`);
    params.push(String(input.targetId).trim());
  }

  const limit = Math.min(Math.max(Number(input.limit) || 50, 1), 200);
  params.push(limit);

  const { rows } = await db.query(
    `SELECT * FROM platform.approval_requests
      WHERE ${where.join(" AND ")}
      ORDER BY created_at DESC
      LIMIT $${i}`,
    params
  );
  return rows.map(mapRequest);
}

module.exports = {
  mapRequest,
  insertApprovalRequest,
  findApprovalRequestById,
  findPendingDuplicate,
  updateApprovalRequestStatus,
  insertDecision,
  listDecisions,
  listApprovalRequests,
};
