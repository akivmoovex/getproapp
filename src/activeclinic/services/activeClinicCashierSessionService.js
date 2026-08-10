"use strict";

/**
 * ActiveClinic P07 — Cashier session service
 * Open, close, reconcile, variance tracking, end-of-day
 */

const {
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../../platform/config/deploymentProfiles");
const {
  recordAuditEventSafe,
} = require("../../platform/services/auditEventService");
const {
  requireFinancePermission,
} = require("./activeClinicFinanceAuthz");

const RESULT = Object.freeze({
  OK: "ok",
  CREATED: "created",
  INVALID_INPUT: "invalid_input",
  NOT_FOUND: "not_found",
  ACCESS_DENIED: "access_denied",
  SESSION_ALREADY_OPEN: "session_already_open",
  SESSION_NOT_OPEN: "session_not_open",
  SESSION_ALREADY_CLOSED: "session_already_closed",
  VARIANCE_REQUIRES_APPROVAL: "variance_requires_approval",
});

const PERM = Object.freeze({
  OPEN_SESSION: "activeclinic.cashier.open_session",
  CLOSE_SESSION: "activeclinic.cashier.close_session",
  MANAGE: "activeclinic.cashier.manage",
  RECONCILE: "activeclinic.cashier.reconcile",
});

async function assertPerm(pool, params) {
  const checked = await requireFinancePermission(pool, params);
  if (!checked.ok) return { result: RESULT.ACCESS_DENIED };
  return null;
}

async function writeFinanceAudit(pool, params) {
  await recordAuditEventSafe(pool, {
    deploymentCode: CODE_ACTIVECLINIC_ORG_V6,
    organizationId: params.tenantId,
    actorUserId: params.staffId || null,
    actionKey: params.eventType,
    entityType: params.resourceType,
    entityId: params.resourceId,
    outcome: "success",
    metadata: params.metadata || {},
  });
}

const SESSION_STATUS = {
  OPEN: "open",
  CLOSED: "closed",
  RECONCILED: "reconciled",
};

// ============================================================================
// OPEN SESSION
// ============================================================================

async function openCashierSession({
  pool,
  tenantId,
  facilityId,
  staffId,
  openingCashMinor = 0,
  notes = null,
}) {
  const denied = await assertPerm(pool, {
    tenantId,
    facilityId,
    staffId,
    permissionKey: PERM.OPEN_SESSION,
  });
  if (denied) return denied;

  if (openingCashMinor < 0) {
    return { result: RESULT.INVALID_INPUT };
  }

  const existingResult = await pool.query(
    `SELECT id FROM activeclinic.cashier_sessions
     WHERE tenant_id = $1 AND facility_id = $2 AND cashier_staff_id = $3 AND status = 'open'`,
    [tenantId, facilityId, staffId]
  );

  if (existingResult.rows.length > 0) {
    return {
      result: RESULT.SESSION_ALREADY_OPEN,
      sessionId: existingResult.rows[0].id,
    };
  }

  const sessionNumber = await generateSessionNumber(pool, tenantId, facilityId);

  const insertResult = await pool.query(
    `INSERT INTO activeclinic.cashier_sessions (
      tenant_id, facility_id, cashier_staff_id, session_number,
      opening_cash_minor, currency_code, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *`,
    [tenantId, facilityId, staffId, sessionNumber, openingCashMinor, "ZMW", notes]
  );

  const sessionId = insertResult.rows[0].id;

  await pool.query(
    `INSERT INTO activeclinic.cashier_session_events (
      session_id, event_type, event_data, created_by_staff_id
    ) VALUES ($1, $2, $3, $4)`,
    [sessionId, "session_open", { openingCashMinor }, staffId]
  );

  await writeFinanceAudit(pool, {
    tenantId,
    staffId,
    eventType: "activeclinic.cashier.session_opened",
    resourceType: "cashier_session",
    resourceId: sessionId,
    metadata: { sessionNumber, openingCashMinor },
  });

  return {
    result: RESULT.CREATED,
    session: mapSession(insertResult.rows[0]),
  };
}

// ============================================================================
// CURRENT SESSION
// ============================================================================

async function getCurrentCashierSession({
  pool,
  tenantId,
  facilityId,
  staffId,
}) {
  const denied = await assertPerm(pool, {
    tenantId,
    facilityId,
    staffId,
    permissionKey: PERM.OPEN_SESSION,
  });
  if (denied) return denied;

  const sessionResult = await pool.query(
    `SELECT * FROM activeclinic.cashier_sessions
     WHERE tenant_id = $1 AND facility_id = $2 AND cashier_staff_id = $3 AND status = 'open'
     ORDER BY opened_at DESC LIMIT 1`,
    [tenantId, facilityId, staffId]
  );

  if (sessionResult.rows.length === 0) {
    return { result: RESULT.NOT_FOUND };
  }

  const session = sessionResult.rows[0];

  const paymentsResult = await pool.query(
    `SELECT COALESCE(SUM(amount_minor), 0) as total_cash
     FROM activeclinic.payments
     WHERE cashier_session_id = $1 AND payment_method = 'cash'`,
    [session.id]
  );

  const totalCashMinor = parseInt(paymentsResult.rows[0].total_cash, 10);
  const expectedCashMinor = parseInt(session.opening_cash_minor, 10) + totalCashMinor;

  return {
    result: RESULT.OK,
    session: {
      ...mapSession(session),
      totalPaymentsMinor: totalCashMinor,
      expectedCashMinor,
    },
  };
}

// ============================================================================
// CLOSE SESSION
// ============================================================================

async function closeCashierSession({
  pool,
  tenantId,
  facilityId,
  staffId,
  sessionId,
  actualCashMinor,
  notes = null,
}) {
  const denied = await assertPerm(pool, {
    tenantId,
    facilityId,
    staffId,
    permissionKey: PERM.CLOSE_SESSION,
  });
  if (denied) return denied;

  if (actualCashMinor < 0) {
    return { result: RESULT.INVALID_INPUT };
  }

  const sessionResult = await pool.query(
    `SELECT * FROM activeclinic.cashier_sessions
     WHERE id = $1 AND tenant_id = $2 AND facility_id = $3`,
    [sessionId, tenantId, facilityId]
  );

  if (sessionResult.rows.length === 0) {
    return { result: RESULT.NOT_FOUND };
  }

  const session = sessionResult.rows[0];

  // Ordinary cashiers may only close their own session; manage elevates.
  if (String(session.cashier_staff_id) !== String(staffId)) {
    const manageDenied = await assertPerm(pool, {
      tenantId,
      facilityId,
      staffId,
      permissionKey: PERM.MANAGE,
    });
    if (manageDenied) return manageDenied;
  }

  if (session.status !== SESSION_STATUS.OPEN) {
    return { result: RESULT.SESSION_ALREADY_CLOSED };
  }

  const paymentsResult = await pool.query(
    `SELECT COALESCE(SUM(amount_minor), 0) as total_cash
     FROM activeclinic.payments
     WHERE cashier_session_id = $1 AND payment_method = 'cash'`,
    [sessionId]
  );

  const totalCashMinor = parseInt(paymentsResult.rows[0].total_cash, 10);
  const openingCashMinor = parseInt(session.opening_cash_minor, 10);
  const expectedCashMinor = openingCashMinor + totalCashMinor;
  const varianceMinor = actualCashMinor - expectedCashMinor;

  const updateResult = await pool.query(
    `UPDATE activeclinic.cashier_sessions
     SET status = $1, closed_at = now(), closed_by_staff_id = $2,
         expected_cash_minor = $3, actual_cash_minor = $4, variance_minor = $5,
         notes = CASE WHEN $6::text IS NOT NULL THEN $6 ELSE notes END,
         updated_at = now()
     WHERE id = $7
     RETURNING *`,
    [
      SESSION_STATUS.CLOSED,
      staffId,
      expectedCashMinor,
      actualCashMinor,
      varianceMinor,
      notes,
      sessionId,
    ]
  );

  await pool.query(
    `INSERT INTO activeclinic.cashier_session_events (
      session_id, event_type, event_data, created_by_staff_id
    ) VALUES ($1, $2, $3, $4)`,
    [
      sessionId,
      "session_close",
      { expectedCashMinor, actualCashMinor, varianceMinor },
      staffId,
    ]
  );

  if (varianceMinor !== 0) {
    await pool.query(
      `INSERT INTO activeclinic.cashier_session_events (
        session_id, event_type, event_data, created_by_staff_id
      ) VALUES ($1, $2, $3, $4)`,
      [sessionId, "variance_noted", { varianceMinor }, staffId]
    );
  }

  await writeFinanceAudit(pool, {
    tenantId,
    staffId,
    eventType: "activeclinic.cashier.session_closed",
    resourceType: "cashier_session",
    resourceId: sessionId,
    metadata: { expectedCashMinor, actualCashMinor, varianceMinor },
  });

  const hasVariance = varianceMinor !== 0;

  return {
    result: RESULT.OK,
    session: mapSession(updateResult.rows[0]),
    hasVariance,
    varianceMinor,
  };
}

// ============================================================================
// RECONCILE SESSION
// ============================================================================

async function reconcileCashierSession({
  pool,
  tenantId,
  facilityId,
  staffId,
  sessionId,
  approvalNotes = null,
}) {
  const denied = await assertPerm(pool, {
    tenantId,
    facilityId,
    staffId,
    permissionKey: PERM.RECONCILE,
  });
  if (denied) return denied;

  const sessionResult = await pool.query(
    `SELECT * FROM activeclinic.cashier_sessions
     WHERE id = $1 AND tenant_id = $2 AND facility_id = $3`,
    [sessionId, tenantId, facilityId]
  );

  if (sessionResult.rows.length === 0) {
    return { result: RESULT.NOT_FOUND };
  }

  const session = sessionResult.rows[0];

  if (session.status !== SESSION_STATUS.CLOSED) {
    return { result: RESULT.SESSION_NOT_OPEN, reason: "session_not_closed" };
  }

  const updateResult = await pool.query(
    `UPDATE activeclinic.cashier_sessions
     SET status = $1, reconciled_at = now(), reconciled_by_staff_id = $2,
         notes = CASE WHEN $3::text IS NOT NULL THEN CONCAT(notes, E'\n\n', $3) ELSE notes END,
         updated_at = now()
     WHERE id = $4
     RETURNING *`,
    [SESSION_STATUS.RECONCILED, staffId, approvalNotes, sessionId]
  );

  await pool.query(
    `INSERT INTO activeclinic.cashier_session_events (
      session_id, event_type, event_data, created_by_staff_id
    ) VALUES ($1, $2, $3, $4)`,
    [sessionId, "session_reconcile", { approvalNotes }, staffId]
  );

  await writeFinanceAudit(pool, {
    tenantId,
    staffId,
    eventType: "activeclinic.cashier.session_reconciled",
    resourceType: "cashier_session",
    resourceId: sessionId,
    metadata: { varianceMinor: session.variance_minor },
  });

  return {
    result: RESULT.OK,
    session: mapSession(updateResult.rows[0]),
  };
}

// ============================================================================
// SESSION HISTORY
// ============================================================================

async function listCashierSessions({
  pool,
  tenantId,
  facilityId,
  staffId,
  cashierStaffId = null,
  status = null,
  limit = 50,
  offset = 0,
}) {
  const denied = await assertPerm(pool, {
    tenantId,
    facilityId,
    staffId,
    permissionKey: PERM.MANAGE,
  });
  if (denied) return denied;

  let query = `
    SELECT s.*, st.first_name as cashier_first_name, st.last_name as cashier_last_name
    FROM activeclinic.cashier_sessions s
    LEFT JOIN activeclinic.staff st ON s.cashier_staff_id = st.id
    WHERE s.tenant_id = $1 AND s.facility_id = $2
  `;
  const params = [tenantId, facilityId];
  let idx = 3;

  if (cashierStaffId) {
    query += ` AND s.cashier_staff_id = $${idx}`;
    params.push(cashierStaffId);
    idx++;
  }

  if (status) {
    query += ` AND s.status = $${idx}`;
    params.push(status);
    idx++;
  }

  query += ` ORDER BY s.opened_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
  params.push(limit, offset);

  const result = await pool.query(query, params);

  return {
    result: RESULT.OK,
    sessions: result.rows.map((row) => ({
      ...mapSession(row),
      cashierName: `${row.cashier_first_name} ${row.cashier_last_name}`,
    })),
  };
}

// ============================================================================
// HELPERS
// ============================================================================

async function generateSessionNumber(pool, tenantId, facilityId) {
  const date = new Date();
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM activeclinic.cashier_sessions
     WHERE tenant_id = $1 AND facility_id = $2 AND session_date = CURRENT_DATE`,
    [tenantId, facilityId]
  );

  const sequence = parseInt(countResult.rows[0].count, 10) + 1;
  return `CSH-${year}${month}${day}-${sequence.toString().padStart(3, "0")}`;
}

function mapSession(row) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    facilityId: row.facility_id,
    cashierStaffId: row.cashier_staff_id,
    sessionNumber: row.session_number,
    sessionDate: row.session_date,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    openingCashMinor: row.opening_cash_minor ? parseInt(row.opening_cash_minor, 10) : 0,
    expectedCashMinor: row.expected_cash_minor ? parseInt(row.expected_cash_minor, 10) : null,
    actualCashMinor: row.actual_cash_minor ? parseInt(row.actual_cash_minor, 10) : null,
    varianceMinor: row.variance_minor ? parseInt(row.variance_minor, 10) : null,
    currencyCode: row.currency_code,
    status: row.status,
    notes: row.notes,
    reconciledAt: row.reconciled_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  RESULT,
  PERM,
  SESSION_STATUS,
  openCashierSession,
  getCurrentCashierSession,
  closeCashierSession,
  reconcileCashierSession,
  listCashierSessions,
};
