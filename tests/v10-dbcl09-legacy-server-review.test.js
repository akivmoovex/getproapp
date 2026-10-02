"use strict";

/**
 * V10 DBCL09 — Legacy server retirement proof (characterization only).
 * Pins ACTIVE classification: server.legacy.js remains a live bootstrap consumer.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

const {
  resolveDeploymentConfiguration,
  validateAuthoritativeProfileCompatibility,
  RUNTIME_V5_FOUNDATION,
  CODE_GETPROAPP_ORG_PRODUCTION,
  CODE_GETPRO_PRONLINE_TESTING,
  CODE_MOOVEX_PLATFORM_TESTING,
  DEPLOYMENT_PROFILES,
} = require("../src/platform/config/deploymentProfiles");
const { isV5FoundationMode } = require("../src/platform/config/v5FoundationMode");

function serverBranch(env) {
  const deployment = resolveDeploymentConfiguration(env);
  const runtimeMode = deployment.runtimeMode;
  if (
    runtimeMode === RUNTIME_V5_FOUNDATION ||
    runtimeMode === "legacy-redirect" ||
    (!runtimeMode && isV5FoundationMode(env))
  ) {
    return "foundation";
  }
  if (!runtimeMode) return "server.legacy";
  return `unsupported:${runtimeMode}`;
}

describe("V10 DBCL09 legacy server review", () => {
  it("server.js still requires server.legacy on unprofiled path", () => {
    const serverSrc = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
    assert.match(serverSrc, /require\(["']\.\/server\.legacy["']\)/);
    assert.ok(fs.existsSync(path.join(ROOT, "server.legacy.js")));
  });

  it("unset PLATFORM_DEPLOYMENT_CODE is allowed and maps to server.legacy", () => {
    const env = {};
    const compat = validateAuthoritativeProfileCompatibility(env);
    assert.equal(compat.ok, true, "unset profile must remain allowed or deletion becomes safe");
    assert.equal(serverBranch(env), "server.legacy");
  });

  it("authoritative GetPro / Moovex profiles use foundation — not server.legacy", () => {
    assert.equal(
      serverBranch({
        PLATFORM_DEPLOYMENT_CODE: CODE_GETPRO_PRONLINE_TESTING,
        DEPLOYMENT_ENV: "testing",
      }),
      "foundation"
    );
    assert.equal(
      serverBranch({
        PLATFORM_DEPLOYMENT_CODE: CODE_GETPROAPP_ORG_PRODUCTION,
        DEPLOYMENT_ENV: "production",
      }),
      "foundation"
    );
    assert.equal(
      DEPLOYMENT_PROFILES[CODE_GETPROAPP_ORG_PRODUCTION].runtimeMode,
      RUNTIME_V5_FOUNDATION
    );
    assert.equal(
      DEPLOYMENT_PROFILES[CODE_MOOVEX_PLATFORM_TESTING].runtimeMode,
      RUNTIME_V5_FOUNDATION
    );
  });

  it("compareLegacyHostContext runtime consumer is server.legacy only", () => {
    const compareSrc = fs.readFileSync(
      path.join(ROOT, "src/platform/http/compareLegacyHostContext.js"),
      "utf8"
    );
    assert.match(compareSrc, /createCompareLegacyHostContext/);

    const legacy = fs.readFileSync(path.join(ROOT, "server.legacy.js"), "utf8");
    assert.match(legacy, /createCompareLegacyHostContext/);

    const foundation = fs.readFileSync(
      path.join(ROOT, "src/platform/http/v5FoundationServer.js"),
      "utf8"
    );
    assert.doesNotMatch(foundation, /createCompareLegacyHostContext/);

    const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    assert.match(String(packageJson.scripts.dev || ""), /server\.legacy\.js/);
  });

  it("no registered profile runtimeMode targets the legacy file", () => {
    for (const [code, profile] of Object.entries(DEPLOYMENT_PROFILES)) {
      assert.ok(
        profile.runtimeMode === RUNTIME_V5_FOUNDATION ||
          profile.runtimeMode === "legacy-redirect",
        `${code} unexpected runtimeMode ${profile.runtimeMode}`
      );
    }
  });
});
