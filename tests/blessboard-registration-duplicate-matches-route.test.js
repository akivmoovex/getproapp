"use strict";

/**
 * Phase2 Prompt 049 — GET duplicate matches / comparison routes (stubbed loaders; no PostgreSQL).
 */

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const express = require("express");
const request = require("supertest");
const fs = require("node:fs");
const path = require("path");

const { createPlatformAdminRouter } = require("../src/platform/http/platformAdminRoutes");
const {
  SUBJECT_COMPARISON_KEYS,
  CANDIDATE_COMPARISON_KEYS,
  loadRegistrationDuplicateMatchesForAdmin,
  loadRegistrationDuplicateComparisonForAdmin,
} = require("../src/blessboard/services/registrationDuplicateMatchesAdminLoader");

const APP_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const MATCH_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const OTHER_MATCH = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const ADMIN_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ENV = {
  NODE_ENV: "test",
  SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
  BLESSBOARD_APEX_ORIGIN: "https://blessboard.test",
};

function simpleCookieParser(req, _res, next) {
  if (req.cookies && typeof req.cookies === "object") return next();
  req.cookies = {};
  const header = String((req.headers && req.headers.cookie) || "");
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    try {
      req.cookies[key] = decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      req.cookies[key] = part.slice(idx + 1).trim();
    }
  }
  return next();
}

function sampleListPayload(overrides = {}) {
  return {
    ok: true,
    status: "ok",
    applicationId: APP_ID,
    subject: {
      id: APP_ID,
      type: "application",
      churchName: "Grace Community Church",
      city: "Lusaka",
      country: "Zambia",
      applicationStatus: "submitted",
      provisioningStatus: "not_started",
      organizationId: null,
      hasContactEmail: true,
      hasContactPhone: true,
    },
    matches: [
      {
        id: MATCH_ID,
        applicationId: APP_ID,
        matchedRecordType: "organization",
        matchedRecordTypeLabel: "Organization",
        matchedRecordId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        score: 40,
        riskLevel: "strong",
        riskLabel: "High match",
        reviewDecision: null,
        reviewStatus: "Not reviewed",
        reasons: ["Organization display name matches"],
        reasonTags: ["Exact name"],
        explanation: "Strong match on church name",
        location: "Lusaka, Zambia",
        contactOverlap: { phone: false, email: false, labels: ["No contact overlap"] },
        organizationStatus: "active",
        candidate: {
          type: "organization",
          id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          displayName: "Grace Community Church",
          organizationKey: "grace",
          status: "active",
          dataEnvironment: "production",
          hasPrimaryEmail: true,
        },
        candidateLabel: "Grace Community Church",
        compareHref: `/admin/registration-applications/${APP_ID}/duplicates/${MATCH_ID}`,
      },
    ],
    empty: false,
    unavailable: false,
    advisory: true,
    autoMerge: false,
    autoReject: false,
    approvalGateUnchanged: true,
    detailHref: `/admin/registration-applications/${APP_ID}`,
    ...overrides,
  };
}

function sampleComparePayload(overrides = {}) {
  const list = sampleListPayload();
  const {
    buildComparisonAttributeRows,
  } = require("../src/blessboard/services/registrationDuplicateMatchesAdminLoader");
  const {
    DECISION_OPTIONS,
    isReasonRequired,
  } = require("../src/blessboard/services/registrationDuplicateReviewDecisionService");
  const authorizedSubject = {
    role: "application",
    type: "application",
    publicName: "Grace Community Church",
    legalName: null,
    country: "Zambia",
    province: null,
    district: null,
    town: "Lusaka",
    address: null,
    phone: "+260971234567",
    email: "pat@example.com",
    website: null,
    registrationNumber: null,
    leader: "Pat Applicant",
    branchCount: null,
    adminCount: null,
    organizationStatus: "submitted",
    createdAt: "2026-07-01T10:00:00.000Z",
  };
  const authorizedCandidate = {
    role: "candidate",
    type: "organization",
    publicName: "Grace Community Church",
    legalName: "Grace Community Church Ltd",
    country: null,
    province: null,
    district: null,
    town: null,
    address: null,
    phone: null,
    email: null,
    website: null,
    registrationNumber: null,
    leader: null,
    branchCount: null,
    adminCount: null,
    organizationStatus: "active",
    createdAt: "2025-01-01T10:00:00.000Z",
  };
  const riskLevel = "strong";
  return {
    ok: true,
    status: "ok",
    applicationId: APP_ID,
    matchId: MATCH_ID,
    unavailable: false,
    empty: false,
    match: {
      ...list.matches[0],
      reviewReason: null,
      reviewedByUserId: null,
      reviewedAt: null,
    },
    comparison: {
      subject: list.subject,
      candidate: list.matches[0].candidate,
      authorizedSubject,
      authorizedCandidate,
      attributes: buildComparisonAttributeRows(authorizedSubject, authorizedCandidate, [
        "exact_church_name",
      ]),
      score: 40,
      riskLevel,
      riskLabel: "High match",
      reasons: ["Exact church name match after normalization."],
      reasonTags: ["Exact name"],
      explanation: "Strong match on church name",
      reviewDecision: null,
      reviewReason: null,
      reviewedByUserId: null,
      reviewedAt: null,
      reasonRequiredForStrongMatch: true,
      decisionOptions: DECISION_OPTIONS.map((opt) => ({
        value: opt.value,
        label: opt.label,
        reasonRequired: isReasonRequired(opt.value, riskLevel),
      })),
    },
    advisory: true,
    autoMerge: false,
    autoReject: false,
    approvalGateUnchanged: true,
    listHref: `/admin/registration-applications/${APP_ID}/duplicates`,
    detailHref: `/admin/registration-applications/${APP_ID}`,
    ...overrides,
  };
}

function buildApp(overrides = {}) {
  const state = {
    listCalls: [],
    compareCalls: [],
  };

  const listFn =
    overrides.loadRegistrationDuplicateMatchesForAdmin ||
    (async (db, applicationId) => {
      state.listCalls.push({ applicationId });
      if (overrides.listImpl) return overrides.listImpl(db, applicationId);
      return sampleListPayload();
    });

  const compareFn =
    overrides.loadRegistrationDuplicateComparisonForAdmin ||
    (async (db, applicationId, matchId) => {
      state.compareCalls.push({ applicationId, matchId });
      if (overrides.compareImpl) return overrides.compareImpl(db, applicationId, matchId);
      return sampleComparePayload();
    });

  const router = createPlatformAdminRouter({
    getPool: () => ({
      query: async () => {
        throw new Error("pool.query must not be used by stubbed duplicate route tests");
      },
    }),
    isApexHost: () => true,
    env: ENV,
    findUserStatusById:
      overrides.findUserStatusById ||
      (async () => ({ id: ADMIN_ID, status: "active" })),
    listActiveAuthorizationRoles:
      overrides.listActiveAuthorizationRoles ||
      (async () => [{ roleKey: "platform_admin" }]),
    loadRegistrationDuplicateMatchesForAdmin: listFn,
    loadRegistrationDuplicateComparisonForAdmin: compareFn,
    log: () => {},
  });

  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use(simpleCookieParser);
  app.use((req, _res, next) => {
    if (overrides.unauthenticated) {
      req.v5Session = { authenticated: false, session: null };
    } else if (overrides.nonAdmin) {
      req.v5Session = {
        authenticated: true,
        session: { userId: ADMIN_ID, user: { displayName: "Member" } },
      };
    } else {
      req.v5Session = {
        authenticated: true,
        session: { userId: ADMIN_ID, user: { displayName: "Platform Admin" } },
      };
    }
    next();
  });
  app.use(router);
  return { app, state };
}

describe("registrationDuplicateMatchesAdminLoader field allowlists (Prompt 049)", () => {
  it("limits subject and candidate comparison keys to approved registration/org data", () => {
    assert.ok(SUBJECT_COMPARISON_KEYS.includes("churchName"));
    assert.ok(SUBJECT_COMPARISON_KEYS.includes("hasContactEmail"));
    assert.ok(!SUBJECT_COMPARISON_KEYS.includes("contactEmail"));
    assert.ok(!SUBJECT_COMPARISON_KEYS.includes("contactPhone"));
    assert.ok(CANDIDATE_COMPARISON_KEYS.user.includes("label"));
    assert.ok(!CANDIDATE_COMPARISON_KEYS.user.includes("email"));
    assert.ok(!CANDIDATE_COMPARISON_KEYS.organization.includes("primary_email"));
  });

  it("loadRegistrationDuplicateMatchesForAdmin rejects invalid ids without calling query service", async () => {
    let called = false;
    const result = await loadRegistrationDuplicateMatchesForAdmin({}, "not-a-uuid", {
      listDuplicateMatches: async () => {
        called = true;
        return { ok: true };
      },
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, "invalid_input");
    assert.equal(called, false);
  });

  it("loadRegistrationDuplicateComparisonForAdmin maps match_not_found", async () => {
    const result = await loadRegistrationDuplicateComparisonForAdmin({}, APP_ID, MATCH_ID, {
      getDuplicateComparison: async () => ({
        ok: false,
        status: "not_found",
        message: "match_not_found",
      }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.status, "not_found");
    assert.equal(result.message, "match_not_found");
  });

  it("returns safe unavailable fallback when list throws", async () => {
    const result = await loadRegistrationDuplicateMatchesForAdmin({}, APP_ID, {
      listDuplicateMatches: async () => {
        throw new Error("db down");
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.unavailable, true);
    assert.equal(result.empty, true);
    assert.equal(result.autoMerge, false);
    assert.equal(result.autoReject, false);
  });
});

describe("GET duplicate matches routes (Prompt 049)", () => {
  it("lists matches once through the loader and renders shell HTML", async () => {
    const { app, state } = buildApp();
    const res = await request(app)
      .get(`/admin/registration-applications/${APP_ID}/duplicates`)
      .set("Accept", "text/html");
    assert.equal(res.status, 200);
    assert.equal(state.listCalls.length, 1);
    assert.equal(state.listCalls[0].applicationId, APP_ID);
    assert.equal(state.compareCalls.length, 0);
    assert.match(res.text, /data-bb-pa-reg-duplicates="1"/);
    assert.match(res.text, /Grace Community Church/);
    assert.match(res.text, /data-bb-pa-reg-duplicate-match="1"/);
    assert.match(res.text, /Score 40/);
    assert.match(
      res.text,
      new RegExp(`/admin/registration-applications/${APP_ID}/duplicates/${MATCH_ID}`)
    );
    assert.match(res.text, /data-bb-pa-auto-merge="0"/);
    assert.match(res.text, /data-bb-pa-auto-reject="0"/);
    assert.doesNotMatch(res.text, /method="post"[^>]*duplicates/i);
    assert.doesNotMatch(res.text, /pat@example\.com/);
  });

  it("renders safe empty state when there are no matches", async () => {
    const { app } = buildApp({
      listImpl: async () =>
        sampleListPayload({
          matches: [],
          empty: true,
        }),
    });
    const res = await request(app)
      .get(`/admin/registration-applications/${APP_ID}/duplicates`)
      .set("Accept", "text/html");
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-pa-reg-duplicates-empty="1"/);
    assert.match(res.text, /data-bb-pa-reg-duplicates-empty-state="1"/);
    assert.match(res.text, /data-bb-ds="empty-state"/);
    assert.doesNotMatch(res.text, /data-bb-pa-reg-duplicate-match="1"/);
  });

  it("renders safe unavailable state when loader marks unavailable", async () => {
    const { app } = buildApp({
      listImpl: async () =>
        sampleListPayload({
          matches: [],
          empty: true,
          unavailable: true,
          subject: null,
        }),
    });
    const res = await request(app)
      .get(`/admin/registration-applications/${APP_ID}/duplicates`)
      .set("Accept", "text/html");
    assert.equal(res.status, 200);
    assert.match(res.text, /data-bb-pa-reg-duplicates-unavailable="1"/);
    assert.match(res.text, /data-bb-pa-reg-duplicates-error="1"/);
    assert.match(res.text, /data-bb-ds="error-state"/);
  });

  it("returns 400 for invalid application id", async () => {
    const { app, state } = buildApp({
      listImpl: async () => ({
        ok: false,
        status: "invalid_input",
        message: "invalid_application_id",
      }),
    });
    const res = await request(app)
      .get("/admin/registration-applications/not-a-uuid/duplicates")
      .set("Accept", "text/html");
    assert.equal(res.status, 400);
    assert.equal(state.listCalls.length, 1);
  });

  it("returns 404 when application is missing", async () => {
    const { app } = buildApp({
      listImpl: async () => ({
        ok: false,
        status: "not_found",
        message: "application_not_found",
      }),
    });
    const res = await request(app)
      .get(`/admin/registration-applications/${APP_ID}/duplicates`)
      .set("Accept", "text/html");
    assert.equal(res.status, 404);
  });

  it("requires platform admin authentication", async () => {
    const { app, state } = buildApp({ unauthenticated: true });
    const res = await request(app)
      .get(`/admin/registration-applications/${APP_ID}/duplicates`)
      .set("Accept", "text/html");
    assert.ok(res.status === 303 || res.status === 401);
    if (res.status === 303) assert.match(res.headers.location, /\/login/);
    assert.equal(state.listCalls.length, 0);
  });

  it("rejects missing platform admin role", async () => {
    const { app, state } = buildApp({
      listActiveAuthorizationRoles: async () => [{ roleKey: "church_admin" }],
    });
    const res = await request(app)
      .get(`/admin/registration-applications/${APP_ID}/duplicates`)
      .set("Accept", "text/html");
    assert.equal(res.status, 403);
    assert.equal(state.listCalls.length, 0);
  });

  it("loads comparison once and renders approved fields only", async () => {
    const { app, state } = buildApp();
    const res = await request(app)
      .get(`/admin/registration-applications/${APP_ID}/duplicates/${MATCH_ID}`)
      .set("Accept", "text/html");
    assert.equal(res.status, 200);
    assert.equal(state.compareCalls.length, 1);
    assert.equal(state.compareCalls[0].applicationId, APP_ID);
    assert.equal(state.compareCalls[0].matchId, MATCH_ID);
    assert.equal(state.listCalls.length, 0);
    assert.match(res.text, /data-bb-pa-reg-duplicate-compare="1"/);
    assert.match(res.text, /data-bb-pa-reg-duplicate-compare-subject="1"/);
    assert.match(res.text, /data-bb-pa-reg-duplicate-compare-candidate="1"/);
    assert.match(res.text, /Grace Community Church/);
    assert.match(res.text, /data-bb-pa-reg-duplicate-compare-attr="email"/);
    assert.match(res.text, /data-bb-pa-reg-duplicate-decision-form="1"/);
    assert.match(
      res.text,
      new RegExp(
        `action="/admin/registration-applications/${APP_ID}/duplicates/${MATCH_ID}/decision"`
      )
    );
    assert.match(res.text, /name="_csrf"/);
    assert.match(res.text, /value="different_church"/);
    assert.match(res.text, /value="confirmed_duplicate"/);
    assert.match(res.text, /data-bb-pa-auto-merge="0"/);
    assert.match(res.text, /data-bb-pa-unavailable="auto-merge"/);
    assert.doesNotMatch(res.text, /data-bb-pa-unavailable="decision-post"/);
  });

  it("redirects invalid match to duplicates list", async () => {
    const { app } = buildApp({
      compareImpl: async () => ({
        ok: false,
        status: "not_found",
        message: "match_not_found",
      }),
    });
    const res = await request(app)
      .get(`/admin/registration-applications/${APP_ID}/duplicates/${OTHER_MATCH}`)
      .set("Accept", "text/html");
    assert.equal(res.status, 303);
    assert.equal(
      res.headers.location,
      `/admin/registration-applications/${APP_ID}/duplicates`
    );
  });

  it("returns 400 for invalid match id", async () => {
    const { app } = buildApp({
      compareImpl: async () => ({
        ok: false,
        status: "invalid_input",
        message: "invalid_ids",
      }),
    });
    const res = await request(app)
      .get(`/admin/registration-applications/${APP_ID}/duplicates/not-a-uuid`)
      .set("Accept", "text/html");
    assert.equal(res.status, 400);
  });

  it("registers GET duplicates routes and decision POST", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../src/platform/http/platformAdminRoutes.js"),
      "utf8"
    );
    assert.match(source, /\/admin\/registration-applications\/:id\/duplicates"/);
    assert.match(
      source,
      /\/admin\/registration-applications\/:id\/duplicates\/:matchId"/
    );
    assert.match(
      source,
      /\/admin\/registration-applications\/:id\/duplicates\/:matchId\/decision/
    );
    assert.match(source, /loadRegistrationDuplicateMatchesForAdminFn/);
    assert.match(source, /loadRegistrationDuplicateComparisonForAdminFn/);
    assert.match(source, /recordDuplicateMatchReviewDecisionFn/);
  });
});
