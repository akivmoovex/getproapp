"use strict";

/**
 * SP-VIS reminder + publish-failure UX — static + presentation contracts.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("V2.01 SP-VIS reminder + publish failure UX", () => {
  it("offers reminder on editor load at/above threshold without auto-publish", () => {
    const ui = read("public/platform/website-change-manager-ui.js");
    assert.match(ui, /initial >= THRESHOLD_DEFAULT/);
    assert.match(ui, /openReminder\(false\)/);
    assert.match(ui, /showNavReminder\(\)/);
    assert.match(ui, /Preview only — never submit publish/);
    assert.equal(/confirm_publish|makePublic/.test(ui.match(/function bindReminder[\s\S]*?\n  \}/)[0]), false);
  });

  it("publish failure UI never invents support IDs and prefers friendly message", () => {
    const life = read("public/platform/website-lifecycle.js");
    assert.match(life, /function formatPublishFailure/);
    assert.match(life, /function realRequestId/);
    assert.match(life, /function showPublishFailure/);
    assert.match(life, /typeof json\.ok === "boolean"/);
    assert.match(life, /Retry publish/);
    assert.match(life, /Keep Editing/);
    assert.match(life, /Support reference/);
    assert.match(life, /draftPreserved/);
    assert.match(life, /json\.requestId \|\| json\.correlationId/);
    assert.doesNotMatch(life, /Math\.random\(/);
    assert.doesNotMatch(life, /fake-support|SUPPORT-FAKE|invented-id/i);
    assert.match(life, /showToast\("Published"\)/);
  });

  it("lifecycle host exposes publish ref slot and default confirm label", () => {
    const host = read("views/platform/website-engine/lifecycle-dialog-host.ejs");
    assert.match(host, /data-website-lifecycle-ref="publish"/);
    assert.match(host, /data-default-label/);
  });

  it("AC publish failures return friendly message + draftPreserved without inventing IDs", () => {
    const routes = read("src/activeclinic/http/activeClinicWebsiteRoutes.js");
    assert.match(routes, /draftPreserved: true/);
    assert.match(routes, /liveUnchanged: true/);
    assert.match(routes, /Your draft was preserved/);
  });

  it("BB editor publish JSON marks draftPreserved/liveUnchanged on failure", () => {
    const routes = read("src/blessboard/http/blessboardWebsiteEditorRoutes.js");
    assert.match(routes, /draftPreserved: published\.ok \? false : true/);
    assert.match(routes, /liveUnchanged: published\.ok \? false : true/);
  });

  it("BB+AC shells wire bumped lifecycle / change-manager assets", () => {
    const bbEnd = read("views/blessboard/v5/partials/tenant-public-shell-end.ejs");
    const bbStart = read("views/blessboard/v5/partials/tenant-public-shell-start.ejs");
    const ac = read("src/activeclinic/http/renderActiveClinicPublic.js");
    assert.match(bbEnd, /website-lifecycle\.js\?v=v2-sp-vis-1/);
    assert.match(bbEnd, /website-change-manager-ui\.js\?v=v2-sp-vis-1/);
    assert.match(bbStart, /website-inline-edit\.css\?v=v2-sp-vis-1/);
    assert.match(ac, /ASSET_VERSION = "v2-sp-vis-1"/);
  });
});
