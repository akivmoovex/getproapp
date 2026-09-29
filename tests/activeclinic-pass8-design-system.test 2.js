"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const AC = path.join(ROOT, "public", "activeclinic");

describe("ActiveClinic Pass 8 design system", () => {
  it("ships shared tokens and loads them from all shells", () => {
    const tokens = fs.readFileSync(path.join(AC, "ac-tokens.css"), "utf8");
    assert.match(tokens, /--acp-primary:\s*#006068/);
    assert.match(tokens, /--ac-status-success/);
    assert.match(tokens, /\.acp-status-badge/);
    assert.match(tokens, /\.acp-type-h1/);

    for (const shell of [
      "views/activeclinic/layouts/public-shell.ejs",
      "views/activeclinic/layouts/patient-shell.ejs",
      "views/activeclinic/layouts/app-shell.ejs",
      "views/activeclinic/layouts/auth-shell.ejs",
    ]) {
      const src = fs.readFileSync(path.join(ROOT, shell), "utf8");
      assert.match(src, /ac-tokens\.css/, shell);
    }
  });

  it("patient CSS uses tokenized primary colors", () => {
    const css = fs.readFileSync(path.join(AC, "ac-patient.css"), "utf8");
    assert.doesNotMatch(css, /#0d9488/i);
    assert.match(css, /var\(--acp-primary\)/);
  });

  it("public CSS no longer redefines the full --acp token block", () => {
    const css = fs.readFileSync(path.join(AC, "ac-public.css"), "utf8");
    assert.doesNotMatch(css, /--acp-primary:\s*#006068/);
    assert.match(css, /ac-tokens\.css/);
  });
});
