"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");
const express = require("express");

const { createApexMarketingRouter } = require("../src/blessboard/http/apexMarketingRoutes");
const { renderContactPage } = require("../src/blessboard/http/renderApexMarketing");
const {
  validatePlatformContactInquiry,
  CONTACT_REASON_OPTIONS,
} = require("../src/church/platformInquiryValidation");
const { CSRF_COOKIE } = require("../src/platform/http/v5Csrf");

function parseCookies(req, _res, next) {
  if (req.cookies && typeof req.cookies === "object") return next();
  req.cookies = {};
  const header = req.headers && req.headers.cookie ? String(req.headers.cookie) : "";
  if (!header) return next();
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

function makeApexContactApp(opts = {}) {
  const env = {
    NODE_ENV: "test",
    SESSION_SECRET: "a".repeat(48),
    ...(opts.env || {}),
  };
  const app = express();
  app.use(express.urlencoded({ extended: true }));
  app.use(parseCookies);
  app.use((req, _res, next) => {
    req.headers.host = opts.host || "blessboard.pronline.org";
    next();
  });
  app.use(
    createApexMarketingRouter({
      getPool: opts.getPool || (() => null),
      isApexHost: () => true,
      env,
      isProduction: false,
    })
  );
  return app;
}

function extractCsrf(res) {
  const setCookie = res.headers["set-cookie"] || [];
  const joined = Array.isArray(setCookie) ? setCookie.join(";") : String(setCookie || "");
  const cookieMatch = joined.match(new RegExp(`${CSRF_COOKIE}=([^;]+)`));
  const htmlMatch = String(res.text || "").match(/name="_csrf" value="([^"]+)"/);
  return {
    cookie: cookieMatch ? decodeURIComponent(cookieMatch[1]) : null,
    token: htmlMatch ? htmlMatch[1] : null,
  };
}

test("renderContactPage matches Stitch Contact copy and structure", () => {
  const html = renderContactPage({
    authenticated: false,
    csrfToken: "csrf-contact",
    csrfField: "_csrf",
    submitted: false,
    form: {},
  });
  assert.match(html, /data-bb-contact="platform"/);
  assert.match(html, /data-product="BlessBoard"/);
  assert.match(html, /CONTACT US/);
  assert.match(html, /We're here to help your ministry move forward/);
  assert.match(html, /Whether you're exploring BlessBoard/);
  assert.match(html, /How can we help\?/);
  assert.match(html, /I want to register my church/);
  assert.match(html, /Send message/);
  assert.match(html, /Please don't include passwords/);
  assert.match(html, /Start in the right place/);
  assert.match(html, /What happens after you contact us\?/);
  assert.match(html, /Ready to build your church's digital home\?/);
  assert.match(html, /href="\/register-church"/);
  assert.match(html, /href="\/login"/);
  assert.match(html, /href="\/directory"/);
  assert.match(html, /href="\/features"/);
  assert.match(html, /© 2026 BlessBoard\. All rights reserved\./);
  assert.match(html, /href="\/contact"/);
  assert.doesNotMatch(html, /\/c\/demo-church\/contact/);
  assert.equal(CONTACT_REASON_OPTIONS.length, 6);
});

test("validatePlatformContactInquiry requires reason allowlist and optional church", () => {
  const bad = validatePlatformContactInquiry({
    full_name: "Pastor A",
    email: "a@church.org",
    message: "Hello there friends",
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.field, "reason");

  const ok = validatePlatformContactInquiry({
    full_name: "Pastor A",
    email: "a@church.org",
    church_name: "Grace Church",
    reason: "question_about_blessboard",
    message: "Hello there friends",
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.data.subject, "I have a question about BlessBoard");
  assert.equal(ok.data.church_name, "Grace Church");
});

test("GET /contact renders apex Contact Us page", async () => {
  const app = makeApexContactApp();
  const res = await request(app).get("/contact");
  assert.equal(res.status, 200);
  assert.match(res.text, /data-bb-shell="apex"/);
  assert.match(res.text, /data-bb-contact="platform"/);
  assert.match(res.text, /We're here to help your ministry move forward/);
  assert.match(res.text, /href="\/contact"/);
  assert.match(res.text, /is-active/);
  assert.match(res.text, /Register Your Church/);
  assert.match(res.text, /Sign In/);
  assert.match(res.text, /name="_csrf"/);
});

test("POST /contact rejects invalid payload without fake success", async () => {
  const app = makeApexContactApp();
  const get = await request(app).get("/contact");
  const { cookie, token } = extractCsrf(get);
  assert.ok(cookie);
  assert.ok(token);
  const post = await request(app)
    .post("/contact")
    .set("Cookie", `${CSRF_COOKIE}=${encodeURIComponent(cookie)}`)
    .type("form")
    .send({
      _csrf: token,
      full_name: "Test",
      email: "bad-email",
      reason: "other",
      message: "short",
    });
  assert.equal(post.status, 400);
  assert.match(post.text, /Please enter a valid email address|Please enter a message/);
  assert.doesNotMatch(post.text, /your message was received/i);
});

test("POST /contact returns honest failure when inquiry cannot be persisted", async () => {
  const app = makeApexContactApp({ getPool: () => null });
  const get = await request(app).get("/contact");
  const { cookie, token } = extractCsrf(get);
  assert.ok(cookie);
  assert.ok(token);
  const post = await request(app)
    .post("/contact")
    .set("Cookie", `${CSRF_COOKIE}=${encodeURIComponent(cookie)}`)
    .type("form")
    .send({
      _csrf: token,
      full_name: "Pastor Test",
      email: "pastor@church.org",
      phone: "260971000000",
      church_name: "Test Church",
      reason: "partnership_enquiry",
      message: "We would like to discuss a partnership opportunity.",
    });
  assert.equal(post.status, 503);
  assert.match(post.text, /could not save|try again/i);
  assert.doesNotMatch(post.text, /your message was received/i);
});
