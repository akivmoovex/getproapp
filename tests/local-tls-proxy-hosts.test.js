"use strict";

const assert = require("assert");
const { isAllowedHost } = require("../scripts/ci/local-tls-proxy.cjs");

assert.equal(isAllowedHost("local.test"), true);
assert.equal(isAllowedHost("admin.local.test"), true);
assert.equal(isAllowedHost("e2e-main.local.test"), true);
assert.equal(isAllowedHost("sibling-e2e.local.test"), true);
assert.equal(isAllowedHost("other.local.test"), true);
assert.equal(isAllowedHost("example.com"), false);
assert.equal(isAllowedHost("local.test.evil.com"), false);
assert.equal(isAllowedHost("bad..local.test"), false);
assert.equal(isAllowedHost("e2e-main.local.test:443"), false);
assert.equal(isAllowedHost("user@local.test"), false);

console.log("local TLS proxy synthetic hostname policy: PASS");
