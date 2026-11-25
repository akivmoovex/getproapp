"use strict";

const express = require("express");
const { createMemoryCommunityStore } = require("../../../src/activeclinic/communityBenefits/memoryStore");
const { registerCommunityBenefitsRoutes } = require("../../../src/activeclinic/communityBenefits/routes");
const service = require("../../../src/activeclinic/communityBenefits/communityBenefitsService");

const CLINIC_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLINIC_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function activate(store, personId) {
  service.requestEnrollment(store, { personId });
  service.recordConsent(store, { personId, noticeVersion: "notice-1" });
  service.verifyIdentity(store, { personId, method: "staff_document" });
  service.activateMembership(store, { personId });
}

function seed(store) {
  const walker = service.addPerson(store, { displayName: "Walk In Ada" }).person;
  activate(store, walker.id);
  service.recordWalkIn(store, { personId: walker.id, clinicId: CLINIC_A, actorId: "seed" });
  service.recordIntroduction(store, {
    personId: walker.id,
    clinicId: CLINIC_B,
    sourceType: "platform_introduction",
    evidenceRef: "seed-intro-b",
    noticeVersion: "notice-1",
    actorId: "seed",
    correlationId: "seed-b",
  });
  const walkerPass = service.issuePass(store, { personId: walker.id });

  const introduced = service.addPerson(store, { displayName: "Introduced Bea" }).person;
  activate(store, introduced.id);
  service.recordIntroduction(store, {
    personId: introduced.id,
    clinicId: CLINIC_B,
    sourceType: "platform_introduction",
    evidenceRef: "seed-intro-bea",
    noticeVersion: "notice-1",
    actorId: "seed",
    correlationId: "seed-bea",
  });
  const introducedPass = service.issuePass(store, { personId: introduced.id });

  const memberOnly = service.addPerson(store, { displayName: "Member Only" }).person;
  activate(store, memberOnly.id);
  const memberPass = service.issuePass(store, { personId: memberOnly.id });

  const suspended = service.addPerson(store, { displayName: "Suspended Sam" }).person;
  activate(store, suspended.id);
  service.recordIntroduction(store, {
    personId: suspended.id,
    clinicId: CLINIC_A,
    sourceType: "platform_introduction",
    evidenceRef: "seed-intro-sam",
    noticeVersion: "notice-1",
    actorId: "seed",
    correlationId: "seed-sam",
  });
  const suspendedPass = service.issuePass(store, { personId: suspended.id });
  service.suspendMembership(store, { personId: suspended.id });

  const expiredPerson = service.addPerson(store, { displayName: "Expired Eve" }).person;
  activate(store, expiredPerson.id);
  const expired = service.issuePass(store, { personId: expiredPerson.id, at: 1_000 });
  expired.pass.expiresAt = 1_000;

  const revokedPerson = service.addPerson(store, { displayName: "Revoked Ren" }).person;
  activate(store, revokedPerson.id);
  const revoked = service.issuePass(store, { personId: revokedPerson.id });
  service.revokePass(store, { personId: revokedPerson.id, passId: revoked.pass.id });

  service.addPatient(store, {
    id: "patient-a",
    clinicId: CLINIC_A,
    facilityId: "facility-a",
    displayName: "Walk In Ada",
    phone: "0977000001",
    diagnosis: "private-chart-note-a",
  });
  service.addPatient(store, {
    id: "patient-a-other",
    clinicId: CLINIC_A,
    facilityId: "facility-a",
    displayName: "Other Ada",
    phone: "0977000001",
    diagnosis: "private-chart-note-other",
  });

  const inactiveIntro = service.addPerson(store, { displayName: "Inactive Agreement Ian" }).person;
  activate(store, inactiveIntro.id);
  service.recordIntroduction(store, {
    personId: inactiveIntro.id,
    clinicId: CLINIC_A,
    sourceType: "platform_introduction",
    evidenceRef: "seed-intro-ian",
    noticeVersion: "notice-1",
    actorId: "seed",
    correlationId: "seed-ian",
  });
  const inactivePass = service.issuePass(store, { personId: inactiveIntro.id });
  const inactive = service.createAgreement(store, {
    clinicId: CLINIC_A,
    model: "MODEL_A_DIRECT_DISCOUNT",
    discountBps: 1000,
    eligibleServices: ["consultation"],
  }).agreement;
  const synthetic = service.createAgreement(store, {
    clinicId: CLINIC_B,
    model: "MODEL_A_DIRECT_DISCOUNT",
    discountBps: 1000,
    eligibleServices: ["consultation"],
  }).agreement;
  synthetic.status = "ACTIVE";
  synthetic.legalApproval = "approved";

  return {
    clinicA: CLINIC_A,
    clinicB: CLINIC_B,
    walkerCode: walkerPass.fallbackCode,
    introducedCode: introducedPass.fallbackCode,
    memberCode: memberPass.fallbackCode,
    suspendedCode: suspendedPass.fallbackCode,
    expiredCode: expired.fallbackCode,
    revokedCode: revoked.fallbackCode,
    patientId: "patient-a",
    inactiveCode: inactivePass.fallbackCode,
    inactiveAgreement: inactive.status,
    syntheticAgreement: "SYNTHETIC_NOT_POLICY",
  };
}

function createCommunityBenefitsTestApp() {
  const store = createMemoryCommunityStore();
  const fixtures = seed(store);
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  registerCommunityBenefitsRoutes(app, {
    env: { NODE_ENV: "test", GETPRO_AC_COMMUNITY_BENEFITS_ENABLED: "1" },
    store,
    allowTestActor: true,
    clinics: [
      { id: CLINIC_A, name: "Clinic A" },
      { id: CLINIC_B, name: "Clinic B" },
    ],
  });
  app.get("/__test/fixtures", (_req, res) => {
    res.json({ ...fixtures, ledgerCount: store.ledger.length });
  });
  app.post("/__test/reset", (_req, res) => {
    store.persons.clear();
    store.memberships.clear();
    store.plans.clear();
    store.acquisitions.length = 0;
    store.introductions.length = 0;
    store.passes.length = 0;
    store.links.length = 0;
    store.patients.length = 0;
    store.charts.length = 0;
    store.agreements.length = 0;
    store.audits.length = 0;
    store.ledger.length = 0;
    Object.assign(fixtures, seed(store));
    res.json({ ok: true });
  });
  return { app };
}

if (require.main === module) {
  const port = Number(process.env.PORT || 4191);
  const { app } = createCommunityBenefitsTestApp();
  app.listen(port, "127.0.0.1");
}

module.exports = { createCommunityBenefitsTestApp, CLINIC_A, CLINIC_B };
