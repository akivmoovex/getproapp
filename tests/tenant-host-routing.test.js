"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveExplicitPlatformTenantSlug,
  listExplicitRegionalHostExamples,
  EXPLICIT_SUBDOMAIN_TO_TENANT_SLUG,
} = require("../src/platform/tenantHostRouting");

test("resolveExplicitPlatformTenantSlug: demo.pronline.org → demo", () => {
  assert.equal(
    resolveExplicitPlatformTenantSlug({
      host: "demo.pronline.org",
      baseDomain: "pronline.org",
      subdomain: "demo",
    }),
    "demo"
  );
});

test("resolveExplicitPlatformTenantSlug: zm.pronline.org → zm", () => {
  assert.equal(
    resolveExplicitPlatformTenantSlug({
      host: "zm.pronline.org",
      baseDomain: "pronline.org",
      subdomain: "zm",
    }),
    "zm"
  );
});

test("resolveExplicitPlatformTenantSlug: il.pronline.org → il", () => {
  assert.equal(
    resolveExplicitPlatformTenantSlug({
      host: "il.pronline.org",
      baseDomain: "pronline.org",
      subdomain: "il",
    }),
    "il"
  );
});

test("listExplicitRegionalHostExamples includes demo, zm, il", () => {
  const list = listExplicitRegionalHostExamples("pronline.org");
  assert.ok(list.includes("demo.pronline.org"));
  assert.ok(list.includes("zm.pronline.org"));
  assert.ok(list.includes("il.pronline.org"));
});

test("EXPLICIT_SUBDOMAIN_TO_TENANT_SLUG lists demo, zm, il", () => {
  assert.equal(EXPLICIT_SUBDOMAIN_TO_TENANT_SLUG.demo, "demo");
  assert.equal(EXPLICIT_SUBDOMAIN_TO_TENANT_SLUG.zm, "zm");
  assert.equal(EXPLICIT_SUBDOMAIN_TO_TENANT_SLUG.il, "il");
});
