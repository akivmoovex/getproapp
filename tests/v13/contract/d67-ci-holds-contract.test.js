"use strict";

const fs = require("fs");
const path = require("path");
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const root = path.join(__dirname, "../../..");
const workflow = fs.readFileSync(
  path.join(root, ".github/workflows/v13-ac-qa-regression.yml"),
  "utf8"
);
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

describe("D67 ActiveClinic CI holds", () => {
  it("keeps database and browser jobs from running", () => {
    assert.match(workflow, /stage-b-integration:[\s\S]*if: \$\{\{\s*false\s*\}\}/);
    assert.match(workflow, /stage-c-browser:[\s\S]*if: \$\{\{\s*false\s*\}\}/);
    assert.match(workflow, /stage-d-security:[\s\S]*if: \$\{\{\s*false\s*\}\}/);
    assert.equal(/^\s*schedule:/m.test(workflow), false);
    assert.equal(/^\s*push:/m.test(workflow), false);
    assert.equal(/^\s*pull_request:/m.test(workflow), false);
    assert.equal(workflow.includes("GETPRO_V13_ALLOW_DB_WRITES: \"0\""), true);
    assert.equal(workflow.includes("GETPRO_V13_DB_STAGES_AUTHORIZED: \"0\""), true);
    assert.equal(/if:[\s\S]{0,80}enable_db_stages/.test(workflow), false);
  });

  it("keeps the ActiveClinic command on node:test and away from browser and database files", () => {
    const command = pkg.scripts["test:v13:ac"];
    assert.equal(command.startsWith("node --test"), true);
    assert.equal(command.includes("tests/v13/integration"), false);
    assert.equal(command.includes("playwright"), false);
    assert.equal(command.includes("tests/e2e"), false);
    assert.equal(fs.existsSync(path.join(root, "scripts/ci/v13-assert-db-isolation.cjs")), true);
    assert.equal(fs.existsSync(path.join(root, "scripts/ci/v13-qa-report.cjs")), true);
  });
});
