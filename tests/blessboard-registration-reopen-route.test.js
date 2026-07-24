"use strict";

/**
 * Phase2 Prompt 071 — POST reopen route (stubbed deps; no PostgreSQL).
 */

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const express = require("express");
const request = require("supertest");
const fs = require("node:fs");
const path = require("node:path");

const {
  createPlatformAdminRouter,
  parseReopenForm,
  mapReopenRouteError,
} = require("../src/platform/http/platformAdminRoutes");
const {
  STATUS: REG_APP_STATUS,
} = require("../src/blessboard/services/registrationApplicationsAdminService");
const { CSRF_FIELD, CSRF_COOKIE, issueCsrfToken } = require("../src/platform/http/v5Csrf");

const APP_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const ADMIN_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ENV = {
  NODE_ENV: "test",
  SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
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
  const state = {
    reopenCalls: [],
  };

  const reopenFn =
    overrides.reopenRegistrationApplication ||
    (async (db, input) => {
      state.reopenCalls.push({ input });
      if (overrides.reopenImpl) return overrides.reopenImpl(db, input);
      return {
        ok: true,
        status: REG_APP_STATUS.OK,
        applicationStatus: "submitted",
        fromStatus: "rejected",
      };
    });

  const router = createPlatformAdminRouter({
    getPool: () => ({
      query: async () => {
        throw new Error("pool.query must not be used by stubbed reopen route tests");
      },
    }),
    isApexHost: () => (overrides.nonApex ? false : true),
    env: ENV,
    findUserStatusById:
      overrides.findUserStatusById ||
      (async () => ({ id: ADMIN_ID, status: "active" })),
    listActiveAuthorizationRoles:
      overrides.listActiveAuthorizationRoles ||
      (async () => [{ roleKey: "platform_admin" }]),
    reopenRegistrationApplication: reopenFn,
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

async function postReopen(app, body, { csrf = true } = {}) {
  const token = issueCsrfToken(ENV);
  const req = request(app)
    .post(`/admin/registration-applications/${APP_ID}/reopen`)
    .type("form");
  if (csrf) {
    req.set("Cookie", `${CSRF_COOKIE}=${token}`);
    return req.send({ ...body, [CSRF_FIELD]: token });
  }
  return req.send(body);
}

describe("parseReopenForm (Prompt 071)", () => {
  it("requires reopen reason and never takes admin id from the form", () => {
    const ok = parseReopenForm({ reopen_reason: "Clarifying documents received" }, APP_ID);
    assert.equal(ok.ok, true);
    assert.equal(ok.input.applicationId, APP_ID);
    assert.equal(ok.input.reason, "Clarifying documents received");
    assert.equal(Object.prototype.hasOwnProperty.call(ok.input, "platformAdminUserId"), false);

    const short = parseReopenForm({ reopen_reason: "ab" }, APP_ID);
    assert.equal(short.ok, false);
    assert.equal(short.code, "reopen_reason_required");

    const spoof = parseReopenForm(
      {
        reopen_reason: "Valid reopen reason text",
        platform_admin_user_id: "spoofed",
        application_status: "submitted",
      },
      APP_ID
    );
    assert.equal(spoof.ok, true);
    assert.equal(Object.prototype.hasOwnProperty.call(spoof.input, "applicationStatus"), false);
    assert.equal(Object.keys(spoof.input).sort().join(","), "applicationId,reason");
  });
});

describe("mapReopenRouteError (Prompt 071)", () => {
  it("maps service failures to safe codes", () => {
    assert.equal(mapReopenRouteError({ status: REG_APP_STATUS.NOT_FOUND }), "not_found");
    assert.equal(
      mapReopenRouteError({ status: REG_APP_STATUS.NOT_ELIGIBLE, message: "not_eligible" }),
      "not_eligible"
    );
    assert.equal(
      mapReopenRouteError({
        status: REG_APP_STATUS.INVALID_INPUT,
        message: "reopen_reason_required",
      }),
      "invalid"
    );
    assert.equal(mapReopenRouteError({ status: REG_APP_STATUS.LOOKUP_ERROR }), "reopen_failed");
  });
});

describe("POST /admin/registration-applications/:id/reopen (Prompt 071)", () => {
  it("requires apex + platform admin", async () => {
    const unauth = buildApp({ unauthenticated: true });
    const unauthRes = await postReopen(unauth.app, {
      reopen_reason: "Clarifying documents received",
    });
    assert.ok([303, 401, 403].includes(unauthRes.status));
    if (unauthRes.status === 303) {
      assert.match(String(unauthRes.headers.location || ""), /\/login/);
    }

    const nonAdmin = buildApp({
      nonAdmin: true,
      listActiveAuthorizationRoles: async () => [{ roleKey: "church_admin" }],
    });
    const denied = await postReopen(nonAdmin.app, {
      reopen_reason: "Clarifying documents received",
    });
    assert.ok([401, 403, 303].includes(denied.status));

    const nonApex = buildApp({ nonApex: true });
    const apexDenied = await postReopen(nonApex.app, {
      reopen_reason: "Clarifying documents received",
    });
    assert.ok(apexDenied.status === 503 || apexDenied.status >= 400);
  });

  it("requires CSRF", async () => {
    const { app } = buildApp();
    const res = await postReopen(app, { reopen_reason: "Clarifying documents received" }, {
      csrf: false,
    });
    assert.equal(res.status, 303);
    assert.match(String(res.headers.location || ""), /error=csrf#reg-rejection/);
  });

  it("requires reason and maps invalid status safely", async () => {
    const missing = buildApp();
    const missingRes = await postReopen(missing.app, { reopen_reason: "" });
    assert.equal(missingRes.status, 303);
    assert.match(String(missingRes.headers.location || ""), /error=invalid#reg-rejection/);

    const { app, state } = buildApp({
      reopenImpl: async () => ({
        ok: false,
        status: REG_APP_STATUS.NOT_ELIGIBLE,
        message: "not_eligible",
      }),
    });
    const badStatus = await postReopen(app, {
      reopen_reason: "Trying to reopen a submitted application",
    });
    assert.equal(badStatus.status, 303);
    assert.match(String(badStatus.headers.location || ""), /error=not_eligible#reg-rejection/);
    assert.equal(state.reopenCalls.length, 1);
  });

  it("passes session admin + route id, redirects with application_reopened notice", async () => {
    const { app, state } = buildApp();
    const res = await postReopen(app, {
      reopen_reason: "Clarifying documents received",
      platform_admin_user_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      application_status: "submitted",
    });
    assert.equal(res.status, 303);
    assert.equal(
      String(res.headers.location || ""),
      `/admin/registration-applications/${APP_ID}?notice=application_reopened`
    );
    assert.equal(state.reopenCalls.length, 1);
    assert.equal(state.reopenCalls[0].input.applicationId, APP_ID);
    assert.equal(state.reopenCalls[0].input.platformAdminUserId, ADMIN_ID);
    assert.equal(state.reopenCalls[0].input.reason, "Clarifying documents received");
    assert.equal(
      Object.prototype.hasOwnProperty.call(state.reopenCalls[0].input, "applicationStatus"),
      false
    );
  });

  it("registers reopen route in source without email side effects", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/platform/http/platformAdminRoutes.js"),
      "utf8"
    );
    assert.match(src, /\/admin\/registration-applications\/:id\/reopen/);
    assert.match(src, /notice=application_reopened/);
    assert.match(src, /parseReopenForm/);
    const reopenHandler = src.slice(
      src.indexOf('"/admin/registration-applications/:id/reopen"'),
      src.indexOf('"/admin/registration-applications/:id/approve"')
    );
    assert.doesNotMatch(reopenHandler, /sendMail|emailAdapter|recordRejectionNotice|notify/i);
  });
});
