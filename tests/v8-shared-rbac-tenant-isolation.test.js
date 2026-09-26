"use strict";

/**
 * V8 shared RBAC + tenant isolation — matrices, forged IDs, PA least privilege.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const request = require("supertest");

const {
  CODE_MOOVEX_PLATFORM_TESTING,
  CODE_MOOVEX_PLATFORM_V8_TESTING,
  MOOVEX_PLATFORM_IDENTITY_KEY,
} = require("../src/platform/config/deploymentProfiles");
const {
  uuidEqual,
  extractClientTenantIds,
  hasClientTenantIds,
  rejectForgedTenantIdentifiers,
  assertResourceInsideBlessBoardTenant,
  assertActiveClinicAuthScope,
  createRejectForgedTenantIdsMiddleware,
} = require("../src/platform/rbac/sharedTenantScope");
const {
  REASON,
  authzDecision,
  mapAuthzDecisionToHttp,
  allowPlatformAdminPermissionFallthrough,
  evaluatePlatformAdminPermission,
} = require("../src/platform/rbac/sharedAuthzDecision");
const {
  assertExpectedProduct,
  authorizeBlessBoard,
  authorizeActiveClinic,
} = require("../src/platform/rbac/sharedRbacFacade");
const {
  expectIsolationDenied,
  forgeTenantBody,
  assertMatrixCell,
  CROSS_PRODUCT_MATRIX,
  BB_PERMISSION_MATRIX,
  AC_PERMISSION_MATRIX,
} = require("./helpers/authzNegativeHelpers");
const {
  assertWebsiteInstanceScope,
} = require("../src/platform/website/authorizeWebsite");

const V8_ENV = Object.freeze({
  NODE_ENV: "test",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_V8_TESTING,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "v8-rbac-session-secret-do-not-use",
  DATABASE_IDENTITY_EXPECTED: MOOVEX_PLATFORM_IDENTITY_KEY,
  DATABASE_IDENTITY_ENV: "testing",
});

const V7_ENV = Object.freeze({
  ...V8_ENV,
  PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING,
});

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CHURCH_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const BRANCH_A = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const FACILITY_A = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const FACILITY_B = "ffffffff-ffff-4fff-8fff-ffffffffffff";

describe("V8 shared RBAC — tenant scope helpers", () => {
  it("compares UUIDs case-insensitively", () => {
    assert.equal(uuidEqual(ORG_A, ORG_A.toUpperCase()), true);
    assert.equal(uuidEqual(ORG_A, ORG_B), false);
    assert.equal(uuidEqual(null, ORG_A), false);
  });

  it("extracts and detects client tenant ids", () => {
    const body = forgeTenantBody();
    const ids = extractClientTenantIds(body);
    assert.ok(ids.organizationId);
    assert.ok(ids.facility_id);
    assert.equal(hasClientTenantIds({ title: "ok" }), false);
    assert.equal(hasClientTenantIds(body), true);
  });

  it("rejects forged tenant identifiers by default", () => {
    const denied = rejectForgedTenantIdentifiers({
      body: { organizationId: ORG_B },
      trusted: { organizationId: ORG_A },
    });
    assert.equal(denied.ok, false);
    assert.equal(denied.reasonCode, REASON.FORGED_TENANT_ID);

    const allowedEmpty = rejectForgedTenantIdentifiers({
      body: { title: "safe" },
      trusted: { organizationId: ORG_A },
    });
    assert.equal(allowedEmpty.ok, true);

    const matching = rejectForgedTenantIdentifiers({
      body: { organization_id: ORG_A, facility_id: FACILITY_A },
      trusted: { organizationId: ORG_A, facilityId: FACILITY_A },
      allowMatchingTrusted: true,
    });
    assert.equal(matching.ok, true);

    const mismatchFacility = rejectForgedTenantIdentifiers({
      body: { facilityId: FACILITY_B },
      trusted: { organizationId: ORG_A, facilityId: FACILITY_A },
      allowMatchingTrusted: true,
    });
    assert.equal(mismatchFacility.ok, false);
  });

  it("asserts BlessBoard resource stays inside trusted tenant", () => {
    const tenant = {
      resolved: true,
      organization: { id: ORG_A },
      church: { id: CHURCH_A },
      primaryBranch: { id: BRANCH_A },
    };
    assert.equal(
      assertResourceInsideBlessBoardTenant(
        { organizationId: ORG_A, churchId: CHURCH_A },
        tenant
      ).ok,
      true
    );
    assert.equal(
      assertResourceInsideBlessBoardTenant(
        { organizationId: ORG_B, churchId: CHURCH_A },
        tenant
      ).ok,
      false
    );
    assert.equal(
      assertResourceInsideBlessBoardTenant(
        { organizationId: ORG_A, churchId: CHURCH_A },
        { resolved: false }
      ).reasonCode,
      REASON.TENANT_UNRESOLVED
    );
  });

  it("asserts ActiveClinic auth scope and forged facility/org", () => {
    const auth = {
      authenticated: true,
      organization: { id: ORG_A },
      selectedFacility: { id: FACILITY_A },
    };
    assert.equal(
      assertActiveClinicAuthScope(
        { organizationId: ORG_A, facilityId: FACILITY_A },
        auth
      ).ok,
      true
    );
    assert.equal(
      assertActiveClinicAuthScope({ organizationId: ORG_B }, auth).code,
      "forged_organization"
    );
    assert.equal(
      assertActiveClinicAuthScope({ facilityId: FACILITY_B }, auth).code,
      "forged_facility"
    );
    assert.equal(
      assertActiveClinicAuthScope({}, { authenticated: false }).httpStatus,
      401
    );
  });

  it("middleware rejects forged body tenant ids", async () => {
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use(express.json());
    app.use(
      createRejectForgedTenantIdsMiddleware({
        resolveTrusted: () => ({
          organizationId: ORG_A,
          churchId: CHURCH_A,
          branchId: BRANCH_A,
        }),
        allowMatchingTrusted: true,
      })
    );
    app.post("/hq/settings", (_req, res) => res.status(200).send("ok"));

    const forged = await request(app)
      .post("/hq/settings")
      .send({ organizationId: ORG_B, name: "x" });
    expectIsolationDenied(forged, "forged org body");

    const ok = await request(app)
      .post("/hq/settings")
      .send({ organizationId: ORG_A, name: "x" });
    assert.equal(ok.status, 200);
  });
});

describe("V8 shared RBAC — decisions and platform admin least privilege", () => {
  it("maps decisions to HTTP statuses", () => {
    assert.equal(
      mapAuthzDecisionToHttp(
        authzDecision({ allowed: false, reasonCode: REASON.UNAUTHENTICATED })
      ).redirectLogin,
      true
    );
    assert.equal(
      mapAuthzDecisionToHttp(
        authzDecision({ allowed: false, reasonCode: REASON.PERMISSION_DENIED }),
        { concealAsNotFound: true }
      ).status,
      404
    );
    assert.equal(
      mapAuthzDecisionToHttp(
        authzDecision({ allowed: false, reasonCode: REASON.LOOKUP_ERROR })
      ).status,
      503
    );
  });

  it("permanently disables platform_admin permission fallthrough (V2.02)", () => {
    assert.equal(allowPlatformAdminPermissionFallthrough(V8_ENV), false);
    assert.equal(allowPlatformAdminPermissionFallthrough(V7_ENV), false);
    assert.equal(
      allowPlatformAdminPermissionFallthrough({
        ...V8_ENV,
        PLATFORM_ADMIN_PERMISSION_FALLTHROUGH: "1",
      }),
      false
    );
  });

  it("evaluatePlatformAdminPermission denies without catalogue grant (no legacy fallthrough)", async () => {
    const pool = {
      async query() {
        return { rows: [{ "?column?": 1 }] };
      },
    };
    const authorize = async () => ({
      allowed: false,
      reasonCode: "RBAC_PERMISSION_DENIED",
    });
    const denied = await evaluatePlatformAdminPermission(pool, {
      actorUserId: "user-1",
      permissionKey: "platform.roles.view",
      env: V8_ENV,
      authorize,
    });
    assert.equal(denied.allowed, false);
    assert.equal(denied.reasonCode, REASON.PERMISSION_DENIED);

    const deniedV7 = await evaluatePlatformAdminPermission(pool, {
      actorUserId: "user-1",
      permissionKey: "platform.roles.view",
      env: V7_ENV,
      authorize,
    });
    assert.equal(deniedV7.allowed, false);
    assert.equal(deniedV7._internal, null);

    const catalogue = await evaluatePlatformAdminPermission(pool, {
      actorUserId: "user-1",
      permissionKey: "platform.roles.view",
      env: V8_ENV,
      authorize: async () => ({ allowed: true, reasonCode: "RBAC_ALLOWED" }),
    });
    assert.equal(catalogue.allowed, true);
  });

  it("assertExpectedProduct blocks cross-product runtime", () => {
    assert.equal(
      assertExpectedProduct("blessboard", { productKey: "activeclinic" }).allowed,
      false
    );
    assert.equal(
      assertExpectedProduct("activeclinic", { productCode: "activeclinic" }).allowed,
      true
    );
    assert.equal(CROSS_PRODUCT_MATRIX.blessboard_cookie_on_activeclinic, "Deny");
  });
});

describe("V8 shared RBAC — permission matrices", () => {
  it("documents BlessBoard matrix cells for edit/publish/finance", () => {
    assertMatrixCell(BB_PERMISSION_MATRIX["website.edit"], "website_editor", true);
    assertMatrixCell(BB_PERMISSION_MATRIX["website.publish"], "website_editor", false);
    assertMatrixCell(BB_PERMISSION_MATRIX["website.publish"], "church_hq_admin", true);
    assertMatrixCell(
      BB_PERMISSION_MATRIX["finance.transactions.view"],
      "platform_admin",
      false
    );
  });

  it("documents ActiveClinic matrix cells for patient/finance/publish", () => {
    assertMatrixCell(
      AC_PERMISSION_MATRIX["activeclinic.patient.view"],
      "activeclinic_cashier",
      false
    );
    assertMatrixCell(
      AC_PERMISSION_MATRIX["activeclinic.patient.view"],
      "activeclinic_receptionist",
      true
    );
    assertMatrixCell(
      AC_PERMISSION_MATRIX["activeclinic.billing.refund"],
      "activeclinic_finance_supervisor",
      true
    );
    assertMatrixCell(
      AC_PERMISSION_MATRIX["website.publish"],
      "activeclinic_website_editor",
      false
    );
    assertMatrixCell(
      AC_PERMISSION_MATRIX["website.publish"],
      "activeclinic_organization_admin",
      true
    );
  });
});

describe("V8 shared RBAC — website tenancy + BB authorize wiring", () => {
  it("assertWebsiteInstanceScope rejects org mismatch via uuidEqual", () => {
    const ok = assertWebsiteInstanceScope(
      { organizationId: ORG_A, productCode: "blessboard" },
      { organizationId: ORG_A.toUpperCase(), expectedProductCode: "blessboard" }
    );
    assert.equal(ok.ok, true);
    const bad = assertWebsiteInstanceScope(
      { organizationId: ORG_A, productCode: "blessboard" },
      { organizationId: ORG_B, expectedProductCode: "blessboard" }
    );
    assert.equal(bad.ok, false);
    assert.equal(bad.code, "tenant_mismatch");
  });

  it("authorizeBlessBoard denies unresolved tenant before catalogue lookup", async () => {
    const db = {
      async query() {
        throw new Error("should not query");
      },
    };
    const denied = await authorizeBlessBoard(db, {
      actorUserId: "user-1",
      permissionKey: "website.edit",
      tenant: { resolved: false },
    });
    assert.equal(denied.allowed, false);
    assert.equal(denied.reasonCode, REASON.TENANT_UNRESOLVED);
  });

  it("authorizeActiveClinic denies forged organization before staff lookup", async () => {
    const db = {
      async query() {
        throw new Error("should not query");
      },
    };
    const denied = await authorizeActiveClinic(db, {
      permissionKey: "activeclinic.patient.view",
      auth: {
        authenticated: true,
        organization: { id: ORG_A },
        selectedFacility: { id: FACILITY_A },
        staffMember: { id: "staff-1" },
        platformIdentity: { id: "id-1" },
      },
      claimed: { organizationId: ORG_B },
    });
    assert.equal(denied.allowed, false);
    assert.equal(denied.reasonCode, REASON.FORGED_TENANT_ID);
  });

  it("authorizeActiveClinic allows when staff permission check passes", async () => {
    const original = require("../src/activeclinic/services/activeClinicAuthorizationService");
    const prev = original.authorizeStaffPermission;
    original.authorizeStaffPermission = async () => ({ allowed: true });
    try {
      const allowed = await authorizeActiveClinic(
        { async query() { return { rows: [] }; } },
        {
          permissionKey: "activeclinic.access",
          auth: {
            authenticated: true,
            organization: { id: ORG_A },
            selectedFacility: { id: FACILITY_A },
            staffMember: { id: "staff-1" },
            platformIdentity: { id: "id-1" },
          },
        }
      );
      assert.equal(allowed.allowed, true);
      assert.equal(allowed.productKey, "activeclinic");
    } finally {
      original.authorizeStaffPermission = prev;
    }
  });

  it("authorizeBlessBoard allows when catalogue authorize passes", async () => {
    const svc = require("../src/blessboard/services/blessBoardRbacAuthorizationService");
    const prev = svc.authorize;
    svc.authorize = async () => ({
      allowed: true,
      reasonCode: "RBAC_ALLOWED",
      matchedAssignments: [{ id: "a1" }],
      evaluatedScopes: ["organisation"],
    });
    try {
      const allowed = await authorizeBlessBoard(
        { async query() { return { rows: [] }; } },
        {
          actorUserId: "user-1",
          permissionKey: "website.edit",
          tenant: {
            resolved: true,
            organization: { id: ORG_A },
            church: { id: CHURCH_A },
            primaryBranch: { id: BRANCH_A },
          },
        }
      );
      assert.equal(allowed.allowed, true);
      assert.equal(allowed.productKey, "blessboard");
      assert.equal(allowed.matchedAssignments.length, 1);
    } finally {
      svc.authorize = prev;
    }
  });

  it("evaluatePlatformAdminPermission handles authorize throw and missing actor", async () => {
    const missing = await evaluatePlatformAdminPermission(
      { async query() { return { rows: [] }; } },
      { actorUserId: "", permissionKey: "platform.roles.view", env: V8_ENV }
    );
    assert.equal(missing.allowed, false);

    const threw = await evaluatePlatformAdminPermission(
      { async query() { return { rows: [] }; } },
      {
        actorUserId: "user-1",
        permissionKey: "platform.roles.view",
        env: V8_ENV,
        authorize: async () => {
          throw new Error("boom");
        },
      }
    );
    assert.equal(threw.reasonCode, REASON.LOOKUP_ERROR);

    const deniedNoFallthrough = await evaluatePlatformAdminPermission(
      {
        async query() {
          throw new Error("db down");
        },
      },
      {
        actorUserId: "user-1",
        permissionKey: "platform.roles.view",
        env: V7_ENV,
        authorize: async () => ({ allowed: false }),
      }
    );
    assert.equal(deniedNoFallthrough.reasonCode, REASON.PERMISSION_DENIED);

    const catalogueLookupFail = await evaluatePlatformAdminPermission(
      {
        async query() {
          throw new Error("db down");
        },
      },
      {
        actorUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        permissionKey: "platform.roles.view",
        env: V8_ENV,
      }
    );
    assert.equal(catalogueLookupFail.reasonCode, REASON.LOOKUP_ERROR);
  });

  it("reject middleware returns HTML for forged ids when Accept is html", async () => {
    const app = express();
    app.use(express.json());
    app.use(
      createRejectForgedTenantIdsMiddleware({
        resolveTrusted: () => ({ organizationId: ORG_A }),
        allowMatchingTrusted: false,
        concealAsNotFound: true,
      })
    );
    app.post("/x", (_req, res) => res.status(200).send("ok"));
    const res = await request(app)
      .post("/x")
      .set("Accept", "text/html")
      .send({ organizationId: ORG_B });
    assert.equal(res.status, 404);
    assert.match(res.text, /Not found/i);
  });
});
