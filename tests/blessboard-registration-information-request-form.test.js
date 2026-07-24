"use strict";

/**
 * Phase2 Prompt 065 — Request Additional Information form on registration detail (no Postgres).
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

const REQUEST_CATEGORIES = [
  ["clarify_church_identity", "Clarify church identity"],
  ["confirm_applicant_authority", "Confirm applicant authority"],
  ["upload_registration_document", "Upload registration document"],
  ["correct_phone", "Correct phone"],
  ["correct_email", "Correct email"],
  ["confirm_location", "Confirm location"],
  ["explain_possible_duplicate", "Explain possible duplicate"],
  ["confirm_website_name", "Confirm website name"],
  ["add_service_times", "Add service times"],
  ["other", "Other"],
];

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
      csrfToken: "test-csrf-token",
      notice: null,
      error: null,
      verification: null,
      reviewRecommendation: null,
      approvalChecklist: null,
      phoneVerification: null,
      emailVerification: null,
      ...locals,
    },
    {
      filename: VIEW,
      root: PARTIALS,
      views: [PARTIALS],
    }
  );
}

function formHtml(html) {
  const match = html.match(
    /data-bb-pa-reg-communications-form="1"[\s\S]*?<\/form>/
  );
  assert.ok(match, "expected communications form");
  return match[0];
}

describe("registration information request form (Prompt 065, no Postgres)", () => {
  it("renders section anchor, nav item, and POST action to request-information", () => {
    const html = renderDetail();
    assert.match(html, /id="reg-communications"/);
    assert.match(html, /data-bb-pa-reg-communications="1"/);
    assert.match(html, /href="#reg-communications"/);
    assert.match(html, /data-bb-pa-reg-communications-nav="1">Communication</);
    assert.match(
      html,
      new RegExp(
        `action="/admin/registration-applications/${APP_ID}/request-information"`
      )
    );
    assert.match(html, /method="post"/i);
  });

  it("includes CSRF and all required fields without hidden actor or application ids", () => {
    const form = formHtml(renderDetail());
    assert.match(form, /name="_csrf" value="test-csrf-token"/);
    assert.match(form, /name="recipient"/);
    assert.match(form, /name="subject"/);
    assert.match(form, /name="applicant_message"/);
    assert.match(form, /name="internal_note"/);
    assert.match(form, /name="request_category"/);
    assert.match(form, /name="requested_fields"/);
    assert.match(form, /name="requested_documents"/);
    assert.match(form, /name="response_due_at"/);
    assert.match(form, /name="channel"/);
    assert.doesNotMatch(form, /name="(application_id|applicationId)"/i);
    assert.doesNotMatch(
      form,
      /name="(created_by_user_id|actor_user_id|platform_admin_user_id|administrator_id)"/i
    );
  });

  it("prefills recipient from contact_email and defaults channel to email", () => {
    const form = formHtml(renderDetail());
    assert.match(
      form,
      /id="info_request_recipient"[\s\S]*?name="recipient"[\s\S]*?value="pat@example\.com"/
    );
    assert.match(form, /data-bb-pa-reg-communications-field="recipient"/);
    assert.match(
      form,
      /name="channel"[\s\S]*?<option value="email" selected>Email<\/option>/
    );
  });

  it("renders allowlisted request categories", () => {
    const form = formHtml(renderDetail());
    for (const [value, label] of REQUEST_CATEGORIES) {
      assert.match(
        form,
        new RegExp(`<option value="${value}">${label}</option>`)
      );
    }
  });

  it("separates applicant-facing message from internal note and warns email may be unavailable", () => {
    const html = renderDetail();
    assert.match(html, /data-bb-pa-reg-communications-applicant-block="1"/);
    assert.match(html, /data-bb-pa-reg-communications-internal-block="1"/);
    assert.match(html, /Visible to the applicant/);
    assert.match(html, /Platform administrators only/);
    assert.match(html, /data-bb-pa-reg-communications-email-unavailable="1"/);
    assert.match(html, /Outbound email may be unavailable/i);
    const block = html.match(
      /data-bb-pa-reg-communications="1"[\s\S]*?(?=id="reg-activity"|data-bb-pa-reg-section="activity")/
    );
    assert.ok(block);
    assert.doesNotMatch(
      block[0],
      /was delivered successfully|delivery confirmed|email was sent/i
    );
  });

  it("uses single-column form class without script tags in the section", () => {
    const html = renderDetail();
    assert.match(html, /bb-pa-form bb-pa-reg-communications__form/);
    const block = html.match(
      /data-bb-pa-reg-communications="1"[\s\S]*?(?=id="reg-activity"|data-bb-pa-reg-section="activity")/
    );
    assert.ok(block);
    assert.doesNotMatch(block[0], /<script\b/i);
    const css = fs.readFileSync(CSS, "utf8");
    assert.match(css, /\.bb-pa-reg-communications__form\s*\{/);
    const shell = fs.readFileSync(SHELL, "utf8");
    assert.match(shell, /platform-admin\.css\?v=50/);
  });

  it("shows allowlisted success and error notices only", () => {
    const ok = renderDetail({ notice: "information_requested" });
    assert.match(ok, /bb-pa-flash--ok/);
    assert.match(ok, /Information request recorded/i);
    assert.match(ok, /does not confirm that a message was delivered/i);
    assert.doesNotMatch(ok, /information_requested/);

    for (const [code, snippet] of [
      ["invalid", /Review the fields and try again/],
      ["sending_unavailable", /Outbound email is not available/],
      ["not_found", /could not be found/],
      ["information_request_failed", /could not be saved right now/],
      ["csrf", /security token/],
    ]) {
      const html = renderDetail({ error: code });
      assert.match(html, /bb-pa-flash--error/);
      assert.match(html, snippet);
      assert.doesNotMatch(html, new RegExp(`>${code}<`));
    }

    const unknown = renderDetail({ notice: "hacked_delivery_confirmed_xyz" });
    assert.doesNotMatch(unknown, /hacked_delivery_confirmed_xyz/);
    assert.doesNotMatch(unknown, /bb-pa-flash--ok/);
  });

  it("leaves recipient empty when contact email is missing", () => {
    const form = formHtml(
      renderDetail({ application: baseApp({ contactEmail: "" }) })
    );
    assert.match(
      form,
      /id="info_request_recipient"[\s\S]*?name="recipient"[\s\S]*?value=""/
    );
  });
});
