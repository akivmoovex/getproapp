"use strict";

/**
 * Phase2 Prompt 054 — wire canonical duplicate matches into verification facts,
 * recommendation, and checklist (no Postgres; no auto approve/reject).
 */

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  buildRegistrationVerificationFacts,
  STATUSES,
} = require("../src/blessboard/services/registrationVerificationFacts");
const {
  buildRegistrationReviewRecommendation,
  CODES,
} = require("../src/blessboard/services/registrationReviewRecommendation");
const {
  buildRegistrationApprovalChecklist,
  STATUSES: CHECKLIST_STATUSES,
} = require("../src/blessboard/services/registrationApprovalChecklist");
const {
  loadRegistrationVerificationForDetail,
} = require("../src/blessboard/services/registrationApplicationsAdminService");

const NOW = "2026-07-24T12:00:00.000Z";
const APP_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function baseApp(overrides = {}) {
  return {
    id: APP_ID,
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

function matchRow(overrides = {}) {
  return {
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    riskLevel: "possible",
    score: 12,
    reviewDecision: null,
    reviewReason: null,
    evidenceSnapshot: { signals: ["exact_church_name"] },
    ...overrides,
  };
}

async function build(opts = {}) {
  return buildRegistrationVerificationFacts({
    now: NOW,
    application: baseApp(opts.application),
    contacts: opts.contacts,
    duplicateMatches: opts.duplicateMatches,
    findOccupyingPhoneMatch: opts.findOccupyingPhoneMatch || (async () => null),
    findSimilarOrganizationMatch: opts.findSimilarOrganizationMatch || (async () => null),
    findUserByEmail: opts.findUserByEmail || (async () => null),
  });
}

function factByKey(result, key) {
  return result.facts.find((f) => f.key === key);
}

describe("registrationVerificationFacts duplicate evidence (Prompt 054)", () => {
  it("treats similar/exact name alone as warning, not a strong identifier", async () => {
    const result = await build({
      duplicateMatches: {
        available: true,
        matches: [matchRow({ riskLevel: "possible", evidenceSnapshot: { signals: ["exact_church_name"] } })],
      },
    });
    const name = factByKey(result, "church_name_exact_match");
    const strong = factByKey(result, "strong_duplicate_identifier");
    assert.equal(name.status, STATUSES.WARNING);
    assert.equal(name.result, "exact_name_in_duplicate_matches");
    assert.match(name.explanation, /never treated as a strong/i);
    assert.equal(strong.status, STATUSES.PASSED);
    assert.equal(strong.result, "name_only_not_strong_identifier");

    const rec = buildRegistrationReviewRecommendation({ verification: result, now: NOW });
    assert.equal(rec.code, CODES.MANUAL_REVIEW_REQUIRED);
    assert.ok(!rec.blockingFacts.includes("strong_duplicate_identifier"));
  });

  it("maps strong exact identifiers to failed or warning evidence", async () => {
    const failed = await build({
      duplicateMatches: {
        available: true,
        matches: [
          matchRow({
            riskLevel: "strong",
            evidenceSnapshot: { signals: ["exact_phone_overlap"] },
          }),
        ],
      },
    });
    assert.equal(factByKey(failed, "strong_duplicate_identifier").status, STATUSES.FAILED);
    assert.equal(
      factByKey(failed, "strong_duplicate_identifier").result,
      "strong_exact_identifier_failed"
    );

    const warned = await build({
      duplicateMatches: {
        available: true,
        matches: [
          matchRow({
            riskLevel: "strong",
            evidenceSnapshot: { signals: ["exact_website_domain"] },
          }),
        ],
      },
    });
    assert.equal(factByKey(warned, "strong_duplicate_identifier").status, STATUSES.WARNING);
    assert.equal(
      factByKey(warned, "strong_duplicate_identifier").result,
      "strong_exact_identifier_warning"
    );

    const rec = buildRegistrationReviewRecommendation({ verification: failed, now: NOW });
    assert.equal(rec.code, CODES.HIGH_DUPLICATE_RISK);
    assert.ok(rec.blockingFacts.includes("strong_duplicate_identifier"));
    assert.match(rec.explanation, /does not change the current approval gate/i);
  });

  it("lets different_church satisfy review completion while preserving evidence", async () => {
    const result = await build({
      duplicateMatches: {
        available: true,
        matches: [
          matchRow({
            riskLevel: "possible",
            reviewDecision: "different_church",
            evidenceSnapshot: { signals: ["exact_church_name"] },
          }),
        ],
      },
    });
    const evidence = factByKey(result, "duplicate_review_evidence");
    const name = factByKey(result, "church_name_exact_match");
    assert.equal(evidence.status, STATUSES.MANUALLY_REVIEWED);
    assert.equal(evidence.result, "different_church_reviewed");
    assert.match(evidence.explanation, /preserved/i);
    assert.equal(name.status, STATUSES.WARNING);

    const checklist = buildRegistrationApprovalChecklist({
      verification: result,
      reviewRecommendation: buildRegistrationReviewRecommendation({
        verification: result,
        now: NOW,
      }),
      now: NOW,
    });
    const dupItem = checklist.items.find((i) => i.key === "duplicate_results_reviewed");
    assert.equal(dupItem.status, CHECKLIST_STATUSES.COMPLETE);
    assert.match(dupItem.explanation, /different_church/i);
  });

  it("treats confirmed_duplicate and impersonation_concern as high-risk evidence", async () => {
    for (const decision of ["confirmed_duplicate", "impersonation_concern"]) {
      const result = await build({
        duplicateMatches: {
          available: true,
          matches: [
            matchRow({
              riskLevel: "strong",
              reviewDecision: decision,
              evidenceSnapshot: { signals: ["exact_phone_overlap"] },
            }),
          ],
        },
      });
      const evidence = factByKey(result, "duplicate_review_evidence");
      const risk = factByKey(result, "risk_decision_present");
      assert.equal(evidence.status, STATUSES.FAILED);
      assert.equal(evidence.result, decision);
      assert.equal(risk.status, STATUSES.WARNING);
      assert.equal(risk.result, "allow_with_high_risk_duplicate_decision");

      const rec = buildRegistrationReviewRecommendation({ verification: result, now: NOW });
      assert.equal(rec.code, CODES.HIGH_DUPLICATE_RISK);
      assert.ok(rec.blockingFacts.includes("duplicate_review_evidence"));

      const checklist = buildRegistrationApprovalChecklist({
        verification: result,
        reviewRecommendation: rec,
        now: NOW,
      });
      const dupItem = checklist.items.find((i) => i.key === "duplicate_results_reviewed");
      assert.equal(dupItem.status, CHECKLIST_STATUSES.MANUAL_REVIEW_REQUIRED);
    }
  });

  it("does not invent automatic approval or rejection from match evidence", async () => {
    const result = await build({
      duplicateMatches: {
        available: true,
        matches: [
          matchRow({
            riskLevel: "confirmed",
            reviewDecision: "confirmed_duplicate",
            evidenceSnapshot: { signals: ["exact_registration_number"] },
          }),
        ],
      },
    });
    for (const key of [
      "strong_duplicate_identifier",
      "duplicate_review_evidence",
      "risk_decision_present",
    ]) {
      assert.match(factByKey(result, key).explanation, /does not automatically/i);
    }
    const rec = buildRegistrationReviewRecommendation({ verification: result, now: NOW });
    assert.equal(rec.advisory, true);
    assert.match(rec.explanation, /does not change the current approval gate/i);
    assert.notEqual(rec.code, CODES.RECOMMENDED_FOR_APPROVAL);
  });

  it("loader passes canonical matches into facts once without scoring writes", async () => {
    let listCalls = 0;
    const verification = await loadRegistrationVerificationForDetail(
      { query: async () => ({ rows: [] }) },
      baseApp(),
      [],
      {
        listDuplicateMatches: async () => {
          listCalls += 1;
          return {
            ok: true,
            matches: [
              matchRow({
                riskLevel: "strong",
                evidenceSnapshot: { signals: ["exact_registration_number"] },
              }),
            ],
          };
        },
        findOccupyingPhoneMatch: async () => null,
        findSimilarOrganizationMatch: async () => null,
        findUserByEmail: async () => null,
        buildRegistrationVerificationFacts: async (input) =>
          buildRegistrationVerificationFacts({ ...input, now: NOW }),
      }
    );
    assert.equal(listCalls, 1);
    assert.equal(factByKey(verification, "strong_duplicate_identifier").status, STATUSES.FAILED);
    assert.equal(
      factByKey(verification, "strong_duplicate_identifier").result,
      "strong_exact_identifier_failed"
    );
  });
});
