"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { VERSION_ORDER, VERSIONS } = require("../src/platform/release-notes/releaseNotesCatalog");

test("V2.12 historical release notes remain available after V2.13 initialization", () => {
  assert.ok(VERSION_ORDER.includes("2.12"));
  assert.notEqual(VERSION_ORDER.at(-1), "2.12");
  assert.equal(VERSION_ORDER.at(-1), "2.13");
  assert.ok(VERSIONS.some((release) => release.version === "2.03"));
  assert.ok(VERSIONS.some((release) => release.version === "2.10"));
  const historical = VERSIONS.find((release) => release.version === "2.12");
  assert.ok(historical);
  assert.match(historical.deploymentStatus, /branch V12/);
  assert.equal(historical.releaseDate, null);
  assert.match(historical.qaVerification, /NOT TESTED/);
  assert.ok(historical.pendingDevelopment.length > 0);
  assert.match(historical.knownIssues.join(" "), /inherited V2\.11 QA debt/i);
  assert.match(
    historical.summary,
    /development baseline created from the frozen V2\.11 source/i
  );
});
