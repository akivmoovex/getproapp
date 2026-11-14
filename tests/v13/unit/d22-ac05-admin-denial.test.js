"use strict";

/**
 * In-process AC-05 gate. A query double is not a live session and does not
 * close the release gate.
 */

const { describe, it, before } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");

const { createPlatformAdminRouter } = require("../../../src/platform/http/platformAdminRoutes");
const {
  hasActivePlatformAdministratorAssignment,
} = require("../../../src/platform/rbac/platformAdminAuthorization");
const { assignBlessBoardRole } = require("../../../src/blessboard/services/assignBlessBoardRole");
const {
  buildAc05EvidencePlan,
  assertSyntheticPlan,
  applyActiveClinicFixtures,
} = require("../fixtures/v13SyntheticFixtures");

const PLAN = assertSyntheticPlan(buildAc05EvidencePlan());
const ADMIN_ID = PLAN.administrator.userId;
const LOWER_ID = PLAN.lowerPrivilege.userId;
const WRITE_SQL = /^\s*(insert|update|delete|truncate|drop|alter|create|commit|rollback)\b/i;

describe("D22 AC-05 in-process denial", () => {
  let writes = 0;
  let queries = [];

  before(() => {
    assert.equal(process.env.DATABASE_URL, undefined);
    assert.equal(process.env.TEST_DATABASE_URL, undefined);
    assert.notEqual(process.env.GETPRO_V13_ALLOW_DB_WRITES, "1");
    assert.notEqual(process.env.GETPRO_V13_DB_STAGES_AUTHORIZED, "1");
  });

  function poolFor(allowAdmin) {
    return {
      async query(sql, params) {
        const text = String(sql);
        queries.push(text.replace(/\s+/g, " ").slice(0, 180));
        if (WRITE_SQL.test(text)) {
          writes += 1;
          throw new Error("AC05_WRITE_REFUSED");
        }
        if (text.includes("user_role_assignments") && text.includes("scope_type = 'platform'")) {
          const allowed = allowAdmin && params && params[0] === ADMIN_ID;
          return { rows: allowed ? [{ ok: 1 }] : [], rowCount: allowed ? 1 : 0 };
        }
        if (text.includes("information_schema.tables")) {
          return { rows: [{ present: 1 }], rowCount: 1 };
        }
        if (text.includes("information_schema.columns")) {
          return { rows: [{ column_name: "identity_key" }], rowCount: 1 };
        }
        if (text.includes("FROM platform.database_identity")) {
          return {
            rows: [{
              identity_key: "moovex-platform-v7",
              environment_code: "testing",
              database_name: "getpro_v13_ci_d22local01",
              host_fingerprint: "local",
            }],
            rowCount: 1,
          };
        }
        if (text.includes("to_regclass")) {
          return { rows: [{ present: false }], rowCount: 1 };
        }
        if (text.includes("schema_migrations")) {
          return { rows: [{ applied_count: 0, latest_applied_at: null }], rowCount: 1 };
        }
        if (text.includes("FROM platform.organizations")) {
          return { rows: [], rowCount: 0 };
        }
        if (text.includes("SELECT 1 AS connected")) {
          return { rows: [{ connected: 1 }], rowCount: 1 };
        }
        throw new Error(`Unexpected SQL: ${text.replace(/\s+/g, " ").slice(0, 180)}`);
      },
    };
  }

  function appFor({ userId, apex = true, userStatus = "active", deployment = "testing", allowAdmin = false }) {
    const router = createPlatformAdminRouter({
      getPool: () => poolFor(allowAdmin),
      isApexHost: () => apex,
      env: {
        NODE_ENV: "test",
        DEPLOYMENT_ENV: deployment,
        SESSION_SECRET: "d22-test-session-secret-at-least-32!!",
      },
      findUserStatusById: async () => ({ id: userId, status: userStatus }),
      hasActivePlatformAdministratorAssignment,
      log: () => {},
    });
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use((req, _res, next) => {
      if (userId) {
        req.v5Session = {
          authenticated: true,
          session: { userId, user: { displayName: "Synthetic" } },
        };
      }
      next();
    });
    app.use(router);
    return app;
  }

  it("defines synthetic identities and refuses to apply them", async () => {
    assert.equal(PLAN.persisted, false);
    assert.equal(PLAN.administrator.roleKey, "platform_administrator");
    assert.equal(PLAN.administrator.scopeType, "platform");
    assert.equal(PLAN.lowerPrivilege.roleKey, null);
    assert.equal(PLAN.facilityDimension, "none");
    assert.equal(PLAN.routes.page.path, "/admin/settings/test-database");
    const db = { async query() { throw new Error("query"); } };
    await assert.rejects(
      () => applyActiveClinicFixtures(db, "postgres://127.0.0.1/getpro_v13_ci_d22local01", {}),
      /V13_FIXTURE_HOLD/
    );
    assert.equal(writes, 0);
  });

  it("lets a platform administrator read the test-database page without a write", async () => {
    writes = 0;
    const response = await request(appFor({ userId: ADMIN_ID, allowAdmin: true }))
      .get(PLAN.routes.page.path)
      .set("Accept", "text/html");
    assert.equal(response.status, 200);
    assert.match(response.text, /Test Database Management/);
    assert.doesNotMatch(response.text, /password|SESSION_SECRET|postgres:\/\//i);
    assert.equal(writes, 0);
  });

  it("denies an authenticated user who has no platform administrator assignment", async () => {
    writes = 0;
    const response = await request(appFor({ userId: LOWER_ID, allowAdmin: true }))
      .get(PLAN.routes.page.path)
      .set("Accept", "text/html");
    assert.equal(response.status, 403);
    assert.match(response.text, /You do not have access to platform administration/);
    assert.doesNotMatch(response.text, /Test Database Management/);
    assert.equal(writes, 0);
  });

  it("denies the read-only preview for the same authenticated user", async () => {
    const response = await request(appFor({ userId: LOWER_ID, allowAdmin: true }))
      .get(`${PLAN.routes.preview.path}?scope=selected_test_tenant`)
      .set("Accept", "application/json");
    assert.equal(response.status, 403);
    assert.notEqual(response.status, 401);
    assert.doesNotMatch(response.text, /Test Database Management/);
  });

  it("treats a missing session as authentication, not the authorization denial", async () => {
    const response = await request(appFor({ userId: null }))
      .get(PLAN.routes.page.path)
      .set("Accept", "text/html");
    assert.equal(response.status, 303);
    assert.match(response.headers.location, /^\/login\?next=/);
    assert.notEqual(response.status, 403);
  });

  it("does not reach the page from a non-apex host", async () => {
    const response = await request(appFor({ userId: ADMIN_ID, apex: false, allowAdmin: true }))
      .get(PLAN.routes.page.path)
      .set("Accept", "text/html");
    assert.equal(response.status, 503);
  });

  it("keeps a production deployment out of test-database management", async () => {
    const response = await request(appFor({
      userId: ADMIN_ID,
      allowAdmin: true,
      deployment: "production",
    }))
      .get(PLAN.routes.page.path)
      .set("Accept", "text/html");
    assert.equal(response.status, 403);
    assert.match(response.text, /Test database management is unavailable/);
    assert.doesNotMatch(response.text, /Test Database Management/);
  });

  it("rejects a missing CSRF token before a platform mutation", async () => {
    writes = 0;
    const denied = await request(appFor({ userId: LOWER_ID, allowAdmin: true }))
      .post("/admin/domains/qa.example/status")
      .type("form")
      .send({ status: "active" });
    assert.equal(denied.status, 403);
    const csrf = await request(appFor({ userId: ADMIN_ID, allowAdmin: true }))
      .post("/admin/domains/qa.example/status")
      .type("form")
      .send({ status: "active" });
    assert.equal(csrf.status, 303);
    assert.match(csrf.headers.location, /error=csrf/);
    assert.equal(writes, 0);
  });

  it("refuses tenant-admin escalation before any database call", async () => {
    const db = { async query() { throw new Error("query"); } };
    const churchScoped = await assignBlessBoardRole(db, {
      userId: LOWER_ID,
      organizationKey: PLAN.refusedAssignment.organizationKey,
      roleKey: "organisation_administrator",
    });
    assert.equal(churchScoped.ok, false);
    assert.equal(churchScoped.message, PLAN.refusedAssignment.expected);
    const platformScoped = await assignBlessBoardRole(db, {
      userId: LOWER_ID,
      organizationKey: "v13d19-clinic-a",
      roleKey: "platform_administrator",
      churchKey: "hq",
    });
    assert.equal(platformScoped.ok, false);
    assert.equal(platformScoped.message, "invalid_input:platform_admin_scope");
  });

  it("still denies the lower-privilege user when a facility hint is supplied", async () => {
    const response = await request(appFor({ userId: LOWER_ID, allowAdmin: true }))
      .get(`${PLAN.routes.page.path}?facility_id=facility-a`)
      .set("Accept", "text/html")
      .set("X-Facility-Id", "facility-a");
    assert.equal(response.status, 403);
    assert.match(response.text, /You do not have access to platform administration/);
    assert.equal(PLAN.facilityDimension, "none");
  });
});
