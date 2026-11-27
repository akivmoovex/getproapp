"use strict";

/**
 * D159 major-flow gaps. These tests call current rules with synthetic data.
 * They do not open PostgreSQL, start a server, or send email.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createOtpService } = require("../../../src/platform/otp/otpService");
const { createFakeOtpProvider } = require("../../../src/platform/otp/otpProviders");
const { evaluateOtpSessionGate, resetOtpDatabaseAttachment } = require("../../../src/platform/otp/otpSessionGate");
const { normalizePatientDemographics } = require("../../../src/activeclinic/services/activeClinicPatientValidation");
const {
  intervalsOverlap,
  isBlockingAppointmentStatus,
} = require("../../../src/activeclinic/services/appointmentSchedulingRules");
const community = require("../../../src/activeclinic/communityBenefits/communityBenefitsService");
const { createMemoryCommunityStore, audit } = require("../../../src/activeclinic/communityBenefits/memoryStore");
const { financialPostingEnabled } = require("../../../src/activeclinic/communityBenefits/flags");
const { buildChurchAdministratorInvitationMessage } = require("../../../src/blessboard/services/churchAdministratorInvitationMessage");
const { validatePassword } = require("../../../src/blessboard/services/inviteBlessBoardStaff");
const { acceptMemberPortalInvitation } = require("../../../src/blessboard/services/memberPortalInvitationService");
const { approvedQaEnv } = require("../helpers/qaDeliveryFixture");

const CLINIC_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLINIC_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function member(store) {
  const person = community.addPerson(store, { displayName: "Ada Member" });
  const personId = person.person.id;
  community.requestEnrollment(store, { personId });
  community.recordConsent(store, { personId, noticeVersion: "notice-1" });
  community.verifyIdentity(store, { personId, method: "staff_document" });
  community.activateMembership(store, { personId });
  return personId;
}

describe("D159 patient, referral, and appointment boundaries", () => {
  it("rejects an unnamed or future-dated staff patient and keeps a valid identity", () => {
    assert.equal(normalizePatientDemographics({ lastName: "Member" }).code, "name_required");
    assert.equal(
      normalizePatientDemographics({
        firstName: "Ada",
        lastName: "Member",
        dateOfBirth: "2999-01-01",
        sexAtRegistration: "female",
      }).code,
      "date_of_birth_future"
    );
    assert.equal(
      normalizePatientDemographics({
        firstName: "Ada",
        lastName: "Member",
        dateOfBirth: "1990-01-02",
        sexAtRegistration: "other",
      }).code,
      "sex_at_registration_invalid"
    );
    const kept = normalizePatientDemographics({
      firstName: "Ada",
      lastName: "Member",
      dateOfBirth: "1990-01-02",
      sexAtRegistration: "female",
    });
    assert.equal(kept.ok, true);
    assert.equal(kept.value.firstName, "Ada");
    assert.equal(kept.value.dateOfBirth, "1990-01-02");
  });

  it("attributes only a real introduction and keeps walk-in and staff registration from posting", () => {
    const store = createMemoryCommunityStore();
    const personId = member(store);
    const staff = community.recordStaffRegistration(store, {
      personId,
      clinicId: CLINIC_A,
      actorId: "reception",
    });
    assert.equal(staff.acquisition, null);
    assert.equal(community.recordIntroduction(store, {
      personId,
      clinicId: CLINIC_B,
      actorId: "platform",
      sourceType: "walk_in",
      evidenceRef: "evidence-1",
      noticeVersion: "notice-1",
      correlationId: "correlation-1",
    }).code, "forged_referral");
    community.recordWalkIn(store, { personId, clinicId: CLINIC_A, actorId: "reception" });
    const introduced = community.recordIntroduction(store, {
      personId,
      clinicId: CLINIC_B,
      actorId: "platform",
      sourceType: "platform_introduction",
      evidenceRef: "evidence-1",
      noticeVersion: "notice-1",
      correlationId: "correlation-1",
    });
    assert.equal(introduced.ok, true);
    const agreement = community.createAgreement(store, {
      clinicId: CLINIC_B,
      model: "MODEL_A_DIRECT_DISCOUNT",
      discountBps: 1000,
      eligibleServices: ["consult"],
    });
    agreement.agreement.status = "ACTIVE";
    agreement.agreement.legalApproval = "approved";
    const away = community.decideEligibility(store, {
      personId,
      clinicId: CLINIC_B,
      agreementId: agreement.agreement.id,
      serviceCode: "consult",
      amountMinor: 10000,
    });
    assert.equal(away.decision, "ELIGIBLE");
    assert.equal(away.reason, "introduced_repeat");
    const home = community.decideEligibility(store, {
      personId,
      clinicId: CLINIC_A,
      agreementId: agreement.agreement.id,
      serviceCode: "consult",
      amountMinor: 10000,
    });
    assert.equal(home.decision, "NOT_ELIGIBLE");
    assert.equal(home.reason, "walk_in_no_introduction");
    const preview = community.previewInvoice(store, {
      personId,
      clinicId: CLINIC_B,
      agreementId: agreement.agreement.id,
      serviceCode: "consult",
      amountMinor: 10000,
    });
    assert.equal(preview.posted, false);
    assert.equal(preview.discountMinor > 0, true);
    assert.equal(financialPostingEnabled(), false);
    assert.equal(community.commitSettlement(store).code, "posting_disabled");
    const redacted = audit(store, { type: "chart.read", token: "raw-token", code: "1234", diagnosis: "secret" });
    assert.equal(redacted.token, undefined);
    assert.equal(redacted.code, undefined);
    assert.equal(redacted.diagnosis, undefined);
  });

  it("does not treat an end-before-start or a cancelled visit as an overlap", () => {
    assert.equal(intervalsOverlap(
      "2026-12-03T09:30:00.000Z",
      "2026-12-03T09:00:00.000Z",
      "2026-12-03T09:00:00.000Z",
      "2026-12-03T09:30:00.000Z"
    ), false);
    assert.equal(isBlockingAppointmentStatus("cancelled"), false);
    assert.equal(isBlockingAppointmentStatus("confirmed"), true);
    assert.equal(intervalsOverlap(
      "2026-12-03T09:00:00.000Z",
      "2026-12-03T09:30:00.000Z",
      "2026-12-03T09:30:00.000Z",
      "2026-12-03T10:00:00.000Z"
    ), false);
  });
});

describe("D159 invitation, OTP attempts, and route-shaped login", () => {
  it("rejects an invitation without a recipient and a first password that does not match", () => {
    assert.throws(
      () => buildChurchAdministratorInvitationMessage({ loginUrl: "http://127.0.0.1/login", inviteUrl: "http://127.0.0.1/invite/synthetic" }),
      /recipientEmail is required/
    );
    const message = buildChurchAdministratorInvitationMessage({
      recipientEmail: "invitee@example.com",
      churchName: "Synthetic Church",
      loginUrl: "http://127.0.0.1/login",
      inviteUrl: "http://127.0.0.1/invite/synthetic",
      administratorName: "Ada",
    });
    assert.match(message.text, /Synthetic Church/);
    assert.match(message.text, /Activate access/);
    assert.equal(message.text.includes("synthetic-password"), false);
    const short = validatePassword("short", "short");
    assert.equal(short.ok, false);
    const mismatch = validatePassword("synthetic-password-1", "synthetic-password-2");
    assert.equal(mismatch.ok, false);
    assert.equal(mismatch.reason, "confirm");
  });

  it("withholds member invitation acceptance before any database connection when OTP is active", async () => {
    const accepted = await acceptMemberPortalInvitation({
      async connect() {
        throw new Error("database_forbidden");
      },
    }, {
      token: "synthetic-token",
      password: "synthetic-password-1",
      otpActivation: "ACTIVE",
    });
    assert.equal(accepted.ok, false);
    assert.equal(accepted.code, "otp_required");
  });

  it("exhausts a code after the attempt limit and does not send from a login that has no binding", async () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      throw new Error("network_forbidden");
    };
    resetOtpDatabaseAttachment();
    try {
      const env = approvedQaEnv();
      const service = createOtpService({ provider: createFakeOtpProvider() });
      const started = await service.beginChallenge({
        action: "auth.login",
        productCode: "blessboard",
        channel: "email",
        organizationId: "11111111-1111-4111-8111-111111111111",
        accountId: "22222222-2222-4222-8222-222222222222",
        identifier: "qa.mailbox@pronline.org",
        accountResolved: true,
      }, env);
      assert.equal(started.server.sessionComplete, false);
      let reason = "";
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const denied = await service.verifyChallenge({
          action: "auth.login",
          attemptId: started.server.attemptId,
          code: "0000",
          productCode: "blessboard",
          organizationId: "11111111-1111-4111-8111-111111111111",
          accountId: "22222222-2222-4222-8222-222222222222",
          channel: "email",
        }, env);
        reason = denied.server.reason;
      }
      assert.equal(reason, "exhausted");
      const gate = await evaluateOtpSessionGate({
        workflow: "blessboard.member_login",
        accountResolved: true,
      }, env);
      assert.equal(gate.sessionAllowed, false);
      assert.equal(gate.sessionComplete, false);
      assert.equal(calls, 0);
    } finally {
      globalThis.fetch = original;
      resetOtpDatabaseAttachment();
    }
  });
});
