"use strict";

/**
 * Phase2 — approval checklist UI on registration detail (no Postgres).
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");
const ejs = require("ejs");

const registrationStatus = require("../src/blessboard/services/registrationStatusPresentation");
const {
  ITEM_DEFS,
  STATUSES,
  buildRegistrationApprovalChecklist,
} = require("../src/blessboard/services/registrationApprovalChecklist");

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

function sampleChecklist(overrides = {}) {
  const built = buildRegistrationApprovalChecklist({
    now: "2026-07-23T23:00:00.000Z",
    verification: {
      facts: [
        {
          key: "required_fields_complete",
          status: "passed",
          result: "complete",
          supported: true,
        },
        {
          key: "phone_unique_registration_scope",
          status: "passed",
          result: "unique",
          supported: true,
          explanation: "Registration applications only.",
        },
        {
          key: "email_unique_platform_users_only",
          status: "passed",
          result: "unique_among_platform_users",
          supported: true,
        },
        {
          key: "duplicate_review_evidence",
          status: "manually_reviewed",
          result: "admin_action_recorded",
          supported: true,
        },
        {
          key: "applicant_contacted_by_phone",
          status: "manually_reviewed",
          result: "phone_contact_logged",
          supported: true,
        },
        {
          key: "authority_terms_accepted",
          status: "passed",
          result: "terms_accepted",
          supported: true,
        },
        {
          key: "organization_key_available",
          status: "not_checked",
          result: "not_stored",
          supported: true,
        },
        {
          key: "final_reviewer_note_present",
          status: "not_checked",
          result: "no_reviewer_note",
          supported: true,
        },
        {
          key: "applicant_email_verified",
          status: "not_checked",
          supported: false,
        },
        {
          key: "applicant_identity_confirmed",
          status: "not_checked",
          supported: false,
        },
      ],
    },
  });
  return { ...built, ...overrides, items: overrides.items || built.items, summary: overrides.summary || built.summary };
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
      approvalChecklist: sampleChecklist(),
      ...locals,
    },
    {
      filename: VIEW,
      root: PARTIALS,
      views: [PARTIALS],
    }
  );
}

describe("registration approval checklist UI (no Postgres)", () => {
  it("renders the checklist section and nav link", () => {
    const html = renderDetail();
    assert.match(html, /data-bb-pa-reg-checklist="1"/);
    assert.match(html, /id="reg-approval-checklist"/);
    assert.match(html, /href="#reg-approval-checklist"/);
    assert.match(html, />Approval checklist</);
    assert.match(html, /Approval requirements/);
  });

  it("renders summary values", () => {
    const html = renderDetail();
    assert.match(html, /data-bb-pa-reg-checklist-summary="1"/);
    assert.match(html, /data-bb-pa-reg-checklist-count="requiredComplete"/);
    assert.match(html, /data-bb-pa-reg-checklist-count="requiredOutstanding"/);
    assert.match(html, /data-bb-pa-reg-checklist-count="complete"/);
    assert.match(html, /data-bb-pa-reg-checklist-count="warning"/);
    assert.match(html, /data-bb-pa-reg-checklist-count="manualReviewRequired"/);
    assert.match(html, /data-bb-pa-reg-checklist-count="notAvailable"/);
    assert.match(html, /data-bb-pa-reg-checklist-count="calculatedAt"/);
  });

  it("renders all ten checklist labels", () => {
    const html = renderDetail();
    for (const def of ITEM_DEFS) {
      assert.match(html, new RegExp(def.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(html, new RegExp(`data-bb-pa-reg-checklist-item-key="${def.key}"`));
    }
  });

  it("supports every checklist status", () => {
    const items = ITEM_DEFS.map((def, i) => {
      const statuses = Object.values(STATUSES);
      return {
        key: def.key,
        label: def.label,
        status: statuses[i % statuses.length],
        explanation: `Explanation for ${def.key}`,
        sourceFactKeys: def.sourceFactKeys,
        supported: true,
        required: def.required,
        actionTarget: def.actionTarget,
      };
    });
    const html = renderDetail({
      approvalChecklist: {
        items,
        summary: {
          total: 10,
          complete: 2,
          incomplete: 2,
          warning: 2,
          notAvailable: 2,
          manualReviewRequired: 2,
          requiredComplete: 2,
          requiredOutstanding: 8,
        },
        calculatedAt: "2026-07-23T23:00:00.000Z",
        advisory: true,
      },
    });
    assert.match(html, /data-bb-pa-reg-checklist-item-status="complete"/);
    assert.match(html, /data-bb-pa-reg-checklist-item-status="incomplete"/);
    assert.match(html, /data-bb-pa-reg-checklist-item-status="warning"/);
    assert.match(html, /data-bb-pa-reg-checklist-item-status="not_available"/);
    assert.match(html, /data-bb-pa-reg-checklist-item-status="manual_review_required"/);
    assert.match(html, />Complete</);
    assert.match(html, />Incomplete</);
    assert.match(html, />Warning</);
    assert.match(html, />Not available</);
    assert.match(html, />Manual review required</);
  });

  it("renders required and optional indicators", () => {
    const html = renderDetail({
      approvalChecklist: {
        items: [
          {
            key: "required_fields_complete",
            label: "Required registration fields complete",
            status: "complete",
            explanation: "ok",
            sourceFactKeys: ["required_fields_complete"],
            supported: true,
            required: true,
            actionTarget: "#reg-verification",
          },
          {
            key: "applicant_called",
            label: "Applicant called",
            status: "incomplete",
            explanation: "missing",
            sourceFactKeys: ["applicant_contacted_by_phone"],
            supported: true,
            required: false,
            actionTarget: null,
          },
        ],
        summary: {
          total: 2,
          complete: 1,
          incomplete: 1,
          warning: 0,
          notAvailable: 0,
          manualReviewRequired: 0,
          requiredComplete: 1,
          requiredOutstanding: 0,
        },
        calculatedAt: null,
        advisory: true,
      },
    });
    assert.match(html, /data-bb-pa-reg-checklist-item-required="1"/);
    assert.match(html, /data-bb-pa-reg-checklist-item-required="0"/);
    assert.match(html, /data-bb-pa-reg-checklist-item-required-chip="1"[^>]*>Required</);
    assert.match(html, /data-bb-pa-reg-checklist-item-required-chip="1"[^>]*>Optional</);
  });

  it("shows advisory notice", () => {
    const html = renderDetail();
    assert.match(html, /data-bb-pa-reg-checklist-advisory="1"/);
    assert.match(html, /data-bb-pa-reg-checklist-notice="1"/);
    assert.match(
      html,
      /This checklist supports review but does not change the current BlessBoard approval rules/
    );
  });

  it("renders valid local action targets only", () => {
    const html = renderDetail({
      approvalChecklist: {
        items: [
          {
            key: "phone_uniqueness_reviewed",
            label: "Phone uniqueness reviewed",
            status: "complete",
            explanation: "ok",
            sourceFactKeys: ["phone_unique_registration_scope"],
            supported: true,
            required: true,
            actionTarget: "#reg-verification",
          },
          {
            key: "applicant_authority_confirmed",
            label: "Applicant authority confirmed",
            status: "manual_review_required",
            explanation: "terms alone",
            sourceFactKeys: ["authority_terms_accepted"],
            supported: true,
            required: true,
            actionTarget: "#reg-administration",
          },
          {
            key: "website_or_organization_key_confirmed",
            label: "Website or organization key confirmed",
            status: "warning",
            explanation: "partial",
            sourceFactKeys: ["organization_key_available"],
            supported: true,
            required: true,
            actionTarget: "https://evil.example/phish",
          },
          {
            key: "applicant_called",
            label: "Applicant called",
            status: "incomplete",
            explanation: "missing",
            sourceFactKeys: [],
            supported: true,
            required: true,
            actionTarget: "/admin/something",
          },
        ],
        summary: {
          total: 4,
          complete: 1,
          incomplete: 1,
          warning: 1,
          notAvailable: 0,
          manualReviewRequired: 1,
          requiredComplete: 1,
          requiredOutstanding: 3,
        },
        calculatedAt: null,
        advisory: true,
      },
    });
    assert.match(html, /href="#reg-verification"[^>]*>Review verification</);
    assert.match(html, /href="#reg-administration"[^>]*>Review administration</);
    assert.doesNotMatch(html, /href="https:\/\/evil\.example/);
    assert.doesNotMatch(html, /href="\/admin\/something"/);
  });

  it("keeps partial-scope explanations visible", () => {
    const html = renderDetail();
    assert.match(html, /platform users only/i);
    assert.match(html, /does not confirm|alone does not|phone contact/i);
  });

  it("missing checklist uses safe warning state", () => {
    for (const approvalChecklist of [null, undefined, "bad", 12]) {
      const html = renderDetail({ approvalChecklist });
      assert.match(html, /data-bb-pa-reg-checklist-fallback="1"/);
      assert.match(html, /data-bb-pa-reg-checklist-missing="1"/);
      assert.match(html, /could not be calculated/i);
      assert.match(html, /No checklist item is marked complete/i);
      assert.doesNotMatch(html, /data-bb-pa-reg-checklist-list="1"/);
    }
  });

  it("empty items use safe unavailable state", () => {
    const html = renderDetail({
      approvalChecklist: {
        items: [],
        summary: {
          total: 0,
          complete: 0,
          incomplete: 0,
          warning: 0,
          notAvailable: 0,
          manualReviewRequired: 0,
          requiredComplete: 0,
          requiredOutstanding: 0,
        },
        calculatedAt: null,
        advisory: true,
      },
    });
    assert.match(html, /data-bb-pa-reg-checklist-empty="1"/);
    assert.match(html, /Approval checklist information is not available/);
    assert.doesNotMatch(html, /data-bb-pa-reg-checklist-list="1"/);
  });

  it("does not add checklist POST forms or mutation controls", () => {
    const html = renderDetail();
    assert.doesNotMatch(html, /mark complete|override item|confirm checklist|recalculate/i);
    assert.doesNotMatch(html, /data-bb-pa-reg-checklist-action-form/);
    assert.doesNotMatch(html, /action="[^"]*checklist[^"]*"/i);
    assert.doesNotMatch(html, /name="checklist_/);
  });

  it("preserves Approve and Reject forms unchanged", () => {
    const html = renderDetail();
    assert.match(html, /data-bb-pa-approve-form="1"/);
    assert.match(html, /action="\/admin\/registration-applications\/[^"]+\/approve"/);
    assert.match(html, /data-bb-pa-reject-form="1"/);
    assert.match(html, /action="\/admin\/registration-applications\/[^"]+\/reject"/);
  });

  it("does not enable or disable approval based on checklist markup", () => {
    const html = renderDetail();
    assert.doesNotMatch(html, /data-bb-pa-approve-form="1"[^>]*disabled/);
    assert.doesNotMatch(html, /approvalChecklist[\s\S]{0,200}disabled/);
    assert.doesNotMatch(html, /readyForApproval/);
  });

  it("includes mobile-friendly structure", () => {
    const html = renderDetail();
    assert.match(html, /bb-pa-reg-checklist__/);
    assert.match(html, /data-bb-pa-reg-checklist-list="1"/);
    const css = fs.readFileSync(CSS, "utf8");
    assert.match(css, /\.bb-pa-reg-checklist\b/);
    assert.match(css, /@media \(max-width: 719px\)[\s\S]*bb-pa-reg-checklist__summary/);
    assert.match(css, /overflow-wrap:\s*anywhere/);
  });

  it("escapes dynamic content", () => {
    const html = renderDetail({
      approvalChecklist: {
        items: [
          {
            key: "required_fields_complete",
            label: '<img src=x onerror=alert(1)> Label',
            status: "incomplete",
            explanation: '<script>alert(1)</script> & "quoted"',
            sourceFactKeys: ["required_fields_complete"],
            supported: true,
            required: true,
            actionTarget: "#reg-verification",
          },
        ],
        summary: {
          total: 1,
          complete: 0,
          incomplete: 1,
          warning: 0,
          notAvailable: 0,
          manualReviewRequired: 0,
          requiredComplete: 0,
          requiredOutstanding: 1,
        },
        calculatedAt: null,
        advisory: true,
      },
    });
    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(html, /&lt;img src=x/);
  });

  it("route passes approvalChecklist locals without query override", () => {
    const source = fs.readFileSync(ROUTE, "utf8");
    assert.match(source, /approvalChecklist:\s*detail\.approvalChecklist/);
    assert.doesNotMatch(source, /req\.query\.approvalChecklist/);
    assert.doesNotMatch(source, /req\.body\.approvalChecklist/);
  });
});
