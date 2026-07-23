"use strict";

/**
 * Phase2 Batch 9 — advisory approval checklist derivation (no Postgres).
 */

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  STATUSES,
  ITEM_DEFS,
  buildRegistrationApprovalChecklist,
} = require("../src/blessboard/services/registrationApprovalChecklist");

const NOW = "2026-07-23T20:00:00.000Z";
const NOW2 = "2026-07-23T21:00:00.000Z";

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

function baseFacts(overrides = {}) {
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
      status: "manually_reviewed",
      result: "phone_contact_logged",
    }),
    authority_terms_accepted: fact({
      key: "authority_terms_accepted",
      status: "passed",
      result: "terms_accepted",
    }),
    organization_key_available: fact({
      key: "organization_key_available",
      status: "passed",
      result: "organization_key_present",
    }),
    final_reviewer_note_present: fact({
      key: "final_reviewer_note_present",
      status: "manually_reviewed",
      result: "review_notes_present",
    }),
    applicant_email_verified: fact({
      key: "applicant_email_verified",
      status: "not_checked",
      supported: false,
    }),
    applicant_identity_confirmed: fact({
      key: "applicant_identity_confirmed",
      status: "not_checked",
      supported: true,
    }),
    applicant_authority_confirmed: fact({
      key: "applicant_authority_confirmed",
      status: "not_checked",
      supported: true,
    }),
    distinct_website_key_available: fact({
      key: "distinct_website_key_available",
      status: "not_checked",
      supported: false,
    }),
    ...overrides,
  };
  return Object.values(byKey);
}

function build(facts, extras = {}) {
  return buildRegistrationApprovalChecklist({
    verification: { facts, summary: {}, checkedAt: NOW },
    reviewRecommendation: extras.reviewRecommendation || null,
    now: extras.now || NOW,
  });
}

function itemByKey(result, key) {
  return result.items.find((i) => i.key === key);
}

describe("registrationApprovalChecklist (no Postgres)", () => {
  it("returns every checklist item with required shape", () => {
    const out = build(baseFacts());
    assert.equal(out.items.length, ITEM_DEFS.length);
    assert.equal(out.advisory, true);
    assert.equal(out.calculatedAt, NOW);
    assert.equal(out.readyForApproval, undefined);
    for (const def of ITEM_DEFS) {
      const it = itemByKey(out, def.key);
      assert.ok(it, def.key);
      assert.equal(it.label, def.label);
      assert.ok(Object.values(STATUSES).includes(it.status), `${def.key}:${it.status}`);
      assert.equal(typeof it.explanation, "string");
      assert.ok(Array.isArray(it.sourceFactKeys));
      assert.equal(typeof it.supported, "boolean");
      assert.equal(typeof it.required, "boolean");
      assert.ok(it.actionTarget === null || typeof it.actionTarget === "string");
    }
  });

  it("marks applicant email verified as not_available when unsupported", () => {
    const out = build(baseFacts());
    const it = itemByKey(out, "applicant_email_verified");
    assert.equal(it.status, STATUSES.NOT_AVAILABLE);
    assert.equal(it.supported, false);
    assert.match(it.explanation, /not stored|ownership/i);
    assert.doesNotMatch(it.explanation, /unique among platform/i);
  });

  it("derives phone uniqueness pass, warning, and failure", () => {
    const pass = itemByKey(
      build(
        baseFacts({
          phone_unique_registration_scope: fact({
            key: "phone_unique_registration_scope",
            status: "passed",
            result: "unique",
          }),
        })
      ),
      "phone_uniqueness_reviewed"
    );
    assert.equal(pass.status, STATUSES.COMPLETE);

    const warn = itemByKey(
      build(
        baseFacts({
          phone_unique_registration_scope: fact({
            key: "phone_unique_registration_scope",
            status: "not_checked",
            result: "no_live_lookup",
          }),
        })
      ),
      "phone_uniqueness_reviewed"
    );
    assert.equal(warn.status, STATUSES.WARNING);

    const fail = itemByKey(
      build(
        baseFacts({
          phone_unique_registration_scope: fact({
            key: "phone_unique_registration_scope",
            status: "failed",
            result: "duplicate_phone_registration_scope",
          }),
        })
      ),
      "phone_uniqueness_reviewed"
    );
    assert.equal(fail.status, STATUSES.INCOMPLETE);
    assert.match(fail.explanation, /duplicate phone/i);
  });

  it("treats partial email uniqueness as warning, not complete", () => {
    const out = build(
      baseFacts({
        email_unique_platform_users_only: fact({
          key: "email_unique_platform_users_only",
          status: "passed",
          result: "unique_among_platform_users",
        }),
      })
    );
    const it = itemByKey(out, "email_uniqueness_reviewed");
    assert.equal(it.status, STATUSES.WARNING);
    assert.match(it.explanation, /platform users only/i);
    assert.match(it.explanation, /not treated as fully complete/i);
    assert.notEqual(it.status, STATUSES.COMPLETE);
  });

  it("derives duplicate review complete and incomplete", () => {
    const complete = itemByKey(
      build(
        baseFacts({
          duplicate_review_evidence: fact({
            key: "duplicate_review_evidence",
            status: "manually_reviewed",
            result: "admin_action_recorded",
          }),
        })
      ),
      "duplicate_results_reviewed"
    );
    assert.equal(complete.status, STATUSES.COMPLETE);

    const incomplete = itemByKey(
      build(
        baseFacts({
          duplicate_review_evidence: fact({
            key: "duplicate_review_evidence",
            status: "not_checked",
            result: "none",
          }),
          church_name_exact_match: fact({
            key: "church_name_exact_match",
            status: "passed",
            result: "no_match",
          }),
        })
      ),
      "duplicate_results_reviewed"
    );
    assert.equal(incomplete.status, STATUSES.INCOMPLETE);

    const nameOnly = itemByKey(
      build(
        baseFacts({
          duplicate_review_evidence: fact({
            key: "duplicate_review_evidence",
            status: "not_checked",
            result: "none",
          }),
          church_name_exact_match: fact({
            key: "church_name_exact_match",
            status: "warning",
            result: "exact_match",
          }),
        })
      ),
      "duplicate_results_reviewed"
    );
    assert.equal(nameOnly.status, STATUSES.MANUAL_REVIEW_REQUIRED);
    assert.match(nameOnly.explanation, /alone/i);
  });

  it("derives applicant called and not called", () => {
    const called = itemByKey(build(baseFacts()), "applicant_called");
    assert.equal(called.status, STATUSES.COMPLETE);

    const notCalled = itemByKey(
      build(
        baseFacts({
          applicant_contacted_by_phone: fact({
            key: "applicant_contacted_by_phone",
            status: "not_checked",
            result: "no_phone_contact_log",
          }),
        })
      ),
      "applicant_called"
    );
    assert.equal(notCalled.status, STATUSES.INCOMPLETE);
    assert.match(notCalled.explanation, /planned follow-up/i);
  });

  it("does not treat phone contact as identity confirmation", () => {
    const out = build(
      baseFacts({
        applicant_contacted_by_phone: fact({
          key: "applicant_contacted_by_phone",
          status: "passed",
          result: "structured_applicant_contacted",
          source: "phone_verification_attempts",
        }),
        applicant_identity_confirmed: fact({
          key: "applicant_identity_confirmed",
          status: "not_checked",
          supported: true,
        }),
      })
    );
    assert.equal(itemByKey(out, "applicant_called").status, STATUSES.COMPLETE);
    const identity = itemByKey(out, "applicant_identity_confirmed");
    assert.equal(identity.status, STATUSES.INCOMPLETE);
    assert.match(identity.explanation, /not been confirmed/i);
  });

  it("does not treat terms acceptance as authority confirmation", () => {
    const out = build(
      baseFacts({
        authority_terms_accepted: fact({
          key: "authority_terms_accepted",
          status: "passed",
          result: "terms_accepted",
        }),
      })
    );
    const it = itemByKey(out, "applicant_authority_confirmed");
    assert.equal(it.status, STATUSES.MANUAL_REVIEW_REQUIRED);
    assert.match(it.explanation, /alone/i);
  });

  it("derives required fields complete and incomplete", () => {
    assert.equal(
      itemByKey(build(baseFacts()), "required_fields_complete").status,
      STATUSES.COMPLETE
    );
    const incomplete = itemByKey(
      build(
        baseFacts({
          required_fields_complete: fact({
            key: "required_fields_complete",
            status: "failed",
            result: "incomplete",
            explanation: "Missing city.",
          }),
        })
      ),
      "required_fields_complete"
    );
    assert.equal(incomplete.status, STATUSES.INCOMPLETE);
  });

  it("derives organization-key pass, warning, and unavailable", () => {
    assert.equal(
      itemByKey(build(baseFacts()), "website_or_organization_key_confirmed").status,
      STATUSES.COMPLETE
    );

    const warn = itemByKey(
      build(
        baseFacts({
          organization_key_available: fact({
            key: "organization_key_available",
            status: "not_checked",
            result: "not_stored",
          }),
        })
      ),
      "website_or_organization_key_confirmed"
    );
    assert.equal(warn.status, STATUSES.WARNING);
    assert.match(warn.explanation, /website key is not stored/i);

    const unavailable = itemByKey(
      build(
        baseFacts({
          organization_key_available: fact({
            key: "organization_key_available",
            status: "failed",
            result: "reserved_organization_key",
          }),
        })
      ),
      "website_or_organization_key_confirmed"
    );
    assert.equal(unavailable.status, STATUSES.INCOMPLETE);
  });

  it("derives reviewer note present and absent", () => {
    assert.equal(
      itemByKey(build(baseFacts()), "final_reviewer_note_entered").status,
      STATUSES.COMPLETE
    );

    const supportOnly = itemByKey(
      build(
        baseFacts({
          final_reviewer_note_present: fact({
            key: "final_reviewer_note_present",
            status: "manually_reviewed",
            result: "contact_note_present",
          }),
        })
      ),
      "final_reviewer_note_entered"
    );
    assert.equal(supportOnly.status, STATUSES.INCOMPLETE);
    assert.match(supportOnly.explanation, /support-contact|reviewer note/i);

    const absent = itemByKey(
      build(
        baseFacts({
          final_reviewer_note_present: fact({
            key: "final_reviewer_note_present",
            status: "not_checked",
            result: "no_reviewer_note",
          }),
        })
      ),
      "final_reviewer_note_entered"
    );
    assert.equal(absent.status, STATUSES.INCOMPLETE);
  });

  it("computes summary counts and required outstanding", () => {
    const out = build(baseFacts());
    const s = out.summary;
    assert.equal(s.total, ITEM_DEFS.length);
    assert.equal(typeof s.complete, "number");
    assert.equal(typeof s.incomplete, "number");
    assert.equal(typeof s.warning, "number");
    assert.equal(typeof s.notAvailable, "number");
    assert.equal(typeof s.manualReviewRequired, "number");
    assert.equal(typeof s.requiredComplete, "number");
    assert.equal(typeof s.requiredOutstanding, "number");
    assert.equal(
      s.complete + s.incomplete + s.warning + s.notAvailable + s.manualReviewRequired,
      s.total
    );
    assert.equal(s.requiredComplete + s.requiredOutstanding, s.total);
    assert.ok(s.requiredOutstanding >= 1);
    assert.equal(out.readyForApproval, undefined);
  });

  it("handles null or malformed input safely without claiming completion", () => {
    for (const verification of [null, undefined, {}, { facts: null }, { facts: [null] }]) {
      const out = buildRegistrationApprovalChecklist({ verification, now: NOW });
      assert.equal(out.items.length, ITEM_DEFS.length);
      assert.equal(out.advisory, true);
      assert.ok(out.summary.complete < out.summary.total);
      assert.equal(
        itemByKey(out, "applicant_email_verified").status,
        STATUSES.NOT_AVAILABLE
      );
      assert.equal(
        itemByKey(out, "applicant_identity_confirmed").status,
        STATUSES.NOT_AVAILABLE
      );
    }
  });

  it("does not mutate input", () => {
    const facts = baseFacts();
    const verification = { facts, summary: { passed: 1 }, checkedAt: NOW };
    const reviewRecommendation = { code: "manual_review_required", advisory: true };
    const before = JSON.stringify({ verification, reviewRecommendation });
    buildRegistrationApprovalChecklist({
      verification,
      reviewRecommendation,
      now: NOW,
    });
    assert.equal(JSON.stringify({ verification, reviewRecommendation }), before);
  });

  it("is deterministic except for calculatedAt", () => {
    const facts = baseFacts();
    const a = build(facts, { now: NOW });
    const b = build(facts, { now: NOW2 });
    assert.deepEqual(
      a.items.map((i) => ({ ...i })),
      b.items.map((i) => ({ ...i }))
    );
    assert.deepEqual(a.summary, b.summary);
    assert.equal(a.advisory, b.advisory);
    assert.equal(a.calculatedAt, NOW);
    assert.equal(b.calculatedAt, NOW2);
  });

  it("may use recommendation for context without copying its code into statuses", () => {
    const out = build(baseFacts(), {
      reviewRecommendation: { code: "high_duplicate_risk", advisory: true },
    });
    const dup = itemByKey(out, "duplicate_results_reviewed");
    assert.equal(dup.status, STATUSES.COMPLETE);
    assert.notEqual(dup.status, "high_duplicate_risk");
    assert.match(dup.explanation, /elevated duplicate risk/i);
  });

  it("uses only safe action targets or null", () => {
    const out = build(baseFacts());
    for (const it of out.items) {
      if (it.actionTarget != null) {
        assert.match(it.actionTarget, /^#reg-/);
        assert.ok(
          ["#reg-verification", "#reg-administration", "#reg-website"].includes(
            it.actionTarget
          ),
          it.actionTarget
        );
      }
    }
  });
});
