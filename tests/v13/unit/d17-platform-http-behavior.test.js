"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { getApplicationBuildInfo } = require("../../../src/platform/build/applicationBuildInfo");
    const { VERSIONS, PRODUCTS } = require("../../../src/platform/release-notes/releaseNotesCatalog");
const {
  countActiveSessionsByDeployment,
  applyLogoutResponseHeaders,
  describeSessionCookieIsolation,
} = require("../../../src/platform/session/sharedSessionSecurity");

const ROOT = path.join(__dirname, "../../..");

function sessionCalls(file) {
  const text = fs.readFileSync(file, "utf8");
  const calls = [];
  let from = 0;
  const needle = "issueAuthenticatedSessionCookie(";
  while (from < text.length) {
    const start = text.indexOf(needle, from);
    if (start < 0) break;
    let depth = 0;
    let end = start + needle.length - 1;
    for (let i = end; i < text.length; i += 1) {
      if (text[i] === "(") depth += 1;
      else if (text[i] === ")") {
        depth -= 1;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    calls.push({ text: text.slice(start, end), before: text.slice(Math.max(0, start - 8000), start) });
    from = end;
  }
  return calls;
}

describe("D17 shared platform behavior", () => {
  it("shows version 2.13.1 for both products and keeps the earlier release notes", () => {
    const info = getApplicationBuildInfo({ env: process.env });
    assert.equal(info.productVersion, "2.13.1");
    assert.equal(info.version, "2.13.1");
    const notes = VERSIONS.find((note) => note.version === "2.13.1");
    assert.ok(notes.products.includes(PRODUCTS.BB));
    assert.ok(notes.products.includes(PRODUCTS.AC));
    assert.equal(notes.pendingDevelopment.length, 0);
    assert.match(notes.knownIssues.join(" "), /No specific bug fix is claimed/i);
    assert.ok(VERSIONS.some((note) => note.version === "2.12"));
  });

  it("keeps every login session call on the OTP gate except the password-change refresh", () => {
    const files = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith(".js") && !entry.name.includes(" 2.js")) files.push(full);
      }
    }
    walk(path.join(ROOT, "src"));
    const offenders = [];
    for (const file of files) {
      for (const call of sessionCalls(file)) {
        if (call.text.includes("req, res, opts") || call.text.includes("req, res, deps")) continue;
        if (call.text.includes("otpWorkflow:")) continue;
        const allowed = /changeActiveClinicPassword|\/account\/change-password/.test(call.before);
        if (!allowed) offenders.push(path.relative(ROOT, file));
      }
    }
    assert.deepEqual(offenders, []);
  });

  it("separates deployment session counts and logout response headers", async () => {
    const counts = await countActiveSessionsByDeployment({
      async query(_sql, params) {
        assert.equal(params[0], "user-1");
        return { rows: [{ deployment_code: params[1][0], n: 2 }, { deployment_code: params[1][1], n: 0 }] };
      },
    }, { userId: "user-1", v7DeploymentCode: "v7", v8DeploymentCode: "v8" });
    assert.equal(counts.v7, 2);
    assert.equal(counts.v8, 0);
    const headers = {};
    applyLogoutResponseHeaders({
      setHeader(name, value) {
        headers[name] = value;
      },
    });
    assert.match(String(headers["Cache-Control"] || headers["cache-control"] || headers["Clear-Site-Data"] || ""), /no-store|cache/i);
    const isolation = describeSessionCookieIsolation({ NODE_ENV: "test", SESSION_SECRET: "d17-platform-secret-at-least-32-chars" });
    assert.equal(isolation.hostOnly, true);
    assert.equal(isolation.httpOnly, true);
  });
});
