"use strict";

/**
 * V2.04 Batch 2 — authentication + registration color token migration.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const BATCH2_FILES = [
  "public/platform/gp-auth-reg.css",
  "public/platform/registration-ux.css",
  "public/blessboard/v5/apex-auth.css",
  "public/blessboard/v5/tenant-auth.css",
  "public/activeclinic/ac-auth.css",
];

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("V2_04 color migration batch 2 — auth and registration", () => {
  it("removes raw HEX/RGB literals from Batch 2 auth/registration CSS", () => {
    const hex = /#[0-9a-fA-F]{3,8}\b/;
    const rgb = /rgba?\(/i;
    for (const rel of BATCH2_FILES) {
      const css = read(rel);
      assert.equal(hex.test(css), false, `${rel} still contains HEX`);
      assert.equal(rgb.test(css), false, `${rel} still contains rgb()/rgba()`);
      assert.equal(/\}\)\;/.test(css.replace(/minmax\([^)]+\)/g, "")), false, `${rel} may have broken )); typo`);
    }
  });

  it("maps BB tenant/apex auth chrome to V2.04 brand and semantic tokens", () => {
    const tenant = read("public/blessboard/v5/tenant-auth.css");
    assert.match(tenant, /--bb-auth-violet:\s*var\(--color-brand-primary\)/);
    assert.match(tenant, /--bb-auth-err:\s*var\(--color-danger-text\)/);
    assert.match(tenant, /--bb-auth-ok:\s*var\(--color-success-text\)/);
    assert.match(tenant, /var\(--color-brand-primary-light\)/);
    assert.match(tenant, /var\(--button-primary-bg\)|var\(--color-brand-primary\)/);
    assert.match(tenant, /\.bb-auth-wizard__item\.is-current[\s\S]*--color-brand-primary/);
    assert.doesNotMatch(tenant, /#1d4ed8/i);

    const apex = read("public/blessboard/v5/apex-auth.css");
    assert.match(apex, /--color-warning-bg/);
    assert.match(apex, /--color-info-bg/);
    assert.match(apex, /--color-danger-bg/);
    assert.match(apex, /--color-success-bg/);
  });

  it("maps AC auth chrome to brand/semantic tokens without product-local HEX APIs", () => {
    const ac = read("public/activeclinic/ac-auth.css");
    assert.match(ac, /--ac-auth-primary:\s*var\(--color-brand-primary\)/);
    assert.match(ac, /--ac-auth-danger:\s*var\(--color-danger-text\)/);
    assert.match(ac, /background:\s*var\(--color-brand-primary\)/);
    assert.match(ac, /\.ac-auth-alert--error[\s\S]*--color-danger-bg/);
    assert.doesNotMatch(ac, /--bb-login|--ac-login-blue|--church-button-color/);
  });

  it("maps shared registration UX rules to danger/success/link tokens", () => {
    const reg = read("public/platform/registration-ux.css");
    assert.match(reg, /--color-danger-text/);
    assert.match(reg, /--color-success-text/);
    assert.match(reg, /--color-link/);
    assert.match(reg, /--color-brand-primary-light/);
  });

  it("keeps platform color loading on BB and AC auth shells", () => {
    assert.match(read("views/blessboard/v5/partials/head-design-system.ejs"), /head-platform-colors/);
    assert.match(read("views/blessboard/v5/apex/login.ejs"), /data-product="blessboard"/);
    assert.match(read("views/activeclinic/layouts/auth-shell.ejs"), /head-platform-colors/);
    assert.match(read("views/activeclinic/layouts/auth-shell.ejs"), /data-product="activeclinic"/);
  });
});
