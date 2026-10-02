"use strict";

/**
 * V2.04 — release-sensitive browser assets must use the current cache-bust stamp.
 * Static files stay long-cacheable; URL `?v=` must change when V2.04 theme/editor
 * assets change so hosted browsers do not keep pre-hotfix CSS/JS.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const {
  V204_BROWSER_ASSET_VERSION,
} = require("../src/platform/ui/theme/browserAssetVersion");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** Pre-hotfix / pre-V2.04 stamps that must not remain on release-sensitive asset URLs. */
const FORBIDDEN_STALE_URL_PATTERNS = [
  /ac-auth\.css\?v=(?:v7-login-stitch-parity-1|v2-03-[^"'&\s]+)/,
  /ac-tokens\.css\?v=(?:v7-login-stitch-parity-1|v2-03-[^"'&\s]+)/,
  /colors\.css\?v=(?:v204-b5|v204-b7|v2-03-[^"'&\s]+)/,
  /design-tokens\.css\?v=(?:v204-b5|v204-b7)/,
  /website-inline-edit\.js\?v=(?:v2-img-editor-3|v2-sp-vis-1|v2-u1c-[^"'&\s]+)/,
  /website-inline-edit\.css\?v=(?:v2-u1c-dialogs-1|v204-b5)/,
  /ASSET_VERSION\s*=\s*"(?:v7-login-stitch-parity-1|v2-03-build-identity-1|v2-03-b3-acp05-01|v2-sp-vis-1)"/,
  /SHELL_ASSET_VERSION\s*=\s*"(?:v2-03-acn18-01)"/,
  /platformColorVersion[^;]*'v204-b5'/,
  /designSystemVersion[^;]*'v204-b7'/,
];

const RELEASE_SENSITIVE_SOURCES = [
  "src/activeclinic/http/renderActiveClinicAuth.js",
  "src/activeclinic/http/renderActiveClinicPublic.js",
  "src/activeclinic/http/renderActiveClinicPatient.js",
  "src/activeclinic/services/buildActiveClinicShellViewModel.js",
  "src/platform/website/renderWebsiteManagementPage.js",
  "views/platform/partials/head-platform-colors.ejs",
  "views/blessboard/v5/partials/head-design-system.ejs",
  "views/blessboard/v5/partials/tenant-public-shell-start.ejs",
  "views/blessboard/v5/partials/tenant-public-shell-end.ejs",
  "views/blessboard/v5/partials/hq-shell-start.ejs",
  "views/blessboard/v5/partials/branch-admin-shell-start.ejs",
  "views/activeclinic/layouts/auth-shell.ejs",
  "views/activeclinic/layouts/public-shell.ejs",
];

describe("V2.04 static asset cache versioning", () => {
  it("exports a non-empty centralized browser asset version", () => {
    assert.equal(typeof V204_BROWSER_ASSET_VERSION, "string");
    assert.ok(V204_BROWSER_ASSET_VERSION.length > 0);
    assert.match(V204_BROWSER_ASSET_VERSION, /^v204-/);
  });

  it("AC auth/public/patient/shell renderers use the centralized version", () => {
    const auth = read("src/activeclinic/http/renderActiveClinicAuth.js");
    const pub = read("src/activeclinic/http/renderActiveClinicPublic.js");
    const patient = read("src/activeclinic/http/renderActiveClinicPatient.js");
    const shell = read("src/activeclinic/services/buildActiveClinicShellViewModel.js");

    for (const src of [auth, pub, patient, shell]) {
      assert.match(src, /browserAssetVersion/);
      assert.match(src, /V204_BROWSER_ASSET_VERSION/);
    }

    const { ASSET_VERSION: authV } = require("../src/activeclinic/http/renderActiveClinicAuth");
    const { ASSET_VERSION: pubV } = require("../src/activeclinic/http/renderActiveClinicPublic");
    const { ASSET_VERSION: patientV } = require("../src/activeclinic/http/renderActiveClinicPatient");
    const { SHELL_ASSET_VERSION } = require("../src/activeclinic/services/buildActiveClinicShellViewModel");

    assert.equal(authV, V204_BROWSER_ASSET_VERSION);
    assert.equal(pubV, V204_BROWSER_ASSET_VERSION);
    assert.equal(patientV, V204_BROWSER_ASSET_VERSION);
    assert.equal(SHELL_ASSET_VERSION, V204_BROWSER_ASSET_VERSION);
  });

  it("shared colors, BB design system, and inline editor URLs use the current stamp", () => {
    const colors = read("views/platform/partials/head-platform-colors.ejs");
    const ds = read("views/blessboard/v5/partials/head-design-system.ejs");
    const bbEnd = read("views/blessboard/v5/partials/tenant-public-shell-end.ejs");
    const bbStart = read("views/blessboard/v5/partials/tenant-public-shell-start.ejs");
    const mgmt = read("src/platform/website/renderWebsiteManagementPage.js");
    const acPublic = read("views/activeclinic/layouts/public-shell.ejs");
    const acAuth = read("views/activeclinic/layouts/auth-shell.ejs");

    assert.ok(
      colors.includes(`'${V204_BROWSER_ASSET_VERSION}'`),
      "colors.css default query must be V204_BROWSER_ASSET_VERSION"
    );
    assert.ok(
      ds.includes(`'${V204_BROWSER_ASSET_VERSION}'`),
      "design-tokens default query must be V204_BROWSER_ASSET_VERSION"
    );
    assert.ok(
      bbEnd.includes(`/platform/website-inline-edit.js?v=${V204_BROWSER_ASSET_VERSION}`),
      "BB inline editor JS must be cache-busted"
    );
    assert.ok(
      bbStart.includes(`/platform/website-inline-edit.css?v=${V204_BROWSER_ASSET_VERSION}`)
    );
    assert.ok(mgmt.includes("V204_BROWSER_ASSET_VERSION"));
    assert.match(acAuth, /ac-auth\.css\?v=<%= assetVersion %>/);
    assert.match(acAuth, /ac-tokens\.css\?v=<%= assetVersion %>/);
    assert.match(acPublic, /ac-tokens\.css\?v=<%= assetVersion %>/);
    assert.match(acPublic, /website-inline-edit\.js\?v=<%= assetVersion %>/);
  });

  it("release-sensitive sources do not retain known stale query stamps", () => {
    let staleHits = 0;
    const details = [];
    for (const rel of RELEASE_SENSITIVE_SOURCES) {
      const text = read(rel);
      for (const pat of FORBIDDEN_STALE_URL_PATTERNS) {
        if (pat.test(text)) {
          staleHits += 1;
          details.push(`${rel} matches ${pat}`);
        }
      }
    }
    assert.equal(
      staleHits,
      0,
      `STALE_V2_04_ASSET_REFERENCES_AFTER must be 0; found:\n${details.join("\n")}`
    );
  });
});
