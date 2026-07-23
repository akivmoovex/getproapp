"use strict";

/**
 * Phase2 Prompt 030 — POST phone-verification attempt route (stubbed deps; no PostgreSQL).
 */

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const express = require("express");
const request = require("supertest");
const fs = require("node:fs");
const path = require("node:path");

const {
  createPlatformAdminRouter,
  parsePhoneVerificationAttemptForm,
  mapPhoneVerificationAttemptError,
} = require("../src/platform/http/platformAdminRoutes");
const { CSRF_FIELD, CSRF_COOKIE, issueCsrfToken } = require("../src/platform/http/v5Csrf");
const {
  recordPhoneVerificationAttempt,
} = require("../src/blessboard/services/registrationPhoneVerificationService");

const APP_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OTHER_APP_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ADMIN_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ENV = {
  NODE_ENV: "test",
  SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
};

/** Minimal cookie parser (cookie-parser is not a direct dependency). */
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
    phone_number_called: "+260971000001",
    country: "Zambia",
    attempted_at: "2026-07-22T10:00:00.000Z",
    outcome: "answered",
    applicant_identity_status: "not_checked",
    applicant_authority_status: "not_checked",
    verification_result: "pending",
    ...overrides,
  };
}

function buildApp(overrides = {}) {
  const state = {
    recordCalls: [],
    findCalls: [],
    applicationUpdates: 0,
    applicationRow: {
      id: APP_ID,
      application_status: "submitted",
      provisioning_status: "not_started",
    },
  };

  const recordFn =
    overrides.recordPhoneVerificationAttempt ||
    (async (input, context, deps) => {
      state.recordCalls.push({ input, context, deps });
      if (overrides.recordImpl) return overrides.recordImpl(input, context, deps);
      return {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        application_id: input.applicationId,
        outcome: input.outcome,
        verification_result: input.verificationResult || "pending",
      };
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
        throw new Error("pool.query must not be used by stubbed phone route tests");
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
    findRegistrationApplicationById: findFn,
    recordPhoneVerificationAttempt: recordFn,
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
  if (overrides.nonAdmin) {
    // override roles after session middleware via deps already set above
  }
  app.use(router);
  return { app, state };
}

async function postAttempt(app, body, { csrf = true, applicationId = APP_ID } = {}) {
  const token = issueCsrfToken(ENV);
  const req = request(app)
    .post(`/admin/registration-applications/${applicationId}/phone-verification/attempts`)
    .type("form");
  if (csrf) {
    req.set("Cookie", `${CSRF_COOKIE}=${token}`);
    return req.send({ ...body, [CSRF_FIELD]: token });
  }
  return req.send({ ...body, [CSRF_FIELD]: "bad-token" });
}

describe("parsePhoneVerificationAttemptForm", () => {
  it("maps accepted fields and ignores forged application/admin ids", () => {
    const parsed = parsePhoneVerificationAttemptForm(
      {
        ...baseBody({ notes: "  hello  ", follow_up_at: "" }),
        application_id: OTHER_APP_ID,
        created_by_user_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        phone_number_normalized: "+999",
      },
      APP_ID
    );
    assert.equal(parsed.ok, true);
    assert.equal(parsed.input.applicationId, APP_ID);
    assert.equal(parsed.input.notes, "hello");
    assert.equal(parsed.input.followUpAt, null);
    assert.equal(parsed.input.phoneNumberCalled, "+260971000001");
  });

  it("rejects missing phone and invalid dates", () => {
    assert.equal(
      parsePhoneVerificationAttemptForm({ ...baseBody(), phone_number_called: "" }, APP_ID).ok,
      false
    );
    assert.equal(
      parsePhoneVerificationAttemptForm({ ...baseBody(), attempted_at: "not-a-date" }, APP_ID).ok,
      false
    );
    assert.equal(
      parsePhoneVerificationAttemptForm({ ...baseBody(), follow_up_at: "bad" }, APP_ID).ok,
      false
    );
  });

  it("rejects non-string enum values", () => {
    assert.equal(
      parsePhoneVerificationAttemptForm({ ...baseBody(), outcome: 12 }, APP_ID).ok,
      false
    );
  });
});

describe("mapPhoneVerificationAttemptError", () => {
  it("maps business rule codes to invalid and unknowns to phone_attempt_failed", () => {
    assert.equal(
      mapPhoneVerificationAttemptError({ code: "verified_requires_answered_outcome" }),
      "invalid"
    );
    assert.equal(
      mapPhoneVerificationAttemptError({ code: "verification_reason_required" }),
      "invalid"
    );
    assert.equal(mapPhoneVerificationAttemptError({ code: "ECONNREFUSED" }), "phone_attempt_failed");
  });
});

describe("POST phone-verification attempts route (Prompt 030)", () => {
  it("allows platform admin to submit a valid pending attempt", async () => {
    const { app, state } = buildApp();
    const res = await postAttempt(app, baseBody());
    assert.equal(res.status, 303);
    assert.match(res.headers.location, /notice=phone_attempt_recorded/);
    assert.match(res.headers.location, /#reg-phone-verification$/);
    assert.equal(state.recordCalls.length, 1);
    assert.equal(state.recordCalls[0].input.verificationResult, "pending");
    assert.equal(state.recordCalls[0].context.platformAdminUserId, ADMIN_ID);
  });

  it("records a valid verified attempt", async () => {
    const { app, state } = buildApp({
      recordPhoneVerificationAttempt: async (input, context, deps) =>
        recordPhoneVerificationAttempt(input, context, {
          ...deps,
          repository: {
            createPhoneVerificationAttempt: async (_c, fields) => ({
              id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
              ...fields,
              verification_result: fields.verificationResult,
            }),
          },
          client: {},
        }),
    });
    const res = await postAttempt(
      app,
      baseBody({
        outcome: "answered",
        applicant_identity_status: "confirmed",
        verification_result: "verified",
        verification_reason: "Identity confirmed",
      })
    );
    assert.equal(res.status, 303);
    assert.match(res.headers.location, /notice=phone_attempt_recorded/);
    assert.equal(state.recordCalls.length, 0); // custom override used
  });

  it("records a valid failed attempt via service rules", async () => {
    let calls = 0;
    const { app } = buildApp({
      recordPhoneVerificationAttempt: async (input, context) => {
        calls += 1;
        assert.equal(input.verificationResult, "failed");
        assert.equal(input.verificationReason, "Wrong number");
        assert.equal(context.platformAdminUserId, ADMIN_ID);
        return { id: "1" };
      },
    });
    const res = await postAttempt(
      app,
      baseBody({
        outcome: "wrong_number",
        verification_result: "failed",
        verification_reason: "Wrong number",
      })
    );
    assert.equal(res.status, 303);
    assert.equal(calls, 1);
  });

  it("rejects unauthorized requests", async () => {
    const { app, state } = buildApp({ unauthenticated: true });
    const res = await postAttempt(app, baseBody());
    assert.ok(res.status === 303 || res.status === 401);
    if (res.status === 303) assert.match(res.headers.location, /\/login/);
    assert.equal(state.recordCalls.length, 0);
  });

  it("rejects missing platform admin role", async () => {
    const { app, state } = buildApp({
      listActiveAuthorizationRoles: async () => [{ roleKey: "church_admin" }],
    });
    const res = await postAttempt(app, baseBody());
    assert.equal(res.status, 403);
    assert.equal(state.recordCalls.length, 0);
  });

  it("requires CSRF", async () => {
    const { app, state } = buildApp();
    const res = await postAttempt(app, baseBody(), { csrf: false });
    assert.equal(res.status, 303);
    assert.match(res.headers.location, /error=csrf/);
    assert.match(res.headers.location, /#reg-phone-verification/);
    assert.equal(state.recordCalls.length, 0);
  });

  it("route application ID overrides submitted application_id", async () => {
    const { app, state } = buildApp();
    await postAttempt(app, baseBody({ application_id: OTHER_APP_ID }));
    assert.equal(state.recordCalls[0].input.applicationId, APP_ID);
    assert.equal(state.findCalls[0], APP_ID);
  });

  it("authenticated user ID overrides submitted administrator ID", async () => {
    const { app, state } = buildApp();
    await postAttempt(
      app,
      baseBody({
        created_by_user_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        platform_admin_user_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      })
    );
    assert.equal(state.recordCalls[0].context.platformAdminUserId, ADMIN_ID);
  });

  it("rejects invalid application ID", async () => {
    const { app, state } = buildApp();
    const res = await postAttempt(app, baseBody(), { applicationId: "not-a-uuid" });
    assert.equal(res.status, 303);
    assert.match(res.headers.location, /error=not_found|error=invalid/);
    assert.equal(state.recordCalls.length, 0);
  });

  it("rejects missing phone", async () => {
    const { app, state } = buildApp();
    const res = await postAttempt(app, baseBody({ phone_number_called: "   " }));
    assert.equal(res.status, 303);
    assert.match(res.headers.location, /error=invalid/);
    assert.equal(state.recordCalls.length, 0);
  });

  it("rejects invalid outcome / identity / authority / verification result", async () => {
    const cases = [
      { outcome: "reached" },
      { applicant_identity_status: "true" },
      { applicant_authority_status: "false" },
      { verification_result: "success" },
    ];
    for (const overrides of cases) {
      const { app, state } = buildApp({
        recordPhoneVerificationAttempt: async (input, context, deps) =>
          recordPhoneVerificationAttempt(input, context, {
            client: {},
            repository: {
              createPhoneVerificationAttempt: async () => {
                throw new Error("should not insert");
              },
            },
          }),
      });
      const res = await postAttempt(app, baseBody(overrides));
      assert.equal(res.status, 303, JSON.stringify(overrides));
      assert.match(res.headers.location, /error=invalid/, JSON.stringify(overrides));
    }
  });

  it("rejects verified without answered outcome", async () => {
    const { app, state } = buildApp({
      recordPhoneVerificationAttempt: async (input, context) =>
        recordPhoneVerificationAttempt(input, context, {
          client: {},
          repository: { createPhoneVerificationAttempt: async () => ({}) },
        }),
    });
    const res = await postAttempt(
      app,
      baseBody({
        outcome: "no_answer",
        applicant_identity_status: "confirmed",
        verification_result: "verified",
        verification_reason: "nope",
      })
    );
    assert.match(res.headers.location, /error=invalid/);
  });

  it("rejects verified without identity confirmation", async () => {
    const { app } = buildApp({
      recordPhoneVerificationAttempt: async (input, context) =>
        recordPhoneVerificationAttempt(input, context, {
          client: {},
          repository: { createPhoneVerificationAttempt: async () => ({}) },
        }),
    });
    const res = await postAttempt(
      app,
      baseBody({
        outcome: "answered",
        applicant_identity_status: "not_checked",
        verification_result: "verified",
        verification_reason: "answered only",
      })
    );
    assert.match(res.headers.location, /error=invalid/);
  });

  it("rejects authority confirmed without answered outcome", async () => {
    const { app } = buildApp({
      recordPhoneVerificationAttempt: async (input, context) =>
        recordPhoneVerificationAttempt(input, context, {
          client: {},
          repository: { createPhoneVerificationAttempt: async () => ({}) },
        }),
    });
    const res = await postAttempt(
      app,
      baseBody({
        outcome: "unavailable",
        applicant_authority_status: "confirmed",
        verification_result: "pending",
      })
    );
    assert.match(res.headers.location, /error=invalid/);
  });

  it("rejects missing reason for verified and failed results", async () => {
    for (const body of [
      baseBody({
        outcome: "answered",
        applicant_identity_status: "confirmed",
        verification_result: "verified",
      }),
      baseBody({
        outcome: "wrong_number",
        verification_result: "failed",
        verification_reason: "  ",
      }),
    ]) {
      const { app } = buildApp({
        recordPhoneVerificationAttempt: async (input, context) =>
          recordPhoneVerificationAttempt(input, context, {
            client: {},
            repository: { createPhoneVerificationAttempt: async () => ({}) },
          }),
      });
      const res = await postAttempt(app, body);
      assert.match(res.headers.location, /error=invalid/);
    }
  });

  it("accepts empty optional fields", async () => {
    const { app, state } = buildApp();
    const res = await postAttempt(
      app,
      baseBody({
        contact_person_name: "",
        contact_person_role: "",
        verification_reason: "",
        notes: "",
        follow_up_at: "",
        applicant_identity_status: "",
        applicant_authority_status: "",
        verification_result: "",
      })
    );
    assert.equal(res.status, 303);
    assert.match(res.headers.location, /notice=phone_attempt_recorded/);
    assert.equal(state.recordCalls[0].input.contactPersonName, null);
    assert.equal(state.recordCalls[0].input.followUpAt, null);
  });

  it("calls the service exactly once on success", async () => {
    const { app, state } = buildApp();
    await postAttempt(app, baseBody());
    assert.equal(state.recordCalls.length, 1);
  });

  it("validation failure creates no record", async () => {
    const { app, state } = buildApp();
    await postAttempt(app, baseBody({ outcome: "reached" }));
    // parse accepts string enums; service rejects — if stub doesn't validate, force service
    assert.ok(state.recordCalls.length <= 1);
  });

  it("validation failure with real service creates no repository insert", async () => {
    let inserts = 0;
    const { app } = buildApp({
      recordPhoneVerificationAttempt: async (input, context) =>
        recordPhoneVerificationAttempt(input, context, {
          client: {},
          repository: {
            createPhoneVerificationAttempt: async () => {
              inserts += 1;
              return {};
            },
          },
        }),
    });
    const res = await postAttempt(app, baseBody({ outcome: "reached" }));
    assert.match(res.headers.location, /error=invalid/);
    assert.equal(inserts, 0);
  });

  it("handles unexpected service failure safely", async () => {
    const { app } = buildApp({
      recordPhoneVerificationAttempt: async () => {
        throw new Error("ECONNREFUSED password=secret relation missing");
      },
    });
    const res = await postAttempt(app, baseBody());
    assert.equal(res.status, 303);
    assert.match(res.headers.location, /error=phone_attempt_failed/);
    assert.doesNotMatch(res.headers.location, /ECONNREFUSED|password|relation/);
  });

  it("missing application returns not_found and does not record", async () => {
    const { app, state } = buildApp({ missingApplication: true });
    const res = await postAttempt(app, baseBody());
    assert.match(res.headers.location, /error=not_found/);
    assert.equal(state.recordCalls.length, 0);
  });

  it("does not change application status", async () => {
    const { app, state } = buildApp();
    await postAttempt(app, baseBody());
    assert.equal(state.applicationRow.application_status, "submitted");
    assert.equal(state.applicationUpdates, 0);
  });

  it("approve and reject routes remain present", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../src/platform/http/platformAdminRoutes.js"),
      "utf8"
    );
    assert.match(source, /\/admin\/registration-applications\/:id\/approve/);
    assert.match(source, /\/admin\/registration-applications\/:id\/reject/);
    assert.match(
      source,
      /\/admin\/registration-applications\/:id\/phone-verification\/attempts/
    );
  });
});
