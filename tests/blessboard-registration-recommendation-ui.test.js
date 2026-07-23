"use strict";

/**
 * Phase2 — advisory recommendation UI on registration detail (no Postgres).
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");
const ejs = require("ejs");

const registrationStatus = require("../src/blessboard/services/registrationStatusPresentation");
const {
  LABELS,
  CODES,
} = require("../src/blessboard/services/registrationReviewRecommendation");

const VIEW = path.join(
  __dirname,
  "../views/blessboard/v5/platform-admin/registration-application-detail.ejs"
);
const PARTIALS = path.join(__dirname, "../views/blessboard/v5/partials");
const CSS = path.join(__dirname, "../public/blessboard/v5/platform-admin.css");
const ROUTE = path.join(__dirname, "../src/platform/http/platformAdminRoutes.js");

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

function sampleRecommendation(overrides = {}) {
  return {
    code: CODES.MANUAL_REVIEW_REQUIRED,
    label: LABELS[CODES.MANUAL_REVIEW_REQUIRED],
    tone: "warn",
    explanation:
      "Supported verification signals require manual review. This is an advisory recommendation and does not change the current approval gate.",
    reasons: [
      {
        factKey: "church_name_exact_match",
        status: "warning",
        message: "Exact church name match found at same city and country.",
      },
      {
        factKey: "email_unique_platform_users_only",
        status: "warning",
        message: "Email uniqueness warning covers platform users only.",
      },
    ],
    blockingFacts: [],
    warningFacts: ["church_name_exact_match", "email_unique_platform_users_only"],
    calculatedAt: "2026-07-23T18:30:00.000Z",
    advisory: true,
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
      verification: {
        facts: [
          {
            key: "church_name_exact_match",
            label: "Exact church name match at same city and country",
            status: "warning",
            supported: true,
          },
        ],
        summary: {},
        checkedAt: null,
      },
      reviewRecommendation: sampleRecommendation(),
      ...locals,
    },
    {
      filename: VIEW,
      root: PARTIALS,
      views: [PARTIALS],
    }
  );
}

describe("registration recommendation UI (no Postgres)", () => {
  it("renders the recommendation panel", () => {
    const html = renderDetail();
    assert.match(html, /data-bb-pa-reg-recommendation="1"/);
    assert.match(html, /id="reg-recommendation"/);
    assert.match(html, /href="#reg-recommendation"/);
    assert.match(html, /Review recommendation/);
  });

  it("supports all five recommendation labels from the service", () => {
    const cases = [
      [CODES.RECOMMENDED_FOR_APPROVAL, "ok"],
      [CODES.MANUAL_REVIEW_REQUIRED, "warn"],
      [CODES.ADDITIONAL_INFORMATION_REQUIRED, "warn"],
      [CODES.HIGH_DUPLICATE_RISK, "danger"],
      [CODES.NOT_ELIGIBLE, "danger"],
    ];
    for (const [code, tone] of cases) {
      const html = renderDetail({
        reviewRecommendation: sampleRecommendation({
          code,
          label: LABELS[code],
          tone,
        }),
      });
      assert.match(html, new RegExp(`data-bb-pa-reg-recommendation-code="${code}"`));
      assert.match(html, new RegExp(`data-bb-pa-reg-recommendation-tone="${tone}"`));
      assert.match(html, new RegExp(LABELS[code].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  });

  it("uses the service-provided tone and keeps advisory visible", () => {
    const html = renderDetail({
      reviewRecommendation: sampleRecommendation({
        code: CODES.RECOMMENDED_FOR_APPROVAL,
        label: LABELS[CODES.RECOMMENDED_FOR_APPROVAL],
        tone: "ok",
      }),
    });
    assert.match(html, /data-bb-pa-reg-recommendation-tone="ok"/);
    assert.match(html, /bb-pa-reg-recommendation--ok/);
    assert.match(html, /data-bb-pa-reg-recommendation-advisory="1"[^>]*>Advisory/);
    assert.match(html, /Status: OK/);
  });

  it("renders explanation and calculation time", () => {
    const html = renderDetail();
    assert.match(html, /data-bb-pa-reg-recommendation-explanation="1"/);
    assert.match(html, /Supported verification signals require manual review/);
    assert.match(html, /data-bb-pa-reg-recommendation-count="calculatedAt"/);
    assert.match(html, /2026-07-23 18:30 UTC/);
  });

  it("renders blocking and warning counts and verification anchor", () => {
    const html = renderDetail({
      reviewRecommendation: sampleRecommendation({
        blockingFacts: ["phone_unique_registration_scope"],
        warningFacts: ["church_name_exact_match", "email_unique_platform_users_only"],
      }),
    });
    assert.match(html, /data-bb-pa-reg-recommendation-count="blocking"/);
    assert.match(html, /data-bb-pa-reg-recommendation-count="warning"/);
    assert.match(html, /Blocking facts[\s\S]*?<strong>1<\/strong>/);
    assert.match(html, /Warning facts[\s\S]*?<strong>2<\/strong>/);
    assert.match(html, /href="#reg-verification"/);
    assert.match(html, /data-bb-pa-reg-recommendation-verify-link="1"/);
  });

  it("renders reasons safely with fact label and status", () => {
    const html = renderDetail();
    assert.match(html, /data-bb-pa-reg-recommendation-reasons="1"/);
    assert.match(html, /Exact church name match at same city and country/);
    assert.match(html, /data-bb-pa-reg-recommendation-reason-msg="1"/);
    assert.match(html, /Exact church name match found/);
    assert.doesNotMatch(html, /\[object Object\]/);
    assert.doesNotMatch(html, /"factKey":/);
  });

  it("keeps blocking reasons visible and expands additional reasons", () => {
    const reasons = [
      {
        factKey: "phone_unique_registration_scope",
        status: "failed",
        message: "Phone conflict.",
      },
      { factKey: "a", status: "warning", message: "A" },
      { factKey: "b", status: "warning", message: "B" },
      { factKey: "c", status: "warning", message: "C" },
      { factKey: "d", status: "warning", message: "D" },
      { factKey: "e", status: "warning", message: "E" },
    ];
    const html = renderDetail({
      reviewRecommendation: sampleRecommendation({
        blockingFacts: ["phone_unique_registration_scope"],
        reasons,
        warningFacts: ["a", "b", "c", "d", "e"],
      }),
    });
    assert.match(html, /data-bb-pa-reg-recommendation-reason-blocking="1"/);
    assert.match(html, /Phone conflict/);
    assert.match(html, /data-bb-pa-reg-recommendation-more="1"/);
    assert.match(html, /<summary>/);
  });

  it("handles empty reasons without an empty list container", () => {
    const html = renderDetail({
      reviewRecommendation: sampleRecommendation({ reasons: [] }),
    });
    assert.doesNotMatch(html, /data-bb-pa-reg-recommendation-reasons="1"/);
    assert.match(html, /data-bb-pa-reg-recommendation-explanation="1"/);
  });

  it("missing recommendation uses safe manual-review fallback", () => {
    for (const reviewRecommendation of [null, undefined, "bad", 12]) {
      const html = renderDetail({ reviewRecommendation });
      assert.match(html, /data-bb-pa-reg-recommendation-fallback="1"/);
      assert.match(html, /Manual review required/);
      assert.match(html, /data-bb-pa-reg-recommendation-tone="warn"/);
      assert.match(html, /could not be calculated/i);
      assert.match(html, /data-bb-pa-reg-recommendation-advisory="1"/);
    }
  });

  it("does not add recommendation action forms", () => {
    const html = renderDetail();
    assert.doesNotMatch(html, /accept.?recommendation/i);
    assert.doesNotMatch(html, /override.?recommendation/i);
    assert.doesNotMatch(html, /recalculate/i);
    assert.doesNotMatch(html, /data-bb-pa-reg-recommendation-action/);
    assert.doesNotMatch(html, /action="[^"]*recommendation[^"]*"/i);
  });

  it("preserves existing Approve and Reject forms", () => {
    const html = renderDetail();
    assert.match(html, /data-bb-pa-approve-form="1"/);
    assert.match(html, /action="\/admin\/registration-applications\/[^"]+\/approve"/);
    assert.match(html, /data-bb-pa-reject-form="1"/);
    assert.match(html, /action="\/admin\/registration-applications\/[^"]+\/reject"/);
  });

  it("has no client-side recalculation logic", () => {
    const html = renderDetail();
    assert.doesNotMatch(html, /buildRegistrationReviewRecommendation/);
    assert.doesNotMatch(html, /recommended_for_approval\s*=/);
    const source = fs.readFileSync(VIEW, "utf8");
    assert.doesNotMatch(source, /<script[\s\S]*reviewRecommendation/);
    assert.doesNotMatch(source, /function\s+recalculate/i);
  });

  it("escapes applicant-provided content in reasons", () => {
    const html = renderDetail({
      reviewRecommendation: sampleRecommendation({
        explanation: '<img src=x onerror=alert(1)> script-xss',
        reasons: [
          {
            factKey: "church_name_exact_match",
            status: "warning",
            message: '<script>alert(1)</script> & "quoted"',
          },
        ],
      }),
    });
    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(html, /&lt;img src=x/);
  });

  it("includes mobile-friendly markup and CSS", () => {
    const html = renderDetail();
    assert.match(html, /bb-pa-reg-recommendation__/);
    assert.match(html, /data-bb-pa-reg-recommendation-counts="1"/);
    const css = fs.readFileSync(CSS, "utf8");
    assert.match(css, /\.bb-pa-reg-recommendation\b/);
    assert.match(css, /@media \(max-width: 719px\)[\s\S]*bb-pa-reg-recommendation__counts/);
    assert.match(css, /overflow-wrap:\s*anywhere/);
  });

  it("states advisory does not approve or reject", () => {
    const html = renderDetail();
    assert.match(html, /does not approve or reject/i);
    assert.match(html, /approval rules remain unchanged/i);
  });

  it("danger state includes non-color text status", () => {
    const html = renderDetail({
      reviewRecommendation: sampleRecommendation({
        code: CODES.HIGH_DUPLICATE_RISK,
        label: LABELS[CODES.HIGH_DUPLICATE_RISK],
        tone: "danger",
      }),
    });
    assert.match(html, /Status: Attention required/);
    assert.match(html, /High duplicate risk/);
  });

  it("route passes reviewRecommendation locals without query override", () => {
    const source = fs.readFileSync(ROUTE, "utf8");
    assert.match(source, /reviewRecommendation:\s*detail\.reviewRecommendation/);
    assert.doesNotMatch(source, /req\.query\.reviewRecommendation/);
    assert.doesNotMatch(source, /req\.body\.reviewRecommendation/);
  });
});
