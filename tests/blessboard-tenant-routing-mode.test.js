"use strict";

/**
 * BLESSBOARD_TENANT_ROUTING_MODE unit tests + evaluateTenantRoute policy.
 */

const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const {
  getBlessBoardTenantRoutingMode,
  resetTenantRoutingModeWarningForTests,
  MODE_OFF,
  MODE_SHADOW,
  MODE_AUTHORITATIVE,
} = require("../src/blessboard/config/tenantRoutingMode");
const {
  evaluateTenantRoute,
  OUTCOME,
} = require("../src/blessboard/http/evaluateTenantRoute");

describe("BLESSBOARD_TENANT_ROUTING_MODE", () => {
  beforeEach(() => {
    resetTenantRoutingModeWarningForTests();
  });

  it("defaults to off when unset", () => {
    assert.equal(getBlessBoardTenantRoutingMode({}), MODE_OFF);
    assert.equal(getBlessBoardTenantRoutingMode({ BLESSBOARD_TENANT_ROUTING_MODE: "" }), MODE_OFF);
  });

  it("accepts off, shadow, authoritative", () => {
    assert.equal(
      getBlessBoardTenantRoutingMode({ BLESSBOARD_TENANT_ROUTING_MODE: "off" }),
      MODE_OFF
    );
    assert.equal(
      getBlessBoardTenantRoutingMode({ BLESSBOARD_TENANT_ROUTING_MODE: "SHADOW" }),
      MODE_SHADOW
    );
    assert.equal(
      getBlessBoardTenantRoutingMode({ BLESSBOARD_TENANT_ROUTING_MODE: "authoritative" }),
      MODE_AUTHORITATIVE
    );
  });

  it("invalid mode safely falls back to off", () => {
    assert.equal(
      getBlessBoardTenantRoutingMode({ BLESSBOARD_TENANT_ROUTING_MODE: "legacy" }),
      MODE_OFF
    );
    assert.equal(
      getBlessBoardTenantRoutingMode({ BLESSBOARD_TENANT_ROUTING_MODE: "on" }),
      MODE_OFF
    );
  });

  it("is not inferred from NODE_ENV", () => {
    assert.equal(
      getBlessBoardTenantRoutingMode({
        NODE_ENV: "production",
        BLESSBOARD_TENANT_ROUTING_MODE: "",
      }),
      MODE_OFF
    );
    assert.equal(
      getBlessBoardTenantRoutingMode({
        NODE_ENV: "development",
        DEPLOYMENT_ENV: "testing",
      }),
      MODE_OFF
    );
  });

  it("is not inferred from hostname-like env", () => {
    assert.equal(
      getBlessBoardTenantRoutingMode({
        BASE_DOMAIN: "blessboard.org",
        HOST: "tenant.blessboard.org",
      }),
      MODE_OFF
    );
  });
});

describe("evaluateTenantRoute policy", () => {
  const basePlatform = {
    enabled: true,
    resultType: "resolved_tenant",
    resolution: {
      product: { key: "blessboard", status: "active" },
      organization: { id: "org-1", key: "demo-church", status: "active" },
      organizationProduct: { status: "active" },
    },
  };
  const baseCatalogue = {
    enabled: true,
    applicable: true,
    resultType: "resolved",
    church: {
      id: "ch-1",
      churchKey: "demo-church",
      displayName: "Demo Church",
      dataEnvironment: "testing",
    },
    hqBranch: { id: "hq-1", branchKey: "hq", displayName: "HQ" },
    primaryBranch: { id: "br-1", branchKey: "main", displayName: "Main Campus" },
  };

  it("apex always skips", () => {
    const d = evaluateTenantRoute({
      routingMode: "authoritative",
      isApex: true,
      path: "/",
      platformHostContext: basePlatform,
      blessBoardCatalogueContext: baseCatalogue,
    });
    assert.equal(d.outcome, OUTCOME.SKIP);
  });

  it("off returns foundation without authoritative tenant", () => {
    const d = evaluateTenantRoute({
      routingMode: "off",
      isApex: false,
      path: "/",
      platformHostContext: basePlatform,
      blessBoardCatalogueContext: baseCatalogue,
    });
    assert.equal(d.outcome, OUTCOME.FOUNDATION);
    assert.equal(d.authoritative, false);
    assert.equal(d.tenant, null);
  });

  it("shadow match keeps foundation and non-authoritative tenant proposal", () => {
    const d = evaluateTenantRoute({
      routingMode: "shadow",
      isApex: false,
      path: "/",
      platformHostContext: basePlatform,
      blessBoardCatalogueContext: baseCatalogue,
    });
    assert.equal(d.outcome, OUTCOME.FOUNDATION);
    assert.equal(d.authoritative, false);
    assert.ok(d.tenant);
    assert.equal(d.tenant.church.displayName, "Demo Church");
  });

  it("authoritative match renders tenant", () => {
    const d = evaluateTenantRoute({
      routingMode: "authoritative",
      isApex: false,
      path: "/",
      platformHostContext: basePlatform,
      blessBoardCatalogueContext: baseCatalogue,
    });
    assert.equal(d.outcome, OUTCOME.RENDER_TENANT);
    assert.equal(d.authoritative, true);
    assert.equal(d.httpStatus, 200);
  });

  it("unknown_domain → 404 in authoritative", () => {
    const d = evaluateTenantRoute({
      routingMode: "authoritative",
      isApex: false,
      path: "/",
      platformHostContext: { enabled: true, resultType: "unknown_domain" },
      blessBoardCatalogueContext: null,
    });
    assert.equal(d.outcome, OUTCOME.NOT_FOUND);
    assert.equal(d.httpStatus, 404);
  });

  it("inactive_domain → 404 in authoritative", () => {
    const d = evaluateTenantRoute({
      routingMode: "authoritative",
      isApex: false,
      path: "/",
      platformHostContext: { enabled: true, resultType: "inactive_domain" },
      blessBoardCatalogueContext: null,
    });
    assert.equal(d.outcome, OUTCOME.NOT_FOUND);
  });

  it("deployment_mismatch → 404 in authoritative", () => {
    const d = evaluateTenantRoute({
      routingMode: "authoritative",
      isApex: false,
      path: "/",
      platformHostContext: { enabled: true, resultType: "deployment_mismatch" },
      blessBoardCatalogueContext: null,
    });
    assert.equal(d.outcome, OUTCOME.NOT_FOUND);
  });

  it("inactive_product → 503 in authoritative", () => {
    const d = evaluateTenantRoute({
      routingMode: "authoritative",
      isApex: false,
      path: "/",
      platformHostContext: { enabled: true, resultType: "inactive_product" },
      blessBoardCatalogueContext: null,
    });
    assert.equal(d.outcome, OUTCOME.UNAVAILABLE);
    assert.equal(d.httpStatus, 503);
  });

  it("inactive_organization → 503", () => {
    const d = evaluateTenantRoute({
      routingMode: "authoritative",
      isApex: false,
      path: "/",
      platformHostContext: { enabled: true, resultType: "inactive_organization" },
      blessBoardCatalogueContext: null,
    });
    assert.equal(d.outcome, OUTCOME.UNAVAILABLE);
  });

  it("inactive_enrolment → 503", () => {
    const d = evaluateTenantRoute({
      routingMode: "authoritative",
      isApex: false,
      path: "/",
      platformHostContext: { enabled: true, resultType: "inactive_enrolment" },
      blessBoardCatalogueContext: null,
    });
    assert.equal(d.outcome, OUTCOME.UNAVAILABLE);
  });

  it("church_missing → 503", () => {
    const d = evaluateTenantRoute({
      routingMode: "authoritative",
      isApex: false,
      path: "/",
      platformHostContext: basePlatform,
      blessBoardCatalogueContext: {
        enabled: true,
        applicable: true,
        resultType: "church_missing",
      },
    });
    assert.equal(d.outcome, OUTCOME.UNAVAILABLE);
    assert.equal(d.reason, "church_missing");
  });

  it("church_inactive → 503", () => {
    const d = evaluateTenantRoute({
      routingMode: "authoritative",
      isApex: false,
      path: "/",
      platformHostContext: basePlatform,
      blessBoardCatalogueContext: {
        enabled: true,
        applicable: true,
        resultType: "church_inactive",
      },
    });
    assert.equal(d.outcome, OUTCOME.UNAVAILABLE);
  });

  it("hq_branch_missing → 503", () => {
    const d = evaluateTenantRoute({
      routingMode: "authoritative",
      isApex: false,
      path: "/",
      platformHostContext: basePlatform,
      blessBoardCatalogueContext: {
        enabled: true,
        applicable: true,
        resultType: "hq_branch_missing",
      },
    });
    assert.equal(d.outcome, OUTCOME.UNAVAILABLE);
  });

  it("primary_branch_missing → 503", () => {
    const d = evaluateTenantRoute({
      routingMode: "authoritative",
      isApex: false,
      path: "/",
      platformHostContext: basePlatform,
      blessBoardCatalogueContext: {
        enabled: true,
        applicable: true,
        resultType: "primary_branch_missing",
      },
    });
    assert.equal(d.outcome, OUTCOME.UNAVAILABLE);
  });

  it("catalogue_lookup_error → 503", () => {
    const d = evaluateTenantRoute({
      routingMode: "authoritative",
      isApex: false,
      path: "/",
      platformHostContext: basePlatform,
      blessBoardCatalogueContext: {
        enabled: true,
        applicable: true,
        resultType: "catalogue_lookup_error",
      },
    });
    assert.equal(d.outcome, OUTCOME.UNAVAILABLE);
  });

  it("shadow failures still return foundation (not error pages)", () => {
    const d = evaluateTenantRoute({
      routingMode: "shadow",
      isApex: false,
      path: "/",
      platformHostContext: { enabled: true, resultType: "unknown_domain" },
      blessBoardCatalogueContext: null,
    });
    assert.equal(d.outcome, OUTCOME.FOUNDATION);
    assert.equal(d.httpStatus, 200);
  });
});
