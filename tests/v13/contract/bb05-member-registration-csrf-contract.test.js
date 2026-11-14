"use strict";

/**
 * BB-05 — V13 wrapper preserving and extending HQ member CSRF contracts.
 * Does not replace tests/bb05-hq-add-member-csrf-contract.test.js.
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

const ROOT = path.join(__dirname, "../../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

const TEST_ENV = Object.freeze({
  NODE_ENV: "test",
  SESSION_SECRET: "bb05-v13-csrf-regression-secret-at-least-32-chars",
});

describe("BB-05 V13 member registration CSRF extensions", () => {
  it("preserves the dedicated BB-05 contract test file", () => {
    const p = path.join(ROOT, "tests/bb05-hq-add-member-csrf-contract.test.js");
    assert.equal(fs.existsSync(p), true);
    const src = fs.readFileSync(p, "utf8");
    assert.match(src, /BB-05/);
    assert.match(src, /double-issue/);
  });

  it("HQ members routes issue CSRF only via shell locals (no pre-issue)", () => {
    const src = read("src/blessboard/http/hqMembersAdminRoutes.js");
    assert.doesNotMatch(src, /issueCsrfToken\s*\(/);
    assert.doesNotMatch(src, /setCsrfCookie\s*\(/);
    assert.match(src, /buildHqAdminShellLocals/);
    assert.match(src, /validateCsrf/);
    assert.match(src, /router\.post\("\/hq\/members\/new"/);
  });

  it("accepts paired token and rejects missing/invalid/cross-session tokens", () => {
    const cookieName = getCsrfCookieName(TEST_ENV);
    const req = { cookies: {}, signedCookies: {}, platform: null };
    const res = {
      cookie(name, value) {
        req.cookies[name] = value;
      },
    };
    const token = issueCsrfToken(TEST_ENV);
    setCsrfCookie(res, token, { secure: false, env: TEST_ENV, req });
    assert.equal(req.cookies[cookieName], token);
    assert.equal(validateCsrf(req, token, TEST_ENV), true);
    assert.equal(validateCsrf(req, "", TEST_ENV), false);
    assert.equal(validateCsrf(req, null, TEST_ENV), false);
    assert.equal(validateCsrf(req, "totally-invalid", TEST_ENV), false);

    const other = { cookies: {}, signedCookies: {}, platform: null };
    const otherRes = {
      cookie(name, value) {
        other.cookies[name] = value;
      },
    };
    const otherToken = issueCsrfToken(TEST_ENV);
    setCsrfCookie(otherRes, otherToken, { secure: false, env: TEST_ENV, req: other });
    assert.equal(validateCsrf(req, otherToken, TEST_ENV), false);
  });

  it("add-member form requires session-backed CSRF field name contract", () => {
    const form = read("views/blessboard/v5/hq/member-add.ejs");
    assert.match(form, /method="post" action="\/hq\/members\/new"/);
    assert.match(form, /name="<%= csrfField %>" value="<%= csrfToken %>"/);
    assert.equal(CSRF_FIELD, "_csrf");
  });

  it("documents duplicate email/phone validation as DB-gated integration coverage", () => {
    const src = read("src/blessboard/http/hqMembersAdminRoutes.js");
    // Source retains validation / match staging; persistence proofs stay in integration gate.
    assert.match(src, /\/hq\/members\/new\/match/);
    assert.match(src, /\/hq\/members\/new\/review/);
  });

  it("HQ add-member re-render paths no longer pre-issue competing CSRF tokens", () => {
    const src = read("src/blessboard/http/hqMembersAdminRoutes.js");
    assert.match(src, /async function renderHqAdd/);
    assert.match(src, /async function renderHqFlowView|function renderHqFlowView/);
    assert.doesNotMatch(src, /issueCsrfToken\s*\(/);
    assert.doesNotMatch(src, /setCsrfCookie\s*\(/);
    // Shell hardening also strips csrfToken from extras (BB-05 recurrence).
    const shell = read("src/blessboard/http/hqAdminShellLocals.js");
    assert.match(shell, /delete extra\.csrfToken/);
  });
});
