"use strict";

/**
 * Local BlessBoard env wrapper — does not print secrets.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const wrapper = path.join(root, "scripts/local/run-with-blessboard-env.sh");

function runWrapper(args, opts = {}) {
  return spawnSync(wrapper, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...(opts.env || {}) },
    input: opts.input,
  });
}

describe("run-with-blessboard-env.sh", () => {
  it("is executable and present", () => {
    assert.equal(fs.existsSync(wrapper), true);
    const mode = fs.statSync(wrapper).mode;
    assert.ok(mode & 0o100, "wrapper should be executable");
  });

  it("rejects missing environment argument", () => {
    const r = runWrapper([]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr || "", /Usage:/);
  });

  it("rejects unknown environment names", () => {
    const r = runWrapper(["staging", "true"]);
    assert.equal(r.status, 2);
    assert.match(r.stderr || "", /testing|production/);
    assert.doesNotMatch(r.stdout || "", /postgresql:\/\//i);
    assert.doesNotMatch(r.stderr || "", /postgresql:\/\//i);
  });

  it("rejects missing local env file", () => {
    const tmpName = `.env.__missing_test__.local`;
    // Force missing by using production when file absent is OK; use a renamed check via unknown path protection
    // production may be missing in CI — that is the rejection path.
    const productionPath = path.join(root, ".env.production.local");
    if (fs.existsSync(productionPath)) {
      // Still verify unknown env rejection above; skip missing-file if operator has production file.
      assert.ok(true);
      return;
    }
    const r = runWrapper(["production", "true"]);
    assert.equal(r.status, 2);
    assert.match(r.stderr || "", /missing \.env\.production\.local/);
    assert.doesNotMatch(r.stderr || "", /postgresql:\/\//i);
    void tmpName;
  });

  it("loads testing file and passes selected vars to the child", () => {
    const testingPath = path.join(root, ".env.testing.local");
    if (!fs.existsSync(testingPath)) {
      assert.ok(true, "skip when operator has not created testing local file");
      return;
    }
    const r = runWrapper([
      "testing",
      "node",
      "-e",
      "const u=process.env.DATABASE_URL||''; const e=process.env.DATABASE_IDENTITY_ENV||''; const c=process.env.PLATFORM_DEPLOYMENT_CODE||''; if(!u) process.exit(11); if(e!=='testing') process.exit(12); if(c!=='blessboard-org-staging') process.exit(13); process.stdout.write('ok_vars='+e+','+c);",
    ]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout || "", /ok_vars=testing,blessboard-org-staging/);
    assert.match(r.stderr || "", /loaded=\.env\.testing\.local/);
    assert.doesNotMatch(r.stdout || "", /postgresql:\/\//i);
    assert.doesNotMatch(r.stderr || "", /postgresql:\/\//i);
  });

  it("overrides ambient DATABASE_URL with the selected file", () => {
    const testingPath = path.join(root, ".env.testing.local");
    if (!fs.existsSync(testingPath)) {
      assert.ok(true, "skip");
      return;
    }
    const r = runWrapper(
      [
        "testing",
        "node",
        "-e",
        "process.stdout.write(String(process.env.DATABASE_IDENTITY_ENV||''))",
      ],
      { env: { DATABASE_URL: "ambient-should-be-overridden", DATABASE_IDENTITY_ENV: "production" } }
    );
    assert.equal(r.status, 0, r.stderr);
    assert.equal((r.stdout || "").trim(), "testing");
    assert.doesNotMatch(r.stdout + r.stderr, /ambient-should-be-overridden/);
  });

  it("preserves child exit code", () => {
    const testingPath = path.join(root, ".env.testing.local");
    if (!fs.existsSync(testingPath)) {
      assert.ok(true, "skip");
      return;
    }
    const r = runWrapper(["testing", "node", "-e", "process.exit(17)"]);
    assert.equal(r.status, 17);
  });

  it("passes stdin through to the child", () => {
    const testingPath = path.join(root, ".env.testing.local");
    if (!fs.existsSync(testingPath)) {
      assert.ok(true, "skip");
      return;
    }
    const r = runWrapper(
      [
        "testing",
        "node",
        "-e",
        "let s=''; process.stdin.setEncoding('utf8'); process.stdin.on('data',d=>s+=d); process.stdin.on('end',()=>{ process.stdout.write('stdin_len='+s.length); process.exit(s==='secret-token' ? 0 : 9); });",
      ],
      { input: "secret-token" }
    );
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout || "", /stdin_len=12/);
    assert.doesNotMatch(r.stdout + r.stderr, /secret-token/);
  });

  it("env local files remain gitignored", () => {
    const check = spawnSync(
      "git",
      ["check-ignore", "-v", ".env.testing.local", ".env.production.local"],
      { cwd: root, encoding: "utf8" }
    );
    assert.equal(check.status, 0);
    assert.match(check.stdout || "", /\.env\.testing\.local/);
    assert.match(check.stdout || "", /\.env\.production\.local/);
  });
});
