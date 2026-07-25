"use strict";

/**
 * Phase2 Prompt 029 — read-only phone verification UI on registration detail (no Postgres).
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");
const ejs = require("ejs");

const registrationStatus = require("../src/blessboard/services/registrationStatusPresentation");
const {
  SUMMARY_STATUSES,
  derivePhoneVerificationSummary,
} = require("../src/blessboard/services/registrationPhoneVerificationService");

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

function sampleAttempts() {
  return [
    {
      id: "attempt-new",
      attempted_at: "2026-07-22T12:00:00.000Z",
      phone_number_called: "+260 97 100 0001",
      contact_person_name: "Jane <script>alert(1)</script>",
      contact_person_role: "Secretary",
      outcome: "answered",
      applicant_identity_status: "confirmed",
      applicant_authority_status: "confirmed",
      verification_result: "verified",
      verification_reason: "Spoke with named pastor",
      follow_up_at: "2026-07-25T09:00:00.000Z",
      notes: 'Notes with <b>html</b> & "quotes"',
      created_by_user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    },
    {
      id: "attempt-old",
      attempted_at: "2026-07-20T08:00:00.000Z",
      phone_number_called: "+260971000001",
      outcome: "no_answer",
      applicant_identity_status: "not_checked",
      applicant_authority_status: "not_checked",
      verification_result: "pending",
      notes: null,
      created_by_user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    },
  ];
}

function samplePhoneVerification(overrides = {}) {
  const attempts = overrides.attempts != null ? overrides.attempts : sampleAttempts();
  const summary =
    overrides.summary != null
      ? overrides.summary
      : derivePhoneVerificationSummary(attempts, { now: "2026-07-23T12:00:00.000Z" });
  return {
    attempts,
    summary,
    ...overrides,
    attempts: overrides.attempts != null ? overrides.attempts : attempts,
    summary: overrides.summary != null ? overrides.summary : summary,
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
      reviewRecommendation: null,
      approvalChecklist: null,
      phoneVerification: samplePhoneVerification(),
      ...locals,
    },
    {
      filename: VIEW,
      root: PARTIALS,
      views: [PARTIALS],
    }
  );
}

describe("registration phone verification UI (Prompt 029, no Postgres)", () => {
  it("renders the phone-verification section and nav link", () => {
    const html = renderDetail();
    assert.match(html, /data-bb-pa-reg-phone="1"/);
    assert.match(html, /id="reg-phone-verification"/);
    assert.match(html, /href="#reg-phone-verification"/);
    assert.match(html, />Phone verification</);
  });

  it("renders contact summary values", () => {
    const html = renderDetail();
    assert.match(html, /data-bb-pa-reg-phone-summary="1"/);
    assert.match(html, /data-bb-pa-reg-phone-applicant-name="1">Pat Applicant</);
    assert.match(html, /data-bb-pa-reg-phone-applicant-role="1">Pastor</);
    assert.match(html, /data-bb-pa-reg-phone-registration-phone="1">\+260971000001</);
    assert.match(html, /data-bb-pa-reg-phone-country="1">Zambia</);
    assert.match(html, /data-bb-pa-reg-phone-total-attempts="1">2</);
    assert.match(html, /data-bb-pa-reg-phone-last-attempted="1"/);
    assert.doesNotMatch(html, /WhatsApp|Local time|Preferred calling period/i);
  });

  it("renders all four summary statuses safely", () => {
    for (const status of [
      SUMMARY_STATUSES.NOT_CHECKED,
      SUMMARY_STATUSES.PENDING,
      SUMMARY_STATUSES.VERIFIED,
      SUMMARY_STATUSES.FAILED,
    ]) {
      const html = renderDetail({
        phoneVerification: samplePhoneVerification({
          attempts: [],
          summary: {
            totalAttempts: 0,
            latestAttempt: null,
            lastAttemptedAt: null,
            applicantContacted: false,
            identityConfirmed: false,
            authorityConfirmed: false,
            verificationStatus: status,
            followUpRequired: false,
            nextFollowUpAt: null,
            failedAttempts: 0,
            answeredAttempts: 0,
          },
        }),
      });
      assert.match(html, new RegExp(`data-bb-pa-reg-phone-status-value="${status}"`));
      assert.match(html, /data-bb-pa-reg-phone-status-chip="1"/);
    }
  });

  it("renders applicant-contacted status", () => {
    const yesHtml = renderDetail();
    assert.match(yesHtml, /data-bb-pa-reg-phone-applicant-contacted="1">Yes</);

    const noHtml = renderDetail({
      phoneVerification: samplePhoneVerification({
        attempts: [
          {
            id: "a",
            attempted_at: "2026-07-20T08:00:00.000Z",
            outcome: "no_answer",
            verification_result: "pending",
            applicant_identity_status: "not_checked",
            applicant_authority_status: "not_checked",
          },
        ],
      }),
    });
    assert.match(noHtml, /data-bb-pa-reg-phone-applicant-contacted="1">No</);
  });

  it("keeps identity and authority separate", () => {
    const html = renderDetail({
      phoneVerification: samplePhoneVerification({
        attempts: [
          {
            id: "a",
            attempted_at: "2026-07-22T12:00:00.000Z",
            outcome: "answered",
            verification_result: "pending",
            applicant_identity_status: "confirmed",
            applicant_authority_status: "not_confirmed",
            phone_number_called: "+260971000001",
          },
        ],
      }),
    });
    assert.match(html, /data-bb-pa-reg-phone-identity-confirmed="1">Yes</);
    assert.match(html, /data-bb-pa-reg-phone-authority-confirmed="1">No</);
    assert.match(html, /data-bb-pa-reg-phone-attempt-identity="1">Confirmed</);
    assert.match(html, /data-bb-pa-reg-phone-attempt-authority="1">Not confirmed</);
  });

  it("renders call attempts newest first with outcome and verification result", () => {
    const html = renderDetail();
    const listMatch = html.match(
      /data-bb-pa-reg-phone-attempt-list="1"[\s\S]*?(?=<section id="reg-activity"|$)/
    );
    assert.ok(listMatch);
    const block = listMatch[0];
    const newIdx = block.indexOf('data-bb-pa-reg-phone-attempt-id="attempt-new"');
    const oldIdx = block.indexOf('data-bb-pa-reg-phone-attempt-id="attempt-old"');
    assert.ok(newIdx >= 0 && oldIdx >= 0 && newIdx < oldIdx);
    assert.match(block, /data-bb-pa-reg-phone-attempt-outcome="1">[\s\S]*Answered/);
    assert.match(block, /data-bb-pa-reg-phone-attempt-result="1">[\s\S]*Verified/);
    assert.match(block, /data-bb-pa-reg-phone-attempt-outcome="1">[\s\S]*No answer/);
    assert.match(block, /data-bb-pa-reg-phone-attempt-result="1">[\s\S]*Pending/);
  });

  it("renders verification reason and follow-up only when present", () => {
    const html = renderDetail();
    assert.match(html, /data-bb-pa-reg-phone-attempt-reason="1">Spoke with named pastor</);
    assert.match(html, /data-bb-pa-reg-phone-attempt-follow-up="1"/);
    assert.match(html, /data-bb-pa-reg-phone-next-follow-up="1"/);

    const pendingOnly = renderDetail({
      phoneVerification: samplePhoneVerification({
        attempts: [
          {
            id: "p",
            attempted_at: "2026-07-20T08:00:00.000Z",
            outcome: "unavailable",
            verification_result: "pending",
            phone_number_called: "+260971000001",
          },
        ],
      }),
    });
    assert.doesNotMatch(pendingOnly, /data-bb-pa-reg-phone-attempt-reason=/);
    assert.doesNotMatch(pendingOnly, /data-bb-pa-reg-phone-attempt-follow-up=/);
  });

  it("escapes notes and names", () => {
    const html = renderDetail();
    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
    assert.match(html, /Jane &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(html, /data-bb-pa-reg-phone-attempt-notes="1"><b>html<\/b>/);
    assert.match(html, /Notes with &lt;b&gt;html&lt;\/b&gt; &amp; (&#34;|&quot;)quotes(&#34;|&quot;)/);
  });

  it("renders empty history state without implying verification", () => {
    const html = renderDetail({
      phoneVerification: samplePhoneVerification({
        attempts: [],
        summary: {
          totalAttempts: 0,
          latestAttempt: null,
          lastAttemptedAt: null,
          applicantContacted: false,
          identityConfirmed: false,
          authorityConfirmed: false,
          verificationStatus: SUMMARY_STATUSES.NOT_CHECKED,
          followUpRequired: false,
          nextFollowUpAt: null,
          failedAttempts: 0,
          answeredAttempts: 0,
        },
      }),
    });
    assert.match(html, /data-bb-pa-reg-phone-empty="1"/);
    assert.match(html, /No phone verification calls have been recorded\./);
    assert.doesNotMatch(html, /phone is verified|phone is unverified/i);
  });

  it("renders unavailable history warning state", () => {
    const html = renderDetail({
      phoneVerification: {
        attempts: [],
        unavailable: true,
        summary: {
          totalAttempts: 0,
          verificationStatus: SUMMARY_STATUSES.NOT_CHECKED,
          applicantContacted: false,
          identityConfirmed: false,
          authorityConfirmed: false,
          followUpRequired: false,
          failedAttempts: 0,
          answeredAttempts: 0,
          latestAttempt: null,
          lastAttemptedAt: null,
          nextFollowUpAt: null,
        },
      },
    });
    assert.match(html, /data-bb-pa-reg-phone-unavailable="1"/);
    assert.match(html, /data-bb-pa-reg-phone-unavailable-banner="1"/);
    assert.match(html, /Call history is temporarily unavailable/);
    assert.doesNotMatch(html, /ECONNREFUSED|relation does not exist|password=/i);
    assert.match(html, /id="reg-overview"/);
    assert.match(html, /data-bb-pa-approve-form="1"/);
  });

  it("does not render discrete verify/fail actions (record form is separate)", () => {
    const html = renderDetail();
    const phoneSlice = html.slice(
      html.indexOf('id="reg-phone-verification"'),
      html.indexOf('id="reg-activity"')
    );
    assert.doesNotMatch(phoneSlice, /Start Verification Call|Mark Phone Verified|Mark Phone Failed|Schedule follow-up/i);
    assert.doesNotMatch(phoneSlice, /phone-verification\/verify|phone-verification\/fail/);
    assert.match(phoneSlice, /data-bb-pa-reg-phone-form="1"/);
    assert.match(phoneSlice, /phone-verification\/attempts/);
  });

  it("uses mobile-friendly card structure without wide tables", () => {
    const html = renderDetail();
    assert.match(html, /bb-pa-reg-phone-attempt/);
    assert.match(html, /bb-pa-reg-phone__attempt-list/);
    const phoneSlice = html.slice(
      html.indexOf('id="reg-phone-verification"'),
      html.indexOf('id="reg-activity"')
    );
    assert.doesNotMatch(phoneSlice, /<table/);

    const css = fs.readFileSync(CSS, "utf8");
    assert.match(css, /\.bb-pa-reg-phone__attempt-list/);
    assert.match(css, /\.bb-pa-reg-phone-attempt/);
    assert.match(css, /@media \(max-width: 719px\)[\s\S]*\.bb-pa-reg-phone-attempt__head/);
  });

  it("preserves existing approval and rejection confirmation entry points", () => {
    const html = renderDetail();
    assert.match(html, /data-bb-pa-approve-form="1"/);
    assert.match(html, /href="\/admin\/registration-applications\/[^"]+\/approve"/);
    assert.match(html, /href="\/admin\/registration-applications\/[^"]+\/reject"/);

    const route = fs.readFileSync(ROUTE, "utf8");
    assert.match(route, /\/admin\/registration-applications\/:id\/approve/);
    assert.match(route, /\/admin\/registration-applications\/:id\/reject/);
  });

  it("does not expose normalized phone or admin emails in attempt cards", () => {
    const html = renderDetail();
    const phoneSlice = html.slice(
      html.indexOf('id="reg-phone-verification"'),
      html.indexOf('id="reg-activity"')
    );
    assert.doesNotMatch(phoneSlice, /phone_number_normalized|created_by_email|createdByEmail/);
    assert.match(phoneSlice, /data-bb-pa-reg-phone-attempt-phone="1">\+260 97 100 0001</);
  });
});
