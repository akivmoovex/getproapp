"use strict";

const path = require("path");
const express = require("express");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { getSubdomain, isBlessBoardProductHost } = require("../src/platform/host");
const { createAttachChurchContext } = require("../src/church/attachChurchContext");
const { getPgPool, isPgConfigured } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");
const {
  seedChurchDemoOrganizationIfMissing,
  DEMO_HOST_SLUG,
} = require("../src/seeds/seedChurchDemoOrganization");
const churchRoutes = require("../src/routes/church");
const { isChurchHost } = require("../src/church/host");

function makeReq(hostHeader) {
  return {
    query: {},
    headers: { host: hostHeader },
    get(name) {
      if (String(name).toLowerCase() === "host") return hostHeader;
      return "";
    },
    app: { get(key) { return key === "trust proxy" ? true : undefined; } },
    hostname: hostHeader.split(":")[0],
  };
}

function makeBlessBoardApp() {
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "../views"));
  app.set("trust proxy", true);
  app.use(express.urlencoded({ extended: true }));
  app.use((req, res, next) => {
    req.subdomain = getSubdomain(req);
    next();
  });
  app.use(createAttachChurchContext());
  app.use(churchRoutes());
  app.use((req, res) => res.status(404).type("text").send("platform fallback"));
  return app;
}

test("getSubdomain ignores blessboard.com product hosts", () => {
  const prev = process.env.BASE_DOMAIN;
  process.env.BASE_DOMAIN = "blessboard.com";
  try {
    assert.equal(getSubdomain(makeReq("demo.blessboard.com")), null);
    assert.equal(getSubdomain(makeReq("blessboard.com")), null);
    assert.equal(isBlessBoardProductHost("demo.blessboard.com"), true);
  } finally {
    if (prev !== undefined) process.env.BASE_DOMAIN = prev;
    else delete process.env.BASE_DOMAIN;
  }
});

test("getSubdomain still resolves demo.getproapp.org when BASE_DOMAIN is getproapp.org", () => {
  const prev = process.env.BASE_DOMAIN;
  process.env.BASE_DOMAIN = "getproapp.org";
  try {
    assert.equal(getSubdomain(makeReq("demo.getproapp.org")), "demo");
    assert.equal(isChurchHost("demo.getproapp.org"), false);
    assert.equal(isBlessBoardProductHost("demo.getproapp.org"), false);
  } finally {
    if (prev !== undefined) process.env.BASE_DOMAIN = prev;
    else delete process.env.BASE_DOMAIN;
  }
});

test(
  "demo.blessboard.com renders BlessBoard Demo Church homepage",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureChurchSchema(pool);
    await seedChurchDemoOrganizationIfMissing(pool);

    const app = makeBlessBoardApp();
    const res = await request(app).get("/").set("Host", "demo.blessboard.com");
    assert.equal(res.status, 200);
    assert.match(res.text, /BlessBoard Demo Church/i);
    assert.match(res.text, /Powered by GetPro/);
    assert.doesNotMatch(res.text, /Church not found/i);
    assert.doesNotMatch(res.text, /platform fallback/);
    assert.doesNotMatch(res.text, /GetPro Church/);
  }
);

test(
  "demo.blessboard.com/register renders member registration",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureChurchSchema(pool);
    await seedChurchDemoOrganizationIfMissing(pool);

    const app = makeBlessBoardApp();
    const res = await request(app).get("/register").set("Host", "demo.blessboard.com");
    assert.equal(res.status, 200);
    assert.match(res.text, /Register|registration/i);
    assert.match(res.text, /BlessBoard Demo Church/i);
    assert.doesNotMatch(res.text, /Church not found/i);
  }
);

test(
  "demo branch is seeded with host_slug demo",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureChurchSchema(pool);
    const seeded = await seedChurchDemoOrganizationIfMissing(pool);
    assert.equal(seeded.branch.host_slug, DEMO_HOST_SLUG);
    assert.equal(seeded.organization.slug, DEMO_HOST_SLUG);
  }
);
