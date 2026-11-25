"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("http");
const { createMemoryCommunityStore } = require("../../../src/activeclinic/communityBenefits/memoryStore");
const service = require("../../../src/activeclinic/communityBenefits/communityBenefitsService");
const { registerCommunityBenefitsRoutes } = require("../../../src/activeclinic/communityBenefits/routes");

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function setup(name) {
  const store = createMemoryCommunityStore();
  const personId = service.addPerson(store, { displayName: name || "Ada Member" }).person.id;
  service.requestEnrollment(store, { personId });
  service.recordConsent(store, { personId, noticeVersion: "notice-1" });
  service.verifyIdentity(store, { personId, method: "staff_document" });
  service.activateMembership(store, { personId });
  return { store, personId };
}

function introduce(store, personId, clinicId, evidenceRef) {
  return service.recordIntroduction(store, {
    personId,
    clinicId,
    sourceType: "platform_introduction",
    evidenceRef,
    noticeVersion: "notice-1",
    actorId: "platform",
    correlationId: evidenceRef,
  });
}

function approve(store, clinicId, version) {
  const agreement = service.createAgreement(store, {
    clinicId,
    model: "MODEL_A_DIRECT_DISCOUNT",
    discountBps: 1000,
    eligibleServices: ["consultation"],
    version: version || 1,
  }).agreement;
  agreement.status = "ACTIVE";
  agreement.legalApproval = "approved";
  return agreement;
}

describe("community benefits independent hardening", () => {
  it("keeps clinic A, B, and C attribution separate across walk-in, enrollment, exit, and repeat visits", () => {
    const introduced = setup("Introduced Ada");
    const walkIn = setup("Walk Ada");
    introduce(introduced.store, introduced.personId, A, "intro-a");
    const agreementA = approve(introduced.store, A, 1);
    assert.equal(service.decideEligibility(introduced.store, {
      personId: introduced.personId, clinicId: A, agreementId: agreementA.id, serviceCode: "consultation",
    }).reason, "introduced_repeat");
    assert.equal(service.decideEligibility(introduced.store, {
      personId: introduced.personId, clinicId: A, agreementId: agreementA.id, serviceCode: "consultation",
    }).reason, "introduced_repeat");

    service.recordWalkIn(walkIn.store, { personId: walkIn.personId, clinicId: A, actorId: "desk" });
    service.requestEnrollment(walkIn.store, { personId: walkIn.personId });
    const walkAgreement = approve(walkIn.store, A, 1);
    assert.equal(service.decideEligibility(walkIn.store, {
      personId: walkIn.personId, clinicId: A, agreementId: walkAgreement.id, serviceCode: "consultation",
    }).reason, "walk_in_no_introduction");

    introduce(walkIn.store, walkIn.personId, B, "intro-b");
    const agreementB = approve(walkIn.store, B, 1);
    assert.equal(service.decideEligibility(walkIn.store, {
      personId: walkIn.personId, clinicId: B, agreementId: agreementB.id, serviceCode: "consultation",
    }).decision, "ELIGIBLE");
    assert.equal(service.decideEligibility(walkIn.store, {
      personId: walkIn.personId, clinicId: A, agreementId: walkAgreement.id, serviceCode: "consultation",
    }).reason, "walk_in_no_introduction");

    introduce(walkIn.store, walkIn.personId, C, "intro-c");
    const agreementC = approve(walkIn.store, C, 1);
    assert.equal(service.decideEligibility(walkIn.store, {
      personId: walkIn.personId, clinicId: C, agreementId: agreementC.id, serviceCode: "consultation",
    }).decision, "ELIGIBLE");
    assert.equal(service.currentAcquisition(walkIn.store, walkIn.personId, A).state, "CLINIC_DIRECT");

    const pass = service.issuePass(walkIn.store, { personId: walkIn.personId });
    const before = walkIn.store.introductions.length;
    assert.equal(service.presentPass(walkIn.store, { token: pass.token, clinicId: C }).ok, true);
    assert.equal(service.presentPass(walkIn.store, { token: pass.token, clinicId: C }).ok, true);
    assert.equal(walkIn.store.introductions.length, before);
    assert.equal(walkIn.store.ledger.length, 0);

    const exit = service.recordClinicExit(walkIn.store, { personId: walkIn.personId, clinicId: C, actorId: "desk" });
    assert.equal(exit.history.length > 1, true);
    assert.equal(service.decideEligibility(walkIn.store, {
      personId: walkIn.personId, clinicId: C, agreementId: agreementC.id, serviceCode: "consultation",
    }).reason, "clinic_exit");
    assert.equal(walkIn.store.introductions.some((row) => row.evidenceRef === "intro-c"), true);
    const again = introduce(walkIn.store, walkIn.personId, C, "intro-c-return");
    assert.equal(again.reopened, true);
    assert.equal(service.decideEligibility(walkIn.store, {
      personId: walkIn.personId, clinicId: C, agreementId: agreementC.id, serviceCode: "consultation",
    }).decision, "ELIGIBLE");
  });

  it("refuses an unapproved, unstarted, or unsupported agreement and keeps one plan under parallel calls", async () => {
    const { store, personId } = setup();
    introduce(store, personId, A, "intro-policy");
    const draft = service.createAgreement(store, {
      clinicId: A, model: "MODEL_A_DIRECT_DISCOUNT", discountBps: 1000, eligibleServices: ["consultation"],
    }).agreement;
    draft.status = "ACTIVE";
    assert.equal(draft.legalApproval, "unapproved");
    assert.equal(service.decideEligibility(store, {
      personId, clinicId: A, agreementId: draft.id, serviceCode: "consultation",
    }).reason, "agreement_inactive");
    assert.equal(service.previewInvoice(store, {
      personId, clinicId: A, agreementId: draft.id, serviceCode: "consultation", amountMinor: 100000,
    }).patientSavingsMinor, 0);
    draft.legalApproval = "approved";
    draft.effectiveFrom = 5_000;
    assert.equal(service.decideEligibility(store, {
      personId, clinicId: A, agreementId: draft.id, serviceCode: "consultation", at: 1_000,
    }).reason, "agreement_not_started");
    draft.effectiveFrom = null;
    draft.model = "FREE_MONEY";
    assert.equal(service.previewInvoice(store, {
      personId, clinicId: A, agreementId: draft.id, serviceCode: "consultation", amountMinor: 100000,
    }).code, "unsupported_model");
    draft.model = "MODEL_A_DIRECT_DISCOUNT";
    const older = service.createAgreement(store, {
      clinicId: A, model: "MODEL_A_DIRECT_DISCOUNT", discountBps: 1000, eligibleServices: ["consultation"], version: 1,
    }).agreement;
    const newer = approve(store, A, 3);
    assert.equal(service.selectAgreementForClinic(store, A).id, newer.id);
    assert.notEqual(older.id, newer.id);
    service.suspendMembership(store, { personId });
    assert.equal(service.issuePass(store, { personId }).code, "membership_blocked");
    service.activateMembership(store, { personId });
    const [first, second] = await Promise.all([
      service.planLedger(store, {
        personId, clinicId: A, agreementId: newer.id, serviceCode: "consultation",
        amountMinor: 100000, idempotencyKey: "parallel-1",
      }),
      service.planLedger(store, {
        personId, clinicId: A, agreementId: newer.id, serviceCode: "consultation",
        amountMinor: 100000, idempotencyKey: "parallel-1",
      }),
    ]);
    assert.equal([first, second].filter((row) => row.duplicate).length, 1);
    assert.equal(store.plans.size, 1);
    assert.equal(service.commitLedger(store, { idempotencyKey: "parallel-1" }).code, "posting_disabled");
    assert.equal(store.ledger.length, 0);
  });

  it("requires a matching actor for a pass and a reception role for check-in", async () => {
    const store = createMemoryCommunityStore();
    const person = service.addPerson(store, { displayName: "Ada Member" }).person;
    service.requestEnrollment(store, { personId: person.id });
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    registerCommunityBenefitsRoutes(app, {
      env: { NODE_ENV: "test", GETPRO_AC_COMMUNITY_BENEFITS_ENABLED: "1" },
      store,
      allowTestActor: true,
      clinics: [{ id: A, name: "Clinic A" }],
    });
    const server = await new Promise((resolve) => {
      const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
    });
    function request(method, path, { body, headers } = {}) {
      const { port } = server.address();
      return new Promise((resolve, reject) => {
        const req = http.request({
          hostname: "127.0.0.1", port, path, method,
          headers: { "content-type": "application/x-www-form-urlencoded", ...(headers || {}) },
        }, (res) => {
          const chunks = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
        });
        req.on("error", reject);
        if (body) req.write(body);
        req.end();
      });
    }
    const hidden = await request("GET", `/app/community/pass?person=${person.id}`);
    assert.equal(hidden.status, 401);
    const stranger = JSON.stringify({ staffId: "member-2", role: "member", personId: "someone-else" });
    const denied = await request("POST", "/app/community/pass", {
      headers: { "x-community-test-actor": stranger },
      body: "csrf=missing&person_id=" + person.id,
    });
    assert.equal(denied.status, 403);
    assert.equal(store.passes.length, 0);
    const billing = JSON.stringify({ staffId: "bill", role: "billing", clinicId: A, clinicName: "Clinic A" });
    const desk = await request("GET", "/app/reception/community-check-in", {
      headers: { "x-community-test-actor": billing },
    });
    assert.equal(desk.status, 401);
    const enroll = await request("POST", "/app/community/enroll", { body: "display_name=Ada" });
    assert.equal(enroll.status, 403);
    assert.equal(store.persons.size, 1);
    server.close();
  });
});
