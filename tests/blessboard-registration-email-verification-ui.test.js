"use strict";

/**
 * Phase2 Prompt 040 — email verification resend UI on registration detail (no Postgres).
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");
const ejs = require("ejs");

const registrationStatus = require("../src/blessboard/services/registrationStatusPresentation");
const {
  SUMMARY_STATUSES,
} = require("../src/blessboard/services/registrationEmailVerificationService");

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

function baseApp(overrides = {}) {
  return {
    id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
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

function sampleEmailVerification(overrides = {}) {
  return {
    status: SUMMARY_STATUSES.SENT,
    email: "pat@example.com",
    sentAt: "2026-07-22T12:00:00.000Z",
    expiresAt: "2026-07-23T12:00:00.000Z",
    verifiedAt: null,
    invalidatedAt: null,
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
      csrfToken: "test-csrf-token",
      notice: null,
      error: null,
      verification: null,
      reviewRecommendation: null,
      approvalChecklist: null,
      phoneVerification: null,
      emailVerification: sampleEmailVerification(),
      ...locals,
    },
    {
      filename: VIEW,
      root: PARTIALS,
      views: [PARTIALS],
    }
  );
}

describe("registration email verification resend UI (Prompt 040, no Postgres)", () => {
  it("renders the email section, nav link, and resend form posting to the 039 route", () => {
    const html = renderDetail();
    assert.match(html, /id="reg-email-verification"/);
    assert.match(html, /href="#reg-email-verification"/);
    assert.match(html, />Email verification</);
    assert.match(html, /data-bb-pa-reg-email-resend="1"/);
    assert.match(
      html,
      /action="\/admin\/registration-applications\/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee\/email-verification\/resend"/
    );
    assert.match(html, /method="post"/i);
    assert.match(html, /name="_csrf" value="test-csrf-token"/);
    assert.match(html, /data-bb-pa-reg-email-resend-submit="1"/);
  });

  it("shows the visible recipient email", () => {
    const html = renderDetail();
    assert.match(
      html,
      /data-bb-pa-reg-email-resend-recipient="1">[\s\S]*Recipient:[\s\S]*pat@example\.com/
    );
  });

  it("includes clear resend-cooldown guidance and no delivery claims", () => {
    const html = renderDetail();
    assert.match(html, /data-bb-pa-reg-email-resend-cooldown="1"/);
    assert.match(html, /60 seconds/);
    assert.match(html, /data-bb-pa-reg-email-resend-no-delivery-claim="1"/);
    assert.match(html, /does not confirm that the message was delivered/i);
    const formBlock = html.match(
      /data-bb-pa-reg-email-resend="1"[\s\S]*?(?=data-bb-pa-reg-email-provider-limitation|id="reg-activity")/
    );
    assert.ok(formBlock);
    assert.doesNotMatch(formBlock[0], /was delivered successfully|delivery confirmed|marked as Delivered/i);
    assert.doesNotMatch(formBlock[0], /\bBounced\b|\bOpened\b/);
  });

  it("does not include token, hidden application id, or hidden administrator id fields", () => {
    const html = renderDetail();
    const formMatch = html.match(
      /data-bb-pa-reg-email-resend-form="1"[\s\S]*?<\/form>/
    );
    assert.ok(formMatch);
    const form = formMatch[0];
    assert.doesNotMatch(form, /name="(token|plaintext_token|raw_token|verification_token)"/i);
    assert.doesNotMatch(form, /name="(application_id|applicationId)"/i);
    assert.doesNotMatch(
      form,
      /name="(created_by_user_id|actor_user_id|platform_admin_user_id|administrator_id)"/i
    );
    assert.doesNotMatch(html, /tok_[A-Za-z0-9]+|rawToken|plaintextToken/);
  });

  it("omits resend when email is missing", () => {
    const html = renderDetail({
      application: baseApp({ contactEmail: "" }),
      emailVerification: sampleEmailVerification({
        status: SUMMARY_STATUSES.NOT_SENT,
        email: null,
        sentAt: null,
        expiresAt: null,
      }),
    });
    assert.doesNotMatch(html, /data-bb-pa-reg-email-resend-form=/);
    assert.match(html, /data-bb-pa-reg-email-resend-omitted="1"/);
    assert.match(html, /applicant email is missing/);
  });

  it("does not render change-email or manual-verification controls", () => {
    const html = renderDetail();
    assert.doesNotMatch(html, /action="[^"]*change-email"/i);
    assert.doesNotMatch(html, /action="[^"]*manual-verify"/i);
    assert.doesNotMatch(html, /Mark Manually Verified/i);
    assert.doesNotMatch(html, /name="new_email"|name="manual_verify_reason"/i);
  });

  it("shows allowlisted success and error notices only", () => {
    const ok = renderDetail({ notice: "email_verification_sent" });
    assert.match(ok, /bb-pa-flash--ok/);
    assert.match(ok, /accepted for processing/i);
    assert.doesNotMatch(ok, /email_verification_sent/);

    for (const [code, snippet] of [
      ["cooldown", /60 seconds/],
      ["invalid_email", /missing or invalid/],
      ["email_sending_unavailable", /not configured/],
      ["email_verification_failed", /could not be processed/],
      ["csrf", /security token/],
    ]) {
      const html = renderDetail({ error: code });
      assert.match(html, /bb-pa-flash--error/);
      assert.match(html, snippet);
      assert.doesNotMatch(html, new RegExp(`>${code}<`));
    }

    const unknownNotice = renderDetail({ notice: "hacked_notice_with_token_abc" });
    assert.doesNotMatch(unknownNotice, /hacked_notice_with_token_abc/);
    assert.doesNotMatch(unknownNotice, /bb-pa-flash--ok/);
  });

  it("falls back to application contact email for recipient when token email is absent", () => {
    const html = renderDetail({
      emailVerification: sampleEmailVerification({
        status: SUMMARY_STATUSES.NOT_SENT,
        email: null,
        sentAt: null,
        expiresAt: null,
      }),
    });
    assert.match(
      html,
      /data-bb-pa-reg-email-resend-recipient="1">[\s\S]*pat@example\.com/
    );
  });

  it("includes responsive email verification CSS and bumped stylesheet version", () => {
    const css = fs.readFileSync(CSS, "utf8");
    assert.match(css, /\.bb-pa-reg-email__resend\s*\{/);
    assert.match(css, /\.bb-pa-reg-email__summary-dl\s*\{/);
    assert.match(css, /@media \(max-width: 720px\)/);
    const shell = fs.readFileSync(SHELL, "utf8");
    assert.match(shell, /platform-admin\.css\?v=56/);
  });
});
