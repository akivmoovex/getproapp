"use strict";

/**
 * V10 DBCL10 — Post-cutover dead code sweep characterization.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

describe("V10 DBCL10 post-cutover dead code sweep", () => {
  it("deletes empty statusCompatibility and AC public schema stub", () => {
    assert.equal(
      fs.existsSync(path.join(ROOT, "src/platform/registration/statusCompatibility.js")),
      false
    );
    assert.equal(
      fs.existsSync(path.join(ROOT, "src/activeclinic/services/activeClinicPublicSchemaStatus.js")),
      false
    );
  });

  it("removes frozen user_roles writer stubs from auth repository", () => {
    const auth = fs.readFileSync(
      path.join(ROOT, "src/blessboard/repositories/blessBoardAuthRepository.js"),
      "utf8"
    );
    assert.doesNotMatch(auth, /async function insertRole\b/);
    assert.doesNotMatch(auth, /async function updateRoleStatus\b/);
    assert.doesNotMatch(auth, /^\s*insertRole,/m);
    assert.doesNotMatch(auth, /^\s*updateRoleStatus,/m);
  });

  it("lifecycle exports only toCanonicalLifecycle (helpers stay private)", () => {
    const life = require("../src/platform/registration/lifecycle");
    assert.equal(typeof life.toCanonicalLifecycle, "function");
    assert.equal(life.fromActiveClinic, undefined);
    assert.equal(life.fromBlessBoard, undefined);
    assert.equal(life.isReviewHold, undefined);
    assert.equal(life.isOperational, undefined);
  });

  it("does not remove dual-write / bridge / migrator KEEP surfaces", () => {
    const keepFiles = [
      "src/platform/website-engine/blessboardBridge.js",
      "src/platform/schema/v8DbCompatibilityContract.js",
      "src/blessboard/services/organizationKeyCompat.js",
      "src/migration/v4ToV5",
      "src/migration/v5ToV7",
      "server.legacy.js",
      "src/platform/http/compareLegacyHostContext.js",
    ];
    for (const rel of keepFiles) {
      assert.ok(fs.existsSync(path.join(ROOT, rel)), `missing KEEP ${rel}`);
    }
    const publish = fs.readFileSync(
      path.join(ROOT, "src/blessboard/services/churchWebsitePublishService.js"),
      "utf8"
    );
    assert.match(publish, /publishFromLegacy/);
  });
});
