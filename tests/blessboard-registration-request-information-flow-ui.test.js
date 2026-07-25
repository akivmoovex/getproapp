"use strict";

/**
 * Phase 5 — request information / needs information UI (markup; no Postgres).
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");
const ejs = require("ejs");

const registrationQueue = require("../src/blessboard/services/registrationQueuePresentation");
const registrationStatus = require("../src/blessboard/services/registrationStatusPresentation");

const REQUEST_VIEW = path.join(
  __dirname,
  "../views/blessboard/v5/platform-admin/registration-application-request-information.ejs"
);
const RESULT_VIEW = path.join(
  __dirname,
  "../views/blessboard/v5/platform-admin/registration-application-information-requested.ejs"
);
const DETAIL_VIEW = path.join(
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

function baseApp(overrides = {}) {
  return {
    id: APP_ID,
    churchName: "Grace Test Church",
    contactName: "Pat Applicant",
    contactEmail: "pat@example.com",
    contactPhone: "+260971000001",
    contactPhoneNormalized: "+260971000001",
    selectedPlan: "foundation",
    selectedPlanLabel: "Foundation",
    applicationStatus: "submitted",
    provisioningStatus: "not_started",
    followUpStatus: "awaiting_customer",
    riskReviewActionsAvailable: true,
    rejectActionsAvailable: true,
    networkApproveAvailable: false,
    reviewEvents: [
      {
        at: "2026-07-24T10:00:00.000Z",
        action: "information_requested",
        actor_user_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        to_status: "awaiting_customer",
      },
    ],
    ...overrides,
  };
}

function render(view, locals) {
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

describe("Phase 5 request-information presentation helpers", () => {
  it("keeps Needs Information mapping for awaiting_customer / needs_help / self_onboarding", () => {
    for (const follow of ["awaiting_customer", "needs_help", "self_onboarding"]) {
      const status = registrationQueue.presentPhase5QueueStatus({
        application_status: "submitted",
        provisioning_status: "not_started",
        follow_up_status: follow,
      });
      assert.equal(status.key, "needs_information");
      assert.equal(status.label, "Needs Information");
    }
  });

  it("words delivery honestly and never invents email success", () => {
    assert.equal(
      registrationQueue.presentPhase5InformationDelivery("sending_unavailable").label,
      "Delivery status unavailable"
    );
    assert.equal(
      registrationQueue.presentPhase5InformationDelivery("recorded").label,
      "Information request recorded"
    );
    assert.equal(
      registrationQueue.presentPhase5InformationDelivery("sent", { channel: "email" }).label,
      "Email sent"
    );
    assert.equal(
      registrationQueue.presentPhase5InformationDelivery("failed").label,
      "Delivery failed"
    );
    assert.equal(
      registrationQueue.presentPhase5InformationDelivery(null).label,
      "Delivery status unavailable"
    );
  });

  it("waiting state hides applicant response without stored inbound evidence", () => {
    const waiting = registrationQueue.presentPhase5NeedsInformationState(
      {
        items: [
          {
            communicationType: "information_request",
            createdAt: "2026-07-24T10:00:00.000Z",
            requestCategory: "confirm_location",
            applicantMessage: "Please confirm location <b>x</b>",
            deliveryStatus: "sending_unavailable",
            recipient: "pat@example.com",
            channel: "email",
          },
        ],
      },
      baseApp()
    );
    assert.equal(waiting.waiting, true);
    assert.equal(waiting.hasApplicantResponse, false);
    assert.equal(waiting.reminderSupported, false);
    assert.match(waiting.messageSummary, /Please confirm location/);
  });

  it("shows response only for stored applicant_response or inbound applicant_message", () => {
    const withResponse = registrationQueue.presentPhase5NeedsInformationState(
      {
        items: [
          {
            communicationType: "applicant_response",
            direction: "inbound",
            createdAt: "2026-07-25T10:00:00.000Z",
            applicantMessage: "Here is the address",
          },
          {
            communicationType: "information_request",
            createdAt: "2026-07-24T10:00:00.000Z",
            requestCategory: "confirm_location",
            deliveryStatus: "recorded",
          },
        ],
      },
      baseApp()
    );
    assert.equal(withResponse.hasApplicantResponse, true);
    assert.equal(withResponse.waiting, false);
  });
});

describe("Phase 5 request-information UI (no Postgres)", () => {
  it("loads request page with contact data and Record Information Request action", () => {
    const html = render(REQUEST_VIEW, {
      application: baseApp({ followUpStatus: "contact_pending" }),
      infoRequestReasons: registrationQueue.PHASE5_INFO_REQUEST_REASONS,
      duplicateWarning: { show: false },
    });
    assert.match(html, /data-bb-pa-reg-request-info="1"/);
    assert.match(html, /data-bb-pa-reg-request-church="1"[^>]*>Grace Test Church</);
    assert.match(html, /data-bb-pa-reg-request-contact-name="1"/);
    assert.match(html, /data-bb-pa-reg-request-phone="1"/);
    assert.match(html, /data-bb-pa-reg-request-email="1"/);
    assert.match(html, /Record information request/i);
    assert.doesNotMatch(html, /Send request|paper-plane|email sent successfully/i);
    assert.match(
      html,
      /action="\/admin\/registration-applications\/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee\/request-information"/
    );
    assert.match(html, /name="_csrf" value="test-csrf"/);
    assert.match(html, /data-bb-pa-reg-request-cancel="1"/);
    assert.match(html, /data-bb-pa-reg-request-reason="correct_phone"/);
    assert.match(html, /data-bb-pa-reg-request-message="1"/);
  });

  it("escapes applicant-facing and administrator text on result screen", () => {
    const needs = registrationQueue.presentPhase5NeedsInformationState(
      {
        items: [
          {
            communicationType: "information_request",
            createdAt: "2026-07-24T10:00:00.000Z",
            requestCategory: "other",
            applicantMessage: 'Please clarify <script>alert(1)</script> & "x"',
            deliveryStatus: "recorded",
            recipient: "pat@example.com",
            channel: "email",
          },
        ],
      },
      baseApp()
    );
    const html = render(RESULT_VIEW, {
      application: baseApp(),
      needsInformationState: needs,
      deliverySummary: needs.delivery,
    });
    assert.match(html, /data-bb-pa-reg-info-requested="1"/);
    assert.match(html, /Information request recorded/);
    assert.match(html, /Please clarify &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
    assert.doesNotMatch(html, /Request Sent Successfully|Send Another Message/i);
    assert.match(html, /data-bb-pa-reg-info-another="1"[^>]*>Record another request</);
    assert.match(html, /data-bb-pa-reg-info-no-false-sent="1"/);
  });

  it("needs-information focused hub shows waiting state without Review New Information", () => {
    const html = render(DETAIL_VIEW, {
      application: baseApp(),
      communications: {
        items: [
          {
            communicationType: "information_request",
            createdAt: "2026-07-24T10:00:00.000Z",
            requestCategory: "confirm_location",
            applicantMessage: "Need location",
            deliveryStatus: "sending_unavailable",
            requestedFields: ["confirm_location"],
          },
        ],
        summary: {},
        unavailable: false,
      },
      contacts: [],
      auditEvents: [],
      platformAdmins: [],
      followUpStatuses: ["awaiting_customer"],
      contactMethods: [],
      contactOutcomes: [],
      duplicateWarning: { show: false },
      intent: "",
    });
    assert.match(html, /data-bb-pa-reg-needs-info="1"/);
    assert.match(html, /data-bb-pa-reg-needs-waiting="1"/);
    assert.match(html, /Waiting for information/);
    assert.doesNotMatch(html, /data-bb-pa-reg-needs-review-new="1"/);
    assert.match(html, /data-bb-pa-reg-needs-follow-up-action="1"[^>]*>Record follow-up</);
    assert.match(html, /data-bb-pa-reg-needs-no-reminder="1"/);
    assert.doesNotMatch(html, />Send reminder</i);
    assert.match(html, /href="\/admin\/registration-applications\/[^"]+\/request-information"/);
    assert.match(html, /data-bb-pa-phase5-decision="request-information"/);
  });

  it("includes mobile responsive hooks", () => {
    const css = fs.readFileSync(CSS, "utf8");
    assert.match(css, /\.bb-pa-reg-request-info\b/);
    assert.match(css, /\.bb-pa-reg-needs-info\b/);
    assert.match(css, /@media \(max-width: 719px\)[\s\S]*bb-pa-reg-request-info__actions/);
    const shell = fs.readFileSync(SHELL, "utf8");
    assert.match(shell, /platform-admin\.css\?v=56/);
  });
});
