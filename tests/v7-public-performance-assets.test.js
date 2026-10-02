"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { describe, it } = require("node:test");

const ROOT = path.join(__dirname, "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("v7 public mobile performance assets", () => {
  it("ships self-hosted latin fonts and a subset icon font", () => {
    const manifest = JSON.parse(read("public/fonts/preload-manifest.json"));
    for (const file of [
      manifest.hankenLatin,
      manifest.interLatin,
      manifest.publicSansLatin,
      "material-symbols-outlined.woff2",
    ]) {
      const full = path.join(ROOT, "public", "fonts", file);
      assert.equal(fs.existsSync(full), true, file);
      assert.ok(fs.statSync(full).size > 1000, file);
    }
    const icons = fs.statSync(path.join(ROOT, "public", "fonts", "material-symbols-outlined.woff2")).size;
    assert.ok(icons < 80 * 1024, `icon subset too large: ${icons}`);
  });

  it("keeps public marketing shells off fonts.googleapis.com", () => {
    const files = [
      "views/blessboard/v5/partials/head-design-system.ejs",
      "views/blessboard/v5/partials/apex-shell-start.ejs",
      "views/blessboard/v5/partials/tenant-public-shell-start.ejs",
      "views/activeclinic/layouts/public-shell.ejs",
      "views/activeclinic/layouts/auth-shell.ejs",
      "views/church/partials/public_shell_start.ejs",
    ];
    for (const rel of files) {
      assert.doesNotMatch(read(rel), /fonts\.googleapis\.com/, rel);
    }
  });

  it("preloads LCP hero images on both homepages", () => {
    assert.match(read("views/blessboard/v5/partials/apex-shell-start.ejs"), /apex-hero-mobile\.jpg/);
    assert.match(read("views/activeclinic/layouts/public-shell.ejs"), /ACW01-02-ActiveClinic-Home-Mobile-1\.jpg/);
    assert.match(read("views/activeclinic/public/home.ejs"), /fetchpriority: 'high'/);
  });

  it("does not load phone-field assets on the ActiveClinic public homepage", () => {
    const shell = read("views/activeclinic/layouts/public-shell.ejs");
    assert.match(shell, /_needsPhoneField/);
    assert.match(shell, /mf-register/);
  });

  it("keeps website editor CSS/JS behind canEdit", () => {
    const ac = read("views/activeclinic/layouts/public-shell.ejs");
    assert.match(ac, /websiteCanEdit/);
    assert.match(ac, /website-inline-edit\.css/);
    const bb = read("views/blessboard/v5/partials/tenant-public-shell-start.ejs");
    assert.match(bb, /websiteAdmin && websiteAdmin.canEdit/);
  });
});
