"use strict";

/**
 * Phase2 Prompt 027 — phone verification service (stub repository; no PostgreSQL).
 */

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const crypto = require("crypto");

const {
  recordPhoneVerificationAttempt,
  getPhoneVerificationHistory,
  derivePhoneVerificationSummary,
  SUMMARY_STATUSES,
} = require("../src/blessboard/services/registrationPhoneVerificationService");

const APP_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_ID = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-07-23T15:00:00.000Z");

function uuid() {
  return crypto.randomUUID();
}

function freezeCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function createStubRepo() {
  const state = {
    inserts: [],
    lists: [],
    applicationMutations: 0,
    supportContactWrites: 0,
    rowsByApp: new Map(),
  };

  return {
    state,
    async createPhoneVerificationAttempt(_client, fields) {
      state.inserts.push(fields);
      const row = {
        id: uuid(),
        application_id: fields.applicationId,
        phone_number_called: fields.phoneNumberCalled,
        phone_number_normalized: "+260971234567",
        contact_person_name: fields.contactPersonName,
        contact_person_role: fields.contactPersonRole,
        attempted_at: fields.attemptedAt,
        outcome: fields.outcome,
        applicant_identity_status: fields.applicantIdentityStatus,
        applicant_authority_status: fields.applicantAuthorityStatus,
        verification_result: fields.verificationResult,
        verification_reason: fields.verificationReason,
        notes: fields.notes,
        follow_up_at: fields.followUpAt,
        created_by_user_id: fields.createdByUserId,
        created_at: NOW,
      };
      const list = state.rowsByApp.get(fields.applicationId) || [];
      list.push(row);
      state.rowsByApp.set(fields.applicationId, list);
      return row;
    },
    async listPhoneVerificationAttempts(_client, applicationId) {
      state.lists.push(applicationId);
      const list = state.rowsByApp.get(applicationId) || [];
      return list
        .slice()
        .sort((a, b) => {
          const t = new Date(b.attempted_at) - new Date(a.attempted_at);
          if (t !== 0) return t;
          return String(b.id).localeCompare(String(a.id));
        });
    },
    async updateApplicationSupportFollowUp() {
      state.applicationMutations += 1;
    },
    async updateApplicationRiskReviewState() {
      state.applicationMutations += 1;
    },
    async createOrganizationSupportContact() {
      state.supportContactWrites += 1;
    },
  };
}

function baseInput(overrides = {}) {
  return {
    applicationId: APP_ID,
    phoneNumberCalled: "097 123 4567",
    country: "Zambia",
    attemptedAt: new Date("2026-07-20T10:00:00.000Z"),
    outcome: "answered",
    applicantIdentityStatus: "not_checked",
    applicantAuthorityStatus: "not_checked",
    verificationResult: "pending",
    ...overrides,
  };
}

function deps(repo) {
  return { repository: repo, client: { stub: true } };
}

describe("registrationPhoneVerificationService (Prompt 027)", () => {
  it("records a valid pending attempt", async () => {
    const repo = createStubRepo();
    const row = await recordPhoneVerificationAttempt(
      baseInput({ notes: "  left voicemail later  " }),
      { platformAdminUserId: ADMIN_ID },
      deps(repo)
    );
    assert.equal(row.verification_result, "pending");
    assert.equal(row.outcome, "answered");
    assert.equal(row.notes, "left voicemail later");
    assert.equal(row.created_by_user_id, ADMIN_ID);
  });

  it("records a valid verified attempt", async () => {
    const repo = createStubRepo();
    const row = await recordPhoneVerificationAttempt(
      baseInput({
        outcome: "answered",
        applicantIdentityStatus: "confirmed",
        applicantAuthorityStatus: "confirmed",
        verificationResult: "verified",
        verificationReason: "Spoke with named pastor",
      }),
      { platformAdminUserId: ADMIN_ID },
      deps(repo)
    );
    assert.equal(row.verification_result, "verified");
    assert.equal(row.applicant_identity_status, "confirmed");
  });

  it("records a failed attempt", async () => {
    const repo = createStubRepo();
    const row = await recordPhoneVerificationAttempt(
      baseInput({
        outcome: "wrong_number",
        verificationResult: "failed",
        verificationReason: "Number belongs to another church",
      }),
      { platformAdminUserId: ADMIN_ID },
      deps(repo)
    );
    assert.equal(row.verification_result, "failed");
    assert.equal(row.outcome, "wrong_number");
  });

  it("rejects verified without answered outcome", async () => {
    const repo = createStubRepo();
    await assert.rejects(
      () =>
        recordPhoneVerificationAttempt(
          baseInput({
            outcome: "no_answer",
            applicantIdentityStatus: "confirmed",
            verificationResult: "verified",
            verificationReason: "guess",
          }),
          { platformAdminUserId: ADMIN_ID },
          deps(repo)
        ),
      (err) => err.code === "verified_requires_answered_outcome"
    );
    assert.equal(repo.state.inserts.length, 0);
  });

  it("rejects verified without identity confirmation", async () => {
    const repo = createStubRepo();
    await assert.rejects(
      () =>
        recordPhoneVerificationAttempt(
          baseInput({
            outcome: "answered",
            applicantIdentityStatus: "not_checked",
            verificationResult: "verified",
            verificationReason: "answered only",
          }),
          { platformAdminUserId: ADMIN_ID },
          deps(repo)
        ),
      (err) => err.code === "verified_requires_identity_confirmed"
    );
  });

  it("rejects authority confirmed without answered outcome", async () => {
    const repo = createStubRepo();
    await assert.rejects(
      () =>
        recordPhoneVerificationAttempt(
          baseInput({
            outcome: "unavailable",
            applicantAuthorityStatus: "confirmed",
            verificationResult: "pending",
          }),
          { platformAdminUserId: ADMIN_ID },
          deps(repo)
        ),
      (err) => err.code === "authority_confirmed_requires_answered_outcome"
    );
  });

  it("rejects missing verification reason for verified/failed", async () => {
    const repo = createStubRepo();
    await assert.rejects(
      () =>
        recordPhoneVerificationAttempt(
          baseInput({
            outcome: "answered",
            applicantIdentityStatus: "confirmed",
            verificationResult: "verified",
          }),
          { platformAdminUserId: ADMIN_ID },
          deps(repo)
        ),
      (err) => err.code === "verification_reason_required"
    );
    await assert.rejects(
      () =>
        recordPhoneVerificationAttempt(
          baseInput({
            outcome: "no_answer",
            verificationResult: "failed",
            verificationReason: "   ",
          }),
          { platformAdminUserId: ADMIN_ID },
          deps(repo)
        ),
      (err) => err.code === "verification_reason_required"
    );
  });

  it("rejects invalid outcome", async () => {
    const repo = createStubRepo();
    await assert.rejects(
      () =>
        recordPhoneVerificationAttempt(
          baseInput({ outcome: "reached" }),
          { platformAdminUserId: ADMIN_ID },
          deps(repo)
        ),
      (err) => err.code === "invalid_phone_verification_outcome"
    );
  });

  it("rejects invalid identity status", async () => {
    const repo = createStubRepo();
    await assert.rejects(
      () =>
        recordPhoneVerificationAttempt(
          baseInput({ applicantIdentityStatus: "true" }),
          { platformAdminUserId: ADMIN_ID },
          deps(repo)
        ),
      (err) => err.code === "invalid_applicant_identity_status"
    );
  });

  it("rejects invalid authority status", async () => {
    const repo = createStubRepo();
    await assert.rejects(
      () =>
        recordPhoneVerificationAttempt(
          baseInput({ applicantAuthorityStatus: "false" }),
          { platformAdminUserId: ADMIN_ID },
          deps(repo)
        ),
      (err) => err.code === "invalid_applicant_authority_status"
    );
  });

  it("rejects invalid verification result", async () => {
    const repo = createStubRepo();
    await assert.rejects(
      () =>
        recordPhoneVerificationAttempt(
          baseInput({ verificationResult: "success" }),
          { platformAdminUserId: ADMIN_ID },
          deps(repo)
        ),
      (err) => err.code === "invalid_verification_result"
    );
  });

  it("rejects missing administrator ID", async () => {
    const repo = createStubRepo();
    await assert.rejects(
      () => recordPhoneVerificationAttempt(baseInput(), {}, deps(repo)),
      (err) => err.code === "platform_admin_user_id_required"
    );
  });

  it("calls repository insert once and does not mutate application", async () => {
    const repo = createStubRepo();
    await recordPhoneVerificationAttempt(
      baseInput(),
      { platformAdminUserId: ADMIN_ID },
      deps(repo)
    );
    assert.equal(repo.state.inserts.length, 1);
    assert.equal(repo.state.applicationMutations, 0);
    assert.equal(repo.state.supportContactWrites, 0);
  });

  it("returns empty history when none exist", async () => {
    const repo = createStubRepo();
    const rows = await getPhoneVerificationHistory(APP_ID, deps(repo));
    assert.deepEqual(rows, []);
  });

  it("returns multiple attempts newest first", async () => {
    const repo = createStubRepo();
    await recordPhoneVerificationAttempt(
      baseInput({ attemptedAt: new Date("2026-07-01T08:00:00.000Z"), outcome: "no_answer" }),
      { platformAdminUserId: ADMIN_ID },
      deps(repo)
    );
    await recordPhoneVerificationAttempt(
      baseInput({ attemptedAt: new Date("2026-07-03T08:00:00.000Z"), outcome: "answered" }),
      { platformAdminUserId: ADMIN_ID },
      deps(repo)
    );
    await recordPhoneVerificationAttempt(
      baseInput({ attemptedAt: new Date("2026-07-02T08:00:00.000Z"), outcome: "unavailable" }),
      { platformAdminUserId: ADMIN_ID },
      deps(repo)
    );
    const rows = await getPhoneVerificationHistory(APP_ID, deps(repo));
    assert.equal(rows.length, 3);
    assert.equal(rows[0].outcome, "answered");
    assert.equal(rows[1].outcome, "unavailable");
    assert.equal(rows[2].outcome, "no_answer");
    assert.ok(!Object.prototype.hasOwnProperty.call(rows[0], "created_by_email"));
  });

  it("summary with no attempts is not_checked", () => {
    const summary = derivePhoneVerificationSummary([]);
    assert.equal(summary.totalAttempts, 0);
    assert.equal(summary.verificationStatus, SUMMARY_STATUSES.NOT_CHECKED);
    assert.equal(summary.latestAttempt, null);
    assert.equal(summary.applicantContacted, false);
    assert.equal(summary.followUpRequired, false);
  });

  it("summary pending when attempts exist without final result", () => {
    const summary = derivePhoneVerificationSummary([
      {
        id: "a",
        attempted_at: "2026-07-20T10:00:00.000Z",
        outcome: "answered",
        verification_result: "pending",
        applicant_identity_status: "not_checked",
        applicant_authority_status: "not_checked",
      },
    ]);
    assert.equal(summary.verificationStatus, SUMMARY_STATUSES.PENDING);
    assert.equal(summary.totalAttempts, 1);
    assert.equal(summary.answeredAttempts, 1);
  });

  it("summary verified from most recent final result", () => {
    const summary = derivePhoneVerificationSummary([
      {
        id: "1",
        attempted_at: "2026-07-21T10:00:00.000Z",
        outcome: "answered",
        verification_result: "verified",
        applicant_identity_status: "confirmed",
        applicant_authority_status: "confirmed",
      },
      {
        id: "0",
        attempted_at: "2026-07-20T10:00:00.000Z",
        outcome: "no_answer",
        verification_result: "pending",
        applicant_identity_status: "not_checked",
        applicant_authority_status: "not_checked",
      },
    ]);
    assert.equal(summary.verificationStatus, SUMMARY_STATUSES.VERIFIED);
    assert.equal(summary.identityConfirmed, true);
    assert.equal(summary.authorityConfirmed, true);
  });

  it("summary failed from most recent final result", () => {
    const summary = derivePhoneVerificationSummary([
      {
        id: "2",
        attempted_at: "2026-07-22T10:00:00.000Z",
        outcome: "wrong_number",
        verification_result: "failed",
        applicant_identity_status: "not_confirmed",
        applicant_authority_status: "not_checked",
      },
    ]);
    assert.equal(summary.verificationStatus, SUMMARY_STATUSES.FAILED);
    assert.equal(summary.failedAttempts, 1);
  });

  it("later pending attempt does not erase verified status", () => {
    const summary = derivePhoneVerificationSummary([
      {
        id: "later",
        attempted_at: "2026-07-23T12:00:00.000Z",
        outcome: "no_answer",
        verification_result: "pending",
        applicant_identity_status: "not_checked",
        applicant_authority_status: "not_checked",
      },
      {
        id: "earlier",
        attempted_at: "2026-07-22T12:00:00.000Z",
        outcome: "answered",
        verification_result: "verified",
        applicant_identity_status: "confirmed",
        applicant_authority_status: "confirmed",
      },
    ]);
    assert.equal(summary.verificationStatus, SUMMARY_STATUSES.VERIFIED);
    assert.equal(summary.latestAttempt.id, "later");
    assert.equal(summary.totalAttempts, 2);
  });

  it("derives applicant contacted only from answered calls", () => {
    const summary = derivePhoneVerificationSummary([
      {
        id: "1",
        attempted_at: "2026-07-20T10:00:00.000Z",
        outcome: "wrong_number",
        verification_result: "pending",
      },
      {
        id: "2",
        attempted_at: "2026-07-21T10:00:00.000Z",
        outcome: "no_answer",
        verification_result: "pending",
      },
    ]);
    assert.equal(summary.applicantContacted, false);
    assert.equal(summary.answeredAttempts, 0);

    const withAnswer = derivePhoneVerificationSummary([
      {
        id: "3",
        attempted_at: "2026-07-22T10:00:00.000Z",
        outcome: "answered",
        verification_result: "pending",
      },
      {
        id: "1",
        attempted_at: "2026-07-20T10:00:00.000Z",
        outcome: "wrong_number",
        verification_result: "failed",
        verification_reason: "x",
      },
    ]);
    assert.equal(withAnswer.applicantContacted, true);
    assert.equal(withAnswer.answeredAttempts, 1);
  });

  it("derives identity and authority confirmation", () => {
    const summary = derivePhoneVerificationSummary([
      {
        id: "1",
        attempted_at: "2026-07-20T10:00:00.000Z",
        outcome: "answered",
        verification_result: "pending",
        applicant_identity_status: "confirmed",
        applicant_authority_status: "not_confirmed",
      },
    ]);
    assert.equal(summary.identityConfirmed, true);
    assert.equal(summary.authorityConfirmed, false);
    assert.equal(summary.latestIdentityStatus, "confirmed");
    assert.equal(summary.latestAuthorityStatus, "not_confirmed");
  });

  it("newest explicit identity/authority supersedes older; later not_checked is ignored", () => {
    const summary = derivePhoneVerificationSummary([
      {
        id: "later",
        attempted_at: "2026-07-22T10:00:00.000Z",
        outcome: "no_answer",
        verification_result: "pending",
        applicant_identity_status: "not_checked",
        applicant_authority_status: "not_checked",
      },
      {
        id: "middle",
        attempted_at: "2026-07-21T10:00:00.000Z",
        outcome: "answered",
        verification_result: "pending",
        applicant_identity_status: "not_confirmed",
        applicant_authority_status: "confirmed",
      },
      {
        id: "older",
        attempted_at: "2026-07-20T10:00:00.000Z",
        outcome: "answered",
        verification_result: "pending",
        applicant_identity_status: "confirmed",
        applicant_authority_status: "not_confirmed",
      },
    ]);
    assert.equal(summary.latestIdentityStatus, "not_confirmed");
    assert.equal(summary.latestAuthorityStatus, "confirmed");
    assert.equal(summary.identityConfirmed, false);
    assert.equal(summary.authorityConfirmed, true);
  });

  it("derives follow-up from future scheduled dates", () => {
    const past = derivePhoneVerificationSummary(
      [
        {
          id: "1",
          attempted_at: "2026-07-20T10:00:00.000Z",
          outcome: "callback_requested",
          verification_result: "pending",
          follow_up_at: "2026-07-21T09:00:00.000Z",
        },
      ],
      { now: NOW }
    );
    assert.equal(past.followUpRequired, false);
    assert.equal(past.nextFollowUpAt, null);

    const future = derivePhoneVerificationSummary(
      [
        {
          id: "1",
          attempted_at: "2026-07-20T10:00:00.000Z",
          outcome: "callback_requested",
          verification_result: "pending",
          follow_up_at: "2026-07-25T09:00:00.000Z",
        },
        {
          id: "2",
          attempted_at: "2026-07-21T10:00:00.000Z",
          outcome: "no_answer",
          verification_result: "pending",
          follow_up_at: "2026-07-24T09:00:00.000Z",
        },
      ],
      { now: NOW }
    );
    assert.equal(future.followUpRequired, true);
    assert.equal(future.nextFollowUpAt.toISOString(), "2026-07-24T09:00:00.000Z");
  });

  it("wrong number and no answer do not count as contacted", () => {
    const summary = derivePhoneVerificationSummary([
      {
        id: "a",
        attempted_at: "2026-07-20T10:00:00.000Z",
        outcome: "wrong_number",
        verification_result: "failed",
        verification_reason: "wrong",
      },
      {
        id: "b",
        attempted_at: "2026-07-21T10:00:00.000Z",
        outcome: "no_answer",
        verification_result: "pending",
      },
    ]);
    assert.equal(summary.applicantContacted, false);
    assert.equal(summary.answeredAttempts, 0);
  });

  it("does not mutate input objects", async () => {
    const repo = createStubRepo();
    const input = baseInput({
      notes: "keep",
      verificationResult: "pending",
      contactPersonName: " Jane ",
    });
    const context = { platformAdminUserId: ADMIN_ID };
    const attemptedAtRef = input.attemptedAt;
    const attempts = [
      {
        id: "x",
        attempted_at: "2026-07-20T10:00:00.000Z",
        outcome: "answered",
        verification_result: "pending",
      },
    ];
    const attemptsBefore = freezeCopy(attempts);

    await recordPhoneVerificationAttempt(input, context, deps(repo));
    derivePhoneVerificationSummary(attempts, { now: NOW });

    assert.equal(input.notes, "keep");
    assert.equal(input.contactPersonName, " Jane ");
    assert.equal(input.verificationResult, "pending");
    assert.equal(input.attemptedAt, attemptedAtRef);
    assert.equal(context.platformAdminUserId, ADMIN_ID);
    assert.deepEqual(attempts, attemptsBefore);
  });
});
