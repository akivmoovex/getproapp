"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  VERSION_BASE,
  PRODUCT_VERSION,
  getApplicationBuildInfo,
} = require("../src/platform/build/applicationBuildInfo");
const { VERSION_ORDER, VERSIONS } = require("../src/platform/release-notes/releaseNotesCatalog");

test("V2.13 current version metadata is shared by About surfaces", () => {
  assert.equal(VERSION_BASE, "2.13");
  assert.equal(PRODUCT_VERSION, "2.13");
  assert.equal(
    getApplicationBuildInfo({
      env: { DEPLOYMENT_ENV: "testing", GETPRO_GIT_SHA: "0123456789abcdef" },
    }).version,
    "2.13"
  );
});

test("V2.13 release notes are an explicit development baseline", () => {
  assert.equal(VERSION_ORDER.at(-1), "2.13");
  assert.ok(VERSIONS.some((release) => release.version === "2.03"));
  assert.ok(VERSIONS.some((release) => release.version === "2.10"));
  assert.ok(VERSIONS.some((release) => release.version === "2.12"));
  const current = VERSIONS.find((release) => release.version === "2.13");
  assert.ok(current);
  assert.match(current.deploymentStatus, /branch V13/);
  assert.equal(current.releaseDate, null);
  assert.match(current.qaVerification, /NOT TESTED/);
  assert.ok(current.pendingDevelopment.length > 0);
  assert.match(current.pendingDevelopment.join(" "), /Planned/i);
  assert.match(current.knownIssues.join(" "), /no unfinished V2\.13 feature is claimed complete/i);
  assert.doesNotMatch(current.summary, /OTP.*released/i);
});

test("V2.13 planned OTP remains planned and is not claimed complete", () => {
  const current = VERSIONS.find((release) => release.version === "2.13");
  assert.ok(current);
  const plannedText = [
    ...(current.pendingDevelopment || []),
    ...Object.values(current.productNarratives || {}).flatMap((narrative) =>
      (narrative.sections || []).flatMap((section) => section.items || [])
    ),
  ].join(" ");
  assert.match(plannedText, /email\/SMS OTP/i);
  assert.equal(current.features.length, 0);
  assert.doesNotMatch(current.qaVerification, /RELEASED/);
});
