"use strict";

/**
 * Global write-maintenance tests — in-process only; never enables Hostinger.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const request = require("supertest");

const {
  parseWriteMaintenance,
  isWriteMaintenanceEnabled,
  isWriteAllowedDuringMaintenance,
  PUBLIC_REASON,
  USER_MESSAGE,
  ENV_KEY,
} = require("../src/blessboard/config/writeMaintenance");
const { parseBlessBoardJobsEnabled } = require("../src/platform/config/v5EnvValidation");
const { createV5FoundationApp } = require("../src/platform/http/v5FoundationServer");
const { DEFAULT_V5_COOKIE } = require("../src/platform/session/v5SessionCookie");

const SECRET = "test-session-secret-at-least-32-chars!!";

function baseEnv(overrides) {
  return {
    NODE_ENV: "test",
    PLATFORM_DEPLOYMENT_CODE: "blessboard-org-staging",
    DEPLOYMENT_ENV: "testing",
    SESSION_SECRET: SECRET,
    SESSION_COOKIE_NAME: DEFAULT_V5_COOKIE,
    BLESSBOARD_TENANT_ROUTING_MODE: "off",
    BLESSBOARD_JOBS_ENABLED: "0",
    BLESSBOARD_MEDIA_UPLOADS_ENABLED: "1",
    ...overrides,
  };
}

function makeApp(envOverrides) {
  return createV5FoundationApp({
    env: baseEnv(envOverrides),
    getPool: () => {
      throw new Error("pool_should_not_run_for_maintenance_gate");
    },
  });
}

describe("write maintenance — parse", () => {
  it("defaults off; explicit on/off; unsupported fails closed for writes", () => {
    assert.equal(parseWriteMaintenance({}).enabled, false);
    assert.equal(parseWriteMaintenance({ [ENV_KEY]: "0" }).enabled, false);
    assert.equal(parseWriteMaintenance({ [ENV_KEY]: "1" }).enabled, true);
    assert.equal(parseWriteMaintenance({ [ENV_KEY]: "maybe" }).enabled, true);
    assert.equal(parseWriteMaintenance({ [ENV_KEY]: "maybe" }).ok, false);
    assert.equal(isWriteMaintenanceEnabled({ [ENV_KEY]: "yes" }), true);
  });

  it("allows logout POSTs only among writes", () => {
    assert.equal(isWriteAllowedDuringMaintenance("GET", "/login"), true);
    assert.equal(isWriteAllowedDuringMaintenance("POST", "/login"), false);
    assert.equal(isWriteAllowedDuringMaintenance("POST", "/logout"), true);
    assert.equal(isWriteAllowedDuringMaintenance("POST", "/admin/logout"), true);
    assert.equal(isWriteAllowedDuringMaintenance("POST", "/hq/logout"), true);
    assert.equal(isWriteAllowedDuringMaintenance("POST", "/branch-admin/logout"), true);
    assert.equal(isWriteAllowedDuringMaintenance("POST", "/member/logout"), true);
    assert.equal(isWriteAllowedDuringMaintenance("POST", "/hq/content/media/upload"), false);
  });

  it("forces jobs off while write maintenance is on", () => {
    const parsed = parseBlessBoardJobsEnabled({
      PLATFORM_DEPLOYMENT_CODE: "blessboard-com-production",
      DEPLOYMENT_ENV: "production",
      BLESSBOARD_JOBS_ENABLED: "1",
      BLESSBOARD_WRITE_MAINTENANCE: "1",
    });
    assert.equal(parsed.enabled, false);
    assert.equal(parsed.reason, "write_maintenance");
  });
});

describe("write maintenance — HTTP (apex / health / login)", () => {
  it("preserves GET healthz and apex home; blocks login POST with HTML", async () => {
    const app = makeApp({ BLESSBOARD_WRITE_MAINTENANCE: "1" });

    const health = await request(app).get("/healthz");
    assert.equal(health.status, 200);
    assert.equal(health.body.ok, true);
    assert.equal(health.body.writeMaintenance, true);
    assert.doesNotMatch(JSON.stringify(health.body), /DATABASE_URL|SESSION_SECRET|stack/i);

    const home = await request(app).get("/").set("Host", "blessboard.org");
    assert.equal(home.status, 200);

    const loginGet = await request(app).get("/login").set("Host", "blessboard.org");
    assert.equal(loginGet.status, 200);

    const loginPost = await request(app)
      .post("/login")
      .set("Host", "blessboard.org")
      .type("form")
      .send({ email: "a@example.test", password: "x" });
    assert.equal(loginPost.status, 503);
    assert.match(loginPost.text, /Temporarily unavailable for changes|unavailable for changes/i);
    assert.doesNotMatch(loginPost.text, /unsupported_fail_closed|DATABASE_URL|stack|at Object/i);
    assert.match(loginPost.text, /BlessBoard/);
  });

  it("when off, healthz reports writeMaintenance false", async () => {
    const app = makeApp({ BLESSBOARD_WRITE_MAINTENANCE: "0" });
    const health = await request(app).get("/healthz");
    assert.equal(health.status, 200);
    assert.equal(health.body.writeMaintenance, false);
  });
});

describe("write maintenance — tenant / member / admin / API / upload", () => {
  it("blocks tenant registration POST on custom-style host", async () => {
    const app = makeApp({ BLESSBOARD_WRITE_MAINTENANCE: "1" });
    const res = await request(app)
      .post("/register")
      .set("Host", "church.example.com")
      .type("form")
      .send({ name: "Test" });
    assert.equal(res.status, 503);
    assert.match(res.text, /unavailable for changes/i);
  });

  it("blocks member and admin mutation POSTs", async () => {
    const app = makeApp({ BLESSBOARD_WRITE_MAINTENANCE: "1" });

    const member = await request(app)
      .post("/member/profile")
      .set("Host", "diagnostic.blessboard.org")
      .type("form")
      .send({ displayName: "x" });
    assert.equal(member.status, 503);

    const hq = await request(app)
      .post("/hq/content/media/upload")
      .set("Host", "diagnostic.blessboard.org")
      .set("Accept", "application/json");
    assert.equal(hq.status, 503);
    assert.equal(hq.body.ok, false);
    assert.equal(hq.body.error, PUBLIC_REASON);
    assert.equal(hq.body.message, USER_MESSAGE);

    const admin = await request(app)
      .post("/admin/organizations/demo/plan")
      .set("Host", "blessboard.org")
      .set("Accept", "application/json")
      .send({});
    assert.equal(admin.status, 503);
    assert.equal(admin.body.error, PUBLIC_REASON);
  });

  it("blocks API-shaped POSTs with JSON body", async () => {
    const app = makeApp({ BLESSBOARD_WRITE_MAINTENANCE: "1" });
    const res = await request(app)
      .post("/api/v1/anything")
      .set("Host", "blessboard.org")
      .set("Accept", "application/json")
      .send({ ping: true });
    assert.equal(res.status, 503);
    assert.equal(res.body.error, PUBLIC_REASON);
    assert.doesNotMatch(JSON.stringify(res.body), /stack|SECRET|postgres/i);
  });

  it("allows logout POST during maintenance", async () => {
    const app = makeApp({ BLESSBOARD_WRITE_MAINTENANCE: "1" });
    // May 403/302 from CSRF/session — must not be maintenance 503 HTML gate alone.
    const res = await request(app).post("/logout").set("Host", "blessboard.org").type("form").send({});
    assert.notEqual(res.status, 503);
  });
});
