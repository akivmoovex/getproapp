"use strict";

/**
 * Registration request-tracing — safe field allowlist + lifecycle events.
 */

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");

const {
  isRegistrationTraceEnabled,
  sanitizeRegistrationTraceFields,
  logRegistrationTrace,
  LOG_PREFIX,
  ENV_KEY,
} = require("../src/blessboard/services/registrationTraceLog");
const { assignV5RequestId } = require("../src/platform/http/v5SafeLogging");
const {
  createApexMarketingRouter,
  REGISTER_PATH,
  ACCOUNT_PATH,
  HQ_PATH,
} = require("../src/blessboard/http/apexMarketingRoutes");
const {
  CSRF_FIELD,
  issueCsrfToken,
  setCsrfCookie,
} = require("../src/platform/http/v5Csrf");

const PROHIBITED =
  /password|session.?token|csrf|cookie|DATABASE_URL|hunter2|raw-sid|secret-csrf|\+260971234567|admin@church\.test|123 Main/i;

describe("registrationTraceLog helpers", () => {
  it("defaults enabled; disables on explicit false tokens", () => {
    assert.equal(isRegistrationTraceEnabled({}), true);
    assert.equal(isRegistrationTraceEnabled({ [ENV_KEY]: "" }), true);
    assert.equal(isRegistrationTraceEnabled({ [ENV_KEY]: "0" }), false);
    assert.equal(isRegistrationTraceEnabled({ [ENV_KEY]: "false" }), false);
    assert.equal(isRegistrationTraceEnabled({ [ENV_KEY]: "1" }), true);
  });

  it("sanitizes to allowlisted fields and drops PII keys", () => {
    const out = sanitizeRegistrationTraceFields({
      event: "church_registration_provision",
      requestId: "req-1",
      email: "admin@church.test",
      phone: "+260971234567",
      password: "hunter2",
      csrfToken: "secret-csrf",
      organizationKey: "e2e-fnd-1",
      publicPlanCode: "foundation",
      canonicalPlanKey: "free",
      outcome: "ok",
      subscriptionEndsAt: "2026-08-20T00:00:00.000Z",
      hasTrialEndsAt: false,
    });
    assert.equal(out.email, undefined);
    assert.equal(out.phone, undefined);
    assert.equal(out.password, undefined);
    assert.equal(out.csrfToken, undefined);
    assert.equal(out.organizationKey, "e2e-fnd-1");
    assert.equal(out.publicPlanCode, "foundation");
    assert.equal(out.canonicalPlanKey, "free");
    assert.doesNotMatch(JSON.stringify(out), PROHIBITED);
  });

  it("force-logs session/transaction even when gate is off", () => {
    const lines = [];
    const orig = console.log;
    const origErr = console.error;
    console.log = (...args) => lines.push(args.join(" "));
    console.error = (...args) => lines.push(args.join(" "));
    try {
      logRegistrationTrace(
        { requestId: "r-force" },
        {
          event: "church_registration_post",
          operation: "register_church_post",
          outcome: "started",
        },
        { env: { [ENV_KEY]: "0" } }
      );
      assert.equal(lines.length, 0);

      logRegistrationTrace(
        { requestId: "r-force" },
        {
          event: "church_registration_session",
          operation: "establish_session",
          outcome: "fail",
          failureCategory: "session_failed",
        },
        { env: { [ENV_KEY]: "0" }, level: "error" }
      );
      assert.equal(lines.length, 1);
      assert.match(lines[0], /\[blessboard-church-registration\]/);
      assert.match(lines[0], /"requestId":"r-force"/);
      assert.match(lines[0], /church_registration_session/);
      assert.doesNotMatch(lines[0], PROHIBITED);
      assert.ok(LOG_PREFIX);
    } finally {
      console.log = orig;
      console.error = origErr;
    }
  });
});

describe("register-church validation request trace (HTTP)", () => {
  let logs;
  let origLog;
  let origErr;

  beforeEach(() => {
    logs = [];
    origLog = console.log;
    origErr = console.error;
    console.log = (...args) => {
      const line = args.join(" ");
      if (line.includes("[blessboard-church-registration]")) logs.push(line);
    };
    console.error = (...args) => {
      const line = args.join(" ");
      if (line.includes("[blessboard-church-registration]")) logs.push(line);
    };
  });

  afterEach(() => {
    console.log = origLog;
    console.error = origErr;
  });

  function parseCookies(req) {
    if (req.cookies && typeof req.cookies === "object") return;
    req.cookies = {};
    const header = req.headers && req.headers.cookie ? String(req.headers.cookie) : "";
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
  }

  function buildApp() {
    const env = { SESSION_SECRET: "x".repeat(32) };
    const app = express();
    app.use(assignV5RequestId);
    app.use(express.urlencoded({ extended: false }));
    app.use((req, _res, next) => {
      parseCookies(req);
      req.v5Session = null;
      next();
    });
    app.use(
      createApexMarketingRouter({
        getPool: () => null,
        isApexHost: () => true,
        issueCsrfToken,
        setCsrfCookie,
        env,
        isProduction: false,
      })
    );
    return app;
  }

  async function csrfPair(app) {
    const getRes = await request(app).get(REGISTER_PATH);
    assert.equal(getRes.status, 200);
    const setCookie = getRes.headers["set-cookie"];
    const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
    const cookieHeader = list.map((c) => String(c).split(";")[0]).join("; ");
    const m = String(getRes.text || "").match(
      new RegExp(`name="${CSRF_FIELD}"[^>]*value="([^"]+)"|value="([^"]+)"[^>]*name="${CSRF_FIELD}"`)
    );
    const token = (m && (m[1] || m[2])) || null;
    assert.ok(token, "csrf field in HTML");
    assert.ok(cookieHeader, "csrf cookie");
    return { cookieHeader, token };
  }

  it("validation failure emits requestId trace without prohibited values", async () => {
    // Wizard POSTs without action are inferred as next-church; confirm hits
    // register_church_validate and the validation failureCategory contract.
    const app = buildApp();
    const { cookieHeader, token } = await csrfPair(app);
    const res = await request(app)
      .post(REGISTER_PATH)
      .set("Cookie", cookieHeader)
      .set("X-Request-Id", "trace-val-1")
      .type("form")
      .send({
        [CSRF_FIELD]: token,
        action: "confirm",
        selected_plan: "foundation",
        church_name: "",
        country: "Zambia",
        city: "Lusaka",
        contact_name: "Alex",
        role_in_church: "Admin",
        email: "admin@church.test",
        phone: "+260971234567",
        organization_key: "e2e-fnd-trace",
        password: "hunter2hunter2",
        password_confirm: "hunter2hunter2",
        consent_contact: "on",
      });

    assert.equal(res.status, 400);
    assert.equal(res.headers["x-request-id"], "trace-val-1");
    const joined = logs.join("\n");
    assert.match(joined, /church_registration_post/);
    assert.match(joined, /church_registration_validation/);
    assert.match(joined, /"requestId":"trace-val-1"/);
    assert.match(joined, /"failureCategory":"validation"/);
    assert.doesNotMatch(joined, /admin@church\.test|\+260971234567|hunter2/);
  });
});

describe("registrationTraceLog provision/session shapes", () => {
  it("Foundation success fields exclude PII and mark no trial", () => {
    const lines = [];
    const orig = console.log;
    console.log = (...a) => lines.push(a.join(" "));
    try {
      logRegistrationTrace(
        { requestId: "trace-fnd-ok" },
        {
          event: "church_registration_provision",
          operation: "provision_registered_church",
          outcome: "ok",
          publicPlanCode: "foundation",
          canonicalPlanKey: "free",
          applicationId: "11111111-1111-4111-8111-111111111111",
          organizationKey: "e2e-fnd-20260720",
          subscriptionStatus: "active",
          subscriptionStartsAt: "2026-07-20T01:00:00.000Z",
          subscriptionEndsAt: null,
          hasTrialEndsAt: false,
          transactionRolledBack: false,
        }
      );
      logRegistrationTrace(
        { requestId: "trace-fnd-ok" },
        {
          event: "church_registration_session",
          operation: "establish_session",
          outcome: "ok",
          organizationKey: "e2e-fnd-20260720",
        }
      );
      logRegistrationTrace(
        { requestId: "trace-fnd-ok" },
        {
          event: "church_registration_redirect",
          operation: "register_church_redirect",
          outcome: "ok",
          redirectPath: "/register-church/success?ref=BB-TEST&ready=1",
        }
      );
      const joined = lines.join("\n");
      assert.match(joined, /"canonicalPlanKey":"free"/);
      assert.match(joined, /"hasTrialEndsAt":false/);
      assert.match(joined, /"transactionRolledBack":false/);
      assert.match(joined, /"redirectPath":"\/register-church\/success\?ref=BB-TEST&ready=1"/);
      assert.doesNotMatch(joined, PROHIBITED);
    } finally {
      console.log = orig;
    }
  });

  it("Growth success fields include trial ends_at without PII", () => {
    const lines = [];
    const orig = console.log;
    console.log = (...a) => lines.push(a.join(" "));
    try {
      logRegistrationTrace(
        { requestId: "trace-grw-ok" },
        {
          event: "church_registration_provision",
          operation: "provision_registered_church",
          outcome: "ok",
          publicPlanCode: "growth",
          canonicalPlanKey: "growth",
          organizationKey: "e2e-grw-20260720",
          subscriptionStatus: "trialing",
          subscriptionStartsAt: "2026-07-20T01:00:00.000Z",
          subscriptionEndsAt: "2026-08-20T01:00:00.000Z",
          hasTrialEndsAt: true,
          transactionRolledBack: false,
        }
      );
      const joined = lines.join("\n");
      assert.match(joined, /"subscriptionStatus":"trialing"/);
      assert.match(joined, /"hasTrialEndsAt":true/);
      assert.match(joined, /2026-08-20T01:00:00\.000Z/);
      assert.doesNotMatch(joined, PROHIBITED);
    } finally {
      console.log = orig;
    }
  });

  it("transaction rollback is explicit and distinct from session failure", () => {
    const lines = [];
    const orig = console.log;
    const origErr = console.error;
    console.log = (...a) => lines.push(a.join(" "));
    console.error = (...a) => lines.push(a.join(" "));
    try {
      logRegistrationTrace(
        { requestId: "trace-tx" },
        {
          event: "church_registration_transaction",
          operation: "provision_transaction",
          outcome: "rollback",
          failureCategory: "provisioning_failed",
          transactionRolledBack: true,
          applicationId: "11111111-1111-4111-8111-111111111111",
        },
        { force: true, level: "error" }
      );
      logRegistrationTrace(
        { requestId: "trace-tx" },
        {
          event: "church_registration_session",
          operation: "establish_session",
          outcome: "fail",
          failureCategory: "session_failed",
          organizationKey: "e2e-fnd-20260720",
        },
        { force: true, level: "error" }
      );
      const joined = lines.join("\n");
      assert.match(joined, /"transactionRolledBack":true/);
      assert.match(joined, /"outcome":"rollback"/);
      assert.match(joined, /church_registration_session/);
      assert.match(joined, /"failureCategory":"session_failed"/);
      assert.doesNotMatch(joined, PROHIBITED);
    } finally {
      console.log = orig;
      console.error = origErr;
    }
  });
});
