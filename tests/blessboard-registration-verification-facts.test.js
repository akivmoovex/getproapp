"use strict";

/**
 * Phase2 Batch 7 — read-only registration verification facts (no Postgres).
 */

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  STATUSES,
  FACT_DEFS,
  buildRegistrationVerificationFacts,
} = require("../src/blessboard/services/registrationVerificationFacts");

const NOW = "2026-07-23T12:00:00.000Z";

function baseApp(overrides = {}) {
  return {
    id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    churchName: "Grace Test Church",
    country: "Zambia",
    city: "Lusaka",
    contactName: "Pat Applicant",
    roleInChurch: "Pastor",
    contactEmail: "pat@example.com",
    contactPhone: "+260971000001",
    contactPhoneNormalized: "+260971000001",
    selectedPlan: "foundation",
    consentTerms: true,
    applicationStatus: "submitted",
    provisioningStatus: "not_started",
    followUpStatus: "contact_pending",
    supportRequested: false,
    riskDecision: "allow",
    riskReasonCodes: [],
    riskDecidedAt: "2026-07-01T10:00:00.000Z",
    organizationId: null,
    organizationKey: null,
    reviewNotes: "",
    reviewEvents: [],
    riskReviewActionsAvailable: true,
    networkApproveAvailable: false,
    retryProvisionAvailable: false,
    ...overrides,
  };
}

async function build(opts = {}) {
  return buildRegistrationVerificationFacts({
    now: NOW,
    application: baseApp(opts.application),
    contacts: opts.contacts,
    phoneVerification: opts.phoneVerification,
    emailVerification: opts.emailVerification,
    findOccupyingPhoneMatch: opts.findOccupyingPhoneMatch,
    findSimilarOrganizationMatch: opts.findSimilarOrganizationMatch,
    findUserByEmail: opts.findUserByEmail,
  });
}

function factByKey(result, key) {
  return result.facts.find((f) => f.key === key);
}

function phonePayload(attempts, summaryOverrides = {}, extras = {}) {
  const {
    derivePhoneVerificationSummary,
  } = require("../src/blessboard/services/registrationPhoneVerificationService");
  const list = Array.isArray(attempts) ? attempts : [];
  const summary = {
    ...derivePhoneVerificationSummary(list, { now: NOW }),
    ...summaryOverrides,
  };
  return {
    attempts: list,
    summary,
    ...extras,
  };
}

describe("registrationVerificationFacts (no Postgres)", () => {
  it("returns every defined fact key with allowed statuses", async () => {
    const result = await build({
      findOccupyingPhoneMatch: async () => null,
      findSimilarOrganizationMatch: async () => null,
      findUserByEmail: async () => null,
    });
    assert.equal(result.facts.length, FACT_DEFS.length);
    assert.equal(result.checkedAt, NOW);
    for (const def of FACT_DEFS) {
      const f = factByKey(result, def.key);
      assert.ok(f, def.key);
      assert.equal(f.label, def.label || f.label);
      assert.ok(Object.values(STATUSES).includes(f.status), `${def.key}:${f.status}`);
      assert.equal(typeof f.result, "string");
      assert.equal(typeof f.explanation, "string");
      assert.equal(typeof f.source, "string");
      assert.equal(typeof f.supported, "boolean");
      assert.equal(typeof f.requiresManualReview, "boolean");
      assert.ok("checkedAt" in f);
    }
  });

  it("returns remaining unsupported facts as not_checked and never passed", async () => {
    const result = await build({});
    for (const key of [
      "registration_documents_complete",
      "distinct_website_key_available",
    ]) {
      const f = factByKey(result, key);
      assert.equal(f.supported, false);
      assert.equal(f.status, STATUSES.NOT_CHECKED);
      assert.match(f.explanation, /does not yet store/i);
      assert.notEqual(f.status, STATUSES.PASSED);
    }
  });

  it("maps canonical email-verification status without treating sent or expired as verified", async () => {
    const sent = await build({
      emailVerification: {
        status: "sent",
        email: "pat@example.com",
        sentAt: "2026-07-22T12:00:00.000Z",
        expiresAt: "2026-07-23T12:00:00.000Z",
      },
    });
    const sentFact = factByKey(sent, "applicant_email_verified");
    assert.equal(sentFact.supported, true);
    assert.equal(sentFact.status, STATUSES.NOT_CHECKED);
    assert.equal(sentFact.result, "email_verification_sent");
    assert.notEqual(sentFact.status, STATUSES.PASSED);
    assert.match(sentFact.explanation, /not treated as verified/i);

    const expired = await build({
      emailVerification: {
        status: "expired",
        email: "pat@example.com",
        sentAt: "2026-07-20T12:00:00.000Z",
        expiresAt: "2026-07-21T12:00:00.000Z",
      },
    });
    const expiredFact = factByKey(expired, "applicant_email_verified");
    assert.equal(expiredFact.supported, true);
    assert.equal(expiredFact.status, STATUSES.WARNING);
    assert.equal(expiredFact.result, "email_verification_expired");
    assert.notEqual(expiredFact.status, STATUSES.PASSED);

    const verified = await build({
      emailVerification: {
        status: "verified",
        email: "pat@example.com",
        verifiedAt: "2026-07-22T13:00:00.000Z",
      },
    });
    const verifiedFact = factByKey(verified, "applicant_email_verified");
    assert.equal(verifiedFact.status, STATUSES.PASSED);
    assert.equal(verifiedFact.result, "email_ownership_verified");

    const unavailable = await build({
      emailVerification: {
        status: "not_sent",
        unavailable: true,
        email: null,
        sentAt: null,
        expiresAt: null,
        verifiedAt: null,
        invalidatedAt: null,
      },
    });
    assert.equal(factByKey(unavailable, "applicant_email_verified").status, STATUSES.WARNING);

    const replaced = await build({
      emailVerification: { status: "replaced", email: "pat@example.com" },
    });
    assert.equal(factByKey(replaced, "applicant_email_verified").status, STATUSES.NOT_CHECKED);

    const notSent = await build({
      emailVerification: { status: "not_sent", email: null },
    });
    assert.equal(factByKey(notSent, "applicant_email_verified").status, STATUSES.NOT_CHECKED);

    // Email uniqueness stays separate even when ownership is verified.
    const unique = factByKey(verified, "email_unique_platform_users_only");
    assert.ok(unique);
    assert.notEqual(unique.key, verifiedFact.key);
    assert.match(unique.explanation, /does not confirm email ownership/i);
  });

  it("does not change approval eligibility when email ownership is unverified", async () => {
    const eligible = await build({
      application: baseApp({ riskReviewActionsAvailable: true }),
      emailVerification: { status: "sent", email: "pat@example.com" },
    });
    const gate = factByKey(eligible, "approval_eligible_current_rules");
    assert.equal(gate.status, STATUSES.PASSED);

    const ineligible = await build({
      application: baseApp({
        riskReviewActionsAvailable: false,
        networkApproveAvailable: false,
        retryProvisionAvailable: false,
      }),
      emailVerification: { status: "verified", email: "pat@example.com" },
    });
    const gate2 = factByKey(ineligible, "approval_eligible_current_rules");
    assert.equal(gate2.status, STATUSES.FAILED);
    assert.equal(factByKey(ineligible, "applicant_email_verified").status, STATUSES.PASSED);
  });

  it("states partial scopes for phone and email uniqueness", async () => {
    const result = await build({
      findOccupyingPhoneMatch: async () => null,
      findUserByEmail: async () => null,
    });
    const phone = factByKey(result, "phone_unique_registration_scope");
    const email = factByKey(result, "email_unique_platform_users_only");
    assert.match(phone.explanation, /registration applications only/i);
    assert.match(email.explanation, /platform users only/i);
    assert.match(email.explanation, /does not confirm email ownership/i);
  });

  it("marks phone duplicate found via lookup as failed", async () => {
    const result = await build({
      findOccupyingPhoneMatch: async () => ({
        id: "other-id",
        contact_email: "other@example.com",
      }),
    });
    const phone = factByKey(result, "phone_unique_registration_scope");
    assert.equal(phone.status, STATUSES.FAILED);
    assert.equal(phone.result, "duplicate_phone_registration_scope");
  });

  it("marks phone unique via lookup as passed", async () => {
    const result = await build({
      findOccupyingPhoneMatch: async () => null,
    });
    const phone = factByKey(result, "phone_unique_registration_scope");
    assert.equal(phone.status, STATUSES.PASSED);
    assert.equal(phone.result, "unique_registration_scope");
  });

  it("does not invent phone uniqueness without lookup or risk code", async () => {
    const result = await build({});
    const phone = factByKey(result, "phone_unique_registration_scope");
    assert.equal(phone.status, STATUSES.NOT_CHECKED);
    assert.match(phone.explanation, /No live registration-scope lookup/i);
  });

  it("marks exact church-name match as warning", async () => {
    const result = await build({
      findSimilarOrganizationMatch: async () => ({ id: "match-id" }),
    });
    const name = factByKey(result, "church_name_exact_match");
    assert.equal(name.status, STATUSES.WARNING);
    assert.match(name.explanation, /exact match/i);
    assert.match(name.explanation, /never treated as a strong/i);
  });

  it("marks no exact church-name match as passed", async () => {
    const result = await build({
      findSimilarOrganizationMatch: async () => null,
    });
    const name = factByKey(result, "church_name_exact_match");
    assert.equal(name.status, STATUSES.PASSED);
    assert.equal(name.result, "no_exact_match");
  });

  it("detects required fields complete and incomplete", async () => {
    const complete = await build({
      findOccupyingPhoneMatch: async () => null,
    });
    assert.equal(factByKey(complete, "required_fields_complete").status, STATUSES.PASSED);

    const incomplete = await build({
      application: { contactEmail: "", roleInChurch: "" },
    });
    const f = factByKey(incomplete, "required_fields_complete");
    assert.equal(f.status, STATUSES.FAILED);
    assert.match(f.explanation, /incomplete/i);
  });

  it("detects eligible and ineligible plans", async () => {
    const ok = await build({});
    assert.equal(factByKey(ok, "requested_plan_eligible").status, STATUSES.PASSED);

    const bad = await build({ application: { selectedPlan: "enterprise" } });
    assert.equal(factByKey(bad, "requested_plan_eligible").status, STATUSES.FAILED);
  });

  it("detects linked and unlinked organization", async () => {
    const unlinked = await build({});
    assert.equal(factByKey(unlinked, "organization_linked").result, "unlinked");
    assert.equal(factByKey(unlinked, "organization_linked").status, STATUSES.NOT_CHECKED);

    const linked = await build({
      application: { organizationId: "org-1", organizationKey: "grace-test" },
    });
    assert.equal(factByKey(linked, "organization_linked").status, STATUSES.PASSED);
    assert.equal(factByKey(linked, "organization_linked").result, "linked");
  });

  it("reports risk decision present and absent without implying low risk", async () => {
    const present = await build({});
    const p = factByKey(present, "risk_decision_present");
    assert.equal(p.status, STATUSES.PASSED);
    assert.match(p.explanation, /does not mean low risk/i);

    const absent = await build({ application: { riskDecision: null, riskReasonCodes: [] } });
    const a = factByKey(absent, "risk_decision_present");
    assert.equal(a.status, STATUSES.NOT_CHECKED);
    assert.match(a.explanation, /does not mean low risk/i);
  });

  it("detects follow-up required and not required", async () => {
    const notRequired = await build({});
    assert.equal(factByKey(notRequired, "support_or_follow_up_required").status, STATUSES.PASSED);

    const required = await build({ application: { supportRequested: true } });
    assert.equal(factByKey(required, "support_or_follow_up_required").status, STATUSES.WARNING);

    const network = await build({ application: { selectedPlan: "network", supportRequested: false } });
    assert.equal(factByKey(network, "support_or_follow_up_required").status, STATUSES.WARNING);
  });

  it("reflects current approval eligibility flags", async () => {
    const eligible = await build({});
    assert.equal(factByKey(eligible, "approval_eligible_current_rules").status, STATUSES.PASSED);
    assert.match(
      factByKey(eligible, "approval_eligible_current_rules").explanation,
      /current backend approval eligibility/i
    );
    assert.match(
      factByKey(eligible, "approval_eligible_current_rules").explanation,
      /not the future Phase2/i
    );

    const ineligible = await build({
      application: {
        riskReviewActionsAvailable: false,
        networkApproveAvailable: false,
        retryProvisionAvailable: false,
      },
    });
    assert.equal(factByKey(ineligible, "approval_eligible_current_rules").status, STATUSES.FAILED);
  });

  it("limits email uniqueness to platform users", async () => {
    const unique = await build({ findUserByEmail: async () => null });
    assert.equal(factByKey(unique, "email_unique_platform_users_only").status, STATUSES.PASSED);

    const taken = await build({
      findUserByEmail: async () => ({ id: "user-1", email_normalized: "pat@example.com" }),
    });
    assert.equal(factByKey(taken, "email_unique_platform_users_only").status, STATUSES.WARNING);
  });

  it("does not treat support-contact notes as structured phone verification", async () => {
    const result = await build({
      contacts: [
        {
          contactMethod: "phone",
          outcome: "reached",
          note: "Spoke briefly",
          contactedAt: "2026-07-02T09:00:00.000Z",
        },
      ],
    });
    const contacted = factByKey(result, "applicant_contacted_by_phone");
    assert.equal(contacted.status, STATUSES.NOT_CHECKED);
    assert.match(contacted.explanation, /structured phone-verification/i);
    assert.match(contacted.explanation, /support-contact/i);
    assert.equal(factByKey(result, "applicant_identity_confirmed").status, STATUSES.NOT_CHECKED);
    assert.equal(factByKey(result, "applicant_authority_confirmed").status, STATUSES.NOT_CHECKED);
  });

  it("treats terms acceptance as not verified authority", async () => {
    const result = await build({});
    const f = factByKey(result, "authority_terms_accepted");
    assert.equal(f.status, STATUSES.PASSED);
    assert.match(f.explanation, /does not independently verify/i);
    assert.match(f.explanation, /authority/i);
    assert.equal(factByKey(result, "applicant_authority_confirmed").status, STATUSES.NOT_CHECKED);
  });

  it("handles missing optional values without throwing", async () => {
    const result = await build({
      application: {
        churchName: "Only Name",
        country: "",
        city: "",
        contactName: "",
        roleInChurch: "",
        contactEmail: "",
        contactPhone: "",
        contactPhoneNormalized: "",
        selectedPlan: "",
        consentTerms: false,
        riskDecision: null,
        riskReasonCodes: null,
        applicationStatus: "submitted",
        riskReviewActionsAvailable: false,
        networkApproveAvailable: false,
        retryProvisionAvailable: false,
      },
      contacts: undefined,
    });
    assert.ok(Array.isArray(result.facts));
    assert.equal(result.facts.length, FACT_DEFS.length);
  });

  it("computes summary counts and stays deterministic", async () => {
    const a = await build({
      findOccupyingPhoneMatch: async () => null,
      findSimilarOrganizationMatch: async () => null,
      findUserByEmail: async () => null,
    });
    const b = await build({
      findOccupyingPhoneMatch: async () => null,
      findSimilarOrganizationMatch: async () => null,
      findUserByEmail: async () => null,
    });
    assert.deepEqual(a.summary, b.summary);
    assert.deepEqual(
      a.facts.map((f) => ({ key: f.key, status: f.status, result: f.result })),
      b.facts.map((f) => ({ key: f.key, status: f.status, result: f.result }))
    );
    const sum =
      a.summary.passed +
      a.summary.warning +
      a.summary.failed +
      a.summary.notChecked +
      a.summary.manuallyReviewed;
    assert.equal(sum, a.facts.length);
    assert.equal(a.summary.supported + a.summary.unsupported, a.facts.length);
    assert.equal(a.summary.unsupported, 2);
  });

  it("reports provisioning prerequisites under current rules", async () => {
    const ok = await build({});
    assert.equal(
      factByKey(ok, "provisioning_prerequisites_current_rules").status,
      STATUSES.PASSED
    );

    const networkBlocked = await build({
      application: {
        selectedPlan: "network",
        followUpStatus: "validation_pending",
        riskReviewActionsAvailable: false,
        networkApproveAvailable: false,
      },
    });
    assert.equal(
      factByKey(networkBlocked, "provisioning_prerequisites_current_rules").status,
      STATUSES.FAILED
    );
    assert.equal(
      factByKey(networkBlocked, "provisioning_prerequisites_current_rules").result,
      "network_validation_required"
    );
  });

  it("detects final reviewer note presence", async () => {
    const absent = await build({ contacts: [] });
    assert.equal(factByKey(absent, "final_reviewer_note_present").status, STATUSES.NOT_CHECKED);

    const present = await build({
      application: { reviewNotes: "Looks legitimate after call." },
    });
    assert.equal(factByKey(present, "final_reviewer_note_present").status, STATUSES.MANUALLY_REVIEWED);
  });

  it("accepts snake_case application rows", async () => {
    const result = await buildRegistrationVerificationFacts({
      now: NOW,
      application: {
        church_name: "Snake Church",
        country: "Kenya",
        city: "Nairobi",
        contact_name: "Sam",
        role_in_church: "Admin",
        contact_email: "sam@example.com",
        contact_phone_normalized: "+254700000001",
        selected_plan: "growth",
        consent_terms: true,
        application_status: "submitted",
        provisioning_status: "not_started",
        risk_decision: "review_required",
        risk_reason_codes: ["duplicate_email"],
        riskReviewActionsAvailable: true,
      },
      findUserByEmail: async () => ({ id: "u1" }),
    });
    assert.equal(factByKey(result, "required_fields_complete").status, STATUSES.PASSED);
    assert.equal(factByKey(result, "email_unique_platform_users_only").status, STATUSES.WARNING);
    assert.equal(factByKey(result, "risk_decision_present").result, "review_required");
  });
});

describe("registrationVerificationFacts phone evidence (Prompt 032, no Postgres)", () => {
  it("marks three facts not_checked when there are no attempts", async () => {
    const result = await build({ phoneVerification: phonePayload([]) });
    assert.equal(factByKey(result, "applicant_contacted_by_phone").status, STATUSES.NOT_CHECKED);
    assert.equal(factByKey(result, "applicant_identity_confirmed").status, STATUSES.NOT_CHECKED);
    assert.equal(factByKey(result, "applicant_authority_confirmed").status, STATUSES.NOT_CHECKED);
    assert.equal(factByKey(result, "applicant_identity_confirmed").supported, true);
    assert.equal(factByKey(result, "applicant_authority_confirmed").supported, true);
  });

  it("marks applicant contacted from answered attempts only", async () => {
    const answered = await build({
      phoneVerification: phonePayload([
        {
          id: "1",
          attempted_at: "2026-07-20T10:00:00.000Z",
          outcome: "answered",
          verification_result: "pending",
          applicant_identity_status: "not_checked",
          applicant_authority_status: "not_checked",
        },
      ]),
    });
    assert.equal(factByKey(answered, "applicant_contacted_by_phone").status, STATUSES.PASSED);
    assert.match(factByKey(answered, "applicant_contacted_by_phone").explanation, /structured/i);
    assert.equal(factByKey(answered, "applicant_identity_confirmed").status, STATUSES.NOT_CHECKED);

    const noAnswer = await build({
      phoneVerification: phonePayload([
        {
          id: "1",
          attempted_at: "2026-07-20T10:00:00.000Z",
          outcome: "no_answer",
          verification_result: "pending",
        },
      ]),
    });
    assert.equal(factByKey(noAnswer, "applicant_contacted_by_phone").status, STATUSES.NOT_CHECKED);

    const wrong = await build({
      phoneVerification: phonePayload([
        {
          id: "1",
          attempted_at: "2026-07-20T10:00:00.000Z",
          outcome: "wrong_number",
          verification_result: "failed",
          verification_reason: "wrong",
        },
      ]),
    });
    assert.equal(factByKey(wrong, "applicant_contacted_by_phone").status, STATUSES.NOT_CHECKED);
  });

  it("maps explicit identity and authority evidence", async () => {
    const confirmed = await build({
      phoneVerification: phonePayload([
        {
          id: "1",
          attempted_at: "2026-07-20T10:00:00.000Z",
          outcome: "answered",
          verification_result: "pending",
          applicant_identity_status: "confirmed",
          applicant_authority_status: "confirmed",
        },
      ]),
    });
    assert.equal(factByKey(confirmed, "applicant_identity_confirmed").status, STATUSES.PASSED);
    assert.equal(factByKey(confirmed, "applicant_authority_confirmed").status, STATUSES.PASSED);

    const denied = await build({
      phoneVerification: phonePayload([
        {
          id: "1",
          attempted_at: "2026-07-20T10:00:00.000Z",
          outcome: "answered",
          verification_result: "pending",
          applicant_identity_status: "not_confirmed",
          applicant_authority_status: "not_confirmed",
        },
      ]),
    });
    assert.equal(factByKey(denied, "applicant_identity_confirmed").status, STATUSES.FAILED);
    assert.equal(factByKey(denied, "applicant_authority_confirmed").status, STATUSES.FAILED);
  });

  it("does not confirm authority from terms alone", async () => {
    const result = await build({
      application: { consentTerms: true },
      phoneVerification: phonePayload([]),
    });
    assert.equal(factByKey(result, "authority_terms_accepted").status, STATUSES.PASSED);
    assert.equal(factByKey(result, "applicant_authority_confirmed").status, STATUSES.NOT_CHECKED);
  });

  it("uses newest relevant explicit identity and authority evidence", async () => {
    const identity = await build({
      phoneVerification: phonePayload([
        {
          id: "new",
          attempted_at: "2026-07-22T10:00:00.000Z",
          outcome: "answered",
          verification_result: "pending",
          applicant_identity_status: "not_confirmed",
          applicant_authority_status: "not_checked",
        },
        {
          id: "old",
          attempted_at: "2026-07-20T10:00:00.000Z",
          outcome: "answered",
          verification_result: "pending",
          applicant_identity_status: "confirmed",
          applicant_authority_status: "confirmed",
        },
      ]),
    });
    assert.equal(factByKey(identity, "applicant_identity_confirmed").status, STATUSES.FAILED);
    assert.equal(factByKey(identity, "applicant_authority_confirmed").status, STATUSES.PASSED);

    const keep = await build({
      phoneVerification: phonePayload([
        {
          id: "later",
          attempted_at: "2026-07-22T10:00:00.000Z",
          outcome: "no_answer",
          verification_result: "pending",
          applicant_identity_status: "not_checked",
          applicant_authority_status: "not_checked",
        },
        {
          id: "earlier",
          attempted_at: "2026-07-20T10:00:00.000Z",
          outcome: "answered",
          verification_result: "pending",
          applicant_identity_status: "confirmed",
          applicant_authority_status: "confirmed",
        },
      ]),
    });
    assert.equal(factByKey(keep, "applicant_identity_confirmed").status, STATUSES.PASSED);
    assert.equal(factByKey(keep, "applicant_authority_confirmed").status, STATUSES.PASSED);
  });

  it("warns safely when phone history is unavailable", async () => {
    const result = await build({
      phoneVerification: {
        attempts: [],
        summary: {
          totalAttempts: 0,
          applicantContacted: false,
          identityConfirmed: false,
          authorityConfirmed: false,
          latestIdentityStatus: "not_checked",
          latestAuthorityStatus: "not_checked",
        },
        unavailable: true,
      },
    });
    assert.equal(factByKey(result, "applicant_contacted_by_phone").status, STATUSES.WARNING);
    assert.equal(factByKey(result, "applicant_identity_confirmed").status, STATUSES.WARNING);
    assert.equal(factByKey(result, "applicant_authority_confirmed").status, STATUSES.WARNING);
    assert.doesNotMatch(JSON.stringify(result), /ECONNREFUSED|password|stack/i);
  });

  it("leaves phone uniqueness unchanged and does not invent a verification-status fact", async () => {
    const result = await build({
      phoneVerification: phonePayload([
        {
          id: "1",
          attempted_at: "2026-07-20T10:00:00.000Z",
          outcome: "answered",
          verification_result: "verified",
          verification_reason: "ok",
          applicant_identity_status: "confirmed",
          applicant_authority_status: "not_checked",
        },
      ]),
      findOccupyingPhoneMatch: async () => null,
    });
    assert.equal(factByKey(result, "phone_unique_registration_scope").status, STATUSES.PASSED);
    assert.equal(factByKey(result, "applicant_authority_confirmed").status, STATUSES.NOT_CHECKED);
    assert.ok(!result.facts.some((f) => /phone_verification_status|phone_verified/.test(f.key)));
  });
});
