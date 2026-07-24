"use strict";

/**
 * Phase2 Prompt 042 — email ownership wired into verification facts / checklist (stubbed).
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it, before, after } = require("node:test");

const repo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const {
  getRegistrationApplicationDetail,
  loadRegistrationVerificationForDetail,
  loadRegistrationApprovalChecklistForDetail,
  loadRegistrationReviewRecommendationForDetail,
} = require("../src/blessboard/services/registrationApplicationsAdminService");
const {
  buildRegistrationVerificationFacts,
  STATUSES,
  computeApprovalEligible,
} = require("../src/blessboard/services/registrationVerificationFacts");
const {
  buildRegistrationApprovalChecklist,
  STATUSES: CHECKLIST_STATUSES,
} = require("../src/blessboard/services/registrationApprovalChecklist");

const NOW = "2026-07-23T12:00:00.000Z";
const APP_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const ADMIN_SERVICE = path.join(
  __dirname,
  "../src/blessboard/services/registrationApplicationsAdminService.js"
);

function sampleApplication(overrides = {}) {
  return {
    id: APP_ID,
    churchName: "Grace Test Church",
    contactEmail: "pat@example.com",
    contactPhone: "+260971000001",
    contactPhoneNormalized: "+260971000001",
    country: "Zambia",
    city: "Lusaka",
    selectedPlan: "foundation",
    applicationStatus: "submitted",
    provisioningStatus: "not_started",
    followUpStatus: "contact_pending",
    consentTerms: true,
    riskDecision: "review",
    riskReasonCodes: [],
    riskReviewActionsAvailable: true,
    networkApproveAvailable: false,
    retryProvisionAvailable: false,
    ...overrides,
  };
}

function fakeDbRow() {
  return {
    id: APP_ID,
    church_name: "Grace Test Church",
    contact_email: "pat@example.com",
    contact_phone: "+260971000001",
    contact_phone_normalized: "+260971000001",
    country: "Zambia",
    city: "Lusaka",
    selected_plan: "foundation",
    application_status: "submitted",
    provisioning_status: "not_started",
    follow_up_status: "contact_pending",
    consent_terms: true,
    risk_decision: "review",
    risk_reason_codes: [],
    support_requested: false,
    role_in_church: "Pastor",
    review_notes: "",
    review_events: [],
    created_at: "2026-07-01T12:00:00.000Z",
  };
}

describe("email ownership verification facts wiring (Prompt 042)", () => {
  it("treats sent as not verified and expired as warning, not passed", async () => {
    const sent = await buildRegistrationVerificationFacts({
      now: NOW,
      application: sampleApplication(),
      emailVerification: { status: "sent", email: "pat@example.com" },
      findUserByEmail: async () => null,
    });
    const sentFact = sent.facts.find((f) => f.key === "applicant_email_verified");
    assert.equal(sentFact.status, STATUSES.NOT_CHECKED);
    assert.notEqual(sentFact.status, STATUSES.PASSED);

    const expired = await buildRegistrationVerificationFacts({
      now: NOW,
      application: sampleApplication(),
      emailVerification: { status: "expired", email: "pat@example.com" },
      findUserByEmail: async () => null,
    });
    const expiredFact = expired.facts.find((f) => f.key === "applicant_email_verified");
    assert.equal(expiredFact.status, STATUSES.WARNING);
    assert.notEqual(expiredFact.status, STATUSES.PASSED);
  });

  it("completes the checklist item when email ownership is verified", () => {
    const verification = {
      facts: [
        {
          key: "applicant_email_verified",
          label: "Applicant email verified",
          status: STATUSES.PASSED,
          result: "email_ownership_verified",
          explanation: "verified",
          source: "registration_email_verification_tokens",
          checkedAt: NOW,
          supported: true,
          requiresManualReview: false,
        },
      ],
      summary: {},
      checkedAt: NOW,
    };
    const checklist = buildRegistrationApprovalChecklist({
      verification,
      now: NOW,
    });
    const item = checklist.items.find((i) => i.key === "applicant_email_verified");
    assert.equal(item.status, CHECKLIST_STATUSES.COMPLETE);
    assert.equal(item.supported, true);
  });

  it("keeps the approval gate unchanged when ownership is verified or only sent", async () => {
    const eligible = await buildRegistrationVerificationFacts({
      now: NOW,
      application: sampleApplication({ riskReviewActionsAvailable: true }),
      emailVerification: { status: "sent", email: "pat@example.com" },
      findUserByEmail: async () => null,
    });
    assert.equal(
      eligible.facts.find((f) => f.key === "approval_eligible_current_rules").status,
      STATUSES.PASSED
    );

    const ineligible = await buildRegistrationVerificationFacts({
      now: NOW,
      application: sampleApplication({
        riskReviewActionsAvailable: false,
        networkApproveAvailable: false,
        retryProvisionAvailable: false,
      }),
      emailVerification: { status: "verified", email: "pat@example.com" },
      findUserByEmail: async () => null,
    });
    assert.equal(
      ineligible.facts.find((f) => f.key === "approval_eligible_current_rules").status,
      STATUSES.FAILED
    );
    assert.equal(
      ineligible.facts.find((f) => f.key === "applicant_email_verified").status,
      STATUSES.PASSED
    );
    assert.equal(
      computeApprovalEligible({
        flagsProvided: true,
        riskReviewActionsAvailable: false,
        networkApproveAvailable: false,
        retryProvisionAvailable: false,
      }),
      false
    );
  });

  describe("detail loader wiring", () => {
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

    it("passes emailVerification into facts once and does not reload token status", async () => {
      repo.getRegistrationApplicationById = async () => fakeDbRow();
      repo.listActivePlatformAdministrators = async () => [];

      let statusLoads = 0;
      let factsSawEmail = null;
      const detail = await getRegistrationApplicationDetail(
        {
          query: async () => ({ rows: [] }),
        },
        APP_ID,
        {},
        {
          getPhoneVerificationHistory: async () => [],
          getRegistrationEmailVerificationStatus: async () => {
            statusLoads += 1;
            return {
              status: "verified",
              token: {
                email: "pat@example.com",
                sentAt: "2026-07-22T12:00:00.000Z",
                expiresAt: "2026-07-23T12:00:00.000Z",
                verifiedAt: "2026-07-22T13:00:00.000Z",
                invalidatedAt: null,
              },
            };
          },
          buildRegistrationVerificationFacts: async (input) => {
            factsSawEmail = input.emailVerification;
            return buildRegistrationVerificationFacts({
              ...input,
              now: NOW,
              findOccupyingPhoneMatch: async () => null,
              findSimilarOrganizationMatch: async () => null,
              findUserByEmail: async () => null,
            });
          },
        }
      );

      assert.equal(detail.ok, true);
      assert.equal(statusLoads, 1, "email status must load once");
      assert.ok(factsSawEmail);
      assert.equal(factsSawEmail.status, "verified");
      const emailFact = detail.verification.facts.find(
        (f) => f.key === "applicant_email_verified"
      );
      assert.equal(emailFact.status, STATUSES.PASSED);
      const checklistItem = detail.approvalChecklist.items.find(
        (i) => i.key === "applicant_email_verified"
      );
      assert.equal(checklistItem.status, CHECKLIST_STATUSES.COMPLETE);
      assert.equal(detail.application.riskReviewActionsAvailable, true);
    });
  });

  it("documents loader order phone → email → facts → recommendation → checklist", () => {
    const source = fs.readFileSync(ADMIN_SERVICE, "utf8");
    const phoneIdx = source.indexOf(
      "const phoneVerification = await loadRegistrationPhoneVerificationForDetail"
    );
    const emailIdx = source.indexOf(
      "const emailVerification = await loadRegistrationEmailVerificationForDetail"
    );
    const factsIdx = source.indexOf(
      "const verification = await loadRegistrationVerificationForDetail"
    );
    const recIdx = source.indexOf(
      "const reviewRecommendation = loadRegistrationReviewRecommendationForDetail"
    );
    const checkIdx = source.indexOf(
      "const approvalChecklist = loadRegistrationApprovalChecklistForDetail"
    );
    assert.ok(phoneIdx > 0 && emailIdx > phoneIdx);
    assert.ok(factsIdx > emailIdx);
    assert.ok(recIdx > factsIdx);
    assert.ok(checkIdx > recIdx);
    assert.match(
      source,
      /\{\s*\.\.\.detailOptions,\s*phoneVerification,\s*emailVerification\s*\}/
    );
  });

  it("recommendation consumes the corrected ownership fact without inventing approval", async () => {
    const verification = await loadRegistrationVerificationForDetail(
      {},
      sampleApplication(),
      [],
      {
        phoneVerification: { attempts: [], summary: { verificationStatus: "not_checked" } },
        emailVerification: { status: "sent", email: "pat@example.com" },
        findOccupyingPhoneMatch: async () => null,
        findSimilarOrganizationMatch: async () => null,
        findUserByEmail: async () => null,
      }
    );
    const recommendation = loadRegistrationReviewRecommendationForDetail(verification, {
      now: NOW,
    });
    const checklist = loadRegistrationApprovalChecklistForDetail(
      verification,
      recommendation,
      { now: NOW }
    );
    const emailFact = verification.facts.find((f) => f.key === "applicant_email_verified");
    assert.equal(emailFact.status, STATUSES.NOT_CHECKED);
    assert.equal(
      checklist.items.find((i) => i.key === "applicant_email_verified").status,
      CHECKLIST_STATUSES.INCOMPLETE
    );
    assert.equal(checklist.advisory, true);
    assert.equal(recommendation.advisory, true);
  });
});
