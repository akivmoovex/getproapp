"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { recordPayment, RESULT } = require(
  "../../../src/activeclinic/services/activeClinicBillingService"
);
const { findStaffCollision } = require(
  "../../../src/activeclinic/repositories/appointmentRepository"
);
const { evaluateSlotCapacity } = require(
  "../../../src/activeclinic/services/appointmentSchedulingRules"
);

const TENANT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const HCO = "33333333-3333-4333-8333-333333333333";
const FACILITY = "44444444-4444-4444-8444-444444444444";
const STAFF = "55555555-5555-4555-8555-555555555555";
const PATIENT = "66666666-6666-4666-8666-666666666666";
const PAYMENT = "77777777-7777-4777-8777-777777777777";

function paymentPool(duplicateTenant) {
  const statements = [];
  const payment = {
    id: PAYMENT,
    tenant_id: duplicateTenant,
    facility_id: FACILITY,
    patient_id: PATIENT,
    payment_number: "PAY-1",
    payment_date: "2026-11-15",
    amount_minor: "2500",
    currency_code: "ZMW",
    payment_method: "card",
    reference_number: null,
    notes: null,
    cashier_session_id: null,
    created_at: "2026-11-15T00:00:00.000Z",
    receipt_number: "R-1",
  };
  async function query(sql, params) {
    const text = String(sql);
    statements.push(text);
    if (text.includes("platform.organization_products")) {
      return {
        rows: [{ status: "active", organization_status: "active", product_status: "active" }],
      };
    }
    if (text.includes("activeclinic.healthcare_organizations")) {
      return { rows: [{ id: HCO, organization_id: TENANT, status: "active" }] };
    }
    if (text.includes("activeclinic.staff_members")) {
      return { rows: [{ id: STAFF, organization_id: TENANT, status: "active", specialties_json: [] }] };
    }
    if (text.includes("permission_key")) {
      return { rows: [{ permission_key: "activeclinic.payment.collect" }] };
    }
    if (text.includes("staff_role_assignments")) {
      return { rows: [{ scope_type: "organisation", role_key: "finance_supervisor" }] };
    }
    if (text.includes("FROM activeclinic.patients")) {
      return params[1] === TENANT ? { rows: [{ id: PATIENT }] } : { rows: [] };
    }
    if (text === "BEGIN" || text === "ROLLBACK" || text === "COMMIT") return { rows: [] };
    if (text.includes("pg_advisory_xact_lock")) return { rows: [] };
    if (text.includes("COUNT(*) FROM activeclinic.payments")) return { rows: [{ count: "0" }] };
    if (text.includes("FROM activeclinic.payments")) {
      if (params[1] === payment.tenant_id) return { rows: [payment], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }
    if (text.includes("INSERT INTO activeclinic.payments")) {
      throw new Error("passed_duplicate_check");
    }
    throw new Error(`unexpected ${text.slice(0, 140)}`);
  }
  return {
    statements,
    query,
    async connect() {
      return { query, release() {} };
    },
  };
}

function paymentInput(idempotencyKey) {
  return {
    tenantId: TENANT,
    facilityId: FACILITY,
    staffId: STAFF,
    patientId: PATIENT,
    amountMinor: 2500,
    paymentMethod: "card",
    notes: "NEW-NOTE-NOT-STORED",
    idempotencyKey,
  };
}

describe("D65 payment idempotency", () => {
  it("rolls back a repeated payment key for the same tenant before an insert", async () => {
    const pool = paymentPool(TENANT);
    const result = await recordPayment({ ...paymentInput("pay-once"), pool });
    assert.equal(result.result, RESULT.DUPLICATE_SUBMISSION);
    assert.equal(result.payment.id, PAYMENT);
    assert.equal(result.receiptNumber, "R-1");
    assert.equal(JSON.stringify(result).includes("NEW-NOTE-NOT-STORED"), false);
    assert.equal(pool.statements.some((sql) => sql.includes("INSERT INTO activeclinic.payments")), false);
    assert.equal(pool.statements.includes("ROLLBACK"), true);
  });

  it("does not treat another tenant's payment key as a duplicate", async () => {
    const pool = paymentPool(OTHER);
    await assert.rejects(
      () => recordPayment({ ...paymentInput("pay-once"), pool }),
      /passed_duplicate_check/
    );
    assert.equal(pool.statements.includes("ROLLBACK"), true);
  });

  it("refuses a patient that is not in the tenant before a transaction", async () => {
    let connections = 0;
    const result = await recordPayment({
      ...paymentInput("pay-once"),
      pool: {
        async query(sql, params) {
          const text = String(sql);
          if (text.includes("platform.organization_products")) {
            return {
              rows: [{ status: "active", organization_status: "active", product_status: "active" }],
            };
          }
          if (text.includes("activeclinic.healthcare_organizations")) {
            return { rows: [{ id: HCO, organization_id: TENANT, status: "active" }] };
          }
          if (text.includes("activeclinic.staff_members")) {
            return { rows: [{ id: STAFF, organization_id: TENANT, status: "active", specialties_json: [] }] };
          }
          if (text.includes("permission_key")) {
            return { rows: [{ permission_key: "activeclinic.payment.collect" }] };
          }
          if (text.includes("staff_role_assignments")) {
            return { rows: [{ scope_type: "organisation" }] };
          }
          if (text.includes("FROM activeclinic.patients")) return { rows: [] };
          throw new Error(`unexpected ${text.slice(0, 80)} ${params}`);
        },
        async connect() {
          connections += 1;
          throw new Error("connect_not_allowed");
        },
      },
    });
    assert.equal(result.result, RESULT.NOT_FOUND);
    assert.equal(result.reason, "patient");
    assert.equal(connections, 0);
  });
});

describe("D65 staff overlap without a database lock", () => {
  it("lets two checks pass before either appointment is stored", async () => {
    const stored = [];
    const seen = [];
    const db = {
      async query(sql, params) {
        seen.push(sql);
        if (sql.includes("staff_availability_blocks")) return { rows: [] };
        const [organizationId, , staffId, startsAt, endsAt] = params;
        const hit = stored.find(
          (row) =>
            row.organization_id === organizationId &&
            row.assigned_staff_id === staffId &&
            new Date(row.starts_at) < new Date(endsAt) &&
            new Date(row.ends_at) > new Date(startsAt)
        );
        return { rows: hit ? [{ id: hit.id }] : [] };
      },
    };
    const request = {
      organizationId: TENANT,
      healthcareOrganizationId: HCO,
      assignedStaffId: STAFF,
      startsAt: "2026-12-01T09:00:00.000Z",
      endsAt: "2026-12-01T09:30:00.000Z",
    };
    const [first, second] = await Promise.all([
      findStaffCollision(db, request),
      findStaffCollision(db, request),
    ]);
    assert.equal(first, null);
    assert.equal(second, null);
    stored.push({
      id: "88888888-8888-4888-8888-888888888888",
      organization_id: TENANT,
      assigned_staff_id: STAFF,
      starts_at: request.startsAt,
      ends_at: request.endsAt,
    });
    const third = await findStaffCollision(db, request);
    assert.equal(third.kind, "appointment");
    const otherStaff = await findStaffCollision(db, {
      ...request,
      assignedStaffId: PATIENT,
    });
    assert.equal(otherStaff, null);
    const touching = await findStaffCollision(db, {
      ...request,
      startsAt: "2026-12-01T09:30:00.000Z",
      endsAt: "2026-12-01T10:00:00.000Z",
    });
    assert.equal(touching, null);
    assert.equal(seen.some((sql) => sql.includes("FOR UPDATE")), false);
  });
});

describe("D65 prepared database checks", () => {
  it("does not run a slot-capacity or row-lock test", () => {
    const capacity = evaluateSlotCapacity();
    assert.equal(capacity.code, "BLOCKED_APPROVAL_REQUIRED");
    assert.equal(capacity.capacity, null);
    assert.equal(process.env.DATABASE_URL, undefined);
    assert.equal(process.env.GETPRO_V13_ALLOW_DB_WRITES || "0", "0");
  });
});
