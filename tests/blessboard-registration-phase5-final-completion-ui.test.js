"use strict";

/**
 * Phase 5 final screen completion markers (markup; no Postgres).
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

describe("Phase 5 final completion screen markers", () => {
  it("queue exposes New filter hint and phase5 markers", () => {
    const html = renderFile("platform-admin/registration-applications.ejs", {
      applications: [],
      filters: {},
      queueFilters: [{ key: "", label: "All" }, { key: "needs_review", label: "Needs review" }],
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
    });
    assert.match(html, /data-bb-pa-reg-phase5-queue="1"/);
    assert.match(html, /data-bb-pa-reg-queue-new-hint="1"/);
    assert.match(html, /visible_status/);
    assert.match(html, />New</);
  });

  it("request information shows honest delivery and unavailable SMS", () => {
    const html = renderFile("platform-admin/registration-application-request-information.ejs", {
      application: APP,
      infoRequestReasons: registrationQueue.PHASE5_INFO_REQUEST_REASONS,
      duplicateWarning: { show: false },
    });
    assert.match(html, /data-bb-pa-reg-request-info="1"/);
    assert.match(html, /data-bb-pa-reg-request-channels="1"/);
    assert.match(html, /SMS — unavailable/);
    assert.match(html, /data-bb-pa-reg-request-delivery-banner="1"/);
    assert.match(html, /External delivery is not yet connected/);
    assert.match(html, /Record information request/);
    assert.doesNotMatch(html, /Send email now|Message sent successfully/i);
  });

  it("information requested result has review and queue returns", () => {
    const html = renderFile(
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
    assert.match(html, /data-bb-pa-reg-info-requested="1"/);
    assert.match(html, /data-bb-pa-reg-info-follow-up="1"/);
    assert.match(html, /data-bb-pa-reg-info-view="1"/);
    assert.match(html, /Return to review/);
    assert.match(html, /data-bb-pa-reg-info-return="1"/);
    assert.match(html, /data-bb-pa-reg-info-no-false-sent="1"/);
    assert.match(html, /External delivery is not yet connected/);
  });

  it("rejected result exposes audit and gated reopen", () => {
    const html = renderFile("platform-admin/registration-application-rejected.ejs", {
      application: { ...APP, applicationStatus: "rejected", followUpStatus: "closed" },
      rejectionSummary: {
        category: "incomplete_application",
        categoryLabel: "Incomplete application",
        canReopen: true,
        rejectedAt: "2026-07-25T12:00:00.000Z",
        actorUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        deliveryKey: "recorded",
        deliveryLabel: "Rejection recorded",
        applicantMessage: "We could not approve this application with the information provided.",
        internalNote: "Missing documents after two follow-ups.",
      },
      duplicateWarning: { show: false },
    });
    assert.match(html, /data-bb-pa-reg-rejected="1"/);
    assert.match(html, /data-bb-pa-reg-rejected-audit="1"/);
    assert.match(html, /data-bb-pa-reg-rejected-no-approve="1"/);
    assert.match(html, /data-bb-pa-reg-rejected-reopen="1"/);
    assert.match(html, /data-bb-pa-reg-rejected-return="1"/);
    assert.doesNotMatch(html, /data-bb-pa-phase5-decision="approve"/);
  });

  it("CSS includes processing and approved completion styles; shell bumped", () => {
    const css = fs.readFileSync(CSS, "utf8");
    assert.match(css, /\.bb-pa-reg-approve-processing__bar-fill\b/);
    assert.match(css, /\.bb-pa-reg-approved__icon\b/);
    assert.match(css, /\.bb-pa-reg-request-info__channels\b/);
    assert.match(css, /@media \(max-width: 390px\)/);
    const shell = fs.readFileSync(SHELL, "utf8");
    assert.match(shell, /platform-admin\.css\?v=56/);
  });
});
