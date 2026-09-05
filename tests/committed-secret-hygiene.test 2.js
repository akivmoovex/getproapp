"use strict";

/**
 * Fail the suite if tracked files regain hosted database credentials.
 * Never prints URI, password, or other secret values.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");

const URI_RE = /postgres(?:ql)?:\/\/[^\s'"<>\\]+/gi;
const PLACEHOLDER_RE =
  /password|passwd|changeme|change-me|your[_-]?|example|placeholder|replace|xxx+|todo|dummy|fake|sample|filepass|hostpass|s3cret|supersecret|user:password|hostuser|fileuser/i;
const FAKE_HOST_RE =
  /127\.0\.0\.1|localhost|example\.com|exampleproject|db-abc123|db-xyz|from-file\.|invalid|xpcpv|old\.host/i;
const HOSTED_HOST_RE = /supabase\.(co|com)|neon\.tech|rds\.amazonaws\.com|pooler|aws-0-/i;

const ALLOWED_ENV_TEMPLATES = new Set([
  ".env.example",
  ".env.development.example",
  ".env.production.example",
  ".env.production.template",
]);

function trackedFiles() {
  const r = spawnSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "buffer" });
  assert.equal(r.status, 0, "git ls-files failed");
  return r.stdout
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
}

function parseUri(raw) {
  try {
    return new URL(String(raw).replace(/^postgresql:/i, "postgres:"));
  } catch {
    return null;
  }
}

function readTrackedText(rel) {
  const abs = path.join(ROOT, rel);
  let st;
  try {
    st = fs.statSync(abs);
  } catch {
    return null;
  }
  if (!st.isFile() || st.size > 2_000_000) return null;
  const buf = fs.readFileSync(abs);
  if (buf.includes(0)) return null;
  return buf.toString("utf8");
}

function assignmentValue(text, key) {
  const re = new RegExp(`^${key}=(.*)$`, "m");
  const m = text.match(re);
  if (!m) return null;
  return m[1].trim().replace(/^['"]|['"]$/g, "");
}

describe("committed secret hygiene", () => {
  it("does not track raw .env files", () => {
    const unexpected = trackedFiles().filter((rel) => {
      const base = path.basename(rel);
      if (base === ".env") return true;
      if (!base.startsWith(".env.")) return false;
      return !ALLOWED_ENV_TEMPLATES.has(base);
    });
    assert.deepEqual(unexpected, []);
  });

  it("tracked files do not contain hosted PostgreSQL URIs with real-looking passwords", () => {
    const leakedPaths = [];
    for (const rel of trackedFiles()) {
      const text = readTrackedText(rel);
      if (text == null) continue;
      const matches = text.match(URI_RE) || [];
      for (const raw of matches) {
        const uri = raw.replace(/[.,;)"'`]+$/, "");
        const parsed = parseUri(uri);
        if (!parsed) continue;
        const password = decodeURIComponent(parsed.password || "");
        const host = parsed.hostname || "";
        if (!password || password.length <= 2) continue;
        if (PLACEHOLDER_RE.test(password) || PLACEHOLDER_RE.test(uri)) continue;
        if (FAKE_HOST_RE.test(host) || FAKE_HOST_RE.test(uri)) continue;
        if (!HOSTED_HOST_RE.test(host) && !HOSTED_HOST_RE.test(uri)) continue;
        leakedPaths.push(rel);
        break;
      }
    }
    assert.deepEqual(leakedPaths, []);
  });

  it("env templates keep DATABASE_URL / SESSION_SECRET / ADMIN_PASSWORD as placeholders", () => {
    const templates = [
      ".env.example",
      ".env.development.example",
      ".env.production.example",
      ".env.production.template",
      "scripts/local/env.testing.local.example",
      "scripts/local/env.production.local.example",
      "scripts/local/env.rehearsal.local.example",
      "env.test.example",
    ];
    const bad = [];
    for (const rel of templates) {
      const text = readTrackedText(rel);
      assert.ok(text != null, `missing template ${rel}`);
      for (const key of ["DATABASE_URL", "GETPRO_DATABASE_URL", "TEST_DATABASE_URL", "SESSION_SECRET", "ADMIN_PASSWORD"]) {
        const value = assignmentValue(text, key);
        if (value == null || value === "") continue;
        const uri = parseUri(value);
        if (uri) {
          const password = decodeURIComponent(uri.password || "");
          const host = uri.hostname || "";
          const placeholder =
            PLACEHOLDER_RE.test(password) ||
            PLACEHOLDER_RE.test(value) ||
            FAKE_HOST_RE.test(host) ||
            FAKE_HOST_RE.test(value);
          if (!placeholder) bad.push(`${rel}:${key}`);
          continue;
        }
        if (!PLACEHOLDER_RE.test(value)) bad.push(`${rel}:${key}`);
      }
    }
    assert.deepEqual(bad, []);
  });

  it("gitignores local env copies and credential-like filenames", () => {
    const check = spawnSync(
      "git",
      [
        "check-ignore",
        "-v",
        "--no-index",
        ".env",
        ".env.testing.local",
        ".env.production.local",
        ".env.rehearsal.local",
        ".envrc",
        "scripts/local/env.testing.local",
        "scripts/local/env.production.local",
        "id_rsa",
        "tls.pem",
      ],
      { cwd: ROOT, encoding: "utf8" }
    );
    assert.equal(check.status, 0, check.stderr);
    const out = check.stdout || "";
    for (const name of [
      ".env",
      ".env.testing.local",
      ".env.production.local",
      ".env.rehearsal.local",
      ".envrc",
      "scripts/local/env.testing.local",
      "scripts/local/env.production.local",
      "id_rsa",
      "tls.pem",
    ]) {
      assert.match(out, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }

    const keep = spawnSync(
      "git",
      [
        "check-ignore",
        "-v",
        "--no-index",
        ".env.example",
        ".env.development.example",
        ".env.production.example",
        ".env.production.template",
        "scripts/local/env.testing.local.example",
      ],
      { cwd: ROOT, encoding: "utf8" }
    );
    const keepOut = keep.stdout || "";
    assert.match(keepOut, /!\.env\.example/);
    assert.match(keepOut, /!\.env\.development\.example/);
    assert.match(keepOut, /!\.env\.production\.example/);
    assert.match(keepOut, /!\.env\.production\.template/);
    assert.match(keepOut, /!scripts\/local\/env\.\*\.local\.example/);
  });
});
