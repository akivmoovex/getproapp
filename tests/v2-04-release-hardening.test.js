"use strict";

/**
 * V2.04 release hardening — version, theme isolation, engine singularity,
 * and inventory of existing V2.04 automated coverage.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  getApplicationBuildInfo,
  resolveVersionScheme,
  VERSION_BASE_V8,
  PRODUCT_VERSION_V8,
} = require("../src/platform/build/applicationBuildInfo");
const {
  CODE_MOOVEX_PLATFORM_V8_TESTING,
  MOOVEX_PLATFORM_IDENTITY_KEY,
} = require("../src/platform/config/deploymentProfiles");
const { VERSION_ORDER, VERSIONS } = require("../src/platform/release-notes/releaseNotesCatalog");
const mediaContract = require("../src/platform/website/websiteMediaEditingContract");
const presentation = require("../src/platform/website/presentation");
const hub = require("../src/activeclinic/website/activeClinicStitchWebsiteHub");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const V8_ENV = Object.freeze({
  NODE_ENV: "production",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_V8_TESTING,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "v204-release-hardening-secret-0123456789ab",
  DATABASE_IDENTITY_EXPECTED: MOOVEX_PLATFORM_IDENTITY_KEY,
  DATABASE_IDENTITY_ENV: "testing",
  GETPRO_GIT_SHA: "f72485104ca8c99e0aee",
});

const STITCH_SCAN_PATHS = [
  "public/activeclinic/ac-stitch-public.css",
  "public/activeclinic/website-cms.css",
  "src/activeclinic/website/activeClinicStitchPublicPages.js",
  "src/activeclinic/website/activeClinicStitchWebsiteHub.js",
];

const RAW_COLOR_RE = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|\brgba?\(|\bhsla?\(/g;

/** Justified: tenant brand placeholders / content picker defaults only. */
const JUSTIFIED_RAW = new Set([
  // Branding form swatch defaults when clinic has not set brand.primary_color
  "'#006068'",
  '"#006068"',
  "#006068",
  "'#0f766e'",
  '"#0f766e"',
  "#0f766e",
]);

describe("V2.04 release hardening", () => {
  it("VERSION: shared V8 About scheme is 2.06 for BB and AC", () => {
    assert.equal(VERSION_BASE_V8, "2.06");
    assert.equal(PRODUCT_VERSION_V8, "2.06");
    const scheme = resolveVersionScheme(V8_ENV);
    assert.equal(scheme.platformLine, "v8");
    assert.equal(scheme.productVersion, "2.06");
    const info = getApplicationBuildInfo({ env: V8_ENV });
    assert.equal(info.productVersion, "2.06");
    assert.equal(info.version, "2.06");
    assert.equal(info.productVersionLabel, "Version 2.06");
    assert.equal(info.build, "f72485104ca8");
  });

  it("RELEASE NOTES: catalog includes 2.04 history and current 2.05 packet", () => {
    assert.ok(VERSION_ORDER.includes("2.04"));
    assert.ok(VERSION_ORDER.includes("2.05"));
    assert.equal(VERSION_ORDER[VERSION_ORDER.length - 1], "2.05");
    const v204 = VERSIONS.find((v) => v.version === "2.04");
    assert.ok(v204);
    assert.match(v204.summary, /Stitch|website|2\.04/i);
    assert.ok(v204.features.some((f) => f.id === "F-2.04-AC-STITCH-01"));
    assert.ok(fs.existsSync(path.join(ROOT, "docs/releases/V2_04_RELEASE_NOTES.md")));
    const packet = read("docs/releases/V2_04_RELEASE_NOTES.md");
    assert.match(packet, /#006068/);
    assert.match(packet, /#6c5ce7/);
    assert.match(packet, /R01–R12|R01-R12/);
    assert.match(packet, /H01–H06|H01-H06/);
    assert.match(packet, /SHARED_EDITOR_ENGINE_COUNT=1/);
  });

  it("THEME: colors.css product selectors map AC teal and BB violet", () => {
    const css = read("src/platform/ui/theme/colors.css");
    assert.match(css, /--palette-teal-700:\s*#006068/);
    assert.match(css, /--palette-violet-500:\s*#6c5ce7/i);
    assert.match(css, /\[data-product="activeclinic"\]/);
    assert.match(css, /\[data-product="blessboard"\]/);
    // AC brand block binds primary to teal palette
    assert.match(
      css,
      /\[data-product="activeclinic"\][\s\S]*?--color-brand-primary:\s*var\(--palette-teal-700\)/
    );
    assert.match(
      css,
      /\[data-product="blessboard"\][\s\S]*?--color-brand-primary:\s*var\(--palette-violet-500\)/
    );
  });

  it("THEME: Stitch AC surfaces do not hardcode BlessBoard violet", () => {
    let bbLeak = 0;
    for (const rel of STITCH_SCAN_PATHS) {
      const text = read(rel);
      const violetHits = text.match(/#6c5ce7|#6C5CE7|palette-violet|--bb-primary/gi) || [];
      bbLeak += violetHits.length;
    }
    assert.equal(bbLeak, 0, `BB_TOKEN_LEAK_INTO_AC=${bbLeak}`);
  });

  it("THEME: BlessBoard design tokens do not hardcode AC teal primary", () => {
    const bb = read("public/blessboard/v5/design-tokens.css");
    const leaks = bb.match(/#006068|palette-teal-700|--acp-primary/gi) || [];
    assert.equal(leaks.length, 0, `AC_TOKEN_LEAK_INTO_BB=${leaks.length}`);
  });

  it("THEME: Stitch/hub CSS introduce zero unjustified GUI raw colors", () => {
    const unjustified = [];
    for (const rel of STITCH_SCAN_PATHS) {
      const text = read(rel);
      const matches = text.match(RAW_COLOR_RE) || [];
      for (const m of matches) {
        if (JUSTIFIED_RAW.has(m)) continue;
        // color-mix / var() contexts already excluded by regex
        unjustified.push(`${rel}:${m}`);
      }
    }
    // Branding EJS placeholders live outside STITCH_SCAN_PATHS JS/CSS —
    // double-check branding view only allows brand defaults.
    const branding = read("views/activeclinic/app/website-cms-branding.ejs");
    const brandingRaws = branding.match(RAW_COLOR_RE) || [];
    for (const m of brandingRaws) {
      if (!JUSTIFIED_RAW.has(m) && m !== "#006068" && m !== "#0f766e") {
        unjustified.push(`branding.ejs:${m}`);
      }
    }
    assert.equal(unjustified.length, 0, unjustified.join(", "));
  });

  it("ENGINES: singular editor + upload; no duplicate lifecycle engines in AC stitch hub", () => {
    assert.equal(presentation.SHARED_EDITOR_ENGINE_COUNT, 1);
    assert.equal(mediaContract.SHARED_UPLOAD_ENGINE_COUNT, 1);
    assert.equal(hub.PLATFORM_ADMIN_SEPARATION, true);
    assert.match(hub.VERSION_ENGINE, /restore-as-new/);

    const acWebsiteSrc = [
      "src/activeclinic/website/activeClinicStitchPublicPages.js",
      "src/activeclinic/website/activeClinicStitchWebsiteHub.js",
      "src/activeclinic/http/activeClinicWebsiteCmsRoutes.js",
    ]
      .map(read)
      .join("\n");

    assert.doesNotMatch(acWebsiteSrc, /createActiveClinicEditorEngine|new AcInlineEditor/);
    assert.doesNotMatch(acWebsiteSrc, /createActiveClinicMediaEngine|new AcMediaLibrary/);
    assert.doesNotMatch(acWebsiteSrc, /createActiveClinicVersionStore|duplicateVersionEngine/);
    assert.doesNotMatch(acWebsiteSrc, /createActiveClinicDraftEngine|duplicateDraftEngine/);
    assert.doesNotMatch(acWebsiteSrc, /createActiveClinicPublishEngine|duplicatePublishEngine/);
  });

  it("COVERAGE inventory: required V2.04 automated suites exist", () => {
    const required = [
      "tests/v8-about-version-2.test.js",
      "tests/v2-04-product-token-cascade.test.js",
      "tests/v2-04-platform-color-theme.test.js",
      "tests/v2-04-qa-01-shared-registration-location.test.js",
      "tests/v2-04-qa-02-platform-city-catalogue.test.js",
      "tests/v2-04-qa-03-platform-country-availability.test.js",
      "tests/v2-04-shared-website-components.test.js",
      "tests/v2-04-shared-website-media-hardening.test.js",
      "tests/v2-04-ac-website-presentation-adapter.test.js",
      "tests/v2-04-platform-admin-website-console.test.js",
      "tests/v2-04-mini-website-repeat-edit.test.js",
      "tests/v2-04-ac-stitch-batch-2-public-foundation.test.js",
      "tests/v2-04-ac-stitch-batch-3-domain-pages.test.js",
      "tests/v2-04-ac-stitch-batch-4-extended-pages.test.js",
      "tests/v2-04-ac-stitch-batch-5-inline-editor.test.js",
      "tests/v2-04-ac-stitch-batch-6-website-hub.test.js",
      "tests/v2-04-ac-stitch-batch-7-visual-parity.test.js",
      "tests/v2-04-batch-8-release-freeze.test.js",
      "tests/v2-04-release-hardening.test.js",
    ];
    for (const rel of required) {
      assert.ok(fs.existsSync(path.join(ROOT, rel)), `missing ${rel}`);
    }
  });

  it("HUB contract marks H01–H06 and documents NOT_WIRED count", () => {
    assert.deepEqual(
      hub.HUB_SCREENS.map((s) => s.code),
      ["H01", "H02", "H03", "H04", "H05", "H06"]
    );
    assert.equal(hub.UNWIRED_STITCH_CONTROLS, 9);
  });
});
