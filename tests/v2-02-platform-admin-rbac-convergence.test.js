"use strict";

/**
 * V2.02 Platform Admin RBAC convergence — catalogue platform_administrator only.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  PLATFORM_ADMINISTRATOR_ROLE_KEY,
  PLATFORM_ADMIN_PERMISSION_KEYS,
  PLATFORM_ADMIN_MUST_NOT_AUTO_GRANT,
  hasActivePlatformAdministratorAssignment,
  authorizePlatformCataloguePermission,
  assertPlatformCataloguePermission,
} = require("../src/platform/rbac/platformAdminAuthorization");
const {
  REASON,
  allowPlatformAdminPermissionFallthrough,
  evaluatePlatformAdminPermission,
} = require("../src/platform/rbac/sharedAuthzDecision");

const PA_USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BB_ADMIN = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const AC_ADMIN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const LEGACY_ONLY = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

function makePool(handlers) {
  return {
    async query(sql, params) {
      const s = String(sql).replace(/\s+/g, " ");
      for (const h of handlers) {
        if (h.match(s, params)) return h.result(s, params);
      }
      throw new Error(`Unexpected SQL: ${s.slice(0, 160)}`);
    },
  };
}

describe("V2.02 platform admin RBAC convergence", () => {
  it("exports catalogue role + platform permission inventory", () => {
    assert.equal(PLATFORM_ADMINISTRATOR_ROLE_KEY, "platform_administrator");
    for (const key of [
      "platform.users.view",
      "platform.roles.view",
      "platform.support.enter_hq",
      "platform.deployments.view",
      "platform.domains.view",
      "platform.access_health.view",
      "platform.audit.view",
    ]) {
      assert.ok(
        PLATFORM_ADMIN_PERMISSION_KEYS.includes(key),
        `missing expected platform permission ${key}`
      );
    }
  });

  it("does not auto-grant patient / finance txn / pastoral confidential", () => {
    for (const key of PLATFORM_ADMIN_MUST_NOT_AUTO_GRANT) {
      assert.equal(
        PLATFORM_ADMIN_PERMISSION_KEYS.includes(key),
        false,
        `${key} must not be on platform admin auto-grant list`
      );
    }
  });

  it("legacy fallthrough is permanently off", () => {
    assert.equal(allowPlatformAdminPermissionFallthrough({}), false);
    assert.equal(
      allowPlatformAdminPermissionFallthrough({
        PLATFORM_DEPLOYMENT_CODE: "blessboard-org-v7",
        PLATFORM_ADMIN_PERMISSION_FALLTHROUGH: "1",
      }),
      false
    );
  });

  it("valid platform administrator is allowed for platform.* permissions", async () => {
    const pool = makePool([
      {
        match: (s) => s.includes("FROM blessboard.users"),
        result: () => ({ rows: [{ status: "active" }] }),
      },
      {
        match: (s) =>
          s.includes("user_role_assignments") && s.includes("permission_key"),
        result: () => ({
          rows: [{ permission_key: "platform.users.view" }],
        }),
      },
    ]);
    const decision = await authorizePlatformCataloguePermission(pool, {
      actorUserId: PA_USER,
      permissionKey: "platform.users.view",
    });
    assert.equal(decision.allowed, true);
    assert.equal(decision.reasonCode, REASON.ALLOWED);
    assert.equal(decision.productKey, "platform");
    assert.equal(
      decision.matchedAssignments[0].roleKey,
      PLATFORM_ADMINISTRATOR_ROLE_KEY
    );

    const viaEvaluate = await evaluatePlatformAdminPermission(pool, {
      actorUserId: PA_USER,
      permissionKey: "platform.users.view",
    });
    assert.equal(viaEvaluate.allowed, true);
  });

  it("non-platform BB admin is denied platform ops", async () => {
    const pool = makePool([
      {
        match: (s) => s.includes("FROM blessboard.users"),
        result: () => ({ rows: [{ status: "active" }] }),
      },
      {
        match: (s) =>
          s.includes("user_role_assignments") && s.includes("permission_key"),
        result: () => ({ rows: [] }),
      },
      {
        match: (s) =>
          s.includes("user_role_assignments") &&
          s.includes("role_key") &&
          !s.includes("permission_key"),
        result: () => ({ rows: [] }),
      },
    ]);
    const decision = await authorizePlatformCataloguePermission(pool, {
      actorUserId: BB_ADMIN,
      permissionKey: "platform.roles.view",
    });
    assert.equal(decision.allowed, false);
    assert.equal(decision.reasonCode, REASON.PERMISSION_DENIED);

    const hasRole = await hasActivePlatformAdministratorAssignment(pool, BB_ADMIN);
    assert.equal(hasRole, false);
  });

  it("AC org admin is denied platform ops", async () => {
    const pool = makePool([
      {
        match: (s) => s.includes("FROM blessboard.users"),
        result: () => ({ rows: [{ status: "active" }] }),
      },
      {
        match: (s) => s.includes("user_role_assignments"),
        result: () => ({ rows: [] }),
      },
    ]);
    const gate = await assertPlatformCataloguePermission(
      pool,
      AC_ADMIN,
      "platform.support.enter_hq",
      { FORBIDDEN: "forbidden", LOOKUP_ERROR: "lookup_error" }
    );
    assert.equal(gate.ok, false);
    assert.equal(gate.status, "forbidden");
  });

  it("legacy platform_admin user_roles alone does not authorize", async () => {
    // Pool never consulted for user_roles — catalogue path only returns empty grant.
    let sawUserRoles = false;
    const pool = {
      async query(sql) {
        const s = String(sql);
        if (s.includes("user_roles")) {
          sawUserRoles = true;
          return { rows: [{ "?column?": 1 }] };
        }
        if (s.includes("FROM blessboard.users")) {
          return { rows: [{ status: "active" }] };
        }
        if (s.includes("user_role_assignments")) {
          return { rows: [] };
        }
        throw new Error(s.slice(0, 120));
      },
    };
    const decision = await evaluatePlatformAdminPermission(pool, {
      actorUserId: LEGACY_ONLY,
      permissionKey: "platform.deployments.view",
    });
    assert.equal(decision.allowed, false);
    assert.equal(sawUserRoles, false);
  });

  it("support capability still requires platform.support.* catalogue keys", async () => {
    const pool = makePool([
      {
        match: (s) => s.includes("FROM blessboard.users"),
        result: () => ({ rows: [{ status: "active" }] }),
      },
      {
        match: (s, params) =>
          s.includes("permission_key") &&
          params &&
          params[1] === "platform.support.enter_hq",
        result: () => ({
          rows: [{ permission_key: "platform.support.enter_hq" }],
        }),
      },
      {
        match: (s, params) =>
          s.includes("permission_key") &&
          params &&
          params[1] === "patient.create",
        result: () => ({ rows: [] }),
      },
    ]);
    const supportOk = await authorizePlatformCataloguePermission(pool, {
      actorUserId: PA_USER,
      permissionKey: "platform.support.enter_hq",
    });
    assert.equal(supportOk.allowed, true);

    const patientDenied = await authorizePlatformCataloguePermission(pool, {
      actorUserId: PA_USER,
      permissionKey: "patient.create",
    });
    assert.equal(patientDenied.allowed, false);
  });

  it("hasActivePlatformAdministratorAssignment requires platform scope", async () => {
    const pool = makePool([
      {
        match: (s) => s.includes("scope_type = 'platform'"),
        result: () => ({ rows: [{ "?column?": 1 }] }),
      },
    ]);
    assert.equal(
      await hasActivePlatformAdministratorAssignment(pool, PA_USER),
      true
    );

    const empty = makePool([
      {
        match: () => true,
        result: () => ({ rows: [] }),
      },
    ]);
    assert.equal(
      await hasActivePlatformAdministratorAssignment(empty, PA_USER),
      false
    );
  });

  it("direct /admin route denies BB admin and AC org admin", async () => {
    const express = require("express");
    const request = require("supertest");
    const {
      createPlatformAdminRouter,
    } = require("../src/platform/http/platformAdminRoutes");

    function build(hasPa) {
      const router = createPlatformAdminRouter({
        getPool: () => ({
          async query() {
            return { rows: [] };
          },
        }),
        isApexHost: () => true,
        env: {
          NODE_ENV: "test",
          SESSION_SECRET: "test-session-secret-at-least-32-chars!!",
        },
        findUserStatusById: async () => ({ id: BB_ADMIN, status: "active" }),
        hasActivePlatformAdministratorAssignment: async () => hasPa,
        log: () => {},
      });
      const app = express();
      app.use((req, _res, next) => {
        req.v5Session = {
          authenticated: true,
          session: { userId: BB_ADMIN, user: { displayName: "Tenant Admin" } },
        };
        next();
      });
      app.use(router);
      return app;
    }

    const denied = await request(build(false)).get("/admin").set("Accept", "text/html");
    assert.equal(denied.status, 403);

    const allowed = await request(build(true)).get("/admin").set("Accept", "text/html");
    // PA passes gate; page may 200 or 500 depending on pool stubs — must not be 403
    assert.notEqual(allowed.status, 403);
  });
});
