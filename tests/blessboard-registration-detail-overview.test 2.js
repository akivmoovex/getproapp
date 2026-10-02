"use strict";

/**
 * Phase 5 — decision-focused registration review hub (markup; no Postgres).
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");
const ejs = require("ejs");

const registrationStatus = require("../src/blessboard/services/registrationStatusPresentation");
const registrationQueue = require("../src/blessboard/services/registrationQueuePresentation");

const VIEW = path.join(
  __dirname,
  "../views/blessboard/v5/platform-admin/registration-application-detail.ejs"
);
const PARTIALS = path.join(__dirname, "../views/blessboard/v5/partials");

function baseApp(overrides) {
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
    branchName: "Central Campus",
    branchCount: "2",
    message: "Need Network help",
    selectedPlan: "foundation",
    selectedPlanLabel: "Foundation",
    isNetworkPlan: false,
    supportRequested: true,
    consentTerms: true,
    createdAt: "2026-07-01T12:00:00.000Z",
    applicationStatus: "submitted",
    provisioningStatus: "not_started",
    followUpStatus: "contact_pending",
    assignedSupportDisplayName: "Ops Admin",
    assignedSupportEmail: "ops@example.com",
    assignedSupportUserId: "11111111-1111-4111-8111-111111111111",
    lastActivityAt: "2026-07-02T08:00:00.000Z",
    displayStatus: "Needs review",
    operatorTone: "warn",
    operatorQueue: "needs_review",
    statusExplanation: "Held for review.",
    riskReviewActionsAvailable: true,
    rejectActionsAvailable: true,
    retryProvisionAvailable: false,
    networkApproveAvailable: false,
    markValidationCompleteAvailable: false,
    followUpAvailable: true,
    supportAssignmentAvailable: true,
    contactHistoryAvailable: true,
    linkOrganizationAvailable: true,
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

function renderDetail(locals) {
  const source = fs.readFileSync(VIEW, "utf8");
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
      platformAdmins: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          displayName: "Ops Admin",
          email: "ops@example.com",
        },
      ],
      followUpStatuses: ["contact_pending", "contacted"],
      contactMethods: ["phone", "email", "internal_note"],
      contactOutcomes: ["reached", "other"],
      csrfField: "_csrf",
      csrfToken: "test-csrf",
      notice: null,
      error: null,
      duplicateWarning: { show: false, match: null, listHref: null, advisory: true },
      intent: "",
      ...locals,
    },
    {
      filename: VIEW,
      root: PARTIALS,
      views: [PARTIALS],
    }
  );
}

function primaryHtml(html) {
  const idx = html.indexOf('data-bb-pa-reg-secondary="1"');
  return idx >= 0 ? html.slice(0, idx) : html;
}

describe("registration detail overview and structured details (no Postgres)", () => {
  it("renders Phase 5 hub header and decision panel", () => {
    const html = renderDetail({});
    assert.match(html, /data-bb-pa-reg-phase5-hub="1"/);
    assert.match(html, /data-bb-pa-reg-detail-overview="1"/);
    assert.match(html, /data-bb-pa-reg-church-name="1"/);
    assert.match(html, /Grace Test Church/);
    assert.match(html, /Back to Church Registrations/);
    assert.match(html, /data-bb-pa-phase5-status="new"/);
    assert.match(html, /data-bb-pa-reg-hub-decision="1"/);
    assert.match(html, /data-bb-pa-phase5-decision="approve"/);
    assert.match(html, /data-bb-pa-phase5-decision="request-information"/);
    assert.match(html, /data-bb-pa-phase5-decision="reject"/);
    assert.match(html, /aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee\/approve/);
    assert.doesNotMatch(primaryHtml(html), /#reg-actions/);
  });

  it("omits unavailable optional church fields from primary hub", () => {
    const html = renderDetail({
      application: baseApp({
        roleInChurch: null,
        branchName: "",
        branchCount: null,
        message: null,
        city: "",
        country: "Kenya",
        contactPhone: "",
        contactPhoneNormalized: "",
      }),
    });
    const primary = primaryHtml(html);
    assert.match(primary, /Kenya/);
    assert.doesNotMatch(primary, /Town or city/);
    assert.doesNotMatch(primary, /Expected branches/);
    assert.doesNotMatch(primary, /Applicant message/);
    assert.doesNotMatch(primary, /Position or role/);
    assert.doesNotMatch(primary, /Denomination|Tax ID|Estimated members/i);
  });

  it("escapes applicant message text", () => {
    const html = renderDetail({
      application: baseApp({ message: 'Hello <script>alert(1)</script> & "x"' }),
    });
    assert.match(html, /data-bb-pa-reg-hub-message="1"/);
    assert.match(html, /Hello &lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; (?:&quot;|&#34;)x(?:&quot;|&#34;)/);
    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  });

  it("renders duplicate warning when real match payload is provided", () => {
    const html = renderDetail({
      duplicateWarning: {
        show: true,
        advisory: true,
        listHref: "/admin/registration-applications/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/duplicates",
        match: {
          id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          name: "Existing Grace Chapel",
          location: "Lusaka, Zambia",
          reason: "Exact name",
          riskLevel: "strong",
          riskLabel: "High match",
          stateLabel: "active",
          existingHref: "/admin/organizations/grace-existing",
          compareHref: null,
        },
      },
    });
    assert.match(html, /data-bb-pa-reg-dup-warning="1"/);
    assert.match(html, /data-bb-pa-reg-dup-banner="1"/);
    assert.match(html, /Possible duplicate church found/i);
    assert.match(html, /Existing Grace Chapel/);
    assert.match(html, /data-bb-pa-reg-dup-view-existing="1"/);
    assert.match(html, /href="\/admin\/organizations\/grace-existing"/);
    assert.match(html, /data-bb-pa-reg-dup-continue="1"/);
    assert.match(html, /data-bb-pa-reg-dup-reject="1"/);
    assert.match(html, /rejection_category=duplicate_registration/);
  });

  it("hides duplicate warning when no matches", () => {
    const html = renderDetail({
      duplicateWarning: { show: false, match: null, listHref: null, advisory: true },
    });
    assert.match(html, /data-bb-pa-reg-dup-warning="0"/);
    assert.doesNotMatch(html, /data-bb-pa-reg-dup-banner="1"/);
    assert.doesNotMatch(html, /Possible duplicate church found/i);
  });

  it("shows existing-record link only when duplicate payload includes a valid href", () => {
    const withLink = renderDetail({
      duplicateWarning: {
        show: true,
        advisory: true,
        listHref: "/admin/registration-applications/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/duplicates",
        match: {
          name: "Linked Chapel",
          reason: "Exact name",
          riskLabel: "High match",
          existingHref: "/admin/organizations/linked-chapel",
        },
      },
    });
    assert.match(withLink, /data-bb-pa-reg-dup-view-existing="1"/);
    assert.match(withLink, /href="\/admin\/organizations\/linked-chapel"/);

    const withoutLink = renderDetail({
      duplicateWarning: {
        show: true,
        advisory: true,
        listHref: null,
        match: {
          name: "Unlinked Chapel",
          reason: "Exact name",
          riskLabel: "High match",
          existingHref: null,
        },
      },
    });
    assert.match(withoutLink, /data-bb-pa-reg-dup-banner="1"/);
    assert.doesNotMatch(withoutLink, /data-bb-pa-reg-dup-view-existing="1"/);
  });

  it("preserves application id on Phase 5 decision links", () => {
    const html = renderDetail({});
    const id = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    assert.match(html, new RegExp(`/admin/registration-applications/${id}/approve`));
    assert.match(
      html,
      new RegExp(`/admin/registration-applications/${id}/request-information`)
    );
    assert.match(html, new RegExp(`/admin/registration-applications/${id}/reject`));
  });

  it("keeps secondary evidence accessible and Phase 5 confirmation links", () => {
    const html = renderDetail({});
    assert.match(html, /data-bb-pa-reg-secondary="1"/);
    assert.match(html, /Additional review details/);
    assert.match(html, /data-bb-pa-approve-form="1"/);
    assert.match(
      html,
      /href="\/admin\/registration-applications\/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee\/approve"/
    );
    assert.doesNotMatch(
      html,
      /method="post"[\s\S]*action="\/admin\/registration-applications\/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee\/approve"/
    );
    assert.match(html, /data-bb-pa-reg-rejection-form="1"|data-bb-pa-reg-rejection="1"/);
    assert.match(
      html,
      /href="\/admin\/registration-applications\/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee\/reject"/
    );
    assert.match(html, /data-bb-pa-reg-documents="1"/);
    assert.match(html, /data-bb-pa-reg-verification="1"/);
    assert.match(html, /id="reg-actions"/);
  });

  it("keeps technical identifiers out of primary decision reading flow labels", () => {
    const primary = primaryHtml(renderDetail({}));
    assert.doesNotMatch(primary, /Application ID|Organization key|Provisioning status|Deployment/i);
    assert.doesNotMatch(primary, /data-bb-pa-reg-app-ref=/);
  });

  it("renders mobile sticky decision markup", () => {
    const html = renderDetail({});
    assert.match(html, /data-bb-pa-reg-hub-mobile-decision="1"/);
    assert.match(html, /data-bb-pa-phase5-decision-mobile="approve"/);
    assert.match(html, /data-bb-pa-phase5-decision-mobile="request-information"/);
    assert.match(html, /data-bb-pa-phase5-decision-mobile="reject"/);
    assert.match(html, /data-bb-pa-reg-hub-call="1"|data-bb-pa-reg-hub-call-btn="1"/);
    assert.match(html, /data-bb-pa-reg-hub-mailto="1"|data-bb-pa-reg-hub-email-btn="1"/);
  });

  it("wraps long church names and emails without inventing verification claims", () => {
    const html = renderDetail({
      application: baseApp({
        churchName: "Grace Community Chapel of the Everlasting Covenant Fellowship International",
        contactEmail: "very.long.applicant.email.address@example.ministry.organization.test",
      }),
    });
    assert.match(html, /bb-pa-reg-hub__title/);
    assert.match(html, /bb-pa-reg-hub__email|bb-pa-reg-hub__contact-value/);
    assert.doesNotMatch(html, /phone is verified|email is verified|Verified contact/i);
  });

  it("opens secondary details only for follow-up intent (Phase 5 actions use dedicated pages)", () => {
    const rejectIntent = renderDetail({ intent: "reject" });
    assert.doesNotMatch(
      rejectIntent,
      /data-bb-pa-reg-secondary="1"[^>]*\sopen|data-bb-pa-reg-secondary="1" open/
    );
    const followUp = renderDetail({ intent: "follow-up" });
    assert.match(
      followUp,
      /data-bb-pa-reg-secondary="1"[^>]*\sopen|data-bb-pa-reg-secondary="1" open/
    );
  });
});
