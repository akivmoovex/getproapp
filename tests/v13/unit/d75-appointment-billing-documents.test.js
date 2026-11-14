"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  createClinicalDocument,
  updateClinicalDocumentDraft,
  getClinicalDocument,
  RESULT: DOC,
} = require("../../../src/activeclinic/services/activeClinicClinicalDocumentService");
const { findPublicBookingByIdempotencyKey } = require(
  "../../../src/activeclinic/services/activeClinicPublicBookingService"
);
const { recordPayment, reversePayment, RESULT: BILLING } = require(
  "../../../src/activeclinic/services/activeClinicBillingService"
);
const {
  evaluateSlotCapacity,
  intervalsOverlap,
} = require("../../../src/activeclinic/services/appointmentSchedulingRules");

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const HCO = "33333333-3333-4333-8333-333333333333";
const FACILITY = "44444444-4444-4444-8444-444444444444";
const STAFF = "55555555-5555-4555-8555-555555555555";
const PATIENT = "66666666-6666-4666-8666-666666666666";
const DOC_ID = "77777777-7777-4777-8777-777777777777";
const PAYMENT = "88888888-8888-4888-8888-888888888888";

const SECRET = "SECRET-ATTACHMENT-BODY";

function financeQuery(permission) {
  return async function query(sql) {
    const text = String(sql);
    if (text.includes("platform.organization_products")) {
      return {
        rows: [{ status: "active", organization_status: "active", product_status: "active" }],
      };
    }
    if (text.includes("activeclinic.healthcare_organizations")) {
      return { rows: [{ id: HCO, organization_id: ORG, status: "active" }] };
    }
    if (text.includes("activeclinic.staff_members")) {
      return { rows: [{ id: STAFF, organization_id: ORG, status: "active", specialties_json: [] }] };
    }
    if (text.includes("permission_key")) return { rows: [{ permission_key: permission }] };
    if (text.includes("staff_role_assignments")) {
      return { rows: [{ scope_type: "organisation", role_key: "finance_supervisor" }] };
    }
    if (text.includes("FROM activeclinic.patients")) return { rows: [{ id: PATIENT }] };
    return null;
  };
}

describe("D75 appointments and payments", () => {
  it("does not treat a touching staff interval as an overlap and does not approve capacity", () => {
    assert.equal(
      intervalsOverlap(
        "2026-12-01T09:00:00.000Z",
        "2026-12-01T09:30:00.000Z",
        "2026-12-01T09:30:00.000Z",
        "2026-12-01T10:00:00.000Z"
      ),
      false
    );
    assert.equal(
      intervalsOverlap(
        "2026-12-01T09:00:00.000Z",
        "2026-12-01T09:30:00.000Z",
        "2026-12-01T09:15:00.000Z",
        "2026-12-01T09:45:00.000Z"
      ),
      true
    );
    const capacity = evaluateSlotCapacity();
    assert.equal(capacity.ok, false);
    assert.equal(capacity.code, "BLOCKED_APPROVAL_REQUIRED");
    assert.equal(capacity.capacity, null);
  });

  it("does not return another organization's booking for the same idempotency key", async () => {
    const result = await findPublicBookingByIdempotencyKey(
      {
        async query(sql, params) {
          assert.match(String(sql), /organization_id = \$1/);
          if (params[0] !== ORG) return { rows: [] };
          return {
            rows: [{
              id: DOC_ID,
              request_number: "B-1",
              status: "submitted",
              created_at: "2026-11-15T00:00:00.000Z",
              booking_kind: "consultation",
            }],
          };
        },
      },
      { organizationId: OTHER, idempotencyKey: "retry-key" }
    );
    assert.equal(result.ok, false);
    assert.equal(result.booking, null);
  });

  it("returns the stored payment amount when the same key is retried with a different amount", async () => {
    const statements = [];
    const pool = {
      statements,
      async query(sql, params) {
        const text = String(sql);
        statements.push(text);
        const auth = await financeQuery("activeclinic.payment.collect")(sql);
        if (auth) return auth;
        if (text === "BEGIN" || text === "ROLLBACK" || text === "COMMIT") return { rows: [] };
        if (text.includes("pg_advisory_xact_lock")) return { rows: [] };
        if (text.includes("FROM activeclinic.payments") && params[1] === ORG) {
          return {
            rows: [{
              id: PAYMENT,
              tenant_id: ORG,
              facility_id: FACILITY,
              patient_id: PATIENT,
              payment_number: "PAY-1",
              payment_date: "2026-11-15",
              amount_minor: "2500",
              currency_code: "ZMW",
              payment_method: "card",
              receipt_number: "R-1",
            }],
          };
        }
        throw new Error(text.slice(0, 80));
      },
      async connect() {
        return { query: pool.query, release() {} };
      },
    };
    const result = await recordPayment({
      pool,
      tenantId: ORG,
      facilityId: FACILITY,
      staffId: STAFF,
      patientId: PATIENT,
      amountMinor: 9999,
      paymentMethod: "card",
      idempotencyKey: "pay-once",
      notes: "RETRY-NOTE",
    });
    assert.equal(result.result, BILLING.DUPLICATE_SUBMISSION);
    assert.equal(result.payment.amountMinor, 2500);
    assert.equal(JSON.stringify(result).includes("RETRY-NOTE"), false);
    assert.equal(statements.some((sql) => sql.includes("INSERT INTO activeclinic.payments")), false);
  });

  it("does not reverse a payment that belongs to another facility", async () => {
    const clientCalls = [];
    const result = await reversePayment({
      pool: {
        async query(sql) {
          return (await financeQuery("activeclinic.payment.reverse")(sql)) || { rows: [] };
        },
        async connect() {
          return {
            async query(sql, params) {
              clientCalls.push(String(sql));
              if (sql === "BEGIN" || sql === "ROLLBACK") return { rows: [] };
              if (String(sql).includes("FROM activeclinic.payments")) {
                return params[2] === FACILITY
                  ? { rows: [{ id: PAYMENT, payment_number: "PAY-1" }] }
                  : { rows: [] };
              }
              throw new Error("reversal_not_allowed");
            },
            release() {},
          };
        },
      },
      tenantId: ORG,
      facilityId: OTHER,
      staffId: STAFF,
      paymentId: PAYMENT,
      reason: "wrong facility",
    });
    assert.equal(result.result, BILLING.NOT_FOUND);
    assert.equal(clientCalls.some((sql) => sql.includes("INSERT INTO activeclinic.financial_reversals")), false);
  });

  it("does not reverse a payment that was already reversed", async () => {
    const clientCalls = [];
    const result = await reversePayment({
      pool: {
        async query(sql) {
          return (await financeQuery("activeclinic.payment.reverse")(sql)) || { rows: [] };
        },
        async connect() {
          return {
            async query(sql) {
              const text = String(sql);
              clientCalls.push(text);
              if (text === "BEGIN" || text === "ROLLBACK") return { rows: [] };
              if (text.includes("FROM activeclinic.payments")) {
                return { rows: [{ id: PAYMENT, payment_number: "PAY-1" }] };
              }
              if (text.includes("FROM activeclinic.financial_reversals")) {
                return { rows: [{ id: "rev" }] };
              }
              throw new Error("second_reversal_not_allowed");
            },
            release() {},
          };
        },
      },
      tenantId: ORG,
      facilityId: FACILITY,
      staffId: STAFF,
      paymentId: PAYMENT,
      reason: "retry",
    });
    assert.equal(result.result, BILLING.ALREADY_REVERSED);
    assert.equal(clientCalls.some((sql) => sql.includes("INSERT INTO activeclinic.financial_reversals")), false);
  });
});

describe("D75 documents", () => {
  it("rejects a clinical attachment that has no body before a query", async () => {
    let queries = 0;
    const missing = await createClinicalDocument(
      { async query() { queries += 1; throw new Error("db_not_allowed"); } },
      {
        organizationId: ORG,
        patientId: PATIENT,
        facilityId: FACILITY,
        documentType: "clinical_attachment",
        title: "Scan",
        bodyText: "   ",
        actor: { staffMemberId: STAFF },
      }
    );
    assert.equal(missing.code, DOC.INVALID_INPUT);
    assert.equal(queries, 0);
  });

  it("does not return a document body from another facility", async () => {
    const result = await getClinicalDocument(
      {
        async query(sql) {
          if (String(sql).includes("clinical_document_events")) throw new Error("events_not_allowed");
          return {
            rows: [{
              id: DOC_ID,
              organization_id: ORG,
              facility_id: FACILITY,
              patient_id: PATIENT,
              body_text: SECRET,
              document_type: "clinical_attachment",
              title: "Scan",
              status: "final",
            }],
          };
        },
      },
      { organizationId: ORG, documentId: DOC_ID, facilityId: OTHER, patientId: PATIENT }
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, DOC.NOT_FOUND);
    assert.equal(JSON.stringify(result).includes(SECRET), false);
  });

  it("does not update a draft stored at another facility", async () => {
    const calls = [];
    const result = await updateClinicalDocumentDraft(
      {
        async query(sql) {
          const text = String(sql);
          calls.push(text);
          if (text.includes("UPDATE")) throw new Error("update_not_allowed");
          return {
            rows: [{
              id: DOC_ID,
              organization_id: ORG,
              facility_id: FACILITY,
              patient_id: PATIENT,
              status: "draft",
              body_text: SECRET,
            }],
          };
        },
      },
      {
        organizationId: ORG,
        documentId: DOC_ID,
        facilityId: OTHER,
        patientId: PATIENT,
        title: "Changed",
        documentType: "clinical_note",
        bodyText: "tampered",
      }
    );
    assert.equal(result.code, DOC.NOT_FOUND);
    assert.equal(calls.some((sql) => sql.includes("UPDATE")), false);
    assert.equal(JSON.stringify(result).includes(SECRET), false);
  });
});
