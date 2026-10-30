"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const foundation = require("../src/platform/http/v5FoundationServer");
const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("V2.11 BlessBoard version and legacy-route contracts", () => {
  it("uses the current neutral unavailable response without V5 branding", () => {
    assert.equal(foundation.UNAVAILABLE_STATUS, 503);
    assert.equal(foundation.UNAVAILABLE_MESSAGE, "This BlessBoard route is unavailable.");
    assert.doesNotMatch(foundation.UNAVAILABLE_MESSAGE, /BlessBoard V5/i);
  });

  it("does not register the known legacy paths as login routes", () => {
    const server = read("src/platform/http/v5FoundationServer.js");
    const hqRoutes = read("src/routes/church/hqAdmin.js");
    assert.doesNotMatch(server, /["'`]\/c\/demo-church\/hq\/login["'`]/);
    assert.doesNotMatch(server, /["'`]\/hq\/member-login["'`]/);
    assert.doesNotMatch(hqRoutes, /["'`]\/hq\/member-login["'`]/);
  });

  it("retains the canonical login route and current release metadata", () => {
    const server = read("src/platform/http/v5FoundationServer.js");
    const buildInfo = read("src/platform/build/applicationBuildInfo.js");
    assert.match(server, /app\.get\("\/login"/);
    assert.match(server, /app\.post\("\/login"/);
    assert.match(buildInfo, /V2\.12/);
  });

  it("does not introduce legacy branding or bypass markers", () => {
    const source = read("src/platform/http/v5FoundationServer.js");
    assert.doesNotMatch(source, /This page is not yet available in BlessBoard V5/);
    assert.doesNotMatch(source, /member-login.*(?:redirect|next)/i);
    assert.doesNotMatch(source, /c\/demo-church\/hq\/login.*(?:redirect|next)/i);
  });
});
