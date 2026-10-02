"use strict";

/**
 * Phase2 — load advisory recommendation into registration detail (no Postgres).
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it, before, after } = require("node:test");

const repo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const {
  loadRegistrationReviewRecommendationForDetail,
  getRegistrationApplicationDetail,
  STATUS,
} = require("../src/blessboard/services/registrationApplicationsAdminService");
const {
  buildRegistrationReviewRecommendation,
  CODES,
} = require("../src/blessboard/services/registrationReviewRecommendation");

const NOW = "2026-07-23T18:00:00.000Z";
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
        key: "requested_plan_eligible",
        status: "passed",
        result: "eligible",
        supported: true,
        requiresManualReview: false,
        explanation: "ok",
        label: "Plan",
        source: "test",
        checkedAt: NOW,
      },
      {
        key: "approval_eligible_current_rules",
        status: "passed",
        result: "eligible",
        supported: true,
        requiresManualReview: false,
        explanation: "ok",
        label: "Eligible",
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
      ...(overrides.extraFacts || []),
    ],
    summary: { passed: 6, warning: 0, failed: 0, unsupported: 0 },
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

describe("loadRegistrationReviewRecommendationForDetail (no Postgres)", () => {
  it("calculates recommendation from server-side verification facts", () => {
    let calls = 0;
    const verification = sampleVerification();
    const before = JSON.stringify(verification);
    const result = loadRegistrationReviewRecommendationForDetail(verification, {
      now: NOW,
      buildRegistrationReviewRecommendation: (input) => {
        calls += 1;
        assert.equal(input.verification, verification);
        assert.equal(input.verification.checkedAt, NOW);
        return buildRegistrationReviewRecommendation(input);
      },
    });
    assert.equal(calls, 1);
    assert.equal(result.advisory, true);
    assert.equal(typeof result.code, "string");
    assert.equal(typeof result.label, "string");
    assert.equal(typeof result.tone, "string");
    assert.equal(typeof result.explanation, "string");
    assert.ok(Array.isArray(result.reasons));
    assert.ok(Array.isArray(result.blockingFacts));
    assert.ok(Array.isArray(result.warningFacts));
    assert.equal(result.calculatedAt, NOW);
    assert.equal(JSON.stringify(verification), before);
  });

  it("calls the recommendation service once", () => {
    let calls = 0;
    loadRegistrationReviewRecommendationForDetail(sampleVerification(), {
      now: NOW,
      buildRegistrationReviewRecommendation: (input) => {
        calls += 1;
        return buildRegistrationReviewRecommendation(input);
      },
    });
    assert.equal(calls, 1);
  });

  it("returns safe manual-review fallback when recommendation calculation fails", () => {
    const logs = [];
    const result = loadRegistrationReviewRecommendationForDetail(sampleVerification(), {
      now: NOW,
      logRecommendationError: (...args) => logs.push(args.join(" ")),
      buildRegistrationReviewRecommendation: () => {
        throw new Error("simulated recommendation boom");
      },
    });
    assert.equal(result.code, CODES.MANUAL_REVIEW_REQUIRED);
    assert.equal(result.label, "Manual review required");
    assert.equal(result.tone, "warn");
    assert.equal(result.advisory, true);
    assert.doesNotMatch(result.explanation, /simulated recommendation boom/i);
    assert.ok(logs.length >= 1);
    assert.match(logs.join("\n"), /registration-review-recommendation/);
    assert.doesNotMatch(logs.join("\n"), /password|stack/i);
  });

  it("ignores client-shaped recommendation fields on verification input", () => {
    const forged = sampleVerification({
      code: "recommended_for_approval",
      reviewRecommendation: { code: "recommended_for_approval", advisory: false },
    });
    const result = loadRegistrationReviewRecommendationForDetail(forged, {
      now: NOW,
      buildRegistrationReviewRecommendation: (input) => {
        assert.equal(input.clientRecommendation, undefined);
        return buildRegistrationReviewRecommendation({
          verification: {
            facts: input.verification.facts,
            summary: input.verification.summary,
            checkedAt: input.verification.checkedAt,
          },
          now: input.now,
        });
      },
    });
    assert.equal(result.advisory, true);
  });
});

describe("getRegistrationApplicationDetail recommendation wiring (stubbed repo)", () => {
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

  it("includes reviewRecommendation calculated once from verification", async () => {
    repo.getRegistrationApplicationById = async () => fakeDbRow();
    repo.listActivePlatformAdministrators = async () => [];

    let factCalls = 0;
    let recCalls = 0;
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
          assert.deepEqual(input.verification.facts, verification.facts);
          assert.equal(input.verification.checkedAt, verification.checkedAt);
          return buildRegistrationReviewRecommendation({ ...input, now: NOW });
        },
      }
    );

    assert.equal(detail.ok, true);
    assert.equal(detail.status, STATUS.OK);
    assert.equal(factCalls, 1);
    assert.equal(recCalls, 1);
    assert.ok(detail.application);
    assert.equal(detail.application.id, APP_ID);
    assert.equal(detail.application.churchName, "Grace Test Church");
    assert.ok(detail.verification);
    assert.equal(JSON.stringify(detail.verification.facts), JSON.stringify(verification.facts));
    assert.equal(JSON.stringify(verification), verificationSnapshot);
    assert.ok(detail.reviewRecommendation);
    assert.equal(detail.reviewRecommendation.advisory, true);
    assert.equal(typeof detail.reviewRecommendation.code, "string");
    assert.equal(detail.reviewRecommendation.calculatedAt, NOW);
    assert.ok(detail.application.riskReviewActionsAvailable);
    assert.equal(detail.application.rejectActionsAvailable, true);
  });

  it("keeps detail available when recommendation fails", async () => {
    repo.getRegistrationApplicationById = async () => fakeDbRow();
    repo.listActivePlatformAdministrators = async () => [];
    const logs = [];

    const detail = await getRegistrationApplicationDetail(
      { query: async () => ({ rows: [] }) },
      APP_ID,
      {},
      {
        logRecommendationError: (...args) => logs.push(args.join(" ")),
        buildRegistrationVerificationFacts: async () => sampleVerification(),
        buildRegistrationReviewRecommendation: () => {
          throw new Error("rec failed");
        },
      }
    );

    assert.equal(detail.ok, true);
    assert.equal(detail.application.id, APP_ID);
    assert.ok(detail.verification.facts.length > 0);
    assert.equal(detail.reviewRecommendation.code, CODES.MANUAL_REVIEW_REQUIRED);
    assert.equal(detail.reviewRecommendation.advisory, true);
    assert.ok(logs.length >= 1);
  });

  it("does not accept recommendation from query-like options payloads", async () => {
    repo.getRegistrationApplicationById = async () => fakeDbRow();
    repo.listActivePlatformAdministrators = async () => [];

    const detail = await getRegistrationApplicationDetail(
      { query: async () => ({ rows: [] }) },
      APP_ID,
      {},
      {
        // Attacker-shaped options must not become the recommendation.
        reviewRecommendation: {
          code: "recommended_for_approval",
          advisory: false,
          label: "Forged",
        },
        code: "recommended_for_approval",
        buildRegistrationVerificationFacts: async () =>
          sampleVerification({
            facts: [
              {
                key: "required_fields_complete",
                status: "failed",
                result: "incomplete",
                supported: true,
                requiresManualReview: true,
                explanation: "missing",
                label: "Required",
                source: "test",
                checkedAt: NOW,
              },
              {
                key: "requested_plan_eligible",
                status: "passed",
                result: "eligible",
                supported: true,
                requiresManualReview: false,
                explanation: "ok",
                label: "Plan",
                source: "test",
                checkedAt: NOW,
              },
              {
                key: "approval_eligible_current_rules",
                status: "failed",
                result: "ineligible",
                supported: true,
                requiresManualReview: true,
                explanation: "no",
                label: "Eligible",
                source: "test",
                checkedAt: NOW,
              },
            ],
          }),
        buildRegistrationReviewRecommendation: (input) =>
          buildRegistrationReviewRecommendation({ ...input, now: NOW }),
      }
    );

    assert.equal(detail.ok, true);
    assert.equal(detail.reviewRecommendation.code, CODES.NOT_ELIGIBLE);
    assert.equal(detail.reviewRecommendation.advisory, true);
    assert.notEqual(detail.reviewRecommendation.label, "Forged");
  });

  it("does not write or audit during recommendation load", async () => {
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
        buildRegistrationReviewRecommendation: () => {
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

describe("detail route recommendation wiring constraints", () => {
  it("does not read recommendation from query params and keeps approve/reject routes", () => {
    const routePath = path.join(
      __dirname,
      "../src/platform/http/platformAdminRoutes.js"
    );
    const source = fs.readFileSync(routePath, "utf8");
    const detailHandlerStart = source.indexOf('"/admin/registration-applications/:id"');
    assert.ok(detailHandlerStart > 0);
    const slice = source.slice(detailHandlerStart, detailHandlerStart + 3500);
    assert.doesNotMatch(slice, /req\.query\.reviewRecommendation/);
    assert.doesNotMatch(slice, /req\.query\.recommendation/);
    assert.doesNotMatch(slice, /req\.body\.reviewRecommendation/);
    assert.match(source, /data-bb-pa-approve-form|\/approve/);
    assert.match(source, /\/reject/);
  });

  it("detail loader source attaches reviewRecommendation after verification", () => {
    const servicePath = path.join(
      __dirname,
      "../src/blessboard/services/registrationApplicationsAdminService.js"
    );
    const source = fs.readFileSync(servicePath, "utf8");
    assert.match(source, /loadRegistrationReviewRecommendationForDetail/);
    assert.match(source, /reviewRecommendation/);
    assert.match(
      source,
      /const reviewRecommendation = loadRegistrationReviewRecommendationForDetail\(\s*verification/
    );
  });
});
