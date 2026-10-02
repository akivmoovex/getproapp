"use strict";

/**
 * Phase2 Prompt 071 — reopen rejected application (stubbed unit tests; no Postgres).
 */

const assert = require("node:assert/strict");
const { describe, it, before, after } = require("node:test");

const repo = require("../src/blessboard/repositories/platformChurchRegistrationRepository");
const {
  reopenRegistrationApplication,
  STATUS,
} = require("../src/blessboard/services/registrationApplicationsAdminService");

const APP_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const ADMIN_ID = "11111111-2222-4333-8444-555555555555";

function baseRejectedApp(overrides = {}) {
  return {
    id: APP_ID,
    contact_email: "pat@example.com",
    application_status: "rejected",
    provisioning_status: "not_started",
    organization_id: null,
    rejection_reason: "Prior internal: duplicate church",
    rejection_category: "duplicate_registration",
    reapplication_allowed: false,
    rejection_notification_status: "sending_unavailable",
    risk_reason_codes: ["admin_rejected"],
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

describe("reopenRegistrationApplication (Prompt 071 unit)", () => {
  let origLock;
  let origUpdateRisk;
  let origUpdateMeta;
  let origCreateComm;

  before(() => {
    origLock = repo.lockApplicationById;
    origUpdateRisk = repo.updateApplicationRiskReviewState;
    origUpdateMeta = repo.updateRegistrationRejectionMetadata;
    origCreateComm = repo.createRegistrationApplicationCommunication;
  });

  after(() => {
    repo.lockApplicationById = origLock;
    repo.updateApplicationRiskReviewState = origUpdateRisk;
    repo.updateRegistrationRejectionMetadata = origUpdateMeta;
    repo.createRegistrationApplicationCommunication = origCreateComm;
  });

  it("requires reason and valid ids", async () => {
    const client = makeTxClient();
    const missing = await reopenRegistrationApplication(client, {
      applicationId: APP_ID,
      platformAdminUserId: ADMIN_ID,
      reason: "ab",
    });
    assert.equal(missing.ok, false);
    assert.equal(missing.message, "reopen_reason_required");
    assert.equal(missing.status, STATUS.INVALID_INPUT);

    const badId = await reopenRegistrationApplication(client, {
      applicationId: "not-a-uuid",
      platformAdminUserId: ADMIN_ID,
      reason: "Reopen after clarification",
    });
    assert.equal(badId.ok, false);
    assert.equal(badId.status, STATUS.INVALID_INPUT);
  });

  it("only allows currently rejected applications", async () => {
    const client = makeTxClient();
    repo.lockApplicationById = async () =>
      baseRejectedApp({ application_status: "submitted" });
    repo.updateApplicationRiskReviewState = async () => {
      throw new Error("must not update");
    };

    const result = await reopenRegistrationApplication(client, {
      applicationId: APP_ID,
      platformAdminUserId: ADMIN_ID,
      reason: "Reopen after clarification",
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, STATUS.NOT_ELIGIBLE);
    assert.equal(result.message, "not_eligible");
  });

  it("transitions to submitted, appends reopen event, preserves rejection fields", async () => {
    const client = makeTxClient();
    let riskPatch = null;
    let metaCalls = 0;
    let commCalls = 0;

    repo.lockApplicationById = async () => baseRejectedApp();
    repo.updateApplicationRiskReviewState = async (_c, _id, patch) => {
      riskPatch = patch;
      return { id: APP_ID };
    };
    repo.updateRegistrationRejectionMetadata = async () => {
      metaCalls += 1;
      return { id: APP_ID };
    };
    repo.createRegistrationApplicationCommunication = async () => {
      commCalls += 1;
      return { id: "comm-1" };
    };

    const result = await reopenRegistrationApplication(client, {
      applicationId: APP_ID,
      platformAdminUserId: ADMIN_ID,
      reason: "Applicant provided clarifying documents",
    });

    assert.equal(result.ok, true);
    assert.equal(result.applicationStatus, "submitted");
    assert.equal(result.fromStatus, "rejected");
    assert.equal(riskPatch.applicationStatus, "submitted");
    assert.equal(riskPatch.reviewEvent.action, "reopen");
    assert.equal(riskPatch.reviewEvent.actor_user_id, ADMIN_ID);
    assert.equal(riskPatch.reviewEvent.reason, "Applicant provided clarifying documents");
    assert.equal(riskPatch.reviewEvent.from_status, "rejected");
    assert.equal(riskPatch.reviewEvent.to_status, "submitted");
    assert.equal(
      Object.prototype.hasOwnProperty.call(riskPatch, "rejectionReason"),
      false
    );
    assert.equal(Boolean(riskPatch.clearRejectionReason), false);
    assert.equal(metaCalls, 0);
    assert.equal(commCalls, 0);
    assert.deepEqual(client.calls.filter((c) => c === "BEGIN" || c === "COMMIT"), [
      "BEGIN",
      "COMMIT",
    ]);
  });

  it("blocks provisioned applications", async () => {
    const client = makeTxClient();
    repo.lockApplicationById = async () =>
      baseRejectedApp({
        organization_id: "99999999-9999-4999-8999-999999999999",
        provisioning_status: "provisioned",
      });
    repo.updateApplicationRiskReviewState = async () => {
      throw new Error("must not update");
    };

    const result = await reopenRegistrationApplication(client, {
      applicationId: APP_ID,
      actorUserId: ADMIN_ID,
      reason: "Should not reopen provisioned",
    });
    assert.equal(result.ok, false);
    assert.equal(result.message, "already_provisioned");
  });

  it("returns not_found when application is missing", async () => {
    const client = makeTxClient();
    repo.lockApplicationById = async () => null;
    const result = await reopenRegistrationApplication(client, {
      applicationId: APP_ID,
      platformAdminUserId: ADMIN_ID,
      reason: "Reopen missing app",
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, STATUS.NOT_FOUND);
  });
});
