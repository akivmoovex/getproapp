"use strict";

/**
 * Phase2 Prompt 052 — duplicate review decision service (stubbed deps, no PostgreSQL).
 */

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  STATUS,
  REVIEW_DECISIONS,
  isReasonRequired,
  recordDuplicateMatchReviewDecision,
  DEFAULT_REASON_WHEN_OPTIONAL,
} = require("../src/blessboard/services/registrationDuplicateReviewDecisionService");

const APP_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const MATCH_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const ADMIN_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ORG_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const NOW = "2026-07-24T18:00:00.000Z";

function fakeDb() {
  return {
    async query(sql) {
      const s = String(sql || "");
      if (s === "BEGIN" || s === "COMMIT" || s === "ROLLBACK") return { rows: [] };
      throw new Error(`unexpected sql: ${s}`);
    },
  };
}

function baseMatch(overrides = {}) {
  return {
    id: MATCH_ID,
    application_id: APP_ID,
    matched_record_type: "organization",
    matched_record_id: ORG_ID,
    score: 55,
    risk_level: "strong",
    evidence_snapshot: {},
    review_decision: null,
    review_reason: null,
    ...overrides,
  };
}

describe("registrationDuplicateReviewDecisionService (Prompt 052)", () => {
  it("exposes allowlisted decisions and reason rules", () => {
    assert.ok(REVIEW_DECISIONS.includes("different_church"));
    assert.ok(REVIEW_DECISIONS.includes("confirmed_duplicate"));
    assert.ok(REVIEW_DECISIONS.includes("impersonation_concern"));
    assert.equal(isReasonRequired("impersonation_concern", "possible"), true);
    assert.equal(isReasonRequired("confirmed_duplicate", "possible"), true);
    assert.equal(isReasonRequired("different_church", "strong"), true);
    assert.equal(isReasonRequired("different_church", "possible"), false);
    assert.equal(isReasonRequired("link_existing_church", "strong"), false);
    assert.equal(isReasonRequired("clarification_required", "strong"), true);
  });

  it("records an allowlisted decision with session reviewer and review_events audit", async () => {
    const calls = { write: [], followUp: [], audit: [] };
    const result = await recordDuplicateMatchReviewDecision(
      fakeDb(),
      {
        applicationId: APP_ID,
        matchId: MATCH_ID,
        decision: "link_existing_church",
        reason: "",
        actorUserId: ADMIN_ID,
        now: NOW,
      },
      {
        getRegistrationDuplicateMatchById: async (_db, matchId, opts) => {
          assert.equal(matchId, MATCH_ID);
          assert.equal(opts.applicationId, APP_ID);
          return baseMatch({ risk_level: "possible" });
        },
        recordRegistrationDuplicateMatchDecision: async (_db, matchId, fields) => {
          calls.write.push({ matchId, fields });
          return {
            ...baseMatch({ risk_level: "possible" }),
            review_decision: fields.reviewDecision,
            review_reason: fields.reviewReason,
            reviewed_by_user_id: fields.reviewedByUserId,
            reviewed_at: fields.reviewedAt,
          };
        },
        updateApplicationSupportFollowUp: async (_db, applicationId, patch) => {
          calls.followUp.push({ applicationId, patch });
          return { id: APP_ID };
        },
        getRegistrationApplicationById: async () => ({
          id: APP_ID,
          organization_id: null,
        }),
        recordAuditEventSafe: async () => {
          calls.audit.push(true);
          return { ok: true };
        },
      }
    );

    assert.equal(result.ok, true);
    assert.equal(result.status, STATUS.OK);
    assert.equal(result.autoMerge, false);
    assert.equal(result.autoReject, false);
    assert.equal(result.autoApprove, false);
    assert.equal(result.provisioned, false);
    assert.equal(calls.write.length, 1);
    assert.equal(calls.write[0].fields.reviewDecision, "link_existing_church");
    assert.equal(calls.write[0].fields.reviewedByUserId, ADMIN_ID);
    assert.equal(calls.write[0].fields.reviewReason, DEFAULT_REASON_WHEN_OPTIONAL);
    assert.equal(calls.followUp.length, 1);
    assert.equal(calls.followUp[0].patch.reviewEvent.action, "duplicate_match_decision");
    assert.deepEqual(calls.followUp[0].patch.reviewEvent.reason_codes, [
      "link_existing_church",
    ]);
    assert.equal(calls.audit.length, 0);
  });

  it("requires reason for confirmed_duplicate, impersonation_concern, and strong different_church", async () => {
    for (const [decision, risk] of [
      ["confirmed_duplicate", "possible"],
      ["impersonation_concern", "possible"],
      ["different_church", "strong"],
    ]) {
      const result = await recordDuplicateMatchReviewDecision(
        fakeDb(),
        {
          applicationId: APP_ID,
          matchId: MATCH_ID,
          decision,
          reason: "  ",
          actorUserId: ADMIN_ID,
        },
        {
          getRegistrationDuplicateMatchById: async () => baseMatch({ risk_level: risk }),
          recordRegistrationDuplicateMatchDecision: async () => {
            throw new Error("should not write");
          },
        }
      );
      assert.equal(result.ok, false);
      assert.equal(result.status, STATUS.REASON_REQUIRED);
    }
  });

  it("rejects unknown decisions and missing match without writing", async () => {
    const bad = await recordDuplicateMatchReviewDecision(fakeDb(), {
      applicationId: APP_ID,
      matchId: MATCH_ID,
      decision: "auto_merge",
      reason: "nope",
      actorUserId: ADMIN_ID,
    });
    assert.equal(bad.ok, false);
    assert.equal(bad.status, STATUS.INVALID_DECISION);

    let wrote = false;
    const missing = await recordDuplicateMatchReviewDecision(
      fakeDb(),
      {
        applicationId: APP_ID,
        matchId: MATCH_ID,
        decision: "different_church",
        reason: "Not the same congregation",
        actorUserId: ADMIN_ID,
      },
      {
        getRegistrationDuplicateMatchById: async () => null,
        recordRegistrationDuplicateMatchDecision: async () => {
          wrote = true;
          return null;
        },
      }
    );
    assert.equal(missing.ok, false);
    assert.equal(missing.status, STATUS.NOT_FOUND);
    assert.equal(wrote, false);
  });

  it("writes org audit when organization already exists", async () => {
    const audits = [];
    const result = await recordDuplicateMatchReviewDecision(
      fakeDb(),
      {
        applicationId: APP_ID,
        matchId: MATCH_ID,
        decision: "confirmed_duplicate",
        reason: "Operator confirmed same church after documents review",
        actorUserId: ADMIN_ID,
        now: NOW,
        deploymentCode: "blessboard-org-v5",
      },
      {
        getRegistrationDuplicateMatchById: async () => baseMatch({ risk_level: "strong" }),
        recordRegistrationDuplicateMatchDecision: async (_db, _id, fields) => ({
          ...baseMatch(),
          review_decision: fields.reviewDecision,
          review_reason: fields.reviewReason,
        }),
        updateApplicationSupportFollowUp: async () => ({ id: APP_ID }),
        getRegistrationApplicationById: async () => ({
          id: APP_ID,
          organization_id: ORG_ID,
        }),
        recordAuditEventSafe: async (_db, payload) => {
          audits.push(payload);
          return { ok: true };
        },
      }
    );
    assert.equal(result.ok, true);
    assert.equal(audits.length, 1);
    assert.equal(audits[0].actionKey, "registration.duplicate_match_decision");
    assert.equal(audits[0].organizationId, ORG_ID);
    assert.equal(audits[0].metadata.reason_code, "confirmed_duplicate");
    assert.equal(audits[0].metadata.notes, undefined);
  });
});
