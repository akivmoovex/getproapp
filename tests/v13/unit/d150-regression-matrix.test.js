"use strict";

/**
 * D150 regression matrix. These tests call the current rules and services.
 * They do not open PostgreSQL, start a server, or send email.
 * Historical IDs: BB-04, BB-05, D25, D111, D120, D129, G224, G229, G266, G300, AC-PUB-01, CB-POSTING.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createOtpService } = require("../../../src/platform/otp/otpService");
const { createFakeOtpProvider, resolveOtpProvider } = require("../../../src/platform/otp/otpProviders");
const { resolveOtpActivation } = require("../../../src/platform/otp/otpActivation");
const { issueCsrfToken, validateCsrf } = require("../../../src/platform/http/v5Csrf");
const {
  evaluateQaLiveDelivery,
  QA_SENDER_EMAIL,
} = require("../../../src/platform/otp/otpQaLiveDelivery");
const { createResendOtpEmailTransport } = require("../../../src/platform/email/resendOtpTransport");
const { resolveProductSender } = require("../../../src/platform/email/resendSenderCatalog");
const {
  canAttachLaboratoryResult,
  canAttachRadiologyReport,
  laboratoryQueueTabs,
  radiologyQueueTabs,
  laboratoryDashboardStats,
  radiologyDashboardStats,
} = require("../../../src/activeclinic/services/clinicalOperationsRules");
const {
  BLOCKING_APPOINTMENT_STATUSES,
  intervalsOverlap,
  isBlockingAppointmentStatus,
  evaluateSlotCapacity,
  classifyIdempotentRetry,
  staffOverlapApplies,
} = require("../../../src/activeclinic/services/appointmentSchedulingRules");
const { buildSermonFields } = require("../../../src/blessboard/services/publicContentAdminService");
const { assertIsolatedConnectionTarget } = require("../helpers/v13IsolatedExecutionPlan");
const community = require("../../../src/activeclinic/communityBenefits/communityBenefitsService");
const { createMemoryCommunityStore } = require("../../../src/activeclinic/communityBenefits/memoryStore");
const { financialPostingEnabled } = require("../../../src/activeclinic/communityBenefits/flags");
const {
  approvedQaEnv,
  authorizedProbe,
  createMockDurableBudget,
  postgresqlObservation,
  jsonResponse,
  RECIPIENT,
  KEY,
  PEPPER,
} = require("../helpers/qaDeliveryFixture");

const ROOT = path.join(__dirname, "../../..");
const ORG = "11111111-1111-4111-8111-111111111111";
const ACCOUNT = "22222222-2222-4222-8222-222222222222";
const CLINIC_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CLINIC_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function otpEnv() {
  return approvedQaEnv();
}

function loginInput(extra) {
  return {
    action: "auth.login",
    productCode: "blessboard",
    channel: "email",
    organizationId: ORG,
    accountId: ACCOUNT,
    identifier: RECIPIENT,
    accountResolved: true,
    ...(extra || {}),
  };
}

describe("D150 P0 OTP, CSRF, isolation, and appointment rules", () => {
  it("BB-05 rejects a missing or forged CSRF token and accepts only the issued pair", () => {
    const env = { NODE_ENV: "test", SESSION_SECRET: "d150-csrf-secret-32-characters!!" };
    const token = issueCsrfToken(env);
    const shell = read("src/blessboard/http/hqAdminShellLocals.js");
    const stripped = shell.indexOf("delete extra.csrfToken");
    const assigned = shell.indexOf("csrfToken,", stripped);
    assert.ok(stripped > 0);
    assert.ok(assigned > stripped);
    assert.match(shell, /delete extra\.csrfField/);
    const req = { platform: { csrfCookieName: "d150_csrf" }, cookies: { d150_csrf: token } };
    assert.equal(validateCsrf(req, token, env), true);
    assert.equal(validateCsrf(req, "", env), false);
    assert.equal(validateCsrf({ ...req, cookies: {} }, token, env), false);
    assert.equal(validateCsrf(req, issueCsrfToken(env), env), false);
  });

  it("keeps production OTP blocked and does not treat a caller attestation as identity", async () => {
    const production = approvedQaEnv({ NODE_ENV: "production", GETPRO_OTP_ACTIVATION: "ACTIVE" });
    assert.equal(resolveOtpActivation(production).status, "BLOCKED");
    assert.equal(resolveOtpProvider({ NODE_ENV: "production", GETPRO_OTP_PROVIDER: "fake" }).name, "inactive");
    let probes = 0;
    const decision = await evaluateQaLiveDelivery(production, {
      productCode: "blessboard",
      purpose: "login",
      destination: RECIPIENT,
      attemptBudgetStore: createMockDurableBudget(),
      databaseIdentity: postgresqlObservation({ nonce: "forged" }),
      databaseIdentityProbe: async () => {
        probes += 1;
        return { ok: true };
      },
    });
    assert.equal(decision.authorized, false);
    assert.ok(decision.reasons.includes("production_environment"));
    assert.equal(probes, 0);
  });

  it("allows only the BlessBoard QA sender and one exact recipient", async () => {
    const sender = resolveProductSender("blessboard", approvedQaEnv());
    assert.equal(sender.sender.email, QA_SENDER_EMAIL);
    assert.notEqual(resolveProductSender("activeclinic", approvedQaEnv()).sender.email, QA_SENDER_EMAIL);
    const many = await evaluateQaLiveDelivery(
      approvedQaEnv({ GETPRO_RESEND_QA_RECIPIENTS: "one@pronline.org,two@pronline.org" }),
      { productCode: "blessboard", purpose: "login", destination: RECIPIENT }
    );
    assert.ok(many.reasons.includes("qa_recipient_allowlist_rejected"));
    const stranger = await evaluateQaLiveDelivery(approvedQaEnv(), {
      productCode: "blessboard",
      purpose: "login",
      destination: "other@pronline.org",
      attemptBudgetStore: createMockDurableBudget(),
      databaseIdentityProbe: authorizedProbe(),
    });
    assert.equal(stranger.authorized, false);
    assert.ok(stranger.reasons.includes("qa_recipient_not_allowlisted"));
  });

  it("withholds the session, rejects replay and expiry, and does not fetch for recovery", async () => {
    let now = Date.parse("2026-11-27T00:00:00.000Z");
    const service = createOtpService({
      clock: () => now,
      provider: createFakeOtpProvider(),
    });
    const env = otpEnv();
    const started = await service.beginChallenge(loginInput(), env);
    assert.equal(started.server.sessionComplete, false);
    const attemptId = started.server.attemptId;
    const binding = {
      action: "auth.login",
      productCode: "blessboard",
      channel: "email",
      organizationId: ORG,
      accountId: ACCOUNT,
      attemptId,
    };
    const verified = await service.verifyChallenge({ ...binding, code: "1234" }, env);
    assert.equal(verified.server.reason, "verified");
    assert.equal(verified.server.sessionComplete, false);
    const replay = await service.verifyChallenge({ ...binding, code: "1234" }, env);
    assert.equal(replay.server.reason, "replay");
    const completed = await service.completeProtectedAction(verified, "auth.login");
    assert.equal(completed.sessionComplete, true);

    const expiring = createOtpService({ clock: () => now, provider: createFakeOtpProvider() });
    const second = await expiring.beginChallenge(
      loginInput({ accountId: "33333333-3333-4333-8333-333333333333" }),
      env
    );
    now += 6 * 60 * 1000;
    const expired = await expiring.verifyChallenge(
      { ...binding, accountId: "33333333-3333-4333-8333-333333333333", attemptId: second.server.attemptId, code: "1234" },
      env
    );
    assert.equal(expired.server.reason, "expired");
    assert.equal(expired.server.sessionComplete, false);

    let fetches = 0;
    const transport = createResendOtpEmailTransport(approvedQaEnv(), {
      fetchImpl: async () => {
        fetches += 1;
        return jsonResponse(200, { id: "should-not-send" });
      },
      databaseIdentityProbe: authorizedProbe(),
      attemptBudgetStore: createMockDurableBudget(),
    });
    const recovery = await transport({
      productCode: "blessboard",
      purpose: "password_recovery",
      destination: RECIPIENT,
      text: "Your verification code is 135790. It expires in 5 minutes.",
      idempotencyKey: "d150-recovery",
    });
    assert.equal(recovery.ok, false);
    assert.equal(recovery.reason, "unauthorized_purpose");
    assert.equal(fetches, 0);
    assert.equal(JSON.stringify(recovery).includes(KEY), false);
    assert.equal(JSON.stringify(recovery).includes(PEPPER), false);
  });

  it("refuses the shared PostgreSQL port and a database outside the approved pair", () => {
    assert.throws(
      () => assertIsolatedConnectionTarget("postgresql://v13_regression_213101:secret@127.0.0.1:5432/getpro_v13_e2e_regression213101"),
      /5432/
    );
    assert.throws(
      () => assertIsolatedConnectionTarget("postgresql://v13_regression_213101:secret@127.0.0.1:55432/postgres"),
      /database must be/
    );
    const otp = assertIsolatedConnectionTarget(
      "postgresql://v13_regression_213101:secret@127.0.0.1:55432/getpro_v13_e2e_otpqa135",
      { expectedDatabaseName: "getpro_v13_e2e_otpqa135" }
    );
    assert.equal(otp.host, "127.0.0.1");
    assert.equal(otp.port, "55432");
    assert.equal(JSON.stringify(otp).includes("secret"), false);
  });

  it("D120 checks facility scope before an appointment insert", () => {
    const service = read("src/activeclinic/services/activeClinicAppointmentService.js");
    const start = service.indexOf("async function createAppointment(");
    const body = service.slice(start, service.indexOf("\nasync function listAppointments", start));
    assert.ok(body.indexOf("resolveFacilityScope") < body.indexOf("repo.insertAppointment"));
    assert.match(read("src/activeclinic/services/activeClinicAuthorizationService.js"), /facility_assignment_required/);
  });

  it("D25 and D129 block assigned-staff overlap without inventing slot capacity", () => {
    const start = Date.parse("2026-12-01T09:00:00.000Z");
    const end = start + 30 * 60 * 1000;
    assert.equal(intervalsOverlap(start, end, start + 15 * 60 * 1000, end + 15 * 60 * 1000), true);
    assert.equal(intervalsOverlap(start, end, end, end + 30 * 60 * 1000), false);
    assert.equal(isBlockingAppointmentStatus("confirmed"), true);
    assert.equal(isBlockingAppointmentStatus("cancelled"), false);
    assert.equal(isBlockingAppointmentStatus("completed"), false);
    assert.equal(isBlockingAppointmentStatus("no_show"), false);
    assert.equal(staffOverlapApplies(""), false);
    assert.equal(staffOverlapApplies("staff-1"), true);
    assert.deepEqual(evaluateSlotCapacity(), {
      ok: false,
      code: "BLOCKED_APPROVAL_REQUIRED",
      capacity: null,
      reason: "slot_capacity_not_approved",
    });
    assert.equal(classifyIdempotentRetry({ id: "existing" }).duplicate, true);
    assert.equal(classifyIdempotentRetry(null).duplicate, false);
    assert.ok(BLOCKING_APPOINTMENT_STATUSES.includes("requested"));
    const lock = read("src/activeclinic/services/activeClinicAppointmentService.js");
    assert.match(lock, /pg_advisory_xact_lock\(hashtext\(\$1\)\)/);
    assert.match(lock, /await client\.query\("ROLLBACK"\)/);
  });
});

describe("D150 P1 clinical, sermon, and member rules", () => {
  it("G224 keeps lab counters equal to the filtered records and gates result entry", () => {
    const counts = {
      pending_collection: 1,
      collected: 2,
      received: 3,
      processing: 4,
      resulted: 5,
      verified: 6,
      total: 21,
    };
    const tabs = laboratoryQueueTabs(counts, "received");
    const received = tabs.find((tab) => tab.key === "received");
    const open = tabs.find((tab) => tab.key === "open");
    assert.equal(received.count, 3);
    assert.equal(received.active, true);
    assert.equal(open.count, 10);
    assert.equal(laboratoryDashboardStats(counts).received, received.count);
    assert.equal(canAttachLaboratoryResult("received"), true);
    assert.equal(canAttachLaboratoryResult("verified"), false);
    assert.equal(canAttachLaboratoryResult("resulted"), false);
  });

  it("G229 keeps radiology counters equal to the filtered records and gates reports", () => {
    const counts = { pending: 2, in_progress: 3, completed: 4, reported: 5, verified: 6, total: 20 };
    const tabs = radiologyQueueTabs(counts, "pending");
    assert.equal(tabs.find((tab) => tab.key === "open").count, 9);
    assert.equal(tabs.find((tab) => tab.key === "pending").count, 2);
    assert.equal(tabs.find((tab) => tab.key === "pending").active, true);
    assert.equal(radiologyDashboardStats(counts).pending, 2);
    assert.equal(canAttachRadiologyReport("pending"), true);
    assert.equal(canAttachRadiologyReport("verified"), false);
  });

  it("G266 and G300 print documents contain the clinical fields, not only a print button", () => {
    const lab = read("views/activeclinic/app/diagnostics-laboratory-request-detail-content.ejs");
    const rad = read("views/activeclinic/app/diagnostics-radiology-request-detail-content.ejs");
    assert.match(lab, /data-ac-print-region="laboratory-result"/);
    assert.match(lab, /data-ac-lab-component-value="1"/);
    assert.match(lab, /patientDisplayName/);
    assert.match(rad, /data-ac-print-region="radiology-request"/);
    assert.match(rad, /data-ac-rad-findings="1"/);
    assert.match(rad, /data-ac-rad-impression="1"/);
    assert.match(rad, /patientDisplayName/);
    const soap = read("views/activeclinic/app/consultation-workspace-content.ejs");
    assert.match(soap, /data-ac-print-region="soap"/);
    assert.match(soap, /data-ac-print-patient-number="1"/);
    assert.match(soap, /data-ac-print-chief-complaint="1"/);
  });

  it("BB-04 keeps a sermon draft private to the supplied status and rejects a non-https thumbnail", () => {
    const draft = buildSermonFields(
      {
        title: "Living Hope",
        speakerName: "Pastor Ada",
        preachedAt: "2026-07-18",
        summary: "Sunday message",
        status: "draft",
        imageUrl: "http://files.example/sermon.jpg",
      },
      { partial: false }
    );
    assert.equal(draft.ok, false);
    assert.equal(draft.reason, "image_url_https_required");
    const stored = buildSermonFields(
      {
        title: "Living Hope",
        speakerName: "Pastor Ada",
        preachedAt: "2026-07-18",
        status: "draft",
      },
      { partial: false }
    );
    assert.equal(stored.ok, true);
    assert.equal(stored.fields.status, "draft");
  });
});

describe("D150 P2 community benefits remain fail-closed", () => {
  it("rejects QR redemption, excludes the original walk-in clinic, and does not post funds", () => {
    assert.equal(financialPostingEnabled(), false);
    const store = createMemoryCommunityStore();
    const person = community.addPerson(store, { displayName: "Ada Member" });
    const personId = person.person.id;
    community.requestEnrollment(store, { personId });
    community.recordConsent(store, { personId, noticeVersion: "notice-1" });
    assert.equal(community.verifyIdentity(store, { personId, method: "qr_scan" }).code, "verification_method_rejected");
    community.verifyIdentity(store, { personId, method: "staff_document" });
    community.activateMembership(store, { personId });
    community.recordWalkIn(store, { personId, clinicId: CLINIC_A, actorId: "reception" });
    const home = community.decideEligibility(store, {
      personId,
      clinicId: CLINIC_A,
      agreementId: "missing",
      serviceCode: "consult",
      amountMinor: 10000,
    });
    assert.equal(home.decision, "NOT_ELIGIBLE");
    assert.equal(home.reason, "walk_in_no_introduction");
    const other = community.decideEligibility(store, {
      personId,
      clinicId: CLINIC_B,
      agreementId: "missing",
      serviceCode: "consult",
      amountMinor: 10000,
    });
    assert.equal(other.reason, "no_introduction");
    const preview = community.previewInvoice(store, {
      personId,
      clinicId: CLINIC_B,
      agreementId: "missing",
      serviceCode: "consult",
      amountMinor: 10000,
    });
    assert.equal(preview.posted, false);
    assert.equal(preview.discountMinor, 0);
    assert.equal(community.commitSettlement(store).code, "posting_disabled");
  });
});
