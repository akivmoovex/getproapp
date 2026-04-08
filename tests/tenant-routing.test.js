"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { RESERVED_PLATFORM_SUBDOMAINS, getTenantBySlug } = require("../src/tenants");

test("RESERVED_PLATFORM_SUBDOMAINS includes demo, zm, il", () => {
  assert.equal(RESERVED_PLATFORM_SUBDOMAINS.has("demo"), true);
  assert.equal(RESERVED_PLATFORM_SUBDOMAINS.has("zm"), true);
  assert.equal(RESERVED_PLATFORM_SUBDOMAINS.has("il"), true);
});

test("demo.pronline.org maps to tenant slug demo via static metadata", () => {
  const t = getTenantBySlug("demo");
  assert.ok(t);
  assert.equal(t.slug, "demo");
});
