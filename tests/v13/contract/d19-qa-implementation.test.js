"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "../../..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("D19 QA implementation discovery", () => {
  it("keeps BlessBoard browser journeys on real forms and off the health check", () => {
    const spec = read("tests/e2e/v13/v13-bb-qa-regression.spec.js");
    assert.doesNotMatch(spec, /goto\("\/healthz"\)/);
    assert.doesNotMatch(spec, /NOT_IMPLEMENTED/);
    assert.match(spec, /NOT_RUN/);
    assert.match(spec, /input\[name='section_key'\]/);
    assert.match(spec, /form\[data-bb-sermons-form='create'\]/);
    assert.match(spec, /\/invite\/accept/);
    assert.match(spec, /data-bb-hq-add-member-form/);
    const names = [...spec.matchAll(/test\("([^"]+)"/g)].map((match) => match[1]);
    assert.equal(names.length, 23);
  });

  it("keeps billing denial prepared and does not treat it as the AC-05 admin contract", () => {
    const spec = read("tests/e2e/v13/v13-ac-platform-qa.spec.js");
    assert.match(spec, /\/app\/billing/);
    assert.match(spec, /\/admin\/settings\/test-database/);
    assert.match(spec, /E2E_AC05_LOWER_EMAIL/);
    assert.match(spec, /hold\(testInfo, "AC-05"\)/);
    assert.doesNotMatch(spec, /NOT_IMPLEMENTED/);
    const names = [...spec.matchAll(/test\("([^"]+)"/g)].map((match) => match[1]);
    assert.match(spec, /PAT-01/);
    assert.equal(names.length, 30);
  });

  it("points every integration file at a real gated runner", () => {
    const dir = path.join(ROOT, "tests/v13/integration");
    const files = fs.readdirSync(dir).filter((name) => name.endsWith(".integration.test.js"));
    assert.equal(files.length, 20);
    for (const file of files) {
      const source = fs.readFileSync(path.join(dir, file), "utf8");
      assert.match(source, /runGated/);
      assert.doesNotMatch(source, /assert\.fail/);
      assert.doesNotMatch(source, /assert\.equal\(true,\s*true\)/);
    }
    const runners = read("tests/v13/integration/v13AuthorizedScenarios.js");
    for (const name of [
      "runBb01",
      "runBb02",
      "runBb03",
      "runBb04",
      "runBb05",
      "runBb06",
      "runBb24",
      "runInv01",
      "runD14cOtp",
      "runAcAuth",
      "runPlatformOtp",
    ]) {
      assert.match(runners, new RegExp(`async function ${name}`));
    }
  });

  it("does not let a V13 push start CI or a database job", () => {
    const ci = read(".github/workflows/ci.yml");
    assert.match(ci, /branches: \[main, v2, V7\]/);
    assert.doesNotMatch(ci, /V13/);
    for (const rel of [
      ".github/workflows/v13-bb-qa-regression.yml",
      ".github/workflows/v13-bb-bug-regressions.yml",
      ".github/workflows/v13-ac-qa-regression.yml",
      ".github/workflows/v13-platform-qa-regression.yml",
    ]) {
      const wf = read(rel);
      assert.match(wf, /workflow_dispatch/);
      assert.match(wf, /if:\s*\$\{\{\s*false\s*\}\}/);
      assert.equal(/^\s*push:/m.test(wf), false);
      assert.equal(/^\s*pull_request:/m.test(wf), false);
      assert.equal(/^\s*schedule:/m.test(wf), false);
    }
    const workflows = fs.readdirSync(path.join(ROOT, ".github/workflows"));
    assert.equal(workflows.some((name) => /deploy/i.test(name)), false);
  });
});
