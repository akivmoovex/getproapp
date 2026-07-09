"use strict";

const path = require("path");
const express = require("express");
const test = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const { createAttachChurchContext } = require("../src/church/attachChurchContext");
const { classifyPgError } = require("../src/church/churchDbResilience");
const branchesRepo = require("../src/db/pg/church/branchesRepo");
const pg = require("../src/db/pg");
const { getSubdomain } = require("../src/platform/host");
const churchRoutes = require("../src/routes/church");
const {
  gatherChurchProductionDiagnostics,
} = require("../src/services/church/churchProductionDiagnostics");
const { isPgConfigured, getPgPool } = require("../src/db/pg/pool");
const { ensureChurchSchema } = require("../src/db/pg/ensureChurchSchema");

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

test("classifyPgError identifies connection timeout", () => {
  const err = new Error("Connection terminated due to connection timeout");
  const classified = classifyPgError(err);
  assert.equal(classified.kind, "timeout");
});

test("attachChurchContext catches DB timeout and returns branded 503", async () => {
  const originalFind = branchesRepo.findBranchByHostSlug;
  const originalGetPool = pg.getPgPool;
  branchesRepo.findBranchByHostSlug = async () => {
    throw new Error("Connection terminated due to connection timeout");
  };
  pg.getPgPool = () => ({ query: async () => ({ rows: [] }) });

  try {
    const app = makeBlessBoardApp();
    const res = await request(app).get("/").set("Host", "demo.blessboard.com");
    assert.equal(res.status, 503);
    assert.match(res.text, /BlessBoard is temporarily unavailable/i);
    assert.doesNotMatch(res.text, /Church not found/i);
    assert.doesNotMatch(res.text, /Connection terminated/i);
  } finally {
    branchesRepo.findBranchByHostSlug = originalFind;
    pg.getPgPool = originalGetPool;
  }
});

test("DB timeout does not render Church not found", async () => {
  const originalFind = branchesRepo.findBranchByHostSlug;
  const originalGetPool = pg.getPgPool;
  branchesRepo.findBranchByHostSlug = async () => {
    throw new Error("Connection terminated due to connection timeout");
  };
  pg.getPgPool = () => ({ query: async () => ({ rows: [] }) });

  try {
    const app = makeBlessBoardApp();
    const res = await request(app).get("/about").set("Host", "demo.blessboard.com");
    assert.equal(res.status, 503);
    assert.doesNotMatch(res.text, /Church not found/i);
  } finally {
    branchesRepo.findBranchByHostSlug = originalFind;
    pg.getPgPool = originalGetPool;
  }
});

test("unknown slug with healthy DB still renders Church not found 404", async () => {
  const originalFind = branchesRepo.findBranchByHostSlug;
  const originalGetPool = pg.getPgPool;
  branchesRepo.findBranchByHostSlug = async () => null;
  pg.getPgPool = () => ({ query: async () => ({ rows: [] }) });

  try {
    const app = makeBlessBoardApp();
    const res = await request(app).get("/about").set("Host", "unknownslug.blessboard.com");
    assert.equal(res.status, 404);
    assert.match(res.text, /Church not found/i);
  } finally {
    branchesRepo.findBranchByHostSlug = originalFind;
    pg.getPgPool = originalGetPool;
  }
});

test(
  "demo.blessboard.com works when findBranchByHostSlug returns demo branch",
  { skip: !isPgConfigured() },
  async () => {
    const pool = getPgPool();
    await ensureChurchSchema(pool);
    const seed = require("../src/seeds/seedChurchDemoOrganization");
    await seed.seedChurchDemoOrganizationIfMissing(pool);

    const app = makeBlessBoardApp();
    const res = await request(app).get("/").set("Host", "demo.blessboard.com");
    assert.equal(res.status, 200);
    assert.doesNotMatch(res.text, /temporarily unavailable/i);
  }
);

test("diagnostics reports DB timeout without exposing DATABASE_URL", async () => {
  const prevDb = process.env.DATABASE_URL;
  process.env.DATABASE_URL = "postgres://secretuser:secretpass@db.example.com:5432/getpro";

  const original = branchesRepo.findBranchByHostSlug;
  branchesRepo.findBranchByHostSlug = async () => {
    throw new Error("Connection terminated due to connection timeout");
  };

  try {
    const diagnostics = await gatherChurchProductionDiagnostics();
    const serialized = JSON.stringify(diagnostics);
    assert.doesNotMatch(serialized, /secretpass/i);
    assert.doesNotMatch(serialized, /postgres:\/\//i);
    assert.equal(diagnostics.demoBranchLookup.ok, false);
    assert.equal(diagnostics.demoBranchLookup.errorKind, "timeout");
    assert.match(diagnostics.demoBranchLookup.message, /timeout/i);
  } finally {
    branchesRepo.findBranchByHostSlug = original;
    if (prevDb === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = prevDb;
  }
});

test("getproapp.org is unaffected by church DB timeout handling", async () => {
  const prev = process.env.BASE_DOMAIN;
  process.env.BASE_DOMAIN = "getproapp.org";
  const original = branchesRepo.findBranchByHostSlug;
  branchesRepo.findBranchByHostSlug = async () => {
    throw new Error("Connection terminated due to connection timeout");
  };

  try {
    const app = makeBlessBoardApp();
    const res = await request(app).get("/").set("Host", "getproapp.org");
    assert.equal(res.status, 404);
    assert.doesNotMatch(res.text, /BlessBoard is temporarily unavailable/i);
  } finally {
    branchesRepo.findBranchByHostSlug = original;
    if (prev !== undefined) process.env.BASE_DOMAIN = prev;
    else delete process.env.BASE_DOMAIN;
  }
});
