"use strict";

/**
 * Phase2 Prompt 028 — load phone-verification history into registration detail (no Postgres).
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it, before, after } = require("node:test");

const repo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const {
  loadRegistrationPhoneVerificationForDetail,
  getRegistrationApplicationDetail,
  STATUS,
} = require("../src/blessboard/services/registrationApplicationsAdminService");
const {
  derivePhoneVerificationSummary,
  SUMMARY_STATUSES,
} = require("../src/blessboard/services/registrationPhoneVerificationService");

const NOW = "2026-07-23T18:00:00.000Z";
const APP_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function sampleAttempts() {
  return [
    {
      id: "attempt-new",
      application_id: APP_ID,
      attempted_at: "2026-07-22T12:00:00.000Z",
      outcome: "answered",
      verification_result: "verified",
      verification_reason: "Identity confirmed on call",
      applicant_identity_status: "confirmed",
      applicant_authority_status: "confirmed",
      phone_number_called: "+260971000001",
      phone_number_normalized: "+260971000001",
      created_by_user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      created_at: "2026-07-22T12:01:00.000Z",
    },
    {
      id: "attempt-old",
      application_id: APP_ID,
      attempted_at: "2026-07-20T08:00:00.000Z",
      outcome: "no_answer",
      verification_result: "pending",
      applicant_identity_status: "not_checked",
      applicant_authority_status: "not_checked",
      phone_number_called: "+260971000001",
      phone_number_normalized: "+260971000001",
      created_by_user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      created_at: "2026-07-20T08:01:00.000Z",
    },
  ];
}

function fakeDbRow() {
  return {
    id: APP_ID,
    church_name: "Grace Test Church",
    contact_name: "Pat Applicant",
    contact_email: "pat@example.com",
    contact_phone: "+260971000001",
    contact_phone_normalized: "+260971000001",
    country: "Zambia",
    city: "Lusaka",
    selected_plan: "foundation",
    application_status: "submitted",
    provisioning_status: "not_started",
    follow_up_status: "contact_pending",
    support_requested: false,
    risk_decision: "allow",
    risk_reason_codes: [],
    risk_decided_at: "2026-07-01T10:00:00.000Z",
    organization_id: null,
    organization_key: null,
    role_in_church: "Pastor",
    branch_name: null,
    branch_count: null,
    registration_message: null,
    consent_terms: true,
    review_notes: "",
    review_events: [],
    provisioning_started_at: null,
    provisioned_at: null,
    provisioning_failed_at: null,
    provisioning_error_code: null,
    provisioning_error_detail: null,
    onboarding_status: null,
    first_contacted_at: null,
    next_follow_up_at: null,
    last_contacted_at: null,
    onboarding_completed_at: null,
    last_activity_at: null,
    organization_created_at: null,
    assigned_support_user_id: null,
    created_at: "2026-07-01T09:00:00.000Z",
    updated_at: "2026-07-01T09:00:00.000Z",
  };
}

function sampleVerification() {
  return {
    facts: [{ key: "required_fields_complete", status: "passed", supported: true }],
    summary: { passed: 1, warning: 0, failed: 0, unsupported: 0 },
    checkedAt: NOW,
  };
}

describe("loadRegistrationPhoneVerificationForDetail (no Postgres)", () => {
  it("includes attempts newest first and derived summary", async () => {
    let historyCalls = 0;
    let summaryCalls = 0;
    const attempts = sampleAttempts();
    const result = await loadRegistrationPhoneVerificationForDetail(
      { query: async () => ({ rows: [] }) },
      APP_ID,
      {
        now: NOW,
        getPhoneVerificationHistory: async (applicationId) => {
          historyCalls += 1;
          assert.equal(applicationId, APP_ID);
          return attempts;
        },
        derivePhoneVerificationSummary: (list, opts) => {
          summaryCalls += 1;
          assert.equal(list, attempts);
          return derivePhoneVerificationSummary(list, opts);
        },
      }
    );
    assert.equal(historyCalls, 1);
    assert.equal(summaryCalls, 1);
    assert.equal(result.attempts.length, 2);
    assert.equal(result.attempts[0].id, "attempt-new");
    assert.equal(result.summary.verificationStatus, SUMMARY_STATUSES.VERIFIED);
    assert.equal(result.summary.totalAttempts, 2);
    assert.equal(result.summary.applicantContacted, true);
    assert.equal(result.unavailable, undefined);
  });

  it("calls the history loader once", async () => {
    let historyCalls = 0;
    await loadRegistrationPhoneVerificationForDetail(
      { query: async () => ({ rows: [] }) },
      APP_ID,
      {
        getPhoneVerificationHistory: async () => {
          historyCalls += 1;
          return [];
        },
      }
    );
    assert.equal(historyCalls, 1);
  });

  it("empty history returns not_checked summary", async () => {
    const result = await loadRegistrationPhoneVerificationForDetail(
      { query: async () => ({ rows: [] }) },
      APP_ID,
      {
        now: NOW,
        getPhoneVerificationHistory: async () => [],
        derivePhoneVerificationSummary,
      }
    );
    assert.deepEqual(result.attempts, []);
    assert.equal(result.summary.verificationStatus, SUMMARY_STATUSES.NOT_CHECKED);
    assert.equal(result.summary.totalAttempts, 0);
    assert.equal(result.summary.applicantContacted, false);
    assert.equal(result.summary.identityConfirmed, false);
    assert.equal(result.summary.authorityConfirmed, false);
    assert.equal(result.summary.followUpRequired, false);
  });

  it("history failure returns safe unavailable state without raw errors", async () => {
    const logs = [];
    const result = await loadRegistrationPhoneVerificationForDetail(
      { query: async () => ({ rows: [] }) },
      APP_ID,
      {
        logPhoneVerificationError: (...args) => logs.push(args.join(" ")),
        getPhoneVerificationHistory: async () => {
          throw new Error("ECONNREFUSED relation does not exist password=secret");
        },
      }
    );
    assert.deepEqual(result.attempts, []);
    assert.equal(result.unavailable, true);
    assert.equal(result.summary.totalAttempts, 0);
    assert.equal(result.summary.verificationStatus, SUMMARY_STATUSES.NOT_CHECKED);
    assert.equal(result.summary.applicantContacted, false);
    assert.equal(result.summary.identityConfirmed, false);
    assert.equal(result.summary.authorityConfirmed, false);
    assert.equal(result.summary.followUpRequired, false);
    assert.ok(logs.length >= 1);
    assert.match(logs.join("\n"), /registration-phone-verification/);
    assert.doesNotMatch(JSON.stringify(result), /ECONNREFUSED|password=secret|relation does not exist/i);
  });

  it("ignores client-shaped phoneVerification on options", async () => {
    const forged = {
      attempts: [{ id: "forged", verification_result: "verified" }],
      summary: { verificationStatus: "verified", totalAttempts: 99 },
    };
    const result = await loadRegistrationPhoneVerificationForDetail(
      { query: async () => ({ rows: [] }) },
      APP_ID,
      {
        phoneVerification: forged,
        getPhoneVerificationHistory: async () => [],
        derivePhoneVerificationSummary,
      }
    );
    assert.deepEqual(result.attempts, []);
    assert.equal(result.summary.verificationStatus, SUMMARY_STATUSES.NOT_CHECKED);
    assert.notEqual(result.summary.totalAttempts, 99);
  });
});

describe("getRegistrationApplicationDetail phoneVerification wiring (stubbed repo)", () => {
  let originalGetById;
  let originalListAdmins;
  let writeCount;

  before(() => {
    originalGetById = repo.getRegistrationApplicationById;
    originalListAdmins = repo.listActivePlatformAdministrators;
  });

  after(() => {
    repo.getRegistrationApplicationById = originalGetById;
    repo.listActivePlatformAdministrators = originalListAdmins;
  });

  it("includes phoneVerification and preserves existing detail properties", async () => {
    repo.getRegistrationApplicationById = async () => fakeDbRow();
    repo.listActivePlatformAdministrators = async () => [];
    writeCount = 0;

    let historyCalls = 0;
    let factsCalls = 0;
    let factsSawPhone = false;
    const attempts = sampleAttempts();
    const verification = sampleVerification();

    const detail = await getRegistrationApplicationDetail(
      {
        query: async (sql) => {
          if (/\b(INSERT|UPDATE|DELETE|ALTER)\b/i.test(String(sql || ""))) {
            writeCount += 1;
          }
          return { rows: [] };
        },
      },
      APP_ID,
      {},
      {
        buildRegistrationVerificationFacts: async (input) => {
          factsCalls += 1;
          factsSawPhone = Boolean(
            input &&
              input.phoneVerification &&
              Array.isArray(input.phoneVerification.attempts) &&
              input.phoneVerification.attempts[0] &&
              input.phoneVerification.attempts[0].id === "attempt-new"
          );
          return verification;
        },
        getPhoneVerificationHistory: async (applicationId) => {
          historyCalls += 1;
          assert.equal(applicationId, APP_ID);
          return attempts;
        },
        derivePhoneVerificationSummary: (list, opts) =>
          derivePhoneVerificationSummary(list, { ...opts, now: NOW }),
      }
    );

    assert.equal(detail.ok, true);
    assert.equal(historyCalls, 1);
    assert.equal(factsCalls, 1);
    assert.equal(factsSawPhone, true);
    assert.equal(writeCount, 0);
    assert.ok(detail.application);
    assert.equal(detail.application.id, APP_ID);
    assert.ok(detail.verification);
    assert.equal(JSON.stringify(detail.verification.facts), JSON.stringify(verification.facts));
    assert.ok(detail.reviewRecommendation);
    assert.equal(detail.reviewRecommendation.advisory, true);
    assert.ok(detail.approvalChecklist);
    assert.equal(detail.approvalChecklist.advisory, true);
    assert.ok(detail.phoneVerification);
    assert.equal(detail.phoneVerification.attempts[0].id, "attempt-new");
    assert.equal(detail.phoneVerification.summary.verificationStatus, SUMMARY_STATUSES.VERIFIED);
    assert.ok(detail.application.riskReviewActionsAvailable);
    assert.equal(detail.application.rejectActionsAvailable, true);
    assert.ok(!Object.prototype.hasOwnProperty.call(detail.phoneVerification.attempts[0], "created_by_email"));
  });

  it("keeps detail available when phone history fails", async () => {
    repo.getRegistrationApplicationById = async () => fakeDbRow();
    repo.listActivePlatformAdministrators = async () => [];
    const logs = [];

    const detail = await getRegistrationApplicationDetail(
      { query: async () => ({ rows: [] }) },
      APP_ID,
      {},
      {
        logPhoneVerificationError: (...args) => logs.push(args.join(" ")),
        buildRegistrationVerificationFacts: async () => sampleVerification(),
        getPhoneVerificationHistory: async () => {
          throw new Error("boom phone history");
        },
      }
    );

    assert.equal(detail.ok, true);
    assert.ok(detail.application);
    assert.ok(detail.verification);
    assert.ok(detail.reviewRecommendation);
    assert.ok(detail.approvalChecklist);
    assert.equal(detail.phoneVerification.unavailable, true);
    assert.deepEqual(detail.phoneVerification.attempts, []);
    assert.equal(detail.phoneVerification.summary.verificationStatus, SUMMARY_STATUSES.NOT_CHECKED);
    assert.doesNotMatch(JSON.stringify(detail.phoneVerification), /boom phone history/);
    assert.ok(logs.length >= 1);
  });

  it("empty history yields not_checked summary on detail", async () => {
    repo.getRegistrationApplicationById = async () => fakeDbRow();
    repo.listActivePlatformAdministrators = async () => [];

    const detail = await getRegistrationApplicationDetail(
      { query: async () => ({ rows: [] }) },
      APP_ID,
      {},
      {
        buildRegistrationVerificationFacts: async () => sampleVerification(),
        getPhoneVerificationHistory: async () => [],
        derivePhoneVerificationSummary,
      }
    );

    assert.equal(detail.ok, true);
    assert.deepEqual(detail.phoneVerification.attempts, []);
    assert.equal(detail.phoneVerification.summary.verificationStatus, SUMMARY_STATUSES.NOT_CHECKED);
  });

  it("main application-load failure remains unchanged and skips phone history", async () => {
    let historyCalls = 0;
    repo.getRegistrationApplicationById = async () => null;
    repo.listActivePlatformAdministrators = async () => [];

    const detail = await getRegistrationApplicationDetail(
      { query: async () => ({ rows: [] }) },
      APP_ID,
      {},
      {
        getPhoneVerificationHistory: async () => {
          historyCalls += 1;
          return sampleAttempts();
        },
      }
    );

    assert.equal(detail.ok, false);
    assert.equal(detail.status, STATUS.NOT_FOUND);
    assert.equal(historyCalls, 0);
    assert.equal(detail.phoneVerification, undefined);
  });

  it("invalid application id does not call phone history", async () => {
    let historyCalls = 0;
    const detail = await getRegistrationApplicationDetail(
      { query: async () => ({ rows: [] }) },
      "not-a-uuid",
      {},
      {
        getPhoneVerificationHistory: async () => {
          historyCalls += 1;
          return [];
        },
      }
    );
    assert.equal(detail.ok, false);
    assert.equal(detail.status, STATUS.INVALID_INPUT);
    assert.equal(historyCalls, 0);
  });

  it("query-shaped options cannot supply phoneVerification attempts or summary", async () => {
    repo.getRegistrationApplicationById = async () => fakeDbRow();
    repo.listActivePlatformAdministrators = async () => [];

    const detail = await getRegistrationApplicationDetail(
      { query: async () => ({ rows: [] }) },
      APP_ID,
      {},
      {
        phoneVerification: {
          attempts: [{ id: "from-query", verification_result: "verified" }],
          summary: { verificationStatus: "verified", totalAttempts: 7 },
        },
        buildRegistrationVerificationFacts: async () => sampleVerification(),
        getPhoneVerificationHistory: async () => [],
        derivePhoneVerificationSummary,
      }
    );

    assert.equal(detail.ok, true);
    assert.deepEqual(detail.phoneVerification.attempts, []);
    assert.equal(detail.phoneVerification.summary.verificationStatus, SUMMARY_STATUSES.NOT_CHECKED);
    assert.notEqual(detail.phoneVerification.summary.totalAttempts, 7);
  });
});

describe("detail route phoneVerification locals and approval paths", () => {
  it("route passes phoneVerification locals and ignores query overrides", () => {
    const routePath = path.join(__dirname, "../src/platform/http/platformAdminRoutes.js");
    const source = fs.readFileSync(routePath, "utf8");
    const detailHandlerStart = source.indexOf('"/admin/registration-applications/:id"');
    assert.ok(detailHandlerStart > 0);
    const slice = source.slice(detailHandlerStart, detailHandlerStart + 4000);
    assert.match(slice, /phoneVerification:\s*detail\.phoneVerification/);
    assert.doesNotMatch(slice, /req\.query\.phoneVerification/);
    assert.doesNotMatch(slice, /req\.body\.phoneVerification/);
    assert.doesNotMatch(slice, /req\.query\.attempts/);
  });

  it("approve and reject POST routes remain present", () => {
    const routePath = path.join(__dirname, "../src/platform/http/platformAdminRoutes.js");
    const source = fs.readFileSync(routePath, "utf8");
    assert.match(source, /\/admin\/registration-applications\/:id\/approve/);
    assert.match(source, /\/admin\/registration-applications\/:id\/reject/);
    assert.match(source, /approveAndProvisionRegistrationApplication/);
    assert.match(source, /rejectRegistrationApplication/);
  });

  it("detail loader source loads phone verification before facts, recommendation, and checklist", () => {
    const servicePath = path.join(
      __dirname,
      "../src/blessboard/services/registrationApplicationsAdminService.js"
    );
    const source = fs.readFileSync(servicePath, "utf8");
    const phoneIdx = source.indexOf(
      "const phoneVerification = await loadRegistrationPhoneVerificationForDetail"
    );
    const factsIdx = source.indexOf(
      "const verification = await loadRegistrationVerificationForDetail"
    );
    const recIdx = source.indexOf(
      "const reviewRecommendation = loadRegistrationReviewRecommendationForDetail"
    );
    const checklistIdx = source.indexOf(
      "const approvalChecklist = loadRegistrationApprovalChecklistForDetail"
    );
    assert.ok(phoneIdx > 0 && factsIdx > phoneIdx);
    assert.ok(recIdx > factsIdx && checklistIdx > recIdx);
    assert.match(source, /\{\s*\.\.\.detailOptions,\s*phoneVerification,\s*emailVerification\s*\}/);
  });
});
