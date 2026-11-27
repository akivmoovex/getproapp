"use strict";

/**
 * D161 BlessBoard member-login OTP binding and verification.
 * Synthetic identities and mocked delivery. No PostgreSQL and no Resend calls.
 */

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");
const { createOtpService } = require("../../../src/platform/otp/otpService");
const { createFakeOtpProvider } = require("../../../src/platform/otp/otpProviders");
const { OTP_POLICY } = require("../../../src/platform/otp/otpPolicy");
const { resetOtpDatabaseAttachment } = require("../../../src/platform/otp/otpSessionGate");
const { createMemberPortalAuthRouter } = require("../../../src/blessboard/http/memberPortalAuthRoutes");
const {
  resolveServerLoginBinding,
  openPendingLogin,
  sealPendingLogin,
} = require("../../../src/blessboard/services/blessBoardMemberLoginOtp");

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER_ORG = "33333333-3333-4333-8333-333333333333";
const ACCOUNT = "22222222-2222-4222-8222-222222222222";
const OTHER_ACCOUNT = "44444444-4444-4444-8444-444444444444";
const CHURCH = "church-d161";
const MEMBER = "member-d161";
const EMAIL = "member.d161@pronline.org";
const FORGED = "forged.d161@example.test";
const PASSWORD = "synthetic-password-d161";
const SESSION_COOKIE = "moovex_platform_testing_sid";
const PENDING_COOKIE = "bb_member_login_otp";

function env(extra) {
  return {
    NODE_ENV: "test",
    DEPLOYMENT_ENV: "testing",
    DATABASE_IDENTITY_ENV: "testing",
    DATABASE_IDENTITY_EXPECTED: "moovex-platform-v7",
    PLATFORM_DEPLOYMENT_CODE: "moovex-platform-testing",
    GETPRO_OTP_PEPPER: "unit-test-otp-pepper-32b-minimum!!",
    GETPRO_OTP_ALLOW_FIXED_CODE: "1",
    GETPRO_OTP_ACTIVATION: "ACTIVE",
    GETPRO_OTP_PROVIDER: "fake",
    SESSION_SECRET: "d161-session-secret-32-characters!!",
    ...(extra || {}),
  };
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
}

function cookieHeader(setCookie) {
  const rows = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return rows.map((row) => String(row).split(";")[0]).join("; ");
}

function hasCookie(setCookie, name) {
  const rows = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return rows.some((row) => String(row).startsWith(`${name}=`));
}

function pendingValue(setCookie) {
  const rows = Array.isArray(setCookie) ? setCookie : [];
  const row = rows.find((item) => String(item).startsWith(`${PENDING_COOKIE}=`));
  if (!row) return "";
  return decodeURIComponent(String(row).split(";")[0].slice(PENDING_COOKIE.length + 1));
}

function createHarness(options) {
  const state = options.state;
  const clock = options.clock || (() => Date.now());
  const runtime = options.env || env();
  const service =
    options.service ||
    createOtpService({
      clock,
      provider: createFakeOtpProvider(),
    });
  const tenant = options.tenant || { organizationId: ORG, churchId: CHURCH, churchName: "D161 Church" };
  const app = express();
  app.use(express.urlencoded({ extended: false }));
  app.use((req, _res, next) => {
    req.cookies = parseCookies(req.headers.cookie);
    req.blessBoardTenantContext = {
      resolved: true,
      church: { id: tenant.churchId, name: tenant.churchName },
      organization: { id: tenant.organizationId, name: "D161 Org" },
    };
    next();
  });
  app.use(
    createMemberPortalAuthRouter({
      getPool: () => ({
        query() {
          throw new Error("database_not_used");
        },
      }),
      isApexHost: () => false,
      env: runtime,
      otpService: service,
      authenticateMemberByChurchId: async (_db, input) => {
        state.authInputs.push(input);
        if (input.memberNumber === "unknown") return { ok: false, message: "Those details do not match." };
        if (input.memberNumber === "no-email") {
          return {
            ok: true,
            sessionDeferred: true,
            accountId: ACCOUNT,
            memberId: MEMBER,
            verifiedEmail: "",
          };
        }
        const accountId = input.memberNumber === "other-member" ? OTHER_ACCOUNT : ACCOUNT;
        if (input.establishSession !== false) {
          return {
            ok: true,
            rawToken: "historical-session",
            session: { id: "historical" },
            accountId,
            memberId: MEMBER,
            verifiedEmail: EMAIL,
          };
        }
        return {
          ok: true,
          sessionDeferred: true,
          accountId,
          memberId: MEMBER,
          verifiedEmail: EMAIL,
        };
      },
      establishBlessBoardSession: async (_db, input) => {
        state.established.push(input);
        return { ok: true, rawToken: `session-${state.established.length}`, session: { id: state.established.length } };
      },
    })
  );
  return { app, service, runtime };
}

async function login(app, fields) {
  const page = await request(app).get("/member/login");
  const token = String(page.text).match(/name="_csrf" value="([^"]+)"/);
  assert.ok(token, "login form includes a CSRF token");
  const response = await request(app)
    .post("/member/login")
    .set("Cookie", cookieHeader(page.headers["set-cookie"]))
    .type("form")
    .send({
      _csrf: token[1],
      member_number: "BB-161",
      password: PASSWORD,
      email: FORGED,
      organization_id: OTHER_ORG,
      account_id: OTHER_ACCOUNT,
      ...(fields || {}),
    });
  return { page, response, token: token[1] };
}

describe("D161 BlessBoard login OTP binding", () => {
  let state;

  beforeEach(() => {
    state = { authInputs: [], established: [] };
    globalThis.fetch = () => {
      throw new Error("network_forbidden");
    };
  });

  afterEach(() => {
    resetOtpDatabaseAttachment();
    delete globalThis.fetch;
  });

  it("binds the server account and ignores a forged destination", () => {
    const bound = resolveServerLoginBinding({
      organizationId: ORG,
      accountId: ACCOUNT,
      churchId: CHURCH,
      memberId: MEMBER,
      verifiedEmail: EMAIL,
      destination: FORGED,
      email: FORGED,
    });
    assert.equal(bound.ok, true);
    assert.equal(bound.destination, EMAIL);
    assert.equal(bound.organizationId, ORG);
    assert.equal(bound.accountId, ACCOUNT);
    assert.equal(resolveServerLoginBinding({ ...bound, verifiedEmail: "" }).reason, "missing_verified_email");
    assert.equal(resolveServerLoginBinding({ ...bound, organizationId: "church-name" }).reason, "binding");
    assert.equal(resolveServerLoginBinding({ ...bound, accountId: "member-number" }).reason, "binding");
  });

  it("shows the code form without a session after valid credentials", async () => {
    const { app, runtime } = createHarness({ state });
    const { response } = await login(app);
    assert.equal(response.status, 200);
    assert.match(response.text, /name="otp_code"/);
    assert.match(response.text, /for="otp_code"/);
    assert.match(response.text, new RegExp(`maxlength="${OTP_POLICY.codeLength}"`));
    assert.match(response.headers["cache-control"], /no-store/);
    assert.equal(hasCookie(response.headers["set-cookie"], SESSION_COOKIE), false);
    assert.equal(hasCookie(response.headers["set-cookie"], PENDING_COOKIE), true);
    assert.equal(response.text.includes(PASSWORD), false);
    assert.equal(response.text.includes(OTP_POLICY.testingCode), false);
    assert.equal(response.text.includes(FORGED), false);
    const pending = openPendingLogin(pendingValue(response.headers["set-cookie"]), runtime);
    assert.equal(pending.destination, EMAIL);
    assert.equal(pending.organizationId, ORG);
    assert.equal(pending.accountId, ACCOUNT);
    assert.equal(state.authInputs[0].churchId, CHURCH);
    assert.equal(state.authInputs[0].organizationId, ORG);
    assert.equal(state.authInputs[0].establishSession, false);
    assert.equal(state.established.length, 0);
  });

  it("keeps the historical session when OTP activation is blocked", async () => {
    const { app } = createHarness({
      state,
      env: env({ GETPRO_OTP_ACTIVATION: "" }),
      service: createOtpService(),
    });
    const { response } = await login(app);
    assert.equal(response.status, 303);
    assert.equal(response.headers.location, "/member");
    assert.equal(hasCookie(response.headers["set-cookie"], SESSION_COOKIE), true);
    assert.equal(String(response.text).includes("otp_code"), false);
    assert.equal(state.authInputs[0].establishSession, true);
  });

  it("rejects a missing verified email and a missing challenge", async () => {
    const { app } = createHarness({ state });
    const missing = await login(app, { member_number: "no-email" });
    assert.equal(missing.response.status, 503);
    assert.equal(hasCookie(missing.response.headers["set-cookie"], SESSION_COOKIE), false);
    assert.equal(hasCookie(missing.response.headers["set-cookie"], PENDING_COOKIE), false);
    assert.equal(state.established.length, 0);

    const page = await request(app).get("/member/login");
    const token = String(page.text).match(/name="_csrf" value="([^"]+)"/);
    const verify = await request(app)
      .post("/member/login/verify")
      .set("Cookie", cookieHeader(page.headers["set-cookie"]))
      .type("form")
      .send({ _csrf: token[1], otp_code: OTP_POLICY.testingCode, email: FORGED });
    assert.equal(verify.status, 303);
    assert.equal(verify.headers.location, "/member/login");
    assert.equal(hasCookie(verify.headers["set-cookie"], SESSION_COOKIE), false);
  });

  it("rejects a missing CSRF token", async () => {
    const { app } = createHarness({ state });
    const denied = await request(app).post("/member/login").type("form").send({
      member_number: "BB-161",
      password: PASSWORD,
    });
    assert.equal(denied.status, 403);
    assert.equal(hasCookie(denied.headers["set-cookie"], SESSION_COOKIE), false);
    assert.equal(state.established.length, 0);
  });

  it("rejects a wrong code and does not issue a session", async () => {
    const { app } = createHarness({ state });
    const { page, response } = await login(app);
    const token = String(response.text).match(/name="_csrf" value="([^"]+)"/);
    const cookies = [cookieHeader(page.headers["set-cookie"]), cookieHeader(response.headers["set-cookie"])]
      .filter(Boolean)
      .join("; ");
    const wrong = await request(app)
      .post("/member/login/verify")
      .set("Cookie", cookies)
      .type("form")
      .send({
        _csrf: token[1],
        otp_code: "000000",
        email: FORGED,
        organization_id: OTHER_ORG,
        account_id: OTHER_ACCOUNT,
      });
    assert.equal(wrong.status, 401);
    assert.match(wrong.text, /not correct/);
    assert.match(wrong.text, /aria-invalid="true"/);
    assert.match(wrong.text, /role="alert"/);
    assert.equal(wrong.text.includes(OTP_POLICY.testingCode), false);
    assert.equal(hasCookie(wrong.headers["set-cookie"], SESSION_COOKIE), false);
    assert.equal(state.established.length, 0);
  });

  it("rejects an expired code", async () => {
    let now = Date.now();
    const { app } = createHarness({ state, clock: () => now });
    const { page, response } = await login(app);
    now += OTP_POLICY.ttlSeconds * 1000 + 1000;
    const token = String(response.text).match(/name="_csrf" value="([^"]+)"/);
    const cookies = [cookieHeader(page.headers["set-cookie"]), cookieHeader(response.headers["set-cookie"])]
      .filter(Boolean)
      .join("; ");
    const expired = await request(app)
      .post("/member/login/verify")
      .set("Cookie", cookies)
      .type("form")
      .send({ _csrf: token[1], otp_code: OTP_POLICY.testingCode });
    assert.equal(expired.status, 401);
    assert.match(expired.text, /expired/);
    assert.equal(hasCookie(expired.headers["set-cookie"], SESSION_COOKIE), false);
    assert.equal(state.established.length, 0);
  });

  it("completes once and rejects replay", async () => {
    const { app, runtime } = createHarness({ state });
    const { page, response } = await login(app);
    const token = String(response.text).match(/name="_csrf" value="([^"]+)"/);
    const cookies = [cookieHeader(page.headers["set-cookie"]), cookieHeader(response.headers["set-cookie"])]
      .filter(Boolean)
      .join("; ");
    const done = await request(app)
      .post("/member/login/verify")
      .set("Cookie", cookies)
      .type("form")
      .send({
        _csrf: token[1],
        otp_code: OTP_POLICY.testingCode,
        email: FORGED,
        account_id: OTHER_ACCOUNT,
        organization_id: OTHER_ORG,
      });
    assert.equal(done.status, 303);
    assert.equal(done.headers.location, "/member");
    assert.equal(hasCookie(done.headers["set-cookie"], SESSION_COOKIE), true);
    assert.equal(state.established.length, 1);
    assert.equal(state.established[0].userId, ACCOUNT);
    assert.equal(state.established[0].requireOrganizationId, ORG);
    const replay = await request(app)
      .post("/member/login/verify")
      .set("Cookie", cookies)
      .type("form")
      .send({ _csrf: token[1], otp_code: OTP_POLICY.testingCode });
    assert.equal(replay.status, 401);
    assert.match(replay.text, /already used/);
    assert.equal(hasCookie(replay.headers["set-cookie"], SESSION_COOKIE), false);
    assert.equal(state.established.length, 1);
    assert.equal(openPendingLogin(pendingValue(response.headers["set-cookie"]), runtime).accountId, ACCOUNT);
  });

  it("rejects another organization and another member", async () => {
    const { app, runtime } = createHarness({ state });
    const started = await login(app);
    const token = String(started.response.text).match(/name="_csrf" value="([^"]+)"/);
    const foreign = createHarness({
      state,
      tenant: { organizationId: OTHER_ORG, churchId: "other-church", churchName: "Other" },
      service: createHarness({ state }).service,
    });
    const crossed = await request(foreign.app)
      .post("/member/login/verify")
      .set("Cookie", [cookieHeader(started.page.headers["set-cookie"]), cookieHeader(started.response.headers["set-cookie"])].join("; "))
      .type("form")
      .send({ _csrf: token[1], otp_code: OTP_POLICY.testingCode });
    assert.equal(crossed.status, 303);
    assert.equal(hasCookie(crossed.headers["set-cookie"], SESSION_COOKIE), false);
    const sameOrg = createHarness({
      state,
      tenant: { organizationId: ORG, churchId: "other-church", churchName: "Other church" },
    });
    const resent = await request(sameOrg.app)
      .post("/member/login/verify/resend")
      .set("Cookie", [cookieHeader(started.page.headers["set-cookie"]), cookieHeader(started.response.headers["set-cookie"])].join("; "))
      .type("form")
      .send({ _csrf: token[1], email: FORGED });
    assert.equal(resent.status, 303);
    assert.equal(resent.headers.location, "/member/login");
    assert.equal(hasCookie(resent.headers["set-cookie"], SESSION_COOKIE), false);

    const other = await login(app, { member_number: "other-member" });
    const otherPending = openPendingLogin(pendingValue(other.response.headers["set-cookie"]), runtime);
    assert.equal(otherPending.accountId, OTHER_ACCOUNT);
    const swapped = sealPendingLogin(
      {
        workflow: "blessboard.member_login",
        attemptId: otherPending.attemptId,
        organizationId: otherPending.organizationId,
        accountId: ACCOUNT,
        churchId: otherPending.churchId,
        memberId: otherPending.memberId,
        verifiedEmail: otherPending.destination,
        deliveryAccepted: true,
        exp: Date.now() + 60 * 1000,
      },
      runtime
    );
    const otherToken = String(other.response.text).match(/name="_csrf" value="([^"]+)"/);
    const kept = cookieHeader(other.response.headers["set-cookie"])
      .split("; ")
      .filter((part) => part && !part.startsWith(`${PENDING_COOKIE}=`));
    const denied = await request(app)
      .post("/member/login/verify")
      .set("Cookie", `${kept.join("; ")}; ${PENDING_COOKIE}=${encodeURIComponent(swapped)}`)
      .type("form")
      .send({ _csrf: otherToken[1], otp_code: OTP_POLICY.testingCode, account_id: ACCOUNT });
    assert.equal(denied.status, 401);
    assert.equal(hasCookie(denied.headers["set-cookie"], SESSION_COOKIE), false);
    assert.equal(state.established.length, 0);
  });

  it("does not create two sessions for concurrent completion", async () => {
    const { app } = createHarness({ state });
    const { page, response } = await login(app);
    const token = String(response.text).match(/name="_csrf" value="([^"]+)"/);
    const cookies = [cookieHeader(page.headers["set-cookie"]), cookieHeader(response.headers["set-cookie"])]
      .filter(Boolean)
      .join("; ");
    const attempts = await Promise.all([
      request(app).post("/member/login/verify").set("Cookie", cookies).type("form").send({
        _csrf: token[1],
        otp_code: OTP_POLICY.testingCode,
      }),
      request(app).post("/member/login/verify").set("Cookie", cookies).type("form").send({
        _csrf: token[1],
        otp_code: OTP_POLICY.testingCode,
      }),
    ]);
    const completed = attempts.filter((item) => item.status === 303 && hasCookie(item.headers["set-cookie"], SESSION_COOKIE));
    assert.equal(completed.length, 1);
    assert.equal(state.established.length, 1);
  });

  it("keeps login closed when delivery is not accepted", async () => {
    const { app } = createHarness({
      state,
      env: env({ GETPRO_OTP_PROVIDER: "inactive" }),
      service: createOtpService(),
    });
    const { response } = await login(app);
    assert.equal(response.status, 503);
    assert.match(response.text, /could not be sent/);
    assert.equal(hasCookie(response.headers["set-cookie"], SESSION_COOKIE), false);
    assert.equal(hasCookie(response.headers["set-cookie"], PENDING_COOKIE), false);
    assert.equal(state.established.length, 0);
    assert.equal(response.text.includes(OTP_POLICY.testingCode), false);
  });

  it("reports exhausted attempts and keeps resend from opening a session", async () => {
    const { app } = createHarness({ state });
    const { page, response } = await login(app);
    const token = String(response.text).match(/name="_csrf" value="([^"]+)"/);
    const cookies = [cookieHeader(page.headers["set-cookie"]), cookieHeader(response.headers["set-cookie"])]
      .filter(Boolean)
      .join("; ");
    const resend = await request(app)
      .post("/member/login/verify/resend")
      .set("Cookie", cookies)
      .type("form")
      .send({ _csrf: token[1], email: FORGED });
    assert.equal(resend.status, 503);
    assert.match(resend.text, /not available yet/);
    assert.match(resend.text, /name="otp_code"/);
    assert.equal(hasCookie(resend.headers["set-cookie"], SESSION_COOKIE), false);
    let last = null;
    for (let attempt = 0; attempt < OTP_POLICY.maxAttempts; attempt += 1) {
      last = await request(app)
        .post("/member/login/verify")
        .set("Cookie", cookies)
        .type("form")
        .send({ _csrf: token[1], otp_code: "000000" });
    }
    assert.equal(last.status, 401);
    assert.match(last.text, /Too many attempts/);
    assert.equal(hasCookie(last.headers["set-cookie"], SESSION_COOKIE), false);
    assert.equal(state.established.length, 0);
  });

  it("direct verification without a pending challenge returns to login", async () => {
    const { app } = createHarness({ state });
    const direct = await request(app).get("/member/login/verify");
    assert.equal(direct.status, 303);
    assert.equal(direct.headers.location, "/member/login");
    assert.equal(hasCookie(direct.headers["set-cookie"], SESSION_COOKIE), false);
  });
});
