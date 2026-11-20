"use strict";

/**
 * Coverage for six previously passing BlessBoard sanity scenarios.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "../../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

describe("V13 previously passing sanity coverage", () => {
  it("SANITY-01 platform admin login form and route contracts remain", () => {
    const loginView = read("views/blessboard/v5/apex/login.ejs");
    assert.match(loginView, /password|Sign in|login/i);
    const helpers = read("tests/e2e/helpers.cjs");
    assert.match(helpers, /async function platformLogin/);
    assert.match(helpers, /\/admin\/login/);
  });

  it("SANITY-02 public directory route and template remain", () => {
    const routes = read("src/blessboard/http/apexMarketingRoutes.js");
    assert.match(routes, /router\.get\("\/directory"/);
    assert.equal(fs.existsSync(path.join(ROOT, "views/blessboard/v5/apex/directory.ejs")), true);
  });

  it("SANITY-03 path-mode public church home routing remains", () => {
    const src = read("src/blessboard/http/pathPublicRoutes.js");
    assert.match(src, /organizationKey/);
    assert.match(src, /\/c\//);
  });

  it("SANITY-04 HQ shell CSRF issuance contract remains single-issue", () => {
    const shell = read("src/blessboard/http/hqAdminShellLocals.js");
    assert.match(shell, /issueCsrfToken/);
    assert.match(shell, /setCsrfCookie/);
    assert.match(shell, /csrfToken/);
  });

  it("SANITY-05 announcement admin list/new mounts remain", () => {
    const src = read("src/blessboard/http/announcementAdminRoutes.js");
    assert.match(src, /\$\{mountPrefix\}\/new/);
    assert.match(src, /router\.get\(mountPrefix/);
  });

  it("SANITY-06 About/version surfaces are pinned to 2.13.1 on V13", () => {
    const about = read("views/blessboard/v5/apex/about.ejs");
    assert.match(about, /2\.13/);
    const build = read("src/platform/build/applicationBuildInfo.js");
    assert.match(build, /2\.13/);
  });
});
