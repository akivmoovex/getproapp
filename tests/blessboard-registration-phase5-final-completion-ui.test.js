"use strict";

/**
 * Phase 5 final completion UI markers across queue, hub states, and decision flows.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");
const ejs = require("ejs");

const registrationQueue = require("../src/blessboard/services/registrationQueuePresentation");
const registrationStatus = require("../src/blessboard/services/registrationStatusPresentation");

const PARTIALS = path.join(__dirname, "../views/blessboard/v5/partials");
const CSS = path.join(__dirname, "../public/blessboard/v5/platform-admin.css");
const SHELL = path.join(PARTIALS, "platform-admin-shell-start.ejs");

function renderFile(rel, locals) {
  const view = path.join(__dirname, "../views/blessboard/v5", rel);
  const source = fs.readFileSync(view, "utf8");
  const wrapped = source
    .replace("<%- include('../partials/platform-admin-shell-start') %>", "<!-- shell-start -->")
    .replace("<%- include('../partials/platform-admin-shell-end') %>", "<!-- shell-end -->");
  return ejs.render(
    wrapped,
    {
      registrationQueue,
      registrationStatus,
      csrfField: "_csrf",
      csrfToken: "test-csrf",
      notice: null,
      error: null,
      ...locals,
    },
    { filename: view, root: PARTIALS, views: [PARTIALS] }
  );
}

function renderPartial(name, locals) {
  const view = path.join(PARTIALS, name);
  return ejs.render(fs.readFileSync(view, "utf8"), locals, {
    filename: view,
    root: PARTIALS,
    views: [PARTIALS],
  });
}

const APP = {
  id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  churchName: "Grace Test Church With A Very Long Name For Overflow",
  contactName: "Pat Applicant With Long Name",
  contactEmail: "very.long.email.address.for.overflow.testing@example.org",
  contactPhoneNormalized: "+260971000001",
  selectedPlan: "foundation",
  selectedPlanLabel: "Foundation",
  applicationStatus: "submitted",
  provisioningStatus: "not_started",
  followUpStatus: "awaiting_customer",
  riskReviewActionsAvailable: true,
  rejectActionsAvailable: true,
  city: "Lusaka",
  country: "Zambia",
  branchName: "Headquarters",
};

const queueLocals = {
  applications: [],
  filters: {},
  queueFilters: [
    { key: "", label: "All" },
    { key: "needs_review", label: "Needs review" },
    { key: "phase5_new", label: "New (phase5)" },
  ],
  total: 0,
  page: 1,
  limit: 25,
  allowedLimits: [10, 25, 50],
  allowedPlans: ["foundation", "growth", "network"],
  applicationStatuses: [],
  provisioningStatuses: [],
  followUpStatuses: [],
  linkedFilters: ["all", "linked", "unlinked"],
  listError: false,
  visibleStatus: "",
  totalPages: 0,
  rangeFrom: 0,
  rangeTo: 0,
};

describe("Phase 5 final completion screen markers", () => {
  it("queue desktop markers: New filter maps to phase5_new residual set", () => {
    assert.deepEqual(registrationQueue.applyVisibleStatusQuery({ visible_status: "new" }), {
      queue: "phase5_new",
    });
    assert.equal(
      registrationQueue.resolveSelectedVisibleStatus({ queue: "phase5_new" }),
      "new"
    );
    const html = renderFile("platform-admin/registration-applications.ejs", {
      ...queueLocals,
      applications: [
        {
          ...APP,
          followUpStatus: "new",
          createdAt: "2026-07-20T10:00:00.000Z",
        },
      ],
      total: 1,
      totalPages: 1,
      rangeFrom: 1,
      rangeTo: 1,
      visibleStatus: "new",
      filters: { queue: "phase5_new" },
    });
    assert.match(html, /data-bb-pa-reg-phase5-queue="1"/);
    assert.match(html, /data-bb-pa-reg-queue-new-hint="1"/);
    assert.match(html, /residual|not Needs Information/i);
    assert.match(html, /name="visible_status"[\s\S]*value="new"[^>]*selected/);
    assert.match(html, /bb-pa-reg-queue/);
  });

  it("queue mobile card hooks and empty state", () => {
    const withRows = renderFile("platform-admin/registration-applications.ejs", {
      ...queueLocals,
      applications: [
        {
          ...APP,
          followUpStatus: "new",
          createdAt: "2026-07-20T10:00:00.000Z",
        },
      ],
      total: 1,
      totalPages: 1,
      rangeFrom: 1,
      rangeTo: 1,
    });
    assert.match(withRows, /data-bb-pa-reg-cards="1"/);
    assert.match(withRows, /bb-pa-reg-queue__card/);
    const empty = renderFile("platform-admin/registration-applications.ejs", queueLocals);
    assert.match(empty, /data-bb-pa-reg-phase5-queue="1"/);
    assert.match(empty, /No church registrations yet/);
  });

  it("duplicate warning presentation markers", () => {
    const warn = registrationQueue.presentPhase5DuplicateWarning(
      {
        ok: true,
        empty: false,
        matches: [
          {
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            riskLevel: "strong",
            riskLabel: "Strong match",
            churchName: "Grace Other",
          },
        ],
      },
      APP.id
    );
    assert.equal(warn.show, true);
    assert.ok(warn.match);
  });

  it("approval confirmation collapses org-key override", () => {
    const html = renderFile("platform-admin/registration-application-approve-confirm.ejs", {
      application: { ...APP, followUpStatus: "new" },
      duplicateWarning: { show: false },
      suggestedOrganizationKey:
        registrationQueue.presentSuggestedOrganizationKeyPreview(APP.churchName),
    });
    assert.match(html, /data-bb-pa-reg-approve-confirm="1"/);
    assert.match(html, /data-bb-pa-reg-approve-org-key-collapsed="1"/);
    assert.match(html, /data-bb-pa-approve-confirm-submit="1"/);
    assert.match(html, /<details[\s\S]*organization key override/i);
  });

  it("processing overlay is honest and client-only until POST returns", () => {
    const html = renderFile("platform-admin/registration-application-approve-confirm.ejs", {
      application: { ...APP, followUpStatus: "new" },
      duplicateWarning: { show: false },
      suggestedOrganizationKey:
        registrationQueue.presentSuggestedOrganizationKeyPreview(APP.churchName),
    });
    assert.match(html, /data-bb-pa-reg-approve-processing="1"/);
    assert.match(html, /data-bb-pa-reg-approve-processing-honest="1"/);
    assert.match(html, /not marked complete until the server replies/i);
    assert.doesNotMatch(html, /Approval complete|Provisioning succeeded/i);
  });

  it("approved success exposes public miniwebsite link and copy-once invite", () => {
    const html = renderPartial("pa-registration-approved-success.ejs", {
      org: {
        organizationKey: "grace-community",
        displayName: "Grace Community Chapel",
        organizationStatus: "active",
        planLabel: "Foundation",
        firstBranchName: "Main Branch",
      },
      branches: [{ displayName: "Main Branch", isPrimary: true }],
      notice: "organization_provisioned",
      inviteOnceLink: "https://blessboard.org/invite/accept?token=demo",
      pendingInvitations: [
        { emailDisplay: "pat@example.com", displayName: "Pat Applicant" },
      ],
      onboardingSummary: {
        publicWebsitePath: "/c/grace-community",
        publicWebsiteAvailable: true,
      },
      statusChip: () => "bb-pa-chip--ok",
      statusLabel: (s) => s || "active",
    });
    assert.match(html, /data-bb-pa-reg-approved="1"/);
    assert.match(html, /data-bb-pa-reg-approved-open-public="1"/);
    assert.match(html, /href="\/c\/grace-community"/);
    assert.match(html, /data-bb-pa-invite-copy-once="1"/);
    assert.match(html, /data-bb-pa-reg-approved-email-note="1"/);
    assert.match(html, /Transactional invitation email is attempted after provisioning/i);
    assert.doesNotMatch(html, /data-bb-pa-reg-approved-no-email="1"/);
  });

  it("request information + information requested honest delivery", () => {
    const request = renderFile(
      "platform-admin/registration-application-request-information.ejs",
      {
        application: APP,
        infoRequestReasons: registrationQueue.PHASE5_INFO_REQUEST_REASONS,
        duplicateWarning: { show: false },
      }
    );
    assert.match(request, /data-bb-pa-reg-request-info="1"/);
    assert.match(request, /data-bb-pa-reg-request-delivery-banner="1"/);
    assert.match(request, /External delivery is not yet connected/);
    assert.match(request, /Record information request/);

    const result = renderFile(
      "platform-admin/registration-application-information-requested.ejs",
      {
        application: APP,
        needsInformationState: {
          hasRequest: true,
          waiting: true,
          reasonLabels: ["Proof of church registration"],
          messageSummary: "Please upload registration documents.",
          requestedAt: "2026-07-25T10:00:00.000Z",
          recipient: "pat@example.com",
          latestEvent: { actor_user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
          delivery: { key: "recorded", label: "Information request recorded" },
        },
        deliverySummary: { key: "recorded", label: "Information request recorded" },
      }
    );
    assert.match(result, /data-bb-pa-reg-info-requested="1"/);
    assert.match(result, /data-bb-pa-reg-info-no-false-sent="1"/);
  });

  it("needs information hub panel without Send Reminder", () => {
    const html = renderPartial("pa-registration-needs-information.ejs", {
      app: {
        churchName: "Grace",
        contactName: "Pat",
        applicationStatus: "submitted",
        followUpStatus: "awaiting_customer",
        rejectActionsAvailable: true,
      },
      phase5Status: {
        key: "needs_information",
        label: "Needs Information",
        chipClass: "bb-pa-chip--warn",
      },
      needsInformationState: {
        hasRequest: true,
        waiting: true,
        reasonLabels: ["Proof of registration"],
        messageSummary: "Please send documents",
        requestedAt: "2026-07-25T10:00:00.000Z",
      },
      phoneDisplay: "+260971000001",
      emailDisplay: "pat@example.com",
      appIdEnc: APP.id,
      canPhase5Approve: false,
      decisionApproveHref: "#",
      decisionRejectHref: `/admin/registration-applications/${APP.id}/reject`,
      registrationQueue,
    });
    assert.match(html, /data-bb-pa-reg-needs-info="1"/);
    assert.match(html, /data-bb-pa-reg-needs-status-banner="1"/);
    assert.match(html, /data-bb-pa-reg-needs-no-reminder="1"/);
    assert.match(html, /Send reminder is not available/i);
    assert.doesNotMatch(html, />Send Reminder</);
  });

  it("rejection confirm + rejected result reopen gate", () => {
    const reject = renderFile("platform-admin/registration-application-reject.ejs", {
      application: { ...APP, followUpStatus: "new" },
      rejectReasons: registrationQueue.PHASE5_REJECT_REASONS,
      rejectBlocked: false,
      duplicateWarning: { show: false },
    });
    assert.match(reject, /data-bb-pa-reg-reject="1"|data-bb-pa-reject-form="1"/);

    const rejected = renderFile("platform-admin/registration-application-rejected.ejs", {
      application: { ...APP, applicationStatus: "rejected", followUpStatus: "closed" },
      rejectionSummary: {
        category: "incomplete_application",
        categoryLabel: "Incomplete application",
        canReopen: true,
        rejectedAt: "2026-07-25T12:00:00.000Z",
        actorUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        deliveryKey: "recorded",
        deliveryLabel: "Rejection recorded",
        applicantMessage: "We could not approve this application.",
        internalNote: "Missing documents.",
      },
      duplicateWarning: { show: false },
    });
    assert.match(rejected, /data-bb-pa-reg-rejected="1"/);
    assert.match(rejected, /data-bb-pa-reg-rejected-reopen="1"/);
    assert.match(rejected, /data-bb-pa-reg-rejected-no-approve="1"/);
  });

  it("CSS includes completion styles; shell bumped to v=57", () => {
    const css = fs.readFileSync(CSS, "utf8");
    assert.match(css, /\.bb-pa-reg-approve-processing__bar-fill\b/);
    assert.match(css, /\.bb-pa-reg-approved__icon\b/);
    assert.match(css, /\.bb-pa-reg-request-info__channels\b/);
    assert.match(css, /\.bb-pa-reg-communications__compose-actions\b/);
    assert.match(css, /@media \(max-width: 390px\)/);
    const shell = fs.readFileSync(SHELL, "utf8");
    assert.match(shell, /platform-admin\.css\?v=57/);
  });
});
