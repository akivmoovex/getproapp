"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..", "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("D163 coverage contract", () => {
  it("keeps the new journeys fail-closed and does not add an unguarded database file", () => {
    const unit = read("tests/v13/unit/d163-coverage-completion.test.js");
    const spec = read("tests/e2e/v13/v13-d163-journeys.spec.js");
    const integrationDir = path.join(ROOT, "tests/v13/integration");
    const integration = fs.readdirSync(integrationDir).filter((name) => name.endsWith(".integration.test.js"));
    assert.equal(integration.length, 24);
    assert.match(unit, /forged/);
    assert.match(unit, /wrong_branch/);
    assert.match(unit, /title_length/);
    assert.match(unit, /invalid_amount/);
    assert.doesNotMatch(unit, /assert\.equal\(true,\s*true\)/);
    assert.doesNotMatch(unit, /api\.resend\.com/);
    assert.doesNotMatch(unit, /new Pool\(/);
    assert.match(spec, /NOT_RUN/);
    assert.match(spec, /otp_code/);
    assert.match(spec, /data-gp-ops-tab='received'/);
    assert.doesNotMatch(spec, /NOT_IMPLEMENTED/);
    assert.doesNotMatch(read("package.json"), /d163-coverage/);
  });
});
