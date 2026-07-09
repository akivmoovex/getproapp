"use strict";

const path = require("path");
const express = require("express");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { getSubdomain } = require("../src/platform/host");
const { createAttachChurchContext } = require("../src/church/attachChurchContext");
const { getPgPool, isPgConfigured } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const { seedChurchDemoOrganizationIfMissing } = require("../src/seeds/seedChurchDemoOrganization");
const churchRoutes = require("../src/routes/church");

function makeBlessBoardApp() {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.set("trust proxy", true);
  app.use((req, res, next) => {
    req.subdomain = getSubdomain(req);
    next();
  });
  app.use(createAttachChurchContext());
  app.use(churchRoutes());
  app.use((req, res) => res.status(404).type("text").send("platform fallback"));
  return app;
}

function makePlatformApp() {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.use((req, res, next) => {
    req.subdomain = getSubdomain(req);
    next();
  });
  app.use(createAttachChurchContext());
  app.use(churchRoutes());
  app.use((req, res) => res.status(404).type("text").send("not found"));
  return app;
}

test(
  "demo seed is idempotent and does not throw duplicate key errors",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureChurchSchema(pool);
    await seedChurchDemoOrganizationIfMissing(pool);
    await seedChurchDemoOrganizationIfMissing(pool);
    const orgCount = await pool.query(
      `SELECT COUNT(*)::int AS count FROM public.church_organizations WHERE slug = 'demo'`
    );
    assert.equal(orgCount.rows[0].count, 1);
  }
);

test(
  "demo.blessboard.com/about renders DB-backed story content after seed",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureChurchSchema(pool);
    await seedChurchDemoOrganizationIfMissing(pool);
    const app = makeBlessBoardApp();
    const res = await request(app).get("/about").set("Host", "demo.blessboard.com");
    assert.equal(res.status, 200);
    assert.match(res.text, /Our Story/);
    assert.match(res.text, /Christ-centered community/);
    assert.match(res.text, /Our Mission/);
  }
);

test(
  "demo.blessboard.com/leadership renders seeded pastor from published website content",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureChurchSchema(pool);
    await seedChurchDemoOrganizationIfMissing(pool);
    const app = makeBlessBoardApp();
    const res = await request(app).get("/leadership").set("Host", "demo.blessboard.com");
    assert.equal(res.status, 200);
    assert.match(res.text, /Rev\. Demo Pastor|Demo Pastor/);
    assert.match(res.text, /Sarah Chilufya/);
  }
);

test(
  "demo.blessboard.com/events renders seeded events from church_events",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureChurchSchema(pool);
    await seedChurchDemoOrganizationIfMissing(pool);
    const app = makeBlessBoardApp();
    const res = await request(app).get("/events").set("Host", "demo.blessboard.com");
    assert.equal(res.status, 200);
    assert.match(res.text, /Sunday Worship Service|BlessBoard Demo Fellowship/);
  }
);

test(
  "demo.blessboard.com/sermons renders seeded sermons from church_sermons",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureChurchSchema(pool);
    await seedChurchDemoOrganizationIfMissing(pool);
    const app = makeBlessBoardApp();
    const res = await request(app).get("/sermons").set("Host", "demo.blessboard.com");
    assert.equal(res.status, 200);
    assert.match(res.text, /Walking by Faith in Uncertain Times/);
    assert.match(res.text, /church-sermon-card/);
  }
);

test(
  "unknown branch sermons page falls back safely without 500",
  { skip: !isPgConfigured() },
  async () => {
    const app = makeBlessBoardApp();
    const res = await request(app).get("/sermons").set("Host", "demo.blessboard.com");
    assert.equal(res.status, 200);
    assert.match(res.text, /Sermons/);
  }
);

test("branch admin sermons and resources routes are registered in nav", () => {
  const fs = require("fs");
  const nav = fs.readFileSync(
    path.join(__dirname, "../views/church/partials/branch_admin_nav.ejs"),
    "utf8"
  );
  assert.match(nav, /\/branch\/sermons/);
  assert.match(nav, /\/branch\/resources/);
  assert.match(nav, /\/branch\/website-editor/);
});

test("getproapp.org platform host does not serve church /about", async () => {
  const prev = process.env.BASE_DOMAIN;
  process.env.BASE_DOMAIN = "getproapp.org";
  try {
    const app = makePlatformApp();
    const res = await request(app).get("/about").set("Host", "getproapp.org");
    assert.equal(res.status, 404);
  } finally {
    if (prev !== undefined) process.env.BASE_DOMAIN = prev;
    else delete process.env.BASE_DOMAIN;
  }
});
