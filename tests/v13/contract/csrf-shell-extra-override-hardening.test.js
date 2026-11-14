"use strict";

/**
 * D05 — Shell CSRF must not be overridable by caller extras (BB-05 recurrence guard).
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  CSRF_FIELD,
  issueCsrfToken,
  setCsrfCookie,
  validateCsrf,
  getCsrfCookieName,
} = require("../../../src/platform/http/v5Csrf");
const { buildHqAdminShellLocals } = require("../../../src/blessboard/http/hqAdminShellLocals");
const {
  buildBranchAdminShellLocals,
} = require("../../../src/blessboard/http/branchAdminShellLocals");

const ROOT = path.join(__dirname, "../../..");
const TEST_ENV = Object.freeze({
  NODE_ENV: "test",
  SESSION_SECRET: "d05-csrf-shell-hardening-secret-at-least-32-chars",
});

function makeReqRes() {
  const cookies = {};
  const req = {
    cookies,
    signedCookies: {},
    platform: null,
    path: "/hq/probe",
    url: "/hq/probe",
    v5Session: null,
    blessBoardAuthorizationContext: null,
    platformSupportBanner: null,
  };
  const res = {
    cookie(name, value) {
      cookies[name] = value;
    },
  };
  return { req, res, cookies };
}

describe("D05 shell CSRF extra-override hardening", () => {
  it("HQ and branch shell sources strip/force csrfToken and csrfField after extras", () => {
    const hq = fs.readFileSync(
      path.join(ROOT, "src/blessboard/http/hqAdminShellLocals.js"),
      "utf8"
    );
    const branch = fs.readFileSync(
      path.join(ROOT, "src/blessboard/http/branchAdminShellLocals.js"),
      "utf8"
    );
    for (const src of [hq, branch]) {
      assert.match(src, /delete extra\.csrfToken/);
      assert.match(src, /delete extra\.csrfField/);
      assert.match(src, /\.\.\.extra/);
      // Shell-owned CSRF must be assigned after extras spread.
      assert.ok(src.lastIndexOf("...extra") < src.lastIndexOf("csrfToken,"));
      assert.ok(src.lastIndexOf("csrfToken,") < src.lastIndexOf("csrfField: CSRF_FIELD"));
    }
  });

  it("HQ shell ignores csrfToken/csrfField extras and keeps one cookie-paired token", async () => {
    const cookieName = getCsrfCookieName(TEST_ENV);
    const { req, res, cookies } = makeReqRes();
    const attackerToken = issueCsrfToken(TEST_ENV);

    const locals = await buildHqAdminShellLocals(req, res, {
      env: TEST_ENV,
      isProduction: false,
      getPool: null,
      activeNav: "members",
      extra: {
        pageTitle: "Legitimate extra title",
        memberSubmissionEnabled: true,
        csrfToken: attackerToken,
        csrfField: "stolen_csrf_field",
      },
    });

    assert.equal(locals.pageTitle, "Legitimate extra title");
    assert.equal(locals.memberSubmissionEnabled, true);
    assert.equal(locals.csrfField, CSRF_FIELD);
    assert.notEqual(locals.csrfField, "stolen_csrf_field");
    assert.notEqual(locals.csrfToken, attackerToken);
    assert.ok(locals.csrfToken);
    assert.equal(cookies[cookieName], locals.csrfToken);
    assert.equal(validateCsrf(req, locals.csrfToken, TEST_ENV), true);
    assert.equal(validateCsrf(req, attackerToken, TEST_ENV), false);
    assert.equal(validateCsrf(req, "", TEST_ENV), false);
    assert.equal(validateCsrf(req, "invalid-token", TEST_ENV), false);
  });

  it("branch shell ignores csrfToken/csrfField extras and keeps one cookie-paired token", async () => {
    const cookieName = getCsrfCookieName(TEST_ENV);
    const { req, res, cookies } = makeReqRes();
    req.path = "/branch-admin/probe";
    req.url = "/branch-admin/probe";
    const attackerToken = issueCsrfToken(TEST_ENV);

    const locals = await buildBranchAdminShellLocals(req, res, {
      env: TEST_ENV,
      isProduction: false,
      getPool: null,
      activeNav: "members",
      extra: {
        formHint: "ok-extra",
        csrfToken: attackerToken,
        csrfField: "x_csrf",
      },
    });

    assert.equal(locals.formHint, "ok-extra");
    assert.equal(locals.csrfField, CSRF_FIELD);
    assert.notEqual(locals.csrfToken, attackerToken);
    assert.equal(cookies[cookieName], locals.csrfToken);
    assert.equal(validateCsrf(req, locals.csrfToken, TEST_ENV), true);
  });

  it("shell issues exactly one token into the cookie for a single locals build", async () => {
    const cookieName = getCsrfCookieName(TEST_ENV);
    const { req, res, cookies } = makeReqRes();
    let setCount = 0;
    const countingRes = {
      cookie(name, value) {
        setCount += 1;
        cookies[name] = value;
      },
    };
    const locals = await buildHqAdminShellLocals(req, countingRes, {
      env: TEST_ENV,
      isProduction: false,
      getPool: null,
      activeNav: "home",
      extra: { csrfToken: "should-not-win" },
    });
    assert.equal(setCount, 1);
    assert.equal(cookies[cookieName], locals.csrfToken);
  });

  it("historical double-issue + extra override pattern remains rejected", () => {
    const cookieName = getCsrfCookieName(TEST_ENV);
    const cookies = {};
    const req = { cookies, signedCookies: {}, platform: null };
    const res = {
      cookie(name, value) {
        cookies[name] = value;
      },
    };
    const formToken = issueCsrfToken(TEST_ENV);
    setCsrfCookie(res, formToken, { secure: false, env: TEST_ENV, req });
    const shellToken = issueCsrfToken(TEST_ENV);
    setCsrfCookie(res, shellToken, { secure: false, env: TEST_ENV, req });
    assert.notEqual(formToken, shellToken);
    assert.equal(cookies[cookieName], shellToken);
    assert.equal(validateCsrf(req, formToken, TEST_ENV), false);
  });
});
