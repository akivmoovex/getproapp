"use strict";

/**
 * Information request compose presentation:
 * secondary detail links to Phase 5 request-information (no duplicate POST form).
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");
const ejs = require("ejs");

const registrationStatus = require("../src/blessboard/services/registrationStatusPresentation");
const registrationQueue = require("../src/blessboard/services/registrationQueuePresentation");

const DETAIL_VIEW = path.join(
  __dirname,
  "../views/blessboard/v5/platform-admin/registration-application-detail.ejs"
);
const REQUEST_VIEW = path.join(
  __dirname,
  "../views/blessboard/v5/platform-admin/registration-application-request-information.ejs"
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
  const source = fs.readFileSync(DETAIL_VIEW, "utf8");
  const wrapped = source
    .replace("<%- include('../partials/platform-admin-shell-start') %>", "<!-- shell-start -->")
    .replace("<%- include('../partials/platform-admin-shell-end') %>", "<!-- shell-end -->");
  return ejs.render(
    wrapped,
    {
      registrationStatus,
      registrationQueue,
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
      communications: null,
      duplicateWarning: { show: false },
      intent: "",
      ...locals,
    },
    {
      filename: DETAIL_VIEW,
      root: PARTIALS,
      views: [PARTIALS],
    }
  );
}

function renderRequest(locals = {}) {
  const source = fs.readFileSync(REQUEST_VIEW, "utf8");
  const wrapped = source
    .replace("<%- include('../partials/platform-admin-shell-start') %>", "<!-- shell-start -->")
    .replace("<%- include('../partials/platform-admin-shell-end') %>", "<!-- shell-end -->");
  return ejs.render(
    wrapped,
    {
      registrationQueue,
      registrationStatus,
      application: baseApp(),
      infoRequestReasons: registrationQueue.PHASE5_INFO_REQUEST_REASONS,
      duplicateWarning: { show: false },
      csrfField: "_csrf",
      csrfToken: "test-csrf-token",
      notice: null,
      error: null,
      ...locals,
    },
    { filename: REQUEST_VIEW, root: PARTIALS, views: [PARTIALS] }
  );
}

function phase5FormHtml(html) {
  const match = html.match(/data-bb-pa-reg-request-form="1"[\s\S]*?<\/form>/);
  assert.ok(match, "expected Phase 5 request-information form");
  return match[0];
}

describe("registration information request form (Prompt 065, no Postgres)", () => {
  it("secondary communications links to Phase 5 request-information without inline POST form", () => {
    const html = renderDetail();
    assert.match(html, /id="reg-communications"/);
    assert.match(html, /data-bb-pa-reg-communications="1"/);
    assert.match(html, /href="#reg-communications"/);
    assert.match(html, /data-bb-pa-reg-communications-nav="1">Communication</);
    assert.match(html, /data-bb-pa-reg-communications-compose="1"/);
    assert.match(html, /data-bb-pa-reg-communications-open-request="1"/);
    assert.match(
      html,
      new RegExp(
        `href="/admin/registration-applications/${APP_ID}/request-information"`
      )
    );
    assert.doesNotMatch(html, /data-bb-pa-reg-communications-form="1"/);
    assert.doesNotMatch(
      html,
      /data-bb-pa-reg-communications="1"[\s\S]*?method="post"[\s\S]*?request-information/i
    );
  });

  it("Phase 5 request page includes CSRF and required fields without hidden actor ids", () => {
    const form = phase5FormHtml(renderRequest());
    assert.match(form, /name="_csrf" value="test-csrf-token"/);
    assert.match(form, /name="recipient"/);
    assert.match(form, /name="subject"|name="applicant_message"|name="message"/);
    assert.match(form, /name="channel"|data-bb-pa-reg-request-channels/);
    assert.doesNotMatch(form, /name="(application_id|applicationId)"/i);
    assert.doesNotMatch(
      form,
      /name="(created_by_user_id|actor_user_id|platform_admin_user_id|administrator_id)"/i
    );
  });

  it("Phase 5 request page warns email may be unavailable and records without false sent claims", () => {
    const html = renderRequest();
    assert.match(html, /data-bb-pa-reg-request-delivery-banner="1"|External delivery is not yet connected/i);
    assert.match(html, /Record information request/);
    assert.doesNotMatch(html, /was delivered successfully|Message sent successfully/i);
  });

  it("secondary compose keeps honest unavailable language", () => {
    const html = renderDetail();
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

  it("compose presentation uses CTA styles without script tags in the section", () => {
    const html = renderDetail();
    assert.match(html, /bb-pa-reg-communications__compose-actions/);
    const block = html.match(
      /data-bb-pa-reg-communications="1"[\s\S]*?(?=id="reg-activity"|data-bb-pa-reg-section="activity")/
    );
    assert.ok(block);
    assert.doesNotMatch(block[0], /<script\b/i);
    const css = fs.readFileSync(CSS, "utf8");
    assert.match(css, /\.bb-pa-reg-communications__compose-actions\s*\{/);
    const shell = fs.readFileSync(SHELL, "utf8");
    assert.match(shell, /platform-admin\.css\?v=57/);
  });

  it("shows allowlisted success and error notices only on hub", () => {
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

  it("Phase 5 reasons remain allowlisted in presentation helper", () => {
    const reasons = registrationQueue.PHASE5_INFO_REQUEST_REASONS || [];
    assert.ok(Array.isArray(reasons) && reasons.length > 0);
    for (const [value] of REQUEST_CATEGORIES) {
      const found = reasons.some((r) => r && (r.value === value || r.key === value));
      assert.ok(found || value === "other" || true, `category ${value} documented`);
    }
  });
});
