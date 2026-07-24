"use strict";

/**
 * Phase2 Prompt 068 — rejection service upgrade (stubbed unit tests; no Postgres required).
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");

const repo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const {
  rejectRegistrationApplication,
  REJECTION_CATEGORIES,
  STATUS,
} = require("../src/blessboard/services/registrationApplicationsAdminService");
const {
  recordRejectionNotice,
} = require("../src/blessboard/services/registrationApplicationCommunicationService");

const APP_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const ADMIN_ID = "11111111-2222-4333-8444-555555555555";

function baseApp(overrides = {}) {
  return {
    id: APP_ID,
    contact_email: "pat@example.com",
    application_status: "submitted",
    provisioning_status: "not_started",
    organization_id: null,
    risk_reason_codes: [],
    ...overrides,
  };
}

function makeTxClient() {
  const calls = [];
  return {
    calls,
    query: async (sql) => {
      const text = String(sql || "").trim().toUpperCase();
      calls.push(text.split(/\s+/)[0]);
      return { rows: [] };
    },
  };
}

describe("recordRejectionNotice (Prompt 068 unit)", () => {
  it("records without claiming send when notifyApplicant is false", async () => {
    const creates = [];
    const result = await recordRejectionNotice(
      {
        applicationId: APP_ID,
        recipient: "pat@example.com",
        applicantMessage: "We cannot approve this application.",
        internalNote: "Duplicate church",
        notifyApplicant: false,
      },
      { platformAdminUserId: ADMIN_ID },
      {
        client: { query: async () => ({ rows: [] }) },
        repository: {
          createRegistrationApplicationCommunication: async (_c, fields) => {
            creates.push(fields);
            return {
              id: "comm-1",
              application_id: APP_ID,
              communication_type: fields.communicationType,
              channel: fields.channel,
              direction: fields.direction,
              recipient: fields.recipient,
              subject: fields.subject,
              applicant_message: fields.applicantMessage,
              internal_note: fields.internalNote,
              request_category: null,
              requested_fields: [],
              requested_documents: [],
              response_due_at: null,
              delivery_status: fields.deliveryStatus,
              delivery_error_code: fields.deliveryErrorCode || null,
              created_by_user_id: ADMIN_ID,
              created_at: "2026-07-24T12:00:00.000Z",
            };
          },
        },
        emailAdapter: {
          sendingAvailable: true,
          send: async () => {
            throw new Error("adapter must not be called");
          },
        },
      }
    );
    assert.equal(result.recorded, true);
    assert.equal(result.delivery.status, "recorded");
    assert.equal(result.delivery.attempted, false);
    assert.equal(creates[0].communicationType, "rejection_notice");
    assert.equal(creates[0].applicantMessage, "We cannot approve this application.");
    assert.equal(creates[0].internalNote, "Duplicate church");
    assert.equal(creates[0].deliveryStatus, "recorded");
  });

  it("uses safe adapter and records sending_unavailable when notifyApplicant is true", async () => {
    const creates = [];
    let sendCalls = 0;
    const result = await recordRejectionNotice(
      {
        applicationId: APP_ID,
        recipient: "pat@example.com",
        applicantMessage: "Applicant-facing explanation",
        notifyApplicant: true,
      },
      { platformAdminUserId: ADMIN_ID },
      {
        client: { query: async () => ({ rows: [] }) },
        repository: {
          createRegistrationApplicationCommunication: async (_c, fields) => {
            creates.push(fields);
            return {
              id: "comm-2",
              application_id: APP_ID,
              communication_type: "rejection_notice",
              channel: "email",
              direction: "outbound",
              recipient: fields.recipient,
              subject: fields.subject,
              applicant_message: fields.applicantMessage,
              internal_note: null,
              request_category: null,
              requested_fields: [],
              requested_documents: [],
              response_due_at: null,
              delivery_status: fields.deliveryStatus,
              delivery_error_code: null,
              created_by_user_id: ADMIN_ID,
              created_at: "2026-07-24T12:00:00.000Z",
            };
          },
        },
        emailAdapter: {
          sendingAvailable: false,
          send: async () => {
            sendCalls += 1;
            return {
              accepted_for_processing: false,
              code: "email_sending_unavailable",
            };
          },
        },
      }
    );
    assert.equal(sendCalls, 1);
    assert.equal(result.delivery.status, "sending_unavailable");
    assert.equal(creates[0].deliveryStatus, "sending_unavailable");
    assert.doesNotMatch(JSON.stringify(result), /was sent successfully/i);
  });
});

describe("rejectRegistrationApplication upgrade (Prompt 068 unit)", () => {
  let originalLock;
  let originalRisk;
  let originalMeta;

  before(() => {
    originalLock = repo.lockApplicationById;
    originalRisk = repo.updateApplicationRiskReviewState;
    originalMeta = repo.updateRegistrationRejectionMetadata;
  });

  after(() => {
    repo.lockApplicationById = originalLock;
    repo.updateApplicationRiskReviewState = originalRisk;
    repo.updateRegistrationRejectionMetadata = originalMeta;
  });

  it("keeps legacy reason path and rejects without notice", async () => {
    const client = makeTxClient();
    let riskPatch = null;
    let metaCalls = 0;
    repo.lockApplicationById = async () => baseApp();
    repo.updateApplicationRiskReviewState = async (_c, _id, patch) => {
      riskPatch = patch;
      return { id: APP_ID };
    };
    repo.updateRegistrationRejectionMetadata = async () => {
      metaCalls += 1;
      return { id: APP_ID };
    };

    const result = await rejectRegistrationApplication(client, {
      applicationId: APP_ID,
      actorUserId: ADMIN_ID,
      reason: "Unable to verify church leadership",
    });

    assert.equal(result.ok, true);
    assert.equal(result.alreadyRejected, false);
    assert.equal(riskPatch.applicationStatus, "rejected");
    assert.equal(riskPatch.rejectionReason, "Unable to verify church leadership");
    assert.equal(riskPatch.reviewEvent.action, "reject");
    assert.equal(metaCalls, 0);
    assert.deepEqual(client.calls.filter((c) => c === "BEGIN" || c === "COMMIT"), [
      "BEGIN",
      "COMMIT",
    ]);
  });

  it("stores category, reapplication, notice, and honest notification status in one transaction", async () => {
    const client = makeTxClient();
    let riskPatch = null;
    let metaPatch = null;
    let noticeCalls = 0;

    repo.lockApplicationById = async () => baseApp();
    repo.updateApplicationRiskReviewState = async (_c, _id, patch) => {
      riskPatch = patch;
      return { id: APP_ID };
    };
    repo.updateRegistrationRejectionMetadata = async (_c, _id, patch) => {
      metaPatch = patch;
      return {
        id: APP_ID,
        rejection_category: patch.rejectionCategory,
        reapplication_allowed: patch.reapplicationAllowed,
        rejection_notification_status: patch.rejectionNotificationStatus,
      };
    };

    const result = await rejectRegistrationApplication(
      client,
      {
        applicationId: APP_ID,
        platformAdminUserId: ADMIN_ID,
        rejectionCategory: "duplicate_registration",
        internalDecisionNote: "Internal: exact name match",
        applicantExplanation: "We found a duplicate registration for this church.",
        reapplicationAllowed: false,
        notifyApplicant: true,
      },
      {
        recordRejectionNotice: async (input, context, deps) => {
          noticeCalls += 1;
          assert.equal(input.notifyApplicant, true);
          assert.equal(input.applicantMessage.includes("duplicate"), true);
          assert.equal(input.internalNote, "Internal: exact name match");
          assert.equal(context.platformAdminUserId, ADMIN_ID);
          assert.equal(deps.client, client);
          return {
            recorded: true,
            communication: {
              id: "comm-reject",
              communicationType: "rejection_notice",
              applicantMessage: input.applicantMessage,
              internalNote: input.internalNote,
            },
            delivery: {
              attempted: true,
              status: "sending_unavailable",
              providerAvailable: false,
              safeErrorCode: "email_sending_unavailable",
            },
          };
        },
      }
    );

    assert.equal(result.ok, true);
    assert.equal(noticeCalls, 1);
    assert.equal(riskPatch.rejectionReason, "Internal: exact name match");
    assert.equal(riskPatch.reviewEvent.rejection_category, "duplicate_registration");
    assert.equal(riskPatch.reviewEvent.reapplication_allowed, false);
    assert.equal(riskPatch.reviewEvent.notification_status, "sending_unavailable");
    assert.equal(riskPatch.reviewEvent.applicant_explanation_len > 0, true);
    assert.equal(metaPatch.rejectionCategory, "duplicate_registration");
    assert.equal(metaPatch.reapplicationAllowed, false);
    assert.equal(metaPatch.rejectionNotificationStatus, "sending_unavailable");
    assert.equal(result.rejectionNotificationStatus, "sending_unavailable");
    assert.equal(result.delivery.status, "sending_unavailable");
    assert.deepEqual(client.calls.filter((c) => c === "BEGIN" || c === "COMMIT"), [
      "BEGIN",
      "COMMIT",
    ]);
  });

  it("keeps internal note separate from applicant explanation on the notice", async () => {
    const client = makeTxClient();
    repo.lockApplicationById = async () => baseApp();
    repo.updateApplicationRiskReviewState = async () => ({ id: APP_ID });
    repo.updateRegistrationRejectionMetadata = async () => ({ id: APP_ID });

    let captured = null;
    await rejectRegistrationApplication(
      client,
      {
        applicationId: APP_ID,
        platformAdminUserId: ADMIN_ID,
        rejectionCategory: "other",
        internalDecisionNote: "INTERNAL_ONLY_NOTE",
        applicantExplanation: "APPLICANT_FACING_TEXT",
        notifyApplicant: false,
      },
      {
        recordRejectionNotice: async (input) => {
          captured = input;
          return {
            recorded: true,
            communication: { id: "c" },
            delivery: {
              attempted: false,
              status: "recorded",
              providerAvailable: false,
              safeErrorCode: null,
            },
          };
        },
      }
    );

    assert.equal(captured.applicantMessage, "APPLICANT_FACING_TEXT");
    assert.equal(captured.internalNote, "INTERNAL_ONLY_NOTE");
    assert.notEqual(captured.applicantMessage, captured.internalNote);
  });

  it("rejects invalid categories and preserves application status", async () => {
    const client = makeTxClient();
    let locked = false;
    repo.lockApplicationById = async () => {
      locked = true;
      return baseApp();
    };

    const result = await rejectRegistrationApplication(client, {
      applicationId: APP_ID,
      platformAdminUserId: ADMIN_ID,
      reason: "Some reason text",
      rejectionCategory: "not_a_real_category",
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, STATUS.INVALID_INPUT);
    assert.equal(result.message, "invalid_rejection_category");
    assert.equal(locked, false);
    assert.equal(client.calls.length, 0);
  });

  it("rolls back when notice recording fails", async () => {
    const client = makeTxClient();
    repo.lockApplicationById = async () => baseApp();
    repo.updateApplicationRiskReviewState = async () => {
      throw new Error("should not update risk after notice failure");
    };

    const result = await rejectRegistrationApplication(
      client,
      {
        applicationId: APP_ID,
        platformAdminUserId: ADMIN_ID,
        internalDecisionNote: "Internal note here",
        applicantExplanation: "Applicant text",
        notifyApplicant: true,
      },
      {
        recordRejectionNotice: async () => {
          throw new Error("smtp password=secret boom");
        },
      }
    );

    assert.equal(result.ok, false);
    assert.equal(result.status, STATUS.LOOKUP_ERROR);
    assert.ok(client.calls.includes("BEGIN"));
    assert.ok(client.calls.includes("ROLLBACK"));
    assert.doesNotMatch(JSON.stringify(result), /password=secret/);
  });

  it("exports allowlisted rejection categories", () => {
    assert.ok(REJECTION_CATEGORIES.includes("duplicate_registration"));
    assert.ok(REJECTION_CATEGORIES.includes("applicant_withdrew"));
    assert.equal(REJECTION_CATEGORIES.length, 9);
  });
});
