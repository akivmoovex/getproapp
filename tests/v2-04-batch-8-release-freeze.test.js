"use strict";

/**
 * V2.04 Batch 8 — final local release freeze gates.
 * Verifies version, FUTURE_CAPABILITY truthfulness, engines, theme isolation,
 * and Stitch contract freeze markers without rescoring parity.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  VERSION_BASE_V8,
  PRODUCT_VERSION_V8,
  getApplicationBuildInfo,
  resolveVersionScheme,
} = require("../src/platform/build/applicationBuildInfo");
const {
  CODE_MOOVEX_PLATFORM_V8_TESTING,
  MOOVEX_PLATFORM_IDENTITY_KEY,
} = require("../src/platform/config/deploymentProfiles");
const mediaContract = require("../src/platform/website/websiteMediaEditingContract");
const presentation = require("../src/platform/website/presentation");
const {
  H03_H06_CONTROL_AUDIT,
  H03_H06_WIRED,
  H03_H06_PRESENTATION_ONLY,
  H03_H06_FUTURE,
  H03_H06_BLOCKERS,
} = require("../src/activeclinic/website/activeClinicStitchWebsiteHub");
const { VERSION_ORDER } = require("../src/platform/release-notes/releaseNotesCatalog");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const V8_ENV = Object.freeze({
  NODE_ENV: "production",
  DEPLOYMENT_ENV: "testing",
  PLATFORM_DEPLOYMENT_CODE: CODE_MOOVEX_PLATFORM_V8_TESTING,
  DATABASE_URL: "postgres://unused/local",
  SESSION_SECRET: "v204-batch8-freeze-secret-0123456789ab",
  DATABASE_IDENTITY_EXPECTED: MOOVEX_PLATFORM_IDENTITY_KEY,
  DATABASE_IDENTITY_ENV: "testing",
  GETPRO_GIT_SHA: "6be8065bc7dccbfcc07e8fbf8254472f98384270",
});

describe("V2.04 Batch 8 final local release freeze", () => {
  it("BB and AC About version scheme is shared 2.06", () => {
    assert.equal(VERSION_BASE_V8, "2.06");
    assert.equal(PRODUCT_VERSION_V8, "2.06");
    const scheme = resolveVersionScheme(V8_ENV);
    assert.equal(scheme.platformLine, "v8");
    assert.equal(scheme.productVersion, "2.06");
    const info = getApplicationBuildInfo({ env: V8_ENV });
    assert.equal(info.productVersion, "2.06");
    assert.equal(info.productVersionLabel, "Version 2.06");
    assert.ok(VERSION_ORDER.includes("2.04"));
    assert.ok(VERSION_ORDER.includes("2.05"));
  });

  it("H03/H06 FUTURE controls are informational only (no false-active actions)", () => {
    assert.equal(H03_H06_FUTURE, 9);
    assert.equal(H03_H06_PRESENTATION_ONLY, 1);
    assert.equal(H03_H06_BLOCKERS, 0);
    assert.equal(H03_H06_WIRED, 5);
    assert.equal(H03_H06_CONTROL_AUDIT.length, 15);

    const branding = read("views/activeclinic/app/website-cms-branding.ejs");
    const settings = read("views/activeclinic/app/website-cms-settings.ejs");

    const futureKeys = H03_H06_CONTROL_AUDIT.filter((r) => r.disposition === "FUTURE_CAPABILITY").map(
      (r) => r.control
    );
    for (const key of futureKeys) {
      const blob = branding.includes(`data-ac-stitch-not-wired="${key}"`) ? branding : settings;
      assert.match(blob, new RegExp(`data-ac-stitch-not-wired="${key}"`));
      assert.match(
        blob,
        new RegExp(`data-ac-stitch-not-wired="${key}"[^>]*data-ac-stitch-disposition="FUTURE_CAPABILITY"`)
      );
      // Must be hint/readonly copy — not an enabled input bound to the Stitch control name.
      assert.doesNotMatch(blob, new RegExp(`name="${key}"`));
      assert.doesNotMatch(blob, new RegExp(`name="${key.replace(/_/g, "")}"`));
    }

    assert.match(branding, /data-ac-stitch-disposition="PRESENTATION_ONLY"/);
    assert.match(branding, /data-ac-stitch-not-wired="header_style_mode"/);
    assert.doesNotMatch(branding, /name="header_style_mode"|name="headerStyleMode"/);

    // Save buttons only persist wired branding/settings fields — not future controls.
    assert.match(branding, /Save branding/);
    assert.match(settings, /Save website settings/);
    assert.doesNotMatch(branding + settings, /Save favicon|Enable SSL|Buy domain|Turn on maintenance|Save analytics/i);
  });

  it("singular website engines remain frozen at 1", () => {
    assert.equal(presentation.SHARED_EDITOR_ENGINE_COUNT, 1);
    assert.equal(mediaContract.SHARED_UPLOAD_ENGINE_COUNT, 1);
    assert.equal(mediaContract.SHARED_UPLOAD_ENGINE_COUNT, 1);
  });

  it("AC public Inter + theme isolation markers hold", () => {
    const tokens = read("public/activeclinic/ac-tokens.css");
    const colors = read("src/platform/ui/theme/colors.css");
    assert.match(tokens, /--acp-font:\s*Inter/);
    assert.match(colors, /--palette-teal-700:\s*#006068/);
    assert.match(colors, /--palette-violet-500:\s*#6c5ce7/i);
    assert.match(colors, /\[data-product="activeclinic"\]/);
    assert.match(colors, /\[data-product="blessboard"\]/);
    const acPublic = read("public/activeclinic/ac-public.css") + read("public/activeclinic/ac-stitch-public.css");
    assert.doesNotMatch(acPublic, /--bb-|blessboard-violet|#6C5CE7/i);
  });

  it("Stitch contract freeze inventory remains 20 logical / 38 physical", () => {
    const map = read("docs/design/ACTIVECLINIC_V2_04_STITCH_IMPLEMENTATION_MAP.md");
    assert.match(map, /8888814012921999511/);
    // Logical families R01–R12, E01–E02, H01–H06
    for (let i = 1; i <= 12; i += 1) {
      assert.match(map, new RegExp(`R${String(i).padStart(2, "0")}`));
    }
    assert.match(map, /E01/);
    assert.match(map, /E02/);
    for (let i = 1; i <= 6; i += 1) {
      assert.match(map, new RegExp(`H0${i}`));
    }
  });
});
