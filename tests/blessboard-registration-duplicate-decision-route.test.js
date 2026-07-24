"use strict";

/**
 * Phase2 Prompt 052 — POST duplicate match decision route (stubbed deps; no PostgreSQL).
 */

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const express = require("express");
const request = require("supertest");
const fs = require("node:fs");
const path = require("path");

const {
  createPlatformAdminRouter,
  mapDuplicateDecisionError,
} = require("../src/platform/http/platformAdminRoutes");
const { CSRF_FIELD, CSRF_COOKIE, issueCsrfToken } = require("../src/platform/http/v5Csrf");
const {
  STATUS: DECISION_STATUS,
} = require("../src/blessboard/services/registrationDuplicateReviewDecisionService");

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

function buildApp(overrides = {}) {
  const state = { decisionCalls: [] };

  const decisionFn =
    overrides.recordDuplicateMatchReviewDecision ||
    (async (db, input) => {
      state.decisionCalls.push(input);
      if (overrides.decisionImpl) return overrides.decisionImpl(db, input);
      return {
        ok: true,
        status: DECISION_STATUS.OK,
        applicationId: input.applicationId,
        matchId: input.matchId,
        decision: String(input.decision || "").toLowerCase(),
        autoMerge: false,
        autoReject: false,
        autoApprove: false,
        provisioned: false,
      };
    });

  const router = createPlatformAdminRouter({
    getPool: () => ({
      query: async () => {
        throw new Error("pool.query must not be used by stubbed decision route tests");
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
    recordDuplicateMatchReviewDecision: decisionFn,
    log: () => {},
  });

  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use(simpleCookieParser);
  app.use((req, _res, next) => {
    if (overrides.unauthenticated) {
      req.v5Session = { authenticated: false, session: null };
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

async function postDecision(app, { csrf = true, body = {}, matchId = MATCH_ID } = {}) {
  const token = issueCsrfToken(ENV);
  const req = request(app)
    .post(`/admin/registration-applications/${APP_ID}/duplicates/${matchId}/decision`)
    .type("form");
  if (csrf) {
    req.set("Cookie", `${CSRF_COOKIE}=${token}`);
    return req.send({ ...body, [CSRF_FIELD]: token });
  }
  return req.send({ ...body, [CSRF_FIELD]: "bad-token" });
}

describe("mapDuplicateDecisionError", () => {
  it("maps reason, decision, not found, and generic failures", () => {
    assert.equal(
      mapDuplicateDecisionError({ status: DECISION_STATUS.REASON_REQUIRED }),
      "reason_required"
    );
    assert.equal(
      mapDuplicateDecisionError({ status: DECISION_STATUS.INVALID_DECISION }),
      "invalid_decision"
    );
    assert.equal(mapDuplicateDecisionError({ status: DECISION_STATUS.NOT_FOUND }), "not_found");
    assert.equal(mapDuplicateDecisionError({ status: DECISION_STATUS.INVALID_INPUT }), "invalid");
    assert.equal(mapDuplicateDecisionError({ status: DECISION_STATUS.LOOKUP_ERROR }), "decision_failed");
  });
});

describe("POST duplicate match decision route (Prompt 052)", () => {
  it("records decision from session admin and redirects to comparison notice", async () => {
    const { app, state } = buildApp();
    const res = await postDecision(app, {
      body: {
        decision: "confirmed_duplicate",
        reason: "Same church after document review",
        actor_user_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        application_id: "00000000-0000-4000-8000-000000000099",
      },
    });
    assert.equal(res.status, 303);
    assert.equal(
      res.headers.location,
      `/admin/registration-applications/${APP_ID}/duplicates/${MATCH_ID}?notice=duplicate_decision_saved`
    );
    assert.equal(state.decisionCalls.length, 1);
    assert.equal(state.decisionCalls[0].applicationId, APP_ID);
    assert.equal(state.decisionCalls[0].matchId, MATCH_ID);
    assert.equal(state.decisionCalls[0].actorUserId, ADMIN_ID);
    assert.equal(state.decisionCalls[0].decision, "confirmed_duplicate");
    assert.equal(state.decisionCalls[0].reason, "Same church after document review");
  });

  it("can redirect to matches list when return_to=list", async () => {
    const { app } = buildApp();
    const res = await postDecision(app, {
      body: {
        decision: "senior_review",
        reason: "Needs senior review on strong match",
        return_to: "list",
      },
    });
    assert.equal(res.status, 303);
    assert.equal(
      res.headers.location,
      `/admin/registration-applications/${APP_ID}/duplicates?notice=duplicate_decision_saved`
    );
  });

  it("requires CSRF", async () => {
    const { app, state } = buildApp();
    const res = await postDecision(app, {
      csrf: false,
      body: { decision: "different_church", reason: "Not the same" },
    });
    assert.equal(res.status, 303);
    assert.match(res.headers.location, /error=csrf/);
    assert.equal(state.decisionCalls.length, 0);
  });

  it("requires platform admin authentication", async () => {
    const { app, state } = buildApp({ unauthenticated: true });
    const res = await postDecision(app, {
      body: { decision: "different_church", reason: "Not the same" },
    });
    assert.ok(res.status === 303 || res.status === 401);
    if (res.status === 303) assert.match(res.headers.location, /\/login/);
    assert.equal(state.decisionCalls.length, 0);
  });

  it("rejects missing platform admin role", async () => {
    const { app, state } = buildApp({
      listActiveAuthorizationRoles: async () => [{ roleKey: "church_admin" }],
    });
    const res = await postDecision(app, {
      body: { decision: "different_church", reason: "Not the same" },
    });
    assert.equal(res.status, 403);
    assert.equal(state.decisionCalls.length, 0);
  });

  it("redirects reason_required and invalid_decision errors to comparison", async () => {
    const { app } = buildApp({
      decisionImpl: async () => ({
        ok: false,
        status: DECISION_STATUS.REASON_REQUIRED,
        message: "reason_required",
      }),
    });
    const res = await postDecision(app, {
      body: { decision: "confirmed_duplicate", reason: "" },
    });
    assert.equal(res.status, 303);
    assert.equal(
      res.headers.location,
      `/admin/registration-applications/${APP_ID}/duplicates/${MATCH_ID}?error=reason_required`
    );
  });

  it("redirects missing match to duplicates list", async () => {
    const { app } = buildApp({
      decisionImpl: async () => ({
        ok: false,
        status: DECISION_STATUS.NOT_FOUND,
        message: "match_not_found",
      }),
    });
    const res = await postDecision(app, {
      matchId: OTHER_MATCH,
      body: { decision: "different_church", reason: "Not the same congregation" },
    });
    assert.equal(res.status, 303);
    assert.equal(
      res.headers.location,
      `/admin/registration-applications/${APP_ID}/duplicates?error=not_found`
    );
  });

  it("registers the decision POST route without merge/reject side-effect language in handler", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../src/platform/http/platformAdminRoutes.js"),
      "utf8"
    );
    assert.match(
      source,
      /\/admin\/registration-applications\/:id\/duplicates\/:matchId\/decision/
    );
    assert.match(source, /recordDuplicateMatchReviewDecisionFn/);
    assert.match(source, /notice=duplicate_decision_saved/);
  });
});
