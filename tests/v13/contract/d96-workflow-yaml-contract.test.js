"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const root = path.join(__dirname, "../../..");
const unquoted = /^\s*- run: echo "D16 hold:/m;

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function loadYaml(text) {
  return execFileSync("ruby", ["-ryaml", "-e", "YAML.safe_load(STDIN.read); print 'ok'"], {
    input: text,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "ignore"],
  });
}

describe("D96 workflow YAML regression", () => {
  it("rejects the unquoted hold echo that GitHub could not parse", () => {
    const broken = '      - run: echo "D16 hold: database integration is not authorized"\n';
    assert.match(broken, unquoted);
    assert.throws(() => loadYaml(`jobs:\n  held:\n    steps:\n${broken}`));
  });

  it("parses the quoted ActiveClinic and platform hold commands", () => {
    const files = [
      ".github/workflows/v13-ac-qa-regression.yml",
      ".github/workflows/v13-platform-qa-regression.yml",
      ".github/workflows/v13-bb-qa-regression.yml",
      ".github/workflows/v13-bb-bug-regressions.yml",
    ];
    for (const file of files) {
      const text = read(file);
      assert.equal(unquoted.test(text), false);
      assert.equal(loadYaml(text), "ok");
    }
    const ac = read(".github/workflows/v13-ac-qa-regression.yml");
    const platform = read(".github/workflows/v13-platform-qa-regression.yml");
    assert.match(ac, /run: 'echo "D16 hold: database integration is not authorized"'/);
    assert.match(ac, /run: 'echo "D16 hold: live AC-05 denial and authenticated sessions are not authorized"'/);
    assert.match(platform, /run: 'echo "D16 hold: OTP persistence against a database is not authorized"'/);
    assert.match(platform, /run: 'echo "D16 hold: authenticated multi-tenant security sessions are not authorized"'/);
    assert.match(ac, /if: \$\{\{\s*false\s*\}\}/);
    assert.equal(/^\s*push:/m.test(ac), false);
    assert.equal(/^\s*push:/m.test(platform), false);
  });
});
