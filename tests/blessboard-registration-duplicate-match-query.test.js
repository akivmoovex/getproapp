"use strict";

/**
 * Phase2 Prompt 048 — duplicate match query service (stubbed deps, no Postgres).
 */

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const {
  runDuplicateCheck,
  listDuplicateMatches,
  getDuplicateComparison,
  presentCandidateSummary,
  sortMatchesStable,
} = require("../src/blessboard/services/registrationDuplicateMatchQueryService");
const { RISK_LEVELS } = require("../src/blessboard/services/registrationDuplicateScoring");

const APP_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OTHER_APP = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ORG_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const USER_ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const MATCH_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const NOW = "2026-07-24T15:00:00.000Z";

function subjectRow(overrides = {}) {
  return {
    id: APP_ID,
    church_name: "Grace Community Church",
    city: "Lusaka",
    country: "Zambia",
    contact_email: "pat@example.com",
    contact_phone: "+260971234567",
    contact_phone_normalized: "+260971234567",
    branch_name: null,
    application_status: "submitted",
    provisioning_status: "not_started",
    organization_id: null,
    ...overrides,
  };
}

describe("registrationDuplicateMatchQueryService (Prompt 048, stubbed)", () => {
  it("runDuplicateCheck loads candidates in parallel, stores scores, excludes self, orders stably", async () => {
    const calls = {
      apps: 0,
      orgs: 0,
      churches: 0,
      branches: 0,
      domains: 0,
      user: 0,
      replace: 0,
    };
    let replacedPayload = null;

    const result = await runDuplicateCheck({}, APP_ID, {
      now: NOW,
      getRegistrationApplicationById: async () => subjectRow(),
      listRegistrationDuplicateMatches: async () => [],
      listDuplicateCandidateApplications: async (_db, opts) => {
        calls.apps += 1;
        assert.equal(opts.excludeApplicationId, APP_ID);
        return [
          {
            id: OTHER_APP,
            church_name: "Grace Community Church",
            city: "Lusaka",
            country: "Zambia",
            contact_email: "other@example.com",
            contact_phone: "+260977000001",
            contact_phone_normalized: "+260977000001",
            application_status: "submitted",
            provisioning_status: "not_started",
          },
          {
            id: APP_ID,
            church_name: "Grace Community Church",
            city: "Lusaka",
            country: "Zambia",
            contact_email: "pat@example.com",
            contact_phone_normalized: "+260971234567",
            application_status: "submitted",
            provisioning_status: "not_started",
          },
        ];
      },
      listDuplicateCandidateOrganizations: async () => {
        calls.orgs += 1;
        return [
          {
            id: ORG_ID,
            organization_key: "grace-community",
            display_name: "Grace Community Church",
            legal_name: null,
            status: "active",
            data_environment: "production",
            primary_email: "office@grace.example",
            primary_phone: null,
          },
        ];
      },
      listDuplicateCandidateChurches: async () => {
        calls.churches += 1;
        return [];
      },
      listDuplicateCandidateBranches: async () => {
        calls.branches += 1;
        return [];
      },
      listDuplicateCandidateDomains: async () => {
        calls.domains += 1;
        return [];
      },
      findDuplicateCandidateUserByEmail: async (_db, email) => {
        calls.user += 1;
        assert.equal(email, "pat@example.com");
        return { id: USER_ID, email_normalized: email, status: "active" };
      },
      replaceRegistrationDuplicateMatches: async (_db, applicationId, matches) => {
        calls.replace += 1;
        assert.equal(applicationId, APP_ID);
        replacedPayload = matches;
        assert.ok(!matches.some((m) => m.matchedRecordId === APP_ID));
        return matches.map((m, idx) => ({
          id: `00000000-0000-4000-8000-${String(idx).padStart(12, "0")}`,
          application_id: APP_ID,
          matched_record_type: m.matchedRecordType,
          matched_record_id: m.matchedRecordId,
          score: m.score,
          risk_level: m.riskLevel,
          evidence_snapshot: m.evidenceSnapshot,
          review_decision: null,
          review_reason: null,
          reviewed_by_user_id: null,
          reviewed_at: null,
          created_at: NOW,
          updated_at: NOW,
        }));
      },
      loadDuplicateMatchRecordsByType: async (_db, groups) => {
        const maps = {
          application: new Map(),
          organization: new Map(),
          church: new Map(),
          branch: new Map(),
          domain: new Map(),
          user: new Map(),
        };
        for (const g of groups) {
          if (g.type === "application") {
            maps.application.set(OTHER_APP, {
              id: OTHER_APP,
              church_name: "Grace Community Church",
              city: "Lusaka",
              country: "Zambia",
              application_status: "submitted",
              provisioning_status: "not_started",
            });
          }
          if (g.type === "organization") {
            maps.organization.set(ORG_ID, {
              id: ORG_ID,
              display_name: "Grace Community Church",
              organization_key: "grace-community",
              status: "active",
              data_environment: "production",
              primary_email: "office@grace.example",
            });
          }
          if (g.type === "user") {
            maps.user.set(USER_ID, { id: USER_ID, status: "active" });
          }
        }
        return maps;
      },
    });

    assert.equal(result.ok, true);
    assert.equal(calls.apps, 1);
    assert.equal(calls.orgs, 1);
    assert.equal(calls.churches, 1);
    assert.equal(calls.branches, 1);
    assert.equal(calls.domains, 0);
    assert.equal(calls.user, 1);
    assert.equal(calls.replace, 1);
    assert.ok(replacedPayload.length >= 2);
    assert.ok(result.matches.every((m) => m.matchedRecordId !== APP_ID));
    assert.equal(result.autoMerge, false);
    assert.equal(result.approvalGateUnchanged, true);

    // Stable ordering: stronger first.
    for (let i = 1; i < result.matches.length; i += 1) {
      const prev = result.matches[i - 1];
      const cur = result.matches[i];
      const rank = { confirmed: 0, strong: 1, possible: 2, none: 3 };
      const pr = rank[prev.riskLevel];
      const cr = rank[cur.riskLevel];
      assert.ok(pr <= cr);
      if (pr === cr) {
        assert.ok(prev.score >= cur.score);
      }
    }

    const userMatch = result.matches.find((m) => m.matchedRecordType === "user");
    assert.ok(userMatch);
    assert.equal(userMatch.candidate.label, "Platform user account");
    assert.equal(userMatch.candidate.email, undefined);
    assert.equal(userMatch.candidate.contactEmail, undefined);
    assert.doesNotMatch(JSON.stringify(result), /pat@example\.com/);
  });

  it("listDuplicateMatches returns stored rows without contact emails", async () => {
    const out = await listDuplicateMatches({}, APP_ID, {
      getRegistrationApplicationById: async () => subjectRow(),
      listRegistrationDuplicateMatches: async () => [
        {
          id: MATCH_ID,
          application_id: APP_ID,
          matched_record_type: "user",
          matched_record_id: USER_ID,
          score: 18,
          risk_level: "possible",
          evidence_snapshot: { signals: ["platform_user_email"] },
          review_decision: null,
          review_reason: null,
          reviewed_by_user_id: null,
          reviewed_at: null,
          created_at: NOW,
          updated_at: NOW,
        },
      ],
      loadDuplicateMatchRecordsByType: async () => ({
        application: new Map(),
        organization: new Map(),
        church: new Map(),
        branch: new Map(),
        domain: new Map(),
        user: new Map([[USER_ID, { id: USER_ID, status: "active" }]]),
      }),
    });
    assert.equal(out.ok, true);
    assert.equal(out.matches.length, 1);
    assert.equal(out.matches[0].candidate.label, "Platform user account");
    assert.doesNotMatch(JSON.stringify(out.matches), /email_normalized|@example/);
  });

  it("getDuplicateComparison returns subject/candidate pair for one match", async () => {
    const out = await getDuplicateComparison({}, APP_ID, MATCH_ID, {
      getRegistrationApplicationById: async () => subjectRow(),
      getRegistrationDuplicateMatchById: async () => ({
        id: MATCH_ID,
        application_id: APP_ID,
        matched_record_type: "application",
        matched_record_id: OTHER_APP,
        score: 20,
        risk_level: "possible",
        evidence_snapshot: {
          signals: ["exact_name_city_country"],
          explanation: "Exact triple",
        },
        review_decision: null,
        review_reason: null,
        reviewed_by_user_id: null,
        reviewed_at: null,
        created_at: NOW,
        updated_at: NOW,
      }),
      loadDuplicateMatchRecordsByType: async () => ({
        application: new Map([
          [
            OTHER_APP,
            {
              id: OTHER_APP,
              church_name: "Grace Community Church",
              city: "Lusaka",
              country: "Zambia",
              application_status: "submitted",
              provisioning_status: "not_started",
            },
          ],
        ]),
        organization: new Map(),
        church: new Map(),
        branch: new Map(),
        domain: new Map(),
        user: new Map(),
      }),
    });
    assert.equal(out.ok, true);
    assert.equal(out.comparison.subject.id, APP_ID);
    assert.equal(out.comparison.candidate.id, OTHER_APP);
    assert.equal(out.comparison.riskLevel, RISK_LEVELS.POSSIBLE);
    assert.equal(out.comparison.candidate.contactEmail, undefined);
    assert.equal(out.autoReject, false);
  });

  it("returns not_found / invalid_input safely", async () => {
    const bad = await runDuplicateCheck({}, "not-a-uuid", {});
    assert.equal(bad.ok, false);
    assert.equal(bad.status, "invalid_input");

    const missing = await listDuplicateMatches({}, APP_ID, {
      getRegistrationApplicationById: async () => null,
    });
    assert.equal(missing.ok, false);
    assert.equal(missing.status, "not_found");
  });

  it("presentCandidateSummary never exposes user email fields", () => {
    const summary = presentCandidateSummary("user", {
      id: USER_ID,
      email_normalized: "secret@example.com",
      email_display: "Secret",
      status: "active",
    });
    assert.equal(summary.label, "Platform user account");
    assert.equal(summary.email_normalized, undefined);
    assert.equal(summary.email_display, undefined);
  });

  it("sortMatchesStable orders by risk, then score desc, then record id", () => {
    const sorted = sortMatchesStable([
      { riskLevel: "possible", score: 10, matchedRecordId: "b", matchedRecordType: "application" },
      { riskLevel: "strong", score: 40, matchedRecordId: "a", matchedRecordType: "organization" },
      { riskLevel: "possible", score: 20, matchedRecordId: "c", matchedRecordType: "application" },
      { riskLevel: "possible", score: 20, matchedRecordId: "a", matchedRecordType: "application" },
    ]);
    assert.equal(sorted[0].riskLevel, "strong");
    assert.equal(sorted[1].matchedRecordId, "a");
    assert.equal(sorted[2].matchedRecordId, "c");
    assert.equal(sorted[3].score, 10);
  });
});
