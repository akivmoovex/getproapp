"use strict";

/**
 * Phase2 Prompt 066 — load communication history into registration detail (no Postgres).
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");

const repo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const {
  loadRegistrationCommunicationsForDetail,
  getRegistrationApplicationDetail,
  STATUS,
} = require("../src/blessboard/services/registrationApplicationsAdminService");

const NOW = "2026-07-23T18:00:00.000Z";
const APP_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const ADMIN_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function sampleCommunications() {
  return [
    {
      id: "comm-new",
      applicationId: APP_ID,
      communicationType: "information_request",
      channel: "email",
      direction: "outbound",
      recipient: "pat@example.com",
      subject: "Need documents",
      applicantMessage: "Please upload your certificate.",
      internalNote: "Waiting on docs",
      requestCategory: "upload_registration_document",
      requestedFields: [],
      requestedDocuments: ["registration certificate"],
      responseDueAt: "2026-07-30T12:00:00.000Z",
      deliveryStatus: "sending_unavailable",
      deliveryErrorCode: "email_sending_unavailable",
      createdByUserId: ADMIN_ID,
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
      id: "comm-old",
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
      createdByUserId: ADMIN_ID,
      createdAt: "2026-07-20T08:00:00.000Z",
      labels: {
        communicationType: "Internal note",
        channel: "Internal",
        direction: "Internal",
        deliveryStatus: "Not applicable",
        requestCategory: null,
      },
    },
    {
      id: "comm-mid",
      applicationId: APP_ID,
      communicationType: "applicant_message",
      channel: "email",
      direction: "outbound",
      recipient: "pat@example.com",
      subject: "Follow-up",
      applicantMessage: "Thanks for applying.",
      internalNote: null,
      requestCategory: null,
      requestedFields: [],
      requestedDocuments: [],
      responseDueAt: null,
      deliveryStatus: "failed",
      deliveryErrorCode: "email_send_failed",
      createdByUserId: ADMIN_ID,
      createdAt: "2026-07-21T10:00:00.000Z",
      labels: {
        communicationType: "Applicant message",
        channel: "Email",
        direction: "Outbound",
        deliveryStatus: "Failed",
        requestCategory: null,
      },
    },
    {
      id: "comm-reject",
      applicationId: APP_ID,
      communicationType: "rejection_notice",
      channel: "email",
      direction: "outbound",
      recipient: "pat@example.com",
      subject: "Application update",
      applicantMessage: "We cannot approve at this time.",
      internalNote: "Duplicate church",
      requestCategory: null,
      requestedFields: [],
      requestedDocuments: [],
      responseDueAt: null,
      deliveryStatus: "recorded",
      deliveryErrorCode: null,
      createdByUserId: ADMIN_ID,
      createdAt: "2026-07-19T09:00:00.000Z",
      labels: {
        communicationType: "Rejection notice",
        channel: "Email",
        direction: "Outbound",
        deliveryStatus: "Recorded",
        requestCategory: null,
      },
    },
  ];
}

function fakeDbRow() {
  return {
    id: APP_ID,
    church_name: "Grace Test Church",
    contact_name: "Pat Applicant",
    contact_email: "pat@example.com",
    contact_phone: "+260971000001",
    contact_phone_normalized: "+260971000001",
    country: "Zambia",
    city: "Lusaka",
    selected_plan: "foundation",
    application_status: "submitted",
    provisioning_status: "not_started",
    follow_up_status: "contact_pending",
    support_requested: false,
    risk_decision: "allow",
    risk_reason_codes: [],
    risk_decided_at: "2026-07-01T10:00:00.000Z",
    organization_id: null,
    organization_key: null,
    role_in_church: "Pastor",
    branch_name: null,
    branch_count: null,
    registration_message: null,
    consent_terms: true,
    review_notes: "",
    review_events: [],
    provisioning_started_at: null,
    provisioned_at: null,
    provisioning_failed_at: null,
    provisioning_error_code: null,
    provisioning_error_detail: null,
    onboarding_status: null,
    first_contacted_at: null,
    next_follow_up_at: null,
    last_contacted_at: null,
    onboarding_completed_at: null,
    last_activity_at: null,
    organization_created_at: null,
    assigned_support_user_id: null,
    created_at: "2026-07-01T09:00:00.000Z",
    updated_at: "2026-07-01T09:00:00.000Z",
  };
}

describe("loadRegistrationCommunicationsForDetail (no Postgres)", () => {
  it("returns items newest first with summary counts", async () => {
    let historyCalls = 0;
    const result = await loadRegistrationCommunicationsForDetail(
      { query: async () => ({ rows: [] }) },
      APP_ID,
      {
        getCommunicationHistory: async (applicationId, options, deps) => {
          historyCalls += 1;
          assert.equal(applicationId, APP_ID);
          assert.ok(deps && deps.client);
          return { communications: sampleCommunications() };
        },
      }
    );

    assert.equal(historyCalls, 1);
    assert.equal(result.unavailable, false);
    assert.equal(result.items.length, 4);
    assert.equal(result.items[0].id, "comm-new");
    assert.equal(result.items[1].id, "comm-mid");
    assert.equal(result.items[2].id, "comm-old");
    assert.equal(result.items[3].id, "comm-reject");
    assert.equal(result.summary.total, 4);
    assert.equal(result.summary.internalNotes, 1);
    assert.equal(result.summary.informationRequests, 1);
    assert.equal(result.summary.applicantMessages, 1);
    assert.equal(result.summary.rejectionNotices, 1);
    assert.equal(result.summary.sendingUnavailable, 1);
    assert.equal(result.summary.failed, 1);
    assert.equal(result.summary.latestCommunicationAt, "2026-07-22T12:00:00.000Z");
  });

  it("returns a safe empty array when history is empty", async () => {
    const result = await loadRegistrationCommunicationsForDetail(
      { query: async () => ({ rows: [] }) },
      APP_ID,
      {
        getCommunicationHistory: async () => ({ communications: [] }),
      }
    );
    assert.deepEqual(result.items, []);
    assert.equal(result.unavailable, false);
    assert.equal(result.summary.total, 0);
    assert.equal(result.summary.latestCommunicationAt, null);
    assert.equal(result.summary.internalNotes, 0);
    assert.equal(result.summary.informationRequests, 0);
    assert.equal(result.summary.applicantMessages, 0);
    assert.equal(result.summary.rejectionNotices, 0);
    assert.equal(result.summary.sendingUnavailable, 0);
    assert.equal(result.summary.failed, 0);
  });

  it("uses safe unavailable fallback when history load throws", async () => {
    const logs = [];
    const result = await loadRegistrationCommunicationsForDetail(
      { query: async () => ({ rows: [] }) },
      APP_ID,
      {
        getCommunicationHistory: async () => {
          throw new Error("relation does not exist DETAIL: secret");
        },
        logCommunicationsError: (...args) => {
          logs.push(args.join(" "));
        },
      }
    );
    assert.equal(result.unavailable, true);
    assert.deepEqual(result.items, []);
    assert.equal(result.summary.total, 0);
    assert.equal(result.summary.latestCommunicationAt, null);
    assert.ok(logs.some((line) => /communication history load failed/i.test(line)));
    assert.doesNotMatch(JSON.stringify(result), /relation does not exist|DETAIL: secret/);
  });

  it("treats missing communications array as empty", async () => {
    const result = await loadRegistrationCommunicationsForDetail(
      { query: async () => ({ rows: [] }) },
      APP_ID,
      {
        getCommunicationHistory: async () => ({}),
      }
    );
    assert.deepEqual(result.items, []);
    assert.equal(result.unavailable, false);
    assert.equal(result.summary.total, 0);
  });

  it("does not expose administrator email or display name on items", async () => {
    const result = await loadRegistrationCommunicationsForDetail(
      { query: async () => ({ rows: [] }) },
      APP_ID,
      {
        getCommunicationHistory: async () => ({
          communications: [
            {
              ...sampleCommunications()[0],
              createdByEmail: "ops@example.com",
              createdByDisplayName: "Ops Admin",
              created_by_email: "ops@example.com",
              adminEmail: "ops@example.com",
            },
          ],
        }),
      }
    );
    const item = result.items[0];
    assert.equal(item.createdByUserId, ADMIN_ID);
    assert.equal(Object.prototype.hasOwnProperty.call(item, "createdByEmail"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(item, "createdByDisplayName"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(item, "created_by_email"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(item, "adminEmail"), false);
    assert.doesNotMatch(JSON.stringify(item), /ops@example\.com|Ops Admin/);
  });

  it("ignores client-shaped communications on options", async () => {
    const forged = {
      items: [{ id: "forged", communicationType: "rejection_notice" }],
      summary: { total: 99, informationRequests: 99 },
      unavailable: false,
    };
    const result = await loadRegistrationCommunicationsForDetail(
      { query: async () => ({ rows: [] }) },
      APP_ID,
      {
        communications: forged,
        getCommunicationHistory: async () => ({ communications: [] }),
      }
    );
    assert.deepEqual(result.items, []);
    assert.equal(result.summary.total, 0);
    assert.notEqual(result.summary.informationRequests, 99);
  });

  it("calls getCommunicationHistory only once", async () => {
    let historyCalls = 0;
    await loadRegistrationCommunicationsForDetail(
      { query: async () => ({ rows: [] }) },
      APP_ID,
      {
        getCommunicationHistory: async () => {
          historyCalls += 1;
          return { communications: sampleCommunications() };
        },
      }
    );
    assert.equal(historyCalls, 1);
  });
});

describe("getRegistrationApplicationDetail communications wiring (stubbed repo)", () => {
  let originalGetById;
  let originalListAdmins;

  before(() => {
    originalGetById = repo.getRegistrationApplicationById;
    originalListAdmins = repo.listActivePlatformAdministrators;
  });

  after(() => {
    repo.getRegistrationApplicationById = originalGetById;
    repo.listActivePlatformAdministrators = originalListAdmins;
  });

  it("includes communications once and preserves existing detail properties", async () => {
    repo.getRegistrationApplicationById = async () => fakeDbRow();
    repo.listActivePlatformAdministrators = async () => [];

    let writeCount = 0;
    let historyCalls = 0;
    const communications = sampleCommunications();

    const detail = await getRegistrationApplicationDetail(
      {
        query: async (sql) => {
          if (/\b(INSERT|UPDATE|DELETE|ALTER)\b/i.test(String(sql || ""))) {
            writeCount += 1;
          }
          return { rows: [] };
        },
      },
      APP_ID,
      {},
      {
        getCommunicationHistory: async (applicationId) => {
          historyCalls += 1;
          assert.equal(applicationId, APP_ID);
          return { communications };
        },
        getPhoneVerificationHistory: async () => [],
        getRegistrationEmailVerificationStatus: async () => ({
          status: "not_sent",
          token: null,
        }),
        buildRegistrationVerificationFacts: async () => ({
          facts: [],
          summary: { passed: 0, warning: 0, failed: 0, unsupported: 0 },
          checkedAt: NOW,
        }),
      }
    );

    assert.equal(detail.ok, true);
    assert.equal(detail.status, STATUS.OK);
    assert.equal(historyCalls, 1);
    assert.equal(writeCount, 0);
    assert.ok(detail.application);
    assert.equal(detail.application.id, APP_ID);
    assert.equal(detail.application.applicationStatus, "submitted");
    assert.ok(detail.verification);
    assert.ok(detail.reviewRecommendation);
    assert.ok(detail.approvalChecklist);
    assert.ok(detail.phoneVerification);
    assert.ok(detail.emailVerification);
    assert.ok(detail.communications);
    assert.equal(detail.communications.unavailable, false);
    assert.equal(detail.communications.items[0].id, "comm-new");
    assert.equal(detail.communications.summary.total, 4);
    assert.equal(detail.communications.summary.informationRequests, 1);
    assert.ok(Array.isArray(detail.contacts));
    assert.ok(Array.isArray(detail.auditEvents));
    assert.ok(Array.isArray(detail.platformAdmins));
    assert.ok(detail.followUpStatuses);
    assert.ok(detail.contactMethods);
    assert.ok(detail.contactOutcomes);
  });

  it("uses unavailable communications fallback without failing the detail", async () => {
    repo.getRegistrationApplicationById = async () => fakeDbRow();
    repo.listActivePlatformAdministrators = async () => [];

    const detail = await getRegistrationApplicationDetail(
      { query: async () => ({ rows: [] }) },
      APP_ID,
      {},
      {
        getCommunicationHistory: async () => {
          throw new Error("connection refused password=secret");
        },
        getPhoneVerificationHistory: async () => [],
        getRegistrationEmailVerificationStatus: async () => ({
          status: "not_sent",
          token: null,
        }),
        buildRegistrationVerificationFacts: async () => ({
          facts: [],
          summary: { passed: 0, warning: 0, failed: 0, unsupported: 0 },
          checkedAt: NOW,
        }),
        logCommunicationsError: () => {},
      }
    );

    assert.equal(detail.ok, true);
    assert.equal(detail.communications.unavailable, true);
    assert.deepEqual(detail.communications.items, []);
    assert.equal(detail.communications.summary.total, 0);
    assert.doesNotMatch(JSON.stringify(detail.communications), /password=secret/);
    assert.equal(detail.application.applicationStatus, "submitted");
  });
});
