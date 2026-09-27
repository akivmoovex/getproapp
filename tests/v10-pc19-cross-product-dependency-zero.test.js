"use strict";

/**
 * V10 PC19 — Cross-product dependency verification.
 *
 * Runtime implementation requires must be:
 *   BB → AC = 0
 *   AC → BB/church = 0
 *
 * Platform composition roots may still require products via PC15 Class E allowlist.
 * Test harness cross-imports are out of scope for this gate.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  scanCrossProduct,
  assertDependencyDirection,
  CROSS_PRODUCT_REQUIRE_ALLOWLIST,
  formatOffenders,
} = require("../scripts/architecture/dependencyDirection");

const ROOT = path.resolve(__dirname, "..");
const REQUIRE_RE = /require\s*\(\s*["']([^"']+)["']\s*\)/g;

function walkJs(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.includes(" 2.") || ent.name.includes(" 3.")) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkJs(full, acc);
    else if (ent.name.endsWith(".js")) acc.push(full);
  }
  return acc;
}

function collectRequires(absFile) {
  const text = fs.readFileSync(absFile, "utf8");
  const hits = [];
  REQUIRE_RE.lastIndex = 0;
  let m;
  while ((m = REQUIRE_RE.exec(text))) hits.push(m[1]);
  // Dynamic require("…blessboard…") / require(`…`) string forms already covered.
  // Also flag require("../../church/…") style.
  return hits;
}

function isChurchImpl(req) {
  const n = String(req || "").replace(/\\/g, "/");
  return /(^|\/)church\//.test(n) || n.includes("../church/") || n.includes("/church/");
}

describe("PC19 cross-product dependency zero", () => {
  it("scanner reports zero cross-product offenders and empty allowlist", () => {
    const cross = scanCrossProduct();
    assert.equal(cross.ok, true, formatOffenders(cross.offenders));
    assert.equal(CROSS_PRODUCT_REQUIRE_ALLOWLIST.length, 0);
    const full = assertDependencyDirection();
    assert.equal(full.ok, true, formatOffenders(full.offenders || []));
  });

  it("AC runtime has zero blessboard/church implementation requires", () => {
    const offenders = [];
    for (const file of walkJs(path.join(ROOT, "src/activeclinic"))) {
      for (const req of collectRequires(file)) {
        if (req.includes("blessboard") || isChurchImpl(req)) {
          offenders.push(`${path.relative(ROOT, file)} → ${req}`);
        }
      }
    }
    assert.deepEqual(offenders, []);
  });

  it("BB runtime has zero activeclinic implementation requires", () => {
    const offenders = [];
    for (const file of walkJs(path.join(ROOT, "src/blessboard"))) {
      for (const req of collectRequires(file)) {
        if (req.includes("activeclinic")) {
          offenders.push(`${path.relative(ROOT, file)} → ${req}`);
        }
      }
    }
    assert.deepEqual(offenders, []);
  });

  it("AC and orgDataEnvironment use platform deploymentEnv; blessBoardEnv re-exports mode helpers", () => {
    const acPublic = fs.readFileSync(
      path.join(ROOT, "src/activeclinic/http/activeClinicPublicRoutes.js"),
      "utf8"
    );
    const acAdmin = fs.readFileSync(
      path.join(
        ROOT,
        "src/activeclinic/http/activeClinicPlatformAdminClinicRegistrationRoutes.js"
      ),
      "utf8"
    );
    const orgData = fs.readFileSync(
      path.join(ROOT, "src/church/orgDataEnvironment.js"),
      "utf8"
    );
    assert.match(acPublic, /platform\/config\/deploymentEnv/);
    assert.match(acAdmin, /platform\/config\/deploymentEnv/);
    assert.match(orgData, /platform\/config\/deploymentEnv/);
    assert.doesNotMatch(acPublic, /church\/blessBoardEnv/);
    assert.doesNotMatch(acAdmin, /church\/blessBoardEnv/);
    assert.doesNotMatch(orgData, /require\(["']\.\/blessBoardEnv["']\)/);

    const churchEnv = fs.readFileSync(
      path.join(ROOT, "src/church/blessBoardEnv.js"),
      "utf8"
    );
    assert.match(churchEnv, /platform\/config\/deploymentEnv/);
    assert.match(churchEnv, /getDeploymentEnvMode/);

    const platform = require("../src/platform/config/deploymentEnv");
    const church = require("../src/church/blessBoardEnv");
    assert.equal(church.getDeploymentEnvMode, platform.getDeploymentEnvMode);
    assert.equal(platform.getDeploymentEnvMode({ DEPLOYMENT_ENV: "testing" }), "testing");
    assert.equal(platform.getDeploymentEnvMode({ DEPLOYMENT_ENV: "production" }), "production");
  });
});
