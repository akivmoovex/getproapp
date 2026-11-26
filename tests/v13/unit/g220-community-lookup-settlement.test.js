"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createMemoryCommunityStore } = require("../../../src/activeclinic/communityBenefits/memoryStore");
const service = require("../../../src/activeclinic/communityBenefits/communityBenefitsService");

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("community benefits lookup and settlement preparation", () => {
  it("searches one clinic without linking, referring, or revealing another chart", () => {
    const store = createMemoryCommunityStore();
    service.addPatient(store, { id: "p1", clinicId: A, facilityId: "fac-a", displayName: "Ada Member", phone: "0977000001", diagnosis: "private-chart-note-a" });
    service.addPatient(store, { id: "p2", clinicId: A, facilityId: "fac-a", displayName: "Ada Other", phone: "0977000001" });
    service.addPatient(store, { id: "p3", clinicId: A, facilityId: "fac-b", displayName: "Other Facility", phone: "0977000099" });
    service.addPatient(store, { id: "p4", clinicId: B, facilityId: "fac-b", displayName: "Ada Member", phone: "0977000001", diagnosis: "private-chart-note-b" });
    const one = service.searchLocalPatients(store, {
      clinicId: A, actorClinicId: A, facilityId: "fac-a", staffRole: "reception", name: "Ada Member",
    });
    assert.equal(one.outcome, "one");
    assert.equal(one.candidates[0].phoneMask, "****0001");
    assert.equal(JSON.stringify(one).includes("private-chart"), false);
    assert.equal(one.linked, false);
    assert.equal(store.links.length, 0);
    assert.equal(store.introductions.length, 0);
    const ambiguous = service.searchLocalPatients(store, {
      clinicId: A, actorClinicId: A, facilityId: "fac-a", staffRole: "reception", phone: "0977000001",
    });
    assert.equal(ambiguous.outcome, "ambiguous");
    assert.equal(ambiguous.candidates.length, 2);
    const none = service.searchLocalPatients(store, {
      clinicId: A, actorClinicId: A, facilityId: "fac-a", staffRole: "reception", name: "Missing Person",
    });
    assert.equal(none.outcome, "none");
    assert.equal(service.searchLocalPatients(store, {
      clinicId: A, actorClinicId: A, facilityId: "fac-a", staffRole: "reception", name: "A",
    }).code, "invalid_search");
    assert.equal(service.searchLocalPatients(store, {
      clinicId: B, actorClinicId: A, facilityId: "fac-a", staffRole: "reception", name: "Ada",
    }).code, "wrong_clinic");
    assert.equal(service.searchLocalPatients(store, {
      clinicId: A, actorClinicId: A, facilityId: "fac-a", staffRole: "billing", name: "Ada",
    }).code, "access_denied");
    assert.equal(store.patients.length, 4);
  });

  it("plans one pending settlement and refuses posting, including a parallel duplicate", async () => {
    const store = createMemoryCommunityStore();
    const personId = service.addPerson(store, { displayName: "Ada Member" }).person.id;
    service.requestEnrollment(store, { personId });
    service.recordConsent(store, { personId, noticeVersion: "notice-1" });
    service.verifyIdentity(store, { personId, method: "staff_document" });
    service.activateMembership(store, { personId });
    service.recordIntroduction(store, {
      personId, clinicId: A, sourceType: "platform_introduction", evidenceRef: "intro",
      noticeVersion: "notice-1", actorId: "platform", correlationId: "corr",
    });
    const agreement = service.createAgreement(store, {
      clinicId: A, model: "MODEL_B_COMMUNITY_CONTRIBUTION", contributionBps: 1000,
      eligibleServices: ["consultation"], version: 4,
    }).agreement;
    agreement.status = "ACTIVE";
    agreement.legalApproval = "approved";
    const plan = await service.planLedger(store, {
      personId, clinicId: A, agreementId: agreement.id, serviceCode: "consultation",
      amountMinor: 100000, paidMinor: 50000, idempotencyKey: "pay-1",
    });
    assert.equal(plan.plan.contributionMinor, 5000);
    assert.equal(plan.plan.agreementVersion, 4);
    const refund = await service.planRefund(store, { idempotencyKey: "pay-1" });
    assert.equal(refund.plan.contributionMinor, -5000);
    const input = {
      batchKey: "batch-a", clinicId: A, actorClinicId: A, staffRole: "reception", actorId: "staff",
    };
    const [first, second] = await Promise.all([
      service.planSettlementBatch(store, input),
      service.planSettlementBatch(store, input),
    ]);
    assert.equal([first, second].filter((row) => row.duplicate).length, 1);
    assert.equal(store.settlements.size, 1);
    assert.equal(first.batch.status, "PENDING_APPROVAL");
    assert.equal(first.batch.contributionMinor, 0);
    assert.equal(first.batch.posted, false);
    assert.equal(first.batch.agreementVersions[0].version, 4);
    assert.equal(service.commitSettlement(store).code, "posting_disabled");
    assert.equal(store.ledger.length, 0);
    assert.equal((await service.planSettlementBatch(store, { ...input, clinicId: B, actorClinicId: A })).code, "wrong_clinic");
  });
});
