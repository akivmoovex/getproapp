"use strict";

/**
 * Phase2 Prompt 067 — Communication Log history UI on registration detail (no Postgres).
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

function sampleCommunications(overrides = {}) {
  return {
    unavailable: false,
    summary: {
      total: 2,
      internalNotes: 1,
      informationRequests: 1,
      applicantMessages: 0,
      rejectionNotices: 0,
      sendingUnavailable: 1,
      failed: 0,
      latestCommunicationAt: "2026-07-22T12:00:00.000Z",
    },
    items: [
      {
        id: "comm-1",
        applicationId: APP_ID,
        communicationType: "information_request",
        channel: "email",
        direction: "outbound",
        recipient: "pat@example.com",
        subject: "Need documents",
        applicantMessage: "Please upload your <certificate>.",
        internalNote: "Internal: wait on docs & follow up",
        requestCategory: "upload_registration_document",
        requestedFields: ["church name", "city"],
        requestedDocuments: ["registration certificate"],
        responseDueAt: "2026-07-30T12:00:00.000Z",
        deliveryStatus: "sending_unavailable",
        deliveryErrorCode: "email_sending_unavailable",
        createdByUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        createdAt: "2026-07-22T12:00:00.000Z",
        labels: {
          communicationType: "Information request",
          channel: "Email",
          direction: "Outbound",
          deliveryStatus: "Sending unavailable",
          requestCategory: "Upload registration document",
        },
      },
      {
        id: "comm-2",
        applicationId: APP_ID,
        communicationType: "internal_note",
        channel: "internal",
        direction: "internal",
        recipient: null,
        subject: null,
        applicantMessage: null,
        internalNote: "Called applicant",
        requestCategory: null,
        requestedFields: [],
        requestedDocuments: [],
        responseDueAt: null,
        deliveryStatus: "not_applicable",
        deliveryErrorCode: null,
        createdByUserId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        createdAt: "2026-07-20T08:00:00.000Z",
        labels: {
          communicationType: "Internal note",
          channel: "Internal",
          direction: "Internal",
          deliveryStatus: "Not applicable",
          requestCategory: null,
        },
      },
    ],
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
      communications: sampleCommunications(),
      ...locals,
    },
    {
      filename: VIEW,
      root: PARTIALS,
      views: [PARTIALS],
    }
  );
}

function historyBlock(html) {
  const match = html.match(
    /data-bb-pa-reg-communications-history="1"[\s\S]*?(?=data-bb-pa-reg-communications-compose|id="reg-activity")/
  );
  assert.ok(match, "expected communications history block");
  return match[0];
}

describe("registration communication history UI (Prompt 067, no Postgres)", () => {
  it("renders summary counts inside #reg-communications", () => {
    const html = renderDetail();
    assert.match(html, /id="reg-communications"/);
    assert.match(html, /data-bb-pa-reg-communications-history="1"/);
    assert.match(html, /data-bb-pa-reg-communications-summary="1"/);
    assert.match(html, /data-bb-pa-reg-communications-summary-total="1">2</);
    assert.match(
      html,
      /data-bb-pa-reg-communications-summary-information-requests="1">1</
    );
    assert.match(html, /data-bb-pa-reg-communications-summary-internal-notes="1">1</);
    assert.match(
      html,
      /data-bb-pa-reg-communications-summary-applicant-messages="1">0</
    );
    assert.match(
      html,
      /data-bb-pa-reg-communications-summary-rejection-notices="1">0</
    );
    assert.match(
      html,
      /data-bb-pa-reg-communications-summary-sending-unavailable="1">1</
    );
    assert.match(html, /data-bb-pa-reg-communications-summary-failed="1">0</);
    assert.match(html, /data-bb-pa-reg-communications-summary-latest="1">/);
    assert.match(html, /Total communications/);
    assert.match(html, /Latest activity/);
  });

  it("renders communication cards with required fields and separate message blocks", () => {
    const html = renderDetail();
    const history = historyBlock(html);
    assert.match(history, /data-bb-pa-reg-communications-card="1"/);
    assert.match(history, /data-bb-pa-reg-communications-card-type="information_request"/);
    assert.match(history, /data-bb-pa-reg-communications-card-channel="1">[\s\S]*Email/);
    assert.match(history, /data-bb-pa-reg-communications-card-direction="1">[\s\S]*Outbound/);
    assert.match(
      history,
      /data-bb-pa-reg-communications-card-delivery="sending_unavailable"/
    );
    assert.match(
      history,
      /data-bb-pa-reg-communications-card-delivery-label="1">Sending unavailable</
    );
    assert.match(history, /data-bb-pa-reg-communications-card-recipient="1">pat@example\.com</);
    assert.match(history, /data-bb-pa-reg-communications-card-subject="1">Need documents</);
    assert.match(history, /data-bb-pa-reg-communications-card-category="1">Upload registration document</);
    assert.match(history, /data-bb-pa-reg-communications-card-fields="1">church name, city</);
    assert.match(
      history,
      /data-bb-pa-reg-communications-card-documents="1">registration certificate</
    );
    assert.match(history, /data-bb-pa-reg-communications-card-deadline="1">/);
    assert.match(history, /data-bb-pa-reg-communications-card-created="1">/);
    assert.match(history, /data-bb-pa-reg-communications-card-applicant="1"/);
    assert.match(history, /data-bb-pa-reg-communications-card-internal="1"/);
    assert.match(history, /Applicant-facing message/);
    assert.match(history, /Internal note/);
  });

  it("never displays Sent unless delivery status is sent", () => {
    const unavailableHtml = renderDetail();
    const unavailableCard = unavailableHtml.match(
      /data-bb-pa-reg-communications-card-delivery="sending_unavailable"[\s\S]*?<\/article>/
    );
    assert.ok(unavailableCard);
    assert.match(
      unavailableCard[0],
      /data-bb-pa-reg-communications-card-delivery-label="1">Sending unavailable</
    );
    assert.doesNotMatch(unavailableCard[0], />Sent</);

    const sentHtml = renderDetail({
      communications: sampleCommunications({
        summary: {
          total: 1,
          internalNotes: 0,
          informationRequests: 1,
          applicantMessages: 0,
          rejectionNotices: 0,
          sendingUnavailable: 0,
          failed: 0,
          latestCommunicationAt: "2026-07-22T12:00:00.000Z",
        },
        items: [
          {
            ...sampleCommunications().items[0],
            deliveryStatus: "sent",
            labels: {
              ...sampleCommunications().items[0].labels,
              deliveryStatus: "Sent",
            },
          },
        ],
      }),
    });
    const sentCard = sentHtml.match(
      /data-bb-pa-reg-communications-card-delivery="sent"[\s\S]*?<\/article>/
    );
    assert.ok(sentCard);
    assert.match(
      sentCard[0],
      /data-bb-pa-reg-communications-card-delivery-label="1">Sent</
    );

    const forgedLabel = renderDetail({
      communications: sampleCommunications({
        items: [
          {
            ...sampleCommunications().items[0],
            deliveryStatus: "queued",
            labels: {
              ...sampleCommunications().items[0].labels,
              deliveryStatus: "Sent",
            },
          },
        ],
      }),
    });
    const forgedCard = forgedLabel.match(
      /data-bb-pa-reg-communications-card-delivery="queued"[\s\S]*?<\/article>/
    );
    assert.ok(forgedCard);
    assert.match(
      forgedCard[0],
      /data-bb-pa-reg-communications-card-delivery-label="1">Queued</
    );
    assert.doesNotMatch(forgedCard[0], />Sent</);
  });

  it("shows empty and unavailable states", () => {
    const empty = renderDetail({
      communications: {
        unavailable: false,
        items: [],
        summary: {
          total: 0,
          internalNotes: 0,
          informationRequests: 0,
          applicantMessages: 0,
          rejectionNotices: 0,
          sendingUnavailable: 0,
          failed: 0,
          latestCommunicationAt: null,
        },
      },
    });
    assert.match(empty, /data-bb-pa-reg-communications-empty="1"/);
    assert.match(empty, /No communication has been recorded/);
    assert.doesNotMatch(empty, /data-bb-pa-reg-communications-card="1"/);

    const unavailable = renderDetail({
      communications: {
        unavailable: true,
        items: [],
        summary: {
          total: 0,
          internalNotes: 0,
          informationRequests: 0,
          applicantMessages: 0,
          rejectionNotices: 0,
          sendingUnavailable: 0,
          failed: 0,
          latestCommunicationAt: null,
        },
      },
    });
    assert.match(unavailable, /data-bb-pa-reg-communications-unavailable="1"/);
    assert.match(
      unavailable,
      /data-bb-pa-reg-communications-unavailable-banner="1"/
    );
    assert.match(unavailable, /Communication history is temporarily unavailable/);
    assert.doesNotMatch(unavailable, /data-bb-pa-reg-communications-summary="1"/);
  });

  it("escapes dynamic content and omits edit/delete actions", () => {
    const html = renderDetail({
      communications: sampleCommunications({
        items: [
          {
            ...sampleCommunications().items[0],
            subject: '<script>alert(1)</script>',
            applicantMessage: 'Hello <b>world</b> & friends',
            internalNote: 'Note <img src=x onerror=alert(1)>',
          },
        ],
      }),
    });
    const history = historyBlock(html);
    assert.match(history, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(history, /Hello &lt;b&gt;world&lt;\/b&gt; &amp; friends/);
    assert.match(history, /Note &lt;img src=x onerror=alert\(1\)&gt;/);
    assert.doesNotMatch(history, /<script>alert\(1\)<\/script>/);
    assert.doesNotMatch(history, /edit|delete|remove communication/i);
    assert.doesNotMatch(history, /action="[^"]*\/(edit|delete)/i);
  });

  it("uses card layout CSS rather than a wide table", () => {
    const html = renderDetail();
    const history = historyBlock(html);
    assert.doesNotMatch(history, /<table\b/i);
    assert.match(history, /bb-pa-reg-communications-card/);
    const css = fs.readFileSync(CSS, "utf8");
    assert.match(css, /\.bb-pa-reg-communications__list\s*\{/);
    assert.match(css, /\.bb-pa-reg-communications-card\s*\{/);
    const shell = fs.readFileSync(SHELL, "utf8");
    assert.match(shell, /platform-admin\.css\?v=57/);
  });

  it("links secondary compose to Phase 5 request-information", () => {
    const html = renderDetail();
    assert.match(html, /data-bb-pa-reg-communications-compose="1"/);
    assert.match(html, /data-bb-pa-reg-communications-open-request="1"/);
    assert.match(
      html,
      /href="\/admin\/registration-applications\/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee\/request-information"/
    );
    assert.doesNotMatch(html, /data-bb-pa-reg-communications-form="1"/);
  });

  it("wires communications into the detail route locals", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/platform/http/platformAdminRoutes.js"),
      "utf8"
    );
    assert.match(src, /communications:\s*detail\.communications/);
  });
});
