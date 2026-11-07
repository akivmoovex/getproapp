"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  browserOriginRequest,
  foundationAttemptSlug,
  foundationFixtureSlug,
  resolveAuthenticatedProbeUrl,
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

test("authenticated probe URLs resolve against and remain on the browser tenant origin", async () => {
  const authenticatedPageUrl = "https://primary-tenant.local.test/branch/dashboard";

  assert.equal(
    resolveAuthenticatedProbeUrl(authenticatedPageUrl, "/branch/members/42"),
    "https://primary-tenant.local.test/branch/members/42"
  );
  assert.throws(
    () => resolveAuthenticatedProbeUrl(authenticatedPageUrl, "https://foreign-tenant.local.test/branch/members/42"),
    /AUTHENTICATED_PROBE_CROSS_ORIGIN/
  );

  const page = {
    url: () => authenticatedPageUrl,
    evaluate: async (_callback, payload) => payload,
  };
  const payload = await browserOriginRequest(page, "/branch/members/42", {
    method: "POST",
    form: { _csrf: "controlled-test-token" },
  });
  assert.equal(payload.requestUrl, "https://primary-tenant.local.test/branch/members/42");
  assert.equal(payload.requestMethod, "POST");
  assert.deepEqual(payload.form, { _csrf: "controlled-test-token" });
});

test("Foundation direct authenticated probes preserve browser-origin HTTPS transport", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "e2e", "foundation-security.spec.js"),
    "utf8"
  );
  const helperSource = fs.readFileSync(path.join(__dirname, "e2e", "helpers.cjs"), "utf8");
  const protectedProbeSection = source.slice(
    source.indexOf('test("6) cross-tenant IDOR'),
    source.indexOf('test("7) Foundation scheduled reports')
  );

  assert.match(protectedProbeSection, /browserOriginRequest\(baPage/);
  assert.match(protectedProbeSection, /browserOriginRequest\(hqPage/);
  assert.match(protectedProbeSection, /expectAuthenticatedControl\(branchControl/);
  assert.match(protectedProbeSection, /expectAuthenticatedControl\(hqControl/);
  assert.doesNotMatch(protectedProbeSection, /\.request\.(post|get)/);
  assert.match(helperSource, /target\.origin !== authenticatedUrl\.origin/);
  assert.match(helperSource, /credentials: "same-origin"/);
  assert.match(helperSource, /redirect: "follow"/);
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
  assert.equal((planSection.match(/\.status\)\.toBe\(409\)/g) || []).length, 1);
  assert.equal((planSection.match(/\.status\)\.toBe\(403\)/g) || []).length, 1);
  assert.match(planSection, /data-failure-kind="package_restricted"/);
  assert.match(planSection, /data-failure-code="package_restricted"/);
  assert.match(planSection, /Scheduled broadcasts require Growth/);
  assert.match(planSection, /scheduledReportsAfter\.rows\[0\]\?\.count\)\.toBe\(scheduledReportsBefore/);
  assert.match(planSection, /broadcastsAfter\.rows\[0\]\?\.count\)\.toBe\(broadcastsBefore/);
  assert.equal((planSection.match(/expectAuthenticatedControl/g) || []).length, 2);
  assert.equal((planSection.match(/expectProtectedProbeReached/g) || []).length, 2);
  assert.equal((planSection.match(/browserOriginRequest/g) || []).length, 4);
  assert.doesNotMatch(planSection, /\.request\.(post|get)/);
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
  assert.match(attendanceSection, /locator\("#form_attendance_date"\)/);
  assert.doesNotMatch(attendanceSection, /locator\("#attendance_date"\)/);
  assert.match(attendanceSection, /hasText: "Sessions"/);
  assert.match(attendanceSection, /hasText: "Member check-ins"/);
  assert.match(attendanceSection, /hasText: "Visitor check-ins"/);
  assert.match(attendanceSection, /filter\(\{ hasText: "Monthly attendance" \}\)/);
  assert.doesNotMatch(attendanceSection, /getByText\(\/1\//);
  assert.doesNotMatch(attendanceSection, /reportText/);
});
