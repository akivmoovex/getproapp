"use strict";

/**
 * V2.06 — website_frame iframe must reuse CSRF cookie for parent publish.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  issueCsrfToken,
  issueOrReuseCsrfToken,
  validateCsrf,
  getCsrfCookieName,
} = require("../src/platform/http/v5Csrf");

const ENV = {
  SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
  NODE_ENV: "test",
  PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
};

describe("V2.06 CSRF reuse for website_frame", () => {
  it("passes the request into ActiveClinic tenant rendering", () => {
    const source = fs.readFileSync(
      path.join(__dirname, "../src/activeclinic/http/activeClinicPublicRoutes.js"),
      "utf8"
    );
    assert.match(
      source,
      /async function renderTenantView\(req, res, clinic, template, extra\)[\s\S]*?issuePageCsrf\(res, env, isProduction, req\)/
    );
  });

  it("reuses valid cookie without Set-Cookie when reuseExisting", () => {
    const first = issueCsrfToken(ENV);
    const cookieName = getCsrfCookieName(ENV);
    const req = { cookies: { [cookieName]: first } };
    let setCookie = null;
    const res = {
      cookie(name, val) {
        setCookie = { name, val };
      },
    };
    const reused = issueOrReuseCsrfToken(req, res, ENV, {
      secure: false,
      reuseExisting: true,
    });
    assert.equal(reused, first);
    assert.equal(setCookie, null);
    assert.equal(validateCsrf(req, reused, ENV), true);
  });

  it("issues a new cookie when reuseExisting is false", () => {
    const first = issueCsrfToken(ENV);
    const cookieName = getCsrfCookieName(ENV);
    const req = { cookies: { [cookieName]: first } };
    let setCookie = null;
    const res = {
      cookie(name, val) {
        setCookie = { name, val };
      },
    };
    const next = issueOrReuseCsrfToken(req, res, ENV, {
      secure: false,
      reuseExisting: false,
    });
    assert.notEqual(next, first);
    assert.ok(setCookie && setCookie.val === next);
  });
});
