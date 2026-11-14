"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createOtpService } = require("../../../src/platform/otp/otpService");
const { createMemoryOtpStore } = require("../../../src/platform/otp/otpChallengeStore");
const { OTP_POLICY } = require("../../../src/platform/otp/otpPolicy");
const { issueCsrfToken, validateCsrf } = require("../../../src/platform/http/v5Csrf");
const { findByIdAndOrganization } = require(
  "../../../src/activeclinic/repositories/facilityRepository"
);
const { findStaffCollision } = require(
  "../../../src/activeclinic/repositories/appointmentRepository"
);
const { grantPatientConsent, RESULT: CONSENT } = require(
  "../../../src/activeclinic/services/activeClinicPatientConsentService"
);
const { registerPatientWithPhoneMatch, RESULT: PORTAL } = require(
  "../../../src/activeclinic/services/activeClinicPatientPortalRegistrationService"
);
const { startEncounter, RESULT: CLINICAL } = require(
  "../../../src/activeclinic/services/activeClinicClinicalService"
);
const { getClinicalDocument, RESULT: DOCUMENT } = require(
  "../../../src/activeclinic/services/activeClinicClinicalDocumentService"
);
const { recordPayment, RESULT: BILLING } = require(
  "../../../src/activeclinic/services/activeClinicBillingService"
);

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const HCO = "33333333-3333-4333-8333-333333333333";
const FACILITY = "44444444-4444-4444-8444-444444444444";
const PATIENT = "55555555-5555-4555-8555-555555555555";
const OTHER_PATIENT = "66666666-6666-4666-8666-666666666666";
const STAFF = "77777777-7777-4777-8777-777777777777";
const ACCOUNT = "88888888-8888-4888-8888-888888888888";
const DOCUMENT_ID = "99999999-9999-4999-8999-999999999999";
const NARRATIVE = "CLINICAL-NARRATIVE-SECRET";
const PASSWORD = "portal-password-secret";
const CSRF_ENV = {
  SESSION_SECRET: "d57-csrf-secret-at-least-32-characters",
};

function closedDb() {
  return {
    async query() {
      throw new Error("db_not_allowed");
    },
  };
}

function hidden(value, secret) {
  assert.equal(JSON.stringify(value).includes(secret), false);
}

describe("D57 behavioral strengthening", () => {
  it("rejects a forged consent tenant before any query", async () => {
    let queries = 0;
    const result = await grantPatientConsent(
      {
        async query() {
          queries += 1;
          throw new Error("db_not_allowed");
        },
      },
      {
        organizationId: ORG,
        healthcareOrganizationId: HCO,
        facilityId: FACILITY,
        body: { organizationId: OTHER, note: NARRATIVE },
        actor: { staffMemberId: STAFF, platformIdentityId: ACCOUNT },
      }
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, CONSENT.FORGED_TENANT);
    assert.equal(queries, 0);
    hidden(result, NARRATIVE);
  });

  it("keeps a facility read inside the organization parameters", async () => {
    const calls = [];
    const missing = await findByIdAndOrganization(
      {
        async query(sql, params) {
          calls.push({ sql, params });
          return { rows: [] };
        },
      },
      { id: FACILITY, organizationId: OTHER }
    );
    assert.equal(missing, null);
    assert.match(calls[0].sql, /organization_id = \$2/);
    assert.deepEqual(calls[0].params, [FACILITY, OTHER]);
    await assert.rejects(
      () => findByIdAndOrganization(closedDb(), { id: FACILITY, organizationId: ORG }),
      /db_not_allowed/
    );
  });

  it("returns a staff appointment collision and does not hide it when the block table is absent", async () => {
    const idle = await findStaffCollision(closedDb(), { assignedStaffId: "" });
    assert.equal(idle, null);

    let blockQueries = 0;
    const collision = await findStaffCollision(
      {
        async query(sql) {
          if (String(sql).includes("staff_availability_blocks")) {
            blockQueries += 1;
            throw new Error("block_table_absent");
          }
          return { rows: [{ id: "appt-1" }] };
        },
      },
      {
        organizationId: ORG,
        healthcareOrganizationId: HCO,
        assignedStaffId: STAFF,
        startsAt: new Date("2026-12-01T09:00:00.000Z"),
        endsAt: new Date("2026-12-01T09:30:00.000Z"),
      }
    );
    assert.equal(collision.kind, "appointment");
    assert.equal(collision.id, "appt-1");
    assert.equal(blockQueries, 0);

    const absent = await findStaffCollision(
      {
        async query(sql) {
          if (String(sql).includes("staff_availability_blocks")) {
            throw new Error("block_table_absent");
          }
          return { rows: [] };
        },
      },
      {
        organizationId: ORG,
        healthcareOrganizationId: HCO,
        assignedStaffId: STAFF,
        startsAt: new Date("2026-12-01T09:00:00.000Z"),
        endsAt: new Date("2026-12-01T09:30:00.000Z"),
      }
    );
    assert.equal(absent, null);
  });

  it("stops portal registration before a query when the clinic, password, or phone is unusable", async () => {
    const base = {
      phone: "+260977000222",
      password: PASSWORD,
      firstName: "Pat",
      lastName: "Ient",
      deploymentCode: "testing",
      organizationId: ORG,
      healthcareOrganizationId: HCO,
    };
    const missingOrg = await registerPatientWithPhoneMatch(closedDb(), {
      ...base,
      organizationId: "",
    });
    assert.equal(missingOrg.code, PORTAL.INVALID_INPUT);
    hidden(missingOrg, PASSWORD);

    const short = await registerPatientWithPhoneMatch(closedDb(), {
      ...base,
      password: "too-short",
    });
    assert.equal(short.code, PORTAL.WEAK_PASSWORD);
    hidden(short, "too-short");

    const badPhone = await registerPatientWithPhoneMatch(closedDb(), {
      ...base,
      phone: "12",
    });
    assert.equal(badPhone.code, PORTAL.INVALID_INPUT);
    hidden(badPhone, PASSWORD);
  });

  it("rejects an unknown encounter type before authorization", async () => {
    let queries = 0;
    const result = await startEncounter(
      {
        async query() {
          queries += 1;
          throw new Error("db_not_allowed");
        },
      },
      {
        encounterType: "inpatient",
        organizationId: ORG,
        actor: { staffMemberId: STAFF, platformIdentityId: ACCOUNT },
      }
    );
    assert.equal(result.ok, false);
    assert.equal(result.code, CLINICAL.INVALID_INPUT);
    assert.equal(result.encounter, null);
    assert.equal(queries, 0);
  });

  it("hides another patient's document body and returns the matching document", async () => {
    function dbFor(patientId) {
      return {
        async query(sql) {
          const text = String(sql);
          if (text.includes("clinical_document_events")) return { rows: [] };
          return {
            rows: [{
              id: DOCUMENT_ID,
              organization_id: ORG,
              patient_id: patientId,
              body_text: NARRATIVE,
              document_type: "note",
              title: "Visit note",
              status: "final",
            }],
          };
        },
      };
    }
    const foreign = await getClinicalDocument(dbFor(OTHER_PATIENT), {
      organizationId: ORG,
      documentId: DOCUMENT_ID,
      patientId: PATIENT,
    });
    assert.equal(foreign.ok, false);
    assert.equal(foreign.code, DOCUMENT.NOT_FOUND);
    hidden(foreign, NARRATIVE);

    const own = await getClinicalDocument(dbFor(PATIENT), {
      organizationId: ORG,
      documentId: DOCUMENT_ID,
      patientId: PATIENT,
    });
    assert.equal(own.ok, true);
    assert.equal(own.document.bodyText, NARRATIVE);

    const missing = await getClinicalDocument(
      {
        async query() {
          return { rows: [] };
        },
      },
      { organizationId: ORG, documentId: DOCUMENT_ID, patientId: PATIENT }
    );
    assert.equal(missing.code, DOCUMENT.NOT_FOUND);
    await assert.rejects(
      () => getClinicalDocument(closedDb(), {
        organizationId: ORG,
        documentId: DOCUMENT_ID,
        patientId: PATIENT,
      }),
      /db_not_allowed/
    );
  });

  it("denies payment collection when the clinic product is not active and does not open a transaction", async () => {
    let connections = 0;
    const result = await recordPayment({
      pool: {
        async query() {
          return { rows: [] };
        },
        async connect() {
          connections += 1;
          throw new Error("connect_not_allowed");
        },
      },
      tenantId: ORG,
      facilityId: FACILITY,
      staffId: STAFF,
      patientId: PATIENT,
      amountMinor: 1000,
      paymentMethod: "cash",
      notes: NARRATIVE,
      cashierSessionId: ACCOUNT,
      idempotencyKey: "pay-once",
    });
    assert.equal(result.result, BILLING.ACCESS_DENIED);
    assert.equal(connections, 0);
    hidden(result, NARRATIVE);
    hidden(result, "pay-once");
  });

  it("accepts only the ActiveClinic CSRF cookie and body pair", () => {
    const token = issueCsrfToken(CSRF_ENV);
    const other = issueCsrfToken(CSRF_ENV);
    const req = {
      platform: { csrfCookieName: "activeclinic_org_csrf" },
      cookies: { activeclinic_org_csrf: token },
    };
    assert.equal(validateCsrf(req, token, CSRF_ENV), true);
    assert.equal(validateCsrf(req, other, CSRF_ENV), false);
    assert.equal(validateCsrf(req, "", CSRF_ENV), false);
    assert.equal(
      validateCsrf(
        {
          platform: { csrfCookieName: "activeclinic_org_csrf" },
          cookies: { blessboard_org_csrf: token },
        },
        token,
        CSRF_ENV
      ),
      false
    );
  });

  it("expires an OTP on the exact ttl boundary and keeps the code out of the public result", async () => {
    let now = 1_700_000_000_000;
    const service = createOtpService({
      store: createMemoryOtpStore(),
      clock: () => now,
    });
    const env = {
      NODE_ENV: "test",
      DEPLOYMENT_ENV: "testing",
      DATABASE_IDENTITY_ENV: "testing",
      DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
      PLATFORM_DEPLOYMENT_CODE: "moovex-platform-testing",
      GETPRO_OTP_ALLOW_FIXED_CODE: "1",
      GETPRO_OTP_PEPPER: "d57-unit-otp-pepper-32-characters!",
    };
    const login = {
      action: "auth.login",
      productCode: "activeclinic",
      channel: "email",
      organizationId: ORG,
      accountId: ACCOUNT,
      identifier: "otp-d57@example.com",
    };
    const issued = await service.beginChallenge(login, env);
    now += OTP_POLICY.ttlSeconds * 1000 - 1;
    const stillValid = await service.verifyChallenge(
      { ...login, attemptId: issued.server.attemptId, code: "1234" },
      env
    );
    assert.equal(stillValid.server.reason, "verified");
    hidden(stillValid.public, "1234");

    now += 1;
    const next = await service.beginChallenge(login, env);
    now += OTP_POLICY.ttlSeconds * 1000;
    const expired = await service.verifyChallenge(
      { ...login, attemptId: next.server.attemptId, code: "1234" },
      env
    );
    assert.equal(expired.server.reason, "expired");
    assert.equal(expired.server.sessionComplete, false);
    hidden(expired.public, "1234");

    const replay = await service.verifyChallenge(
      { ...login, attemptId: issued.server.attemptId, code: "1234" },
      env
    );
    assert.equal(replay.server.reason, "replay");
    const wrongPurpose = await service.beginChallenge(login, env);
    const purpose = await service.verifyChallenge(
      {
        ...login,
        attemptId: wrongPurpose.server.attemptId,
        purpose: "password_recovery",
        code: "1234",
      },
      env
    );
    assert.equal(purpose.server.reason, "wrong_purpose");
    hidden(purpose.public, "1234");
  });
});
