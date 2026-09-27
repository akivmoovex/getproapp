"use strict";

/**
 * Architecture guard: src/platform must not hard-require product implementation
 * packages except documented composition-root / legacy-bridge exceptions (E).
 *
 * Allowlist SoT: scripts/architecture/dependencyDirectionAllowlists.js (PC15).
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  scanPlatformToProduct,
  PLATFORM_PRODUCT_REQUIRE_ALLOWLIST,
  formatOffenders,
} = require("../scripts/architecture/dependencyDirection");

const PLATFORM_ROOT = path.join(__dirname, "..", "src", "platform");

describe("PC03 architecture — platform must not hard-require product packages", () => {
  it("only allowlisted platform files may require blessboard/church/activeclinic", () => {
    const result = scanPlatformToProduct();
    assert.equal(
      result.ok,
      true,
      `New platform→product requires (register via productRuntimeRegistry instead):\n${formatOffenders(
        result.offenders
      )}`
    );
  });

  it("allowlist entries exist on disk", () => {
    for (const rel of PLATFORM_PRODUCT_REQUIRE_ALLOWLIST) {
      const abs = path.join(PLATFORM_ROOT, rel);
      assert.equal(fs.existsSync(abs), true, `missing allowlist file ${rel}`);
    }
  });
});

module.exports = {
  PLATFORM_PRODUCT_REQUIRE_ALLOWLIST,
};
