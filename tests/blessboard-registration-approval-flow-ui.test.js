"use strict";

/**
 * Phase 5 — approval confirmation + success presentation (markup; no Postgres).
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");
const ejs = require("ejs");

const registrationQueue = require("../src/blessboard/services/registrationQueuePresentation");

const CONFIRM_VIEW = path.join(
  __dirname,
  "../views/blessboard/v5/platform-admin/registration-application-approve-confirm.ejs"
);
const ORG_VIEW = path.join(
  __dirname,
  "../views/blessboard/v5/platform-admin/organization-detail.ejs"
);
const PARTIALS = path.join(__dirname, "../views/blessboard/v5/partials");
const CSS = path.join(__dirname, "../public/blessboard/v5/platform-admin.css");
const SHELL = path.join(
  __dirname,
  "../views/blessboard/v5/partials/platform-admin-shell-start.ejs"
);

function baseApp(overrides) {
  return {
    id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    churchName: "Grace Test Church",
    contactName: "Pat Applicant",
    contactEmail: "pat@example.com",
    city: "Lusaka",
    country: "Zambia",
    branchName: "Central Campus",
    selectedPlan: "foundation",
    selectedPlanLabel: "Foundation",
    riskReviewActionsAvailable: true,
    networkApproveAvailable: false,
    ...overrides,
  };
}

function renderConfirm(locals) {
  const source = fs.readFileSync(CONFIRM_VIEW, "utf8");
  const wrapped = source
    .replace("<%- include('../partials/platform-admin-shell-start') %>", "<!-- shell-start -->")
    .replace("<%- include('../partials/platform-admin-shell-end') %>", "<!-- shell-end -->");
  const app = (locals && locals.application) || baseApp();
  const suggested =
    (locals && locals.suggestedOrganizationKey) ||
    registrationQueue.presentSuggestedOrganizationKeyPreview(app.churchName);
  return ejs.render(
    wrapped,
    {
      registrationQueue,
      application: app,
      csrfField: "_csrf",
      csrfToken: "test-csrf",
      notice: null,
      error: null,
      duplicateWarning: { show: false, match: null, listHref: null, advisory: true },
      suggestedOrganizationKey: suggested,
      ...locals,
      application: app,
    },
    { filename: CONFIRM_VIEW, root: PARTIALS, views: [PARTIALS] }
  );
}

function renderOrg(locals) {
  const source = fs.readFileSync(ORG_VIEW, "utf8");
  const wrapped = source
    .replace("<%- include('../partials/platform-admin-shell-start') %>", "<!-- shell-start -->")
    .replace("<%- include('../partials/platform-admin-shell-end') %>", "<!-- shell-end -->");
  return ejs.render(
    wrapped,
    {
      organization: {
        organizationKey: "grace-test",
        displayName: "Grace Test Church",
        organizationStatus: "active",
        planKey: "free",
        planLabel: "Foundation",
        firstBranchName: "Central Campus",
      },
      branches: [
        {
          key: "central",
          displayName: "Central Campus",
          branchType: "hq",
          status: "active",
          isPrimary: true,
        },
      ],
      entitlements: null,
      usage: null,
      domains: [],
      plans: [],
      featureKeys: [],
      registrationApplicationId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      onboardingSummary: {
        publicWebsitePath: "/c/grace-test",
        publicWebsiteAvailable: true,
        publicWebsiteUnavailableReason: null,
      },
      supportContacts: [],
      platformAdmins: [],
      growthTrial: null,
      followUpStatuses: [],
      onboardingStatuses: [],
      inviteOnceLink: null,
      pendingInvitations: [],
      churchScope: null,
      csrfField: "_csrf",
      csrfToken: "test-csrf",
      notice: null,
      error: null,
      ...locals,
    },
    { filename: ORG_VIEW, root: PARTIALS, views: [PARTIALS] }
  );
}

describe("Phase 5 approval confirmation UI (no Postgres)", () => {
  it("loads confirmation with application summary and canonical approve POST", () => {
    const html = renderConfirm({});
    assert.match(html, /data-bb-pa-reg-approve-confirm="1"/);
    assert.match(html, /data-bb-pa-reg-approve-church="1"[^>]*>Grace Test Church</);
    assert.match(html, /data-bb-pa-reg-approve-plan="1"[^>]*>Foundation</);
    assert.match(html, /data-bb-pa-reg-approve-contact="1"/);
    assert.match(html, /Pat Applicant/);
    assert.match(html, /data-bb-pa-reg-approve-location="1"/);
    assert.match(html, /data-bb-pa-reg-approve-branch="1"[^>]*>Central Campus</);
    assert.match(html, /data-bb-pa-approve-confirm-form="1"/);
    assert.match(
      html,
      /action="\/admin\/registration-applications\/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee\/approve"/
    );
    assert.match(html, /method="post"/i);
    assert.match(html, /name="_csrf" value="test-csrf"/);
    assert.match(html, /name="organization_key"/);
    assert.match(html, /data-bb-pa-approve-confirm-submit="1"/);
    assert.match(html, /Confirm approval/);
  });

  it("cancel returns to the review hub", () => {
    const html = renderConfirm({});
    assert.match(
      html,
      /href="\/admin\/registration-applications\/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"/
    );
    assert.match(html, /data-bb-pa-reg-approve-cancel="1"/);
    assert.match(html, /data-bb-pa-reg-approve-cancel-btn="1"/);
  });

  it("shows advisory duplicate warning when supported", () => {
    const html = renderConfirm({
      duplicateWarning: {
        show: true,
        advisory: true,
        listHref: "/admin/registration-applications/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/duplicates",
        match: {
          name: "Existing Grace",
          location: "Lusaka, Zambia",
          reason: "Exact name",
          existingHref: "/admin/organizations/existing-grace",
        },
      },
    });
    assert.match(html, /data-bb-pa-reg-dup-banner="1"/);
    assert.match(html, /Possible duplicate church found/i);
    assert.match(html, /advisory/i);
    assert.match(html, /Existing Grace/);
    assert.match(html, /data-bb-pa-reg-dup-view-existing="1"/);
  });

  it("explains invitation preparation and omits automated email claims", () => {
    const html = renderConfirm({});
    assert.match(html, /data-bb-pa-reg-approve-effects="1"/);
    assert.match(html, /Create the organization/);
    assert.match(html, /Create the church and first branch/);
    assert.match(html, /HQ administrator invitation/i);
    assert.match(html, /public miniwebsite/i);
    assert.match(html, /data-bb-pa-reg-approve-no-email="1"/);
    assert.doesNotMatch(html, /welcome email has been sent|automated welcome email will be sent/i);
    assert.match(html, /no background job/i);
    assert.match(html, /data-bb-pa-reg-approve-org-key-preview="1"/);
    assert.match(html, /data-bb-pa-reg-approve-public-url-preview="1"/);
    assert.match(html, /\/c\/grace-test-church/);
    assert.match(html, /data-bb-pa-reg-approve-advanced="1"/);
    assert.match(html, /data-bb-pa-reg-approve-reviewer-note="1"/);
  });

  it("includes client processing state without fake completion", () => {
    const html = renderConfirm({});
    assert.match(html, /data-bb-pa-reg-approve-processing="1"/);
    assert.match(html, /Creating church organization/);
    assert.match(html, /Creating first branch/);
    assert.match(html, /Preparing administrator invitation/);
    assert.match(html, /not marked complete until the server replies/i);
    assert.match(html, /data-bb-pa-reg-approve-processing-honest="1"/);
    assert.match(html, /submitBtn\.disabled = true/);
    assert.match(html, /submitting = true/);
    assert.doesNotMatch(html, /setTimeout|setInterval|poll/i);
  });

  it("includes mobile-friendly full-width confirmation hooks", () => {
    const css = fs.readFileSync(CSS, "utf8");
    assert.match(css, /\.bb-pa-reg-approve-confirm\b/);
    assert.match(css, /\.bb-pa-reg-approve-processing\b/);
    assert.match(css, /@media \(max-width: 719px\)[\s\S]*bb-pa-reg-approve-confirm/);
    const shell = fs.readFileSync(SHELL, "utf8");
    assert.match(shell, /platform-admin\.css\?v=57/);
  });
});

describe("Phase 5 church approved success UI (no Postgres)", () => {
  it("renders success panel on organization detail for provisioned notice", () => {
    const html = renderOrg({
      notice: "organization_provisioned",
      inviteOnceLink: "https://blessboard.org/invite/accept?token=copy-once-test",
      pendingInvitations: [
        {
          emailDisplay: "pat@example.com",
          displayName: "Pat Applicant",
          roleKey: "church_hq_admin",
          expiresAt: "2026-08-01T00:00:00.000Z",
        },
      ],
    });
    assert.match(html, /data-bb-pa-reg-approved="1"/);
    assert.match(html, /data-bb-pa-reg-approved-notice="organization_provisioned"/);
    assert.match(html, /Grace Test Church/);
    assert.match(html, /data-bb-pa-reg-approved-plan="1"/);
    assert.match(html, /data-bb-pa-reg-approved-branch="1"[^>]*>Central Campus</);
    assert.match(html, /data-bb-pa-reg-approved-admin="1"/);
    assert.match(html, /Invitation prepared — delivery attempted/i);
    assert.match(html, /data-bb-pa-reg-approved-invite="1"/);
    assert.match(html, /data-bb-pa-reg-approved-copy="1"/);
    assert.match(html, /data-bb-pa-reg-approved-open-profile="1"/);
    assert.match(html, /Open organization/);
    assert.match(html, /data-bb-pa-reg-approved-org-key="1"/);
    assert.match(html, /data-bb-pa-reg-approved-public-path="1"[^>]*>\/c\/grace-test</);
    assert.match(html, /data-bb-pa-reg-approved-open-public="1"/);
    assert.match(html, /href="\/c\/grace-test"/);
    assert.match(html, /data-bb-pa-reg-approved-open-onboarding="1"/);
    assert.match(html, /href="\/admin\/organizations\/grace-test#pa-org-onboarding"/);
    assert.match(html, /data-bb-pa-reg-approved-return="1"/);
    assert.match(html, /href="\/admin\/registration-applications"/);
    assert.match(html, /data-bb-pa-reg-approved-email-note="1"/);
    assert.match(html, /Transactional invitation email is attempted after provisioning/i);
    assert.doesNotMatch(html, /data-bb-pa-reg-approved-no-email="1"/);
    assert.doesNotMatch(html, /Welcome Email Sent|Resend Welcome Email/i);
    assert.doesNotMatch(html, /href="[^"]*invite\/accept\?token=/);
    assert.match(html, /value="https:\/\/blessboard\.org\/invite\/accept\?token=copy-once-test"/);
  });

  it("does not re-expose invitation after cookie consumption", () => {
    const html = renderOrg({
      notice: "organization_provisioned",
      inviteOnceLink: null,
      pendingInvitations: [
        {
          emailDisplay: "pat@example.com",
          displayName: "Pat Applicant",
          roleKey: "church_hq_admin",
        },
      ],
    });
    assert.match(html, /data-bb-pa-reg-approved="1"/);
    assert.doesNotMatch(html, /data-bb-pa-reg-approved-invite="1"/);
    assert.doesNotMatch(html, /value="https:\/\/[^"]*invite\/accept/);
    assert.match(html, /Invitation pending/i);
  });

  it("shows already-provisioned messaging without regenerating invitation", () => {
    const html = renderOrg({
      notice: "already_provisioned",
      inviteOnceLink: null,
      pendingInvitations: [],
    });
    assert.match(html, /data-bb-pa-reg-approved="1"/);
    assert.match(html, /data-bb-pa-reg-approved-already="1"/);
    assert.match(html, /already linked|already provisioned/i);
    assert.doesNotMatch(html, /data-bb-pa-reg-approved-invite="1"/);
    assert.match(html, /No new invitation was generated/);
  });

  it("does not show success panel for unrelated notices", () => {
    const html = renderOrg({ notice: "plan_saved" });
    assert.doesNotMatch(html, /data-bb-pa-reg-approved="1"/);
  });
});
