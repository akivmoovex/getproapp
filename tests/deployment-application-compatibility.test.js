"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  isUnifiedPlatformApplication,
  deploymentAllowsPlatformIdentityPrincipal,
  deploymentAllowsBlessBoardPrincipal,
  deploymentMatchesExpectedProduct,
  resolveSessionExpectedProductCode,
} = require("../src/platform/session/deploymentApplicationCompatibility");
const {
  CODE_MOOVEX_PLATFORM_TESTING,
  CODE_ACTIVECLINIC_ORG_V6,
} = require("../src/platform/config/deploymentProfiles");

describe("deployment application compatibility", () => {
  it("treats platform as unified without allowing every principal on every product", () => {
    assert.equal(isUnifiedPlatformApplication("platform"), true);
    assert.equal(isUnifiedPlatformApplication("activeclinic"), false);

    assert.equal(deploymentAllowsPlatformIdentityPrincipal("activeclinic"), true);
    assert.equal(deploymentAllowsPlatformIdentityPrincipal("platform"), true);
    assert.equal(deploymentAllowsPlatformIdentityPrincipal("blessboard"), false);

    assert.equal(deploymentAllowsBlessBoardPrincipal("blessboard"), true);
    assert.equal(deploymentAllowsBlessBoardPrincipal("platform"), true);
    assert.equal(deploymentAllowsBlessBoardPrincipal("activeclinic"), false);
  });

  it("matches expected product against unified or product-specific deployments", () => {
    assert.equal(deploymentMatchesExpectedProduct("platform", "activeclinic"), true);
    assert.equal(deploymentMatchesExpectedProduct("platform", "blessboard"), true);
    assert.equal(deploymentMatchesExpectedProduct("activeclinic", "activeclinic"), true);
    assert.equal(deploymentMatchesExpectedProduct("activeclinic", "blessboard"), false);
    assert.equal(deploymentMatchesExpectedProduct("blessboard", "activeclinic"), false);
  });

  it("resolves expected product from hostname first, then product-specific profile", () => {
    assert.equal(
      resolveSessionExpectedProductCode(
        { platform: { productKey: "activeclinic" } },
        { PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING }
      ),
      "activeclinic"
    );
    assert.equal(
      resolveSessionExpectedProductCode(
        { platform: { productKey: "blessboard" } },
        { PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING }
      ),
      "blessboard"
    );
    assert.equal(
      resolveSessionExpectedProductCode(
        {},
        { PLATFORM_DEPLOYMENT_CODE: CODE_ACTIVECLINIC_ORG_V6 }
      ),
      "activeclinic"
    );
    assert.equal(
      resolveSessionExpectedProductCode(
        { platform: { productKey: "platform" } },
        { PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_TESTING }
      ),
      null
    );
  });
});
