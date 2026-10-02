"use strict";

/**
 * V2.04 AC invitation origin — V8 testing must mint neuniversity links.
 * Verifies URL host + token preservation + deployment pairing (no session).
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("crypto");

const {
  resolvePublicOrigin,
  buildActivationUrl,
} = require("../src/activeclinic/services/activeClinicShareLinks");
const {
  publicOriginForProduct,
  publicOriginFromDeploymentForProduct,
  PRODUCT_CODE,
} = require("../src/platform/website/publicWebsiteUrl");
const { hashSessionToken } = require("../src/platform/session/sessionToken");

const V8_CODE = "moovex-platform-v8-testing";
const V8_ORIGIN = "https://activeclinic.neuniversity.org";
const V7_TESTING_ORIGIN = "https://activeclinic.pronline.org";
const PROD_ORIGIN = "https://activeclinic.org";

describe("V2.04 AC invitation V8 origin", () => {
  const v8Env = {
    DEPLOYMENT_ENV: "testing",
    NODE_ENV: "production",
    PLATFORM_DEPLOYMENT_CODE: V8_CODE,
    DATABASE_IDENTITY_ENV: "testing",
    BASE_DOMAIN: "neuniversity.org",
  };

  it("1. v8 testing → activeclinic.neuniversity.org", () => {
    assert.equal(resolvePublicOrigin(v8Env, V8_CODE), V8_ORIGIN);
    assert.equal(
      publicOriginFromDeploymentForProduct(PRODUCT_CODE.ACTIVECLINIC, v8Env, V8_CODE),
      V8_ORIGIN
    );
    assert.equal(publicOriginForProduct(PRODUCT_CODE.ACTIVECLINIC, v8Env), V8_ORIGIN);
  });

  it("2. activation URL preserves full token (encodeURIComponent)", () => {
    const rawToken = crypto.randomBytes(32).toString("base64url");
    const url = buildActivationUrl({
      env: v8Env,
      deploymentCode: V8_CODE,
      rawToken,
    });
    assert.equal(url, `${V8_ORIGIN}/activate/${encodeURIComponent(rawToken)}`);
    const pathToken = url.slice(`${V8_ORIGIN}/activate/`.length);
    assert.equal(decodeURIComponent(pathToken), rawToken);
  });

  it("3. token mint host matches consumption deployment code (pairing)", () => {
    const rawToken = crypto.randomBytes(32).toString("base64url");
    const url = buildActivationUrl({
      env: v8Env,
      deploymentCode: V8_CODE,
      rawToken,
    });
    assert.ok(url.startsWith(V8_ORIGIN));
    // Same representation used at mint and lookup (hash of raw path token).
    const pathToken = decodeURIComponent(url.slice(`${V8_ORIGIN}/activate/`.length));
    assert.equal(pathToken, rawToken);
    assert.equal(hashSessionToken(pathToken), hashSessionToken(rawToken));
    assert.equal(V8_CODE, "moovex-platform-v8-testing");
  });

  it("4–5. fresh browser / no cookie-session required for URL resolution", () => {
    // Origin resolution is pure env/deployment — no req cookies/session.
    const a = resolvePublicOrigin({ ...v8Env }, V8_CODE);
    const b = resolvePublicOrigin({ ...v8Env }, V8_CODE);
    assert.equal(a, b);
    assert.equal(a, V8_ORIGIN);
  });

  it("6. production origin unchanged", () => {
    assert.equal(
      resolvePublicOrigin(
        {
          DEPLOYMENT_ENV: "production",
          NODE_ENV: "production",
          PLATFORM_DEPLOYMENT_CODE: "activeclinic-org-production",
        },
        "activeclinic-org-production"
      ),
      PROD_ORIGIN
    );
    assert.equal(
      publicOriginForProduct(PRODUCT_CODE.ACTIVECLINIC, {
        DEPLOYMENT_ENV: "production",
        NODE_ENV: "production",
      }),
      PROD_ORIGIN
    );
  });

  it("7. BlessBoard V7 testing / production origins unchanged", () => {
    assert.equal(
      publicOriginForProduct(PRODUCT_CODE.BLESSBOARD, { NODE_ENV: "test" }),
      "https://blessboard.pronline.org"
    );
    assert.equal(
      publicOriginForProduct(PRODUCT_CODE.BLESSBOARD, {
        NODE_ENV: "production",
        DEPLOYMENT_ENV: "production",
      }),
      "https://blessboard.com"
    );
    assert.equal(
      publicOriginForProduct(PRODUCT_CODE.BLESSBOARD, {
        DEPLOYMENT_ENV: "testing",
        PLATFORM_DEPLOYMENT_CODE: "moovex-platform-testing",
        BASE_DOMAIN: "pronline.org",
      }),
      "https://blessboard.pronline.org"
    );
  });

  it("8. stale activeclinic.pronline.org not used for v8-testing invite links", () => {
    const url = buildActivationUrl({
      env: v8Env,
      deploymentCode: V8_CODE,
      rawToken: "abc",
    });
    assert.equal(url.includes("activeclinic.pronline.org"), false);
    assert.equal(url.startsWith(V8_ORIGIN), true);
    // V7 testing profile still uses pronline (legacy preserved).
    assert.equal(
      resolvePublicOrigin(
        {
          DEPLOYMENT_ENV: "testing",
          PLATFORM_DEPLOYMENT_CODE: "moovex-platform-testing",
          BASE_DOMAIN: "pronline.org",
        },
        "moovex-platform-testing"
      ),
      V7_TESTING_ORIGIN
    );
  });
});
