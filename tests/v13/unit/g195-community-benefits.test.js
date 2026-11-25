"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createMemoryCommunityStore } = require("../../../src/activeclinic/communityBenefits/memoryStore");
const { calculateBenefit } = require("../../../src/activeclinic/communityBenefits/money");
const { communityBenefitsEnabled, financialPostingEnabled } = require("../../../src/activeclinic/communityBenefits/flags");
const service = require("../../../src/activeclinic/communityBenefits/communityBenefitsService");
const { buildActiveClinicNavigation } = require("../../../src/activeclinic/services/activeClinicNavigation");

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function setup() {
  const store = createMemoryCommunityStore();
  const created = service.addPerson(store, { displayName: "Ada Member" });
  return { store, personId: created.person.id };
}

function activate(store, personId) {
  service.requestEnrollment(store, { personId });
  service.recordConsent(store, { personId, noticeVersion: "notice-1" });
  service.verifyIdentity(store, { personId, method: "staff_document" });
  return service.activateMembership(store, { personId });
}

describe("community benefits attribution and eligibility", () => {
  it("keeps a platform introduction eligible for repeat visits and does not convert a walk-in", () => {
    const { store, personId } = setup();
    activate(store, personId);
    const intro = service.recordIntroduction(store, {
      personId,
      clinicId: A,
      sourceType: "platform_introduction",
      evidenceRef: "intro-a",
      noticeVersion: "notice-1",
      actorId: "system",
      correlationId: "corr-1",
    });
    assert.equal(intro.acquisition.state, "PLATFORM_INTRODUCED");
    const agreement = service.createAgreement(store, {
      clinicId: A,
      model: "MODEL_A_DIRECT_DISCOUNT",
      discountBps: 1000,
      eligibleServices: ["consultation"],
    }).agreement;
    agreement.status = "ACTIVE";
    const first = service.decideEligibility(store, { personId, clinicId: A, agreementId: agreement.id, serviceCode: "consultation" });
    const repeat = service.decideEligibility(store, { personId, clinicId: A, agreementId: agreement.id, serviceCode: "consultation" });
    assert.equal(first.decision, "ELIGIBLE");
    assert.equal(repeat.decision, "ELIGIBLE");
    assert.equal(repeat.reason, "introduced_repeat");

    const walker = service.addPerson(store, { displayName: "Walk In" }).person.id;
    activate(store, walker);
    service.recordStaffRegistration(store, { personId: walker, clinicId: A, actorId: "staff" });
    service.recordWalkIn(store, { personId: walker, clinicId: A, actorId: "staff" });
    const walk = service.decideEligibility(store, { personId: walker, clinicId: A, agreementId: agreement.id, serviceCode: "consultation" });
    assert.equal(walk.decision, "NOT_ELIGIBLE");
    assert.equal(walk.reason, "walk_in_no_introduction");
    const later = service.recordIntroduction(store, {
      personId: walker,
      clinicId: B,
      sourceType: "platform_introduction",
      evidenceRef: "intro-b",
      noticeVersion: "notice-1",
      actorId: "system",
      correlationId: "corr-2",
    });
    assert.equal(later.acquisition.state, "PLATFORM_INTRODUCED");
    assert.equal(service.currentAcquisition(store, walker, A).state, "CLINIC_DIRECT");
    const agreementB = service.createAgreement(store, {
      clinicId: B,
      model: "MODEL_A_DIRECT_DISCOUNT",
      discountBps: 1000,
      eligibleServices: ["consultation"],
    }).agreement;
    agreementB.status = "ACTIVE";
    assert.equal(service.decideEligibility(store, {
      personId: walker, clinicId: B, agreementId: agreementB.id, serviceCode: "consultation",
    }).decision, "ELIGIBLE");
    assert.equal(service.decideEligibility(store, {
      personId: walker, clinicId: A, agreementId: agreement.id, serviceCode: "consultation",
    }).reason, "walk_in_no_introduction");

    const retro = service.recordIntroduction(store, {
      personId: walker,
      clinicId: A,
      sourceType: "platform_introduction",
      evidenceRef: "intro-a-late",
      noticeVersion: "notice-1",
      actorId: "system",
      correlationId: "corr-3",
    });
    assert.equal(retro.converted, false);
    assert.equal(service.currentAcquisition(store, walker, A).state, "CLINIC_DIRECT");
  });

  it("rejects forged, duplicate, suspended, excluded, stale, and cross-clinic paths", () => {
    const { store, personId } = setup();
    activate(store, personId);
    assert.equal(service.recordIntroduction(store, {
      personId,
      clinicId: A,
      sourceType: "claimed_referral",
      evidenceRef: "bad",
      noticeVersion: "notice-1",
      actorId: "stranger",
      correlationId: "corr",
    }).code, "forged_referral");
    service.recordIntroduction(store, {
      personId,
      clinicId: C,
      sourceType: "platform_introduction",
      evidenceRef: "intro-c",
      noticeVersion: "notice-1",
      actorId: "system",
      correlationId: "corr-c",
    });
    const again = service.recordIntroduction(store, {
      personId,
      clinicId: C,
      sourceType: "platform_introduction",
      evidenceRef: "intro-c",
      noticeVersion: "notice-1",
      actorId: "system",
      correlationId: "corr-c2",
    });
    assert.equal(again.duplicate, true);
    assert.equal(store.introductions.length, 1);
    const agreement = service.createAgreement(store, {
      clinicId: C,
      model: "MODEL_A_DIRECT_DISCOUNT",
      discountBps: 1000,
      eligibleServices: ["consultation"],
      exclusions: ["cosmetic"],
      version: 2,
    }).agreement;
    agreement.status = "ACTIVE";
    assert.equal(service.decideEligibility(store, {
      personId, clinicId: C, agreementId: agreement.id, serviceCode: "cosmetic",
    }).reason, "service_excluded");
    assert.equal(service.decideEligibility(store, {
      personId, clinicId: C, agreementId: agreement.id, serviceCode: "consultation", policyVersion: 1,
    }).reason, "stale_policy");
    agreement.effectiveTo = 1;
    assert.equal(service.decideEligibility(store, {
      personId, clinicId: C, agreementId: agreement.id, serviceCode: "consultation", policyVersion: 2, at: 5,
    }).reason, "agreement_expired");
    service.suspendMembership(store, { personId });
    assert.equal(service.decideEligibility(store, {
      personId, clinicId: C, agreementId: agreement.id, serviceCode: "consultation",
    }).reason, "membership_blocked");
    assert.equal(store.memberships.get(`${service.PROGRAM_ID}:${personId}`).history.length > 1, true);

    service.addPatient(store, { id: "patient-a", clinicId: A, facilityId: "fac-a", displayName: "Ada", diagnosis: "Clinic A private note" });
    assert.equal(service.readChart(store, { actorClinicId: B, clinicId: A, patientId: "patient-a" }).code, "cross_clinic_chart");
    assert.equal(service.readChart(store, { actorClinicId: A, clinicId: A, patientId: "patient-a" }).chart.diagnosis, "Clinic A private note");
  });

  it("does not activate membership without consent and keeps one membership", () => {
    const { store, personId } = setup();
    const first = service.requestEnrollment(store, { personId });
    assert.equal(first.membership.status, "pending_consent");
    assert.equal(service.activateMembership(store, { personId }).code, "consent_or_identity_pending");
    assert.equal(service.verifyIdentity(store, { personId, method: "qr_scan" }).code, "verification_method_rejected");
    service.recordConsent(store, { personId, noticeVersion: "notice-1" });
    service.verifyIdentity(store, { personId, method: "staff_document" });
    assert.equal(service.activateMembership(store, { personId }).membership.status, "active");
    const second = service.requestEnrollment(store, { personId });
    assert.equal(second.duplicate, true);
    assert.equal(store.memberships.size, 1);
    const duplicate = service.addPerson(store, { displayName: "Ada Two" }).person.id;
    service.flagDuplicate(store, { personId: duplicate });
    assert.equal(service.decideEligibility(store, { personId: duplicate, clinicId: A }).decision, "REVIEW_REQUIRED");
  });

  it("treats a QR presentation as identity only and rotates or revokes it", () => {
    const { store, personId } = setup();
    activate(store, personId);
    const issued = service.issuePass(store, { personId, at: 1_000 });
    const presented = service.presentPass(store, { token: issued.token, clinicId: A, at: 1_000 });
    assert.equal(presented.ok, true);
    assert.equal(presented.presentation.displayName, "Ada Member");
    assert.equal(store.introductions.length, 0);
    assert.equal(store.links.length, 0);
    assert.equal(JSON.stringify(presented).includes("diagnosis"), false);
    const rotated = service.rotatePass(store, { personId, at: 2_000 });
    assert.equal(service.presentPass(store, { token: issued.token, at: 2_000 }).code, "revoked_pass");
    assert.equal(service.presentPass(store, { token: rotated.token, at: 2_000 }).ok, true);
    service.revokePass(store, { personId, passId: rotated.pass.id, at: 3_000 });
    assert.equal(service.presentPass(store, { fallbackCode: rotated.fallbackCode, at: 3_000 }).code, "revoked_pass");
    const fresh = service.issuePass(store, { personId, at: 4_000 });
    fresh.pass.expiresAt = 4_000;
    assert.equal(service.presentPass(store, { token: fresh.token, at: 4_000 }).code, "expired_pass");
    const logged = JSON.stringify(store.audits);
    assert.equal(logged.includes(issued.token), false);
  });

  it("links one confirmed local chart and refuses the phone-only and cross-clinic cases", async () => {
    const { store, personId } = setup();
    service.addPatient(store, { id: "p1", clinicId: A, facilityId: "fac-a", displayName: "Ada", phone: "0977000001" });
    service.addPatient(store, { id: "p2", clinicId: A, facilityId: "fac-a", displayName: "Ada Other", phone: "0977000001" });
    service.addPatient(store, { id: "p3", clinicId: B, facilityId: "fac-b", displayName: "Ada", phone: "0977000001", diagnosis: "Clinic B private note" });
    const review = await service.linkMember(store, {
      clinicId: A,
      actorClinicId: A,
      personId,
      staffRole: "reception",
      confirmed: true,
      actorId: "staff-1",
      phone: "0977000001",
    });
    assert.equal(review.code, "review_required");
    assert.equal(store.links.length, 0);
    const denied = await service.linkMember(store, {
      clinicId: A,
      actorClinicId: B,
      personId,
      patientId: "p1",
      staffRole: "reception",
      confirmed: true,
      actorId: "staff-b",
    });
    assert.equal(denied.code, "wrong_clinic");
    const [first, second] = await Promise.all([
      service.linkMember(store, {
        clinicId: A, actorClinicId: A, facilityId: "fac-a", personId, patientId: "p1",
        staffRole: "reception", confirmed: true, actorId: "staff-1",
      }),
      service.linkMember(store, {
        clinicId: A, actorClinicId: A, facilityId: "fac-a", personId, patientId: "p1",
        staffRole: "reception", confirmed: true, actorId: "staff-2",
      }),
    ]);
    const wins = [first, second].filter((row) => row.ok);
    assert.equal(wins.length, 1);
    assert.equal(store.links.length, 1);
    assert.equal(service.readChart(store, { actorClinicId: A, clinicId: B, patientId: "p3" }).code, "cross_clinic_chart");
  });

  it("calculates synthetic ZMW models without posting or inventing savings", () => {
    const modelA = calculateBenefit({ model: "MODEL_A_DIRECT_DISCOUNT", amountMinor: 100000, discountBps: 1000 });
    assert.equal(modelA.discountMinor, 10000);
    assert.equal(modelA.payableMinor, 90000);
    assert.equal(modelA.patientSavingsMinor, 10000);
    const modelB = calculateBenefit({ model: "MODEL_B_COMMUNITY_CONTRIBUTION", amountMinor: 100000, contributionBps: 1000 });
    assert.equal(modelB.discountMinor, 0);
    assert.equal(modelB.payableMinor, 100000);
    assert.equal(modelB.contributionMinor, 10000);
    assert.equal(modelB.patientSavingsMinor, 0);
    const modelC = calculateBenefit({
      model: "MODEL_C_HYBRID", amountMinor: 100000, discountBps: 500, contributionBps: 1000,
    });
    assert.equal(modelC.discountMinor, 5000);
    assert.equal(modelC.contributionMinor, 9500);

    const { store, personId } = setup();
    activate(store, personId);
    service.recordIntroduction(store, {
      personId, clinicId: A, sourceType: "platform_introduction", evidenceRef: "e",
      noticeVersion: "notice-1", actorId: "system", correlationId: "c",
    });
    const agreement = service.createAgreement(store, {
      clinicId: A, model: "MODEL_A_DIRECT_DISCOUNT", discountBps: 1000, eligibleServices: ["consultation"],
    }).agreement;
    const inactive = service.previewInvoice(store, {
      personId, clinicId: A, agreementId: agreement.id, serviceCode: "consultation", amountMinor: 100000,
    });
    assert.equal(inactive.patientSavingsMinor, 0);
    assert.equal(inactive.disclosure, "No community discount is applied.");
    assert.equal(inactive.posted, false);
    agreement.status = "ACTIVE";
    const active = service.previewInvoice(store, {
      personId, clinicId: A, agreementId: agreement.id, serviceCode: "consultation", amountMinor: 100000,
    });
    assert.equal(active.patientSavingsMinor, 10000);
    const modelBAgreement = service.createAgreement(store, {
      clinicId: A, model: "MODEL_B_COMMUNITY_CONTRIBUTION", contributionBps: 1000, eligibleServices: ["consultation"],
    }).agreement;
    modelBAgreement.status = "ACTIVE";
    const contribution = service.planLedger(store, {
      personId, clinicId: A, agreementId: modelBAgreement.id, serviceCode: "consultation",
      amountMinor: 100000, paidMinor: 50000, idempotencyKey: "pay-b",
    });
    assert.equal(contribution.plan.contributionMinor, 5000);
    const contributionAgain = service.planLedger(store, {
      personId, clinicId: A, agreementId: modelBAgreement.id, serviceCode: "consultation",
      amountMinor: 100000, paidMinor: 50000, idempotencyKey: "pay-b",
    });
    assert.equal(contributionAgain.duplicate, true);
    assert.equal(service.planRefund(store, { idempotencyKey: "pay-b" }).plan.contributionMinor, -5000);
    const plan = service.planLedger(store, {
      personId, clinicId: A, agreementId: agreement.id, serviceCode: "consultation",
      amountMinor: 100000, paidMinor: 50000, idempotencyKey: "pay-1",
    });
    const repeat = service.planLedger(store, {
      personId, clinicId: A, agreementId: agreement.id, serviceCode: "consultation",
      amountMinor: 100000, paidMinor: 50000, idempotencyKey: "pay-1",
    });
    assert.equal(plan.plan.contributionMinor, 0);
    assert.equal(repeat.duplicate, true);
    const refund = service.planRefund(store, { idempotencyKey: "pay-1" });
    assert.equal(refund.plan.contributionMinor, 0);
    const commit = service.commitLedger(store, { idempotencyKey: "pay-1" });
    assert.equal(commit.code, "posting_disabled");
    assert.equal(store.ledger.length, 0);
    assert.equal(financialPostingEnabled(), false);
    assert.equal(communityBenefitsEnabled({ GETPRO_AC_COMMUNITY_BENEFITS_ENABLED: "1", NODE_ENV: "production", DEPLOYMENT_ENV: "production" }), false);
    const nav = buildActiveClinicNavigation(["activeclinic.reception.view"], null, {
      env: { NODE_ENV: "test" },
    });
    assert.equal(nav.items.some((item) => item.key === "community_check_in"), false);
    const shown = buildActiveClinicNavigation(["activeclinic.reception.view"], "community_check_in", {
      env: { GETPRO_AC_COMMUNITY_BENEFITS_ENABLED: "1", NODE_ENV: "test" },
    });
    assert.equal(shown.items.some((item) => item.href === "/app/reception/community-check-in"), true);
  });
});
