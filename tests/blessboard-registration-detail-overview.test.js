"use strict";

/**
 * Phase2 Batch 4–5 — registration detail overview + structured details (markup only).
 * No PostgreSQL required.
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
      ...locals,
    },
    {
      filename: VIEW,
      root: PARTIALS,
      views: [PARTIALS],
    }
  );
}

describe("registration detail overview and structured details (no Postgres)", () => {
  it("renders overview header fields and section navigation", () => {
    const html = renderDetail({});
    assert.match(html, /data-bb-pa-reg-detail-overview="1"/);
    assert.match(html, /data-bb-pa-reg-church-name="1"/);
    assert.match(html, /Grace Test Church/);
    assert.match(html, /data-bb-pa-reg-app-ref="1"/);
    assert.match(html, /data-bb-pa-reg-overview-chips="1"/);
    assert.match(html, /data-bb-pa-reg-overview-applicant="1"/);
    assert.match(html, /Pat Applicant/);
    assert.match(html, /data-bb-pa-reg-overview-assignee="1"/);
    assert.match(html, /Ops Admin/);
    assert.match(html, /data-bb-pa-reg-overview-follow-up="1"/);
    assert.match(html, /data-bb-pa-reg-overview-activity="1"/);
    assert.match(html, /data-bb-pa-reg-section-nav="1"/);
    assert.match(html, /href="#reg-overview"/);
    assert.match(html, /href="#reg-details"/);
    assert.match(html, /href="#reg-applicant"/);
    assert.match(html, /href="#reg-administration"/);
    assert.match(html, /href="#reg-website"/);
    assert.match(html, /href="#reg-documents"/);
    assert.match(html, /href="#reg-verification"/);
    assert.match(html, /href="#reg-activity"/);
  });

  it("renders structured detail group headings and origin labels", () => {
    const html = renderDetail({});
    assert.match(html, /data-bb-pa-reg-detail-grid="1"/);
    assert.match(html, /data-bb-pa-reg-card="church"/);
    assert.match(html, /Church information/);
    assert.match(html, /data-bb-pa-reg-card="location"/);
    assert.match(html, /Location and first branch/);
    assert.match(html, /data-bb-pa-reg-card="applicant"/);
    assert.match(html, /Contact and applicant/);
    assert.match(html, /data-bb-pa-reg-card="administration"/);
    assert.match(html, /Proposed administration/);
    assert.match(html, /data-bb-pa-reg-card="website"/);
    assert.match(html, /Website and access/);
    assert.match(html, /data-bb-pa-reg-card="declarations"/);
    assert.match(html, /Declarations and submission/);
    assert.match(html, /data-bb-pa-reg-origin="applicant"/);
    assert.match(html, /Applicant-provided/);
    assert.match(html, /data-bb-pa-reg-origin="system"/);
    assert.match(html, /System-derived/);
    assert.match(html, /data-bb-pa-reg-origin="admin"/);
    assert.match(html, /Administrator-entered/);
  });

  it("uses Not provided for optional empties and omits schema-missing fields", () => {
    const html = renderDetail({
      application: baseApp({
        roleInChurch: null,
        branchName: "",
        branchCount: null,
        message: null,
        city: "",
        country: "Kenya",
        contactPhone: "",
      }),
    });
    assert.match(html, /Role or relationship[\s\S]*Not provided/);
    assert.match(html, /First branch name[\s\S]*Not provided/);
    assert.match(html, /Town or city[\s\S]*Not provided/);
    assert.match(html, /Phone[\s\S]*Not provided/);
    assert.doesNotMatch(html, /Denomination|Tax ID|Street address|Postal|WhatsApp|Preferred contact method/i);
    assert.doesNotMatch(html, /Existing branch count \(stated\)/);
    assert.doesNotMatch(html, /Applicant notes/);
  });

  it("renders honest documents empty state without upload or download controls", () => {
    const html = renderDetail({});
    assert.match(html, /data-bb-pa-reg-documents="1"/);
    assert.match(html, /No registration documents available/i);
    assert.match(html, /No registration documents are stored or linked/i);
    assert.doesNotMatch(html, /type="file"|name="document"|Upload document|Request Resubmission|Approve All|View Sensitive/i);
    assert.doesNotMatch(html, /href="[^"]*\/download|data-bb-pa-reg-doc-download|data-bb-pa-reg-doc-upload/i);
    assert.doesNotMatch(html, /Authenticity \d|Verified Oct|document was checked/i);
  });

  it("does not invent verification progress or duplicate results", () => {
    const html = renderDetail({});
    assert.doesNotMatch(html, /Verification Progress|verification score|98\.5%/i);
    assert.doesNotMatch(html, /Confirmed duplicate|No likely duplicate|Possible match|Duplicate Checks/i);
    assert.doesNotMatch(html, /www\.gracecommunityassembly|Certificate_of_Incorporation/i);
  });

  it("preserves Approve and Reject form actions and methods", () => {
    const html = renderDetail({});
    assert.match(html, /data-bb-pa-approve-form="1"/);
    assert.match(
      html,
      /method="post"\s+action="\/admin\/registration-applications\/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee\/approve"/
    );
    assert.match(html, />Approve and provision</);
    assert.match(html, /data-bb-pa-reject-form="1"/);
    assert.match(html, /id="reg-rejection"/);
    assert.match(
      html,
      /method="post"\s+action="\/admin\/registration-applications\/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee\/reject"/
    );
    assert.match(html, /name="internal_decision_note"/);
    assert.match(html, /Reject and record decision/);
    assert.doesNotMatch(html, /name="rejection_reason"/);
    assert.doesNotMatch(html, />Reject application</);
    assert.match(html, /data-bb-pa-assign-support-form="1"/);
    assert.match(html, /data-bb-pa-contact-form="1"/);
    assert.match(html, /data-bb-pa-link-organization-form="1"/);
  });

  it("keeps mobile-friendly section structure markers", () => {
    const html = renderDetail({});
    assert.match(html, /id="reg-overview"/);
    assert.match(html, /id="reg-details"/);
    assert.match(html, /id="reg-applicant"/);
    assert.match(html, /id="reg-administration"/);
    assert.match(html, /id="reg-website"/);
    assert.match(html, /id="reg-documents"/);
    assert.match(html, /id="reg-activity"/);
    assert.match(html, /id="reg-actions"/);
    assert.match(html, /id="reg-rejection"/);
    assert.match(html, /bb-pa-reg-detail-grid/);
    assert.match(html, /bb-pa-reg-section-nav/);
  });

  it("escapes applicant-provided HTML content", () => {
    const html = renderDetail({
      application: baseApp({
        churchName: '<img src=x onerror=alert(1)>Evil Church',
        contactName: '<script>alert(2)</script>',
        message: '<b>bold</b> & notes',
      }),
    });
    assert.doesNotMatch(html, /<img src=x onerror=/);
    assert.doesNotMatch(html, /<script>alert\(2\)<\/script>/);
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;Evil Church|&lt;img/);
    assert.match(html, /&lt;script&gt;alert\(2\)&lt;\/script&gt;/);
    assert.match(html, /&lt;b&gt;bold&lt;\/b&gt; &amp; notes/);
  });

  it("states website fields are not stored when unlinked", () => {
    const html = renderDetail({
      application: baseApp({ organizationKey: null, organizationId: null }),
    });
    assert.match(html, /No requested website URL or slug was stored/i);
    assert.match(html, /Not linked/);
    assert.doesNotMatch(html, /Official Primary Domain|Member Care Subdomain/i);
  });
});
