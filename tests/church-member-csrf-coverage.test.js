"use strict";

const fs = require("fs");
const path = require("path");
const express = require("express");
const session = require("express-session");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  CSRF_FIELD,
  issueChurchSessionCsrfToken,
  requireChurchSessionCsrf,
  TOKEN_PREFIX,
} = require("../src/church/churchSessionCsrf");
const { setChurchMemberSession } = require("../src/church/memberAuth");
const churchRoutes = require("../src/routes/church");

const MEMBER_MUTATIONS = [
  "/member/profile",
  "/member/account/change-password",
  "/member/ministries/:ministryId/request-join",
  "/member/prayer-request",
  "/member/requests",
  "/member/announcements/:source/:announcementId/read",
];

function read(rel) {
  return fs.readFileSync(path.join(__dirname, "..", rel), "utf8");
}

function makeApp(sessionHook) {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    session({
      secret: "member-csrf-test",
      resave: false,
      saveUninitialized: true,
    })
  );
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = {
      kind: "branch",
      organization: { id: 1, name: "Demo", status: "active" },
      branch: { id: 1, name: "Demo Branch", status: "active" },
    };
    if (typeof sessionHook === "function") sessionHook(req);
    next();
  });
  app.use(churchRoutes());
  app.use((req, res) => res.status(404).type("text").send("not found"));
  return app;
}

test("member portal authenticated mutations enforce church CSRF", () => {
  const src = read("src/routes/church/memberPortal.js");
  assert.match(src, /requireChurchSessionCsrf/);
  for (const routePath of MEMBER_MUTATIONS) {
    const escaped = routePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `router\\.post\\([\\s\\S]{0,220}?["']${escaped}["'][\\s\\S]{0,400}?requireChurchSessionCsrf`
    );
    assert.match(src, re, `expected CSRF on ${routePath}`);
  }
});

test("member logout requires CSRF when session is present", () => {
  const src = read("src/routes/church/auth.js");
  assert.match(src, /router\.post\("\/logout"/);
  assert.match(src, /requireChurchSessionCsrf/);
  assert.match(src, /getChurchMemberSession/);
});

test("member forms and shells include CSRF field or inject", () => {
  const files = [
    "views/church/member/profile.ejs",
    "views/church/member/account.ejs",
    "views/church/member/ministry_detail.ejs",
    "views/church/member/prayer_request.ejs",
    "views/church/member/request_new.ejs",
    "views/church/member/announcement_detail.ejs",
    "views/church/partials/member_shell_start.ejs",
    "views/church/partials/member_shell_end.ejs",
    "views/church/auth/waiting_verification.ejs",
  ];
  for (const rel of files) {
    const text = read(rel);
    assert.match(text, /csrf_field|csrf_inject/, rel);
  }
});

test("anonymous member mutations remain blocked without session", async () => {
  const app = makeApp();
  const profile = await request(app).post("/member/profile").type("form").send({ full_name: "X" });
  assert.equal(profile.status, 302);
  assert.equal(profile.headers.location, "/login");
  const logout = await request(app).post("/logout").type("form").send({});
  assert.equal(logout.status, 303);
  assert.equal(logout.headers.location, "/");
});

test("member mutations reject missing/invalid CSRF without reaching handlers", async () => {
  const prev = process.env.GETPRO_REQUIRE_CHURCH_CSRF;
  process.env.GETPRO_REQUIRE_CHURCH_CSRF = "1";
  try {
    // Probe middleware in isolation (member auth hits DB); assert shared reject behavior.
    const app = express();
    app.use(express.urlencoded({ extended: true }));
    app.use(
      session({
        secret: "member-csrf-probe",
        resave: false,
        saveUninitialized: true,
      })
    );
    let mutated = false;
    app.post("/member-probe", requireChurchSessionCsrf, (req, res) => {
      mutated = true;
      return res.status(200).type("text").send("ok");
    });
    app.get("/state", (req, res) => res.json({ mutated }));
    app.get("/token", (req, res) => res.json({ token: issueChurchSessionCsrfToken(req) }));
    const agent = request.agent(app);

    const missing = await agent.post("/member-probe").type("form").send({ a: "1" });
    assert.equal(missing.status, 403);
    assert.equal((await agent.get("/state")).body.mutated, false);

    const invalid = await agent.post("/member-probe").type("form").send({
      a: "1",
      [CSRF_FIELD]: `${TOKEN_PREFIX}.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb`,
    });
    assert.equal(invalid.status, 403);
    assert.equal((await agent.get("/state")).body.mutated, false);

    const token = (await agent.get("/token")).body.token;
    const valid = await agent.post("/member-probe").type("form").send({ a: "1", [CSRF_FIELD]: token });
    assert.equal(valid.status, 200);
    assert.equal((await agent.get("/state")).body.mutated, true);

    const headerOk = await agent
      .post("/member-probe")
      .set("x-csrf-token", token)
      .type("form")
      .send({ a: "1" });
    assert.equal(headerOk.status, 200);
  } finally {
    if (prev === undefined) delete process.env.GETPRO_REQUIRE_CHURCH_CSRF;
    else process.env.GETPRO_REQUIRE_CHURCH_CSRF = prev;
  }
});

test("member session without CSRF is rejected on logout in strict mode", async () => {
  const prev = process.env.GETPRO_REQUIRE_CHURCH_CSRF;
  process.env.GETPRO_REQUIRE_CHURCH_CSRF = "1";
  try {
    const app = makeApp((req) => {
      setChurchMemberSession(req, {
        member_id: 42,
        organization_id: 1,
        branch_id: 1,
        full_name: "Member User",
        status: "verified",
      });
    });
    // Ensure session secret exists then clear body token
    const agent = request.agent(app);
    // Hitting a GET that renders with member session isn't available without DB for verified routes.
    // Issue token via a tiny side channel by posting logout without token after creating session cookie.
    const missing = await agent.post("/logout").type("form").send({});
    assert.equal(missing.status, 403);
    assert.match(missing.text, /form token/i);
  } finally {
    if (prev === undefined) delete process.env.GETPRO_REQUIRE_CHURCH_CSRF;
    else process.env.GETPRO_REQUIRE_CHURCH_CSRF = prev;
  }
});

test("public login/register/forgot-password remain CSRF-exempt", () => {
  const src = read("src/routes/church/auth.js");
  for (const p of ["/register", "/login", "/forgot-password"]) {
    const idx = src.indexOf(`"${p}"`);
    assert.ok(idx > 0, p);
    // Find the POST registration for this path
    const postIdx = src.indexOf(`router.post("${p}"`);
    assert.ok(postIdx > 0, `POST ${p}`);
    const window = src.slice(postIdx, postIdx + 180);
    assert.doesNotMatch(window, /requireChurchSessionCsrf/);
  }
});
