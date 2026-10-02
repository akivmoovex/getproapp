"use strict";

/**
 * Welfare cases / requests — separation of duties; no pastoral narrative for Finance.
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
  const result = await authorize(client, {
    actor: { userId: input.actorUserId },
    permission,
    tenantContext: input.tenantContext,
    resourceContext: resourceBase(input, extras),
  });
  if (!result.allowed) {
    return { ok: false, status: STATUS.FORBIDDEN, reason: result.reasonCode };
  }
  return { ok: true };
}

function uuidEqual(a, b) {
  if (a == null || b == null) return false;
  return String(a).toLowerCase() === String(b).toLowerCase();
}

function mapCase(row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    churchId: row.church_id,
    branchId: row.branch_id,
    memberId: row.member_id,
    caseKey: row.case_key,
    status: row.status,
    title: row.title,
    openedByUserId: row.opened_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRequest(row, opts) {
  const financeOnly = opts && opts.financeView === true;
  return {
    id: row.id,
    welfareCaseId: row.welfare_case_id,
    organizationId: row.organization_id,
    churchId: row.church_id,
    branchId: row.branch_id,
    memberId: row.member_id,
    requestedByUserId: row.requested_by_user_id,
    status: row.status,
    assistanceType: row.assistance_type,
    amountRequested: row.amount_requested,
    currencyCode: row.currency_code,
    operationalSummary: financeOnly ? null : row.operational_summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    submittedAt: row.submitted_at,
  };
}

async function createWelfareCase(db, input) {
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = String((input && input.branchId) || "").trim();
  const caseKey = String((input && input.caseKey) || "").trim().toLowerCase();
  const title = String((input && input.title) || "").trim();
  const memberId = input.memberId ? String(input.memberId).trim() : null;
  if (![actorUserId, organizationId, churchId, branchId].every((x) => UUID_RE.test(x))) {
    return { ok: false, status: STATUS.INVALID_INPUT, case: null, reason: "ids" };
  }
  if (!KEY_RE.test(caseKey) || !title) {
    return { ok: false, status: STATUS.INVALID_INPUT, case: null, reason: "key_title" };
  }
  try {
    return await withClient(db, async (client) => {
      const authz = await requirePerm(client, input, "welfare_cases.create", { branchId });
      if (!authz.ok) return { ...authz, case: null };
      const ins = await client.query(
        `INSERT INTO blessboard.welfare_cases (
           organization_id, church_id, branch_id, member_id, case_key, status, title, opened_by_user_id
         ) VALUES ($1,$2,$3,$4,$5,'open',$6,$7)
         RETURNING *`,
        [organizationId, churchId, branchId, memberId, caseKey, title, actorUserId]
      );
      return { ok: true, status: STATUS.OK, case: mapCase(ins.rows[0]) };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      case: null,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function createWelfareRequest(db, input) {
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const welfareCaseId = String((input && input.welfareCaseId) || "").trim();
  const operationalSummary = String((input && input.operationalSummary) || "").trim();
  const assistanceType = String((input && input.assistanceType) || "other").trim();
  const amountRequested =
    input.amountRequested != null && input.amountRequested !== ""
      ? Number(input.amountRequested)
      : null;
  const currencyCode = input.currencyCode
    ? String(input.currencyCode).trim().toUpperCase()
    : null;

  if (![actorUserId, welfareCaseId, input.organizationId, input.churchId].every((x) =>
    UUID_RE.test(String(x || ""))
  )) {
    return { ok: false, status: STATUS.INVALID_INPUT, request: null, reason: "ids" };
  }
  if (!operationalSummary || operationalSummary.length > 500) {
    return { ok: false, status: STATUS.INVALID_INPUT, request: null, reason: "summary" };
  }

  try {
    return await withClient(db, async (client) => {
      const authz = await requirePerm(client, input, "welfare_cases.request_assistance", {
        branchId: input.branchId,
      });
      if (!authz.ok) return { ...authz, request: null };

      const caseR = await client.query(
        `SELECT * FROM blessboard.welfare_cases WHERE id = $1 AND church_id = $2 LIMIT 1`,
        [welfareCaseId, input.churchId]
      );
      const caseRow = caseR.rows[0];
      if (!caseRow) {
        return { ok: false, status: STATUS.NOT_FOUND, request: null, reason: "not_found" };
      }

      const ins = await client.query(
        `INSERT INTO blessboard.welfare_requests (
           welfare_case_id, organization_id, church_id, branch_id, member_id,
           requested_by_user_id, status, assistance_type, amount_requested, currency_code,
           operational_summary, submitted_at
         ) VALUES ($1,$2,$3,$4,$5,$6,'submitted',$7,$8,$9,$10,now())
         RETURNING *`,
        [
          welfareCaseId,
          caseRow.organization_id,
          caseRow.church_id,
          caseRow.branch_id,
          caseRow.member_id,
          actorUserId,
          assistanceType,
          amountRequested,
          currencyCode,
          operationalSummary,
        ]
      );
      await recordBlessBoardAudit(client, {
        organizationId: caseRow.organization_id,
        churchId: caseRow.church_id,
        branchId: caseRow.branch_id,
        actorUserId,
        actionKey: "welfare.request.created",
        entityType: "welfare_request",
        entityId: ins.rows[0].id,
        metadata: { assistance_type: assistanceType },
      });
      await notifyPastoralSafe(client, {
        churchId: caseRow.church_id,
        memberId: caseRow.member_id,
        eventKey: "welfare.request.created",
      });
      return { ok: true, status: STATUS.OK, request: mapRequest(ins.rows[0]) };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      request: null,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function decideWelfareRequest(db, input) {
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const requestId = String((input && input.requestId) || "").trim();
  const decision = String((input && input.decision) || "").trim();
  const decisionReason = input.decisionReason
    ? String(input.decisionReason).trim()
    : null;
  const amountApproved =
    input.amountApproved != null && input.amountApproved !== ""
      ? Number(input.amountApproved)
      : null;
  const financeInstructionSummary = input.financeInstructionSummary
    ? String(input.financeInstructionSummary).trim()
    : null;

  if (!UUID_RE.test(actorUserId) || !UUID_RE.test(requestId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }
  if (!["approved", "rejected"].includes(decision)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "decision" };
  }

  try {
    return await withClient(db, async (client) => {
      const authz = await requirePerm(client, input, "welfare_cases.approve_assistance", {
        branchId: input.branchId,
      });
      if (!authz.ok) return authz;

      const reqR = await client.query(
        `SELECT * FROM blessboard.welfare_requests WHERE id = $1 AND church_id = $2 LIMIT 1`,
        [requestId, input.churchId]
      );
      const request = reqR.rows[0];
      if (!request) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
      if (String(request.status) !== "submitted") {
        return { ok: false, status: STATUS.CONFLICT, reason: "status" };
      }
      if (uuidEqual(request.requested_by_user_id, actorUserId)) {
        return { ok: false, status: STATUS.FORBIDDEN, reason: "self_approval" };
      }

      await client.query("BEGIN");
      try {
        // Approvals are append-only history; never mutate operational_summary.
        await client.query(
          `INSERT INTO blessboard.welfare_approvals (
             welfare_request_id, organization_id, church_id, actor_user_id,
             decision, decision_reason, amount_approved, finance_instruction_summary
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            requestId,
            request.organization_id,
            request.church_id,
            actorUserId,
            decision,
            decisionReason,
            amountApproved,
            financeInstructionSummary,
          ]
        );
        await client.query(
          `UPDATE blessboard.welfare_requests
              SET status = $2, updated_at = now()
            WHERE id = $1`,
          [requestId, decision === "approved" ? "approved" : "rejected"]
        );
        const actionKey =
          decision === "approved" ? "welfare.request.approved" : "welfare.request.rejected";
        await recordBlessBoardAudit(client, {
          organizationId: request.organization_id,
          churchId: request.church_id,
          branchId: request.branch_id,
          actorUserId,
          actionKey,
          entityType: "welfare_request",
          entityId: requestId,
          metadata: { decision },
        });
        await notifyPastoralSafe(client, {
          churchId: request.church_id,
          memberId: request.member_id,
          eventKey: actionKey,
        });
        await client.query("COMMIT");
        const updated = await client.query(
          `SELECT * FROM blessboard.welfare_requests WHERE id = $1`,
          [requestId]
        );
        return { ok: true, status: STATUS.OK, request: mapRequest(updated.rows[0]) };
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

async function recordWelfareDistribution(db, input) {
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const requestId = String((input && input.requestId) || "").trim();
  const amountDistributed = Number(input && input.amountDistributed);
  const currencyCode = String((input && input.currencyCode) || "")
    .trim()
    .toUpperCase();
  const distributionMethod = String((input && input.distributionMethod) || "other").trim();
  const recipientAcknowledged = Boolean(input && input.recipientAcknowledged);
  const distributionNote = input.distributionNote
    ? String(input.distributionNote).trim()
    : null;

  if (!UUID_RE.test(actorUserId) || !UUID_RE.test(requestId)) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "ids" };
  }
  if (!(amountDistributed > 0) || currencyCode.length !== 3) {
    return { ok: false, status: STATUS.INVALID_INPUT, reason: "amount" };
  }

  try {
    return await withClient(db, async (client) => {
      const authz = await requirePerm(client, input, "welfare_cases.record_distribution", {
        branchId: input.branchId,
      });
      if (!authz.ok) return authz;

      const reqR = await client.query(
        `SELECT * FROM blessboard.welfare_requests WHERE id = $1 AND church_id = $2 LIMIT 1`,
        [requestId, input.churchId]
      );
      const request = reqR.rows[0];
      if (!request) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
      if (!["approved", "distributed"].includes(String(request.status))) {
        return { ok: false, status: STATUS.CONFLICT, reason: "status" };
      }

      const ins = await client.query(
        `INSERT INTO blessboard.welfare_distributions (
           welfare_request_id, organization_id, church_id, recorded_by_user_id,
           amount_distributed, currency_code, distribution_method,
           recipient_acknowledged, distribution_note
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING id, created_at`,
        [
          requestId,
          request.organization_id,
          request.church_id,
          actorUserId,
          amountDistributed,
          currencyCode,
          distributionMethod,
          recipientAcknowledged,
          distributionNote,
        ]
      );
      await client.query(
        `UPDATE blessboard.welfare_requests
            SET status = 'distributed', updated_at = now()
          WHERE id = $1`,
        [requestId]
      );
      await recordBlessBoardAudit(client, {
        organizationId: request.organization_id,
        churchId: request.church_id,
        branchId: request.branch_id,
        actorUserId,
        actionKey: "welfare.distribution.recorded",
        entityType: "welfare_request",
        entityId: requestId,
        metadata: { distribution_id: ins.rows[0].id },
      });
      await notifyPastoralSafe(client, {
        churchId: request.church_id,
        memberId: request.member_id,
        eventKey: "welfare.distribution.recorded",
      });
      return {
        ok: true,
        status: STATUS.OK,
        distribution: { id: ins.rows[0].id, createdAt: ins.rows[0].created_at },
      };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function listWelfareRequests(db, input) {
  const actorUserId = String((input && input.actorUserId) || "").trim();
  const organizationId = String((input && input.organizationId) || "").trim();
  const churchId = String((input && input.churchId) || "").trim();
  const branchId = input.branchId ? String(input.branchId).trim() : null;
  const financeView = input.financeView === true;
  const limit = Math.min(Math.max(parseInt(String(input.limit || "50"), 10) || 50, 1), 100);
  const offset = Math.max(parseInt(String(input.offset || "0"), 10) || 0, 0);

  if (![actorUserId, organizationId, churchId].every((x) => UUID_RE.test(x))) {
    return { ok: false, status: STATUS.INVALID_INPUT, requests: [], reason: "ids" };
  }

  try {
    return await withClient(db, async (client) => {
      const view = await requirePerm(client, input, "welfare_cases.view_assigned", {
        branchId,
      });
      if (!view.ok) return { ...view, requests: [] };

      const r = await client.query(
        `SELECT *
           FROM blessboard.welfare_requests
          WHERE organization_id = $1
            AND church_id = $2
            AND ($3::uuid IS NULL OR branch_id = $3)
          ORDER BY updated_at DESC
          LIMIT $4 OFFSET $5`,
        [organizationId, churchId, branchId, limit, offset]
      );
      return {
        ok: true,
        status: STATUS.OK,
        requests: r.rows.map((row) => mapRequest(row, { financeView })),
      };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      requests: [],
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

async function getWelfareRequestDetail(db, input) {
  const requestId = String((input && input.requestId) || "").trim();
  const financeView = input.financeView === true;
  if (!UUID_RE.test(requestId)) {
    return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
  }
  try {
    return await withClient(db, async (client) => {
      const view = await requirePerm(client, input, "welfare_cases.view_assigned", {
        branchId: input.branchId,
      });
      if (!view.ok) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };

      const reqR = await client.query(
        `SELECT * FROM blessboard.welfare_requests WHERE id = $1 AND church_id = $2 LIMIT 1`,
        [requestId, input.churchId]
      );
      const request = reqR.rows[0];
      if (!request) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };

      const approvals = await client.query(
        `SELECT id, actor_user_id, decision, decision_reason, amount_approved,
                finance_instruction_summary, created_at
           FROM blessboard.welfare_approvals
          WHERE welfare_request_id = $1
          ORDER BY created_at ASC`,
        [requestId]
      );
      const distributions = await client.query(
        `SELECT id, amount_distributed, currency_code, distribution_method,
                recipient_acknowledged, distribution_note, recorded_by_user_id, created_at
           FROM blessboard.welfare_distributions
          WHERE welfare_request_id = $1
          ORDER BY created_at ASC`,
        [requestId]
      );

      return {
        ok: true,
        status: STATUS.OK,
        request: mapRequest(request, { financeView }),
        approvals: approvals.rows.map((a) => ({
          id: a.id,
          actorUserId: a.actor_user_id,
          decision: a.decision,
          decisionReason: financeView ? null : a.decision_reason,
          amountApproved: a.amount_approved,
          financeInstructionSummary: a.finance_instruction_summary,
          createdAt: a.created_at,
        })),
        distributions: distributions.rows.map((d) => ({
          id: d.id,
          amountDistributed: d.amount_distributed,
          currencyCode: d.currency_code,
          distributionMethod: d.distribution_method,
          recipientAcknowledged: d.recipient_acknowledged,
          distributionNote: financeView ? null : d.distribution_note,
          recordedByUserId: d.recorded_by_user_id,
          createdAt: d.created_at,
        })),
      };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

/**
 * Finance-facing payload: payment instructions only, no operational pastoral summary.
 * Allowed for finance.welfare_instructions.view, or welfare viewers that already
 * use this safe projection (does not grant pastoral note bodies).
 */
async function getWelfareFinanceInstructions(db, input) {
  const requestId = String((input && input.requestId) || "").trim();
  const actorUserId = String((input && input.actorUserId) || "").trim();
  if (!UUID_RE.test(requestId) || !UUID_RE.test(actorUserId)) {
    return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
  }
  try {
    return await withClient(db, async (client) => {
      const financeView = await authorize(client, {
        actor: { userId: actorUserId },
        permission: "finance.welfare_instructions.view",
        tenantContext: input.tenantContext,
        resourceContext: resourceBase(input),
      });
      const welfareView = await authorize(client, {
        actor: { userId: actorUserId },
        permission: "welfare_cases.view_assigned",
        tenantContext: input.tenantContext,
        resourceContext: resourceBase(input),
      });
      const welfareApprove = await authorize(client, {
        actor: { userId: actorUserId },
        permission: "welfare_cases.approve_assistance",
        tenantContext: input.tenantContext,
        resourceContext: resourceBase(input),
      });
      if (!financeView.allowed && !welfareView.allowed && !welfareApprove.allowed) {
        return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
      }

      const reqR = await client.query(
        `SELECT * FROM blessboard.welfare_requests WHERE id = $1 AND church_id = $2 LIMIT 1`,
        [requestId, input.churchId]
      );
      const request = reqR.rows[0];
      if (!request) return { ok: false, status: STATUS.NOT_FOUND, reason: "not_found" };
      if (String(request.status) !== "approved" && String(request.status) !== "distributed") {
        return { ok: false, status: STATUS.FORBIDDEN, reason: "not_approved" };
      }

      const approvals = await client.query(
        `SELECT id, actor_user_id, decision, amount_approved,
                finance_instruction_summary, created_at
           FROM blessboard.welfare_approvals
          WHERE welfare_request_id = $1
          ORDER BY created_at ASC`,
        [requestId]
      );
      const latestApproval = [...approvals.rows]
        .reverse()
        .find((a) => a.decision === "approved");

      if (financeView.allowed) {
        try {
          await recordBlessBoardAudit(client, {
            organizationId: request.organization_id,
            churchId: request.church_id,
            branchId: request.branch_id,
            actorUserId,
            actionKey: "finance.welfare_instruction.viewed",
            entityType: "welfare_request",
            entityId: request.id,
            metadata: { status: request.status },
          });
        } catch {
          // ignore audit failure
        }
      }

      return {
        ok: true,
        status: STATUS.OK,
        payment: {
          requestId: request.id,
          amountApproved: latestApproval ? latestApproval.amount_approved : null,
          currencyCode: request.currency_code,
          financeInstructionSummary: latestApproval
            ? latestApproval.finance_instruction_summary
            : null,
          assistanceType: request.assistance_type,
          memberId: request.member_id,
          branchId: request.branch_id,
          authorizationStatus: request.status,
          approvedDate: latestApproval ? latestApproval.created_at : null,
          approvalReference: latestApproval ? latestApproval.id : null,
        },
      };
    });
  } catch (err) {
    return {
      ok: false,
      status: STATUS.LOOKUP_ERROR,
      reason: err && err.message ? String(err.message) : "error",
    };
  }
}

module.exports = {
  STATUS,
  createWelfareCase,
  createWelfareRequest,
  decideWelfareRequest,
  recordWelfareDistribution,
  listWelfareRequests,
  getWelfareRequestDetail,
  getWelfareFinanceInstructions,
};
