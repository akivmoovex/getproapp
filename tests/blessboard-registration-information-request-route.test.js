"use strict";

/**
 * Phase2 Prompt 064 — POST request-information route (stubbed deps; no PostgreSQL).
 */

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const express = require("express");
const request = require("supertest");
const fs = require("node:fs");
const path = require("node:path");

const {
  createPlatformAdminRouter,
  parseInformationRequestForm,
  mapInformationRequestError,
} = require("../src/platform/http/platformAdminRoutes");
const { CSRF_FIELD, CSRF_COOKIE, issueCsrfToken } = require("../src/platform/http/v5Csrf");

const APP_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OTHER_APP_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
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

function baseBody(overrides = {}) {
  return {
    recipient: "pastor@example.org",
    subject: "Need documents",
    applicant_message: "Please upload your certificate.",
    internal_note: "Waiting on docs",
    request_category: "upload_registration_document",
    requested_fields: "registration_number,city",
    requested_documents: "certificate",
    response_due_at: "2026-08-01T12:00:00.000Z",
    channel: "email",
    ...overrides,
  };
}

function buildApp(overrides = {}) {
  const state = {
    recordCalls: [],
    followUpCalls: [],
    findCalls: [],
    applicationRow: {
      id: APP_ID,
      application_status: "submitted",
      provisioning_status: "not_started",
      follow_up_status: "contact_pending",
    },
  };

  const recordFn =
    overrides.recordInformationRequest ||
    (async (input, context, deps) => {
      state.recordCalls.push({ input, context, deps });
      if (overrides.recordImpl) return overrides.recordImpl(input, context, deps);
      return {
        recorded: true,
        communication: {
          communicationType: "information_request",
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
    });

  const followUpFn =
    overrides.updateApplicationSupportFollowUp ||
    (async (client, applicationId, patch) => {
      state.followUpCalls.push({ applicationId, patch });
      return { id: applicationId, follow_up_status: patch.followUpStatus };
    });

  const findFn =
    overrides.findRegistrationApplicationById ||
    (async (_db, id) => {
      state.findCalls.push(id);
      if (overrides.missingApplication) return null;
      return { ...state.applicationRow, id };
    });

  const router = createPlatformAdminRouter({
    getPool: () => ({
      query: async () => {
        throw new Error("pool.query must not be used by stubbed request-information route tests");
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
    findRegistrationApplicationById: findFn,
    recordInformationRequest: recordFn,
    updateApplicationSupportFollowUp: followUpFn,
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
      // Force non-admin roles
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

async function postRequest(app, { csrf = true, applicationId = APP_ID, body = {} } = {}) {
  const token = issueCsrfToken(ENV);
  const req = request(app)
    .post(`/admin/registration-applications/${applicationId}/request-information`)
    .type("form");
  if (csrf) {
    req.set("Cookie", `${CSRF_COOKIE}=${token}`);
    return req.send({ ...baseBody(body), [CSRF_FIELD]: token });
  }
  return req.send(baseBody(body));
}

describe("POST request-information route (Prompt 064)", () => {
  it("parses form fields without accepting application or admin IDs from body", () => {
    const parsed = parseInformationRequestForm(
      {
        ...baseBody(),
        application_id: OTHER_APP_ID,
        applicationId: OTHER_APP_ID,
        platform_admin_user_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        actorUserId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      },
      APP_ID
    );
    assert.equal(parsed.ok, true);
    assert.equal(parsed.input.applicationId, APP_ID);
    assert.equal(parsed.input.applicantMessage, "Please upload your certificate.");
    assert.equal(parsed.input.internalNote, "Waiting on docs");
    assert.deepEqual(parsed.input.requestedFields, ["registration_number", "city"]);
    assert.deepEqual(parsed.input.requestedDocuments, ["certificate"]);
    assert.equal(Object.prototype.hasOwnProperty.call(parsed.input, "actorUserId"), false);
  });

  it("maps validation and not-found errors safely", () => {
    assert.equal(mapInformationRequestError(new Error("recipient_required")), "invalid");
    assert.equal(mapInformationRequestError(new Error("invalid_email_recipient")), "invalid");
    assert.equal(mapInformationRequestError(new Error("not_found")), "not_found");
    assert.equal(
      mapInformationRequestError(new Error("email_sending_unavailable")),
      "sending_unavailable"
    );
    assert.equal(mapInformationRequestError(new Error("boom")), "information_request_failed");
  });

  it("requires platform admin authorization", async () => {
    const { app } = buildApp({
      unauthenticated: true,
      listActiveAuthorizationRoles: async () => [],
    });
    const res = await postRequest(app);
    assert.ok([303, 401, 403].includes(res.status));
    if (res.status === 303) {
      assert.match(String(res.headers.location || ""), /\/login/);
    }
  });

  it("rejects non-admin roles", async () => {
    const { app } = buildApp({
      nonAdmin: true,
      listActiveAuthorizationRoles: async () => [{ roleKey: "member" }],
    });
    const res = await postRequest(app);
    assert.ok([303, 401, 403].includes(res.status));
  });

  it("requires CSRF", async () => {
    const { app, state } = buildApp();
    const res = await postRequest(app, { csrf: false });
    assert.equal(res.status, 303);
    assert.match(
      String(res.headers.location || ""),
      /\/request-information\?error=csrf/
    );
    assert.equal(state.recordCalls.length, 0);
  });

  it("calls recordInformationRequest once and updates follow-up with review event", async () => {
    const { app, state } = buildApp();
    const res = await postRequest(app);
    assert.equal(res.status, 303);
    assert.match(
      String(res.headers.location || ""),
      new RegExp(
        `/admin/registration-applications/${APP_ID}/information-requested\\?notice=information_requested`
      )
    );
    assert.equal(state.recordCalls.length, 1);
    assert.equal(state.recordCalls[0].input.applicationId, APP_ID);
    assert.equal(state.recordCalls[0].context.platformAdminUserId, ADMIN_ID);
    assert.equal(state.recordCalls[0].input.applicantMessage, "Please upload your certificate.");
    assert.equal(state.recordCalls[0].input.internalNote, "Waiting on docs");
    assert.equal(state.followUpCalls.length, 1);
    assert.equal(state.followUpCalls[0].patch.followUpStatus, "awaiting_customer");
    assert.equal(state.followUpCalls[0].patch.reviewEvent.action, "information_requested");
    assert.equal(state.followUpCalls[0].patch.reviewEvent.delivery_status, "sending_unavailable");
    assert.ok(!("applicationStatus" in (state.followUpCalls[0].patch || {})));
  });

  it("preserves safe delivery state without claiming sent", async () => {
    const { app, state } = buildApp();
    const res = await postRequest(app);
    assert.equal(res.status, 303);
    assert.doesNotMatch(String(res.headers.location || ""), /sent/i);
    assert.equal(state.recordCalls[0].input.channel, "email");
    assert.equal(
      state.followUpCalls[0].patch.reviewEvent.delivery_status,
      "sending_unavailable"
    );
  });

  it("returns not_found when application is missing", async () => {
    const { app, state } = buildApp({ missingApplication: true });
    const res = await postRequest(app);
    assert.equal(res.status, 303);
    assert.match(String(res.headers.location || ""), /error=not_found/);
    assert.equal(state.recordCalls.length, 0);
  });

  it("maps service validation failures to invalid", async () => {
    const { app, state } = buildApp({
      recordImpl: async () => {
        throw new Error("recipient_required");
      },
    });
    const res = await postRequest(app);
    assert.equal(res.status, 303);
    assert.match(String(res.headers.location || ""), /\/request-information\?error=invalid/);
    assert.equal(state.recordCalls.length, 1);
    assert.equal(state.followUpCalls.length, 0);
  });

  it("maps unexpected failures safely without leaking provider text", async () => {
    const { app } = buildApp({
      recordImpl: async () => {
        throw new Error("SMTP password=hunter2 connection refused");
      },
    });
    const res = await postRequest(app);
    assert.equal(res.status, 303);
    assert.match(
      String(res.headers.location || ""),
      /\/request-information\?error=information_request_failed/
    );
    assert.doesNotMatch(String(res.headers.location || ""), /hunter2|SMTP/i);
  });

  it("registers the request-information route in platformAdminRoutes", () => {
    const src = fs.readFileSync(
      path.join(__dirname, "../src/platform/http/platformAdminRoutes.js"),
      "utf8"
    );
    assert.match(
      src,
      /\/admin\/registration-applications\/:id\/request-information/
    );
    assert.match(src, /recordInformationRequest/);
    assert.match(src, /awaiting_customer/);
    assert.match(src, /information_requested/);
    assert.doesNotMatch(
      src,
      /application_status:\s*["']awaiting_customer["']/
    );
  });
});
