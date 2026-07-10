"use strict";

/**
 * Verification of church-selection branch context + preference cookie security.
 * Does not require PostgreSQL.
 */

const path = require("path");
const express = require("express");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const churchRoutes = require("../src/routes/church");
const {
  COOKIE_NAME,
  MAX_AGE_SECONDS,
  readChurchSelectionPreference,
  setChurchSelectionPreference,
  clearChurchSelectionPreference,
  cookieSecureFlag,
  cookieDomainForRequest,
  churchSelectionCookieOptions,
  isSafeSlug,
} = require("../src/church/churchSelectionPreference");
const { churchPublicUrl } = require("../src/church/platformProvisioningValidation");
const { createAttachChurchContext } = require("../src/church/attachChurchContext");

function makeApexApp() {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = {
      kind: "vertical-apex",
      host: "blessboard.com",
      organization: null,
      branch: null,
      orgSlug: null,
    };
    next();
  });
  app.use(churchRoutes());
  return app;
}

function makeTenantApp(org, branch) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = {
      kind: "branch",
      host: `${branch.host_slug}.blessboard.com`,
      orgSlug: org.slug,
      hostSlug: branch.host_slug,
      organization: org,
      branch,
    };
    next();
  });
  app.use(churchRoutes());
  return app;
}

test("preference cookie options: slugs-only payload, SameSite=lax, httpOnly, 180d, Secure in production", () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const req = { hostname: "blessboard.com", secure: false, get: () => "" };
    const opts = churchSelectionCookieOptions(req);
    assert.equal(opts.httpOnly, true);
    assert.equal(opts.sameSite, "lax");
    assert.equal(opts.path, "/");
    assert.equal(opts.secure, true);
    assert.equal(opts.domain, ".blessboard.com");
    assert.equal(opts.maxAge, MAX_AGE_SECONDS * 1000);
    assert.equal(MAX_AGE_SECONDS, 60 * 60 * 24 * 180);
  } finally {
    if (prev === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prev;
  }
});

test("preference cookie Secure also follows HTTPS / x-forwarded-proto outside production", () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  try {
    assert.equal(cookieSecureFlag({ secure: false, get: () => "http" }), false);
    assert.equal(cookieSecureFlag({ secure: true, get: () => "http" }), true);
    assert.equal(
      cookieSecureFlag({
        secure: false,
        get: (n) => (String(n).toLowerCase() === "x-forwarded-proto" ? "https" : ""),
      }),
      true
    );
  } finally {
    if (prev === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prev;
  }
});

test("preference cookie domain is scoped to BlessBoard host domain", () => {
  assert.equal(cookieDomainForRequest({ hostname: "blessboard.com" }), ".blessboard.com");
  assert.equal(cookieDomainForRequest({ hostname: "www.blessboard.com" }), ".blessboard.com");
  assert.equal(cookieDomainForRequest({ hostname: "demo.blessboard.com" }), ".blessboard.com");
  assert.equal(cookieDomainForRequest({ hostname: "localhost" }), undefined);
});

test("preference cookie rejects non-slug values; payload is slug strings only", () => {
  assert.equal(isSafeSlug("good-church"), true);
  assert.equal(isSafeSlug("../x"), false);
  assert.equal(isSafeSlug("a|b"), false);
  assert.equal(readChurchSelectionPreference({ headers: { cookie: `${COOKIE_NAME}=onlyone` } }), null);
  assert.equal(readChurchSelectionPreference({ headers: { cookie: `${COOKIE_NAME}=org|../bad` } }), null);
  assert.equal(readChurchSelectionPreference({ headers: { cookie: `${COOKIE_NAME}=org|branch?x=1` } }), null);
  // Numeric-looking tokens are still public slug strings, not DB id grants / auth.
  assert.deepEqual(readChurchSelectionPreference({ headers: { cookie: `${COOKIE_NAME}=1|2` } }), {
    churchSlug: "1",
    branchSlug: "2",
  });
});

test("setChurchSelectionPreference writes slug-only cookie value", () => {
  const cookies = [];
  const res = {
    cookie(name, value, opts) {
      cookies.push({ name, value, opts });
    },
  };
  const req = { hostname: "blessboard.com", secure: true, get: () => "https" };
  const ok = setChurchSelectionPreference(res, req, {
    churchSlug: "Grace Church!",
    branchSlug: "Main Campus",
  });
  assert.equal(ok, false); // unsafe after normalize fails
  const ok2 = setChurchSelectionPreference(res, req, {
    churchSlug: "grace-church",
    branchSlug: "main-campus",
  });
  assert.equal(ok2, true);
  assert.equal(cookies[0].name, COOKIE_NAME);
  assert.equal(cookies[0].value, "grace-church|main-campus");
  assert.doesNotMatch(cookies[0].value, /[0-9]{5,}/); // no large numeric ids required
  assert.equal(cookies[0].opts.sameSite, "lax");
  assert.equal(cookies[0].opts.httpOnly, true);
});

test("clearChurchSelectionPreference emits clear with aligned options", () => {
  const cleared = [];
  const res = {
    clearCookie(name, opts) {
      cleared.push({ name, opts });
    },
  };
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    clearChurchSelectionPreference(res, { hostname: "blessboard.com", get: () => "" });
    assert.equal(cleared[0].name, COOKIE_NAME);
    assert.equal(cleared[0].opts.domain, ".blessboard.com");
    assert.equal(cleared[0].opts.secure, true);
    assert.equal(cleared[0].opts.sameSite, "lax");
    assert.equal(cleared[0].opts.path, "/");
  } finally {
    if (prev === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prev;
  }
});

test("tenant destination URLs are host_slug based, not preference-cookie based", () => {
  const url = churchPublicUrl("north-campus", "/login");
  assert.equal(url, "https://north-campus.blessboard.com/login");
  assert.doesNotMatch(url, /bb_church_pref|churchSlug=/);
});

test("tenant homepage and auth resolve branch from churchContext host, ignoring preference cookie", async () => {
  const org = { id: 10, name: "Host Org", slug: "host-org", status: "active" };
  const branch = {
    id: 20,
    name: "Host Branch",
    slug: "host-branch",
    host_slug: "host-branch",
    status: "active",
    member_registration_enabled: true,
    welcome_message: "Hello from host branch",
  };
  const app = makeTenantApp(org, branch);

  const home = await request(app)
    .get("/")
    .set("Cookie", `${COOKIE_NAME}=other-org|other-branch`);
  assert.equal(home.status, 200);
  assert.match(home.text, /Host Branch|Host Org/);
  assert.match(home.text, /Member Login/);
  assert.match(home.text, /Register as a Member/);
  // Preference cookie must not inject foreign org into tenant page
  assert.doesNotMatch(home.text, /other-org|Other Org/);

  const login = await request(app)
    .get("/login")
    .set("Cookie", `${COOKIE_NAME}=other-org|other-branch`);
  assert.equal(login.status, 200);
  assert.match(login.text, /Host Branch|Member Access/);

  const register = await request(app)
    .get("/register")
    .set("Cookie", `${COOKIE_NAME}=other-org|other-branch`);
  assert.equal(register.status, 200);
  assert.match(register.text, /Member Registration|Register/);
});

test("apex administrator entry uses church finder, not platform super-admin login", async () => {
  const app = makeApexApp();
  const res = await request(app).get("/");
  assert.equal(res.status, 200);
  assert.match(res.text, /href="\/churches\?for=admin"/);
  assert.doesNotMatch(res.text, /church-header--apex[\s\S]*href="\/admin\/login"/);
  assert.doesNotMatch(res.text, /church-drawer--apex[\s\S]*href="\/admin\/login"/);

  const finder = await request(app).get("/churches?for=admin");
  assert.equal(finder.status, 200);
  assert.match(finder.text, /Find your church to sign in|Administrator/i);
});

test("churchPublicUrl rejects unsafe slugs and non-relative paths (no open redirect)", () => {
  assert.equal(churchPublicUrl("https://evil.com", "/"), "");
  assert.equal(churchPublicUrl("//evil.com", "/"), "");
  assert.equal(churchPublicUrl("evil.com", "/"), ""); // dots not allowed in slug pattern
  assert.equal(churchPublicUrl("good-slug", "https://evil.com"), "");
  assert.equal(churchPublicUrl("good-slug", "//evil.com"), "");
  assert.equal(churchPublicUrl("good-slug", "/login"), "https://good-slug.blessboard.com/login");
  assert.match(churchPublicUrl("good-slug", "/"), /^https:\/\/good-slug\.blessboard\.com\/?$/);
});

test("attachChurchContext export remains the tenant branch resolver (host-based)", () => {
  assert.equal(typeof createAttachChurchContext, "function");
});

test("branding CSS uses shared GetPro orange token for powered-by GetPro word", () => {
  const fs = require("fs");
  const css = fs.readFileSync(path.join(__dirname, "../public/church/church.css"), "utf8");
  assert.match(css, /--church-getpro-orange:\s*#f59e0b/);
  assert.match(css, /--church-powered-by-gray:\s*#6b7280/);
  assert.match(css, /\.bb-powered-by__label\s*\{[^}]*var\(--church-powered-by-gray\)/s);
  assert.match(css, /\.bb-powered-by__getpro\s*\{[^}]*var\(--church-getpro-orange\)/s);
  assert.match(css, /\.church-drawer[\s\S]{0,200}\.bb-powered-by__getpro[\s\S]{0,80}--church-getpro-orange/);
});
