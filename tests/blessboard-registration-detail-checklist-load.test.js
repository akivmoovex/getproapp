"use strict";

/**
 * Phase2 — load approval checklist into registration detail (no Postgres).
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it, before, after } = require("node:test");

const repo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const {
  loadRegistrationApprovalChecklistForDetail,
  getRegistrationApplicationDetail,
  STATUS,
} = require("../src/blessboard/services/registrationApplicationsAdminService");
const {
  buildRegistrationApprovalChecklist,
  ITEM_DEFS,
  STATUSES: CHECKLIST_STATUSES,
} = require("../src/blessboard/services/registrationApprovalChecklist");
const {
  buildRegistrationReviewRecommendation,
} = require("../src/blessboard/services/registrationReviewRecommendation");

const NOW = "2026-07-23T22:00:00.000Z";
const APP_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function sampleVerification(overrides = {}) {
  return {
    facts: [
      {
        key: "required_fields_complete",
        status: "passed",
        result: "complete",
        supported: true,
        requiresManualReview: false,
        explanation: "ok",
        label: "Required",
        source: "test",
        checkedAt: NOW,
      },
      {
        key: "phone_unique_registration_scope",
        status: "passed",
        result: "unique",
        supported: true,
        requiresManualReview: false,
        explanation: "ok",
        label: "Phone",
        source: "test",
        checkedAt: NOW,
      },
      {
        key: "email_unique_platform_users_only",
        status: "passed",
        result: "unique_among_platform_users",
        supported: true,
        requiresManualReview: false,
        explanation: "ok",
        label: "Email",
        source: "test",
        checkedAt: NOW,
      },
      {
        key: "duplicate_review_evidence",
        status: "manually_reviewed",
        result: "admin_action_recorded",
        supported: true,
        requiresManualReview: false,
        explanation: "ok",
        label: "Duplicate",
        source: "test",
        checkedAt: NOW,
      },
      {
        key: "applicant_contacted_by_phone",
        status: "manually_reviewed",
        result: "phone_contact_logged",
        supported: true,
        requiresManualReview: false,
        explanation: "ok",
        label: "Called",
        source: "test",
        checkedAt: NOW,
      },
      {
        key: "authority_terms_accepted",
        status: "passed",
        result: "terms_accepted",
        supported: true,
        requiresManualReview: false,
        explanation: "ok",
        label: "Terms",
        source: "test",
        checkedAt: NOW,
      },
      {
        key: "organization_key_available",
        status: "passed",
        result: "organization_key_present",
        supported: true,
        requiresManualReview: false,
        explanation: "ok",
        label: "Org key",
        source: "test",
        checkedAt: NOW,
      },
      {
        key: "final_reviewer_note_present",
        status: "manually_reviewed",
        result: "review_notes_present",
        supported: true,
        requiresManualReview: false,
        explanation: "ok",
        label: "Note",
        source: "test",
        checkedAt: NOW,
      },
      {
        key: "applicant_email_verified",
        status: "not_checked",
        supported: false,
        explanation: "unsupported",
        label: "Email verified",
        source: "test",
        checkedAt: null,
        result: "unsupported",
        requiresManualReview: false,
      },
      {
        key: "applicant_identity_confirmed",
        status: "not_checked",
        supported: false,
        explanation: "unsupported",
        label: "Identity",
        source: "test",
        checkedAt: null,
        result: "unsupported",
        requiresManualReview: false,
      },
      ...(overrides.extraFacts || []),
    ],
    summary: { passed: 1 },
    checkedAt: NOW,
    ...overrides,
  };
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

describe("loadRegistrationApprovalChecklistForDetail (no Postgres)", () => {
  it("calculates checklist from server-side verification facts", () => {
    let calls = 0;
    const verification = sampleVerification();
    const reviewRecommendation = buildRegistrationReviewRecommendation({
      verification,
      now: NOW,
    });
    const beforeV = JSON.stringify(verification);
    const beforeR = JSON.stringify(reviewRecommendation);

    const result = loadRegistrationApprovalChecklistForDetail(
      verification,
      reviewRecommendation,
      {
        now: NOW,
        buildRegistrationApprovalChecklist: (input) => {
          calls += 1;
          assert.equal(input.verification, verification);
          assert.equal(input.reviewRecommendation, reviewRecommendation);
          return buildRegistrationApprovalChecklist(input);
        },
      }
    );

    assert.equal(calls, 1);
    assert.equal(result.advisory, true);
    assert.equal(result.items.length, ITEM_DEFS.length);
    assert.ok(result.summary);
    assert.equal(result.calculatedAt, NOW);
    assert.equal(result.readyForApproval, undefined);
    assert.equal(JSON.stringify(verification), beforeV);
    assert.equal(JSON.stringify(reviewRecommendation), beforeR);
  });

  it("calls the checklist service once", () => {
    let calls = 0;
    loadRegistrationApprovalChecklistForDetail(sampleVerification(), null, {
      now: NOW,
      buildRegistrationApprovalChecklist: (input) => {
        calls += 1;
        return buildRegistrationApprovalChecklist(input);
      },
    });
    assert.equal(calls, 1);
  });

  it("returns conservative fallback when checklist calculation fails", () => {
    const logs = [];
    const result = loadRegistrationApprovalChecklistForDetail(
      sampleVerification(),
      null,
      {
        now: NOW,
        logChecklistError: (...args) => logs.push(args.join(" ")),
        buildRegistrationApprovalChecklist: () => {
          throw new Error("simulated checklist boom");
        },
      }
    );

    assert.equal(result.advisory, true);
    assert.equal(result.items.length, 10);
    assert.equal(result.summary.complete, 0);
    assert.equal(result.summary.requiredComplete, 0);
    assert.equal(result.summary.requiredOutstanding, 10);
    assert.ok(result.summary.notAvailable >= 1);
    assert.ok(result.summary.manualReviewRequired >= 1);
    for (const item of result.items) {
      assert.notEqual(item.status, CHECKLIST_STATUSES.COMPLETE);
      assert.ok(
        item.status === CHECKLIST_STATUSES.NOT_AVAILABLE ||
          item.status === CHECKLIST_STATUSES.MANUAL_REVIEW_REQUIRED
      );
    }
    assert.doesNotMatch(JSON.stringify(result), /simulated checklist boom/);
    assert.ok(logs.length >= 1);
    assert.match(logs.join("\n"), /registration-approval-checklist/);
  });
});

describe("getRegistrationApplicationDetail checklist wiring (stubbed repo)", () => {
  let originalGetById;
  let originalListAdmins;

  before(() => {
    originalGetById = repo.getRegistrationApplicationById;
    originalListAdmins = repo.listActivePlatformAdministrators;
  });

  after(() => {
    repo.getRegistrationApplicationById = originalGetById;
    repo.listActivePlatformAdministrators = originalListAdmins;
  });

  it("includes approvalChecklist calculated once from verification and recommendation", async () => {
    repo.getRegistrationApplicationById = async () => fakeDbRow();
    repo.listActivePlatformAdministrators = async () => [];

    let factCalls = 0;
    let recCalls = 0;
    let checklistCalls = 0;
    const verification = sampleVerification();
    const verificationSnapshot = JSON.stringify(verification);

    const detail = await getRegistrationApplicationDetail(
      { query: async () => ({ rows: [] }) },
      APP_ID,
      {},
      {
        buildRegistrationVerificationFacts: async () => {
          factCalls += 1;
          return verification;
        },
        buildRegistrationReviewRecommendation: (input) => {
          recCalls += 1;
          return buildRegistrationReviewRecommendation({ ...input, now: NOW });
        },
        buildRegistrationApprovalChecklist: (input) => {
          checklistCalls += 1;
          assert.deepEqual(input.verification.facts, verification.facts);
          assert.ok(input.reviewRecommendation);
          assert.equal(input.reviewRecommendation.advisory, true);
          return buildRegistrationApprovalChecklist({ ...input, now: NOW });
        },
      }
    );

    assert.equal(detail.ok, true);
    assert.equal(detail.status, STATUS.OK);
    assert.equal(factCalls, 1);
    assert.equal(recCalls, 1);
    assert.equal(checklistCalls, 1);
    assert.equal(detail.application.id, APP_ID);
    assert.equal(detail.application.churchName, "Grace Test Church");
    assert.equal(JSON.stringify(detail.verification.facts), JSON.stringify(verification.facts));
    assert.equal(JSON.stringify(verification), verificationSnapshot);
    assert.ok(detail.reviewRecommendation);
    assert.equal(detail.reviewRecommendation.advisory, true);
    assert.ok(detail.approvalChecklist);
    assert.equal(detail.approvalChecklist.advisory, true);
    assert.equal(detail.approvalChecklist.items.length, ITEM_DEFS.length);
    assert.equal(detail.approvalChecklist.calculatedAt, NOW);
    assert.ok(detail.application.riskReviewActionsAvailable);
    assert.equal(detail.application.rejectActionsAvailable, true);
  });

  it("keeps detail available when checklist fails", async () => {
    repo.getRegistrationApplicationById = async () => fakeDbRow();
    repo.listActivePlatformAdministrators = async () => [];
    const logs = [];

    const detail = await getRegistrationApplicationDetail(
      { query: async () => ({ rows: [] }) },
      APP_ID,
      {},
      {
        logChecklistError: (...args) => logs.push(args.join(" ")),
        buildRegistrationVerificationFacts: async () => sampleVerification(),
        buildRegistrationReviewRecommendation: (input) =>
          buildRegistrationReviewRecommendation({ ...input, now: NOW }),
        buildRegistrationApprovalChecklist: () => {
          throw new Error("checklist failed");
        },
      }
    );

    assert.equal(detail.ok, true);
    assert.equal(detail.application.id, APP_ID);
    assert.ok(detail.verification.facts.length > 0);
    assert.ok(detail.reviewRecommendation);
    assert.equal(detail.approvalChecklist.summary.complete, 0);
    assert.equal(detail.approvalChecklist.summary.requiredOutstanding, 10);
    assert.ok(logs.length >= 1);
  });

  it("does not accept checklist from query-like options payloads", async () => {
    repo.getRegistrationApplicationById = async () => fakeDbRow();
    repo.listActivePlatformAdministrators = async () => [];

    const detail = await getRegistrationApplicationDetail(
      { query: async () => ({ rows: [] }) },
      APP_ID,
      {},
      {
        approvalChecklist: {
          items: [{ key: "required_fields_complete", status: "complete" }],
          summary: { complete: 99, requiredOutstanding: 0 },
          advisory: false,
        },
        items: [{ status: "complete" }],
        buildRegistrationVerificationFacts: async () => sampleVerification(),
        buildRegistrationReviewRecommendation: (input) =>
          buildRegistrationReviewRecommendation({ ...input, now: NOW }),
        buildRegistrationApprovalChecklist: (input) =>
          buildRegistrationApprovalChecklist({ ...input, now: NOW }),
      }
    );

    assert.equal(detail.ok, true);
    assert.equal(detail.approvalChecklist.advisory, true);
    assert.notEqual(detail.approvalChecklist.summary.complete, 99);
    assert.equal(detail.approvalChecklist.items.length, ITEM_DEFS.length);
  });

  it("does not write or audit during checklist load", async () => {
    repo.getRegistrationApplicationById = async () => fakeDbRow();
    repo.listActivePlatformAdministrators = async () => [];
    const writes = [];
    const db = {
      query: async (sql) => {
        const text = String(sql || "");
        if (/\b(INSERT|UPDATE|DELETE|ALTER)\b/i.test(text)) writes.push(text);
        return { rows: [] };
      },
    };

    await getRegistrationApplicationDetail(db, APP_ID, {}, {
      buildRegistrationVerificationFacts: async () => sampleVerification(),
      buildRegistrationReviewRecommendation: (input) =>
        buildRegistrationReviewRecommendation({ ...input, now: NOW }),
      buildRegistrationApprovalChecklist: (input) =>
        buildRegistrationApprovalChecklist({ ...input, now: NOW }),
    });
    assert.deepEqual(writes, []);
  });

  it("main application-load failure still follows existing behavior", async () => {
    const missing = await getRegistrationApplicationDetail(null, APP_ID, {});
    assert.equal(missing.ok, false);
    assert.equal(missing.status, STATUS.LOOKUP_ERROR);

    const invalid = await getRegistrationApplicationDetail(
      { query: async () => ({ rows: [] }) },
      "not-a-uuid",
      {},
      {
        buildRegistrationApprovalChecklist: () => {
          throw new Error("should not run");
        },
      }
    );
    assert.equal(invalid.ok, false);
    assert.equal(invalid.status, STATUS.INVALID_INPUT);

    repo.getRegistrationApplicationById = async () => {
      throw new Error("db down");
    };
    const lookup = await getRegistrationApplicationDetail(
      { query: async () => ({ rows: [] }) },
      APP_ID,
      {}
    );
    assert.equal(lookup.ok, false);
    assert.equal(lookup.status, STATUS.LOOKUP_ERROR);
  });
});

describe("detail route checklist wiring constraints", () => {
  it("does not read checklist from query params and keeps approve/reject routes", () => {
    const routePath = path.join(
      __dirname,
      "../src/platform/http/platformAdminRoutes.js"
    );
    const source = fs.readFileSync(routePath, "utf8");
    const detailHandlerStart = source.indexOf('"/admin/registration-applications/:id"');
    assert.ok(detailHandlerStart > 0);
    const slice = source.slice(detailHandlerStart, detailHandlerStart + 4000);
    assert.doesNotMatch(slice, /req\.query\.approvalChecklist/);
    assert.doesNotMatch(slice, /req\.body\.approvalChecklist/);
    assert.match(source, /data-bb-pa-approve-form|\/approve/);
    assert.match(source, /\/reject/);
  });

  it("detail loader source attaches approvalChecklist after recommendation", () => {
    const servicePath = path.join(
      __dirname,
      "../src/blessboard/services/registrationApplicationsAdminService.js"
    );
    const source = fs.readFileSync(servicePath, "utf8");
    assert.match(source, /loadRegistrationApprovalChecklistForDetail/);
    assert.match(source, /approvalChecklist/);
    assert.match(
      source,
      /const approvalChecklist = loadRegistrationApprovalChecklistForDetail\(\s*verification,\s*reviewRecommendation/
    );
  });
});
