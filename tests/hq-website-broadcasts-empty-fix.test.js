"use strict";

/**
 * Static + source-level audit for empty HQ Website / Broadcasts routes.
 */

const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const test = require("node:test");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

test("HQ Website route is registered with unlessTenant and non-empty views", () => {
  const route = read("src/blessboard/http/churchWebsiteAdminRoutes.js");
  const foundation = read("src/platform/http/v5FoundationServer.js");
  const nav = read("src/blessboard/http/hqAdminNav.js");
  const shell = read("views/blessboard/v5/partials/hq-shell-start.ejs");
  const legacy = read("views/blessboard/v5/hq/website.ejs");
  const overview = read("views/blessboard/v5/hq/phase4-foundation-website-overview.ejs");

  assert.match(foundation, /createChurchWebsiteAdminRouter/);
  assert.match(route, /router\.get\(\s*"\/hq\/website"/);
  assert.match(route, /mode:\s*"unlessTenant"/);
  assert.match(route, /renderLegacyWebsite|hq\/website\.ejs|phase4-foundation-website-overview/);
  assert.match(nav, /href:\s*"\/hq\/website"/);
  assert.match(shell, /href: '\/hq\/website'/);
  assert.match(legacy, /data-bb-hq-website="1"/);
  assert.match(legacy, /Website preview/);
  assert.match(overview, /data-bb-phase4-foundation-website-overview="1"/);
  assert.match(overview, /Church Website|Website status/);
  assert.match(overview, /hq-shell-end/);
  assert.match(legacy, /hq-shell-end/);
});

test("HQ Broadcasts route uses unlessTenant and Stitch center view", () => {
  const route = read("src/blessboard/http/broadcastAdminRoutes.js");
  const foundation = read("src/platform/http/v5FoundationServer.js");
  const nav = read("src/blessboard/http/hqAdminNav.js");
  const shell = read("views/blessboard/v5/partials/hq-shell-start.ejs");
  const center = read("views/blessboard/v5/hq/hq-broadcast-center-v2.ejs");

  assert.match(foundation, /createBroadcastAdminRouter/);
  assert.match(route, /router\.get\(\s*"\/hq\/broadcasts"/);
  assert.match(route, /mode:\s*"unlessTenant"/);
  assert.match(route, /gateHq/);
  assert.match(route, /hq-broadcast-center-v2\.ejs/);
  assert.match(route, /renderBroadcastCenter/);
  assert.doesNotMatch(
    route,
    /const rejectApex = createRejectApex\(\{\s*isApexHost\s*\}\)/
  );
  assert.match(nav, /href:\s*"\/hq\/broadcasts"/);
  assert.match(shell, /href: '\/hq\/broadcasts'/);
  assert.match(center, /data-bb-hq-broadcast-center="1"/);
  assert.match(center, /data-bb-stitch-broadcast="61-hq-broadcast-center-v2"/);
  assert.match(center, /Broadcast Center/);
  assert.match(center, /data-bb-empty="broadcasts"/);
  assert.match(center, /data-bb-viewport="responsive"/);
  assert.match(center, /hq-shell-end/);
});

test("Website and Broadcasts are not duplicate modules under church V4 HQ shell", () => {
  const churchHqShell = read("views/church/partials/hq_shell_start.ejs");
  assert.match(churchHqShell, /href="\/hq\/broadcasts"/);
  assert.doesNotMatch(churchHqShell, /href="\/hq\/website"/);
});
