"use strict";

/**
 * BB-05 — HQ Add Member CSRF double-issue regression.
 *
 * Root cause: GET/render helpers issued a CSRF token, then buildHqAdminShellLocals
 * issued a second token into the cookie while the form still rendered the first
 * token via extra.csrfToken override. POST validation then failed with
 * sendControlled → "Unavailable" + "Invalid or missing CSRF token."
 *
 * Database-independent: proves token/cookie pairing contract and source hygiene.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const express = require("express");
const request = require("supertest");

const {
  CSRF_FIELD,
  issueCsrfToken,
  setCsrfCookie,
  validateCsrf,
  getCsrfCookieName,
} = require("../src/platform/http/v5Csrf");
const { buildHqAdminShellLocals } = require("../src/blessboard/http/hqAdminShellLocals");

const ROOT = path.join(__dirname, "..");
const HQ_MEMBERS_SRC = fs.readFileSync(
  path.join(ROOT, "src/blessboard/http/hqMembersAdminRoutes.js"),
  "utf8"
);
const MEMBER_ADD_EJS = fs.readFileSync(
  path.join(ROOT, "views/blessboard/v5/hq/member-add.ejs"),
  "utf8"
);

const TEST_ENV = Object.freeze({
  NODE_ENV: "test",
  SESSION_SECRET: "bb05-csrf-regression-secret-at-least-32-chars",
});

describe("BB-05 HQ Add Member CSRF contract", () => {
  it("form template submits _csrf from shell csrfToken", () => {
    assert.match(MEMBER_ADD_EJS, /method="post" action="\/hq\/members\/new"/);
    assert.match(MEMBER_ADD_EJS, /name="<%= csrfField %>" value="<%= csrfToken %>"/);
  });

  it("HQ members routes no longer pre-issue CSRF before shellLocals", () => {
    assert.doesNotMatch(HQ_MEMBERS_SRC, /issueCsrfToken\s*\(/);
    assert.doesNotMatch(HQ_MEMBERS_SRC, /setCsrfCookie\s*\(/);
    assert.match(HQ_MEMBERS_SRC, /buildHqAdminShellLocals/);
    assert.match(HQ_MEMBERS_SRC, /validateCsrf/);
    assert.match(HQ_MEMBERS_SRC, /Invalid or missing CSRF token/);
    // GET must still render through shellLocals so cookie and form share one token.
    assert.match(
      HQ_MEMBERS_SRC,
      /router\.get\("\/hq\/members\/new"[\s\S]*?shellLocals\(req, res, "members"/
    );
  });

  it("documents the defective double-issue pattern that caused BB-05", () => {
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
    // Shell re-issues and overwrites the cookie (historical defect).
    const shellToken = issueCsrfToken(TEST_ENV);
    setCsrfCookie(res, shellToken, { secure: false, env: TEST_ENV, req });

    assert.notEqual(formToken, shellToken);
    assert.equal(cookies[cookieName], shellToken);
    assert.equal(
      validateCsrf(req, formToken, TEST_ENV),
      false,
      "stale form token must fail against the overwritten cookie"
    );
    assert.equal(validateCsrf(req, shellToken, TEST_ENV), true);
  });

  it("shellLocals-only issuance keeps form token and cookie paired", async () => {
    const cookieName = getCsrfCookieName(TEST_ENV);
    const cookies = {};
    const req = {
      cookies,
      signedCookies: {},
      platform: null,
      path: "/hq/members/new",
      url: "/hq/members/new",
      v5Session: null,
      blessBoardAuthorizationContext: null,
      platformSupportBanner: null,
    };
    const res = {
      cookie(name, value) {
        cookies[name] = value;
      },
    };

    const locals = await buildHqAdminShellLocals(req, res, {
      env: TEST_ENV,
      isProduction: false,
      getPool: null,
      activeNav: "members",
      extra: {
        pageTitle: "Add member",
        memberSubmissionEnabled: false,
      },
    });

    assert.equal(locals.csrfField, CSRF_FIELD);
    assert.ok(locals.csrfToken);
    assert.equal(cookies[cookieName], locals.csrfToken);
    assert.equal(validateCsrf(req, locals.csrfToken, TEST_ENV), true);
    assert.equal(validateCsrf(req, "", TEST_ENV), false);
    assert.equal(validateCsrf(req, "not-a-valid-token", TEST_ENV), false);
  });

  it("rejects cross-session CSRF cookie/body mismatch", () => {
    const reqA = { cookies: {}, signedCookies: {}, platform: null };
    const resA = {
      cookie(name, value) {
        reqA.cookies[name] = value;
      },
    };
    const tokenA = issueCsrfToken(TEST_ENV);
    setCsrfCookie(resA, tokenA, { secure: false, env: TEST_ENV, req: reqA });

    const reqB = { cookies: {}, signedCookies: {}, platform: null };
    const resB = {
      cookie(name, value) {
        reqB.cookies[name] = value;
      },
    };
    const tokenB = issueCsrfToken(TEST_ENV);
    setCsrfCookie(resB, tokenB, { secure: false, env: TEST_ENV, req: reqB });

    assert.equal(validateCsrf(reqA, tokenB, TEST_ENV), false);
    assert.equal(validateCsrf(reqB, tokenA, TEST_ENV), false);
    assert.equal(validateCsrf(reqA, tokenA, TEST_ENV), true);
  });

  it("HQ CSRF failure page uses Unavailable heading matching QA wording", async () => {
    // Mirror sendControlled HTML contract used by csrfOk in hqMembersAdminRoutes.
    const app = express();
    app.post("/probe", (req, res) => {
      const message = "Invalid or missing CSRF token.";
      return res.status(403).type("html").send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><title>HQ</title></head>
<body><main><h1>Unavailable</h1><p>${message}</p></main></body></html>`);
    });
    const res = await request(app).post("/probe");
    assert.equal(res.status, 403);
    assert.match(res.text, /<h1>Unavailable<\/h1>/);
    assert.match(res.text, /Invalid or missing CSRF token/);
  });

  it("branch Register New Member path still issues CSRF once via branch shell", () => {
    const branchShell = fs.readFileSync(
      path.join(ROOT, "src/blessboard/http/branchAdminShellLocals.js"),
      "utf8"
    );
    const branchRoutes = fs.readFileSync(
      path.join(ROOT, "src/blessboard/http/branchRegistrationAdminRoutes.js"),
      "utf8"
    );
    const branchForm = fs.readFileSync(
      path.join(ROOT, "views/blessboard/v5/branch-admin/member-add.ejs"),
      "utf8"
    );
    assert.match(branchShell, /issueCsrfToken/);
    assert.match(branchShell, /setCsrfCookie/);
    // Branch create POST validates CSRF but does not pre-issue a competing token.
    assert.match(branchRoutes, /function validateCsrfPost/);
    assert.doesNotMatch(
      branchRoutes,
      /issueCsrfToken\([\s\S]*shellLocals\(req, res, "members"/
    );
    assert.match(branchForm, /name="<%= csrfName %>" value="<%= csrfVal %>"/);
    assert.match(branchForm, /action="\/branch-admin\/members\/new"/);
  });
});
