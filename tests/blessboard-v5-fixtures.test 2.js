"use strict";

/**
 * Unit checks for tests/helpers/blessboardV5Fixtures.js (no database).
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  V5_DEPLOYMENT_CODE,
  V5_IDENTITY_KEY,
  V5_DATA_ENVIRONMENT,
  baseV5TestEnv,
  makeTenant,
  makeResolvedTenantContext,
  assertUuidId,
  joinCookieHeader,
} = require("./helpers/blessboardV5Fixtures");

const ORG = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CHURCH = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const HQ = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const CAMPUS = "dddddddd-dddd-dddd-dddd-dddddddddddd";

describe("blessboard V5 fixtures helper", () => {
  it("exports stable deployment / identity constants", () => {
    assert.equal(V5_DEPLOYMENT_CODE, "blessboard-org-staging");
    assert.equal(V5_IDENTITY_KEY, "blessboard-platform-v5");
    assert.equal(V5_DATA_ENVIRONMENT, "testing");
  });

  it("baseV5TestEnv pairs deployment with session defaults", () => {
    const env = baseV5TestEnv({ BLESSBOARD_TENANT_ROUTING_MODE: "shadow" });
    assert.equal(env.PLATFORM_DEPLOYMENT_CODE, V5_DEPLOYMENT_CODE);
    assert.equal(env.BLESSBOARD_TENANT_ROUTING_MODE, "shadow");
    assert.ok(String(env.SESSION_SECRET).length >= 32);
  });

  it("rejects display-name / key strings as relationship ids", () => {
    assert.throws(() => assertUuidId("demo-church", "organization.id"), /UUID/);
    assert.throws(
      () =>
        makeTenant(
          { id: "Demo Church", display_name: "Demo Church" },
          { id: ORG },
          { id: HQ }
        ),
      /church\.id/
    );
  });

  it("keeps hqBranch distinct from campus primaryBranch", () => {
    const tenant = makeResolvedTenantContext({
      organization: { id: ORG, organization_key: "att-a" },
      church: { id: CHURCH, church_key: "att-a", display_name: "Att Church A" },
      primaryBranch: { id: CAMPUS, branch_key: "campus", display_name: "Campus A" },
      hqBranch: { id: HQ, branch_key: "hq", display_name: "HQ A" },
    });
    assert.equal(tenant.resolved, true);
    assert.equal(tenant.primaryBranch.id, CAMPUS);
    assert.equal(tenant.hqBranch.id, HQ);
    assert.equal(tenant.organization.key, "att-a");
    assert.equal(tenant.church.displayName, "Att Church A");
  });

  it("positional makeTenant defaults hqBranch to primary when omitted", () => {
    const tenant = makeTenant(
      { id: CHURCH, display_name: "HQ only" },
      { id: ORG },
      { id: HQ }
    );
    assert.equal(tenant.hqBranch.id, HQ);
    assert.equal(tenant.primaryBranch.id, HQ);
  });

  it("joinCookieHeader drops empty parts", () => {
    assert.equal(joinCookieHeader("a=1", null, "b=2"), "a=1; b=2");
  });
});
