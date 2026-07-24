"use strict";

/**
 * Phase2 Prompt 039 — POST email-verification resend route (stubbed deps; no PostgreSQL).
 */

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const express = require("express");
const request = require("supertest");
const fs = require("node:fs");
const path = require("path");

const {
  createPlatformAdminRouter,
  mapEmailVerificationResendError,
} = require("../src/platform/http/platformAdminRoutes");
const { CSRF_FIELD, CSRF_COOKIE, issueCsrfToken } = require("../src/platform/http/v5Csrf");
const {
  RESEND_STATUS,
} = require("../src/blessboard/services/registrationEmailVerificationDelivery");

const APP_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const OTHER_APP_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ADMIN_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ENV = {
  NODE_ENV: "test",
  SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
  BLESSBOARD_APEX_ORIGIN: "https://blessboard.test",
};

const SECRET_TOKEN = "plaintext-verification-token-must-never-leak";

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

function buildApp(overrides = {}) {
  const state = {
    resendCalls: [],
  };

  const resendFn =
    overrides.resendRegistrationVerificationEmail ||
    (async (input, deps) => {
      state.resendCalls.push({ input, deps });
      if (overrides.resendImpl) return overrides.resendImpl(input, deps);
      return {
        ok: true,
        code: RESEND_STATUS.SENT,
        message: "Verification email accepted for delivery.",
        recipient: "admin@example.com",
      };
    });

  const router = createPlatformAdminRouter({
    getPool: () => ({
      query: async () => {
        throw new Error("pool.query must not be used by stubbed email resend route tests");
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
    findRegistrationApplicationById:
      overrides.findRegistrationApplicationById ||
      (async () => ({
        id: APP_ID,
        contact_email: "admin@example.com",
        church_name: "Grace",
      })),
    resendRegistrationVerificationEmail: resendFn,
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

async function postResend(app, { csrf = true, applicationId = APP_ID, body = {} } = {}) {
  const token = issueCsrfToken(ENV);
  const req = request(app)
    .post(`/admin/registration-applications/${applicationId}/email-verification/resend`)
    .type("form");
  if (csrf) {
    req.set("Cookie", `${CSRF_COOKIE}=${token}`);
    return req.send({ ...body, [CSRF_FIELD]: token });
  }
  return req.send({ ...body, [CSRF_FIELD]: "bad-token" });
}

describe("mapEmailVerificationResendError", () => {
  it("maps cooldown, invalid email, sending unavailable, and unexpected failures", () => {
    assert.equal(mapEmailVerificationResendError({ code: "cooldown" }), "cooldown");
    assert.equal(mapEmailVerificationResendError({ code: "resend_cooldown" }), "cooldown");
    assert.equal(mapEmailVerificationResendError({ code: "invalid_email" }), "invalid_email");
    assert.equal(
      mapEmailVerificationResendError({ code: "email_sending_unavailable" }),
      "email_sending_unavailable"
    );
    assert.equal(
      mapEmailVerificationResendError({ code: "email_verification_failed" }),
      "email_verification_failed"
    );
    assert.equal(mapEmailVerificationResendError({ code: "ECONNREFUSED" }), "email_verification_failed");
  });
});

describe("POST email-verification resend route (Prompt 039)", () => {
  it("redirects to notice=email_verification_sent on success", async () => {
    const { app, state } = buildApp();
    const res = await postResend(app);
    assert.equal(res.status, 303);
    assert.equal(
      res.headers.location,
      `/admin/registration-applications/${APP_ID}?notice=email_verification_sent#reg-email-verification`
    );
    assert.equal(state.resendCalls.length, 1);
    assert.equal(state.resendCalls[0].input.applicationId, APP_ID);
    assert.equal(state.resendCalls[0].input.actorUserId, ADMIN_ID);
    assert.equal(state.resendCalls[0].input.publicBaseUrl, "https://blessboard.test");
  });

  it("uses route application ID and session admin ID (ignores forged body ids)", async () => {
    const { app, state } = buildApp();
    await postResend(app, {
      body: {
        application_id: OTHER_APP_ID,
        created_by_user_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        actor_user_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        plaintext_token: SECRET_TOKEN,
      },
    });
    assert.equal(state.resendCalls[0].input.applicationId, APP_ID);
    assert.equal(state.resendCalls[0].input.actorUserId, ADMIN_ID);
    assert.equal(state.resendCalls[0].input.plaintextToken, undefined);
  });

  it("requires CSRF", async () => {
    const { app, state } = buildApp();
    const res = await postResend(app, { csrf: false });
    assert.equal(res.status, 303);
    assert.match(res.headers.location, /error=csrf/);
    assert.match(res.headers.location, /#reg-email-verification$/);
    assert.equal(state.resendCalls.length, 0);
  });

  it("rejects unauthorized requests", async () => {
    const { app, state } = buildApp({ unauthenticated: true });
    const res = await postResend(app);
    assert.ok(res.status === 303 || res.status === 401);
    if (res.status === 303) assert.match(res.headers.location, /\/login/);
    assert.equal(state.resendCalls.length, 0);
  });

  it("rejects missing platform admin role", async () => {
    const { app, state } = buildApp({
      listActiveAuthorizationRoles: async () => [{ roleKey: "church_admin" }],
    });
    const res = await postResend(app);
    assert.equal(res.status, 403);
    assert.equal(state.resendCalls.length, 0);
  });

  it("maps cooldown error", async () => {
    const { app } = buildApp({
      resendImpl: async () => ({
        ok: false,
        code: RESEND_STATUS.COOLDOWN,
        message: "wait",
      }),
    });
    const res = await postResend(app);
    assert.equal(res.status, 303);
    assert.equal(
      res.headers.location,
      `/admin/registration-applications/${APP_ID}?error=cooldown#reg-email-verification`
    );
  });

  it("maps invalid email error", async () => {
    const { app } = buildApp({
      resendImpl: async () => ({
        ok: false,
        code: RESEND_STATUS.INVALID_EMAIL,
      }),
    });
    const res = await postResend(app);
    assert.match(res.headers.location, /error=invalid_email#reg-email-verification$/);
  });

  it("maps sending unavailable error", async () => {
    const { app } = buildApp({
      resendImpl: async () => ({
        ok: false,
        code: RESEND_STATUS.SENDING_UNAVAILABLE,
      }),
    });
    const res = await postResend(app);
    assert.match(
      res.headers.location,
      /error=email_sending_unavailable#reg-email-verification$/
    );
  });

  it("maps unexpected failure without leaking tokens", async () => {
    const lines = [];
    const originalError = console.error;
    console.error = (...args) => {
      lines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    };
    try {
      const { app } = buildApp({
        resendImpl: async () => ({
          ok: false,
          code: RESEND_STATUS.UNEXPECTED_FAILURE,
          message: `boom ${SECRET_TOKEN}`,
          rawToken: SECRET_TOKEN,
        }),
      });
      const res = await postResend(app);
      assert.match(
        res.headers.location,
        /error=email_verification_failed#reg-email-verification$/
      );
      assert.doesNotMatch(res.headers.location, new RegExp(SECRET_TOKEN));
      const joined = lines.join("\n");
      assert.doesNotMatch(joined, new RegExp(SECRET_TOKEN));
    } finally {
      console.error = originalError;
    }
  });

  it("route source never embeds plaintext tokens in redirects", () => {
    const routeSrc = fs.readFileSync(
      path.join(__dirname, "../src/platform/http/platformAdminRoutes.js"),
      "utf8"
    );
    const block = routeSrc.slice(
      routeSrc.indexOf("/email-verification/resend"),
      routeSrc.indexOf("/admin/registration-applications/:id/reject")
    );
    assert.match(block, /notice=email_verification_sent/);
    assert.doesNotMatch(block, /rawToken|plaintextToken|verificationUrl/);
  });
});
