"use strict";

/**
 * Phase2 — registration verification UI (read-only) on detail page.
 * No PostgreSQL required.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");
const ejs = require("ejs");

const registrationStatus = require("../src/blessboard/services/registrationStatusPresentation");
const {
  buildRegistrationVerificationFacts,
} = require("../src/blessboard/services/registrationVerificationFacts");

const VIEW = path.join(
  __dirname,
  "../views/blessboard/v5/platform-admin/registration-application-detail.ejs"
);
const PARTIALS = path.join(__dirname, "../views/blessboard/v5/partials");

function baseApp(overrides = {}) {
  return {
    id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    churchName: "Grace Test Church",
    contactName: "Pat Applicant",
    contactEmail: "pat@example.com",
    contactPhone: "+260971000001",
    contactPhoneNormalized: "+260971000001",
    roleInChurch: "Pastor",
    city: "Lusaka",
    country: "Zambia",
    selectedPlan: "foundation",
    selectedPlanLabel: "Foundation",
    isNetworkPlan: false,
    supportRequested: false,
    consentTerms: true,
    createdAt: "2026-07-01T12:00:00.000Z",
    applicationStatus: "submitted",
    provisioningStatus: "not_started",
    followUpStatus: "contact_pending",
    displayStatus: "Needs review",
    operatorTone: "warn",
    riskReviewActionsAvailable: true,
    rejectActionsAvailable: true,
    retryProvisionAvailable: false,
    networkApproveAvailable: false,
    markValidationCompleteAvailable: false,
    followUpAvailable: true,
    supportAssignmentAvailable: true,
    contactHistoryAvailable: true,
    linkOrganizationAvailable: false,
    operatorView: {
      displayStatus: "Needs review",
      tone: "warn",
      queue: "needs_review",
      explanation: "Held for review.",
      recommendedActionLabel: "Approve and provision",
    },
    ...overrides,
  };
}

function renderDetail(locals = {}) {
  const source = fs.readFileSync(VIEW, "utf8");
  const wrapped = source
    .replace("<%- include('../partials/platform-admin-shell-start') %>", "<!-- shell-start -->")
    .replace("<%- include('../partials/platform-admin-shell-end') %>", "<!-- shell-end -->");
  return ejs.render(
    wrapped,
    {
      registrationStatus,
      application: baseApp(),
      contacts: [],
      auditEvents: [],
      platformAdmins: [],
      followUpStatuses: ["contact_pending"],
      contactMethods: ["phone", "email"],
      contactOutcomes: ["reached", "other"],
      csrfField: "_csrf",
      csrfToken: "test-csrf",
      notice: null,
      error: null,
      verification: null,
      ...locals,
    },
    {
      filename: VIEW,
      root: PARTIALS,
      views: [PARTIALS],
    }
  );
}

describe("registration verification UI (no Postgres)", () => {
  it("renders verification section, summary, and every fact label", async () => {
    const verification = await buildRegistrationVerificationFacts({
      now: "2026-07-23T16:00:00.000Z",
      application: baseApp(),
      contacts: [],
      findOccupyingPhoneMatch: async () => null,
      findSimilarOrganizationMatch: async () => null,
      findUserByEmail: async () => null,
    });
    const html = renderDetail({ verification });
    assert.match(html, /data-bb-pa-reg-verification="1"/);
    assert.match(html, /href="#reg-verification"/);
    assert.match(html, /id="reg-verification"/);
    assert.match(html, /data-bb-pa-reg-verification-summary="1"/);
    assert.match(html, /data-bb-pa-reg-verification-count="passed"/);
    assert.match(html, /data-bb-pa-reg-verification-count="warning"/);
    assert.match(html, /data-bb-pa-reg-verification-count="failed"/);
    assert.match(html, /data-bb-pa-reg-verification-count="notChecked"/);
    assert.match(html, /data-bb-pa-reg-verification-count="supported"/);
    assert.match(html, /data-bb-pa-reg-verification-count="unsupported"/);
    assert.match(html, /Last checked/);
    assert.match(html, /2026-07-23 16:00 UTC/);
    assert.match(html, /data-bb-pa-reg-verification-grid="1"/);
    for (const fact of verification.facts) {
      assert.match(html, new RegExp(fact.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(
        html,
        new RegExp(`data-bb-pa-reg-verification-fact-key="${fact.key}"`)
      );
    }
  });

  it("uses the shared verification status chip partial", async () => {
    const verification = await buildRegistrationVerificationFacts({
      now: "2026-07-23T16:00:00.000Z",
      application: baseApp(),
      findOccupyingPhoneMatch: async () => null,
      findSimilarOrganizationMatch: async () => null,
      findUserByEmail: async () => null,
    });
    const html = renderDetail({ verification });
    assert.match(html, /data-bb-pa-reg-status="1"/);
    assert.match(html, /data-bb-pa-reg-status-kind="verification"/);
    assert.match(html, /data-bb-pa-reg-status-value="passed"/);
    assert.match(html, /data-bb-pa-reg-status-value="not_checked"/);
  });

  it("distinguishes supported and unsupported facts", async () => {
    const verification = await buildRegistrationVerificationFacts({
      now: "2026-07-23T16:00:00.000Z",
      application: baseApp(),
      findOccupyingPhoneMatch: async () => null,
      findSimilarOrganizationMatch: async () => null,
      findUserByEmail: async () => null,
    });
    const html = renderDetail({ verification });
    assert.match(html, /data-bb-pa-reg-verification-supported="0"/);
    assert.match(html, /data-bb-pa-reg-verification-unsupported="1"/);
    assert.match(html, /not currently supported/i);
    assert.match(html, /does not yet store the required evidence/i);
    assert.match(html, /bb-pa-reg-verification-fact--unsupported/);
  });

  it("preserves partial-scope explanations", async () => {
    const verification = await buildRegistrationVerificationFacts({
      now: "2026-07-23T16:00:00.000Z",
      application: baseApp(),
      contacts: [{ contactMethod: "phone", note: "Called", contactedAt: "2026-07-02T09:00:00.000Z" }],
      findOccupyingPhoneMatch: async () => null,
      findSimilarOrganizationMatch: async () => null,
      findUserByEmail: async () => null,
    });
    const html = renderDetail({ verification });
    assert.match(html, /registration applications only/i);
    assert.match(html, /platform users only/i);
    assert.match(html, /structured phone-verification/i);
    assert.match(html, /support-contact/i);
    assert.match(html, /does not independently verify/i);
    assert.match(html, /not the future Phase2 verification checklist/i);
    assert.match(html, /does not mean low risk/i);
  });

  it("handles missing verification object safely", () => {
    const html = renderDetail({ verification: null });
    assert.match(html, /data-bb-pa-reg-verification="1"/);
    assert.match(html, /data-bb-pa-reg-verification-missing="1"/);
    assert.match(html, /Verification information is not available/);
    assert.doesNotMatch(html, /data-bb-pa-reg-verification-grid="1"/);
    assert.doesNotMatch(html, /verification complete|all checks passed/i);
  });

  it("handles empty facts safely", () => {
    const html = renderDetail({
      verification: {
        facts: [],
        summary: { passed: 0, warning: 0, failed: 0, notChecked: 0, supported: 0, unsupported: 0 },
        checkedAt: null,
      },
    });
    assert.match(html, /data-bb-pa-reg-verification-empty="1"/);
    assert.match(html, /Verification information is not available/);
  });

  it("omits active verification POST controls and recommendations", async () => {
    const verification = await buildRegistrationVerificationFacts({
      now: "2026-07-23T16:00:00.000Z",
      application: baseApp(),
      findOccupyingPhoneMatch: async () => null,
      findSimilarOrganizationMatch: async () => null,
      findUserByEmail: async () => null,
    });
    const html = renderDetail({ verification });
    assert.doesNotMatch(html, /action="[^"]*\/verification"/i);
    // Email resend (Prompt 040) is allowed on detail; omit dedicated verification workspace controls.
    assert.doesNotMatch(html, /name="verification_override"|Run again|Start call/i);
    assert.doesNotMatch(html, /overall recommendation|verification complete/i);
    assert.match(html, /data-bb-pa-reg-verification-advisory="1"/);
    assert.match(html, /Verification results are advisory/i);
  });

  it("preserves Approve and Reject forms unchanged", async () => {
    const verification = await buildRegistrationVerificationFacts({
      now: "2026-07-23T16:00:00.000Z",
      application: baseApp(),
      findOccupyingPhoneMatch: async () => null,
      findSimilarOrganizationMatch: async () => null,
      findUserByEmail: async () => null,
    });
    const html = renderDetail({ verification });
    assert.match(html, /data-bb-pa-approve-form="1"/);
    assert.match(
      html,
      /method="post"\s+action="\/admin\/registration-applications\/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee\/approve"/
    );
    assert.match(html, /data-bb-pa-reject-form="1"/);
    assert.match(
      html,
      /method="post"\s+action="\/admin\/registration-applications\/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee\/reject"/
    );
  });

  it("uses mobile-friendly card grid structure", async () => {
    const verification = await buildRegistrationVerificationFacts({
      now: "2026-07-23T16:00:00.000Z",
      application: baseApp(),
      findOccupyingPhoneMatch: async () => null,
      findSimilarOrganizationMatch: async () => null,
      findUserByEmail: async () => null,
    });
    const html = renderDetail({ verification });
    assert.match(html, /bb-pa-reg-verification__grid/);
    assert.match(html, /bb-pa-reg-verification-fact/);
    assert.doesNotMatch(html, /<table[^>]*verification/i);
  });

  it("escapes applicant-provided text in the surrounding detail page", () => {
    const html = renderDetail({
      application: baseApp({
        churchName: '<img src=x onerror=alert(1)>Evil',
        contactName: '<script>alert(2)</script>',
      }),
      verification: null,
    });
    assert.doesNotMatch(html, /<img src=x onerror=/);
    assert.doesNotMatch(html, /<script>alert\(2\)<\/script>/);
    assert.match(html, /&lt;img|&lt;script&gt;/);
  });
});
