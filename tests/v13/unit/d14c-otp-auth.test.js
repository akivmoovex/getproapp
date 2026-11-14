"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { createOtpService } = require("../../../src/platform/otp/otpService");
const { resolveOtpActivation } = require("../../../src/platform/otp/otpActivation");
const { getOtpWorkflow, WORKFLOWS } = require("../../../src/platform/otp/otpWorkflows");
const { evaluateOtpSessionGate } = require("../../../src/platform/otp/otpSessionGate");
const { issueAuthenticatedSessionCookie } = require("../../../src/platform/session/sharedSessionSecurity");
const { assignBlessBoardRole } = require("../../../src/blessboard/services/assignBlessBoardRole");
const { assignStaffRole } = require("../../../src/activeclinic/services/activeClinicAuthorizationService");
const { acceptMemberPortalInvitation } = require("../../../src/blessboard/services/memberPortalInvitationService");
const { defaultTenantPostLoginPath } = require("../../../src/blessboard/http/tenantLoginHelpers");
const { OTP_POLICY } = require("../../../src/platform/otp/otpPolicy");

const PEPPER = "unit-test-otp-pepper-32b-minimum!!";
const ORG = "11111111-1111-4111-8111-111111111111";
const ACCOUNT = "22222222-2222-4222-8222-222222222222";
const SESSION = "44444444-4444-4444-8444-444444444444";

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

function productionEnv() {
  return {
    NODE_ENV: "production",
    DEPLOYMENT_ENV: "production",
    DATABASE_IDENTITY_ENV: "production",
    PLATFORM_DEPLOYMENT_CODE: "moovex-platform-production",
    DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
  };
}

function clockAt(start) {
  let now = start;
  return {
    clock: () => now,
    advance(ms) {
      now += ms;
    },
  };
}

describe("D14C OTP authentication gate", () => {
  it("keeps production activation blocked and still allows the existing session path", async () => {
    const activation = resolveOtpActivation(productionEnv(), "ACTIVE");
    assert.equal(activation.status, "BLOCKED");
    assert.deepEqual(activation.reasons, [
      "migration_not_applied",
      "provider_not_configured",
      "release_not_verified",
    ]);
    let began = 0;
    const service = {
      async beginChallenge() {
        began += 1;
        throw new Error("otp_should_not_start");
      },
    };
    const gate = await evaluateOtpSessionGate(
      {
        workflow: "blessboard.hq_administrator_login",
        activation: "ACTIVE",
        service,
      },
      productionEnv()
    );
    assert.equal(gate.activation, "BLOCKED");
    assert.equal(gate.sessionAllowed, true);
    assert.equal(gate.otpRequired, false);
    assert.equal(began, 0);
    assert.equal(gate.postLoginPath, undefined);
    assert.equal(
      defaultTenantPostLoginPath([
        { roleKey: "organisation_administrator" },
        { roleKey: "branch_administrator" },
      ]),
      "/account"
    );
  });

  it("withholds the session until OTP and then rejects expiry, replay, and the wrong purpose", async () => {
    const time = clockAt(1_700_000_000_000);
    const service = createOtpService({ clock: time.clock });
    const env = testingEnv();
    const binding = {
      workflow: "activeclinic.patient_login",
      activation: "ACTIVE",
      service,
      organizationId: ORG,
      accountId: ACCOUNT,
      channel: "email",
      identifier: "patient@example.com",
      diagnosis: "malaria",
      churchName: "Grace Chapel",
    };
    const pending = await evaluateOtpSessionGate(binding, env);
    assert.equal(pending.sessionAllowed, false);
    assert.equal(pending.sessionComplete, false);
    assert.equal(JSON.stringify(pending.public).includes("malaria"), false);
    assert.equal(JSON.stringify(pending).includes("Grace Chapel"), false);

    let cookies = 0;
    const denied = await issueAuthenticatedSessionCookie(
      { headers: {} },
      { cookie() { cookies += 1; }, setHeader() {} },
      {
        rawToken: "session-token",
        env,
        otpWorkflow: "activeclinic.patient_login",
        otpActivation: "ACTIVE",
        otpService: service,
        organizationId: ORG,
        accountId: ACCOUNT,
        otpIdentifier: "patient@example.com",
        otpVerification: { attemptId: pending.attemptId, code: "000000" },
      }
    );
    assert.equal(denied.code, "otp_required");
    assert.equal(cookies, 0);

    const verified = await evaluateOtpSessionGate(
      { ...binding, verification: { attemptId: pending.attemptId, code: "1234" } },
      env
    );
    assert.equal(verified.sessionComplete, true);
    const replay = await evaluateOtpSessionGate(
      { ...binding, verification: { attemptId: pending.attemptId, code: "1234" } },
      env
    );
    assert.equal(replay.sessionComplete, false);
    assert.equal(replay.sessionAllowed, false);

    const recovery = await evaluateOtpSessionGate(
      {
        workflow: "blessboard.forgot_password",
        activation: "ACTIVE",
        service,
        organizationId: ORG,
        accountId: ACCOUNT,
        channel: "email",
        identifier: "admin@example.com",
      },
      env
    );
    const wrongPurpose = await evaluateOtpSessionGate(
      {
        workflow: "blessboard.forgot_password",
        activation: "ACTIVE",
        service,
        organizationId: ORG,
        accountId: ACCOUNT,
        channel: "email",
        identifier: "admin@example.com",
        verification: { attemptId: recovery.attemptId, code: "1234", purpose: "login" },
      },
      env
    );
    assert.equal(wrongPurpose.sessionComplete, false);

    const expiredStart = await evaluateOtpSessionGate(
      {
        workflow: "blessboard.member_login",
        activation: "ACTIVE",
        service,
        organizationId: ORG,
        accountId: ACCOUNT,
        channel: "sms",
        identifier: "0977123456",
      },
      env
    );
    time.advance(OTP_POLICY.ttlSeconds * 1000 + 1);
    const expired = await evaluateOtpSessionGate(
      {
        workflow: "blessboard.member_login",
        activation: "ACTIVE",
        service,
        organizationId: ORG,
        accountId: ACCOUNT,
        channel: "sms",
        identifier: "+260977123456",
        verification: { attemptId: expiredStart.attemptId, code: "1234" },
      },
      env
    );
    assert.equal(expired.sessionComplete, false);
  });

  it("covers BlessBoard and ActiveClinic workflows without booking or a database write", async () => {
    const required = [
      "blessboard.hq_administrator_login",
      "blessboard.branch_administrator_login",
      "blessboard.church_staff_login",
      "blessboard.member_login",
      "blessboard.forgot_password",
      "blessboard.member_activation",
      "blessboard.role_permission_change",
      "activeclinic.clinic_administrator_login",
      "activeclinic.staff_login",
      "activeclinic.patient_login",
      "activeclinic.forgot_password",
      "activeclinic.patient_portal_activation",
      "activeclinic.staff_role_change",
      "activeclinic.patient_account_action",
    ];
    for (const id of required) {
      const workflow = getOtpWorkflow(id);
      assert.ok(workflow, id);
      assert.equal(WORKFLOWS[id].action.length > 0, true);
      const blocked = await evaluateOtpSessionGate({ workflow: id }, {});
      assert.equal(blocked.activation, "BLOCKED");
      assert.equal(blocked.sessionAllowed, true);
    }
    assert.equal(getOtpWorkflow("activeclinic.public_booking"), null);
    assert.equal(getOtpWorkflow("activeclinic.patient_portal_activation").independentOfBooking, true);

    const service = createOtpService();
    const env = testingEnv();
    const role = await assignBlessBoardRole(
      null,
      {
        userId: ACCOUNT,
        email: "admin@example.com",
        organizationKey: "chapel",
        roleKey: "platform_administrator",
      },
      { otpActivation: "ACTIVE", env, otpService: service }
    );
    assert.equal(role.status, "otp_required");

    const staff = await assignStaffRole(null, {
      otpActivation: "ACTIVE",
      env,
      otpService: service,
      organizationId: ORG,
      staffMemberId: ACCOUNT,
      sessionId: SESSION,
      identifier: "staff@example.com",
      roleKey: "clinic_administrator",
      scopeType: "organisation",
    });
    assert.equal(staff.code, "otp_required");

    const activation = await acceptMemberPortalInvitation(null, {
      otpActivation: "ACTIVE",
      env,
      otpService: service,
      organizationId: ORG,
      accountId: ACCOUNT,
      identifier: "member@example.com",
      token: "not-used",
      password: "short",
    });
    assert.equal(activation.code, "otp_required");
  });
});
