"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  foundationAttemptSlug,
  foundationFixtureSlug,
} = require("./e2e/helpers.cjs");

test("Foundation fixture slugs remain unique and preserve retry suffixes at the length limit", () => {
  const prefix = `e2e-${"x".repeat(80)}`;
  const slugs = new Set();

  for (const retry of [0, 1]) {
    for (const fixtureName of ["main", "other", "b2", "fx"]) {
      const slug =
        fixtureName === "main"
          ? foundationAttemptSlug(prefix, retry)
          : foundationFixtureSlug(prefix, retry, fixtureName);
      assert.match(slug, /^[a-z0-9][a-z0-9-]*$/);
      assert.ok(slug.length <= 40);
      assert.ok(slug.endsWith(`-r${retry}-${fixtureName}`));
      assert.equal(slugs.has(slug), false);
      slugs.add(slug);
    }
  }
});

test("Foundation direct authenticated probes preserve the D183R HTTPS forwarding contract", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "e2e", "foundation-security.spec.js"),
    "utf8"
  );
  const protectedProbeSection = source.slice(
    source.indexOf('test("6) cross-tenant IDOR'),
    source.indexOf('test("8) basic attendance')
  );

  assert.match(source, /"X-Forwarded-Proto": "https"/);
  assert.doesNotMatch(source, /"X-Forwarded-Proto": "http"/);
  assert.match(protectedProbeSection, /baPage\.request\.(post|get)/);
  assert.match(protectedProbeSection, /hqPage\.request\.(post|get)/);
  assert.match(protectedProbeSection, /maxRedirects: 0/);
  assert.doesNotMatch(protectedProbeSection, /Cookie:/);
});

test("Foundation plan probes use valid CSRF and require entitlement denial", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "e2e", "foundation-security.spec.js"),
    "utf8"
  );
  const planSection = source.slice(
    source.indexOf('test("7) Foundation scheduled reports'),
    source.indexOf('test("8) basic attendance')
  );

  assert.match(planSection, /broadcastCsrf/);
  assert.match(planSection, /_csrf: broadcastCsrf/);
  assert.match(planSection, /audience: "members"/);
  assert.equal((planSection.match(/status\(\)\)\.toBe\(403\)/g) || []).length, 2);
  assert.doesNotMatch(planSection, /"X-Forwarded-Proto": "http"/);
});

test("Foundation login diagnostics follow the rendered form action and protected request", () => {
  const source = fs.readFileSync(path.join(__dirname, "e2e", "helpers.cjs"), "utf8");
  const portalLoginSection = source.slice(
    source.indexOf("async function portalLogin"),
    source.indexOf("async function expectDeniedOrGone")
  );

  assert.match(portalLoginSection, /getAttribute\("action"\)/);
  assert.match(portalLoginSection, /requestPath === loginPostPath/);
  assert.match(portalLoginSection, /requestPath === expectedPath/);
  assert.match(portalLoginSection, /observed\.push\("dashboard-request"\)/);
});

test("Foundation attendance verification opens the form and asserts exact report totals", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "e2e", "foundation-security.spec.js"),
    "utf8"
  );
  const attendanceSection = source.slice(source.indexOf('test("8) basic attendance'));

  assert.match(attendanceSection, /\/branch\/attendance\?new=1/);
  assert.match(attendanceSection, /hasText: "Sessions"/);
  assert.match(attendanceSection, /hasText: "Member check-ins"/);
  assert.match(attendanceSection, /hasText: "Visitor check-ins"/);
  assert.match(attendanceSection, /filter\(\{ hasText: "Monthly attendance" \}\)/);
  assert.doesNotMatch(attendanceSection, /getByText\(\/1\//);
  assert.doesNotMatch(attendanceSection, /reportText/);
});
