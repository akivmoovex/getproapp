"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  PRODUCT_VERSION,
  VERSION_BASE,
  PRODUCT_VERSION_V8,
  VERSION_BASE_V8,
  getApplicationBuildInfo,
} = require("../../../src/platform/build/applicationBuildInfo");
const { VERSION_ORDER, VERSIONS } = require("../../../src/platform/release-notes/releaseNotesCatalog");

const ROOT = path.join(__dirname, "../../..");

describe("G271 About version bump to 2.13.4", () => {
  it("keeps BlessBoard and ActiveClinic About constants at 2.13.4 with separate build SHA", () => {
    assert.equal(PRODUCT_VERSION, "2.13.4");
    assert.equal(VERSION_BASE, "2.13.4");
    assert.equal(PRODUCT_VERSION_V8, "2.13.4");
    assert.equal(VERSION_BASE_V8, "2.13.4");
    const info = getApplicationBuildInfo({
      env: {
        NODE_ENV: "test",
        DEPLOYMENT_ENV: "testing",
        PLATFORM_DEPLOYMENT_CODE: "moovex-platform-testing",
        GETPRO_GIT_SHA: "g271version0abcdef123",
      },
    });
    assert.equal(info.productVersion, "2.13.4");
    assert.equal(info.version, "2.13.4");
    assert.equal(info.productVersionLabel, "Version 2.13.4");
    assert.equal(info.build, "g271version0");
    assert.equal(info.build.length, 12);
    assert.notEqual(info.version, `2.13.4.${info.build}`);
  });

  it("keeps current About templates free of stale 2.13.2 labels", () => {
    const files = [
      "views/blessboard/v5/apex/about.ejs",
      "views/activeclinic/public/about.ejs",
      "src/platform/build/applicationBuildInfo.js",
    ];
    for (const rel of files) {
      const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
      assert.match(text, /2\.13\.4/);
      assert.equal(
        /productVersion:\s*"2\.13\.2"|Version 2\.13\.2|PRODUCT_VERSION_V8 = "2\.13\.2"|VERSION_BASE_V8 = "2\.13\.2"/.test(
          text
        ),
        false,
        `${rel} must not hard-code current About as 2.13.2`
      );
    }
  });

  it("keeps the release catalogue tip at 2.13.4 while preserving historical 2.13.2 notes", () => {
    assert.equal(VERSION_ORDER.at(-1), "2.13.4");
    assert.ok(VERSION_ORDER.includes("2.13.2"));
    assert.ok(VERSIONS.some((entry) => entry.version === "2.13.2"));
    assert.ok(VERSIONS.some((entry) => entry.version === "2.13.4"));
  });
});
