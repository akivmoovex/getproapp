"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  canGrantRole,
  assignFoundationalStaffRole,
  RESULT,
} = require("../../../src/activeclinic/services/activeClinicAccessManagementService");
const { createAppointment, RESULT: APPOINTMENT } = require("../../../src/activeclinic/services/activeClinicAppointmentService");
const { issueCsrfToken, validateCsrf } = require("../../../src/platform/http/v5Csrf");
const { createOtpService } = require("../../../src/platform/otp/otpService");
const { createMemoryOtpStore } = require("../../../src/platform/otp/otpChallengeStore");

const STAFF = "22222222-2222-4222-8222-222222222222";
const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "33333333-3333-4333-8333-333333333333";
const PEPPER = "d31-unit-otp-pepper-32-characters!";

function throwingDb() {
  return { async query() { throw new Error("db_not_allowed"); } };
}

function adminAuth() {
  return {
    permissions: ["activeclinic.staff.assign_access"],
    staffMember: { id: STAFF, status: "active" },
    organization: { id: ORG },
    roleAssignments: [{ roleKey: "activeclinic_organization_admin", status: "active" }],
  };
}

function testingEnv() {
  return {
    NODE_ENV: "test",
    DEPLOYMENT_ENV: "testing",
    DATABASE_IDENTITY_ENV: "testing",
    DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
    PLATFORM_DEPLOYMENT_CODE: "moovex-platform-testing",
    GETPRO_OTP_ALLOW_FIXED_CODE: "1",
    GETPRO_OTP_PEPPER: PEPPER,
  };
}

describe("D31 package A security", () => {
  it("denies an organization administrator granting that role to themself", async () => {
    const decision = await canGrantRole(throwingDb(), {
      auth: adminAuth(),
      roleKey: "activeclinic_organization_admin",
      scopeType: "organisation",
      targetStaffMemberId: STAFF,
    });
    assert.equal(decision.ok, false);
    assert.equal(decision.code, RESULT.SELF_ESCALATION);
  });

  it("denies a raw permission list and a grant aimed at another organization", async () => {
    const raw = await assignFoundationalStaffRole(throwingDb(), {
      auth: adminAuth(),
      staffMemberId: STAFF,
      roleKey: "activeclinic_nurse",
      scopeType: "facility",
      permissionKeys: ["activeclinic.patient.view"],
    });
    assert.equal(raw.code, RESULT.RAW_PERMISSIONS);
    const cross = await assignFoundationalStaffRole(throwingDb(), {
      auth: adminAuth(),
      organizationId: OTHER,
      staffMemberId: STAFF,
      roleKey: "activeclinic_nurse",
      scopeType: "facility",
      facilityId: "44444444-4444-4444-8444-444444444444",
    });
    assert.equal(cross.code, RESULT.CROSS_ORGANIZATION);
  });

  it("rejects a BlessBoard role and a facility grant with no facility", async () => {
    const church = await canGrantRole(throwingDb(), {
      auth: adminAuth(),
      roleKey: "organisation_administrator",
      scopeType: "organisation",
      targetStaffMemberId: "55555555-5555-4555-8555-555555555555",
    });
    assert.equal(church.code, RESULT.INVALID_ROLE);
    const facility = await canGrantRole(throwingDb(), {
      auth: {
        ...adminAuth(),
        roleAssignments: [{ roleKey: "activeclinic_facility_admin", status: "active" }],
      },
      roleKey: "activeclinic_receptionist",
      scopeType: "facility",
      targetStaffMemberId: "55555555-5555-4555-8555-555555555555",
    });
    assert.equal(facility.code, RESULT.INVALID_SCOPE);
  });

  it("does not treat an expired organization-admin assignment as authority to grant", async () => {
    const decision = await canGrantRole(throwingDb(), {
      auth: {
        ...adminAuth(),
        roleAssignments: [{
          roleKey: "activeclinic_organization_admin",
          status: "active",
          expiresAt: "2000-01-01T00:00:00.000Z",
        }],
      },
      roleKey: "activeclinic_organization_admin",
      scopeType: "organisation",
      targetStaffMemberId: "55555555-5555-4555-8555-555555555555",
    });
    assert.equal(decision.code, RESULT.GRANT_DENIED);
  });

  it("rejects an appointment before any query when the tenant identifiers are not usable", async () => {
    const result = await createAppointment(throwingDb(), {
      organizationId: "not-a-tenant",
      healthcareOrganizationId: ORG,
      facilityId: ORG,
      patientId: ORG,
      serviceTypeId: ORG,
      startsAt: "2026-12-01T09:00:00.000Z",
      endsAt: "2026-12-01T09:30:00.000Z",
      actor: { staffMemberId: STAFF },
    });
    assert.equal(result.code, APPOINTMENT.INVALID_INPUT);
  });

  it("rejects a CSRF token signed for a different session secret", () => {
    const left = { NODE_ENV: "test", SESSION_SECRET: "d31-csrf-secret-a-32chars-minimum!" };
    const right = { NODE_ENV: "test", SESSION_SECRET: "d31-csrf-secret-b-32chars-minimum!" };
    const token = issueCsrfToken(left);
    const req = { cookies: { blessboard_org_csrf: token } };
    assert.equal(validateCsrf(req, token, left), true);
    assert.equal(validateCsrf(req, token, right), false);
    assert.equal(validateCsrf(req, "", left), false);
  });

  it("does not let an ActiveClinic verification consume a BlessBoard challenge", async () => {
    const service = createOtpService({ store: createMemoryOtpStore() });
    const issued = await service.beginChallenge({
      action: "auth.login",
      productCode: "blessboard",
      channel: "email",
      organizationId: ORG,
      accountId: STAFF,
      identifier: "otp-d31@example.com",
    }, testingEnv());
    assert.equal(issued.server.issued, true);
    const crossed = await service.verifyChallenge({
      action: "auth.login",
      productCode: "activeclinic",
      channel: "email",
      organizationId: ORG,
      accountId: STAFF,
      identifier: "otp-d31@example.com",
      attemptId: issued.server.attemptId,
      code: "1234",
    }, testingEnv());
    assert.equal(crossed.server.reason, "verification_failed");
    assert.equal(crossed.server.sessionComplete, false);
    const unknown = await service.beginChallenge({
      action: "auth.login",
      productCode: "shared",
      channel: "email",
      organizationId: ORG,
      accountId: STAFF,
      identifier: "otp-d31@example.com",
    }, testingEnv());
    assert.equal(unknown.server.reason, "unknown_product");
  });
});
