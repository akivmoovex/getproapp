"use strict";

/**
 * Phase2 Prompt 070 — Rejection Workspace UI on registration detail (no Postgres).
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");
const ejs = require("ejs");

const registrationStatus = require("../src/blessboard/services/registrationStatusPresentation");

const VIEW = path.join(
  __dirname,
  "../views/blessboard/v5/platform-admin/registration-application-detail.ejs"
);
const PARTIALS = path.join(__dirname, "../views/blessboard/v5/partials");
const CSS = path.join(__dirname, "../public/blessboard/v5/platform-admin.css");
const SHELL = path.join(
  __dirname,
  "../views/blessboard/v5/partials/platform-admin-shell-start.ejs"
);

const APP_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const ADMIN_ID = "11111111-1111-4111-8111-111111111111";

function baseApp(overrides = {}) {
  return {
    id: APP_ID,
    churchName: "Grace Test Church",
    contactName: "Pat Applicant",
    contactEmail: "pat@example.com",
    contactPhone: "+260971000001",
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
    rejectionReason: null,
    rejectionCategory: null,
    reapplicationAllowed: null,
    rejectionNotificationStatus: null,
    reviewEvents: [],
    riskDecidedAt: null,
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
      platformAdmins: [
        {
          id: ADMIN_ID,
          displayName: "Ops Admin",
          email: "ops@example.com",
        },
      ],
      followUpStatuses: ["contact_pending"],
      contactMethods: ["phone", "email"],
      contactOutcomes: ["reached", "other"],
      csrfField: "_csrf",
      csrfToken: "test-csrf-token",
      notice: null,
      error: null,
      verification: null,
      reviewRecommendation: null,
      approvalChecklist: null,
      phoneVerification: null,
      emailVerification: null,
      communications: { items: [], summary: { total: 0 }, unavailable: false },
      ...locals,
    },
    {
      filename: VIEW,
      root: PARTIALS,
      views: [PARTIALS],
    }
  );
}

function rejectionBlock(html) {
  const match = html.match(
    /data-bb-pa-reg-rejection="1"[\s\S]*?(?=id="reg-details"|data-bb-pa-reg-section="details"|id="reg-communications")/
  );
  assert.ok(match, "expected rejection workspace block");
  return match[0];
}

describe("registration rejection workspace UI (Prompt 070, no Postgres)", () => {
  it("renders #reg-rejection nav and form fields with CSRF", () => {
    const html = renderDetail();
    assert.match(html, /id="reg-rejection"/);
    assert.match(html, /href="#reg-rejection"/);
    assert.match(html, /data-bb-pa-reg-rejection-nav="1">Rejection</);
    const block = rejectionBlock(html);
    assert.match(block, /data-bb-pa-reg-rejection-form="1"/);
    assert.match(block, /name="_csrf" value="test-csrf-token"/);
    assert.match(block, /name="rejection_category"/);
    assert.match(block, /name="internal_decision_note"/);
    assert.match(block, /name="applicant_explanation"/);
    assert.match(block, /name="reapplication_allowed"/);
    assert.match(block, /name="notify_applicant"/);
    assert.match(block, /name="confirm_reject"/);
    assert.match(block, /I understand this will reject the application/);
    assert.match(block, /Reject and record decision/);
    assert.doesNotMatch(block, />Confirm</);
    assert.doesNotMatch(block, /name="(application_id|application_status|platform_admin_user_id|administrator_id)"/i);
  });

  it("keeps Approve visually separated from the rejection workspace", () => {
    const html = renderDetail();
    const approveIdx = html.indexOf('data-bb-pa-approve-form="1"');
    const rejectIdx = html.indexOf('data-bb-pa-reg-rejection="1"');
    assert.ok(approveIdx > 0);
    assert.ok(rejectIdx > approveIdx);
    assert.match(html, /id="reg-actions"/);
    assert.match(html, /id="reg-rejection"/);
  });

  it("separates internal and applicant text and shows email limitation", () => {
    const html = renderDetail();
    const block = rejectionBlock(html);
    assert.match(block, /data-bb-pa-reg-rejection-internal-block="1"/);
    assert.match(block, /data-bb-pa-reg-rejection-applicant-block="1"/);
    assert.match(block, /Platform administrators only/);
    assert.match(block, /Visible to the applicant/);
    assert.match(block, /data-bb-pa-reg-rejection-email-unavailable="1"/);
    assert.match(block, /Outbound email may be unavailable/i);
    assert.doesNotMatch(block, /was delivered successfully|email was sent/i);
  });

  it("renders allowlisted categories and mobile-friendly destructive isolation CSS", () => {
    const html = renderDetail();
    const block = rejectionBlock(html);
    assert.match(block, /<option value="duplicate_registration">Duplicate registration<\/option>/);
    assert.match(block, /<option value="applicant_withdrew">Applicant withdrew<\/option>/);
    assert.match(block, /bb-pa-reg-rejection__actions/);
    assert.match(block, /bb-pa-btn--danger/);
    const css = fs.readFileSync(CSS, "utf8");
    assert.match(css, /\.bb-pa-reg-rejection__form\s*\{/);
    assert.match(css, /\.bb-pa-reg-rejection__actions\s*\{/);
    const shell = fs.readFileSync(SHELL, "utf8");
    assert.match(shell, /platform-admin\.css\?v=50/);
  });

  it("shows completed rejection state with controlled reopen form", () => {
    const html = renderDetail({
      application: baseApp({
        applicationStatus: "rejected",
        rejectActionsAvailable: false,
        riskReviewActionsAvailable: false,
        rejectionCategory: "duplicate_registration",
        rejectionReason: "Internal: exact match <script>",
        reapplicationAllowed: false,
        rejectionNotificationStatus: "sending_unavailable",
        riskDecidedAt: "2026-07-22T15:00:00.000Z",
        reviewEvents: [
          {
            at: "2026-07-22T15:00:00.000Z",
            action: "reject",
            actor_user_id: ADMIN_ID,
            rejection_category: "duplicate_registration",
            reapplication_allowed: false,
            notification_status: "sending_unavailable",
          },
        ],
      }),
      communications: {
        unavailable: false,
        items: [
          {
            id: "comm-rej",
            communicationType: "rejection_notice",
            applicantMessage: "We cannot approve <b>this</b> application.",
            internalNote: "Internal: exact match",
            deliveryStatus: "sending_unavailable",
            createdAt: "2026-07-22T15:00:00.000Z",
          },
        ],
        summary: { total: 1, rejectionNotices: 1 },
      },
    });

    assert.match(html, /data-bb-pa-reg-rejection-completed="1"/);
    assert.match(html, /data-bb-pa-reg-rejection-completed-panel="1"/);
    assert.match(html, /data-bb-pa-reg-rejection-rejected-by="1">Ops Admin</);
    assert.match(html, /data-bb-pa-reg-rejection-rejected-at="1">/);
    assert.match(html, /data-bb-pa-reg-rejection-category="1">Duplicate registration</);
    assert.match(html, /data-bb-pa-reg-rejection-reapplication="1">[\s\S]*No/);
    assert.match(html, /data-bb-pa-reg-rejection-notification="1">Sending unavailable</);
    assert.match(html, /data-bb-pa-reg-rejection-applicant-completed="1"/);
    assert.match(html, /data-bb-pa-reg-rejection-internal-completed="1"/);
    assert.match(html, /We cannot approve &lt;b&gt;this&lt;\/b&gt; application\./);
    assert.match(html, /Internal: exact match &lt;script&gt;/);
    assert.match(html, /data-bb-pa-reg-rejection-reopen="1"/);
    assert.match(html, /data-bb-pa-reg-rejection-reopen-form="1"/);
    assert.match(
      html,
      /action="\/admin\/registration-applications\/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee\/reopen"/
    );
    assert.match(html, /name="reopen_reason"/);
    assert.match(html, /data-bb-pa-reg-rejection-reopen-submit="1"[\s\S]*Reopen application/);
    assert.match(html, /No email is sent automatically/i);
    assert.doesNotMatch(html, /data-bb-pa-reg-rejection-no-reopen=/);
    assert.doesNotMatch(html, /data-bb-pa-reg-rejection-form=/);
    assert.doesNotMatch(html, />Sent</);
  });

  it("never labels notification as Sent unless status is sent", () => {
    const html = renderDetail({
      application: baseApp({
        applicationStatus: "rejected",
        rejectActionsAvailable: false,
        riskReviewActionsAvailable: false,
        rejectionNotificationStatus: "queued",
        reviewEvents: [
          {
            at: "2026-07-22T15:00:00.000Z",
            action: "reject",
            actor_user_id: ADMIN_ID,
            notification_status: "queued",
          },
        ],
      }),
    });
    assert.match(html, /data-bb-pa-reg-rejection-notification="1">Queued</);
    assert.doesNotMatch(html, /data-bb-pa-reg-rejection-notification="1">Sent</);
  });

  it("shows allowlisted success and error notices only", () => {
    const ok = renderDetail({ notice: "application_rejected" });
    assert.match(ok, /bb-pa-flash--ok/);
    assert.match(ok, /Application rejected/i);
    assert.match(ok, /does not confirm that a rejection message was delivered/i);
    assert.doesNotMatch(ok, /application_rejected/);

    const reopened = renderDetail({ notice: "application_reopened" });
    assert.match(reopened, /bb-pa-flash--ok/);
    assert.match(reopened, /Application reopened for review/i);
    assert.match(reopened, /No email was sent/i);
    assert.doesNotMatch(reopened, /application_reopened/);

    for (const [code, snippet] of [
      ["csrf", /security token/],
      ["invalid", /Review the fields and try again/],
      ["not_found", /could not be found/],
      ["not_eligible", /not eligible/],
      ["reject_failed", /could not be saved|Try again/],
      ["reopen_failed", /could not be saved|Try again/],
    ]) {
      const html = renderDetail({ error: code });
      assert.match(html, /bb-pa-flash--error/);
      assert.match(html, snippet);
      assert.doesNotMatch(html, new RegExp(`>${code}<`));
    }

    const unknown = renderDetail({ notice: "hacked_sent_notice" });
    assert.doesNotMatch(unknown, /hacked_sent_notice/);
    assert.doesNotMatch(unknown, /bb-pa-flash--ok/);
  });
});
