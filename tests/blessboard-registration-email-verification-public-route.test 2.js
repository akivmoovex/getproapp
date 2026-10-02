"use strict";

/**
 * Phase2 Prompt 041 — public email verification route + result rendering (stubbed; no Postgres).
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");
const express = require("express");
const request = require("supertest");
const ejs = require("ejs");

const {
  createApexMarketingRouter,
  EMAIL_VERIFY_PATH_PREFIX,
  EMAIL_VERIFY_RESULT_PATH,
} = require("../src/blessboard/http/apexMarketingRoutes");
const {
  renderEmailVerificationResultPage,
} = require("../src/blessboard/http/renderApexMarketing");
const { issueCsrfToken, setCsrfCookie } = require("../src/platform/http/v5Csrf");

const SECRET_TOKEN = "plaintext-verify-token-never-log-or-link";
const ENV = {
  NODE_ENV: "test",
  SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
};

const VIEW = path.join(
  __dirname,
  "../views/blessboard/v5/apex/email-verification-result.ejs"
);
const PARTIALS = path.join(__dirname, "../views/blessboard/v5/partials");

function passthroughLimiter(req, res, next) {
  return next();
}

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
  const state = { consumeCalls: [] };
  const consumeFn =
    overrides.consumeVerificationToken ||
    (async (rawToken, deps) => {
      state.consumeCalls.push({ rawToken, deps });
      if (overrides.consumeImpl) return overrides.consumeImpl(rawToken, deps);
      return { ok: true, code: "verified", token: { email: "hidden@example.com" } };
    });

  const router = createApexMarketingRouter({
    getPool: () => ({
      query: async () => {
        throw new Error("pool.query must not be used by stubbed email verify tests");
      },
    }),
    isApexHost: overrides.isApexHost || (() => true),
    issueCsrfToken,
    setCsrfCookie,
    env: ENV,
    isProduction: false,
    emailVerificationLimiter: overrides.emailVerificationLimiter || passthroughLimiter,
    consumeVerificationToken: consumeFn,
  });

  const app = express();
  app.use(simpleCookieParser);
  app.use((req, _res, next) => {
    req.v5Session = { authenticated: false, session: null };
    next();
  });
  app.use(router);
  return { app, state };
}

function cookieHeaderFromResponse(res) {
  const raw = res.headers["set-cookie"];
  if (!raw) return "";
  const list = Array.isArray(raw) ? raw : [raw];
  return list.map((c) => String(c).split(";")[0]).join("; ");
}

describe("renderEmailVerificationResultPage (Prompt 041)", () => {
  it("renders success without application details or token", () => {
    const html = renderEmailVerificationResultPage({
      authenticated: false,
      csrfToken: null,
      outcome: "verified",
    });
    assert.match(html, /data-bb-email-verify-outcome="verified"/);
    assert.match(html, /Email verified/);
    assert.match(html, /confirmed/i);
    assert.doesNotMatch(html, /Grace|application|church_name|contact_email|pat@/i);
    assert.doesNotMatch(html, new RegExp(SECRET_TOKEN));
    assert.doesNotMatch(html, /\/admin/);
    assert.match(html, /href="\/"/);
    assert.match(html, /noindex/);
  });

  it("renders a generic invalid outcome", () => {
    const html = renderEmailVerificationResultPage({
      authenticated: false,
      outcome: "invalid",
    });
    assert.match(html, /data-bb-email-verify-outcome="invalid"/);
    assert.match(html, /invalid or has expired/i);
    assert.doesNotMatch(html, /expired specifically|replaced|already used/i);
  });

  it("allowlists outcome values in the EJS template", () => {
    const source = fs.readFileSync(VIEW, "utf8");
    const html = ejs.render(
      source,
      {
        pageTitle: "t",
        authenticated: false,
        csrfToken: null,
        activeNav: "email-verification",
        outcome: "hacked",
      },
      { filename: VIEW, root: PARTIALS, views: [PARTIALS] }
    );
    assert.match(html, /data-bb-email-verify-outcome="invalid"/);
  });
});

describe("GET public email verification route (Prompt 041)", () => {
  it("uses the approved path prefix", () => {
    assert.equal(EMAIL_VERIFY_PATH_PREFIX, "/register/email-verification");
    assert.equal(EMAIL_VERIFY_RESULT_PATH, "/register/email-verification/result");
  });

  it("consumes a valid token once and redirects to a tokenless success page", async () => {
    const { app, state } = buildApp();
    const res = await request(app).get(
      `${EMAIL_VERIFY_PATH_PREFIX}/${encodeURIComponent(SECRET_TOKEN)}`
    );
    assert.equal(res.status, 303);
    assert.equal(
      res.headers.location,
      `${EMAIL_VERIFY_RESULT_PATH}?outcome=verified`
    );
    assert.doesNotMatch(res.headers.location, new RegExp(SECRET_TOKEN));
    assert.equal(state.consumeCalls.length, 1);
    assert.equal(state.consumeCalls[0].rawToken, SECRET_TOKEN);
    assert.match(cookieHeaderFromResponse(res), /bb_email_verify_flash=/);

    const page = await request(app)
      .get(res.headers.location)
      .set("Cookie", cookieHeaderFromResponse(res));
    assert.equal(page.status, 200);
    assert.match(page.text, /data-bb-email-verify-outcome="verified"/);
    assert.doesNotMatch(page.text, new RegExp(SECRET_TOKEN));
    assert.doesNotMatch(page.text, /\/admin/);
    assert.doesNotMatch(page.text, /hidden@example\.com/);
  });

  it("ignores spoofed ?outcome=verified without the signed flash cookie", async () => {
    const { app } = buildApp();
    const page = await request(app).get(`${EMAIL_VERIFY_RESULT_PATH}?outcome=verified`);
    assert.equal(page.status, 200);
    assert.match(page.text, /data-bb-email-verify-outcome="invalid"/);
    assert.doesNotMatch(page.text, /data-bb-email-verify-outcome="verified"/);
  });

  it("returns a generic invalid redirect for failed consume outcomes", async () => {
    for (const label of ["invalid", "expired", "replaced", "already-used"]) {
      const { app } = buildApp({
        consumeImpl: async () => ({
          ok: false,
          code: "invalid_token",
          message: `This verification link is invalid or has expired. (${label})`,
        }),
      });
      const res = await request(app).get(
        `${EMAIL_VERIFY_PATH_PREFIX}/${encodeURIComponent(SECRET_TOKEN)}`
      );
      assert.equal(res.status, 303, label);
      assert.equal(
        res.headers.location,
        `${EMAIL_VERIFY_RESULT_PATH}?outcome=invalid`,
        label
      );
    }
  });

  it("does not require authentication", async () => {
    const { app } = buildApp();
    const res = await request(app).get(
      `${EMAIL_VERIFY_PATH_PREFIX}/${encodeURIComponent(SECRET_TOKEN)}`
    );
    assert.equal(res.status, 303);
    assert.doesNotMatch(res.headers.location, /\/login/);
  });

  it("rejects non-apex hosts", async () => {
    const { app, state } = buildApp({ isApexHost: () => false });
    const res = await request(app).get(
      `${EMAIL_VERIFY_PATH_PREFIX}/${encodeURIComponent(SECRET_TOKEN)}`
    );
    assert.equal(res.status, 404);
    assert.equal(state.consumeCalls.length, 0);
  });

  it("applies rate limiting without logging or linking the token", async () => {
    const lines = [];
    const originalError = console.error;
    console.error = (...args) => {
      lines.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    };
    try {
      const { app, state } = buildApp({
        emailVerificationLimiter: (_req, res) => {
          res.status(429).type("html").send(
            renderEmailVerificationResultPage({
              authenticated: false,
              outcome: "rate_limited",
            })
          );
        },
      });
      const res = await request(app).get(
        `${EMAIL_VERIFY_PATH_PREFIX}/${encodeURIComponent(SECRET_TOKEN)}`
      );
      assert.equal(res.status, 429);
      assert.match(res.text, /Too many requests/);
      assert.doesNotMatch(res.text, new RegExp(SECRET_TOKEN));
      assert.equal(state.consumeCalls.length, 0);
      assert.doesNotMatch(lines.join("\n"), new RegExp(SECRET_TOKEN));
    } finally {
      console.error = originalError;
    }
  });

  it("never includes the token in result page links", async () => {
    const { app } = buildApp();
    const res = await request(app).get(`${EMAIL_VERIFY_RESULT_PATH}?outcome=verified`);
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /email-verification\/[^"'?\s>]+/);
    assert.match(res.text, /data-bb-email-verify-home="1"/);
    assert.match(res.text, /href="\/"/);
  });

  it("does not alter approval behavior in the consume path (no approval imports)", () => {
    const routeSrc = fs.readFileSync(
      path.join(__dirname, "../src/blessboard/http/apexMarketingRoutes.js"),
      "utf8"
    );
    const block = routeSrc.slice(
      routeSrc.indexOf("EMAIL_VERIFY_RESULT_PATH"),
      routeSrc.indexOf("IN_PROGRESS_SAFE")
    );
    assert.match(block, /consumeTokenFn|consumeVerificationToken/);
    assert.doesNotMatch(block, /approveAndProvision|riskReview|application_status/);
  });
});
