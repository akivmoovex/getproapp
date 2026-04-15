"use strict";

const path = require("path");
const express = require("express");
const session = require("express-session");
const request = require("supertest");

const test = require("node:test");
const assert = require("node:assert/strict");

const { ROLES } = require("../src/auth/roles");

function createApp(role = ROLES.TENANT_MANAGER) {
  const routePath = path.join(__dirname, "..", "src", "routes", "admin", "adminFieldAgentAnalytics.js");
  const obsPath = path.join(__dirname, "..", "src", "lib", "fieldAgentAnalyticsObservability.js");
  delete require.cache[require.resolve(routePath)];
  delete require.cache[require.resolve(obsPath)];
  const registerAdminFieldAgentAnalyticsRoutes = require(routePath);
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "..", "views"));
  app.use(
    session({
      secret: "admin_fa_analytics_health_test",
      resave: false,
      saveUninitialized: true,
      name: "adm_faa_health_sid",
    })
  );
  app.use((req, res, next) => {
    req.session.adminUser = {
      id: 1,
      role,
      tenantId: 4,
    };
    res.locals.asset = () => "/styles.css";
    res.locals.bodyEmbedClass = "";
    res.locals.embed = false;
    next();
  });
  const router = express.Router();
  registerAdminFieldAgentAnalyticsRoutes(router);
  app.use("/admin", router);
  return app;
}

function createAppNoSession() {
  const routePath = path.join(__dirname, "..", "src", "routes", "admin", "adminFieldAgentAnalytics.js");
  delete require.cache[require.resolve(routePath)];
  const registerAdminFieldAgentAnalyticsRoutes = require(routePath);
  const app = express();
  app.set("view engine", "ejs");
  app.set("views", path.join(__dirname, "..", "views"));
  app.use(
    session({
      secret: "admin_fa_analytics_health_no_session_test",
      resave: false,
      saveUninitialized: true,
      name: "adm_faa_health_no_session_sid",
    })
  );
  app.use((req, res, next) => {
    res.locals.asset = () => "/styles.css";
    res.locals.bodyEmbedClass = "";
    res.locals.embed = false;
    next();
  });
  const router = express.Router();
  registerAdminFieldAgentAnalyticsRoutes(router);
  app.use("/admin", router);
  return app;
}

test("health route requires permissions", async () => {
  const app = createAppNoSession();
  await request(app).get("/admin/field-agent-analytics/health").expect(302);
});

test("health page renders guardrails and performance summary", async () => {
  process.env.FA_ANALYTICS_EXPORT_MAX_ROWS = "4321";
  process.env.FA_ANALYTICS_BULK_MAX_IDS = "123";
  process.env.FA_ANALYTICS_SLOW_QUERY_MS = "201";
  process.env.FA_ANALYTICS_SLOW_ENDPOINT_MS = "501";
  const app = createApp(ROLES.TENANT_MANAGER);
  const res = await request(app).get("/admin/field-agent-analytics/health").expect(200);
  const html = String(res.text || "");
  assert.ok(html.includes("Field agent analytics health"));
  assert.ok(html.includes("Max page size:"));
  assert.ok(html.includes("100"));
  assert.ok(html.includes("4321"));
  assert.ok(html.includes("123"));
  assert.ok(html.includes("Slow queries:"));
  assert.ok(html.includes("201"));
  assert.ok(html.includes("501"));
  delete process.env.FA_ANALYTICS_EXPORT_MAX_ROWS;
  delete process.env.FA_ANALYTICS_BULK_MAX_IDS;
  delete process.env.FA_ANALYTICS_SLOW_QUERY_MS;
  delete process.env.FA_ANALYTICS_SLOW_ENDPOINT_MS;
});

test("health page hides sensitive/raw query data", async () => {
  const app = createApp(ROLES.TENANT_MANAGER);
  const res = await request(app).get("/admin/field-agent-analytics/health").expect(200);
  const html = String(res.text || "");
  assert.ok(!html.includes("SELECT "));
  assert.ok(!html.includes("phone_raw"));
  assert.ok(!html.includes("John"));
  assert.ok(html.includes("Known limitations"));
});

test("health page works with empty counters", async () => {
  const app = createApp(ROLES.TENANT_MANAGER);
  const res = await request(app).get("/admin/field-agent-analytics/health").expect(200);
  const html = String(res.text || "");
  assert.ok(html.includes("Unknown"));
  assert.ok(html.includes("No performance/error signals recorded yet since process start."));
});
