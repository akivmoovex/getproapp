"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  VERSION_BASE,
  PRODUCT_VERSION,
  getApplicationBuildInfo,
} = require("../src/platform/build/applicationBuildInfo");
const { VERSION_ORDER, VERSIONS } = require("../src/platform/release-notes/releaseNotesCatalog");

test("V2.12 current version metadata is shared by About surfaces", () => {
  assert.equal(VERSION_BASE, "2.12");
  assert.equal(PRODUCT_VERSION, "2.12");
  assert.equal(
    getApplicationBuildInfo({
      env: { DEPLOYMENT_ENV: "testing", GETPRO_GIT_SHA: "0123456789abcdef" },
    }).version,
    "2.12"
  );
});

test("V2.12 release notes are an explicit development baseline", () => {
  assert.equal(VERSION_ORDER.at(-1), "2.12");
  assert.ok(VERSIONS.some((release) => release.version === "2.03"));
  assert.ok(VERSIONS.some((release) => release.version === "2.10"));
  const current = VERSIONS.find((release) => release.version === "2.12");
  assert.ok(current);
  assert.match(current.deploymentStatus, /branch V12/);
  assert.equal(current.releaseDate, null);
  assert.match(current.qaVerification, /NOT TESTED/);
  assert.ok(current.pendingDevelopment.length > 0);
  assert.match(current.knownIssues.join(" "), /inherited V2\.11 QA debt/i);
});
