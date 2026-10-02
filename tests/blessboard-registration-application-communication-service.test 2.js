"use strict";

/**
 * Phase2 Prompt 063 — registration application communication service (stubbed deps).
 */

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const {
  addInternalNote,
  recordInformationRequest,
  recordApplicantMessage,
  getCommunicationHistory,
  REQUEST_CATEGORIES,
} = require("../src/blessboard/services/registrationApplicationCommunicationService");

const APP_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const ADMIN_ID = "11111111-2222-4333-8444-555555555555";

function baseRow(overrides = {}) {
  return {
    id: "99999999-aaaa-4bbb-8ccc-dddddddddddd",
    application_id: APP_ID,
    communication_type: "internal_note",
    channel: "internal",
    direction: "internal",
    recipient: null,
    subject: null,
    applicant_message: null,
    internal_note: "Note text",
    request_category: null,
    requested_fields: [],
    requested_documents: [],
    response_due_at: null,
    delivery_status: "not_applicable",
    delivery_error_code: null,
    created_by_user_id: ADMIN_ID,
    created_at: "2026-07-24T10:00:00.000Z",
    ...overrides,
  };
}

function stubRepo(overrides = {}) {
  const calls = { create: [], list: [] };
  return {
    calls,
    repository: {
      createRegistrationApplicationCommunication: async (_client, fields) => {
        calls.create.push(fields);
        return baseRow({
          communication_type: fields.communicationType,
          channel: fields.channel,
          direction: fields.direction,
          recipient: fields.recipient || null,
          subject: fields.subject || null,
          applicant_message: fields.applicantMessage || null,
          internal_note: fields.internalNote || null,
          request_category: fields.requestCategory || null,
          requested_fields: fields.requestedFields || [],
          requested_documents: fields.requestedDocuments || [],
          response_due_at: fields.responseDueAt || null,
          delivery_status: fields.deliveryStatus,
          delivery_error_code: fields.deliveryErrorCode || null,
          ...(overrides.createReturn || {}),
        });
      },
      listRegistrationApplicationCommunications: async (_client, applicationId, opts) => {
        calls.list.push({ applicationId, opts });
        if (typeof overrides.list === "function") return overrides.list(applicationId, opts);
        return overrides.listRows || [];
      },
    },
  };
}

const client = { query: async () => ({ rows: [] }) };

describe("registration application communication service (Prompt 063)", () => {
  it("records a valid internal note without applicant_message or email", async () => {
    const { repository, calls } = stubRepo();
    const sendCalls = [];
    const result = await addInternalNote(
      { applicationId: APP_ID, internalNote: "  Review carefully  " },
      { platformAdminUserId: ADMIN_ID },
      {
        repository,
        client,
        emailAdapter: {
          sendingAvailable: false,
          send: async (env) => {
            sendCalls.push(env);
            return { accepted_for_processing: false };
          },
        },
      }
    );
    assert.equal(result.recorded, true);
    assert.equal(result.communication.communicationType, "internal_note");
    assert.equal(result.communication.internalNote, "Review carefully");
    assert.equal(result.communication.applicantMessage, null);
    assert.equal(result.delivery.status, "not_applicable");
    assert.equal(result.delivery.attempted, false);
    assert.equal(calls.create.length, 1);
    assert.equal(calls.create[0].applicantMessage, null);
    assert.equal(sendCalls.length, 0);
  });

  it("rejects empty internal notes", async () => {
    const { repository } = stubRepo();
    await assert.rejects(
      () =>
        addInternalNote(
          { applicationId: APP_ID, internalNote: "   " },
          { platformAdminUserId: ADMIN_ID },
          { repository, client }
        ),
      /internal_note_required/
    );
  });

  it("records a valid information request and keeps messages separate", async () => {
    const { repository, calls } = stubRepo();
    const input = {
      applicationId: APP_ID,
      recipient: "pastor@example.org",
      subject: "Need documents",
      applicantMessage: "Please upload your certificate.",
      internalNote: "Waiting on PACRA",
      requestCategory: "upload_registration_document",
      requestedFields: ["registration_number", "registration_number", " City "],
      requestedDocuments: ["certificate", "certificate"],
      responseDueAt: "2026-08-01T12:00:00.000Z",
      channel: "email",
    };
    const frozen = JSON.stringify(input);
    const result = await recordInformationRequest(input, { platformAdminUserId: ADMIN_ID }, {
      repository,
      client,
      emailAdapter: {
        sendingAvailable: false,
        async send() {
          return {
            accepted_for_processing: false,
            sendingAvailable: false,
            code: "email_sending_unavailable",
          };
        },
      },
    });
    assert.equal(JSON.stringify(input), frozen);
    assert.equal(result.recorded, true);
    assert.equal(result.communication.communicationType, "information_request");
    assert.equal(result.communication.applicantMessage, "Please upload your certificate.");
    assert.equal(result.communication.internalNote, "Waiting on PACRA");
    assert.deepEqual(result.communication.requestedFields, [
      "registration_number",
      "City",
    ]);
    assert.deepEqual(result.communication.requestedDocuments, ["certificate"]);
    assert.equal(result.delivery.status, "sending_unavailable");
    assert.equal(result.delivery.attempted, true);
    assert.equal(result.delivery.providerAvailable, false);
    assert.notEqual(result.delivery.status, "sent");
    assert.equal(calls.create.length, 1);
    assert.equal(calls.create[0].deliveryStatus, "sending_unavailable");
  });

  it("rejects missing request fields and invalid category", async () => {
    const { repository } = stubRepo();
    await assert.rejects(
      () =>
        recordInformationRequest(
          {
            applicationId: APP_ID,
            subject: "x",
            applicantMessage: "y",
            requestCategory: "other",
            channel: "email",
          },
          { platformAdminUserId: ADMIN_ID },
          { repository, client }
        ),
      /recipient_required/
    );
    await assert.rejects(
      () =>
        recordInformationRequest(
          {
            applicationId: APP_ID,
            recipient: "pastor@example.org",
            subject: "x",
            applicantMessage: "y",
            requestCategory: "not_a_real_category",
            channel: "email",
          },
          { platformAdminUserId: ADMIN_ID },
          { repository, client }
        ),
      /invalid_request_category/
    );
    assert.ok(REQUEST_CATEGORIES.includes("clarify_church_identity"));
  });

  it("validates response deadline", async () => {
    const { repository } = stubRepo();
    await assert.rejects(
      () =>
        recordInformationRequest(
          {
            applicationId: APP_ID,
            recipient: "pastor@example.org",
            subject: "Need info",
            applicantMessage: "Please reply",
            requestCategory: "other",
            channel: "email",
            responseDueAt: "not-a-date",
          },
          { platformAdminUserId: ADMIN_ID },
          { repository, client }
        ),
      /invalid_response_deadline/
    );

    const ok = await recordInformationRequest(
      {
        applicationId: APP_ID,
        recipient: "pastor@example.org",
        subject: "Need info",
        applicantMessage: "Please reply",
        requestCategory: "other",
        channel: "other",
        responseDueAt: "2026-09-01T00:00:00.000Z",
      },
      { platformAdminUserId: ADMIN_ID },
      { repository, client }
    );
    assert.equal(ok.recorded, true);
    assert.equal(ok.delivery.status, "recorded");
  });

  it("records general applicant message and rejects missing/invalid recipient", async () => {
    const { repository, calls } = stubRepo();
    await assert.rejects(
      () =>
        recordApplicantMessage(
          {
            applicationId: APP_ID,
            subject: "Hello",
            applicantMessage: "Body",
            channel: "email",
          },
          { platformAdminUserId: ADMIN_ID },
          { repository, client }
        ),
      /recipient_required/
    );
    await assert.rejects(
      () =>
        recordApplicantMessage(
          {
            applicationId: APP_ID,
            recipient: "not-an-email",
            subject: "Hello",
            applicantMessage: "Body",
            channel: "email",
          },
          { platformAdminUserId: ADMIN_ID },
          { repository, client }
        ),
      /invalid_email_recipient/
    );

    const result = await recordApplicantMessage(
      {
        applicationId: APP_ID,
        recipient: "pastor@example.org",
        subject: "Hello",
        applicantMessage: "Body",
        internalNote: "Private",
        channel: "email",
      },
      { platformAdminUserId: ADMIN_ID },
      {
        repository,
        client,
        emailAdapter: {
          sendingAvailable: false,
          async send() {
            return { accepted_for_processing: false, code: "email_sending_unavailable" };
          },
        },
      }
    );
    assert.equal(result.communication.communicationType, "applicant_message");
    assert.equal(result.communication.direction, "outbound");
    assert.equal(result.communication.internalNote, "Private");
    assert.equal(calls.create.length, 1);
  });

  it("stores queued/sent only when adapter accepts; failed on throw; never false sent", async () => {
    const { repository: repoUnavailable, calls: c1 } = stubRepo();
    const unavailable = await recordApplicantMessage(
      {
        applicationId: APP_ID,
        recipient: "pastor@example.org",
        subject: "Hi",
        applicantMessage: "Body",
        channel: "email",
      },
      { platformAdminUserId: ADMIN_ID },
      {
        repository: repoUnavailable,
        client,
        emailAdapter: {
          sendingAvailable: false,
          async send() {
            return { accepted_for_processing: false, code: "email_sending_unavailable" };
          },
        },
      }
    );
    assert.equal(unavailable.delivery.status, "sending_unavailable");
    assert.notEqual(unavailable.delivery.status, "sent");
    assert.equal(c1.create[0].deliveryStatus, "sending_unavailable");

    const { repository: repoQueued } = stubRepo();
    const queued = await recordApplicantMessage(
      {
        applicationId: APP_ID,
        recipient: "pastor@example.org",
        subject: "Hi",
        applicantMessage: "Body",
        channel: "email",
      },
      { platformAdminUserId: ADMIN_ID },
      {
        repository: repoQueued,
        client,
        emailAdapter: {
          sendingAvailable: true,
          async send() {
            return {
              accepted_for_processing: true,
              delivery_status: "queued",
            };
          },
        },
      }
    );
    assert.equal(queued.delivery.status, "queued");
    assert.equal(queued.delivery.providerAvailable, true);

    const { repository: repoSent } = stubRepo();
    const sent = await recordApplicantMessage(
      {
        applicationId: APP_ID,
        recipient: "pastor@example.org",
        subject: "Hi",
        applicantMessage: "Body",
        channel: "email",
      },
      { platformAdminUserId: ADMIN_ID },
      {
        repository: repoSent,
        client,
        emailAdapter: {
          sendingAvailable: true,
          async send() {
            return { accepted_for_processing: true, delivery_status: "sent" };
          },
        },
      }
    );
    assert.equal(sent.delivery.status, "sent");

    const logs = [];
    const { repository: repoFail } = stubRepo();
    const failed = await recordApplicantMessage(
      {
        applicationId: APP_ID,
        recipient: "pastor@example.org",
        subject: "Hi",
        applicantMessage: "Body",
        channel: "email",
      },
      { platformAdminUserId: ADMIN_ID },
      {
        repository: repoFail,
        client,
        log: (msg, meta) => logs.push({ msg, meta }),
        emailAdapter: {
          sendingAvailable: true,
          async send() {
            throw new Error("SMTP connection reset secret=should-not-leak-to-status");
          },
        },
      }
    );
    assert.equal(failed.delivery.status, "failed");
    assert.equal(failed.delivery.safeErrorCode, "email_send_failed");
    assert.equal(logs.length, 1);
  });

  it("other channel is recorded without sending", async () => {
    const sendCalls = [];
    const { repository } = stubRepo();
    const result = await recordInformationRequest(
      {
        applicationId: APP_ID,
        recipient: "front-desk",
        subject: "Call back",
        applicantMessage: "Please call us",
        requestCategory: "correct_phone",
        channel: "other",
      },
      { platformAdminUserId: ADMIN_ID },
      {
        repository,
        client,
        emailAdapter: {
          sendingAvailable: true,
          async send(env) {
            sendCalls.push(env);
            return { accepted_for_processing: true, delivery_status: "sent" };
          },
        },
      }
    );
    assert.equal(result.delivery.status, "recorded");
    assert.equal(result.delivery.attempted, false);
    assert.equal(sendCalls.length, 0);
  });

  it("loads history newest-first, empty, filter, and safe labels", async () => {
    const { repository, calls } = stubRepo({
      listRows: [
        baseRow({
          id: "1",
          communication_type: "applicant_message",
          channel: "email",
          direction: "outbound",
          delivery_status: "sending_unavailable",
          created_at: "2026-07-24T12:00:00.000Z",
        }),
        baseRow({
          id: "2",
          communication_type: "internal_note",
          created_at: "2026-07-24T11:00:00.000Z",
        }),
      ],
    });
    const history = await getCommunicationHistory(APP_ID, {}, { repository, client });
    assert.equal(history.communications.length, 2);
    assert.equal(history.communications[0].id, "1");
    assert.equal(history.communications[0].labels.communicationType, "Applicant message");
    assert.equal(history.communications[0].labels.deliveryStatus, "Sending unavailable");
    assert.equal(history.communications[0].labels.channel, "Email");
    assert.equal(calls.list[0].applicationId, APP_ID);

    const empty = await getCommunicationHistory(
      APP_ID,
      {},
      {
        repository: {
          listRegistrationApplicationCommunications: async () => [],
        },
        client,
      }
    );
    assert.deepEqual(empty.communications, []);

    await getCommunicationHistory(
      APP_ID,
      { communicationType: "internal_note" },
      { repository, client }
    );
    assert.equal(calls.list[1].opts.communicationType, "internal_note");
  });

  it("does not mutate input and never touches application or follow-up status", async () => {
    const { repository, calls } = stubRepo();
    const input = {
      applicationId: APP_ID,
      internalNote: "Keep",
    };
    const before = JSON.stringify(input);
    await addInternalNote(input, { platformAdminUserId: ADMIN_ID }, { repository, client });
    assert.equal(JSON.stringify(input), before);
    assert.equal(calls.create.length, 1);
    assert.equal(calls.create[0].communicationType, "internal_note");
    assert.equal(Object.prototype.hasOwnProperty.call(calls.create[0], "applicationStatus"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(calls.create[0], "followUpStatus"), false);
  });
});
