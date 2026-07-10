"use strict";

const path = require("path");
const fs = require("fs");
const express = require("express");
const session = require("express-session");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const churchRoutes = require("../src/routes/church");
const { isPgConfigured } = require("../src/db/pg/pool");

function makeBranchApp(branchOverrides = {}) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "test-church-stitch-auth",
      resave: false,
      saveUninitialized: true,
    })
  );
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = {
      kind: "branch",
      orgSlug: "demo",
      organization: { id: 1, name: "Demo Church", status: "active", platform_tenant_id: 1 },
      branch: {
        id: 1,
        name: "Demo Branch",
        status: "active",
        host_slug: "demo",
        location_text: "Kafue, Zambia",
        ...branchOverrides,
      },
    };
    next();
  });
  app.use(churchRoutes());
  return app;
}

function makePlatformApp() {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use((req, res, next) => {
    req.isChurchHost = false;
    req.churchContext = null;
    next();
  });
  app.use(churchRoutes());
  app.use((req, res) => res.status(404).type("text").send("not found"));
  return app;
}

test("/login renders without 500/503", async () => {
  const res = await request(makeBranchApp()).get("/login");
  assert.equal(res.status, 200);
  assert.doesNotMatch(res.text, /Service Unavailable|503/);
  assert.match(res.text, /church\.css\?v=45/);
  assert.match(res.text, /Member Access/);
  assert.match(res.text, /Powered by GetPro/);
  assert.doesNotMatch(res.text, /GetPro Church/);
});

test("/register renders without 500/503", async () => {
  const res = await request(makeBranchApp()).get("/register");
  assert.equal(res.status, 200);
  assert.match(res.text, /Member Registration|Join Our Community/);
  assert.match(res.text, /Powered by GetPro/);
  assert.doesNotMatch(res.text, /GetPro Church/);
});

test("/registration-submitted renders", async () => {
  const res = await request(makeBranchApp()).get("/registration-submitted");
  assert.equal(res.status, 200);
  assert.match(res.text, /Registration Submitted/);
  assert.match(res.text, /registration-submitted\.jpg/);
  assert.match(res.text, /Powered by GetPro/);
});

test("/forgot-password renders", async () => {
  const res = await request(makeBranchApp()).get("/forgot-password");
  assert.equal(res.status, 200);
  assert.match(res.text, /Forgot Password\?/);
  assert.match(res.text, /forgot-password\.jpg/);
  assert.match(res.text, /Powered by GetPro/);
});

test("/waiting-verification renders for pending member session", async () => {
  const app = makeBranchApp();
  const agent = request.agent(app);
  // Seed session via a tiny middleware path: hit login then manually set is hard;
  // instead mount a one-off by posting through a custom app.
  const sessionApp = express();
  sessionApp.set("view engine", "ejs");
  sessionApp.set("views", path.join(__dirname, "../views"));
  sessionApp.use(
    session({
      secret: "test-church-stitch-auth-waiting",
      resave: false,
      saveUninitialized: true,
    })
  );
  sessionApp.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = {
      kind: "branch",
      orgSlug: "demo",
      organization: { id: 1, name: "Demo Church", status: "active" },
      branch: { id: 1, name: "Demo Branch", status: "active", host_slug: "demo", location_text: "Kafue" },
    };
    req.session.churchMember = {
      member_id: 42,
      organization_id: 1,
      branch_id: 1,
      status: "pending",
      full_name: "Pending Member",
    };
    next();
  });
  sessionApp.use(churchRoutes());

  const res = await request(sessionApp).get("/waiting-verification");
  assert.equal(res.status, 200);
  assert.match(res.text, /Verification in Progress|Pending Verification/);
  assert.match(res.text, /Powered by GetPro/);
  assert.doesNotMatch(res.text, /GetPro Church/);
});

test("register_closed renders when member_registration_enabled=false", async () => {
  const res = await request(makeBranchApp({ member_registration_enabled: false })).get("/register");
  assert.equal(res.status, 200);
  assert.match(res.text, /Registration is currently closed/i);
  assert.match(res.text, /Powered by GetPro/);
});

test("protected member routes redirect to /login", async () => {
  const res = await request(makeBranchApp()).get("/member/dashboard");
  assert.ok([302, 303].includes(res.status));
  assert.equal(res.headers.location, "/login");
});

test("protected branch routes redirect to /branch/login", async () => {
  const res = await request(makeBranchApp()).get("/branch/dashboard");
  assert.ok([302, 303].includes(res.status));
  assert.equal(res.headers.location, "/branch/login");
});

test("auth Stitch PNG inventory filenames exist on disk", () => {
  const base = path.join(__dirname, "../design-reference/stitch-screens/church-flow/02-authentication");
  const files = [
    "09-auth-member-login-desktop/09-auth-member-login-desktop.png",
    "09-auth-member-login-mobile/09-auth-member-login-mobile.png",
    "10-auth-member-registration-desktop/10-auth-member-registration-desktop.png",
    "10-auth-member-registration-mobile/10-auth-member-registration-mobile.png",
    "11-auth-registration-submitted-desktop/11-auth-registration-submitted-desktop.png",
    "11-auth-registration-submitted-mobile/11-auth-registration-submitted-mobile.png",
    "12-auth-waiting-verification-desktop/12-auth-waiting-verification-desktop.png",
    "12-auth-waiting-verification-mobile/12-auth-waiting-verification-mobile.png",
    "13-auth-forgot-password-desktop/13-auth-forgot-password-desktop.png",
    "13-auth-forgot-password-mobile/13-auth-forgot-password-mobile.png",
  ];
  for (const rel of files) {
    assert.ok(fs.existsSync(path.join(base, rel)), `missing Stitch PNG ${rel}`);
  }
});

test(
  "getproapp.org church routes remain unavailable on non-church host",
  { skip: !isPgConfigured() },
  async () => {
    const res = await request(makePlatformApp()).get("/login");
    assert.equal(res.status, 404);
  }
);
