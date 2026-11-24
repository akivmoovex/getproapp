"use strict";

/**
 * D18 static readiness checks. These do not open a database or a browser.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "../../..");

describe("D18 CI readiness guards", () => {
  it("does not treat a health check as a BlessBoard browser journey", () => {
    const spec = fs.readFileSync(path.join(ROOT, "tests/e2e/v13/v13-bb-qa-regression.spec.js"), "utf8");
    assert.doesNotMatch(spec, /goto\("\/healthz"\)/);
    assert.match(spec, /NOT_RUN/);
    assert.match(spec, /form\[data-bb-sermons-form='create'\]/);
  });

  it("keeps the ActiveClinic browser file out of the BlessBoard Playwright selection", () => {
    const bb = fs.readFileSync(path.join(ROOT, "playwright.v13-bb-qa.config.cjs"), "utf8");
    const ac = fs.readFileSync(path.join(ROOT, "playwright.v13-ac-platform.config.cjs"), "utf8");
    assert.match(bb, /v13-bb-qa-regression/);
    assert.doesNotMatch(bb, /v13-ac-platform-qa/);
    assert.match(ac, /v13-ac-platform-qa/);
    assert.match(ac, /E2E_DATABASE_URL is required/);
  });

  it("keeps database and browser jobs disabled", () => {
    for (const rel of [
      ".github/workflows/v13-bb-qa-regression.yml",
      ".github/workflows/v13-bb-bug-regressions.yml",
      ".github/workflows/v13-ac-qa-regression.yml",
      ".github/workflows/v13-platform-qa-regression.yml",
    ]) {
      const wf = fs.readFileSync(path.join(ROOT, rel), "utf8");
      assert.match(wf, /workflow_dispatch/);
      assert.match(wf, /if:\s*\$\{\{\s*false\s*\}\}/);
      assert.match(wf, /permissions:\s*\n\s*contents: read/);
      assert.equal(/^\s*schedule:/m.test(wf), false);
      assert.equal(/^\s*push:/m.test(wf), false);
    }
    const sermons = fs.readFileSync(
      path.join(ROOT, "tests/v13/integration/bb04-sermons.integration.test.js"),
      "utf8"
    );
    assert.match(sermons, /runGated/);
    assert.doesNotMatch(sermons, /assert\.fail/);
    const inv = fs.readFileSync(
      path.join(ROOT, "tests/v13/integration/inv01-staff-invitation.integration.test.js"),
      "utf8"
    );
    assert.match(inv, /runInv01/);
    assert.doesNotMatch(inv, /assert\.fail/);
  });
});
