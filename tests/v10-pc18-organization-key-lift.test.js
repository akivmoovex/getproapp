"use strict";

/**
 * V10 PC18 — Organization key lift characterization.
 *
 * Captures exact slug/normalize/resolve/suffix behavior before/after moving
 * the helper from BlessBoard into platform. Church-specific URL/compat helpers
 * stay product-local (organizationKeyCompat, churchUrlHelper).
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

/** Golden vectors locked against pre-lift BlessBoard behavior. */
const SLUGIFY_CASES = [
  ["Grace Community Church", "grace-community-church"],
  ["  Juflona Hospital & Medical Centre  ", "juflona-hospital-medical-centre"],
  ["Café Église", "cafe-eglise"],
  ["123 Numbers First", "c-123-numbers-first"],
  ["---", ""],
  ["", ""],
  ["A".repeat(80), "a".repeat(64)],
];

const NORMALIZE_CASES = [
  ["grace-community-church", { ok: true, key: "grace-community-church" }],
  ["HQ", { ok: false, reason: "reserved_key" }],
  ["admin", { ok: false, reason: "reserved_key" }],
  ["blessboard", { ok: false, reason: "reserved_key" }],
  ["!!!", { ok: false, reason: "invalid_key" }],
];

const RESOLVE_BASE_CASES = [
  ["Grace Community Church", { ok: true, key: "grace-community-church" }],
  ["admin", { ok: true, key: "admin-church" }], // reserved escape (historical -church suffix)
  ["hq", { ok: true, key: "hq-church" }],
];

const SUFFIX_CASES = [
  ["grace-community-church", 1, "grace-community-church"],
  ["grace-community-church", 2, "grace-community-church-02"],
  ["grace-community-church", 3, "grace-community-church-03"],
  ["grace-community-church", 10, "grace-community-church-10"],
];

function assertModuleContract(mod, label) {
  assert.equal(typeof mod.slugifyOrganizationKey, "function", label);
  assert.equal(typeof mod.normalizeOrganizationKey, "function", label);
  assert.equal(typeof mod.resolveBaseOrganizationKey, "function", label);
  assert.equal(typeof mod.withOrganizationKeySuffix, "function", label);
  assert.equal(typeof mod.isReservedOrganizationKey, "function", label);
  assert.ok(Array.isArray(mod.RESERVED_ORGANIZATION_KEYS), label);
  assert.ok(mod.RESERVED_ORGANIZATION_KEYS.includes("admin"), label);
  assert.ok(mod.RESERVED_ORGANIZATION_KEYS.includes("church"), label);
  assert.equal(mod.ORG_KEY_RE.test("grace-community-church"), true, label);
}

function assertBehavior(mod, label) {
  for (const [raw, expected] of SLUGIFY_CASES) {
    assert.equal(mod.slugifyOrganizationKey(raw), expected, `${label} slugify ${raw}`);
  }
  for (const [raw, expected] of NORMALIZE_CASES) {
    assert.deepEqual(mod.normalizeOrganizationKey(raw), expected, `${label} normalize ${raw}`);
  }
  for (const [raw, expected] of RESOLVE_BASE_CASES) {
    assert.deepEqual(mod.resolveBaseOrganizationKey(raw), expected, `${label} resolve ${raw}`);
  }
  for (const [base, n, expected] of SUFFIX_CASES) {
    assert.equal(mod.withOrganizationKeySuffix(base, n), expected, `${label} suffix ${n}`);
  }
  assert.equal(mod.isReservedOrganizationKey("Admin"), true, label);
  assert.equal(mod.isReservedOrganizationKey("grace"), false, label);
}

describe("PC18 organization key lift", () => {
  it("characterizes platform organizationKey as SoT; BB runtime callers import platform (PL06)", () => {
    const platformPath = path.join(ROOT, "src/platform/organization/organizationKey.js");
    const bbPath = path.join(ROOT, "src/blessboard/services/organizationKey.js");
    assert.equal(fs.existsSync(platformPath), true, "platform organizationKey missing");
    assert.equal(fs.existsSync(bbPath), true, "BB organizationKey thin re-export missing");

    const platform = require("../src/platform/organization/organizationKey");
    const bb = require("../src/blessboard/services/organizationKey");
    assertModuleContract(platform, "platform");
    assertModuleContract(bb, "blessboard");
    assertBehavior(platform, "platform");
    assertBehavior(bb, "blessboard");

    assert.equal(bb.slugifyOrganizationKey, platform.slugifyOrganizationKey);
    assert.equal(bb.normalizeOrganizationKey, platform.normalizeOrganizationKey);
    assert.equal(bb.resolveBaseOrganizationKey, platform.resolveBaseOrganizationKey);
    assert.equal(bb.withOrganizationKeySuffix, platform.withOrganizationKeySuffix);

    const editor = fs.readFileSync(
      path.join(ROOT, "src/blessboard/http/blessboardWebsiteEditorRoutes.js"),
      "utf8"
    );
    assert.match(editor, /platform\/organization\/organizationKey/);
    assert.doesNotMatch(editor, /services\/organizationKey/);
  });

  it("AC clinic approval and platform allocator consume platform, not BB", () => {
    const ac = fs.readFileSync(
      path.join(ROOT, "src/activeclinic/services/approveClinicRegistrationService.js"),
      "utf8"
    );
    const alloc = fs.readFileSync(
      path.join(ROOT, "src/platform/organization/allocateUniqueOrganizationKey.js"),
      "utf8"
    );
    assert.match(ac, /platform\/organization\/organizationKey/);
    assert.doesNotMatch(ac, /blessboard\/services\/organizationKey/);
    assert.match(alloc, /organization\/organizationKey|\.\/organizationKey/);
    assert.doesNotMatch(alloc, /blessboard\/services\/organizationKey/);
  });

  it("architecture: AC→BB organizationKey edge removed; BB→AC remains 0", () => {
    const {
      scanCrossProduct,
      CROSS_PRODUCT_REQUIRE_ALLOWLIST,
    } = require("../scripts/architecture/dependencyDirection");
    const cross = scanCrossProduct();
    assert.equal(cross.ok, true, require("../scripts/architecture/dependencyDirection").formatOffenders(cross.offenders));
    assert.equal(
      CROSS_PRODUCT_REQUIRE_ALLOWLIST.find((e) => e.includes("organizationKey")),
      undefined,
      "organizationKey must leave cross-product allowlist"
    );

    const { spawnSync } = require("child_process");
    const run = spawnSync(
      process.execPath,
      [path.join(ROOT, "scripts/architecture/dependencyDirection.js")],
      { encoding: "utf8", cwd: ROOT }
    );
    assert.equal(run.status, 0, run.stderr || run.stdout);
    assert.equal(JSON.parse(run.stdout).ok, true);

    const acRoot = path.join(ROOT, "src/activeclinic");
    function walk(dir, out = []) {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ent.name.startsWith(".")) continue;
        const abs = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(abs, out);
        else if (ent.name.endsWith(".js") && !ent.name.includes(" 2")) out.push(abs);
      }
      return out;
    }
    for (const file of walk(acRoot)) {
      const body = fs.readFileSync(file, "utf8");
      assert.doesNotMatch(
        body,
        /require\(["'][^"']*blessboard\/services\/organizationKey["']\)/,
        path.relative(ROOT, file)
      );
    }
  });

  it("keeps church-specific compat/URL helpers product-local", () => {
    assert.equal(
      fs.existsSync(path.join(ROOT, "src/blessboard/services/organizationKeyCompat.js")),
      true
    );
    assert.equal(
      fs.existsSync(path.join(ROOT, "src/blessboard/urls/churchUrlHelper.js")),
      true
    );
    const platformOrg = fs.readFileSync(
      path.join(ROOT, "src/platform/organization/organizationKey.js"),
      "utf8"
    );
    assert.doesNotMatch(platformOrg, /legacyBranchKeyRedirectTarget|publicChurchHomePath/);
  });
});
