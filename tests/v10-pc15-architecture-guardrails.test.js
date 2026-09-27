"use strict";

/**
 * V10 PC15 — Architecture guardrails.
 *
 * Fails clearly when dependency direction is violated:
 *   DENY platform → product implementation (except Class E allowlist)
 *   DENY BB → AC implementation
 *   DENY AC → BB / church implementation (except documented exceptions)
 *
 * Does NOT enforce theme / navigation / domain catalogue sharing.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  assertDependencyDirection,
  scanPlatformToProduct,
  scanCrossProduct,
  PLATFORM_PRODUCT_REQUIRE_ALLOWLIST,
  CROSS_PRODUCT_REQUIRE_ALLOWLIST,
  formatOffenders,
} = require("../scripts/architecture/dependencyDirection");

const ROOT = path.resolve(__dirname, "..");

describe("PC15 architecture guardrails", () => {
  it("enforces platform↛product and BB↛AC / AC↛BB direction", () => {
    const result = assertDependencyDirection();
    assert.equal(result.ok, true);
    assert.ok(result.platformAllowlistSize >= 1);
  });

  it("platform→product scan matches PC03 allowlist size on disk", () => {
    const platform = scanPlatformToProduct();
    assert.equal(
      platform.ok,
      true,
      formatOffenders(platform.offenders)
    );
    for (const rel of PLATFORM_PRODUCT_REQUIRE_ALLOWLIST) {
      assert.equal(
        fs.existsSync(path.join(ROOT, "src", "platform", rel)),
        true,
        rel
      );
    }
  });

  it("cross-product scan reports zero unexplained edges", () => {
    const cross = scanCrossProduct();
    assert.equal(cross.ok, true, formatOffenders(cross.offenders));
    assert.ok(CROSS_PRODUCT_REQUIRE_ALLOWLIST.length >= 1);
  });

  it("documents developer search rule for platform-first infrastructure", () => {
    const rulePath = path.join(
      ROOT,
      ".cursor",
      "rules",
      "platform-architecture-guardrails.mdc"
    );
    const docsPath = path.join(
      ROOT,
      "docs",
      "platform",
      "PLATFORM_ARCHITECTURE_GUARDRAILS.md"
    );
    assert.equal(fs.existsSync(rulePath), true, "missing cursor rule");
    assert.equal(fs.existsSync(docsPath), true, "missing docs SoT");
    const rule = fs.readFileSync(rulePath, "utf8");
    const docs = fs.readFileSync(docsPath, "utf8");
    for (const body of [rule, docs]) {
      assert.match(body, /src\/platform/);
      assert.match(body, /views\/platform/);
      assert.match(body, /public\/platform/);
      assert.match(body, /Generic mechanism/);
      assert.match(body, /Domain semantics/);
      assert.doesNotMatch(body, /force identical themes/);
    }
  });

  it("CLI scanner exits clean on current tree", () => {
    const { spawnSync } = require("child_process");
    const script = path.join(ROOT, "scripts", "architecture", "dependencyDirection.js");
    const run = spawnSync(process.execPath, [script], {
      encoding: "utf8",
      cwd: ROOT,
    });
    assert.equal(run.status, 0, run.stderr || run.stdout);
    const parsed = JSON.parse(run.stdout);
    assert.equal(parsed.ok, true);
  });
});
