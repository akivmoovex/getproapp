"use strict";

const path = require("path");
const express = require("express");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const churchRoutes = require("../src/routes/church");
const { BLESSBOARD_NAME } = require("../src/church/branding");

function makeVerticalApexApp() {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = { kind: "vertical-apex", host: "blessboard.com", organization: null, branch: null };
    next();
  });
  app.use(churchRoutes());
  return app;
}

function makeBranchApp() {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use((req, res, next) => {
    req.isChurchHost = true;
    req.churchContext = {
      kind: "branch",
      orgSlug: "demo",
      organization: { id: 1, name: "Demo Church", status: "active" },
      branch: { id: 1, name: "Demo Branch", status: "active", host_slug: "demo" },
    };
    next();
  });
  app.use(churchRoutes());
  return app;
}

test("BlessBoard branding on vertical apex homepage", async () => {
  const app = makeVerticalApexApp();
  const res = await request(app).get("/");
  assert.equal(res.status, 200);
  assert.match(res.text, new RegExp(BLESSBOARD_NAME));
  assert.match(res.text, /Powered by[\s\S]{0,120}?GetPro/);
  assert.doesNotMatch(res.text, /GetPro Church/);
  assert.match(res.text, /<title>BlessBoard \| BlessBoard<\/title>/);
});

test("BlessBoard branding on branch public homepage footer", { skip: !require("../src/db/pg/pool").isPgConfigured() }, async () => {
  const app = makeBranchApp();
  const res = await request(app).get("/");
  assert.equal(res.status, 200);
  assert.match(res.text, /Powered by[\s\S]{0,120}?GetPro/);
  assert.doesNotMatch(res.text, /GetPro Church/);
});

test("apex homepage promotes Find Your Church, not tenant member login as primary CTA", async () => {
  const app = makeVerticalApexApp();
  const res = await request(app).get("/");
  assert.match(res.text, /Find Your Church/);
  assert.match(res.text, /Church Administrator Login/);
  assert.doesNotMatch(res.text, /Start Free Trial|Get Started Free|View Demo/);
  assert.doesNotMatch(res.text, /https:\/\/demo\.blessboard\.com\/login/);
  assert.doesNotMatch(res.text, /https:\/\/demo\.blessboard\.com\/register/);
  assert.doesNotMatch(res.text, /kafuebaptist\.church\.getproapp\.org/);
  assert.doesNotMatch(res.text, /GetPro Church/);
});
