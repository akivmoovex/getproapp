"use strict";

/**
 * Phase2 Batch 8 — advisory registration review recommendation (no Postgres).
 */

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  CODES,
  TONES,
  buildRegistrationReviewRecommendation,
} = require("../src/blessboard/services/registrationReviewRecommendation");

const NOW = "2026-07-23T15:00:00.000Z";
const NOW2 = "2026-07-23T16:00:00.000Z";

function fact(partial) {
  return {
    key: partial.key,
    label: partial.label || partial.key,
    status: partial.status || "not_checked",
    result: partial.result || "",
    explanation: partial.explanation || "",
    source: partial.source || "test",
    checkedAt: partial.checkedAt ?? NOW,
    supported: partial.supported !== false,
    requiresManualReview: Boolean(partial.requiresManualReview),
  };
}

function cleanSupportedFacts(overrides = {}) {
  const byKey = {
    phone_unique_registration_scope: fact({
      key: "phone_unique_registration_scope",
      status: "passed",
      result: "unique",
    }),
    church_name_exact_match: fact({
      key: "church_name_exact_match",
      status: "passed",
      result: "no_match",
    }),
    required_fields_complete: fact({
      key: "required_fields_complete",
      status: "passed",
      result: "complete",
    }),
    requested_plan_eligible: fact({
      key: "requested_plan_eligible",
      status: "passed",
      result: "eligible",
    }),
    organization_linked: fact({
      key: "organization_linked",
      status: "not_checked",
      result: "unlinked",
    }),
    risk_decision_present: fact({
      key: "risk_decision_present",
      status: "passed",
      result: "allow",
    }),
    support_or_follow_up_required: fact({
      key: "support_or_follow_up_required",
      status: "passed",
      result: "not_required",
    }),
    approval_eligible_current_rules: fact({
      key: "approval_eligible_current_rules",
      status: "passed",
      result: "eligible",
    }),
    email_unique_platform_users_only: fact({
      key: "email_unique_platform_users_only",
      status: "passed",
      result: "unique_among_platform_users",
    }),
    duplicate_review_evidence: fact({
      key: "duplicate_review_evidence",
      status: "manually_reviewed",
      result: "admin_action_recorded",
    }),
    applicant_contacted_by_phone: fact({
      key: "applicant_contacted_by_phone",
      status: "not_checked",
      result: "no_structured_phone_attempts",
    }),
    authority_terms_accepted: fact({
      key: "authority_terms_accepted",
      status: "passed",
      result: "terms_accepted",
    }),
    applicant_identity_confirmed: fact({
      key: "applicant_identity_confirmed",
      status: "not_checked",
      result: "identity_not_checked",
    }),
    applicant_authority_confirmed: fact({
      key: "applicant_authority_confirmed",
      status: "not_checked",
      result: "authority_not_checked",
    }),
    organization_key_available: fact({
      key: "organization_key_available",
      status: "passed",
      result: "organization_key_present",
    }),
    provisioning_prerequisites_current_rules: fact({
      key: "provisioning_prerequisites_current_rules",
      status: "passed",
      result: "ok",
    }),
    final_reviewer_note_present: fact({
      key: "final_reviewer_note_present",
      status: "not_checked",
      result: "no_reviewer_note",
    }),
    ...overrides,
  };
  return Object.values(byKey);
}

function unsupportedFacts() {
  return [
    fact({
      key: "applicant_email_verified",
      status: "not_checked",
      supported: false,
    }),
    fact({
      key: "registration_documents_complete",
      status: "not_checked",
      supported: false,
    }),
    fact({
      key: "distinct_website_key_available",
      status: "not_checked",
      supported: false,
    }),
  ];
}

function recommend(facts, now = NOW) {
  return buildRegistrationReviewRecommendation({
    verification: { facts, summary: {}, checkedAt: NOW },
    now,
  });
}

describe("registrationReviewRecommendation (no Postgres)", () => {
  it("returns recommended_for_approval for clean supported facts", () => {
    const out = recommend(cleanSupportedFacts());
    assert.equal(out.code, CODES.RECOMMENDED_FOR_APPROVAL);
    assert.equal(out.tone, TONES[CODES.RECOMMENDED_FOR_APPROVAL]);
    assert.equal(out.advisory, true);
    assert.match(out.explanation, /advisory recommendation/i);
    assert.match(out.explanation, /does not change the current/i);
  });

  it("lists unsupported facts as limitations on recommended_for_approval", () => {
    const out = recommend([...cleanSupportedFacts(), ...unsupportedFacts()]);
    assert.equal(out.code, CODES.RECOMMENDED_FOR_APPROVAL);
    assert.match(out.explanation, /limitations only/i);
    assert.match(out.explanation, /applicant_email_verified/);
  });

  it("returns not_eligible when plan is ineligible", () => {
    const out = recommend(
      cleanSupportedFacts({
        requested_plan_eligible: fact({
          key: "requested_plan_eligible",
          status: "failed",
          result: "ineligible",
          requiresManualReview: true,
        }),
      })
    );
    assert.equal(out.code, CODES.NOT_ELIGIBLE);
    assert.equal(out.tone, "danger");
    assert.ok(out.blockingFacts.includes("requested_plan_eligible"));
  });

  it("returns not_eligible when required fields are incomplete", () => {
    const out = recommend(
      cleanSupportedFacts({
        required_fields_complete: fact({
          key: "required_fields_complete",
          status: "failed",
          result: "incomplete",
        }),
      })
    );
    assert.equal(out.code, CODES.NOT_ELIGIBLE);
  });

  it("returns not_eligible when approval eligibility failed", () => {
    const out = recommend(
      cleanSupportedFacts({
        approval_eligible_current_rules: fact({
          key: "approval_eligible_current_rules",
          status: "failed",
          result: "ineligible",
        }),
      })
    );
    assert.equal(out.code, CODES.NOT_ELIGIBLE);
  });

  it("failed eligibility overrides warnings (rule priority)", () => {
    const out = recommend(
      cleanSupportedFacts({
        approval_eligible_current_rules: fact({
          key: "approval_eligible_current_rules",
          status: "failed",
          result: "ineligible",
        }),
        church_name_exact_match: fact({
          key: "church_name_exact_match",
          status: "warning",
          result: "exact_match",
          requiresManualReview: true,
        }),
      })
    );
    assert.equal(out.code, CODES.NOT_ELIGIBLE);
  });

  it("returns high_duplicate_risk for phone uniqueness failure", () => {
    const out = recommend(
      cleanSupportedFacts({
        phone_unique_registration_scope: fact({
          key: "phone_unique_registration_scope",
          status: "failed",
          result: "duplicate_phone_registration_scope",
        }),
      })
    );
    assert.equal(out.code, CODES.HIGH_DUPLICATE_RISK);
    assert.equal(out.tone, "danger");
    assert.ok(out.blockingFacts.includes("phone_unique_registration_scope"));
  });

  it("returns high_duplicate_risk for held_for_duplicate_review", () => {
    const out = recommend(
      cleanSupportedFacts({
        duplicate_review_evidence: fact({
          key: "duplicate_review_evidence",
          status: "warning",
          result: "held_for_duplicate_review",
          requiresManualReview: true,
        }),
      })
    );
    assert.equal(out.code, CODES.HIGH_DUPLICATE_RISK);
  });

  it("returns high_duplicate_risk for risk decision reject", () => {
    const out = recommend(
      cleanSupportedFacts({
        risk_decision_present: fact({
          key: "risk_decision_present",
          status: "passed",
          result: "reject",
        }),
      })
    );
    assert.equal(out.code, CODES.HIGH_DUPLICATE_RISK);
  });

  it("strong duplicate concern overrides missing information", () => {
    const out = recommend(
      cleanSupportedFacts({
        phone_unique_registration_scope: fact({
          key: "phone_unique_registration_scope",
          status: "failed",
          result: "duplicate_phone_registration_scope",
        }),
        provisioning_prerequisites_current_rules: fact({
          key: "provisioning_prerequisites_current_rules",
          status: "failed",
          result: "administrator_email_required",
          requiresManualReview: true,
        }),
      })
    );
    assert.equal(out.code, CODES.HIGH_DUPLICATE_RISK);
  });

  it("similar church name alone does not create high duplicate risk", () => {
    const out = recommend(
      cleanSupportedFacts({
        church_name_exact_match: fact({
          key: "church_name_exact_match",
          status: "warning",
          result: "exact_match",
          requiresManualReview: true,
        }),
      })
    );
    assert.equal(out.code, CODES.MANUAL_REVIEW_REQUIRED);
    assert.notEqual(out.code, CODES.HIGH_DUPLICATE_RISK);
  });

  it("returns additional_information_required when applicant data is missing", () => {
    const out = recommend(
      cleanSupportedFacts({
        provisioning_prerequisites_current_rules: fact({
          key: "provisioning_prerequisites_current_rules",
          status: "failed",
          result: "administrator_email_required",
          requiresManualReview: true,
        }),
      })
    );
    assert.equal(out.code, CODES.ADDITIONAL_INFORMATION_REQUIRED);
    assert.equal(out.tone, "warn");
  });

  it("missing information overrides ordinary manual review", () => {
    const out = recommend(
      cleanSupportedFacts({
        provisioning_prerequisites_current_rules: fact({
          key: "provisioning_prerequisites_current_rules",
          status: "failed",
          result: "administrator_email_required",
          requiresManualReview: true,
        }),
        church_name_exact_match: fact({
          key: "church_name_exact_match",
          status: "warning",
          result: "exact_match",
          requiresManualReview: true,
        }),
      })
    );
    assert.equal(out.code, CODES.ADDITIONAL_INFORMATION_REQUIRED);
  });

  it("warning facts produce manual review", () => {
    const out = recommend(
      cleanSupportedFacts({
        email_unique_platform_users_only: fact({
          key: "email_unique_platform_users_only",
          status: "warning",
          result: "email_in_use_by_platform_user",
          requiresManualReview: true,
        }),
      })
    );
    assert.equal(out.code, CODES.MANUAL_REVIEW_REQUIRED);
    assert.equal(out.tone, "warn");
    assert.ok(out.warningFacts.includes("email_unique_platform_users_only"));
  });

  it("unsupported checks produce manual review rather than failure", () => {
    const out = recommend([
      ...unsupportedFacts(),
      fact({
        key: "church_name_exact_match",
        status: "warning",
        result: "exact_match",
        requiresManualReview: true,
      }),
    ]);
    assert.equal(out.code, CODES.MANUAL_REVIEW_REQUIRED);
    assert.notEqual(out.code, CODES.NOT_ELIGIBLE);
    assert.ok(out.reasons.some((r) => r.factKey === "applicant_email_verified"));
  });

  it("does not classify unsupported-only sets as not_eligible", () => {
    const out = recommend(unsupportedFacts());
    assert.equal(out.code, CODES.MANUAL_REVIEW_REQUIRED);
    assert.notEqual(out.code, CODES.NOT_ELIGIBLE);
  });

  it("rule priority: not_eligible > high_duplicate > additional_info > manual > recommended", () => {
    const order = [
      recommend(
        cleanSupportedFacts({
          required_fields_complete: fact({
            key: "required_fields_complete",
            status: "failed",
            result: "incomplete",
          }),
          phone_unique_registration_scope: fact({
            key: "phone_unique_registration_scope",
            status: "failed",
            result: "duplicate_phone_registration_scope",
          }),
        })
      ).code,
      recommend(
        cleanSupportedFacts({
          phone_unique_registration_scope: fact({
            key: "phone_unique_registration_scope",
            status: "failed",
            result: "duplicate_phone_registration_scope",
          }),
          provisioning_prerequisites_current_rules: fact({
            key: "provisioning_prerequisites_current_rules",
            status: "failed",
            result: "administrator_email_required",
          }),
        })
      ).code,
      recommend(
        cleanSupportedFacts({
          provisioning_prerequisites_current_rules: fact({
            key: "provisioning_prerequisites_current_rules",
            status: "failed",
            result: "administrator_email_required",
          }),
          church_name_exact_match: fact({
            key: "church_name_exact_match",
            status: "warning",
            result: "exact_match",
          }),
        })
      ).code,
      recommend(
        cleanSupportedFacts({
          church_name_exact_match: fact({
            key: "church_name_exact_match",
            status: "warning",
            result: "exact_match",
          }),
        })
      ).code,
      recommend(cleanSupportedFacts()).code,
    ];
    assert.deepEqual(order, [
      CODES.NOT_ELIGIBLE,
      CODES.HIGH_DUPLICATE_RISK,
      CODES.ADDITIONAL_INFORMATION_REQUIRED,
      CODES.MANUAL_REVIEW_REQUIRED,
      CODES.RECOMMENDED_FOR_APPROVAL,
    ]);
  });

  it("recommendation remains advisory", () => {
    for (const codeCase of [
      cleanSupportedFacts(),
      cleanSupportedFacts({
        requested_plan_eligible: fact({
          key: "requested_plan_eligible",
          status: "failed",
          result: "ineligible",
        }),
      }),
      cleanSupportedFacts({
        phone_unique_registration_scope: fact({
          key: "phone_unique_registration_scope",
          status: "failed",
          result: "duplicate",
        }),
      }),
    ]) {
      const out = recommend(codeCase);
      assert.equal(out.advisory, true);
    }
  });

  it("reasons reference fact keys", () => {
    const out = recommend(
      cleanSupportedFacts({
        church_name_exact_match: fact({
          key: "church_name_exact_match",
          status: "warning",
          result: "exact_match",
        }),
      })
    );
    assert.ok(out.reasons.length > 0);
    for (const reason of out.reasons) {
      assert.equal(typeof reason.factKey, "string");
      assert.ok(reason.factKey.length > 0);
      assert.equal(typeof reason.status, "string");
      assert.equal(typeof reason.message, "string");
      assert.equal(reason.error, undefined);
      assert.equal(reason.raw, undefined);
    }
  });

  it("does not mutate input verification facts", () => {
    const facts = cleanSupportedFacts({
      church_name_exact_match: fact({
        key: "church_name_exact_match",
        status: "warning",
        result: "exact_match",
      }),
    });
    const verification = { facts, summary: { passed: 1 }, checkedAt: NOW };
    const before = JSON.stringify(verification);
    buildRegistrationReviewRecommendation({ verification, now: NOW });
    assert.equal(JSON.stringify(verification), before);
  });

  it("is deterministic except for calculatedAt", () => {
    const facts = cleanSupportedFacts();
    const a = recommend(facts, NOW);
    const b = recommend(facts, NOW2);
    assert.equal(a.code, b.code);
    assert.equal(a.label, b.label);
    assert.equal(a.tone, b.tone);
    assert.equal(a.explanation, b.explanation);
    assert.deepEqual(a.reasons, b.reasons);
    assert.deepEqual(a.blockingFacts, b.blockingFacts);
    assert.deepEqual(a.warningFacts, b.warningFacts);
    assert.equal(a.advisory, b.advisory);
    assert.equal(a.calculatedAt, NOW);
    assert.equal(b.calculatedAt, NOW2);
  });

  it("null or malformed verification returns safe manual review", () => {
    for (const verification of [null, undefined, {}, { facts: null }, { facts: [null] }]) {
      const out = buildRegistrationReviewRecommendation({ verification, now: NOW });
      assert.equal(out.code, CODES.MANUAL_REVIEW_REQUIRED);
      assert.equal(out.advisory, true);
      assert.equal(out.tone, "warn");
    }
  });

  it("output shape includes required fields", () => {
    const out = recommend(cleanSupportedFacts());
    assert.equal(typeof out.code, "string");
    assert.equal(typeof out.label, "string");
    assert.equal(typeof out.tone, "string");
    assert.equal(typeof out.explanation, "string");
    assert.ok(Array.isArray(out.reasons));
    assert.ok(Array.isArray(out.blockingFacts));
    assert.ok(Array.isArray(out.warningFacts));
    assert.equal(typeof out.calculatedAt, "string");
    assert.equal(out.advisory, true);
  });
});
